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
    sidebar: document.getElementById('app-sidebar'),
    leftColumn: document.querySelector('.page-col-left'),
  };
  if (!dom.list || !dom.create || !dom.tabs || !dom.editor) return;

  const state = {
    section: 'users',
    users: [],
    roles: [],
    stores: [],
    permissions: [],
    startRoutes: [],
    capabilities: { manage_employee_documents: false, view_users: false, manage_users: false, manage_roles: false },
    tabs: [],
    activeKey: '',
    draftSequence: 0,
    unsavedDialogOpen: false,
    allowPageLeave: false,
    permissionMode: {
      active: false,
      roleKey: '',
      selectedNavKey: '',
      originalLeftNodes: [],
      sidebarVisibility: new Map(),
      sidebarCollapsed: '0',
      loadSequence: 0,
    },
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
      PERMISSION_ESCALATION_FORBIDDEN: 'Нельзя назначить право, которого нет у вашей активной роли.',
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
    };
    if (type === 'user') {
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
    if (state.permissionMode.active) exitPermissionMode({ render: false });
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
    const canCreate = state.section === 'users' ? state.capabilities.manage_users : state.capabilities.manage_roles;
    dom.create.classList.toggle('hidden', !canCreate);
    dom.create.disabled = !canCreate;
    renderList();
  }

  function applyTeamCapabilities() {
    dom.sectionButtons.forEach((button) => {
      const allowed = button.dataset.teamSection === 'roles' ? state.capabilities.manage_roles : state.capabilities.view_users;
      button.classList.toggle('hidden', !allowed);
      button.disabled = !allowed;
    });
    if (state.section === 'users' && !state.capabilities.view_users && state.capabilities.manage_roles) setSection('roles');
    if (state.section === 'roles' && !state.capabilities.manage_roles && state.capabilities.view_users) setSection('users');
    const canCreate = state.section === 'users' ? state.capabilities.manage_users : state.capabilities.manage_roles;
    dom.create.classList.toggle('hidden', !canCreate);
    dom.create.disabled = !canCreate;
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
    if (!state.capabilities.manage_employee_documents) {
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
                  <button class="btn team-document-edit" type="button" data-team-document-edit="${item.key}">Редактировать</button>`}
                ${isEditing ? `<div class="team-document-actions"><button class="btn btn-primary" type="button" data-team-document-save="${item.key}">Сохранить</button><button class="btn" type="button" data-team-document-cancel>Отмена</button></div>` : ''}
              </div>` : ''}
            </article>`;
          }).join('')}
        </div>
      </section>`;
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
          ${renderUserDocuments(tab)}
          ${!tab.isNew ? `<section class="team-form-section"><div class="settings-list-header"><div><div class="settings-list-title">Безопасность</div><div class="settings-list-subtitle">Новый временный пароль потребует смены при входе</div></div></div><div class="team-password-row"><input class="control" type="text" name="reset_password" minlength="6" placeholder="Новый временный пароль" autocomplete="off"><button class="btn" type="button" data-team-reset-password>Сбросить пароль</button></div></section>` : ''}
        </div>
        <div class="team-form-notice hidden"></div>
        <div class="team-editor-footer"><button class="btn btn-primary" type="submit">${tab.isNew ? 'Создать сотрудника' : 'Сохранить'}</button><button class="btn" type="button" data-team-reset-form>Отменить изменения</button></div>
      </form>`;
  }

  function enabledPermissionCount(tab) {
    return tab.draft.permissions.filter((grant) => grant.enabled).length;
  }

  function renderPermissionModeControl(tab) {
    const isActive = state.permissionMode.active && state.permissionMode.roleKey === tab.key;
    const locked = Boolean(tab.meta?.is_owner);
    const unavailable = !state.capabilities.manage_roles;
    return `<div class="team-permission-mode-card ${isActive ? 'is-active' : ''}">
      <div class="team-permission-mode-copy">
        <strong>${isActive ? 'Настройка выполняется в навигации' : 'Настройка прав'}</strong>
        <span>${enabledPermissionCount(tab)} из ${state.permissions.length} прав включено${locked ? ' · роль владельца защищена' : ''}${unavailable ? ' · нет права управления ролями' : ''}</span>
      </div>
      <button class="btn ${isActive ? 'btn-primary' : ''}" type="button" data-team-permission-mode ${unavailable ? 'disabled' : ''}>${isActive ? 'Завершить настройку' : 'Настроить права'}</button>
    </div>`;
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
            <div class="settings-list-header"><div><div class="settings-list-title">Права и доступы</div><div class="settings-list-subtitle">Настройка выполняется на основном сайдбаре и в левой колонке</div></div></div>
            ${renderPermissionModeControl(tab)}
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

  async function loadDocumentSummary(tab) {
    if (!tab || tab.type !== 'user' || tab.isNew || tab.documents.loading || !state.capabilities.manage_employee_documents) return;
    tab.documents.loading = true;
    if (tab.key === state.activeKey) renderEditor();
    try {
      const result = await request(`/api/admin/team/users/${tab.id}/documents`);
      tab.documents.summary = result.summary || null;
      tab.documents.loaded = true;
      tab.documents.error = '';
    } catch (error) {
      tab.documents.error = errorLabel(error.code);
    } finally {
      tab.documents.loading = false;
      if (tab.key === state.activeKey) renderEditor();
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
    renderTabs();
  }

  async function editDocumentSection(section) {
    const tab = activeTab();
    if (!tab || tab.type !== 'user' || tab.isNew || !state.capabilities.manage_employee_documents) return;
    tab.documents.error = '';
    try {
      const result = await request(`/api/admin/team/users/${tab.id}/documents?section=${encodeURIComponent(section)}`);
      tab.documents.openSection = section;
      tab.documents.editingSection = section;
      tab.documents.draft = clone(result.data || {});
      tab.documents.snapshot = clone(result.data || {});
      tab.documents.dirty = false;
      renderEditor();
    } catch (error) {
      tab.documents.error = errorLabel(error.code);
      renderEditor();
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
      renderTabs();
      renderEditor();
    };
    readDocumentDraft();
    if (tab.documents.dirty) return openUnsavedDialog(applyToggle);
    applyToggle();
  }

  function cancelDocumentEdit() {
    const tab = activeTab();
    if (!tab?.documents) return;
    discardDocumentChanges(tab);
    renderTabs();
    renderEditor();
  }

  async function saveDocumentSection(section) {
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
      renderTabs();
      renderEditor();
    } catch (error) {
      tab.documents.error = errorLabel(error.code);
      renderEditor();
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

  function permissionKeysState(tab, keys) {
    const grants = keys.map((key) => permissionGrant(tab, key)).filter(Boolean);
    const enabled = grants.filter((grant) => grant.enabled).length;
    return { checked: grants.length > 0 && enabled === grants.length, indeterminate: enabled > 0 && enabled < grants.length };
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
      if (!permission || !grant || permission.can_manage === false) return;
      grant.enabled = Boolean(enabled);
    });
    updateRoleDirty(tab);
    syncPermissionModeControls();
  }

  function syncPermissionCheckbox(input, tab) {
    const keys = String(input.dataset.permissionKeys || '').split(',').filter(Boolean);
    const toggleKeys = String(input.dataset.permissionToggleKeys || input.dataset.permissionKeys || '').split(',').filter(Boolean);
    const value = permissionKeysState(tab, keys);
    input.checked = value.checked;
    input.indeterminate = value.indeterminate;
    input.disabled = Boolean(tab.meta?.is_owner) || !toggleKeys.some((key) => permissionByKey(key)?.can_manage !== false);
  }

  function syncPermissionModeControls() {
    const tab = activeTab();
    if (!state.permissionMode.active || !tab || tab.key !== state.permissionMode.roleKey) return;
    document.querySelectorAll('.team-rbac-permission-input[data-permission-keys]').forEach((input) => syncPermissionCheckbox(input, tab));
    document.querySelectorAll('[data-rbac-permission-key]').forEach((input) => {
      const permission = permissionByKey(input.dataset.rbacPermissionKey);
      const grant = permissionGrant(tab, input.dataset.rbacPermissionKey);
      input.checked = Boolean(grant?.enabled);
      input.disabled = Boolean(tab.meta?.is_owner) || permission?.can_manage === false;
      const row = input.closest('.team-rbac-action-row');
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

  function exitPermissionMode(options = {}) {
    if (!state.permissionMode.active) return;
    state.permissionMode.loadSequence += 1;
    restorePermissionModeLeftColumn();
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
    state.permissionMode.roleKey = '';
    state.permissionMode.selectedNavKey = '';
    if (options.render !== false) renderEditor();
  }

  function sidebarPermissionKeys(link, toggleOnly = false) {
    const attribute = toggleOnly ? 'permissionToggleKeys' : 'permissionKeys';
    return String(link.dataset[attribute] || '').split(',').filter((key) => permissionByKey(key));
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
      input.dataset.permissionKeys = sidebarPermissionKeys(link).join(',');
      input.dataset.permissionToggleKeys = sidebarPermissionKeys(link, true).join(',');
      input.dataset.permissionNavKey = link.dataset.navKey;
      label.appendChild(input);
      item.insertBefore(row, link);
      row.append(label, link);
      syncPermissionCheckbox(input, tab);
    });
  }

  function permissionTargets(navKey, root) {
    const result = [];
    const add = (node, keys) => {
      if (node && keys.some((key) => permissionByKey(key))) result.push({ node, keys: keys.filter((key) => permissionByKey(key)) });
    };
    if (navKey === 'cash') {
      root.querySelectorAll('[data-cash-section]').forEach((node) => add(node, node.dataset.cashSection === 'expenses'
        ? ['finance.view', 'finance.cost', 'finance.manage'] : ['finance.view', 'finance.manage']));
    } else if (navKey === 'products') {
      root.querySelectorAll('.acc-item').forEach((item, index) => {
        const keys = index === 2 ? ['stock.view', 'stock.edit', 'finance.cost'] : ['products.view', 'products.edit', 'finance.cost'];
        item.querySelectorAll('button').forEach((node) => add(node, keys));
      });
    } else if (navKey === 'clients') {
      root.querySelectorAll('button.stage-item').forEach((node) => add(node, ['clients.view', 'clients.edit']));
    } else if (navKey === 'team') {
      add(root.querySelector('[data-team-section="users"]'), ['users.view', 'users.manage', 'employee_documents.manage']);
      add(root.querySelector('[data-team-section="roles"]'), ['roles.manage']);
    } else if (navKey === 'settings') {
      root.querySelectorAll('[data-settings-section]').forEach((node) => add(node, ['settings.view', 'settings.manage']));
    } else {
      const header = root.querySelector('.panel-header');
      const keys = {
        orders: ['orders.view', 'orders.edit', 'orders.status', 'orders.assign', 'orders.cancel', 'orders.refund'],
        'courier-screen': ['orders.view', 'orders.status'],
        'new-order': ['orders.edit'],
        chat: ['chat.view', 'chat.manage'],
      }[navKey] || [];
      add(header, keys);
    }
    return result;
  }

  function renderLeftPermissionActions(target) {
    const tab = activeTab();
    if (!tab) return;
    dom.leftColumn.querySelectorAll('.team-rbac-action-panel').forEach((panel) => panel.remove());
    dom.leftColumn.querySelectorAll('.is-rbac-selected').forEach((node) => node.classList.remove('is-rbac-selected'));
    target.classList.add('is-rbac-selected');
    const keys = String(target.dataset.rbacPermissionKeys || '').split(',').filter(Boolean);
    const panel = document.createElement('div');
    panel.className = 'team-rbac-action-panel';
    panel.innerHTML = keys.map((key) => {
      const permission = permissionByKey(key);
      const grant = permissionGrant(tab, key);
      if (!permission || !grant) return '';
      const rules = permission.allowed_access_rules || ['all'];
      const disabled = tab.meta?.is_owner || permission.can_manage === false;
      return `<div class="team-rbac-action-row">
        <label><input type="checkbox" data-rbac-permission-key="${escapeHtml(key)}" ${grant.enabled ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${escapeHtml(permission.label)}</span></label>
        ${rules.length > 1 ? `<select class="control" data-rbac-access-rule="${escapeHtml(key)}" ${disabled || !grant.enabled ? 'disabled' : ''}>${rules.map((rule) => `<option value="${escapeHtml(rule)}" ${grant.access_rule === rule ? 'selected' : ''}>${escapeHtml(accessLabels[rule] || rule)}</option>`).join('')}</select>` : ''}
        ${permission.can_manage === false ? '<small>Недоступно: этого права нет у вашей активной роли</small>' : ''}
      </div>`;
    }).join('');
    const holder = target.closest('.team-rbac-left-row') || target;
    holder.insertAdjacentElement('afterend', panel);
    syncPermissionModeControls();
  }

  function decoratePermissionLeftColumn(navKey) {
    const tab = activeTab();
    if (!tab || !dom.leftColumn) return;
    const targets = permissionTargets(navKey, dom.leftColumn);
    targets.forEach(({ node, keys }) => {
      node.classList.add('team-rbac-left-target');
      node.dataset.rbacPermissionKeys = keys.join(',');
      const label = document.createElement('label');
      label.className = 'team-rbac-checkbox-label team-rbac-left-checkbox';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'team-rbac-permission-input';
      input.dataset.permissionKeys = keys.join(',');
      input.dataset.permissionToggleKeys = (keys.filter((key) => key.endsWith('.view')).length
        ? keys.filter((key) => key.endsWith('.view')) : keys.slice(0, 1)).join(',');
      label.appendChild(input);
      if (node.matches('button')) {
        const row = document.createElement('div');
        row.className = 'team-rbac-left-row';
        node.parentNode.insertBefore(row, node);
        row.append(label, node);
      } else {
        node.prepend(label);
      }
      syncPermissionCheckbox(input, tab);
    });
    const returnBar = document.createElement('div');
    returnBar.className = 'team-rbac-mobile-return';
    returnBar.innerHTML = '<button class="btn" type="button" data-rbac-return-editor><i class="fas fa-arrow-left" aria-hidden="true"></i> К карточке роли</button>';
    dom.leftColumn.prepend(returnBar);
    const first = targets[0]?.node;
    if (first) renderLeftPermissionActions(first);
  }

  async function selectPermissionNavigation(navKey) {
    if (!state.permissionMode.active || !dom.leftColumn) return;
    const link = dom.sidebar?.querySelector(`[data-nav-key="${navKey}"]`);
    if (!link) return;
    state.permissionMode.selectedNavKey = navKey;
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
    if (!tab || tab.type !== 'role' || !state.capabilities.manage_roles || !dom.sidebar || !dom.leftColumn) return;
    if (state.permissionMode.active) exitPermissionMode({ render: false });
    state.permissionMode.active = true;
    state.permissionMode.roleKey = tab.key;
    state.permissionMode.originalLeftNodes = Array.from(dom.leftColumn.childNodes);
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
    const documentControls = Array.from(form.querySelectorAll('[data-team-document-editor] input, [data-team-document-editor] select, [data-team-document-editor] textarea'));
    documentControls.forEach((control) => { control.disabled = true; });
    const formIsValid = form.reportValidity();
    documentControls.forEach((control) => { control.disabled = false; });
    if (!formIsValid) return;
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
        if (!tab.documents.summary) tab.documents.loaded = false;
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
      if (state.permissionMode.active) exitPermissionMode({ render: false });
      state.activeKey = tab.key;
      renderList();
      renderTabs();
      renderEditor();
      showNotice('Сохранено.', 'success');
      if (tab.type === 'user' && !tab.documents.loaded) loadDocumentSummary(tab);
    } catch (error) {
      showNotice(errorLabel(error.code), 'error');
    } finally {
      const currentSubmit = document.querySelector('#teamActiveForm [type="submit"]');
      if (currentSubmit) currentSubmit.disabled = false;
    }
  }

  function closeTabNow(key) {
    if (state.permissionMode.active && state.permissionMode.roleKey === key) exitPermissionMode({ render: false });
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
      state.capabilities = result.capabilities || { manage_employee_documents: false, view_users: false, manage_users: false, manage_roles: false };
      applyTeamCapabilities();
      renderList();
    } catch (error) {
      dom.list.innerHTML = `<div class="team-list-state team-list-error">${escapeHtml(errorLabel(error.code))}</div>`;
    }
  }

  dom.sectionButtons.forEach((button) => button.addEventListener('click', () => requestSectionChange(button.dataset.teamSection)));
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
  dom.editor.addEventListener('input', (event) => {
    if (event.target.closest('[data-team-document-editor]')) readDocumentDraft();
    else readActiveDraft();
  });
  dom.editor.addEventListener('change', (event) => {
    if (event.target.closest('[data-team-document-editor]')) {
      readDocumentDraft();
      if (['document_identity_type', 'document_military_status', 'document_education_required_for_position', 'document_employment_is_first_job'].includes(event.target.name)) {
        renderEditor();
      }
      return;
    }
    readActiveDraft();
  });
  dom.editor.addEventListener('click', (event) => {
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
      if (tab) { tab.draft = clone(tab.snapshot); tab.dirty = false; renderTabs(); renderEditor(); syncPermissionModeControls(); }
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
    });
  }, true);

  dom.sidebar?.addEventListener('change', (event) => {
    const input = event.target.closest('.team-rbac-permission-input[data-permission-nav-key]');
    if (!state.permissionMode.active || !input) return;
    const tab = activeTab();
    const link = dom.sidebar.querySelector(`[data-nav-key="${input.dataset.permissionNavKey}"]`);
    setPermissionsEnabled(tab, String(input.dataset.permissionToggleKeys || '').split(',').filter(Boolean), input.checked);
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
    renderLeftPermissionActions(target);
  }, true);

  dom.leftColumn?.addEventListener('change', (event) => {
    if (!state.permissionMode.active) return;
    const tab = activeTab();
    const groupInput = event.target.closest('.team-rbac-permission-input[data-permission-keys]');
    if (groupInput) {
      setPermissionsEnabled(tab, String(groupInput.dataset.permissionToggleKeys || groupInput.dataset.permissionKeys || '').split(',').filter(Boolean), groupInput.checked);
      return;
    }
    const permissionInput = event.target.closest('[data-rbac-permission-key]');
    if (permissionInput) {
      setPermissionsEnabled(tab, [permissionInput.dataset.rbacPermissionKey], permissionInput.checked);
      return;
    }
    const accessSelect = event.target.closest('[data-rbac-access-rule]');
    if (accessSelect) {
      const grant = permissionGrant(tab, accessSelect.dataset.rbacAccessRule);
      const permission = permissionByKey(accessSelect.dataset.rbacAccessRule);
      if (grant && permission?.can_manage !== false && !tab.meta?.is_owner) {
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
