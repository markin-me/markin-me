(function () {
  'use strict';

  if (!document.body || document.body.dataset.adminActivePage !== 'team') return;

  const dom = {
    list: document.getElementById('teamEntityList'),
    userFilters: document.getElementById('teamUserFilters'),
    create: document.getElementById('teamCreateBtn'),
    title: document.getElementById('teamCenterTitle'),
    icon: document.getElementById('teamCenterIcon'),
    tabs: document.getElementById('teamTabs'),
    tabsHeader: document.getElementById('teamTabsHeader'),
    editor: document.getElementById('teamEditorBody'),
    sectionButtons: Array.from(document.querySelectorAll('[data-team-section]')),
    sidebar: document.getElementById('app-sidebar'),
    leftColumn: document.querySelector('.page-col-left'),
    centerColumn: document.querySelector('.page-col-center'),
  };
  if (!dom.list || !dom.create || !dom.tabs || !dom.editor) return;

  const state = {
    section: 'users',
    userStatus: 'active',
    actorUserId: 0,
    actorEmail: '',
    users: [],
    userPhotos: new Map(),
    roles: [],
    stores: [],
    permissions: [],
    startRoutes: [],
    loginSuffix: '',
    navigation: { view_users: false, view_roles: false },
    capabilities: { view_employee_documents: false, manage_employee_documents: false, view_users: false, create_users: false, update_users: false, manage_users: false, view_roles: false, create_roles: false, update_roles: false, delete_roles: false, manage_permissions: false, manage_roles: false, manage_system_roles: false },
    tabs: [],
    activeKey: '',
    draftSequence: 0,
    unsavedDialogOpen: false,
    allowPageLeave: false,
    repository: null,
    namespace: '',
    fullUserIds: new Set(),
    onlineReady: false,
    source: '',
    lastSyncedAt: null,
    dataRevision: 0,
    bootstrapPending: null,
    listMessage: '',
    connection: { mode: 'idle', text: '', retry: false, detail: '' },
    statusTimer: null,
    statusOperation: null,
    pageHidden: false,
    pageGeneration: 0,
    permissionMode: {
      active: false,
      roleKey: '',
      selectedNavKey: '',
      selectedNodeId: '',
      originalLeftNodes: [],
      originalCenter: null,
      sidebarVisibility: new Map(),
      sidebarCollapsed: '0',
      loadSequence: 0,
    },
  };

  const localStatus = document.getElementById('teamConnectionStatus');
  const statusText = localStatus?.querySelector('.courier-connection-banner__text');
  const statusRetry = localStatus?.querySelector('.courier-connection-banner__retry');
  const suspendedControls = new Map();

  function suspendEditor() {
    dom.editor.querySelectorAll('input, select, textarea, button').forEach((control) => {
      if (!suspendedControls.has(control)) suspendedControls.set(control, control.disabled);
      control.disabled = true;
    });
  }

  function resumeEditor() {
    suspendedControls.forEach((disabled, control) => { if (dom.editor.contains(control)) control.disabled = disabled; });
    suspendedControls.clear();
  }

  function canReadLocalUsers() {
    const permissions = window.AdminAccessContext?.permissions || [];
    return permissions.some((grant) => grant === '*' || (grant.key === 'team.employees.read' && grant.access_rule === 'all'));
  }

  function applyConfirmedTeamNavigation() {
    // Match /team/bootstrap's read capabilities, not the employee cache or its
    // refresh status. Only the current, confirmed access context grants access.
    const permissions = window.AdminAccessContext?.permissions || [];
    const hasAny = (keys) => permissions.some((grant) => grant === '*' || keys.includes(grant?.key));
    state.navigation.view_users = hasAny([
      'team.employees.read', 'team.employees.create', 'team.employees.update',
      'team.employee_documents.read', 'team.employee_documents.create', 'team.employee_documents.update',
    ]);
    state.navigation.view_roles = hasAny([
      'team.roles.read', 'team.roles.create', 'team.roles.update', 'team.roles.delete', 'team.roles.permissions',
    ]);
    applyTeamCapabilities();
  }

  // Explicit projection on BOTH write and read; never persist the bootstrap model.
  function employeeSnapshot(users) {
    if (!Array.isArray(users)) throw new Error('INVALID_EMPLOYEE_SNAPSHOT');
    const named = (item) => {
      if (!Number.isSafeInteger(item?.id) || item.id <= 0 || typeof item.name !== 'string') throw new Error('INVALID_EMPLOYEE_SNAPSHOT');
      return { id: item.id, name: item.name };
    };
    return users.map((user) => {
      if (!['active', 'blocked', 'archived'].includes(user?.employee_status)
        || typeof user.is_owner !== 'boolean' || !Array.isArray(user.roles) || !Array.isArray(user.stores)) throw new Error('INVALID_EMPLOYEE_SNAPSHOT');
      return { ...named(user), employee_status: user.employee_status, is_owner: user.is_owner,
        roles: user.roles.map((role) => ({ ...named(role), is_owner: role.is_owner === true })),
        stores: user.stores.map(named) };
    });
  }

  function canUseServer() {
    return state.repository?.isCurrent() && state.onlineReady && !isAdminOfflineRead();
  }

  function renderConnectionStatus() {
    if (!localStatus) return;
    const connection = state.connection;
    const visible = !state.pageHidden && state.repository?.isCurrent() && state.section === 'users'
      && !state.permissionMode.active && connection.mode !== 'idle';
    localStatus.classList.toggle('hidden', !visible);
    for (const mode of ['offline', 'syncing', 'online', 'error']) {
      localStatus.classList.toggle(`courier-connection-banner--${mode}`, visible && connection.mode === mode);
    }
    const text = visible ? connection.text : '';
    if (statusText && statusText.textContent !== text) statusText.textContent = text;
    localStatus.title = visible ? [connection.text, connection.detail, state.lastSyncedAt
      ? 'Последняя синхронизация: ' + new Date(state.lastSyncedAt).toLocaleString() : ''].filter(Boolean).join('. ') : '';
    statusRetry?.classList.toggle('hidden', !visible || !connection.retry);
  }

  function cancelStatusOperation() {
    if (state.statusTimer !== null) window.clearTimeout(state.statusTimer);
    state.statusTimer = null;
    state.statusOperation = null;
  }

  function setConnectionStatus(mode = 'idle', text = '', { retry = false, detail = '' } = {}) {
    cancelStatusOperation();
    state.connection = { mode, text, retry, detail };
    renderConnectionStatus();
  }

  function beginStatusOperation(repository, isCurrent) {
    cancelStatusOperation();
    const operation = {};
    state.statusOperation = operation;
    // Delay ONLY this optional indicator. Cached data and the request are immediate.
    state.statusTimer = window.setTimeout(() => {
      if (state.statusOperation !== operation || state.pageHidden || !repository.isCurrent() || !isCurrent()) return;
      state.statusTimer = null;
      state.connection = { mode: 'syncing', text: 'Обновляем…', retry: false, detail: '' };
      renderConnectionStatus();
    }, 650);
    return operation;
  }

  async function persistEmployeeSnapshot() {
    const repository = state.repository;
    if (!repository?.isCurrent() || !canReadLocalUsers()) return;
    const revision = state.dataRevision;
    const pageGeneration = state.pageGeneration;
    const lastSyncedAt = Date.now();
    try {
      const value = { formatVersion: 1, users: employeeSnapshot(state.users) };
      await repository.set('employees', value, { ttlMs: 5 * 60 * 1000, lastSyncedAt,
        guard: () => revision === state.dataRevision && canReadLocalUsers() });
      if (repository.isCurrent() && revision === state.dataRevision) {
        state.lastSyncedAt = lastSyncedAt;
        if (!state.pageHidden && state.pageGeneration === pageGeneration) renderConnectionStatus();
      }
    } catch (error) {
      if (!state.pageHidden && state.pageGeneration === pageGeneration && repository.isCurrent() && revision === state.dataRevision) {
        console.error('TEAM_LOCAL_WRITE_FAILED:', error.message);
        setConnectionStatus('error', 'Не удалось сохранить', { detail: 'Данные получены с сервера, но не сохранены на устройстве. Локальное чтение может быть недоступно.' });
      }
    }
  }

  const accessLabels = {
    all: 'Все',
    stores: 'Только выбранные филиалы',
    own: 'Только свои',
    assigned: 'Только назначенные',
  };
  const employeeStatusLabels = { active: 'Активен', blocked: 'Заблокирован', archived: 'Уволен' };
  const employeeStatusOrder = { active: 0, blocked: 1, archived: 2 };
  const routeLabels = {
    '/dashboard/cash': 'Касса',
    '/dashboard/products': 'Товары',
    '/dashboard/orders': 'Заказы',
    '/dashboard/courier-screen': 'Экран курьера',
    '/dashboard/new-order': 'Новый заказ',
    '/dashboard/clients': 'Маркетинг',
    '/dashboard/chat': 'Чаты',
    '/dashboard/team': 'Команда',
    '/dashboard/settings': 'Настройки',
  };
  const navigationRbac = window.__NAVIGATION_RBAC__ && typeof window.__NAVIGATION_RBAC__ === 'object'
    ? window.__NAVIGATION_RBAC__
    : { actionLabels: {}, nodes: [] };
  const rbacNodes = Array.isArray(navigationRbac.nodes) ? navigationRbac.nodes : [];
  const rbacPermissionKeys = new Set(rbacNodes.flatMap((node) => [
    node.accessKey, ...Object.values(node.actions || {}), ...(node.specialActions || []).map((action) => action.key),
  ]).filter(Boolean));
  const rbacPermissionIds = new Set();
  const rbacNodeById = new Map(rbacNodes.map((node) => [node.id, node]));
  const rbacChildrenByParent = new Map();
  rbacNodes.forEach((node) => {
    const parentId = node.parentId || '';
    if (!rbacChildrenByParent.has(parentId)) rbacChildrenByParent.set(parentId, []);
    rbacChildrenByParent.get(parentId).push(node);
  });
  const documentSections = [
    { key: 'identity', title: 'Удостоверение личности', icon: 'fa-id-card' },
    { key: 'tax', title: 'СНИЛС и ИНН', icon: 'fa-address-card' },
    { key: 'employment', title: 'Сведения о трудовой деятельности', icon: 'fa-briefcase' },
    { key: 'military', title: 'Воинский учёт', icon: 'fa-shield-alt' },
    { key: 'education', title: 'Образование и квалификация', icon: 'fa-graduation-cap' },
  ];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function tabKey(type, id) {
    return `${type}:${id}`;
  }

  function activeTab() {
    return state.tabs.find((tab) => tab.key === state.activeKey) || null;
  }

  function tabHasUnsaved(tab) {
    return Boolean(tab && (tab.dirty || tab.documents?.dirty));
  }

  function showNotice(text, kind) {
    let notice = dom.editor.querySelector('.team-form-notice');
    if (!notice) return;
    notice.textContent = text || '';
    notice.classList.toggle('hidden', !text);
    notice.classList.toggle('is-error', kind === 'error');
    notice.classList.toggle('is-success', kind === 'success');
  }

  function errorLabel(error) {
    const identityErrors = {
      EMPLOYEE_NAME_REQUIRED: 'Укажите фамилию и имя сотрудника.', INVALID_EMPLOYEE_NAME: 'Проверьте ФИО: до 80 символов в каждом поле, без управляющих символов.',
      INVALID_EMPLOYEE_PHONE: 'Введите 10 цифр российского номера, номер с 8/+7 или международный номер с + и кодом страны.',
      INVALID_EMPLOYEE_PHOTO: 'Фотография повреждена или имеет недопустимый формат или размер.',
      LOGIN_SUFFIX_MISMATCH: 'В логине указан суффикс другой компании.', SURNAME_FOR_LOGIN_REQUIRED: 'Введите фамилию, которую можно транслитерировать.',
      CORPORATE_LOGIN_MIGRATION_REQUIRED: 'Сначала необходимо применить миграцию корпоративных логинов.',
      PASSWORD_TOO_SHORT: 'Пароль должен содержать минимум 12 символов.', PASSWORD_TOO_LONG: 'Пароль не должен превышать 72 байта.',
      PASSWORD_TOO_WEAK: 'Добавьте латинские буквы обоих регистров и цифры.', HTTPS_REQUIRED: 'Операция доступна только по HTTPS.',
    };
    if (identityErrors[error]) return identityErrors[error];
    return ({
      LOGIN_EXISTS: 'Этот логин уже занят внутри компании.',
      ROLE_NAME_EXISTS: 'Роль с таким названием уже существует.',
      LAST_OWNER_REQUIRED: 'Нельзя оставить компанию без активного владельца.',
      SELF_STATUS_CHANGE_FORBIDDEN: 'Нельзя заблокировать или уволить самого себя.',
      EMPLOYEE_STATUS_ACTION_REQUIRED: 'Для изменения статуса используйте действия «Заблокировать», «Уволить» или «Восстановить».',
      EMPLOYEE_STATUS_CHANGED: 'Статус уже изменён другим пользователем. Обновите страницу.',
      INVALID_EMPLOYEE_STATUS: 'Недопустимое изменение статуса сотрудника.',
      EMPLOYEE_STATUS_CONFIRMATION_REQUIRED: 'Подтвердите изменение статуса сотрудника.',
      EMPLOYEE_ROLES_INVALID: 'Перед восстановлением назначьте сотруднику актуальную роль.',
      EMPLOYEE_HAS_OPEN_ORDERS: 'У сотрудника есть незавершённые назначенные заказы. Завершите или переназначьте их перед увольнением.',
      OWNER_REQUIRES_FULL_ACCESS: 'Для роли владельца должны быть включены все права.',
      OWNER_ROLE_FORBIDDEN: 'Назначать роль владельца может только владелец компании.',
      OWNER_STATUS_CHANGE_FORBIDDEN: 'Нельзя блокировать, удалять или ограничивать другого владельца.',
      OWNER_ACCESS_CHANGE_FORBIDDEN: 'Нельзя блокировать, удалять или ограничивать другого владельца.',
      SYSTEM_ROLE_PROTECTED: 'Системную роль удалить нельзя.',
      ROLE_HAS_USERS: 'Сначала снимите эту роль со всех сотрудников.',
      INVALID_LOGIN: 'Логин: 3–64 символа, латинские буквы, цифры, точка, дефис или подчёркивание.',
      PASSWORD_TOO_SHORT: 'Пароль должен содержать минимум 6 символов.',
      ROLE_REQUIRED: 'Назначьте сотруднику хотя бы одну роль.',
      INVALID_START_ROUTE: 'Выберите стартовый раздел.',
      FORBIDDEN: 'Недостаточно прав для этого действия.',
      TEAM_ONLINE_REQUIRED: 'Для изменения данных требуется подключение и актуальная серверная карточка.',
      PERMISSION_ESCALATION_FORBIDDEN: 'Нельзя назначить право, которого нет у вашей активной роли.',
      ACCESS_RULE_ESCALATION_FORBIDDEN: 'Нельзя назначить более широкую область доступа, чем у вашей активной роли.',
      ROLE_ESCALATION_FORBIDDEN: 'Нельзя назначить сотруднику роль с более широкими полномочиями.',
      STORE_ESCALATION_FORBIDDEN: 'Нельзя назначить сотруднику филиал за пределами вашего доступа.',
      DOCUMENT_ENCRYPTION_NOT_CONFIGURED: 'Хранилище документов не настроено: задайте ключ шифрования на сервере.',
      INVALID_PASSPORT_SERIES: 'Серия паспорта РФ должна содержать 4 цифры.',
      INVALID_PASSPORT_NUMBER: 'Номер паспорта РФ должен содержать 6 цифр.',
      INVALID_DEPARTMENT_CODE: 'Код подразделения должен содержать 6 цифр.',
      IDENTITY_NUMBER_REQUIRED: 'Укажите номер документа.',
      PASSPORT_SERIES_REQUIRED: 'Укажите серию паспорта РФ.',
      INVALID_SNILS: 'Проверьте СНИЛС: нужны 11 цифр и корректное контрольное число.',
      INVALID_INN: 'Проверьте ИНН: нужны 10 или 12 цифр и корректные контрольные цифры.',
      MILITARY_DOCUMENT_TYPE_REQUIRED: 'Укажите вид документа воинского учёта.',
      EDUCATION_REQUIRED_FIELDS: 'Заполните обязательные сведения об образовании для этой должности.',
      INVALID_DOCUMENT_DATE: 'Проверьте дату документа.',
      DOCUMENT_FIELD_TOO_LONG: 'Одно из значений слишком длинное.',
      DOCUMENTS_READ_FAILED: 'Не удалось загрузить документы сотрудника.',
      DOCUMENTS_UPDATE_FAILED: 'Не удалось сохранить документы сотрудника.',
    })[error] || 'Не удалось выполнить действие.';
  }

  async function request(url, options) {
    const endOperation = window.AdminIdleHydration?.beginOperation();
    try {
    const access = window.AdminLocalRepository?.capture();
    if (!access?.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
    if (options?.method && String(options.method).toUpperCase() !== 'GET' && !canUseServer()) {
      throw Object.assign(new Error('TEAM_ONLINE_REQUIRED'), { code: 'TEAM_ONLINE_REQUIRED' });
    }
    const response = await authFetch(url, options || {});
    const payload = await response.json().catch(() => ({}));
    if (!access.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `HTTP_${response.status}`);
      error.code = payload.error || 'REQUEST_FAILED';
      error.status = response.status;
      if ([401, 403].includes(response.status) && (!options?.method || options.method === 'GET')) {
        window.AdminLocalRepository.reset({ forget: true, reason: 'server-refusal' });
      }
      throw error;
    }
    return payload;
    } finally { endOperation?.(); }
  }

  function normalizeUserDraft(user) {
    return {
      name: user?.name || '',
      last_name: user?.last_name || '',
      first_name: user?.first_name || '',
      patronymic: user?.patronymic || '',
      phone: user?.phone || '',
      login: user?.login_local || (user?.login || '').split('@')[0],
      photo_change: '',
      email: user?.email || '',
      comment: user?.comment || '',
      is_active: user ? Boolean(user.is_active) : true,
      role_ids: Array.isArray(user?.roles) ? user.roles.map((role) => Number(role.id)) : [],
      store_ids: Array.isArray(user?.stores) ? user.stores.map((store) => Number(store.id)) : [],
      temporary_password: '',
      reset_password: '',
    };
  }

  function normalizeRoleDraft(role) {
    const byPermission = new Map((role?.permissions || []).map((permission) => [Number(permission.id), permission]));
    return {
      name: role?.name || '',
      description: role?.description || '',
      start_route: role?.start_route || '/dashboard/orders',
      permissions: state.permissions.map((permission) => {
        const current = byPermission.get(Number(permission.id));
        return {
          permission_id: Number(permission.id),
          enabled: Boolean(current),
          access_rule: current?.access_rule || 'all',
        };
      }),
    };
  }

  function makeTab(type, entity) {
    const isNew = !entity;
    const id = isNew ? `new-${++state.draftSequence}` : Number(entity.id);
    const title = isNew
      ? (type === 'user' ? 'Новый сотрудник' : 'Новая роль')
      : String(entity.name || (type === 'user' ? 'Сотрудник' : 'Роль'));
    const draft = type === 'user' ? normalizeUserDraft(entity) : normalizeRoleDraft(entity);
    const tab = {
      key: tabKey(type, id),
      type,
      id: isNew ? null : Number(entity.id),
      title,
      isNew,
      dirty: false,
      draft,
      snapshot: clone(draft),
      meta: entity ? clone(entity) : null,
      localOnly: type === 'user' && Boolean(entity) && !state.fullUserIds.has(Number(entity.id)),
      assignmentSections: { roles: false, stores: false, start_route: false },
    };
    if (type === 'user') {
      tab.photo = { data: null, previewUrl: '', loaded: false, loading: false };
      tab.documents = {
        loaded: isNew,
        loading: false,
        summary: null,
        openSection: null,
        editingSection: null,
        draft: null,
        snapshot: null,
        dirty: false,
        error: '',
      };
    }
    return tab;
  }

  function openEntity(type, id) {
    if (!state.repository?.isCurrent()) return;
    const key = tabKey(type, Number(id));
    if (state.permissionMode.active && state.permissionMode.roleKey !== key) exitPermissionMode({ render: false });
    const existing = state.tabs.find((tab) => tab.key === key);
    if (existing) {
      state.activeKey = key;
      renderTabs();
      renderEditor();
      if (type === 'user' && !existing.isNew && !existing.documents?.loaded) loadDocumentSummary(existing);
      return;
    }
    const source = type === 'user' ? state.users : state.roles;
    const entity = source.find((item) => Number(item.id) === Number(id));
    if (!entity) return;
    const tab = makeTab(type, entity);
    state.tabs.push(tab);
    state.activeKey = tab.key;
    renderTabs();
    renderEditor();
    if (type === 'user' && !tab.isNew) loadDocumentSummary(tab);
  }

  function openCreateTab() {
    if (!canUseServer()) return;
    if (state.permissionMode.active) exitPermissionMode({ render: false });
    const type = state.section === 'users' ? 'user' : 'role';
    const tab = makeTab(type, null);
    state.tabs.push(tab);
    state.activeKey = tab.key;
    renderTabs();
    renderEditor();
  }

  function renderTabs() {
    if (!state.repository?.isCurrent()) { dom.tabs.innerHTML = ''; return; }
    dom.tabsHeader.classList.toggle('hidden', state.tabs.length === 0);
    dom.tabs.innerHTML = state.tabs.map((tab) => `
      <div class="product-tab ${tab.key === state.activeKey ? 'is-active' : ''}" role="tab"
        data-team-tab="${escapeHtml(tab.key)}" aria-selected="${tab.key === state.activeKey ? 'true' : 'false'}"
        title="${escapeHtml(tab.title)}">
        <span class="product-tab-title">${escapeHtml(tab.title)}${tabHasUnsaved(tab) ? ' •' : ''}</span>
        <button class="product-tab-close" type="button" data-team-tab-close="${escapeHtml(tab.key)}" aria-label="Закрыть вкладку">&times;</button>
      </div>
    `).join('');
    const selected = dom.tabs.querySelector('.product-tab.is-active');
    if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function setSection(section) {
    if (state.permissionMode.active && section !== 'roles') exitPermissionMode({ render: false });
    state.section = section === 'roles' ? 'roles' : 'users';
    dom.sectionButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.teamSection === state.section));
    dom.title.textContent = state.section === 'users' ? 'Сотрудники' : 'Роли и права';
    dom.icon.className = state.section === 'users' ? 'fas fa-users' : 'fas fa-user-shield';
    dom.create.title = state.section === 'users' ? 'Создать сотрудника' : 'Создать роль';
    dom.create.setAttribute('aria-label', dom.create.title);
    const canCreate = state.section === 'users' ? state.capabilities.create_users : state.capabilities.create_roles;
    dom.create.classList.toggle('hidden', !canCreate);
    dom.create.disabled = !canCreate || !canUseServer();
    renderConnectionStatus();
    renderList();
  }

  function applyTeamCapabilities() {
    const current = state.repository?.isCurrent() === true;
    const viewUsers = current && state.navigation.view_users;
    const viewRoles = current && state.navigation.view_roles;
    dom.sectionButtons.forEach((button) => {
      const allowed = button.dataset.teamSection === 'roles' ? viewRoles : viewUsers;
      button.classList.toggle('hidden', !allowed);
      button.disabled = !allowed;
    });
    if (state.section === 'users' && !viewUsers && viewRoles) setSection('roles');
    if (state.section === 'roles' && !viewRoles && viewUsers) setSection('users');
    const canCreate = state.section === 'users' ? state.capabilities.create_users : state.capabilities.create_roles;
    dom.create.classList.toggle('hidden', !canCreate);
    dom.create.disabled = !canCreate || !canUseServer();
  }

  function renderList() {
    if (!state.repository?.isCurrent()) { dom.list.innerHTML = ''; return; }
    dom.userFilters?.classList.toggle('hidden', state.section !== 'users' || state.permissionMode.active);
    dom.userFilters?.querySelectorAll('[data-team-user-status]').forEach((button) => {
      const selected = button.dataset.teamUserStatus === state.userStatus;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (state.permissionMode.active) return;
    const rows = state.section === 'users'
      ? state.userStatus === 'all'
        ? [...state.users].sort((a, b) => employeeStatusOrder[a.employee_status] - employeeStatusOrder[b.employee_status])
        : state.users.filter((user) => user.employee_status === state.userStatus)
      : state.roles;
    if (!rows.length) {
      dom.list.innerHTML = `<div class="team-list-state ${!state.source && state.connection.mode === 'error' ? 'team-list-error' : 'muted'}">${escapeHtml(state.listMessage || (state.section === 'users' ? 'Сотрудников пока нет.' : 'Ролей пока нет.'))}</div>`;
      return;
    }
    dom.list.innerHTML = rows.map((item) => {
      if (state.section === 'users') {
        const roles = (item.roles || []).map((role) => role.name).join(', ') || 'Роли не назначены';
        return `
          <div class="order-row team-entity-row team-employee-list-row" data-team-open="user" data-team-id="${Number(item.id)}">
            <button class="team-employee-open" type="button" aria-label="${escapeHtml(`Открыть карточку: ${item.name || 'Сотрудник'}`)}">
            <div class="product-avatar team-user-avatar" data-team-user-avatar="${Number(item.id)}"><img class="product-avatar-img hidden" alt="Фото сотрудника"><i class="fas fa-user" aria-hidden="true"></i></div>
            <div class="order-col team-entity-copy">
              <div class="product-title">${escapeHtml(item.name || 'Без имени')}</div>
              <div class="muted">${escapeHtml(state.fullUserIds.has(item.id) ? (item.login || item.email || 'Без логина') + ' · ' + roles : roles)}</div>
              <div class="muted team-employee-contact">${state.fullUserIds.has(item.id) ? escapeHtml(item.phone || 'Телефон не указан') : ''}</div>
            </div>
            <div class="order-col team-employee-badge"><span class="badge ${item.employee_status === 'active' ? '' : 'is-muted'}">${employeeStatusLabels[item.employee_status]}</span></div>
            </button>
            <div class="team-status-actions team-list-status-actions">${renderEmployeeStatusActions(item, true)}</div>
          </div>`;
      }
      return `
        <button class="order-row team-entity-row" type="button" data-team-open="role" data-team-id="${Number(item.id)}">
          <div class="product-avatar"><i class="fas fa-user-shield"></i></div>
          <div class="order-col team-entity-copy">
            <div class="product-title">${escapeHtml(item.name)}</div>
            <div class="muted">${Number(item.users_count || 0)} сотрудников · ${(item.permissions || []).filter((permission) => rbacPermissionKeys.has(permission.key)).length} прав</div>
          </div>
          ${item.is_system ? '<div class="order-col"><span class="badge">Системная</span></div>' : ''}
        </button>`;
    }).join('');
    if (state.section === 'users') state.users.forEach((user) => syncUserListPhoto(user.id));
  }

  async function syncUserListPhoto(userId) {
    if (!canUseServer() || !state.fullUserIds.has(Number(userId))) return;
    const access = window.AdminLocalRepository.capture();
    const id = Number(userId);
    const avatar = dom.list.querySelector(`[data-team-user-avatar="${id}"]`);
    if (!avatar) return;
    const user = state.users.find((item) => Number(item.id) === id);
    const tab = state.tabs.find((item) => item.type === 'user' && Number(item.id) === id);
    const revision = state.capabilities.read_employee_photo ? user?.photo_revision : null;
    let cached = state.userPhotos.get(id);
    if (cached && cached.revision !== revision) {
      if (cached.url) URL.revokeObjectURL(cached.url);
      state.userPhotos.delete(id);
      cached = null;
    }
    const change = tab?.draft.photo_change;
    const url = change === 'remove' ? '' : change === 'replace'
      ? tab.photo.previewUrl : cached?.url || '';
    const image = avatar.querySelector('img');
    if (url) image.src = url;
    else image.removeAttribute('src');
    image.classList.toggle('hidden', !url);
    avatar.querySelector('i').classList.toggle('hidden', Boolean(url));
    avatar.classList.toggle('product-avatar--image', Boolean(url));
    avatar.title = cached?.error && !change ? 'Не удалось загрузить фото сотрудника.' : '';
    if (change || !revision || cached) return;
    cached = { revision, url: '', error: false };
    state.userPhotos.set(id, cached);
    try {
      const response = await authFetch(`/api/admin/team/users/${id}/photo`);
      if (!response.ok) throw new Error('PHOTO_LOAD_FAILED');
      const blob = await response.blob();
      if (!access.isCurrent() || state.userPhotos.get(id) !== cached) return;
      cached.url = URL.createObjectURL(blob);
    } catch {
      cached.error = true;
      console.warn('Не удалось загрузить фото сотрудника в списке.');
    } finally {
      if (state.userPhotos.get(id) === cached) syncUserListPhoto(id);
    }
  }

  function checkboxList(items, selectedIds, name, icon, lockedIds = []) {
    const selected = new Set((selectedIds || []).map(Number));
    const locked = new Set(lockedIds.map(Number));
    return items.map((item) => `
      <label class="team-choice-row">
        <input type="checkbox" name="${name}" value="${Number(item.id)}" ${selected.has(Number(item.id)) ? 'checked' : ''} ${locked.has(Number(item.id)) ? 'disabled title="Полномочия владельца защищены"' : ''}>
        <span class="team-choice-icon"><i class="fas ${icon}"></i></span>
        <span class="team-choice-copy"><strong>${escapeHtml(item.name)}</strong>${item.description ? `<small>${escapeHtml(item.description)}</small>` : ''}</span>
      </label>
    `).join('');
  }

  function documentOption(value, current, label) {
    return `<option value="${escapeHtml(value)}" ${current === value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function renderDocumentEditor(section, data) {
    const value = data || {};
    if (section === 'identity') {
      const isRussianPassport = value.type === 'passport_rf';
      return `
        <div class="team-document-fields" data-team-document-editor="identity">
          <label class="settings-site-field"><span class="field-label">ТИП ДОКУМЕНТА</span><select class="control" name="document_identity_type">
            ${documentOption('', value.type, 'Не выбран')}${documentOption('passport_rf', value.type, 'Паспорт РФ')}${documentOption('foreign_passport', value.type, 'Иностранный паспорт')}${documentOption('residence_permit', value.type, 'Вид на жительство')}${documentOption('temporary_residence', value.type, 'Разрешение на временное проживание')}${documentOption('other', value.type, 'Иной документ')}
          </select></label>
          <div class="team-document-grid">
            <label class="settings-site-field"><span class="field-label">СЕРИЯ</span><input class="control" name="document_identity_series" value="${escapeHtml(value.series)}" inputmode="numeric" ${isRussianPassport ? 'required pattern="[0-9 ]{4,5}"' : ''}></label>
            <label class="settings-site-field"><span class="field-label">НОМЕР</span><input class="control" name="document_identity_number" value="${escapeHtml(value.number)}" ${value.type ? 'required' : ''} inputmode="numeric"></label>
          </div>
          <label class="settings-site-field"><span class="field-label">ДАТА ВЫДАЧИ</span><input class="control" type="date" name="document_identity_issue_date" value="${escapeHtml(value.issue_date)}"></label>
          <label class="settings-site-field"><span class="field-label">КЕМ ВЫДАН</span><textarea class="control team-textarea" rows="2" name="document_identity_issued_by">${escapeHtml(value.issued_by)}</textarea></label>
          ${isRussianPassport ? `<label class="settings-site-field"><span class="field-label">КОД ПОДРАЗДЕЛЕНИЯ</span><input class="control" name="document_identity_department_code" value="${escapeHtml(value.department_code)}" placeholder="000-000" inputmode="numeric"></label>` : ''}
          <label class="settings-site-field"><span class="field-label">СТАТУС ПРОВЕРКИ</span><select class="control" name="document_identity_verification_status">${documentOption('unchecked', value.verification_status, 'Не проверен')}${documentOption('pending', value.verification_status, 'Ожидает проверки')}${documentOption('verified', value.verification_status, 'Проверен')}${documentOption('rejected', value.verification_status, 'Проверка отклонена')}</select></label>
        </div>`;
    }
    if (section === 'tax') {
      return `
        <div class="team-document-fields" data-team-document-editor="tax">
          <label class="settings-site-field"><span class="field-label">СНИЛС</span><input class="control" name="document_tax_snils" value="${escapeHtml(value.snils)}" placeholder="000-000-000 00" inputmode="numeric"><span class="field-hint">Проверяются 11 цифр и контрольное число.</span></label>
          <label class="settings-site-field"><span class="field-label">ИНН</span><input class="control" name="document_tax_inn" value="${escapeHtml(value.inn)}" inputmode="numeric"><span class="field-hint">Не обязателен без правового основания; проверяются 10 или 12 цифр.</span></label>
        </div>`;
    }
    if (section === 'employment') {
      return `
        <div class="team-document-fields" data-team-document-editor="employment">
          <label class="settings-site-field"><span class="field-label">ВИД СВЕДЕНИЙ</span><select class="control" name="document_employment_record_type">
            ${documentOption('', value.record_type, 'Не определён')}${documentOption('paper', value.record_type, 'Бумажная трудовая книжка')}${documentOption('electronic', value.record_type, 'Электронные сведения')}${documentOption('first_employment', value.record_type, 'Первое трудоустройство')}${documentOption('clarification', value.record_type, 'Требуется уточнение')}
          </select></label>
          <label class="switch"><input class="switch-input" type="checkbox" name="document_employment_is_part_time" ${value.is_part_time ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span class="switch-text">Работа по совместительству</span></label>
          <label class="switch"><input class="switch-input" type="checkbox" name="document_employment_is_first_job" ${value.is_first_job ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span class="switch-text">Первое трудоустройство</span></label>
          <div class="field-hint">При первом трудоустройстве прежние сведения отсутствуют. Для совместительства учитывайте документы только в применимых законом случаях.</div>
        </div>`;
    }
    if (section === 'military') {
      const subject = value.status === 'subject';
      return `
        <div class="team-document-fields" data-team-document-editor="military">
          <label class="settings-site-field"><span class="field-label">СТАТУС</span><select class="control" name="document_military_status">${documentOption('unknown', value.status, 'Статус не определён')}${documentOption('subject', value.status, 'Подлежит воинскому учёту')}${documentOption('not_subject', value.status, 'Не подлежит воинскому учёту')}</select></label>
          ${subject ? `
            <label class="settings-site-field"><span class="field-label">ВИД ДОКУМЕНТА</span><input class="control" name="document_military_document_type" value="${escapeHtml(value.document_type)}" required placeholder="Военный билет, удостоверение призывника"></label>
            <label class="settings-site-field"><span class="field-label">РЕКВИЗИТЫ</span><textarea class="control team-textarea" rows="2" name="document_military_details">${escapeHtml(value.details)}</textarea></label>
            <label class="settings-site-field"><span class="field-label">СТАТУС ПРОВЕРКИ</span><select class="control" name="document_military_verification_status">${documentOption('unchecked', value.verification_status, 'Не проверен')}${documentOption('pending', value.verification_status, 'Ожидает проверки')}${documentOption('verified', value.verification_status, 'Проверен')}${documentOption('rejected', value.verification_status, 'Проверка отклонена')}</select></label>` : '<div class="field-hint">Реквизиты не запрашиваются, пока воинский учёт не применим.</div>'}
        </div>`;
    }
    const showEducation = Boolean(value.required_for_position || value.level || value.organization || value.qualification || value.document_name || value.series_number || value.issue_date);
    return `
      <div class="team-document-fields" data-team-document-editor="education">
        <label class="switch"><input class="switch-input" type="checkbox" name="document_education_required_for_position" ${value.required_for_position ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span class="switch-text">Должность требует специальных знаний или подготовки</span></label>
        ${showEducation ? `
          <label class="settings-site-field"><span class="field-label">УРОВЕНЬ ОБРАЗОВАНИЯ</span><input class="control" name="document_education_level" value="${escapeHtml(value.level)}" ${value.required_for_position ? 'required' : ''}></label>
          <label class="settings-site-field"><span class="field-label">ОБРАЗОВАТЕЛЬНАЯ ОРГАНИЗАЦИЯ</span><input class="control" name="document_education_organization" value="${escapeHtml(value.organization)}" ${value.required_for_position ? 'required' : ''}></label>
          <label class="settings-site-field"><span class="field-label">СПЕЦИАЛЬНОСТЬ / КВАЛИФИКАЦИЯ</span><input class="control" name="document_education_qualification" value="${escapeHtml(value.qualification)}" ${value.required_for_position ? 'required' : ''}></label>
          <label class="settings-site-field"><span class="field-label">ДОКУМЕНТ ОБ ОБРАЗОВАНИИ</span><input class="control" name="document_education_document_name" value="${escapeHtml(value.document_name)}" ${value.required_for_position ? 'required' : ''}></label>
          <div class="team-document-grid">
            <label class="settings-site-field"><span class="field-label">СЕРИЯ И НОМЕР</span><input class="control" name="document_education_series_number" value="${escapeHtml(value.series_number)}"></label>
            <label class="settings-site-field"><span class="field-label">ДАТА ВЫДАЧИ</span><input class="control" type="date" name="document_education_issue_date" value="${escapeHtml(value.issue_date)}"></label>
          </div>` : '<div class="field-hint">Документ запрашивается только для работы, требующей специальных знаний или подготовки.</div>'}
      </div>`;
  }

  function renderUserDocuments(tab) {
    const documents = tab.documents;
    if (tab.isNew) {
      return `<section class="team-form-section team-documents-section"><div class="settings-list-header"><div><div class="settings-list-title">Документы</div><div class="settings-list-subtitle">Сначала создайте карточку сотрудника</div></div></div></section>`;
    }
    if (!state.capabilities.view_employee_documents) {
      return `<section class="team-form-section team-documents-section"><div class="settings-list-header"><div><div class="settings-list-title">Документы</div><div class="settings-list-subtitle">Доступны только пользователям с правом «Кадровые документы»</div></div></div></section>`;
    }
    if (documents.loading && !documents.loaded) {
      return `<section class="team-form-section team-documents-section"><div class="settings-list-header"><div><div class="settings-list-title">Документы</div><div class="settings-list-subtitle">Загрузка…</div></div></div></section>`;
    }
    return `
      <section class="team-form-section team-documents-section">
        <div class="settings-list-header"><div><div class="settings-list-title">Документы</div><div class="settings-list-subtitle">Чувствительные реквизиты скрыты в режиме просмотра</div></div></div>
        ${documents.error ? `<div class="team-document-notice is-error">${escapeHtml(documents.error)}</div>` : ''}
        <div class="team-document-list">
          ${documentSections.map((item) => {
            const isOpen = documents.openSection === item.key;
            const isEditing = documents.editingSection === item.key;
            const summary = documents.summary?.[item.key] || { status: 'Не заполнено', state: 'empty', lines: [] };
            return `<article class="team-document-item ${isOpen ? 'is-open' : ''}">
              <button class="team-document-toggle" type="button" data-team-document-toggle="${item.key}" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="team-document-icon"><i class="fas ${item.icon}"></i></span>
                <span class="team-document-heading"><strong>${item.title}</strong><small>${escapeHtml(summary.status)}</small></span>
                <span class="team-document-state is-${escapeHtml(summary.state)}" aria-hidden="true"></span>
                <i class="fas fa-chevron-down team-document-chevron" aria-hidden="true"></i>
              </button>
              ${isOpen ? `<div class="team-document-body">
                ${isEditing ? renderDocumentEditor(item.key, documents.draft) : `
                  <div class="team-document-summary">${summary.lines?.length ? summary.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('') : '<div class="muted">Сведения пока не заполнены.</div>'}</div>
                  ${state.capabilities.manage_employee_documents ? `<button class="btn team-document-edit" type="button" data-team-document-edit="${item.key}">Редактировать</button>` : ''}`}
                ${isEditing ? `<div class="team-document-actions"><button class="btn btn-primary" type="button" data-team-document-save="${item.key}">Сохранить</button><button class="btn" type="button" data-team-document-cancel>Отмена</button></div>` : ''}
              </div>` : ''}
            </article>`;
          }).join('')}
        </div>
      </section>`;
  }

  function normalizeEmployeePhoneInput(input) {
    if (!input) return;
    const raw = input.value.trim();
    if (!/^[+0-9 ().-]*$/.test(raw)) return;
    const phone = raw.replace(/[ ().-]/g, '');
    if (/^[0-9]{10}$/.test(phone)) input.value = `+7${phone}`;
    else if (/^[78][0-9]{10}$/.test(phone)) input.value = `+7${phone.slice(1)}`;
    else if (/^\+7[0-9]{10}$/.test(phone)) input.value = phone;
  }

  function renderPasswordField(name, value, required) {
    return `<div class="team-password-row">
      <div class="control-with-action team-password-control">
        <input class="control" type="password" name="${name}" value="${escapeHtml(value)}" ${required ? 'required' : ''} minlength="12" maxlength="72" autocomplete="new-password">
        <button class="control-inline-btn" type="button" data-team-password-show="${name}" title="Показать пароль" aria-label="Показать пароль" aria-pressed="false"><i class="fas fa-eye" aria-hidden="true"></i></button>
        <button class="control-inline-btn" type="button" data-team-password-copy="${name}" title="Скопировать пароль" aria-label="Скопировать пароль"><i class="fas fa-copy" aria-hidden="true"></i></button>
      </div>
      <button class="btn" type="button" data-team-generate-password="${name}">Генерировать</button>
    </div>`;
  }

  function clearEmployeePhoto(tab) {
    if (!tab?.photo) return;
    if (tab.photo.previewUrl) URL.revokeObjectURL(tab.photo.previewUrl);
    tab.photo = { data: null, previewUrl: '', loaded: false, loading: false };
  }

  function updateEmployeePhotoPreview(tab) {
    syncUserListPhoto(tab.id);
    if (tab.key !== state.activeKey) return;
    const image = dom.editor.querySelector('[data-team-photo-preview]');
    if (!image) return;
    if (tab.photo.previewUrl) image.src = tab.photo.previewUrl;
    else image.removeAttribute('src');
    image.classList.toggle('hidden', !tab.photo.previewUrl);
    dom.editor.querySelector('[data-team-photo-placeholder]')?.classList.toggle('hidden', Boolean(tab.photo.previewUrl));
    dom.editor.querySelector('[data-team-photo-remove]')?.classList.toggle('hidden', !tab.photo.previewUrl);
    const uploadButton = dom.editor.querySelector('[data-team-photo-upload]');
    if (uploadButton) {
      const label = tab.photo.previewUrl ? 'Заменить фото' : 'Загрузить фото';
      uploadButton.title = label;
      uploadButton.setAttribute('aria-label', label);
    }
  }

  async function loadEmployeePhoto(tab) {
    if (tab.localOnly || !canUseServer()) return;
    const access = window.AdminLocalRepository.capture();
    if (!state.capabilities.read_employee_photo || !tab.photo || tab.isNew || tab.photo.loaded || tab.photo.loading || !tab.meta?.photo_revision) return;
    const photoState = tab.photo;
    photoState.loading = true;
    try {
      const response = await authFetch(`/api/admin/team/users/${tab.id}/photo`);
      if (!response.ok) throw new Error('PHOTO_LOAD_FAILED');
      const blob = await response.blob();
      if (!access.isCurrent() || tab.photo !== photoState) return;
      photoState.previewUrl = URL.createObjectURL(blob);
      updateEmployeePhotoPreview(tab);
    } catch { if (tab.key === state.activeKey) showNotice('Не удалось загрузить фото сотрудника.', 'error'); }
    finally { photoState.loaded = true; photoState.loading = false; }
  }

  async function selectEmployeePhoto(file) {
    const tab = activeTab();
    if (!file || tab?.type !== 'user' || !canUseServer() || tab.localOnly) return;
    const access = window.AdminLocalRepository.capture();
    if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return showNotice('Выберите JPEG, PNG или WebP размером до 5 МБ.', 'error');
    }
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (!access.isCurrent() || tab.key !== state.activeKey) return;
      clearEmployeePhoto(tab);
      tab.photo.data = data;
      tab.photo.previewUrl = URL.createObjectURL(file);
      tab.photo.loaded = true;
      tab.draft.photo_change = 'replace';
      readActiveDraft();
      updateEmployeePhotoPreview(tab);
    } catch { showNotice('Не удалось прочитать фотографию.', 'error'); }
  }

  async function generateEmployeeLogin() {
    const tab = activeTab();
    const form = document.getElementById('teamActiveForm');
    const surname = form?.elements.last_name?.value.trim();
    if (!surname) return showNotice('Введите фамилию сотрудника.', 'error');
    try {
      const result = await request(`/api/admin/team/login-suggestion?surname=${encodeURIComponent(surname)}&user_id=${Number(tab.id || 0)}`);
      if (tab.key !== state.activeKey) return;
      form.elements.login.value = result.local;
      state.loginSuffix = result.suffix;
      form.querySelector('.team-login-control span').textContent = `@${result.suffix}`;
      form.querySelector('.team-login-control span').title = `@${result.suffix}`;
      readActiveDraft();
    } catch (error) { showNotice(errorLabel(error.code), 'error'); }
  }

  function renderEmployeeStatus(tab) {
    if (tab.isNew) return '';
    const status = tab.meta.employee_status;
    return `<div class="team-employee-status"><span class="badge ${status === 'active' ? '' : 'is-muted'}">${employeeStatusLabels[status]}</span></div>`;
  }

  function renderEmployeeStatusActions(user, iconsOnly = false) {
    const status = user.employee_status;
    const actions = status === 'archived' ? [['active', 'Восстановить']]
      : status === 'blocked' ? [['active', 'Разблокировать'], ['archived', 'Уволить']]
        : [['blocked', 'Заблокировать'], ['archived', 'Уволить']];
    const isOwner = user.is_owner === true;
    const isSelf = Number(user.id) === state.actorUserId
      || (!state.actorUserId && user.email && user.email.toLowerCase() === state.actorEmail.toLowerCase());
    return actions.map(([nextStatus, label]) => {
        const reason = !canUseServer() || !state.fullUserIds.has(Number(user.id)) ? 'Действие требует актуальных серверных данных'
          : isOwner ? 'Учётная запись владельца защищена от изменения статуса'
          : !state.capabilities.update_users ? 'Недостаточно прав'
            : nextStatus !== 'active' && isSelf ? 'Нельзя заблокировать или уволить себя' : '';
        const icon = nextStatus === 'archived' ? 'fa-ban' : nextStatus === 'blocked' ? 'fa-lock' : status === 'archived' ? 'fa-undo' : 'fa-unlock';
        return `<button class="${iconsOnly ? 'icon-btn btn-xs' : 'btn'}" type="button" data-team-change-status="${nextStatus}" data-team-user-id="${Number(user.id)}" ${reason ? 'disabled' : ''} title="${escapeHtml(reason || label)}" aria-label="${escapeHtml(`${label}: ${user.name || 'Сотрудник'}`)}">${iconsOnly ? `<i class="fas ${icon}" aria-hidden="true"></i>` : label}</button>`;
      }).join('');
  }

  function requestEmployeeStatusChange(nextStatus, userId = null) {
    if (!canUseServer()) return;
    readActiveDraft();
    readDocumentDraft();
    const tab = userId == null ? activeTab() : state.tabs.find((item) => item.type === 'user' && Number(item.id) === Number(userId));
    const user = userId == null ? tab?.meta : state.users.find((item) => Number(item.id) === Number(userId));
    if (!user || (tab && (tab.type !== 'user' || tab.isNew)) || !state.capabilities.update_users) return;
    if (!state.fullUserIds.has(Number(user.id))) return;
    if (user.is_owner === true) return showNotice(errorLabel('OWNER_STATUS_CHANGE_FORBIDDEN'), 'error');
    if (tabHasUnsaved(tab)) return showNotice('Сначала сохраните или отмените изменения карточки и документов.', 'error');
    if (!window.AppModal) return showNotice('Компонент подтверждения недоступен.', 'error');
    const currentStatus = user.employee_status;
    const label = nextStatus === 'archived' ? 'Уволить' : nextStatus === 'blocked' ? 'Заблокировать' : currentStatus === 'archived' ? 'Восстановить' : 'Разблокировать';
    const text = nextStatus === 'archived' ? 'Доступ к CRM будет закрыт. Аккаунт, логин, роли и история работы сохранятся в архиве.'
      : nextStatus === 'blocked' ? 'Доступ к CRM прекратится, в том числе для открытых сессий. Данные и роли сохранятся.'
        : 'Сохранятся прежние роли и данные. Для доступа сотруднику потребуется войти заново.';
    const modal = document.getElementById('appModal');
    modal?.classList.add('team-unsaved-modal');
    window.AppModal.open({ title: `${label} сотрудника?`, content: `<div class="team-unsaved-message"><p><strong>${escapeHtml(user.name || 'Сотрудник')}</strong></p><p>${text}</p></div>`, cancelText: 'Отмена', saveText: label,
      onClose: () => modal?.classList.remove('team-unsaved-modal'), onSave: async () => {
      try {
        const result = await request(`/api/admin/team/users/${user.id}/status`, { method: 'PUT', body: JSON.stringify({ status: nextStatus, expected_status: currentStatus, confirmed: true }) });
        replaceEntity('user', result.user);
        if (tab) {
          tab.meta = clone(result.user);
          tab.draft = normalizeUserDraft(result.user);
          tab.snapshot = clone(tab.draft);
          tab.dirty = false;
        }
        renderList();
        if (tab) renderTabs();
        if (tab?.key === state.activeKey) { renderEditor(); showNotice('Статус сотрудника изменён.', 'success'); }
        return true;
      } catch (error) {
        showNotice(errorLabel(error.code), 'error');
        window.AppModal.setFooterNotice?.(errorLabel(error.code));
        return false;
      }
    } });
  }

  function renderUserEditor(tab) {
    if (tab.localOnly) {
      return `<div class="team-editor-scroll no-scrollbar"><section class="team-form-section">
        <div class="settings-list-title">${escapeHtml(tab.meta.name)}</div>
        <div class="team-list-state muted">Локальная карточка — только просмотр. Контакты, учётные данные, фотографии и документы доступны после загрузки с сервера.</div>
        <div class="badge">${escapeHtml(employeeStatusLabels[tab.meta.employee_status])}</div>
        <div class="settings-list-title">Назначенные роли</div>
        <div>${escapeHtml(tab.meta.roles.map((role) => role.name).join(', ') || 'Роли не назначены')}</div>
        <div class="settings-list-title">Филиалы</div>
        <div>${escapeHtml(tab.meta.stores.map((store) => store.name).join(', ') || 'Не назначены')}</div>
      </section></div>`;
    }
    const draft = tab.draft;
    const loginRequired = tab.isNew || !draft.email || Boolean(draft.login);
    const protectedOwner = !tab.isNew && tab.meta.is_owner === true;
    const isSelf = Number(tab.id) === state.actorUserId
      || (!state.actorUserId && tab.meta.email && tab.meta.email.toLowerCase() === state.actorEmail.toLowerCase());
    const ownerCredentialsLocked = protectedOwner && !isSelf;
    const lockedRoleIds = protectedOwner
      ? (tab.meta.roles || []).filter((role) => role.is_owner).map((role) => Number(role.id)) : [];
    return `
      <form class="team-editor-form" id="teamActiveForm" autocomplete="off">
        <div class="team-editor-scroll no-scrollbar">
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Основная информация</div><div class="settings-list-subtitle">Учётная запись сотрудника</div></div></div>
            <input type="hidden" name="name" value="${escapeHtml(draft.name)}">
            <div class="team-photo-field">
              <div class="important-message-preview-media team-photo-preview">
                <img class="important-message-preview-media-img${tab.photo?.previewUrl ? '' : ' hidden'}" data-team-photo-preview ${tab.photo?.previewUrl ? `src="${escapeHtml(tab.photo.previewUrl)}"` : ''} alt="Фото сотрудника">
                <div class="important-message-preview-media-fallback${tab.photo?.previewUrl ? ' hidden' : ''}" data-team-photo-placeholder><i class="fas fa-user" aria-hidden="true"></i></div>
                <button class="important-message-preview-media-actions" type="button" data-team-photo-upload title="${tab.photo?.previewUrl ? 'Заменить фото' : 'Загрузить фото'}" aria-label="${tab.photo?.previewUrl ? 'Заменить фото' : 'Загрузить фото'}"><span class="important-message-preview-media-upload"><i class="fas fa-download" aria-hidden="true"></i></span></button>
                <button class="important-message-preview-media-remove${tab.photo?.previewUrl ? '' : ' hidden'}" type="button" data-team-photo-remove title="Удалить фото" aria-label="Удалить фото"><i class="fas fa-times" aria-hidden="true"></i></button>
              </div>
              <input type="file" class="hidden" data-team-photo-file accept="image/jpeg,image/png,image/webp">
              ${!tab.isNew ? `<div class="team-status-actions team-photo-status-actions">${renderEmployeeStatusActions(tab.meta)}</div>` : ''}
            </div>
            <div class="team-document-grid">
              <label class="settings-site-field"><span class="field-label">ФАМИЛИЯ</span><input class="control" name="last_name" value="${escapeHtml(draft.last_name)}" ${tab.isNew ? 'required' : ''} maxlength="80" autocomplete="family-name"></label>
              <label class="settings-site-field"><span class="field-label">ИМЯ</span><input class="control" name="first_name" value="${escapeHtml(draft.first_name)}" ${tab.isNew ? 'required' : ''} maxlength="80" autocomplete="given-name"></label>
            </div>
            ${!tab.isNew && !draft.first_name && !draft.last_name ? `<div class="field-hint">Сохранённое имя: ${escapeHtml(draft.name)}. Оно останется без изменений, пока не заполнены фамилия и имя.</div>` : ''}
            <label class="settings-site-field"><span class="field-label">ОТЧЕСТВО</span><input class="control" name="patronymic" value="${escapeHtml(draft.patronymic)}" maxlength="80" autocomplete="additional-name"></label>
            <label class="settings-site-field"><span class="field-label">ТЕЛЕФОН</span><input class="control" type="tel" name="phone" value="${escapeHtml(draft.phone)}" placeholder="+7 999 123-45-67" autocomplete="tel"></label>
            <label class="settings-site-field"><span class="field-label">ЛОГИН</span><div class="team-login-row"><div class="team-login-control"><input class="control" name="login" value="${escapeHtml(draft.login)}" ${loginRequired ? 'required' : ''} ${ownerCredentialsLocked ? 'readonly title="Учётные данные другого владельца защищены"' : ''} autocomplete="off" autocapitalize="off" spellcheck="false"><span title="@${escapeHtml(state.loginSuffix)}">@${escapeHtml(state.loginSuffix)}</span></div><button class="btn" type="button" data-team-generate-login ${ownerCredentialsLocked ? 'disabled' : ''}>Генерировать</button></div></label>
            ${tab.isNew ? `<div class="settings-site-field"><label class="field-label">ПАРОЛЬ</label>${renderPasswordField('temporary_password', draft.temporary_password, true)}</div>` : ''}
            ${!tab.isNew && state.capabilities.reset_password && !ownerCredentialsLocked ? `<div class="settings-site-field"><label class="field-label">НОВЫЙ ПАРОЛЬ</label>${renderPasswordField('reset_password', draft.reset_password, false)}</div>` : ''}
            ${renderEmployeeStatus(tab)}
            <div class="settings-site-field"><label class="field-label">КОММЕНТАРИЙ</label><textarea class="control team-textarea" name="comment" rows="3">${escapeHtml(draft.comment)}</textarea></div>
          </section>
          <section class="team-form-section">
            <details class="team-assignment-accordion" data-team-assignment-section="roles" ${tab.assignmentSections.roles ? 'open' : ''}>
              <summary class="team-assignment-toggle"><span class="settings-list-title">Назначенные роли</span><i class="fas fa-chevron-down team-document-chevron" aria-hidden="true"></i></summary>
              <div class="team-choice-grid">${checkboxList(state.roles, draft.role_ids, 'role_ids', 'fa-user-shield', lockedRoleIds)}</div>
            </details>
            <details class="team-assignment-accordion" data-team-assignment-section="stores" ${tab.assignmentSections.stores ? 'open' : ''}>
              <summary class="team-assignment-toggle"><span class="settings-list-title">Филиалы</span><i class="fas fa-chevron-down team-document-chevron" aria-hidden="true"></i></summary>
              <div class="team-choice-grid">${checkboxList(state.stores, draft.store_ids, 'store_ids', 'fa-store', ownerCredentialsLocked ? state.stores.map((store) => Number(store.id)) : [])}</div>
            </details>
          </section>
          ${renderUserDocuments(tab)}
        </div>
        <div class="team-form-notice hidden"></div>
        <div class="team-editor-footer"><button class="btn btn-primary" type="submit">${tab.isNew ? 'Создать сотрудника' : 'Сохранить'}</button><button class="btn" type="button" data-team-reset-form>Отменить изменения</button></div>
      </form>`;
  }

  function enabledPermissionCount(tab) {
    return tab.draft.permissions.filter((grant) => grant.enabled && rbacPermissionIds.has(Number(grant.permission_id))).length;
  }

  function shouldSaveRolePermission(tab, grant) {
    if (!grant.enabled) return false;
    if (rbacPermissionIds.has(Number(grant.permission_id)) || tab.meta?.is_owner) return true;
    const permission = state.permissions.find((item) => Number(item.id) === Number(grant.permission_id));
    return !canManagePermissionGrant(permission, grant);
  }

  function canSaveRole(tab) {
    return Boolean(tab?.isNew ? state.capabilities.create_roles : state.capabilities.update_roles);
  }

  function renderPermissionModeControl(tab) {
    const isActive = state.permissionMode.active && state.permissionMode.roleKey === tab.key;
    const locked = Boolean(tab.meta?.is_owner || (tab.meta?.is_system && !state.capabilities.manage_system_roles));
    const unavailable = !state.capabilities.manage_permissions || !canSaveRole(tab);
    return `<div class="team-permission-mode-card ${isActive ? 'is-active' : ''}">
      <div class="team-permission-mode-copy">
        <strong>${isActive ? 'Настройка выполняется в навигации' : 'Настройка прав'}</strong>
        <span><span data-team-permission-count>${enabledPermissionCount(tab)} из ${rbacPermissionIds.size} прав включено</span>${locked ? ' · системная роль защищена' : ''}${unavailable ? ' · нет права управления ролями' : ''}</span>
      </div>
      <button class="btn ${isActive ? 'btn-primary' : ''}" type="button" data-team-permission-mode ${unavailable || locked ? 'disabled' : ''}>${isActive ? 'Завершить настройку' : 'Настроить права'}</button>
    </div>`;
  }

  function renderRoleEditor(tab) {
    const draft = tab.draft;
    const roleUsers = tab.meta?.users || [];
    const selectedRouteLabel = routeLabels[draft.start_route] || draft.start_route;
    const canSave = canSaveRole(tab);
    return `
      <form class="team-editor-form" id="teamActiveForm" autocomplete="off">
        <div class="team-editor-scroll no-scrollbar">
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Основная информация</div><div class="settings-list-subtitle">Название не используется в проверках доступа</div></div></div>
            <div class="settings-site-field"><label class="field-label">НАЗВАНИЕ</label><input class="control" name="name" value="${escapeHtml(draft.name)}" required></div>
            <div class="settings-site-field"><label class="field-label">ОПИСАНИЕ</label><textarea class="control team-textarea" name="description" rows="3">${escapeHtml(draft.description)}</textarea></div>
            <details class="team-assignment-accordion" data-team-assignment-section="start_route" ${tab.assignmentSections.start_route ? 'open' : ''}>
              <summary class="team-assignment-toggle"><span class="team-choice-copy"><strong class="settings-list-title">Стартовый раздел</strong><small data-team-start-route-label>${escapeHtml(selectedRouteLabel)}</small></span><i class="fas fa-chevron-down team-document-chevron" aria-hidden="true"></i></summary>
              <input type="hidden" name="start_route" value="${escapeHtml(draft.start_route)}">
              <div class="team-choice-grid">
                ${state.startRoutes.map((route) => `<label class="team-choice-row"><input type="radio" name="start_route_choice" value="${escapeHtml(route)}" ${draft.start_route === route ? 'checked' : ''}><span class="team-choice-copy"><strong>${escapeHtml(routeLabels[route] || route)}</strong></span></label>`).join('')}
              </div>
            </details>
          </section>
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Права и доступы</div><div class="settings-list-subtitle">Выбор раздела — в навигации, настройка действий — в средней колонке</div></div></div>
            ${renderPermissionModeControl(tab)}
          </section>
          ${!tab.isNew ? `<section class="team-form-section"><div class="settings-list-header"><div><div class="settings-list-title">Сотрудники с этой ролью</div></div></div><div class="team-role-users">${roleUsers.length ? roleUsers.map((user) => `<button type="button" class="team-role-user" data-team-role-user="${Number(user.id)}"><i class="fas fa-user"></i><span>${escapeHtml(user.name || user.login || 'Сотрудник')}</span></button>`).join('') : '<div class="muted">Роль пока никому не назначена.</div>'}</div></section>` : ''}
        </div>
        <div class="team-form-notice hidden"></div>
        <div class="team-editor-footer"><button class="btn btn-primary" type="submit" ${canSave ? '' : 'disabled'}>${tab.isNew ? 'Создать роль' : 'Сохранить'}</button><button class="btn" type="button" data-team-reset-form>Отменить изменения</button>${!tab.isNew && !tab.meta?.is_system && state.capabilities.delete_roles ? '<button class="btn team-delete-btn" type="button" data-team-delete-role>Удалить роль</button>' : ''}</div>
      </form>`;
  }

  function renderEditor(options = {}) {
    if (!state.repository?.isCurrent()) { dom.editor.innerHTML = ''; return; }
    const tab = activeTab();
    if (!tab) {
      dom.editor.innerHTML = '<div class="info-card team-empty-state"><div class="info-title">Выберите сотрудника или роль</div><div class="info-text">Открытые карточки появятся здесь отдельными рабочими вкладками.</div></div>';
      return;
    }
    if (options.documentsOnly && tab.type === 'user') {
      const documents = dom.editor.querySelector('.team-documents-section');
      if (!documents) return;
      const scroll = dom.editor.querySelector('.team-editor-scroll');
      const scrollTop = scroll?.scrollTop || 0;
      const focused = documents.contains(document.activeElement) ? document.activeElement : null;
      const name = focused?.name;
      const selectionStart = focused?.selectionStart;
      const selectionEnd = focused?.selectionEnd;
      documents.outerHTML = renderUserDocuments(tab);
      const control = name ? dom.editor.querySelector('#teamActiveForm')?.elements[name] : null;
      if (control) {
        control.focus({ preventScroll: true });
        if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
          control.setSelectionRange(selectionStart, selectionEnd);
        }
      }
      if (scroll) scroll.scrollTop = scrollTop;
      return;
    }
    dom.editor.innerHTML = tab.type === 'user' ? renderUserEditor(tab) : renderRoleEditor(tab);
    suspendedControls.clear();
    if (!canUseServer()) suspendEditor();
    if (tab.type === 'user') {
      syncUserListPhoto(tab.id);
      loadEmployeePhoto(tab);
    }
    syncPermissionModeControls();
  }

  async function loadDocumentSummary(tab) {
    if (tab?.localOnly || !canUseServer()) return;
    const access = window.AdminLocalRepository.capture();
    if (!tab || tab.type !== 'user' || tab.isNew || tab.documents.loading || !state.capabilities.view_employee_documents) return;
    tab.documents.loading = true;
    if (tab.key === state.activeKey) renderEditor({ documentsOnly: true });
    try {
      const result = await request(`/api/admin/team/users/${tab.id}/documents`);
      tab.documents.summary = result.summary || null;
      tab.documents.loaded = true;
      tab.documents.error = '';
    } catch (error) {
      tab.documents.error = errorLabel(error.code);
    } finally {
      tab.documents.loading = false;
      if (access.isCurrent() && tab.key === state.activeKey) renderEditor({ documentsOnly: true });
    }
  }

  function readDocumentDraft() {
    const tab = activeTab();
    const form = document.getElementById('teamActiveForm');
    const section = tab?.documents?.editingSection;
    if (!tab || tab.type !== 'user' || !form || !section) return;
    const value = (name) => form.elements[name]?.value || '';
    const checked = (name) => Boolean(form.elements[name]?.checked);
    if (section === 'identity') {
      tab.documents.draft = {
        type: value('document_identity_type'),
        series: value('document_identity_series'),
        number: value('document_identity_number'),
        issue_date: value('document_identity_issue_date'),
        issued_by: value('document_identity_issued_by'),
        department_code: value('document_identity_department_code'),
        verification_status: value('document_identity_verification_status') || 'unchecked',
      };
    } else if (section === 'tax') {
      tab.documents.draft = { snils: value('document_tax_snils'), inn: value('document_tax_inn') };
    } else if (section === 'employment') {
      tab.documents.draft = {
        record_type: value('document_employment_record_type'),
        is_part_time: checked('document_employment_is_part_time'),
        is_first_job: checked('document_employment_is_first_job'),
      };
    } else if (section === 'military') {
      tab.documents.draft = {
        status: value('document_military_status') || 'unknown',
        document_type: value('document_military_document_type'),
        details: value('document_military_details'),
        verification_status: value('document_military_verification_status') || 'unchecked',
      };
    } else if (section === 'education') {
      tab.documents.draft = {
        required_for_position: checked('document_education_required_for_position'),
        level: value('document_education_level'),
        organization: value('document_education_organization'),
        qualification: value('document_education_qualification'),
        document_name: value('document_education_document_name'),
        series_number: value('document_education_series_number'),
        issue_date: value('document_education_issue_date'),
      };
    }
    tab.documents.dirty = JSON.stringify(tab.documents.draft) !== JSON.stringify(tab.documents.snapshot);
    syncDocumentTabIndicator(tab);
  }

  function syncDocumentTabIndicator(tab) {
    if (tab.key !== state.activeKey) return;
    const title = dom.tabs.querySelector('.product-tab.is-active .product-tab-title');
    const text = `${tab.title}${tabHasUnsaved(tab) ? ' •' : ''}`;
    if (title && title.textContent !== text) title.textContent = text;
  }

  async function editDocumentSection(section) {
    const tab = activeTab();
    if (!tab || tab.type !== 'user' || tab.isNew || !state.capabilities.view_employee_documents || !state.capabilities.manage_employee_documents) return;
    tab.documents.error = '';
    try {
      const result = await request(`/api/admin/team/users/${tab.id}/documents?section=${encodeURIComponent(section)}`);
      tab.documents.openSection = section;
      tab.documents.editingSection = section;
      tab.documents.draft = clone(result.data || {});
      tab.documents.snapshot = clone(result.data || {});
      tab.documents.dirty = false;
      if (tab.key === state.activeKey) renderEditor({ documentsOnly: true });
    } catch (error) {
      tab.documents.error = errorLabel(error.code);
      if (tab.key === state.activeKey) renderEditor({ documentsOnly: true });
    }
  }

  function discardDocumentChanges(tab) {
    if (!tab?.documents) return;
    tab.documents.editingSection = null;
    tab.documents.draft = null;
    tab.documents.snapshot = null;
    tab.documents.dirty = false;
    tab.documents.error = '';
  }

  function toggleDocumentSection(section) {
    const tab = activeTab();
    if (!tab?.documents) return;
    const applyToggle = () => {
      if (tab.documents.editingSection) discardDocumentChanges(tab);
      tab.documents.openSection = tab.documents.openSection === section ? null : section;
      syncDocumentTabIndicator(tab);
      renderEditor({ documentsOnly: true });
    };
    readDocumentDraft();
    if (tab.documents.dirty) return openUnsavedDialog(applyToggle);
    applyToggle();
  }

  function cancelDocumentEdit() {
    const tab = activeTab();
    if (!tab?.documents) return;
    discardDocumentChanges(tab);
    syncDocumentTabIndicator(tab);
    renderEditor({ documentsOnly: true });
  }

  async function saveDocumentSection(section) {
    if (!canUseServer() || activeTab()?.localOnly) return;
    const tab = activeTab();
    if (!tab || tab.type !== 'user' || tab.isNew || tab.documents.editingSection !== section) return;
    readDocumentDraft();
    const editor = dom.editor.querySelector(`[data-team-document-editor="${section}"]`);
    const invalid = editor?.querySelector(':invalid');
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    const saveButton = dom.editor.querySelector(`[data-team-document-save="${section}"]`);
    if (saveButton) saveButton.disabled = true;
    tab.documents.error = '';
    try {
      const result = await request(`/api/admin/team/users/${tab.id}/documents`, {
        method: 'PUT',
        body: JSON.stringify({ section, data: tab.documents.draft }),
      });
      tab.documents.summary = result.summary || tab.documents.summary;
      tab.documents.loaded = true;
      discardDocumentChanges(tab);
      syncDocumentTabIndicator(tab);
      if (tab.key === state.activeKey) renderEditor({ documentsOnly: true });
    } catch (error) {
      tab.documents.error = errorLabel(error.code);
      if (tab.key === state.activeKey) renderEditor({ documentsOnly: true });
    }
  }

  function readActiveDraft() {
    const tab = activeTab();
    const form = document.getElementById('teamActiveForm');
    if (!tab || !form) return;
    if (tab.type === 'user') {
      tab.draft = {
        ...tab.draft,
        name: form.elements.name.value.trim(),
        last_name: form.elements.last_name.value.trim(),
        first_name: form.elements.first_name.value.trim(),
        patronymic: form.elements.patronymic.value.trim(),
        phone: form.elements.phone.value.trim(),
        login: form.elements.login.value.trim(),
        comment: form.elements.comment.value.trim(),
        is_active: tab.draft.is_active,
        temporary_password: form.elements.temporary_password?.value || '',
        reset_password: form.elements.reset_password?.value || '',
        role_ids: Array.from(form.querySelectorAll('input[name="role_ids"]:checked')).map((input) => Number(input.value)),
        store_ids: Array.from(form.querySelectorAll('input[name="store_ids"]:checked')).map((input) => Number(input.value)),
      };
    } else {
      tab.draft = {
        ...tab.draft,
        name: form.elements.name.value.trim(),
        description: form.elements.description.value.trim(),
        start_route: form.elements.start_route.value,
      };
    }
    tab.dirty = JSON.stringify(tab.draft) !== JSON.stringify(tab.snapshot);
    renderTabs();
  }

  function permissionByKey(key) {
    return state.permissions.find((permission) => permission.key === key) || null;
  }

  function permissionGrant(tab, key) {
    const permission = permissionByKey(key);
    if (!permission) return null;
    return tab.draft.permissions.find((grant) => Number(grant.permission_id) === Number(permission.id)) || null;
  }

  function canManagePermissionGrant(permission, grant) {
    if (!permission || permission.can_manage === false) return false;
    if (!grant?.enabled || permission.max_access_rule === 'all') return true;
    return !permission.max_access_rule || grant.access_rule === permission.max_access_rule;
  }

  function permissionKeysState(tab, keys) {
    const grants = keys.map((key) => permissionGrant(tab, key)).filter(Boolean);
    const enabled = grants.filter((grant) => grant.enabled).length;
    return { checked: grants.length > 0 && enabled === grants.length, indeterminate: enabled > 0 && enabled < grants.length };
  }

  function nodeOwnBaseKeys(node) {
    if (!node) return [];
    return [node.accessKey, ...Object.values(node.actions || {})].filter((key) => permissionByKey(key));
  }

  function nodeBranchPermissionKeys(nodeId, includeSpecial = false) {
    const keys = [];
    const visit = (id) => {
      const current = rbacNodeById.get(id);
      if (!current) return;
      keys.push(...nodeOwnBaseKeys(current));
      if (includeSpecial) keys.push(...(current.specialActions || []).map((action) => action.key));
      (rbacChildrenByParent.get(id) || []).forEach((child) => visit(child.id));
    };
    visit(nodeId);
    return Array.from(new Set(keys));
  }

  function nodeAncestorAccessKeys(nodeId) {
    const keys = [];
    let current = rbacNodeById.get(nodeId);
    while (current) {
      if (current.accessKey && permissionByKey(current.accessKey)) keys.push(current.accessKey);
      current = current.parentId ? rbacNodeById.get(current.parentId) : null;
    }
    return keys;
  }

  function updateRoleDirty(tab) {
    tab.dirty = JSON.stringify(tab.draft) !== JSON.stringify(tab.snapshot);
    renderTabs();
  }

  function setPermissionsEnabled(tab, keys, enabled) {
    if (!tab || tab.type !== 'role' || tab.meta?.is_owner) return;
    keys.forEach((key) => {
      const permission = permissionByKey(key);
      const grant = permissionGrant(tab, key);
      if (!permission || !grant || !canManagePermissionGrant(permission, grant)) return;
      if (enabled && permission.max_access_rule && permission.max_access_rule !== 'all'
          && grant.access_rule !== permission.max_access_rule) {
        grant.access_rule = permission.max_access_rule;
      }
      grant.enabled = Boolean(enabled);
    });
    updateRoleDirty(tab);
    syncPermissionModeControls();
  }

  function setNodePermissionsEnabled(tab, nodeId, enabled) {
    const node = rbacNodeById.get(nodeId);
    const clearSpecial = !enabled && node && !node.parentId;
    setPermissionsEnabled(tab, nodeBranchPermissionKeys(nodeId, clearSpecial), enabled);
  }

  function setSinglePermissionEnabled(tab, nodeId, key, enabled) {
    const keys = enabled ? [key, ...nodeAncestorAccessKeys(nodeId)] : [key];
    setPermissionsEnabled(tab, Array.from(new Set(keys)), enabled);
  }

  function syncPermissionCheckbox(input, tab) {
    const nodeId = input.dataset.rbacNodeId || '';
    const keys = nodeId ? nodeBranchPermissionKeys(nodeId) : String(input.dataset.permissionKeys || '').split(',').filter(Boolean);
    const toggleKeys = keys;
    const value = permissionKeysState(tab, keys);
    input.checked = value.checked;
    input.indeterminate = value.indeterminate;
    const manageableCount = toggleKeys.filter((key) => {
      const permission = permissionByKey(key);
      return canManagePermissionGrant(permission, permissionGrant(tab, key));
    }).length;
    input.disabled = Boolean(tab.meta?.is_owner) || manageableCount === 0;
    input.title = manageableCount < toggleKeys.length
      ? 'Часть прав недоступна для изменения и будет сохранена без изменений'
      : '';
  }

  function syncPermissionModeControls() {
    const tab = activeTab();
    if (!state.permissionMode.active || !tab || tab.key !== state.permissionMode.roleKey) return;
    const counter = dom.editor.querySelector('[data-team-permission-count]');
    if (counter) counter.textContent = `${enabledPermissionCount(tab)} из ${rbacPermissionIds.size} прав включено`;
    document.querySelectorAll('.team-rbac-permission-input[data-rbac-node-id]').forEach((input) => syncPermissionCheckbox(input, tab));
    document.querySelectorAll('[data-rbac-permission-key]').forEach((input) => {
      const permission = permissionByKey(input.dataset.rbacPermissionKey);
      const grant = permissionGrant(tab, input.dataset.rbacPermissionKey);
      input.checked = Boolean(grant?.enabled);
      input.disabled = Boolean(tab.meta?.is_owner) || !canManagePermissionGrant(permission, grant);
      const row = input.closest('.team-rbac-action-row');
      row?.classList.toggle('is-locked', input.disabled);
      const select = row?.querySelector('[data-rbac-access-rule]');
      if (select) {
        select.value = grant?.access_rule || 'all';
        select.disabled = input.disabled || !input.checked;
      }
    });
  }

  function restorePermissionModeLeftColumn() {
    if (!dom.leftColumn || !state.permissionMode.originalLeftNodes.length) return;
    dom.leftColumn.replaceChildren(...state.permissionMode.originalLeftNodes);
    state.permissionMode.originalLeftNodes = [];
  }

  function restorePermissionModeCenterColumn() {
    const original = state.permissionMode.originalCenter;
    if (!original) return;
    dom.list.replaceChildren(...original.nodes);
    dom.list.className = original.className;
    dom.title.textContent = original.title;
    dom.icon.className = original.icon;
    dom.create.classList.toggle('hidden', original.createHidden);
    state.permissionMode.originalCenter = null;
  }

  function exitPermissionMode(options = {}) {
    if (!state.permissionMode.active) return;
    state.permissionMode.loadSequence += 1;
    restorePermissionModeLeftColumn();
    restorePermissionModeCenterColumn();
    document.querySelectorAll('.team-rbac-sidebar-row').forEach((row) => {
      const link = row.querySelector('[data-nav-key]');
      if (link && row.parentNode) row.parentNode.insertBefore(link, row);
      row.remove();
    });
    state.permissionMode.sidebarVisibility.forEach((wasHidden, item) => item.classList.toggle('hidden', wasHidden));
    state.permissionMode.sidebarVisibility.clear();
    document.documentElement.setAttribute('data-sidebar-collapsed', state.permissionMode.sidebarCollapsed);
    dom.sidebar?.classList.toggle('is-collapsed', state.permissionMode.sidebarCollapsed === '1');
    document.body.classList.remove('team-rbac-permission-mode');
    state.permissionMode.active = false;
    renderConnectionStatus();
    dom.userFilters?.classList.toggle('hidden', state.section !== 'users');
    state.permissionMode.roleKey = '';
    state.permissionMode.selectedNavKey = '';
    state.permissionMode.selectedNodeId = '';
    dom.sidebar?.querySelectorAll('.is-permission-selected').forEach((link) => link.classList.remove('is-permission-selected'));
    if (options.render !== false) renderEditor();
  }

  function installSidebarPermissionControls(tab) {
    if (!dom.sidebar) return;
    dom.sidebar.querySelectorAll('[data-nav-key]').forEach((link) => {
      const item = link.closest('li');
      if (!item || (link.dataset.navKey === 'chat' && document.body.dataset.adminChatEnabled !== '1')) return;
      state.permissionMode.sidebarVisibility.set(item, item.classList.contains('hidden'));
      item.classList.remove('hidden');
      const row = document.createElement('div');
      row.className = 'team-rbac-sidebar-row';
      const label = document.createElement('label');
      label.className = 'team-rbac-checkbox-label';
      label.title = `Доступ к разделу «${link.querySelector('.nav-text')?.textContent?.trim() || link.dataset.navKey}»`;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'team-rbac-permission-input';
      input.dataset.rbacNodeId = link.dataset.rbacNode || '';
      input.dataset.permissionNavKey = link.dataset.navKey;
      label.appendChild(input);
      item.insertBefore(row, link);
      row.append(label, link);
      syncPermissionCheckbox(input, tab);
    });
  }

  function permissionTargets(navKey, root) {
    return Array.from(root.querySelectorAll('[data-rbac-node]')).map((element) => ({
      element,
      node: rbacNodeById.get(element.dataset.rbacNode),
    })).filter((target) => target.node && target.node.navKey === navKey);
  }

  function renderCenterPermissionActions(nodeId) {
    const tab = activeTab();
    const node = rbacNodeById.get(nodeId);
    if (!state.permissionMode.active || !tab || !node) return;
    if (state.permissionMode.selectedNodeId === nodeId && dom.list.querySelector('.team-rbac-action-panel')) {
      syncPermissionModeControls();
      return;
    }
    state.permissionMode.selectedNodeId = nodeId;
    dom.leftColumn.querySelectorAll('.is-rbac-selected').forEach((node) => node.classList.remove('is-rbac-selected'));
    permissionTargets(node.navKey, dom.leftColumn).forEach(({ element, node: targetNode }) => {
      element.classList.toggle('is-rbac-selected', targetNode.id === nodeId);
    });
    dom.title.textContent = node.label;
    dom.icon.className = 'fas fa-user-shield';
    const entries = [];
    Object.entries(node.actions || {}).forEach(([action, key]) => entries.push({
      key,
      label: navigationRbac.actionLabels?.[action] || action,
      special: false,
    }));
    (node.specialActions || []).forEach((item) => entries.push({ ...item, special: true }));
    const panel = document.createElement('div');
    panel.className = 'team-rbac-action-panel';
    panel.dataset.rbacSelectedNode = node.id;
    const renderAction = (entry) => {
      const permission = permissionByKey(entry.key);
      const grant = permissionGrant(tab, entry.key);
      if (!permission || !grant) return '';
      const rules = permission.allowed_access_rules || ['all'];
      const assignableRules = permission.max_access_rule === 'all'
        ? rules
        : rules.filter((rule) => rule === permission.max_access_rule);
      const disabled = tab.meta?.is_owner || !canManagePermissionGrant(permission, grant);
      return `<div class="team-rbac-action-row ${entry.special ? 'is-special' : ''} ${disabled ? 'is-locked' : ''}">
        <label><input type="checkbox" data-rbac-permission-key="${escapeHtml(entry.key)}" data-rbac-node-action="${escapeHtml(node.id)}" ${grant.enabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${escapeHtml(entry.label)}</span></label>
        ${rules.length > 1 ? `<select class="control" data-rbac-access-rule="${escapeHtml(entry.key)}" ${disabled || !grant.enabled ? 'disabled' : ''}>${rules.map((rule) => `<option value="${escapeHtml(rule)}" ${grant.access_rule === rule ? 'selected' : ''} ${assignableRules.includes(rule) || rule === grant.access_rule ? '' : 'disabled'}>${escapeHtml(accessLabels[rule] || rule)}</option>`).join('')}</select>` : ''}
        ${disabled ? `<small>${tab.meta?.is_owner ? 'Полномочия владельца защищены' : 'Недоступно: право или его область выше полномочий активной роли'}</small>` : ''}
      </div>`;
    };
    const baseRows = entries.filter((entry) => !entry.special).map(renderAction).join('');
    const specialRows = entries.filter((entry) => entry.special).map(renderAction).join('');
    const parent = node.parentId ? rbacNodeById.get(node.parentId) : null;
    panel.innerHTML = `
      <div class="team-rbac-node-context muted">${escapeHtml(parent ? `${parent.label} → ${node.label}` : node.label)}</div>
      ${baseRows ? `<section class="team-rbac-action-group"><h2 class="team-rbac-actions-title">Базовые разрешения</h2>${baseRows}</section>` : ''}
      ${specialRows ? `<section class="team-rbac-action-group"><h2 class="team-rbac-actions-title">Дополнительные разрешения</h2>${specialRows}</section>` : ''}
      ${!baseRows && !specialRows ? `<div class="muted team-rbac-empty-state">${(rbacChildrenByParent.get(node.id) || []).length ? 'Выберите подраздел в левой колонке для настройки действий.' : 'У этого подраздела нет отдельных разрешений действий. Доступ настраивается галочкой в левой колонке.'}</div>` : ''}
      <div class="team-rbac-mobile-return"><button class="btn" type="button" data-rbac-return-editor>К карточке роли</button></div>`;
    dom.list.replaceChildren(panel);
    syncPermissionModeControls();
  }

  function decoratePermissionLeftColumn(navKey) {
    const tab = activeTab();
    if (!tab || !dom.leftColumn) return;
    if (navKey === 'chat') dom.leftColumn.querySelector('.chat-clients-search')?.remove();
    const targets = permissionTargets(navKey, dom.leftColumn);
    targets.forEach(({ element: sourceElement, node }) => {
      let element = sourceElement;
      if (element.matches('.panel-header')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'stage-item';
        button.dataset.rbacNode = node.id;
        const title = element.querySelector('.panel-title');
        if (title) {
          title.textContent = node.label;
          button.appendChild(title);
        } else {
          button.textContent = node.label;
        }
        element.replaceWith(button);
        element = button;
      }
      element.classList.add('team-rbac-left-target');
      const label = document.createElement('label');
      label.className = 'team-rbac-checkbox-label team-rbac-left-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'team-rbac-permission-input';
      input.dataset.rbacNodeId = node.id;
      label.appendChild(input);
      if (element.matches('button')) {
        const row = document.createElement('div');
        row.className = 'team-rbac-left-row';
        element.parentNode.insertBefore(row, element);
        row.append(label, element);
      } else {
        element.prepend(label);
      }
      syncPermissionCheckbox(input, tab);
    });
    const returnBar = document.createElement('div');
    returnBar.className = 'team-rbac-mobile-return';
    returnBar.innerHTML = '<button class="btn" type="button" data-rbac-return-editor><i class="fas fa-arrow-left" aria-hidden="true"></i> К карточке роли</button>';
    dom.leftColumn.prepend(returnBar);
    if (targets.length === 1) renderCenterPermissionActions(targets[0].node.id);
  }

  async function selectPermissionNavigation(navKey) {
    if (!state.permissionMode.active || !dom.leftColumn) return;
    const link = dom.sidebar?.querySelector(`[data-nav-key="${navKey}"]`);
    if (!link) return;
    state.permissionMode.selectedNavKey = navKey;
    state.permissionMode.selectedNodeId = '';
    renderCenterPermissionActions(link.dataset.rbacNode);
    dom.sidebar.querySelectorAll('[data-nav-key]').forEach((item) => item.classList.toggle('is-permission-selected', item === link));
    const loadSequence = ++state.permissionMode.loadSequence;
    dom.leftColumn.innerHTML = '<div class="panel"><div class="panel-body"><div class="muted">Загрузка раздела…</div></div></div>';
    try {
      const response = await fetch(link.href, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
      if (!response.ok) throw new Error('NAVIGATION_LOAD_FAILED');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const source = page.querySelector('.page-col-left');
      if (!source) throw new Error('NAVIGATION_COLUMN_NOT_FOUND');
      if (!state.permissionMode.active || loadSequence !== state.permissionMode.loadSequence) return;
      dom.leftColumn.replaceChildren(...Array.from(source.childNodes).map((node) => document.importNode(node, true)));
      decoratePermissionLeftColumn(navKey);
    } catch (_) {
      if (!state.permissionMode.active || loadSequence !== state.permissionMode.loadSequence) return;
      dom.leftColumn.innerHTML = '<div class="panel"><div class="panel-body"><div class="team-list-state team-list-error">Не удалось загрузить левую колонку раздела.</div></div></div>';
    }
  }

  function enterPermissionMode() {
    const tab = activeTab();
    if (!tab || tab.type !== 'role' || !state.capabilities.manage_permissions || !canSaveRole(tab) || !dom.sidebar || !dom.leftColumn || !dom.centerColumn?.contains(dom.list)) return;
    if (tab.meta?.is_owner || (tab.meta?.is_system && !state.capabilities.manage_system_roles)) return;
    if (state.permissionMode.active) exitPermissionMode({ render: false });
    state.permissionMode.active = true;
    renderConnectionStatus();
    dom.userFilters?.classList.add('hidden');
    state.permissionMode.roleKey = tab.key;
    state.permissionMode.originalLeftNodes = Array.from(dom.leftColumn.childNodes);
    state.permissionMode.originalCenter = {
      nodes: Array.from(dom.list.childNodes),
      className: dom.list.className,
      title: dom.title.textContent,
      icon: dom.icon.className,
      createHidden: dom.create.classList.contains('hidden'),
    };
    dom.list.classList.remove('orders-list');
    dom.list.classList.add('team-rbac-actions-host');
    dom.create.classList.add('hidden');
    state.permissionMode.sidebarCollapsed = document.documentElement.getAttribute('data-sidebar-collapsed') === '1' ? '1' : '0';
    document.documentElement.setAttribute('data-sidebar-collapsed', '0');
    dom.sidebar.classList.remove('is-collapsed');
    document.body.classList.add('team-rbac-permission-mode');
    installSidebarPermissionControls(tab);
    renderEditor();
    selectPermissionNavigation('team').then(() => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      window.__adminMobilePages?.back?.();
      window.__adminMobilePages?.back?.();
    });
  }

  function replaceEntity(type, entity) {
    state.dataRevision += 1;
    if (type === 'user') state.fullUserIds.add(Number(entity.id));
    const list = type === 'user' ? state.users : state.roles;
    const index = list.findIndex((item) => Number(item.id) === Number(entity.id));
    if (index >= 0) list[index] = entity;
    else list.push(entity);
    const roleById = new Map(state.roles.map((role) => [Number(role.id), role]));
    state.users.forEach((user) => {
      user.roles = (user.roles || []).map((assignedRole) => {
        const currentRole = roleById.get(Number(assignedRole.id));
        return currentRole
          ? { id: Number(currentRole.id), name: currentRole.name, is_owner: Boolean(currentRole.is_owner) }
          : assignedRole;
      });
    });
    state.roles.forEach((role) => {
      role.users = state.users
        .filter((user) => (user.roles || []).some((assignedRole) => Number(assignedRole.id) === Number(role.id)))
        .map((user) => ({ id: Number(user.id), name: user.name, login: user.login, is_active: Boolean(user.is_active) }));
      role.users_count = role.users.length;
      const openTab = state.tabs.find((tab) => tab.type === 'role' && Number(tab.id) === Number(role.id));
      if (openTab?.meta) {
        openTab.meta.users = clone(role.users);
        openTab.meta.users_count = role.users_count;
      }
    });
    if (type === 'user') state.users.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
    else state.roles.sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || String(a.name).localeCompare(String(b.name), 'ru'));
    void persistEmployeeSnapshot();
  }

  async function saveActiveTab(event, confirmedPassword = null) {
    event.preventDefault();
    if (!canUseServer() || activeTab()?.localOnly) return false;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    normalizeEmployeePhoneInput(form.elements.phone);
    readActiveDraft();
    const tab = activeTab();
    if (!tab) return;
    const documentControls = Array.from(form.querySelectorAll('[data-team-document-editor] input, [data-team-document-editor] select, [data-team-document-editor] textarea'));
    documentControls.forEach((control) => { control.disabled = true; });
    const formIsValid = form.reportValidity();
    documentControls.forEach((control) => { control.disabled = false; });
    if (!formIsValid) return false;
    if (tab.type === 'user' && !tab.isNew && tab.draft.reset_password && tab.draft.reset_password !== confirmedPassword) {
      if (!window.AppModal) { showNotice('Компонент подтверждения недоступен.', 'error'); return false; }
      if (window.AppModal.isOpen?.()) return false;
      const password = tab.draft.reset_password;
      window.AppModal.open({
        title: 'Сохранить новый пароль?',
        content: '<p>Данные карточки и новый пароль будут сохранены. Старый пароль перестанет работать.</p>',
        cancelText: 'Отмена', saveText: 'Сохранить',
        onSave: () => {
          if (activeTab() !== tab || !dom.editor.contains(form)) return false;
          return saveActiveTab(event, password);
        },
      });
      return false;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    showNotice('', '');
    try {
      if (tab.type === 'user') {
        const body = {
          name: tab.draft.name,
          last_name: tab.draft.last_name,
          first_name: tab.draft.first_name,
          patronymic: tab.draft.patronymic,
          phone: tab.draft.phone,
          ...(tab.draft.photo_change === 'replace' ? { photo_base64: tab.photo.data } : {}),
          ...(tab.draft.photo_change === 'remove' ? { photo_remove: true } : {}),
          login: tab.draft.login,
          comment: tab.draft.comment || null,
          role_ids: tab.draft.role_ids,
          store_ids: tab.draft.store_ids,
          ...(tab.isNew ? { temporary_password: tab.draft.temporary_password } : {}),
          ...(!tab.isNew && tab.draft.reset_password ? { reset_password: tab.draft.reset_password, confirm_reset: true } : {}),
        };
        const result = await request(tab.isNew ? '/api/admin/team/users' : `/api/admin/team/users/${tab.id}`, {
          method: tab.isNew ? 'POST' : 'PUT', body: JSON.stringify(body),
        });
        replaceEntity('user', result.user);
        tab.id = Number(result.user.id);
        tab.key = tabKey('user', tab.id);
        tab.title = result.user.name;
        tab.isNew = false;
        tab.meta = clone(result.user);
        tab.draft = normalizeUserDraft(result.user);
        if (Number(result.user.id) === state.actorUserId && typeof window.updateAdminProfilePhoto === 'function') {
          window.updateAdminProfilePhoto(result.user.photo_revision, result.user);
        }
        if (result.user.login?.includes('@')) state.loginSuffix = result.user.login.split('@')[1];
        clearEmployeePhoto(tab);
        if (!tab.documents.summary) tab.documents.loaded = false;
      } else {
        const body = {
          name: tab.draft.name,
          description: tab.draft.description || null,
          start_route: tab.draft.start_route,
          permissions: tab.draft.permissions.filter((grant) => shouldSaveRolePermission(tab, grant)).map((grant) => ({ permission_id: grant.permission_id, access_rule: grant.access_rule })),
        };
        const result = await request(tab.isNew ? '/api/admin/team/roles' : `/api/admin/team/roles/${tab.id}`, {
          method: tab.isNew ? 'POST' : 'PUT', body: JSON.stringify(body),
        });
        replaceEntity('role', result.role);
        tab.id = Number(result.role.id);
        tab.key = tabKey('role', tab.id);
        tab.title = result.role.name;
        tab.isNew = false;
        tab.meta = clone(result.role);
        tab.draft = normalizeRoleDraft(result.role);
        if (typeof window.reloadAdminAccessContext === 'function') {
          await window.reloadAdminAccessContext();
          if (!state.repository?.isCurrent() || !state.tabs.includes(tab)) return true;
        }
      }
      tab.snapshot = clone(tab.draft);
      tab.dirty = false;
      if (state.permissionMode.active) exitPermissionMode({ render: false });
      state.activeKey = tab.key;
      renderList();
      renderTabs();
      renderEditor();
      showNotice('Сохранено.', 'success');
      if (tab.type === 'user' && !tab.documents.loaded) loadDocumentSummary(tab);
      return true;
    } catch (error) {
      showNotice(errorLabel(error.code), 'error');
      if (confirmedPassword !== null) window.AppModal?.setFooterNotice?.(errorLabel(error.code));
      return false;
    } finally {
      const currentSubmit = document.querySelector('#teamActiveForm [type="submit"]');
      if (currentSubmit && canUseServer()) currentSubmit.disabled = false;
    }
  }

  function closeTabNow(key) {
    if (state.permissionMode.active && state.permissionMode.roleKey === key) exitPermissionMode({ render: false });
    const index = state.tabs.findIndex((tab) => tab.key === key);
    if (index < 0) return;
    const wasActive = state.activeKey === key;
    clearEmployeePhoto(state.tabs[index]);
    const closedUserId = state.tabs[index].type === 'user' ? state.tabs[index].id : null;
    state.tabs.splice(index, 1);
    if (closedUserId) syncUserListPhoto(closedUserId);
    if (wasActive) {
      const neighbor = state.tabs[index] || state.tabs[index - 1] || null;
      state.activeKey = neighbor ? neighbor.key : '';
    }
    renderTabs();
    renderEditor();
  }

  function openUnsavedDialog(onLeave) {
    if (state.unsavedDialogOpen || !window.AppModal) return;
    const modal = document.getElementById('appModal');
    state.unsavedDialogOpen = true;
    modal?.classList.add('team-unsaved-modal');
    window.AppModal.open({
      title: 'Несохранённые изменения',
      content: '<div class="team-unsaved-message"><span class="team-unsaved-icon" aria-hidden="true"><i class="fas fa-exclamation"></i></span><p>Изменения не сохранены. Выйти без сохранения?</p></div>',
      cancelText: 'Остаться',
      saveText: 'Выйти',
      closeOnEsc: true,
      closeOnBackdrop: true,
      saveOnCtrlEnter: false,
      onSave: function () {
        onLeave();
        return true;
      },
      onClose: function () {
        state.unsavedDialogOpen = false;
        modal?.classList.remove('team-unsaved-modal');
      },
    });
    window.setTimeout(() => document.getElementById('appModalCancelBtn')?.focus(), 0);
  }

  function requestCloseTab(key) {
    const tab = state.tabs.find((item) => item.key === key);
    if (!tab) return;
    if (tab.key === state.activeKey) {
      readActiveDraft();
      readDocumentDraft();
    }
    if (!tabHasUnsaved(tab)) return closeTabNow(key);
    openUnsavedDialog(() => closeTabNow(key));
  }

  function requestSectionChange(section) {
    const nextSection = section === 'roles' ? 'roles' : 'users';
    if (nextSection === state.section) return;
    readActiveDraft();
    readDocumentDraft();
    const tab = activeTab();
    if (!tabHasUnsaved(tab)) return setSection(nextSection);
    openUnsavedDialog(() => {
      tab.draft = clone(tab.snapshot);
      clearEmployeePhoto(tab);
      tab.dirty = false;
      discardDocumentChanges(tab);
      setSection(nextSection);
      renderTabs();
      renderEditor();
    });
  }

  function interceptInternalNavigation(event) {
    if (state.allowPageLeave || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (state.permissionMode.active && event.target.closest('#app-sidebar [data-nav-key]')) return;
    const logoutButton = event.target.closest('#userMenuLogout');
    const anchor = event.target.closest('a[href]');
    if (!logoutButton && !anchor) return;
    readActiveDraft();
    readDocumentDraft();
    if (!state.tabs.some(tabHasUnsaved)) return;

    let targetUrl = null;
    if (anchor) {
      if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
      targetUrl = new URL(anchor.href, window.location.href);
      if (targetUrl.origin !== window.location.origin || targetUrl.href === window.location.href) return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    openUnsavedDialog(() => {
      state.allowPageLeave = true;
      if (logoutButton && typeof logout === 'function') logout();
      else if (targetUrl) window.location.assign(targetUrl.href);
    });
  }

  function generatePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    for (;;) {
      const bytes = new Uint8Array(64);
      window.crypto.getRandomValues(bytes);
      const password = Array.from(bytes).filter(value => value < Math.floor(256 / alphabet.length) * alphabet.length)
        .slice(0, 18).map(value => alphabet[value % alphabet.length]).join('');
      if (password.length === 18 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) return password;
    }
  }

  async function deleteRole() {
    if (!canUseServer()) return;
    const tab = activeTab();
    if (!tab || tab.type !== 'role' || tab.isNew || !state.capabilities.delete_roles) return;
    const execute = async function () {
      try {
        await request(`/api/admin/team/roles/${tab.id}`, { method: 'DELETE' });
        state.roles = state.roles.filter((role) => Number(role.id) !== Number(tab.id));
        closeTabNow(tab.key);
        renderList();
      } catch (error) {
        showNotice(errorLabel(error.code), 'error');
        return false;
      }
      return true;
    };
    if (window.AppModal) {
      window.AppModal.open({
        title: 'Удалить роль?',
        content: `<p>Роль «${escapeHtml(tab.title)}» будет удалена. Действие доступно только если роль никому не назначена.</p>`,
        cancelText: 'Отмена', saveText: 'Удалить', onSave: execute,
      });
    }
  }

  async function loadBootstrap() {
    const core = window.AdminLocalRepository;
    const context = await window.AdminAccessContextPromise;
    if (!context || !core || !await core.ready() || !core.isActive()) return;
    const repository = core.create({ domain: 'team:employees', version: 1 });
    if (state.bootstrapPending?.namespace === repository.namespace && state.bootstrapPending.repository.isCurrent()) {
      applyConfirmedTeamNavigation();
      return state.bootstrapPending.promise;
    }
    if (state.namespace && state.namespace !== repository.namespace) clearTeamContext();
    state.repository = repository;
    state.namespace = repository.namespace;
    applyConfirmedTeamNavigation();
    const task = loadTeamData(repository);
    state.bootstrapPending = { namespace: repository.namespace, repository, promise: task };
    try { return await task; }
    finally { if (state.bootstrapPending?.promise === task) state.bootstrapPending = null; }
  }

  async function loadTeamData(repository) {
    let revision = state.dataRevision;
    const pageGeneration = state.pageGeneration;
    const isCurrent = () => !state.pageHidden && state.pageGeneration === pageGeneration
      && repository.isCurrent() && state.repository === repository && state.dataRevision === revision;
    if (!state.source && canReadLocalUsers()) {
      try {
        const entry = await repository.getEntry('employees', { allowStale: true });
        if (!isCurrent()) return;
        if (entry) {
          if (entry.data?.formatVersion !== 1) throw new Error('INVALID_EMPLOYEE_SNAPSHOT');
          state.users = employeeSnapshot(entry.data.users);
          state.source = 'local';
          state.lastSyncedAt = entry.lastSyncedAt;
          state.capabilities.view_users = true;
          applyTeamCapabilities();
          renderList();
          renderConnectionStatus();
        }
      } catch (error) {
        if (!isCurrent()) return;
        console.error('TEAM_LOCAL_READ_FAILED:', error.message);
        setConnectionStatus('error', 'Локальные данные недоступны', { detail: 'Не удалось прочитать данные на устройстве. Выполняется загрузка с сервера.' });
      }
    }
    if (!isCurrent()) return;
    if (isAdminOfflineRead()) {
      state.onlineReady = false;
      state.listMessage = state.source ? '' : 'Нет подключения. Сохранённых данных пока нет';
      setConnectionStatus(state.source ? 'offline' : 'idle', state.source ? 'Офлайн · сохранённые данные' : '');
      applyTeamCapabilities(); renderList();
      if (!tabHasUnsaved(activeTab()) || !dom.editor.firstElementChild) renderEditor();
      else suspendEditor();
      return;
    }
    if (!state.source) { state.listMessage = 'Загрузка данных…'; renderList(); }
    const operation = beginStatusOperation(repository, isCurrent);
    try {
      const result = await request('/api/admin/team/bootstrap');
      if (!isCurrent()) return;
      state.users = result.users || [];
      state.fullUserIds = new Set(state.users.map((user) => Number(user.id)));
      state.actorUserId = Number(result.current_user_id || 0);
      state.actorEmail = result.current_user_email || '';
      state.roles = result.roles || [];
      state.stores = result.stores || [];
      state.permissions = result.permissions || [];
      rbacPermissionIds.clear();
      state.permissions.forEach((permission) => {
        if (rbacPermissionKeys.has(permission.key)) rbacPermissionIds.add(Number(permission.id));
      });
      state.startRoutes = result.start_routes || [];
      state.loginSuffix = result.login_suffix || '';
      state.capabilities = result.capabilities || { view_employee_documents: false, manage_employee_documents: false, view_users: false, create_users: false, update_users: false, manage_users: false, view_roles: false, create_roles: false, update_roles: false, delete_roles: false, manage_permissions: false, manage_roles: false, manage_system_roles: false };
      state.source = 'network';
      state.onlineReady = true;
      state.listMessage = '';
      state.dataRevision += 1;
      revision = state.dataRevision;
      // Replace only clean tabs. Never overwrite unsaved online edits during refresh.
      state.tabs.forEach((tab) => {
        if (tab.type !== 'user' || tab.isNew || tabHasUnsaved(tab)) return;
        const user = state.users.find((item) => Number(item.id) === Number(tab.id));
        if (!user) return;
        tab.meta = clone(user);
        tab.title = user.name;
        tab.localOnly = false;
        tab.draft = normalizeUserDraft(user);
        tab.snapshot = clone(tab.draft);
      });
      applyTeamCapabilities();
      renderList();
      renderTabs();
      if (!tabHasUnsaved(activeTab()) || !dom.editor.firstElementChild) renderEditor();
      else resumeEditor();
      setConnectionStatus(navigator.onLine === false ? 'offline' : 'idle', navigator.onLine === false ? 'Офлайн · сохранённые данные' : '');
      await persistEmployeeSnapshot();
    } catch (error) {
      if (!isCurrent()) return;
      state.onlineReady = false;
      state.listMessage = state.source ? '' : 'Не удалось загрузить сотрудников. Сохранённых данных пока нет';
      setConnectionStatus('error', 'Не удалось обновить', { retry: true,
        detail: error.status ? 'Ошибка сервера: HTTP ' + error.status : 'Не удалось связаться с сервером' });
      applyTeamCapabilities(); renderList();
      // Disable controls in place, preserving drafts, focus and form values.
      suspendEditor();
    } finally {
      if (state.statusOperation === operation) setConnectionStatus();
    }
  }

  function clearTeamContext() {
    setConnectionStatus();
    if (window.AppModal?.isOpen?.()) window.AppModal.close();
    if (state.permissionMode.active) exitPermissionMode({ render: false });
    state.tabs.forEach(clearEmployeePhoto);
    state.userPhotos.forEach((photo) => { if (photo.url) URL.revokeObjectURL(photo.url); });
    state.userPhotos.clear();
    state.users = []; state.roles = []; state.stores = []; state.permissions = []; state.startRoutes = [];
    state.tabs = []; state.activeKey = ''; state.fullUserIds.clear();
    Object.keys(state.capabilities).forEach((key) => { state.capabilities[key] = false; });
    state.navigation = { view_users: false, view_roles: false };
    state.actorUserId = 0; state.actorEmail = ''; state.loginSuffix = '';
    state.repository = null; state.namespace = ''; state.source = ''; state.lastSyncedAt = null;
    state.onlineReady = false; state.bootstrapPending = null; state.dataRevision += 1;
    suspendedControls.clear();
    rbacPermissionIds.clear();
    state.listMessage = '';
    dom.list.innerHTML = ''; dom.editor.innerHTML = ''; dom.tabs.innerHTML = '';
    dom.tabsHeader.classList.add('hidden'); dom.create.disabled = true;
    applyTeamCapabilities();
    renderConnectionStatus();
  }

  window.addEventListener('admin:local-context-changed', (event) => {
    if (event.detail?.state === 'active') return;
    setConnectionStatus();
    state.onlineReady = false;
    applyTeamCapabilities();
    if (event.detail?.state === 'revoked') clearTeamContext();
    else {
      // Pending revalidation may preserve drafts, but must not expose old data.
      if (window.AppModal?.isOpen?.()) window.AppModal.close();
      if (state.permissionMode.active) exitPermissionMode({ render: false });
      dom.list.innerHTML = ''; dom.editor.innerHTML = ''; dom.tabs.innerHTML = '';
      dom.create.disabled = true;
    }
  });
  window.addEventListener('admin:access-context', () => { void loadBootstrap(); });
  window.addEventListener('online', () => { void loadBootstrap(); });
  window.addEventListener('offline', () => {
    if (!state.repository?.isCurrent() || state.pageHidden) return;
    state.onlineReady = false;
    state.listMessage = state.source ? '' : 'Нет подключения. Сохранённых данных пока нет';
    setConnectionStatus(state.source ? 'offline' : 'idle', state.source ? 'Офлайн · сохранённые данные' : '');
    applyTeamCapabilities(); renderList();
    suspendEditor();
  });
  statusRetry?.addEventListener('click', () => {
    if (state.repository?.isCurrent() && !state.pageHidden && state.connection.retry) void loadBootstrap();
  });
  window.addEventListener('pagehide', () => { state.pageHidden = true; state.pageGeneration += 1; setConnectionStatus(); });
  window.addEventListener('pageshow', () => { state.pageHidden = false; });

  dom.sectionButtons.forEach((button) => button.addEventListener('click', () => requestSectionChange(button.dataset.teamSection)));
  dom.create.addEventListener('click', openCreateTab);
  dom.userFilters?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-team-user-status]');
    if (!button || button.dataset.teamUserStatus === state.userStatus) return;
    state.userStatus = button.dataset.teamUserStatus;
    renderList();
  });
  dom.list.addEventListener('click', (event) => {
    const statusButton = event.target.closest('[data-team-change-status]');
    if (statusButton) {
      event.stopPropagation();
      if (!statusButton.disabled) requestEmployeeStatusChange(statusButton.dataset.teamChangeStatus, Number(statusButton.dataset.teamUserId));
      return;
    }
    const button = event.target.closest('[data-team-open]');
    if (button) openEntity(button.dataset.teamOpen, Number(button.dataset.teamId));
  });
  dom.tabs.addEventListener('click', (event) => {
    const close = event.target.closest('[data-team-tab-close]');
    if (close) {
      event.stopPropagation();
      requestCloseTab(close.dataset.teamTabClose);
      return;
    }
    const tab = event.target.closest('[data-team-tab]');
    if (tab) {
      readActiveDraft();
      readDocumentDraft();
      if (state.permissionMode.active && state.permissionMode.roleKey !== tab.dataset.teamTab) exitPermissionMode({ render: false });
      state.activeKey = tab.dataset.teamTab;
      renderTabs();
      renderEditor();
    }
  });
  dom.editor.addEventListener('submit', (event) => {
    if (event.target.id === 'teamActiveForm') saveActiveTab(event);
  });
  dom.editor.addEventListener('toggle', (event) => {
    const section = event.target.dataset.teamAssignmentSection;
    const tab = activeTab();
    if (section && tab && dom.editor.contains(event.target)) {
      tab.assignmentSections[section] = event.target.open;
    }
  }, true);
  dom.editor.addEventListener('input', (event) => {
    if (event.target.closest('[data-team-document-editor]')) readDocumentDraft();
    else readActiveDraft();
  });
  dom.editor.addEventListener('change', (event) => {
    if (event.target.matches('[data-team-photo-file]')) { selectEmployeePhoto(event.target.files?.[0]); return; }
    if (event.target.name === 'phone') normalizeEmployeePhoneInput(event.target);
    if (event.target.name === 'start_route_choice') {
      const form = event.target.form;
      form.elements.start_route.value = event.target.value;
      form.querySelector('[data-team-start-route-label]').textContent = routeLabels[event.target.value] || event.target.value;
    }
    if (event.target.name === 'login' && event.target.value.includes('@')) {
      const [local, suffix, extra] = event.target.value.trim().toLowerCase().split('@');
      if (suffix !== state.loginSuffix || extra !== undefined) return showNotice('Нельзя использовать суффикс другой компании.', 'error');
      event.target.value = local;
    }
    if (event.target.closest('[data-team-document-editor]')) {
      readDocumentDraft();
      if (['document_identity_type', 'document_military_status', 'document_education_required_for_position', 'document_employment_is_first_job'].includes(event.target.name)) {
        renderEditor({ documentsOnly: true });
      }
      return;
    }
    readActiveDraft();
  });
  dom.editor.addEventListener('click', (event) => {
    const statusButton = event.target.closest('[data-team-change-status]');
    if (statusButton && !statusButton.disabled) { requestEmployeeStatusChange(statusButton.dataset.teamChangeStatus, Number(statusButton.dataset.teamUserId)); return; }
    if (event.target.closest('[data-team-photo-upload]')) { dom.editor.querySelector('[data-team-photo-file]')?.click(); return; }
    if (event.target.closest('[data-team-photo-remove]')) {
      const tab = activeTab();
      clearEmployeePhoto(tab);
      tab.photo.loaded = true;
      tab.draft.photo_change = 'remove';
      readActiveDraft(); updateEmployeePhotoPreview(tab); return;
    }
    if (event.target.closest('[data-team-generate-login]')) { generateEmployeeLogin(); return; }
    const passwordAction = event.target.closest('[data-team-password-show], [data-team-password-copy]');
    if (passwordAction) {
      const name = passwordAction.dataset.teamPasswordShow || passwordAction.dataset.teamPasswordCopy;
      const input = document.getElementById('teamActiveForm')?.elements[name];
      if (input && passwordAction.hasAttribute('data-team-password-show')) {
        input.type = input.type === 'password' ? 'text' : 'password';
        const visible = input.type === 'text';
        const icon = passwordAction.querySelector('i');
        icon.classList.toggle('fa-eye', !visible);
        icon.classList.toggle('fa-eye-slash', visible);
        const label = visible ? 'Скрыть пароль' : 'Показать пароль';
        passwordAction.title = label;
        passwordAction.setAttribute('aria-label', label);
        passwordAction.setAttribute('aria-pressed', String(visible));
      }
      else if (input) navigator.clipboard.writeText(input.value).then(() => showNotice('Пароль скопирован.')).catch(() => showNotice('Не удалось скопировать пароль.', 'error'));
      return;
    }
    if (event.target.closest('[data-team-permission-mode]')) {
      if (state.permissionMode.active) exitPermissionMode();
      else enterPermissionMode();
      return;
    }
    const documentToggle = event.target.closest('[data-team-document-toggle]');
    if (documentToggle) {
      toggleDocumentSection(documentToggle.dataset.teamDocumentToggle);
      return;
    }
    const documentEdit = event.target.closest('[data-team-document-edit]');
    if (documentEdit) {
      editDocumentSection(documentEdit.dataset.teamDocumentEdit);
      return;
    }
    const documentSave = event.target.closest('[data-team-document-save]');
    if (documentSave) {
      saveDocumentSection(documentSave.dataset.teamDocumentSave);
      return;
    }
    if (event.target.closest('[data-team-document-cancel]')) {
      cancelDocumentEdit();
      return;
    }
    if (event.target.closest('[data-team-generate-password]')) {
      const name = event.target.closest('[data-team-generate-password]').dataset.teamGeneratePassword || 'temporary_password';
      const input = document.getElementById('teamActiveForm')?.elements[name];
      if (input) { input.value = generatePassword(); input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (event.target.closest('[data-team-reset-form]')) {
      const tab = activeTab();
      if (tab) { tab.draft = clone(tab.snapshot); clearEmployeePhoto(tab); tab.dirty = false; renderTabs(); renderEditor(); syncPermissionModeControls(); }
    }
    if (event.target.closest('[data-team-delete-role]')) deleteRole();
    const roleUser = event.target.closest('[data-team-role-user]');
    if (roleUser) openEntity('user', Number(roleUser.dataset.teamRoleUser));
  });

  dom.sidebar?.addEventListener('click', (event) => {
    if (!state.permissionMode.active || event.target.closest('.team-rbac-permission-input')) return;
    const link = event.target.closest('[data-nav-key]');
    if (!link || !dom.sidebar.contains(link)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectPermissionNavigation(link.dataset.navKey).then(() => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      window.__adminSidebarApi?.close?.();
      window.__adminMobilePages?.back?.();
      window.__adminMobilePages?.back?.();
      if (state.permissionMode.active && state.permissionMode.selectedNavKey === link.dataset.navKey
          && permissionTargets(link.dataset.navKey, dom.leftColumn).length === 1) {
        window.__adminMobilePages?.openCenter?.(rbacNodeById.get(state.permissionMode.selectedNodeId)?.label);
      }
    });
  }, true);

  dom.sidebar?.addEventListener('change', (event) => {
    const input = event.target.closest('.team-rbac-permission-input[data-permission-nav-key]');
    if (!state.permissionMode.active || !input) return;
    const tab = activeTab();
    setNodePermissionsEnabled(tab, input.dataset.rbacNodeId, input.checked);
  });

  dom.leftColumn?.addEventListener('click', (event) => {
    if (!state.permissionMode.active) return;
    if (event.target.closest('[data-rbac-return-editor]')) {
      event.preventDefault();
      window.__adminMobilePages?.openRight?.('Роль и права');
      return;
    }
    if (event.target.closest('input, select, option, label.team-rbac-checkbox-label')) return;
    const target = event.target.closest('.team-rbac-left-target');
    if (!target || !dom.leftColumn.contains(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = target.closest('.acc-item');
    const panel = item?.querySelector('[data-acc-panel]');
    if (target.matches('[data-acc-trigger]') && panel) {
      const open = !panel.classList.contains('is-open');
      panel.classList.toggle('is-open', open);
      target.classList.toggle('is-open', open);
      panel.style.maxHeight = open ? `${panel.scrollHeight}px` : '0px';
    }
    renderCenterPermissionActions(target.dataset.rbacNode);
    window.__adminMobilePages?.openCenter?.(rbacNodeById.get(target.dataset.rbacNode)?.label);
  }, true);

  dom.leftColumn?.addEventListener('change', (event) => {
    if (!state.permissionMode.active) return;
    const tab = activeTab();
    const groupInput = event.target.closest('.team-rbac-permission-input[data-rbac-node-id]');
    if (groupInput) {
      setNodePermissionsEnabled(tab, groupInput.dataset.rbacNodeId, groupInput.checked);
    }
  });

  dom.centerColumn?.addEventListener('click', (event) => {
    if (!state.permissionMode.active || !event.target.closest('[data-rbac-return-editor]')) return;
    event.preventDefault();
    window.__adminMobilePages?.openRight?.('Роль и права');
  });

  dom.centerColumn?.addEventListener('change', (event) => {
    if (!state.permissionMode.active) return;
    const tab = activeTab();
    const permissionInput = event.target.closest('[data-rbac-permission-key]');
    if (permissionInput) {
      const actionNode = rbacNodeById.get(permissionInput.dataset.rbacNodeAction);
      if (actionNode?.accessKey === permissionInput.dataset.rbacPermissionKey) {
        setNodePermissionsEnabled(tab, actionNode.id, permissionInput.checked);
      } else {
        setSinglePermissionEnabled(tab, permissionInput.dataset.rbacNodeAction, permissionInput.dataset.rbacPermissionKey, permissionInput.checked);
      }
      return;
    }
    const accessSelect = event.target.closest('[data-rbac-access-rule]');
    if (accessSelect) {
      const grant = permissionGrant(tab, accessSelect.dataset.rbacAccessRule);
      const permission = permissionByKey(accessSelect.dataset.rbacAccessRule);
      if (grant && canManagePermissionGrant(permission, grant) && !tab.meta?.is_owner) {
        grant.access_rule = accessSelect.value;
        updateRoleDirty(tab);
      }
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (state.allowPageLeave || !state.tabs.some(tabHasUnsaved)) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.addEventListener('click', interceptInternalNavigation, true);

  setSection('users');
  loadBootstrap();
})();
