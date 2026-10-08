(function () {
  'use strict';

  if (!document.body || document.body.dataset.adminActivePage !== 'team') return;

  const dom = {
    list: document.getElementById('teamEntityList'),
    create: document.getElementById('teamCreateBtn'),
    title: document.getElementById('teamCenterTitle'),
    icon: document.getElementById('teamCenterIcon'),
    tabs: document.getElementById('teamTabs'),
    tabsHeader: document.getElementById('teamTabsHeader'),
    editor: document.getElementById('teamEditorBody'),
    sectionButtons: Array.from(document.querySelectorAll('[data-team-section]')),
  };
  if (!dom.list || !dom.create || !dom.tabs || !dom.editor) return;

  const state = {
    section: 'users',
    users: [],
    roles: [],
    stores: [],
    permissions: [],
    startRoutes: [],
    tabs: [],
    activeKey: '',
    draftSequence: 0,
  };

  const groupLabels = {
    orders: 'Заказы',
    clients: 'Клиенты',
    products: 'Товары',
    stock: 'Склад',
    finance: 'Финансы',
    team: 'Команда',
    settings: 'Настройки',
    billing: 'Биллинг',
  };
  const accessLabels = {
    all: 'Все',
    stores: 'Только выбранные филиалы',
    own: 'Только свои',
    assigned: 'Только назначенные',
  };
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

  function showNotice(text, kind) {
    let notice = dom.editor.querySelector('.team-form-notice');
    if (!notice) return;
    notice.textContent = text || '';
    notice.classList.toggle('hidden', !text);
    notice.classList.toggle('is-error', kind === 'error');
    notice.classList.toggle('is-success', kind === 'success');
  }

  function errorLabel(error) {
    return ({
      LOGIN_EXISTS: 'Этот логин уже занят внутри компании.',
      ROLE_NAME_EXISTS: 'Роль с таким названием уже существует.',
      LAST_OWNER_REQUIRED: 'Нельзя оставить компанию без активного владельца.',
      OWNER_REQUIRES_FULL_ACCESS: 'Для роли владельца должны быть включены все права.',
      OWNER_ROLE_FORBIDDEN: 'Назначать роль владельца может только владелец компании.',
      SYSTEM_ROLE_PROTECTED: 'Системную роль удалить нельзя.',
      ROLE_HAS_USERS: 'Сначала снимите эту роль со всех сотрудников.',
      INVALID_LOGIN: 'Логин: 3–64 символа, латинские буквы, цифры, точка, дефис или подчёркивание.',
      PASSWORD_TOO_SHORT: 'Пароль должен содержать минимум 6 символов.',
      ROLE_REQUIRED: 'Назначьте сотруднику хотя бы одну роль.',
      INVALID_START_ROUTE: 'Выберите стартовый раздел.',
      FORBIDDEN: 'Недостаточно прав для этого действия.',
    })[error] || 'Не удалось выполнить действие.';
  }

  async function request(url, options) {
    const response = await authFetch(url, options || {});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `HTTP_${response.status}`);
      error.code = payload.error || 'REQUEST_FAILED';
      throw error;
    }
    return payload;
  }

  function normalizeUserDraft(user) {
    return {
      name: user?.name || '',
      login: user?.login || '',
      email: user?.email || '',
      comment: user?.comment || '',
      is_active: user ? Boolean(user.is_active) : true,
      role_ids: Array.isArray(user?.roles) ? user.roles.map((role) => Number(role.id)) : [],
      store_ids: Array.isArray(user?.stores) ? user.stores.map((store) => Number(store.id)) : [],
      temporary_password: '',
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
    return {
      key: tabKey(type, id),
      type,
      id: isNew ? null : Number(entity.id),
      title,
      isNew,
      dirty: false,
      draft,
      snapshot: clone(draft),
      meta: entity ? clone(entity) : null,
    };
  }

  function openEntity(type, id) {
    const key = tabKey(type, Number(id));
    const existing = state.tabs.find((tab) => tab.key === key);
    if (existing) {
      state.activeKey = key;
      renderTabs();
      renderEditor();
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
  }

  function openCreateTab() {
    const type = state.section === 'users' ? 'user' : 'role';
    const tab = makeTab(type, null);
    state.tabs.push(tab);
    state.activeKey = tab.key;
    renderTabs();
    renderEditor();
  }

  function renderTabs() {
    dom.tabsHeader.classList.toggle('hidden', state.tabs.length === 0);
    dom.tabs.innerHTML = state.tabs.map((tab) => `
      <div class="product-tab ${tab.key === state.activeKey ? 'is-active' : ''}" role="tab"
        data-team-tab="${escapeHtml(tab.key)}" aria-selected="${tab.key === state.activeKey ? 'true' : 'false'}"
        title="${escapeHtml(tab.title)}">
        <span class="product-tab-title">${escapeHtml(tab.title)}${tab.dirty ? ' •' : ''}</span>
        <button class="product-tab-close" type="button" data-team-tab-close="${escapeHtml(tab.key)}" aria-label="Закрыть вкладку">&times;</button>
      </div>
    `).join('');
    const selected = dom.tabs.querySelector('.product-tab.is-active');
    if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function setSection(section) {
    state.section = section === 'roles' ? 'roles' : 'users';
    dom.sectionButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.teamSection === state.section));
    dom.title.textContent = state.section === 'users' ? 'Сотрудники' : 'Роли и права';
    dom.icon.className = state.section === 'users' ? 'fas fa-users' : 'fas fa-user-shield';
    dom.create.title = state.section === 'users' ? 'Создать сотрудника' : 'Создать роль';
    dom.create.setAttribute('aria-label', dom.create.title);
    renderList();
  }

  function renderList() {
    const rows = state.section === 'users' ? state.users : state.roles;
    if (!rows.length) {
      dom.list.innerHTML = `<div class="team-list-state muted">${state.section === 'users' ? 'Сотрудников пока нет.' : 'Ролей пока нет.'}</div>`;
      return;
    }
    dom.list.innerHTML = rows.map((item) => {
      if (state.section === 'users') {
        const roles = (item.roles || []).map((role) => role.name).join(', ') || 'Роли не назначены';
        return `
          <button class="order-row team-entity-row" type="button" data-team-open="user" data-team-id="${Number(item.id)}">
            <div class="product-avatar"><i class="fas fa-user"></i></div>
            <div class="order-col team-entity-copy">
              <div class="product-title">${escapeHtml(item.name || 'Без имени')}</div>
              <div class="muted">${escapeHtml(item.login || item.email || 'Без логина')} · ${escapeHtml(roles)}</div>
            </div>
            <div class="order-col"><span class="badge ${item.is_active ? '' : 'is-muted'}">${item.is_active ? 'Активен' : 'Заблокирован'}</span></div>
          </button>`;
      }
      return `
        <button class="order-row team-entity-row" type="button" data-team-open="role" data-team-id="${Number(item.id)}">
          <div class="product-avatar"><i class="fas fa-user-shield"></i></div>
          <div class="order-col team-entity-copy">
            <div class="product-title">${escapeHtml(item.name)}</div>
            <div class="muted">${Number(item.users_count || 0)} сотрудников · ${Number(item.permissions?.length || 0)} прав</div>
          </div>
          <div class="order-col">${item.is_system ? '<span class="badge">Системная</span>' : '<span class="badge">Своя</span>'}</div>
        </button>`;
    }).join('');
  }

  function checkboxList(items, selectedIds, name, icon) {
    const selected = new Set((selectedIds || []).map(Number));
    return items.map((item) => `
      <label class="team-choice-row">
        <input type="checkbox" name="${name}" value="${Number(item.id)}" ${selected.has(Number(item.id)) ? 'checked' : ''}>
        <span class="team-choice-icon"><i class="fas ${icon}"></i></span>
        <span class="team-choice-copy"><strong>${escapeHtml(item.name)}</strong>${item.description ? `<small>${escapeHtml(item.description)}</small>` : ''}</span>
      </label>
    `).join('');
  }

  function renderUserEditor(tab) {
    const draft = tab.draft;
    const loginRequired = tab.isNew || !draft.email || Boolean(draft.login);
    return `
      <form class="team-editor-form" id="teamActiveForm" autocomplete="off">
        <div class="team-editor-scroll no-scrollbar">
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Основная информация</div><div class="settings-list-subtitle">Учётная запись сотрудника</div></div></div>
            <div class="settings-site-field"><label class="field-label">ИМЯ</label><input class="control" name="name" value="${escapeHtml(draft.name)}" required></div>
            <div class="settings-site-field"><label class="field-label">ЛОГИН</label><input class="control" name="login" value="${escapeHtml(draft.login)}" ${loginRequired ? 'required' : ''} autocomplete="off" autocapitalize="off" spellcheck="false"><div class="field-hint">Уникален внутри компании. Для повторяющихся логинов при входе указывается компания.</div></div>
            ${tab.isNew ? `<div class="settings-site-field"><label class="field-label">ВРЕМЕННЫЙ ПАРОЛЬ</label><div class="team-password-row"><input class="control" type="text" name="temporary_password" value="${escapeHtml(draft.temporary_password)}" required minlength="6" autocomplete="off"><button class="btn" type="button" data-team-generate-password>Сгенерировать</button></div><div class="field-hint">После первого входа сотрудник обязан заменить пароль.</div></div>` : ''}
            <label class="switch"><input class="switch-input" type="checkbox" name="is_active" ${draft.is_active ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span class="switch-text">Активен</span></label>
            <div class="settings-site-field"><label class="field-label">КОММЕНТАРИЙ</label><textarea class="control team-textarea" name="comment" rows="3">${escapeHtml(draft.comment)}</textarea></div>
          </section>
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Роли и доступ</div><div class="settings-list-subtitle">В рабочей сессии активна только одна роль</div></div></div>
            <div class="team-choice-grid">${checkboxList(state.roles, draft.role_ids, 'role_ids', 'fa-user-shield')}</div>
            <div class="settings-list-header team-subsection-title"><div><div class="settings-list-title">Филиалы</div></div></div>
            <div class="team-choice-grid">${checkboxList(state.stores, draft.store_ids, 'store_ids', 'fa-store')}</div>
          </section>
          ${!tab.isNew ? `<section class="team-form-section"><div class="settings-list-header"><div><div class="settings-list-title">Безопасность</div><div class="settings-list-subtitle">Новый временный пароль потребует смены при входе</div></div></div><div class="team-password-row"><input class="control" type="text" name="reset_password" minlength="6" placeholder="Новый временный пароль" autocomplete="off"><button class="btn" type="button" data-team-reset-password>Сбросить пароль</button></div></section>` : ''}
        </div>
        <div class="team-form-notice hidden"></div>
        <div class="team-editor-footer"><button class="btn btn-primary" type="submit">${tab.isNew ? 'Создать сотрудника' : 'Сохранить'}</button><button class="btn" type="button" data-team-reset-form>Отменить изменения</button></div>
      </form>`;
  }

  function renderPermissionGroups(tab) {
    const grantById = new Map(tab.draft.permissions.map((grant) => [Number(grant.permission_id), grant]));
    const groups = state.permissions.reduce((result, permission) => {
      if (!result[permission.group_key]) result[permission.group_key] = [];
      result[permission.group_key].push(permission);
      return result;
    }, {});
    return Object.keys(groups).map((groupKey) => `
      <div class="team-permission-group">
        <div class="team-permission-group-title">${escapeHtml(groupLabels[groupKey] || groupKey)}</div>
        ${groups[groupKey].map((permission) => {
          const grant = grantById.get(Number(permission.id)) || { enabled: false, access_rule: 'all' };
          const rules = permission.allowed_access_rules || ['all'];
          return `<div class="team-permission-row" data-permission-id="${Number(permission.id)}">
            <label class="switch team-permission-switch"><input class="switch-input" type="checkbox" name="permission_enabled" value="${Number(permission.id)}" ${grant.enabled ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span class="switch-text">${escapeHtml(permission.label)}</span></label>
            ${rules.length > 1 ? `<select class="control team-access-select" name="permission_rule_${Number(permission.id)}" ${grant.enabled ? '' : 'disabled'}>${rules.map((rule) => `<option value="${escapeHtml(rule)}" ${grant.access_rule === rule ? 'selected' : ''}>${escapeHtml(accessLabels[rule] || rule)}</option>`).join('')}</select>` : `<input type="hidden" name="permission_rule_${Number(permission.id)}" value="all">`}
          </div>`;
        }).join('')}
      </div>`).join('');
  }

  function renderRoleEditor(tab) {
    const draft = tab.draft;
    const roleUsers = tab.meta?.users || [];
    const selectedRouteLabel = routeLabels[draft.start_route] || draft.start_route;
    return `
      <form class="team-editor-form" id="teamActiveForm" autocomplete="off">
        <div class="team-editor-scroll no-scrollbar">
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Основная информация</div><div class="settings-list-subtitle">Название не используется в проверках доступа</div></div></div>
            <div class="settings-site-field"><label class="field-label">НАЗВАНИЕ</label><input class="control" name="name" value="${escapeHtml(draft.name)}" required></div>
            <div class="settings-site-field"><label class="field-label">ОПИСАНИЕ</label><textarea class="control team-textarea" name="description" rows="3">${escapeHtml(draft.description)}</textarea></div>
            <div class="settings-site-field">
              <label class="field-label">СТАРТОВЫЙ РАЗДЕЛ</label>
              <div class="custom-select team-start-route-select" data-team-start-route-select>
                <input type="hidden" name="start_route" value="${escapeHtml(draft.start_route)}">
                <button class="custom-select-trigger control" type="button" data-team-start-route-toggle aria-haspopup="listbox" aria-expanded="false">
                  <span class="custom-select-value">${escapeHtml(selectedRouteLabel)}</span>
                  <i class="fas fa-chevron-down custom-select-arrow" aria-hidden="true"></i>
                </button>
                <div class="custom-select-dropdown team-start-route-dropdown hidden" role="listbox">
                  ${state.startRoutes.map((route) => `<button class="custom-select-option ${draft.start_route === route ? 'is-selected' : ''}" type="button" role="option" aria-selected="${draft.start_route === route ? 'true' : 'false'}" data-team-start-route-option="${escapeHtml(route)}">${escapeHtml(routeLabels[route] || route)}</button>`).join('')}
                </div>
              </div>
            </div>
          </section>
          <section class="team-form-section">
            <div class="settings-list-header"><div><div class="settings-list-title">Права и доступы</div><div class="settings-list-subtitle">Технические ключи скрыты; ограничения применяются сервером</div></div></div>
            <div class="team-permissions">${renderPermissionGroups(tab)}</div>
          </section>
          ${!tab.isNew ? `<section class="team-form-section"><div class="settings-list-header"><div><div class="settings-list-title">Сотрудники с этой ролью</div></div></div><div class="team-role-users">${roleUsers.length ? roleUsers.map((user) => `<button type="button" class="team-role-user" data-team-role-user="${Number(user.id)}"><i class="fas fa-user"></i><span>${escapeHtml(user.name || user.login || 'Сотрудник')}</span></button>`).join('') : '<div class="muted">Роль пока никому не назначена.</div>'}</div></section>` : ''}
        </div>
        <div class="team-form-notice hidden"></div>
        <div class="team-editor-footer"><button class="btn btn-primary" type="submit">${tab.isNew ? 'Создать роль' : 'Сохранить'}</button><button class="btn" type="button" data-team-reset-form>Отменить изменения</button>${!tab.isNew && !tab.meta?.is_system ? '<button class="btn team-delete-btn" type="button" data-team-delete-role>Удалить роль</button>' : ''}</div>
      </form>`;
  }

  function renderEditor() {
    const tab = activeTab();
    if (!tab) {
      dom.editor.innerHTML = '<div class="info-card team-empty-state"><div class="info-title">Выберите сотрудника или роль</div><div class="info-text">Открытые карточки появятся здесь отдельными рабочими вкладками.</div></div>';
      return;
    }
    dom.editor.innerHTML = tab.type === 'user' ? renderUserEditor(tab) : renderRoleEditor(tab);
  }

  function readActiveDraft() {
    const tab = activeTab();
    const form = document.getElementById('teamActiveForm');
    if (!tab || !form) return;
    if (tab.type === 'user') {
      tab.draft = {
        ...tab.draft,
        name: form.elements.name.value.trim(),
        login: form.elements.login.value.trim(),
        comment: form.elements.comment.value.trim(),
        is_active: Boolean(form.elements.is_active.checked),
        temporary_password: form.elements.temporary_password?.value || '',
        role_ids: Array.from(form.querySelectorAll('input[name="role_ids"]:checked')).map((input) => Number(input.value)),
        store_ids: Array.from(form.querySelectorAll('input[name="store_ids"]:checked')).map((input) => Number(input.value)),
      };
    } else {
      tab.draft = {
        ...tab.draft,
        name: form.elements.name.value.trim(),
        description: form.elements.description.value.trim(),
        start_route: form.elements.start_route.value,
        permissions: state.permissions.map((permission) => ({
          permission_id: Number(permission.id),
          enabled: Boolean(form.querySelector(`input[name="permission_enabled"][value="${Number(permission.id)}"]`)?.checked),
          access_rule: form.elements[`permission_rule_${Number(permission.id)}`]?.value || 'all',
        })),
      };
    }
    tab.dirty = JSON.stringify(tab.draft) !== JSON.stringify(tab.snapshot);
    renderTabs();
  }

  function replaceEntity(type, entity) {
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
  }

  async function saveActiveTab(event) {
    event.preventDefault();
    readActiveDraft();
    const tab = activeTab();
    if (!tab) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    showNotice('', '');
    try {
      if (tab.type === 'user') {
        const body = {
          name: tab.draft.name,
          login: tab.draft.login,
          comment: tab.draft.comment || null,
          is_active: tab.draft.is_active,
          role_ids: tab.draft.role_ids,
          store_ids: tab.draft.store_ids,
          ...(tab.isNew ? { temporary_password: tab.draft.temporary_password } : {}),
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
      } else {
        const body = {
          name: tab.draft.name,
          description: tab.draft.description || null,
          start_route: tab.draft.start_route,
          permissions: tab.draft.permissions.filter((grant) => grant.enabled).map((grant) => ({ permission_id: grant.permission_id, access_rule: grant.access_rule })),
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
      }
      tab.snapshot = clone(tab.draft);
      tab.dirty = false;
      state.activeKey = tab.key;
      renderList();
      renderTabs();
      renderEditor();
      showNotice('Сохранено.', 'success');
    } catch (error) {
      showNotice(errorLabel(error.code), 'error');
    } finally {
      const currentSubmit = document.querySelector('#teamActiveForm [type="submit"]');
      if (currentSubmit) currentSubmit.disabled = false;
    }
  }

  function closeTabNow(key) {
    const index = state.tabs.findIndex((tab) => tab.key === key);
    if (index < 0) return;
    const wasActive = state.activeKey === key;
    state.tabs.splice(index, 1);
    if (wasActive) {
      const neighbor = state.tabs[index] || state.tabs[index - 1] || null;
      state.activeKey = neighbor ? neighbor.key : '';
    }
    renderTabs();
    renderEditor();
  }

  function requestCloseTab(key) {
    const tab = state.tabs.find((item) => item.key === key);
    if (!tab) return;
    if (!tab.dirty) return closeTabNow(key);
    if (window.AppModal) {
      window.AppModal.open({
        title: 'Закрыть вкладку?',
        content: '<p>Есть несохранённые изменения. После закрытия они будут потеряны.</p>',
        cancelText: 'Остаться',
        saveText: 'Закрыть без сохранения',
        onSave: function () { closeTabNow(key); return true; },
      });
      return;
    }
    if (window.confirm('Есть несохранённые изменения. Закрыть вкладку?')) closeTabNow(key);
  }

  function generatePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint32Array(12);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  }

  async function resetPassword() {
    const tab = activeTab();
    const form = document.getElementById('teamActiveForm');
    const input = form?.elements.reset_password;
    if (!tab || tab.type !== 'user' || tab.isNew || !input) return;
    const password = input.value;
    if (password.length < 6) {
      input.focus();
      return showNotice('Введите временный пароль минимум из 6 символов.', 'error');
    }
    try {
      await request(`/api/admin/team/users/${tab.id}/reset-password`, { method: 'POST', body: JSON.stringify({ temporary_password: password }) });
      input.value = '';
      showNotice('Временный пароль установлен. При следующем входе сотрудник должен его сменить.', 'success');
    } catch (error) {
      showNotice(errorLabel(error.code), 'error');
    }
  }

  async function deleteRole() {
    const tab = activeTab();
    if (!tab || tab.type !== 'role' || tab.isNew) return;
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
    try {
      const result = await request('/api/admin/team/bootstrap');
      state.users = result.users || [];
      state.roles = result.roles || [];
      state.stores = result.stores || [];
      state.permissions = result.permissions || [];
      state.startRoutes = result.start_routes || [];
      renderList();
    } catch (error) {
      dom.list.innerHTML = `<div class="team-list-state team-list-error">${escapeHtml(errorLabel(error.code))}</div>`;
    }
  }

  dom.sectionButtons.forEach((button) => button.addEventListener('click', () => setSection(button.dataset.teamSection)));
  dom.create.addEventListener('click', openCreateTab);
  dom.list.addEventListener('click', (event) => {
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
      state.activeKey = tab.dataset.teamTab;
      renderTabs();
      renderEditor();
    }
  });
  dom.editor.addEventListener('submit', (event) => {
    if (event.target.id === 'teamActiveForm') saveActiveTab(event);
  });
  dom.editor.addEventListener('input', readActiveDraft);
  dom.editor.addEventListener('change', (event) => {
    if (event.target.name === 'permission_enabled') {
      const row = event.target.closest('[data-permission-id]');
      const select = row?.querySelector('.team-access-select');
      if (select) select.disabled = !event.target.checked;
    }
    readActiveDraft();
  });
  dom.editor.addEventListener('click', (event) => {
    const routeOption = event.target.closest('[data-team-start-route-option]');
    if (routeOption) {
      const select = routeOption.closest('[data-team-start-route-select]');
      const input = select?.querySelector('input[name="start_route"]');
      const value = select?.querySelector('.custom-select-value');
      const dropdown = select?.querySelector('.team-start-route-dropdown');
      const toggle = select?.querySelector('[data-team-start-route-toggle]');
      const route = routeOption.dataset.teamStartRouteOption;
      if (input) input.value = route;
      if (value) value.textContent = routeLabels[route] || route;
      select?.querySelectorAll('[data-team-start-route-option]').forEach((option) => {
        const selected = option === routeOption;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      select?.classList.remove('is-open');
      dropdown?.classList.add('hidden');
      toggle?.setAttribute('aria-expanded', 'false');
      input?.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const routeToggle = event.target.closest('[data-team-start-route-toggle]');
    if (routeToggle) {
      const select = routeToggle.closest('[data-team-start-route-select]');
      const dropdown = select?.querySelector('.team-start-route-dropdown');
      const willOpen = dropdown?.classList.contains('hidden');
      select?.classList.toggle('is-open', Boolean(willOpen));
      dropdown?.classList.toggle('hidden', !willOpen);
      routeToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }
    const openedRouteSelect = dom.editor.querySelector('[data-team-start-route-select].is-open');
    if (openedRouteSelect) {
      openedRouteSelect.classList.remove('is-open');
      openedRouteSelect.querySelector('.team-start-route-dropdown')?.classList.add('hidden');
      openedRouteSelect.querySelector('[data-team-start-route-toggle]')?.setAttribute('aria-expanded', 'false');
    }
    if (event.target.closest('[data-team-generate-password]')) {
      const input = document.querySelector('#teamActiveForm [name="temporary_password"]');
      if (input) { input.value = generatePassword(); input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    if (event.target.closest('[data-team-reset-password]')) resetPassword();
    if (event.target.closest('[data-team-reset-form]')) {
      const tab = activeTab();
      if (tab) { tab.draft = clone(tab.snapshot); tab.dirty = false; renderTabs(); renderEditor(); }
    }
    if (event.target.closest('[data-team-delete-role]')) deleteRole();
    const roleUser = event.target.closest('[data-team-role-user]');
    if (roleUser) openEntity('user', Number(roleUser.dataset.teamRoleUser));
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.tabs.some((tab) => tab.dirty)) return;
    event.preventDefault();
    event.returnValue = '';
  });

  setSection('users');
  loadBootstrap();
})();
