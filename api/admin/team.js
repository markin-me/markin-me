const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getPermissionGrant, revokeUserStreams } = require('../middleware/auth');
const employeeIdentity = require('../helpers/employeeIdentity');

const VALID_ACCESS_RULES = new Set(['all', 'stores', 'own', 'assigned']);
const EMPLOYEE_STATUSES = new Set(['active', 'blocked', 'archived']);
const VALID_START_ROUTES = new Set([
  '/dashboard/cash',
  '/dashboard/products',
  '/dashboard/orders',
  '/dashboard/courier-screen',
  '/dashboard/new-order',
  '/dashboard/clients',
  '/dashboard/chat',
  '/dashboard/team',
  '/dashboard/settings',
]);

const DOCUMENT_SECTIONS = new Set(['identity', 'tax', 'employment', 'military', 'education']);
const IDENTITY_TYPES = new Set(['', 'passport_rf', 'foreign_passport', 'residence_permit', 'temporary_residence', 'other']);
const VERIFICATION_STATUSES = new Set(['unchecked', 'pending', 'verified', 'rejected']);
const EMPLOYMENT_RECORD_TYPES = new Set(['', 'paper', 'electronic', 'first_employment', 'clarification']);
const MILITARY_STATUSES = new Set(['unknown', 'subject', 'not_subject']);

function documentError(code, field) {
  const error = new Error(code);
  error.code = code;
  error.field = field;
  return error;
}

function textValue(value, maxLength, field) {
  const result = String(value == null ? '' : value).trim();
  if (result.length > maxLength) throw documentError('DOCUMENT_FIELD_TOO_LONG', field);
  return result;
}

function normalizeDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function normalizeDate(value, field) {
  const result = textValue(value, 10, field);
  if (!result) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw documentError('INVALID_DOCUMENT_DATE', field);
  const date = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== result) {
    throw documentError('INVALID_DOCUMENT_DATE', field);
  }
  return result;
}

function isValidSnils(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!/^[\d\s-]+$/.test(raw)) return false;
  const digits = normalizeDigits(raw);
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = digits.slice(0, 9).split('').reduce((total, digit, index) => total + Number(digit) * (9 - index), 0);
  let checksum = sum < 100 ? sum : (sum === 100 || sum === 101 ? 0 : sum % 101);
  if (checksum === 100) checksum = 0;
  return Number(digits.slice(9)) === checksum;
}

function isValidInn(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!/^[\d\s-]+$/.test(raw)) return false;
  const digits = normalizeDigits(raw);
  const checksum = (coefficients) => coefficients.reduce((sum, coefficient, index) => sum + coefficient * Number(digits[index]), 0) % 11 % 10;
  if (/^\d{10}$/.test(digits)) return checksum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits[9]);
  if (/^\d{12}$/.test(digits)) {
    return checksum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits[10])
      && checksum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits[11]);
  }
  return false;
}

function emptyEmployeeDocuments() {
  return {
    identity: { type: '', series: '', number: '', issue_date: '', issued_by: '', department_code: '', verification_status: 'unchecked' },
    tax: { snils: '', inn: '' },
    employment: { record_type: '', is_part_time: false, is_first_job: false },
    military: { status: 'unknown', document_type: '', details: '', verification_status: 'unchecked' },
    education: { required_for_position: false, level: '', organization: '', qualification: '', document_name: '', series_number: '', issue_date: '' },
  };
}

function normalizeDocumentSection(section, source) {
  const data = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  if (section === 'identity') {
    const type = textValue(data.type, 40, 'identity.type');
    const verificationStatus = textValue(data.verification_status || 'unchecked', 20, 'identity.verification_status');
    if (!IDENTITY_TYPES.has(type)) throw documentError('INVALID_IDENTITY_TYPE', 'identity.type');
    if (!VERIFICATION_STATUSES.has(verificationStatus)) throw documentError('INVALID_VERIFICATION_STATUS', 'identity.verification_status');
    let series = textValue(data.series, 30, 'identity.series');
    let number = textValue(data.number, 50, 'identity.number');
    let departmentCode = textValue(data.department_code, 20, 'identity.department_code');
    if (type === 'passport_rf') {
      if (series && !/^[\d\s-]+$/.test(series)) throw documentError('INVALID_PASSPORT_SERIES', 'identity.series');
      if (number && !/^[\d\s-]+$/.test(number)) throw documentError('INVALID_PASSPORT_NUMBER', 'identity.number');
      series = normalizeDigits(series);
      number = normalizeDigits(number);
      if (series && !/^\d{4}$/.test(series)) throw documentError('INVALID_PASSPORT_SERIES', 'identity.series');
      if (number && !/^\d{6}$/.test(number)) throw documentError('INVALID_PASSPORT_NUMBER', 'identity.number');
      if (departmentCode) {
        if (!/^[\d\s-]+$/.test(departmentCode)) throw documentError('INVALID_DEPARTMENT_CODE', 'identity.department_code');
        const digits = normalizeDigits(departmentCode);
        if (!/^\d{6}$/.test(digits)) throw documentError('INVALID_DEPARTMENT_CODE', 'identity.department_code');
        departmentCode = `${digits.slice(0, 3)}-${digits.slice(3)}`;
      }
    }
    if (type && !number) throw documentError('IDENTITY_NUMBER_REQUIRED', 'identity.number');
    if (type === 'passport_rf' && !series) throw documentError('PASSPORT_SERIES_REQUIRED', 'identity.series');
    return {
      type,
      series,
      number,
      issue_date: normalizeDate(data.issue_date, 'identity.issue_date'),
      issued_by: textValue(data.issued_by, 500, 'identity.issued_by'),
      department_code: type === 'passport_rf' ? departmentCode : '',
      verification_status: verificationStatus,
    };
  }
  if (section === 'tax') {
    const rawSnils = textValue(data.snils, 30, 'tax.snils');
    const rawInn = textValue(data.inn, 30, 'tax.inn');
    if (rawSnils && !/^[\d\s-]+$/.test(rawSnils)) throw documentError('INVALID_SNILS', 'tax.snils');
    if (rawInn && !/^[\d\s-]+$/.test(rawInn)) throw documentError('INVALID_INN', 'tax.inn');
    const snils = normalizeDigits(rawSnils);
    const inn = normalizeDigits(rawInn);
    if (snils && !isValidSnils(snils)) throw documentError('INVALID_SNILS', 'tax.snils');
    if (inn && !isValidInn(inn)) throw documentError('INVALID_INN', 'tax.inn');
    return { snils, inn };
  }
  if (section === 'employment') {
    const recordType = textValue(data.record_type, 40, 'employment.record_type');
    if (!EMPLOYMENT_RECORD_TYPES.has(recordType)) throw documentError('INVALID_EMPLOYMENT_RECORD_TYPE', 'employment.record_type');
    const firstJob = data.is_first_job === true || data.is_first_job === 'true' || Number(data.is_first_job) === 1;
    return {
      record_type: firstJob ? 'first_employment' : recordType,
      is_part_time: data.is_part_time === true || data.is_part_time === 'true' || Number(data.is_part_time) === 1,
      is_first_job: firstJob,
    };
  }
  if (section === 'military') {
    const status = textValue(data.status || 'unknown', 30, 'military.status');
    const verificationStatus = textValue(data.verification_status || 'unchecked', 20, 'military.verification_status');
    if (!MILITARY_STATUSES.has(status)) throw documentError('INVALID_MILITARY_STATUS', 'military.status');
    if (!VERIFICATION_STATUSES.has(verificationStatus)) throw documentError('INVALID_VERIFICATION_STATUS', 'military.verification_status');
    const documentType = textValue(data.document_type, 120, 'military.document_type');
    if (status === 'subject' && !documentType) throw documentError('MILITARY_DOCUMENT_TYPE_REQUIRED', 'military.document_type');
    return {
      status,
      document_type: status === 'subject' ? documentType : '',
      details: status === 'subject' ? textValue(data.details, 500, 'military.details') : '',
      verification_status: status === 'subject' ? verificationStatus : 'unchecked',
    };
  }
  if (section === 'education') {
    const requiredForPosition = data.required_for_position === true || data.required_for_position === 'true' || Number(data.required_for_position) === 1;
    const result = {
      required_for_position: requiredForPosition,
      level: textValue(data.level, 120, 'education.level'),
      organization: textValue(data.organization, 255, 'education.organization'),
      qualification: textValue(data.qualification, 255, 'education.qualification'),
      document_name: textValue(data.document_name, 120, 'education.document_name'),
      series_number: textValue(data.series_number, 100, 'education.series_number'),
      issue_date: normalizeDate(data.issue_date, 'education.issue_date'),
    };
    if (requiredForPosition && (!result.level || !result.organization || !result.qualification || !result.document_name)) {
      throw documentError('EDUCATION_REQUIRED_FIELDS', 'education');
    }
    return result;
  }
  throw documentError('INVALID_DOCUMENT_SECTION', 'section');
}

function mergeEmployeeDocumentSection(current, section, data) {
  if (!DOCUMENT_SECTIONS.has(section)) throw documentError('INVALID_DOCUMENT_SECTION', 'section');
  const result = { ...emptyEmployeeDocuments(), ...(current || {}) };
  result[section] = normalizeDocumentSection(section, data);
  return result;
}

function encryptionKey() {
  const raw = String(process.env.EMPLOYEE_DOCUMENTS_ENCRYPTION_KEY || '').trim();
  let key = null;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else if (raw) {
    try { key = Buffer.from(raw, 'base64'); } catch (_) { key = null; }
  }
  if (!key || key.length !== 32) throw documentError('DOCUMENT_ENCRYPTION_NOT_CONFIGURED');
  return key;
}

function documentAad(tenantId, userId) {
  return Buffer.from(`employee-documents:v1:${Number(tenantId)}:${Number(userId)}`, 'utf8');
}

function encryptEmployeeDocuments(documents, currentTenantId, userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(documentAad(currentTenantId, userId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(documents), 'utf8'), cipher.final()]);
  return { payload: encrypted.toString('base64'), iv, authTag: cipher.getAuthTag(), keyVersion: 1 };
}

function decryptEmployeeDocuments(row, currentTenantId, userId) {
  if (!row) return emptyEmployeeDocuments();
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(row.encryption_iv));
  decipher.setAAD(documentAad(currentTenantId, userId));
  decipher.setAuthTag(Buffer.from(row.encryption_tag));
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(String(row.encrypted_payload), 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(decoded);
  const result = emptyEmployeeDocuments();
  for (const section of DOCUMENT_SECTIONS) result[section] = normalizeDocumentSection(section, parsed?.[section]);
  return result;
}

function maskRight(value, visible = 2) {
  const text = String(value || '');
  if (!text) return '';
  return `${'•'.repeat(Math.max(4, text.length - visible))}${text.slice(-visible)}`;
}

function verificationLabel(value) {
  return ({ unchecked: 'Не проверен', pending: 'Ожидает проверки', verified: 'Проверен', rejected: 'Проверка отклонена' })[value] || 'Не проверен';
}

function employeeDocumentSummary(documents) {
  const data = { ...emptyEmployeeDocuments(), ...(documents || {}) };
  const identityComplete = Boolean(data.identity.type && data.identity.number && (data.identity.type !== 'passport_rf' || data.identity.series));
  const taxComplete = Boolean(data.tax.snils);
  const employmentComplete = Boolean(data.employment.record_type || data.employment.is_part_time);
  const militaryComplete = data.military.status === 'not_subject' || Boolean(data.military.status === 'subject' && data.military.document_type);
  const educationHasData = Boolean(data.education.level || data.education.organization || data.education.qualification || data.education.document_name);
  const educationComplete = !data.education.required_for_position || Boolean(data.education.level && data.education.organization && data.education.qualification && data.education.document_name);
  return {
    identity: {
      state: identityComplete ? (data.identity.verification_status === 'verified' ? 'verified' : 'review') : 'empty',
      status: identityComplete ? verificationLabel(data.identity.verification_status) : 'Не заполнено',
      lines: identityComplete ? [
        ({ passport_rf: 'Паспорт РФ', foreign_passport: 'Иностранный паспорт', residence_permit: 'Вид на жительство', temporary_residence: 'Разрешение на временное проживание', other: 'Иной документ' })[data.identity.type] || 'Документ',
        [data.identity.series ? maskRight(data.identity.series) : '', maskRight(data.identity.number)].filter(Boolean).join(' · '),
      ] : [],
    },
    tax: {
      state: taxComplete ? 'complete' : 'empty',
      status: taxComplete ? 'Заполнено' : 'Не заполнено',
      lines: [data.tax.snils ? `СНИЛС ${maskRight(data.tax.snils, 2)}` : '', data.tax.inn ? `ИНН ${maskRight(data.tax.inn, 3)}` : ''].filter(Boolean),
    },
    employment: {
      state: data.employment.record_type === 'clarification' ? 'review' : (employmentComplete ? 'complete' : 'empty'),
      status: data.employment.record_type === 'clarification' || !employmentComplete ? 'Требуется уточнение' : 'Заполнено',
      lines: [({ paper: 'Бумажная трудовая книжка', electronic: 'Электронные сведения', first_employment: 'Первое трудоустройство', clarification: 'Требуется уточнение' })[data.employment.record_type] || '', data.employment.is_part_time ? 'Совместительство' : ''].filter(Boolean),
    },
    military: {
      state: militaryComplete ? (data.military.status === 'subject' && data.military.verification_status !== 'verified' ? 'review' : 'complete') : 'empty',
      status: data.military.status === 'not_subject' ? 'Не применяется' : (militaryComplete ? verificationLabel(data.military.verification_status) : 'Статус не определён'),
      lines: [data.military.status === 'subject' ? 'Подлежит воинскому учёту' : '', data.military.document_type].filter(Boolean),
    },
    education: {
      state: educationComplete && educationHasData ? 'complete' : (data.education.required_for_position ? 'empty' : 'optional'),
      status: educationHasData ? 'Заполнено' : (data.education.required_for_position ? 'Требуется для должности' : 'По необходимости'),
      lines: [data.education.level, data.education.qualification, data.education.document_name ? `${data.education.document_name}${data.education.series_number ? ` · ${maskRight(data.education.series_number, 3)}` : ''}` : ''].filter(Boolean),
    },
  };
}

function makeAdminTeamRouter({ db, helpers, requirePermission }) {
  const router = express.Router();

  function tenantId(req) {
    return Number(req.user && req.user.tenantId || 0);
  }

  function uniqueIds(value) {
    return Array.from(new Set((Array.isArray(value) ? value : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)));
  }

  function normalizeStartRoute(value) {
    const route = String(value || '').trim();
    return VALID_START_ROUTES.has(route) ? route : null;
  }

  function teamError(res, status, error, details) {
    return res.status(status).json({ ok: false, error, ...(details ? { details } : {}) });
  }

  function requireAnyPermission(permissionKeys) {
    return async function anyPermissionMiddleware(req, res, next) {
      try {
        if (req.user && req.user.fullAccess === true) return next();
        for (const key of permissionKeys) {
          if (await getPermissionGrant(req.user, key)) return next();
        }
        return teamError(res, 403, 'FORBIDDEN');
      } catch (error) {
        console.error('TEAM_PERMISSION_CHECK_FAILED:', error);
        return teamError(res, 500, 'AUTHORIZATION_ERROR');
      }
    };
  }

  const employeeReadPermissions = [
    'team.employees.read', 'team.employees.create', 'team.employees.update',
    'team.employee_documents.read', 'team.employee_documents.create', 'team.employee_documents.update',
  ];
  const roleReadPermissions = [
    'team.roles.read', 'team.roles.create', 'team.roles.update', 'team.roles.delete', 'team.roles.permissions',
  ];
  const requireTeamBootstrap = requireAnyPermission([...employeeReadPermissions, ...roleReadPermissions]);
  const requireEmployeeRead = requireAnyPermission(employeeReadPermissions);
  const requireRoleRead = requireAnyPermission(roleReadPermissions);

  async function verifyRoleIds(queryable, currentTenantId, roleIds) {
    if (!roleIds.length) return false;
    const [rows] = await queryable.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id=? AND id IN (${roleIds.map(() => '?').join(',')})`,
      [currentTenantId, ...roleIds]
    );
    return rows.length === roleIds.length;
  }

  async function includesOwnerRole(queryable, currentTenantId, roleIds) {
    if (!roleIds.length) return false;
    const [rows] = await queryable.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id=? AND is_owner=1 AND id IN (${roleIds.map(() => '?').join(',')})
       LIMIT 1`,
      [currentTenantId, ...roleIds]
    );
    return rows.length > 0;
  }

  function actorCanAssignOwner(req) {
    return Boolean(req.user?.fullAccess || req.user?.activeRole?.is_owner);
  }

  function canDelegateAccessRule(actorRule, requestedRule) {
    if (actorRule === 'all') return true;
    return actorRule === requestedRule;
  }

  async function loadManageablePermissionIds(queryable, req) {
    if (actorCanAssignOwner(req)) {
      const [rows] = await queryable.query('SELECT id FROM system_permissions');
      return new Map(rows.map((row) => [Number(row.id), 'all']));
    }
    const [rows] = await queryable.query(
      `SELECT rp.permission_id, p.permission_key, rp.access_rule
       FROM role_permissions rp
       JOIN system_permissions p ON p.id=rp.permission_id
       JOIN user_roles ur
         ON ur.tenant_id=rp.tenant_id AND ur.role_id=rp.role_id AND ur.user_id=?
       WHERE rp.tenant_id=? AND rp.role_id=?`,
      [Number(req.user?.userId || 0), Number(req.user?.tenantId || 0), Number(req.user?.activeRoleId || 0)]
    );
    if (!rows.some((row) => row.permission_key === 'team.roles.permissions')) return new Map();
    return new Map(rows.map((row) => [Number(row.permission_id), String(row.access_rule || 'all')]));
  }

  async function actorCanAssignRoles(queryable, req, currentTenantId, roleIds) {
    if (actorCanAssignOwner(req)) return true;
    const manageable = await loadManageablePermissionIds(queryable, req);
    if (!manageable.size) return false;
    const [grants] = await queryable.query(
      `SELECT rp.permission_id, rp.access_rule
       FROM role_permissions rp
       WHERE rp.tenant_id=? AND rp.role_id IN (${roleIds.map(() => '?').join(',')})`,
      [currentTenantId, ...roleIds]
    );
    return grants.every((grant) => {
      const actorRule = manageable.get(Number(grant.permission_id));
      return actorRule && canDelegateAccessRule(actorRule, String(grant.access_rule || 'all'));
    });
  }

  async function verifyStoreIds(queryable, currentTenantId, storeIds) {
    if (!storeIds.length) return true;
    const [rows] = await queryable.query(
      `SELECT id FROM ten_stores
       WHERE tenant_id=? AND id IN (${storeIds.map(() => '?').join(',')})`,
      [currentTenantId, ...storeIds]
    );
    return rows.length === storeIds.length;
  }

  async function actorCanAssignStores(queryable, req, currentTenantId, storeIds) {
    if (actorCanAssignOwner(req) || !storeIds.length) return true;
    const [rows] = await queryable.query(
      `SELECT store_id FROM user_stores
       WHERE tenant_id=? AND user_id=? AND store_id IN (${storeIds.map(() => '?').join(',')})`,
      [currentTenantId, Number(req.user?.userId || 0), ...storeIds]
    );
    return rows.length === storeIds.length;
  }

  async function loadUsers(queryable, currentTenantId, onlyUserId = null) {
    const params = [currentTenantId];
    const userFilter = Number(onlyUserId) > 0 ? ' AND u.id=?' : '';
    if (userFilter) params.push(Number(onlyUserId));
    const [users] = await queryable.query(
      `SELECT u.id, u.name, u.last_name, u.first_name, u.patronymic, u.phone, u.login, u.login_local, u.photo_revision, u.email, u.comment, u.is_active, u.employee_status, u.must_change_password,
              u.last_login_at, u.created_at
       FROM app_users u
       WHERE u.tenant_id=?${userFilter}
       ORDER BY u.is_active DESC, u.name, u.id`,
      params
    );
    if (!users.length) return [];
    const ids = users.map((user) => Number(user.id));
    const placeholders = ids.map(() => '?').join(',');
    const [roles] = await queryable.query(
      `SELECT ur.user_id, r.id, r.name, r.is_owner
       FROM user_roles ur
       JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
       WHERE ur.tenant_id=? AND ur.user_id IN (${placeholders})
       ORDER BY r.is_owner DESC, r.name, r.id`,
      [currentTenantId, ...ids]
    );
    const [stores] = await queryable.query(
      `SELECT us.user_id, s.id, s.name
       FROM user_stores us
       JOIN ten_stores s ON s.tenant_id=us.tenant_id AND s.id=us.store_id
       WHERE us.tenant_id=? AND us.user_id IN (${placeholders})
       ORDER BY s.name, s.id`,
      [currentTenantId, ...ids]
    );
    return users.map((user) => ({
      ...user,
      id: Number(user.id),
      is_active: Number(user.is_active) === 1,
      must_change_password: Number(user.must_change_password) === 1,
      roles: roles.filter((role) => Number(role.user_id) === Number(user.id)).map((role) => ({
        id: Number(role.id), name: role.name, is_owner: Number(role.is_owner) === 1,
      })),
      stores: stores.filter((store) => Number(store.user_id) === Number(user.id)).map((store) => ({
        id: Number(store.id), name: store.name,
      })),
    }));
  }

  async function loadRoles(queryable, currentTenantId, onlyRoleId = null) {
    const params = [currentTenantId];
    const roleFilter = Number(onlyRoleId) > 0 ? ' AND r.id=?' : '';
    if (roleFilter) params.push(Number(onlyRoleId));
    const [roles] = await queryable.query(
      `SELECT r.id, r.name, r.description, r.start_route, r.is_system, r.is_owner, r.system_key,
              COUNT(DISTINCT ur.user_id) AS users_count
       FROM tenant_roles r
       LEFT JOIN user_roles ur ON ur.tenant_id=r.tenant_id AND ur.role_id=r.id
       WHERE r.tenant_id=?${roleFilter}
       GROUP BY r.id
       ORDER BY r.is_owner DESC, r.is_system DESC, r.name, r.id`,
      params
    );
    if (!roles.length) return [];
    const ids = roles.map((role) => Number(role.id));
    const placeholders = ids.map(() => '?').join(',');
    const [permissions] = await queryable.query(
      `SELECT rp.role_id, p.id, p.permission_key, p.group_key, p.label, rp.access_rule
       FROM role_permissions rp
       JOIN system_permissions p ON p.id=rp.permission_id
       WHERE rp.tenant_id=? AND rp.role_id IN (${placeholders})
       ORDER BY p.sort_order, p.id`,
      [currentTenantId, ...ids]
    );
    const [users] = await queryable.query(
      `SELECT ur.role_id, u.id, u.name, u.login, u.is_active
       FROM user_roles ur
       JOIN app_users u ON u.tenant_id=ur.tenant_id AND u.id=ur.user_id
       WHERE ur.tenant_id=? AND ur.role_id IN (${placeholders})
       ORDER BY u.name, u.id`,
      [currentTenantId, ...ids]
    );
    return roles.map((role) => ({
      ...role,
      id: Number(role.id),
      users_count: Number(role.users_count || 0),
      is_system: Number(role.is_system) === 1,
      is_owner: Number(role.is_owner) === 1,
      permissions: permissions.filter((permission) => Number(permission.role_id) === Number(role.id)).map((permission) => ({
        id: Number(permission.id),
        key: permission.permission_key,
        group_key: permission.group_key,
        label: permission.label,
        access_rule: permission.access_rule,
      })),
      users: users.filter((user) => Number(user.role_id) === Number(role.id)).map((user) => ({
        id: Number(user.id), name: user.name, login: user.login, is_active: Number(user.is_active) === 1,
      })),
    }));
  }

  async function replaceUserRelations(conn, currentTenantId, userId, roleIds, storeIds) {
    await conn.query('DELETE FROM user_roles WHERE tenant_id=? AND user_id=?', [currentTenantId, userId]);
    for (const roleId of roleIds) {
      await conn.query(
        'INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES (?, ?, ?)',
        [currentTenantId, userId, roleId]
      );
    }
    await conn.query('DELETE FROM user_stores WHERE tenant_id=? AND user_id=?', [currentTenantId, userId]);
    for (const storeId of storeIds) {
      await conn.query(
        'INSERT INTO user_stores (tenant_id, user_id, store_id) VALUES (?, ?, ?)',
        [currentTenantId, userId, storeId]
      );
    }
  }

  async function wouldRemoveLastOwner(conn, currentTenantId, userId, nextRoleIds, nextActive) {
    const [ownerRoles] = await conn.query(
      'SELECT id FROM tenant_roles WHERE tenant_id=? AND is_owner=1',
      [currentTenantId]
    );
    const ownerIds = new Set(ownerRoles.map((role) => Number(role.id)));
    const retainsOwner = nextActive && nextRoleIds.some((roleId) => ownerIds.has(roleId));
    if (retainsOwner) return false;
    const [rows] = await conn.query(
      `SELECT DISTINCT ur.user_id
       FROM user_roles ur
       JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id AND r.is_owner=1
       JOIN app_users u ON u.tenant_id=ur.tenant_id AND u.id=ur.user_id AND u.is_active=1 AND u.employee_status='active'
       WHERE ur.tenant_id=? AND ur.user_id<>?
       FOR UPDATE`,
      [currentTenantId, userId]
    );
    return rows.length === 0;
  }

  router.get('/bootstrap', requireTeamBootstrap, async (req, res) => {
    try {
      const currentTenantId = tenantId(req);
      const [[loginSettings]] = await db.query('SELECT login_suffix, corporate_logins_enabled FROM ten_tenants WHERE id=?', [currentTenantId]);
      const fullGrant = req.user?.fullAccess === true ? Promise.resolve({ access_rule: 'all' }) : null;
      const [users, roles, storesResult, permissionsResult, documentsGrant, documentsCreateGrant, documentsUpdateGrant, usersViewGrant, usersCreateGrant, usersUpdateGrant, rolesViewGrant, rolesCreateGrant, rolesUpdateGrant, rolesDeleteGrant, rolesPermissionsGrant, manageablePermissionIds] = await Promise.all([
        loadUsers(db, currentTenantId),
        loadRoles(db, currentTenantId),
        db.query('SELECT id, name, is_active FROM ten_stores WHERE tenant_id=? ORDER BY is_active DESC, name, id', [currentTenantId]),
        db.query('SELECT id, permission_key, group_key, label, description, allowed_access_rules FROM system_permissions ORDER BY sort_order, id'),
        fullGrant || getPermissionGrant(req.user, 'team.employee_documents.read'),
        fullGrant || getPermissionGrant(req.user, 'team.employee_documents.create'),
        fullGrant || getPermissionGrant(req.user, 'team.employee_documents.update'),
        fullGrant || getPermissionGrant(req.user, 'team.employees.read'),
        fullGrant || getPermissionGrant(req.user, 'team.employees.create'),
        fullGrant || getPermissionGrant(req.user, 'team.employees.update'),
        fullGrant || getPermissionGrant(req.user, 'team.roles.read'),
        fullGrant || getPermissionGrant(req.user, 'team.roles.create'),
        fullGrant || getPermissionGrant(req.user, 'team.roles.update'),
        fullGrant || getPermissionGrant(req.user, 'team.roles.delete'),
        fullGrant || getPermissionGrant(req.user, 'team.roles.permissions'),
        loadManageablePermissionIds(db, req),
      ]);
      const stores = storesResult[0].map((store) => ({ ...store, id: Number(store.id), is_active: Number(store.is_active) === 1 }));
      const permissions = permissionsResult[0].map((permission) => ({
        id: Number(permission.id),
        key: permission.permission_key,
        group_key: permission.group_key,
        label: permission.label,
        description: permission.description || '',
        allowed_access_rules: String(permission.allowed_access_rules || 'all').split(',').filter(Boolean),
        can_manage: manageablePermissionIds.has(Number(permission.id)),
        max_access_rule: manageablePermissionIds.get(Number(permission.id)) || null,
      }));
      const canViewUsers = Boolean(usersViewGrant || usersCreateGrant || usersUpdateGrant || documentsGrant || documentsCreateGrant || documentsUpdateGrant);
      const canViewRoles = Boolean(rolesViewGrant || rolesCreateGrant || rolesUpdateGrant || rolesDeleteGrant || rolesPermissionsGrant);
      const canManagePermissions = Boolean(rolesPermissionsGrant) && permissions.some((permission) => permission.key === 'team.roles.permissions' && permission.can_manage);
      const visibleRoles = canViewRoles
        ? roles.map((role) => ({ ...role, users: canViewUsers ? role.users : [], users_count: canViewUsers ? role.users_count : 0 }))
        : (usersCreateGrant || usersUpdateGrant ? roles.map((role) => ({ id: role.id, name: role.name, is_owner: role.is_owner })) : []);
      return res.json({
        ok: true,
        login_suffix: loginSettings?.login_suffix || '',
        current_user_id: Number(req.user?.userId || 0),
        current_user_email: req.user?.email || '',
        corporate_logins_enabled: Number(loginSettings?.corporate_logins_enabled) === 1,
        users: canViewUsers ? users : [],
        roles: visibleRoles,
        stores: canViewUsers ? stores : [],
        permissions: canManagePermissions ? permissions : [],
        start_routes: Array.from(VALID_START_ROUTES),
        capabilities: {
          manage_owner_status: actorCanAssignOwner(req),
          reset_password: Boolean(fullGrant || await getPermissionGrant(req.user, 'team.employees.reset_password')),
          read_employee_photo: Boolean(usersViewGrant),
          view_employee_documents: Boolean(documentsGrant),
          manage_employee_documents: Boolean(documentsCreateGrant || documentsUpdateGrant),
          view_users: canViewUsers,
          create_users: Boolean(usersCreateGrant),
          update_users: Boolean(usersUpdateGrant),
          manage_users: Boolean(usersCreateGrant || usersUpdateGrant),
          view_roles: canViewRoles,
          create_roles: Boolean(rolesCreateGrant && rolesPermissionsGrant),
          update_roles: Boolean(rolesUpdateGrant && rolesPermissionsGrant),
          delete_roles: Boolean(rolesDeleteGrant),
          manage_permissions: canManagePermissions,
          manage_roles: Boolean(rolesUpdateGrant) && canManagePermissions,
          manage_system_roles: actorCanAssignOwner(req),
        },
      });
    } catch (error) {
      console.error('TEAM_BOOTSTRAP_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  router.get('/users/:id', requireEmployeeRead, async (req, res) => {
    try {
      const users = await loadUsers(db, tenantId(req), Number(req.params.id));
      if (!users.length) return teamError(res, 404, 'USER_NOT_FOUND');
      return res.json({ ok: true, user: users[0] });
    } catch (error) {
      console.error('TEAM_USER_READ_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  async function loadDocumentRow(queryable, currentTenantId, userId) {
    const [rows] = await queryable.query(
      `SELECT encrypted_payload, encryption_iv, encryption_tag, encryption_key_version, updated_at
       FROM employee_document_profiles
       WHERE tenant_id=? AND user_id=? LIMIT 1`,
      [currentTenantId, userId]
    );
    return rows[0] || null;
  }

  router.get('/users/:id/documents', requirePermission('team.employee_documents.read'), async (req, res) => {
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      if (!(userId > 0)) return teamError(res, 400, 'INVALID_USER');
      const [users] = await db.query(
        'SELECT id FROM app_users WHERE tenant_id=? AND id=? LIMIT 1',
        [currentTenantId, userId]
      );
      if (!users.length) return teamError(res, 404, 'USER_NOT_FOUND');
      const row = await loadDocumentRow(db, currentTenantId, userId);
      const documents = decryptEmployeeDocuments(row, currentTenantId, userId);
      const requestedSection = String(req.query.section || '').trim();
      if (requestedSection) {
        if (!DOCUMENT_SECTIONS.has(requestedSection)) return teamError(res, 400, 'INVALID_DOCUMENT_SECTION');
        return res.json({ ok: true, section: requestedSection, data: documents[requestedSection] });
      }
      return res.json({
        ok: true,
        summary: employeeDocumentSummary(documents),
        updated_at: row?.updated_at || null,
      });
    } catch (error) {
      if (error.code === 'DOCUMENT_ENCRYPTION_NOT_CONFIGURED') return teamError(res, 503, error.code);
      console.error('TEAM_DOCUMENTS_READ_FAILED:', error.code || error.name || 'ERROR');
      return teamError(res, 500, 'DOCUMENTS_READ_FAILED');
    }
  });

  router.put('/users/:id/documents', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      const section = String(req.body?.section || '').trim();
      if (!(userId > 0)) return teamError(res, 400, 'INVALID_USER');
      if (!DOCUMENT_SECTIONS.has(section)) return teamError(res, 400, 'INVALID_DOCUMENT_SECTION');

      await conn.beginTransaction();
      const [users] = await conn.query(
        'SELECT id FROM app_users WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE',
        [currentTenantId, userId]
      );
      if (!users.length) {
        await conn.rollback();
        return teamError(res, 404, 'USER_NOT_FOUND');
      }
      const row = await loadDocumentRow(conn, currentTenantId, userId);
      const documentPermission = row ? 'team.employee_documents.update' : 'team.employee_documents.create';
      if (!req.user?.fullAccess && !await getPermissionGrant(req.user, documentPermission)) {
        await conn.rollback();
        return teamError(res, 403, 'FORBIDDEN');
      }
      const current = decryptEmployeeDocuments(row, currentTenantId, userId);
      const documents = mergeEmployeeDocumentSection(current, section, req.body?.data);
      const encrypted = encryptEmployeeDocuments(documents, currentTenantId, userId);
      await conn.query(
        `INSERT INTO employee_document_profiles
          (tenant_id, user_id, encrypted_payload, encryption_iv, encryption_tag, encryption_key_version, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           encrypted_payload=VALUES(encrypted_payload), encryption_iv=VALUES(encryption_iv),
           encryption_tag=VALUES(encryption_tag), encryption_key_version=VALUES(encryption_key_version),
           updated_by_user_id=VALUES(updated_by_user_id), updated_at=CURRENT_TIMESTAMP`,
        [currentTenantId, userId, encrypted.payload, encrypted.iv, encrypted.authTag, encrypted.keyVersion, Number(req.user?.userId || 0) || null]
      );
      await conn.commit();
      return res.json({ ok: true, summary: employeeDocumentSummary(documents) });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (String(error.code || '').startsWith('INVALID_')
          || ['IDENTITY_NUMBER_REQUIRED', 'PASSPORT_SERIES_REQUIRED', 'MILITARY_DOCUMENT_TYPE_REQUIRED', 'EDUCATION_REQUIRED_FIELDS', 'DOCUMENT_FIELD_TOO_LONG'].includes(error.code)) {
        return teamError(res, 400, error.code, error.field ? { field: error.field } : null);
      }
      if (error.code === 'DOCUMENT_ENCRYPTION_NOT_CONFIGURED') return teamError(res, 503, error.code);
      console.error('TEAM_DOCUMENTS_UPDATE_FAILED:', error.code || error.name || 'ERROR');
      return teamError(res, 500, 'DOCUMENTS_UPDATE_FAILED');
    } finally {
      conn.release();
    }
  });

  router.get('/login-suggestion', requireAnyPermission(['team.employees.create', 'team.employees.update']), async (req, res) => {
    try {
      return res.json({ ok: true, ...await employeeIdentity.generateAvailableLogin(db, tenantId(req), req.query.surname, Number(req.query.user_id || 0)) });
    } catch (error) {
      return teamError(res, error.name === 'EmployeeIdentityError' ? 400 : 500, error.name === 'EmployeeIdentityError' ? error.code : 'DB_ERROR');
    }
  });

  router.get('/users/:id/photo', requirePermission('team.employees.read'), async (req, res) => {
    try {
      if (!(Number(req.params.id) > 0)) return teamError(res, 400, 'INVALID_USER');
      const [rows] = await db.query('SELECT employee_photo FROM app_users WHERE tenant_id=? AND id=?', [tenantId(req), Number(req.params.id)]);
      if (!rows[0]?.employee_photo) return teamError(res, 404, 'PHOTO_NOT_FOUND');
      res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
      return res.send(rows[0].employee_photo);
    } catch { return teamError(res, 500, 'DB_ERROR'); }
  });

  router.put('/users/:id/status', requirePermission('team.employees.update'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      const nextStatus = req.body.status;
      if (!(userId > 0) || !EMPLOYEE_STATUSES.has(nextStatus) || !EMPLOYEE_STATUSES.has(req.body.expected_status)) return teamError(res, 400, 'INVALID_EMPLOYEE_STATUS');
      if (req.body.confirmed !== true) return teamError(res, 400, 'EMPLOYEE_STATUS_CONFIRMATION_REQUIRED');
      await conn.beginTransaction();
      await employeeIdentity.lockLoginTenant(conn, currentTenantId);
      const [rows] = await conn.query(`SELECT u.id, u.email, u.employee_status,
        (u.role='owner' OR EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id AND r.is_owner=1 WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)) AS is_owner
        FROM app_users u WHERE u.tenant_id=? AND u.id=? LIMIT 1 FOR UPDATE`, [currentTenantId, userId]);
      if (!rows.length) { await conn.rollback(); return teamError(res, 404, 'USER_NOT_FOUND'); }
      const user = rows[0];
      if (user.employee_status !== req.body.expected_status) { await conn.rollback(); return teamError(res, 409, 'EMPLOYEE_STATUS_CHANGED'); }
      if (nextStatus === user.employee_status || (user.employee_status === 'archived' && nextStatus !== 'active')) {
        await conn.rollback(); return teamError(res, 400, 'INVALID_EMPLOYEE_STATUS');
      }
      const isSelf = Number(req.user?.userId) === userId
        || (req.user?.fullAccess && user.email && String(user.email).toLowerCase() === String(req.user.email || '').toLowerCase());
      if (nextStatus !== 'active' && isSelf) { await conn.rollback(); return teamError(res, 403, 'SELF_STATUS_CHANGE_FORBIDDEN'); }
      if (Number(user.is_owner) === 1 && !actorCanAssignOwner(req)) { await conn.rollback(); return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN'); }
      if (nextStatus !== 'active' && Number(user.is_owner) === 1 && await wouldRemoveLastOwner(conn, currentTenantId, userId, [], false)) {
        await conn.rollback(); return teamError(res, 409, 'LAST_OWNER_REQUIRED');
      }
      if (nextStatus === 'active') {
        const [assignedRoles] = await conn.query('SELECT role_id FROM user_roles WHERE tenant_id=? AND user_id=?', [currentTenantId, userId]);
        const roleIds = uniqueIds(assignedRoles.map((role) => role.role_id));
        if (!roleIds.length || !await verifyRoleIds(conn, currentTenantId, roleIds)) { await conn.rollback(); return teamError(res, 409, 'EMPLOYEE_ROLES_INVALID'); }
        if (!await actorCanAssignRoles(conn, req, currentTenantId, roleIds)) { await conn.rollback(); return teamError(res, 403, 'ROLE_ESCALATION_FORBIDDEN'); }
        const [assignedStores] = await conn.query('SELECT store_id FROM user_stores WHERE tenant_id=? AND user_id=?', [currentTenantId, userId]);
        if (!await actorCanAssignStores(conn, req, currentTenantId, uniqueIds(assignedStores.map((store) => store.store_id)))) {
          await conn.rollback(); return teamError(res, 403, 'STORE_ESCALATION_FORBIDDEN');
        }
      }
      if (nextStatus === 'archived') {
        const [orders] = await conn.query(`SELECT o.id FROM order_orders o
          LEFT JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
          WHERE o.tenant_id=? AND o.assigned_user_id=? AND o.is_active=1 AND COALESCE(s.is_final,0)=0
            AND LOWER(COALESCE(s.code,'')) NOT IN ('canceled','cancelled') LIMIT 1 FOR UPDATE`, [currentTenantId, userId]);
        if (orders.length) { await conn.rollback(); return teamError(res, 409, 'EMPLOYEE_HAS_OPEN_ORDERS'); }
      }
      await conn.query('UPDATE app_users SET employee_status=?, is_active=?, auth_version=auth_version+1 WHERE tenant_id=? AND id=?', [nextStatus, nextStatus === 'active' ? 1 : 0, currentTenantId, userId]);
      const users = await loadUsers(conn, currentTenantId, userId);
      await conn.commit();
      revokeUserStreams(currentTenantId, userId);
      return res.json({ ok: true, user: users[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      console.error('TEAM_EMPLOYEE_STATUS_FAILED:', error.code || error.name);
      return teamError(res, 500, 'DB_ERROR');
    } finally { conn.release(); }
  });

  router.post('/users', requirePermission('team.employees.create'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      if (!employeeIdentity.secureTransport(req)) return teamError(res, 426, 'HTTPS_REQUIRED');
      const profile = employeeIdentity.employeeProfile(req.body);
      const password = employeeIdentity.validatePassword(req.body.temporary_password);
      const photo = req.body.photo_base64 ? await employeeIdentity.encodeEmployeePhoto(req.body.photo_base64) : null;
      const comment = helpers.strOrNull(req.body.comment);
      const roleIds = uniqueIds(req.body.role_ids);
      const storeIds = uniqueIds(req.body.store_ids);
      const isActive = req.body.is_active === false || Number(req.body.is_active) === 0 ? 0 : 1;
      if (!roleIds.length) return teamError(res, 400, 'ROLE_REQUIRED');

      await conn.beginTransaction();
      const loginTenant = await employeeIdentity.lockLoginTenant(conn, currentTenantId);
      const { login, local } = employeeIdentity.normalizeCorporateLogin(req.body.login, loginTenant.login_suffix);
      if (!await verifyRoleIds(conn, currentTenantId, roleIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_ROLE');
      }
      if (await includesOwnerRole(conn, currentTenantId, roleIds) && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (!await actorCanAssignRoles(conn, req, currentTenantId, roleIds)) {
        await conn.rollback();
        return teamError(res, 403, 'ROLE_ESCALATION_FORBIDDEN');
      }
      if (!await verifyStoreIds(conn, currentTenantId, storeIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_STORE');
      }
      if (!await actorCanAssignStores(conn, req, currentTenantId, storeIds)) {
        await conn.rollback();
        return teamError(res, 403, 'STORE_ESCALATION_FORBIDDEN');
      }
      const [existing] = await conn.query(
        'SELECT id FROM app_users WHERE tenant_id=? AND login_local=? LIMIT 1',
        [currentTenantId, local]
      );
      if (existing.length) {
        await conn.rollback();
        return teamError(res, 409, 'LOGIN_EXISTS');
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [result] = await conn.query(
        `INSERT INTO app_users
          (tenant_id, login, login_local, email, password_hash, must_change_password, name, last_name, first_name, patronymic, phone, employee_photo, photo_revision, comment, role, is_active, employee_status)
         VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'manager', ?, ?)`,
        [currentTenantId, login, local, passwordHash, profile.name, profile.last_name, profile.first_name, profile.patronymic, profile.phone, photo, photo ? crypto.randomBytes(16).toString('hex') : null, comment, isActive, isActive ? 'active' : 'blocked']
      );
      const userId = Number(result.insertId);
      await replaceUserRelations(conn, currentTenantId, userId, roleIds, storeIds);
      await conn.commit();
      const users = await loadUsers(db, currentTenantId, userId);
      return res.status(201).json({ ok: true, user: users[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'LOGIN_EXISTS');
      if (error.name === 'EmployeeIdentityError') return teamError(res, 400, error.code);
      console.error('TEAM_USER_CREATE_FAILED:', error.code || error.name);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.put('/users/:id', requirePermission('team.employees.update'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      const comment = helpers.strOrNull(req.body.comment);
      const roleIds = uniqueIds(req.body.role_ids);
      const storeIds = uniqueIds(req.body.store_ids);
      const requestedIsActive = req.body.is_active === undefined ? null : (req.body.is_active === false || Number(req.body.is_active) === 0 ? 0 : 1);
      if (!(userId > 0)) return teamError(res, 400, 'INVALID_USER');
      if (!roleIds.length) return teamError(res, 400, 'ROLE_REQUIRED');
      const passwordProvided = req.body.reset_password !== undefined && req.body.reset_password !== '';
      let password;
      if (passwordProvided) {
        if (!req.user?.fullAccess && !await getPermissionGrant(req.user, 'team.employees.reset_password')) {
          return teamError(res, 403, 'FORBIDDEN');
        }
        if (!employeeIdentity.secureTransport(req)) return teamError(res, 426, 'HTTPS_REQUIRED');
        if (req.body.confirm_reset !== true) return teamError(res, 400, 'PASSWORD_RESET_CONFIRMATION_REQUIRED');
        password = employeeIdentity.validatePassword(req.body.reset_password);
      }

      await conn.beginTransaction();
      const loginTenant = await employeeIdentity.lockLoginTenant(conn, currentTenantId);
      const [existingUsers] = await conn.query(
        `SELECT u.id, u.email, u.name, u.last_name, u.first_name, u.patronymic, u.phone, u.is_active, u.employee_status,
                EXISTS(
                  SELECT 1 FROM user_roles ur
                  JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
                  WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1
                ) AS is_owner
         FROM app_users u
         WHERE u.tenant_id=? AND u.id=? LIMIT 1 FOR UPDATE`,
        [currentTenantId, userId]
      );
      if (!existingUsers.length) {
        await conn.rollback();
        return teamError(res, 404, 'USER_NOT_FOUND');
      }
      const isActive = Number(existingUsers[0].is_active);
      if ((requestedIsActive !== null && requestedIsActive !== isActive)
          || (req.body.employee_status !== undefined && req.body.employee_status !== existingUsers[0].employee_status)) {
        await conn.rollback(); return teamError(res, 409, 'EMPLOYEE_STATUS_ACTION_REQUIRED');
      }
      if (Number(existingUsers[0].is_owner) === 1 && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (!await verifyRoleIds(conn, currentTenantId, roleIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_ROLE');
      }
      if (await includesOwnerRole(conn, currentTenantId, roleIds) && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (!await actorCanAssignRoles(conn, req, currentTenantId, roleIds)) {
        await conn.rollback();
        return teamError(res, 403, 'ROLE_ESCALATION_FORBIDDEN');
      }
      const profile = employeeIdentity.employeeProfile(req.body, existingUsers[0]);
      const normalized = req.body.login ? employeeIdentity.normalizeCorporateLogin(req.body.login, loginTenant.login_suffix) : null;
      const login = normalized?.login;
      const local = normalized?.local || null;
      const photoProvided = req.body.photo_base64 !== undefined || req.body.photo_remove === true;
      if (req.body.photo_base64 && req.body.photo_remove === true) throw employeeIdentity.invalid('INVALID_EMPLOYEE_PHOTO');
      const photo = req.body.photo_base64 ? await employeeIdentity.encodeEmployeePhoto(req.body.photo_base64) : null;
      if (!login && (!existingUsers[0].email || Number(existingUsers[0].is_owner) !== 1)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_LOGIN');
      }
      if (!await verifyStoreIds(conn, currentTenantId, storeIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_STORE');
      }
      if (!await actorCanAssignStores(conn, req, currentTenantId, storeIds)) {
        await conn.rollback();
        return teamError(res, 403, 'STORE_ESCALATION_FORBIDDEN');
      }
      if (await wouldRemoveLastOwner(conn, currentTenantId, userId, roleIds, isActive === 1)) {
        await conn.rollback();
        return teamError(res, 409, 'LAST_OWNER_REQUIRED');
      }
      const [loginOwner] = login ? await conn.query(
        'SELECT id FROM app_users WHERE tenant_id=? AND login_local=? AND id<>? LIMIT 1',
        [currentTenantId, local, userId]
      ) : [[]];
      if (loginOwner.length) {
        await conn.rollback();
        return teamError(res, 409, 'LOGIN_EXISTS');
      }
      await conn.query(
        `UPDATE app_users SET name=?, last_name=?, first_name=?, patronymic=?, phone=?, login=?, login_local=?, comment=?, is_active=?,
         employee_photo=IF(?, ?, employee_photo), photo_revision=IF(?, ?, photo_revision)
         WHERE tenant_id=? AND id=?`,
        [profile.name, profile.last_name, profile.first_name, profile.patronymic, profile.phone, login || null, local, comment, isActive, photoProvided, photo, photoProvided, photo ? crypto.randomBytes(16).toString('hex') : null, currentTenantId, userId]
      );
      if (passwordProvided) {
        const passwordHash = await bcrypt.hash(password, 10);
        await conn.query('UPDATE app_users SET password_hash=?, must_change_password=0 WHERE tenant_id=? AND id=?', [passwordHash, currentTenantId, userId]);
      }
      await replaceUserRelations(conn, currentTenantId, userId, roleIds, storeIds);
      await conn.commit();
      const users = await loadUsers(db, currentTenantId, userId);
      return res.json({ ok: true, user: users[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'LOGIN_EXISTS');
      if (error.name === 'EmployeeIdentityError') return teamError(res, 400, error.code);
      console.error('TEAM_USER_UPDATE_FAILED:', error.code || error.name);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.post('/users/:id/reset-password', requirePermission('team.employees.reset_password'), async (req, res) => {
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      if (!employeeIdentity.secureTransport(req)) return teamError(res, 426, 'HTTPS_REQUIRED');
      if (req.body.confirm_reset !== true) return teamError(res, 400, 'PASSWORD_RESET_CONFIRMATION_REQUIRED');
      const password = employeeIdentity.validatePassword(req.body.temporary_password);
      if (!(userId > 0)) return teamError(res, 400, 'INVALID_USER');
      const [users] = await db.query(
        `SELECT u.id,
                EXISTS(
                  SELECT 1 FROM user_roles ur
                  JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
                  WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1
                ) AS is_owner
         FROM app_users u
         WHERE u.tenant_id=? AND u.id=? LIMIT 1`,
        [currentTenantId, userId]
      );
      if (!users.length) return teamError(res, 404, 'USER_NOT_FOUND');
      if (Number(users[0].is_owner) === 1 && !actorCanAssignOwner(req)) {
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        `UPDATE app_users SET password_hash=?, must_change_password=0
         WHERE tenant_id=? AND id=?`,
        [passwordHash, currentTenantId, userId]
      );
      if (!result.affectedRows) return teamError(res, 404, 'USER_NOT_FOUND');
      return res.json({ ok: true });
    } catch (error) {
      if (error.name === 'EmployeeIdentityError') return teamError(res, 400, error.code);
      console.error('TEAM_PASSWORD_RESET_FAILED:', error.code || error.name);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  router.get('/roles/:id', requireRoleRead, async (req, res) => {
    try {
      const roles = await loadRoles(db, tenantId(req), Number(req.params.id));
      if (!roles.length) return teamError(res, 404, 'ROLE_NOT_FOUND');
      return res.json({ ok: true, role: roles[0] });
    } catch (error) {
      console.error('TEAM_ROLE_READ_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  async function replaceRolePermissions(conn, currentTenantId, roleId, grants, req) {
    const normalized = Array.isArray(grants) ? grants : [];
    const permissionIds = uniqueIds(normalized.map((grant) => grant.permission_id));
    const [allPermissions] = await conn.query('SELECT id, allowed_access_rules FROM system_permissions');
    const byId = new Map(allPermissions.map((row) => [Number(row.id), row]));
    if (permissionIds.some((permissionId) => !byId.has(permissionId))) {
      return { ok: false, error: 'INVALID_PERMISSION' };
    }
    const manageablePermissionIds = await loadManageablePermissionIds(conn, req);
    const [existingRows] = await conn.query(
      'SELECT permission_id, access_rule FROM role_permissions WHERE tenant_id=? AND role_id=?',
      [currentTenantId, roleId]
    );
    const existingById = new Map(existingRows.map((row) => [Number(row.permission_id), String(row.access_rule || 'all')]));
    for (const grant of normalized) {
      const permissionId = Number(grant.permission_id);
      const accessRule = String(grant.access_rule || 'all');
      const allowed = String(byId.get(permissionId).allowed_access_rules || 'all').split(',');
      if (!VALID_ACCESS_RULES.has(accessRule) || !allowed.includes(accessRule)) {
        return { ok: false, error: 'INVALID_ACCESS_RULE' };
      }
      const actorAccessRule = manageablePermissionIds.get(permissionId);
      if (actorAccessRule && !canDelegateAccessRule(actorAccessRule, accessRule)) {
        if (!existingById.has(permissionId) || existingById.get(permissionId) !== accessRule) {
          return { ok: false, error: 'ACCESS_RULE_ESCALATION_FORBIDDEN' };
        }
      }
      if (!manageablePermissionIds.has(permissionId)
          && (!existingById.has(permissionId) || existingById.get(permissionId) !== accessRule)) {
        return { ok: false, error: 'PERMISSION_ESCALATION_FORBIDDEN' };
      }
    }
    const manageableIds = Array.from(manageablePermissionIds.entries())
      .filter(([permissionId, actorAccessRule]) => (
        !existingById.has(permissionId)
        || canDelegateAccessRule(actorAccessRule, existingById.get(permissionId))
      ))
      .map(([permissionId]) => permissionId);
    const manageableIdSet = new Set(manageableIds);
    if (manageableIds.length) {
      await conn.query(
        `DELETE FROM role_permissions
         WHERE tenant_id=? AND role_id=? AND permission_id IN (${manageableIds.map(() => '?').join(',')})`,
        [currentTenantId, roleId, ...manageableIds]
      );
    }
    for (const permissionId of permissionIds) {
      if (!manageableIdSet.has(permissionId)) continue;
      const grant = normalized.find((item) => Number(item.permission_id) === permissionId);
      await conn.query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, access_rule)
         VALUES (?, ?, ?, ?)`,
        [currentTenantId, roleId, permissionId, String(grant.access_rule || 'all')]
      );
    }
    return { ok: true };
  }

  router.post('/roles', requirePermission('team.roles.create'), requirePermission('team.roles.permissions'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const name = helpers.strOrNull(req.body.name);
      const description = helpers.strOrNull(req.body.description);
      const startRoute = normalizeStartRoute(req.body.start_route);
      if (!name) return teamError(res, 400, 'NAME_REQUIRED');
      if (name.length > 100) return teamError(res, 400, 'NAME_TOO_LONG');
      if (description && description.length > 255) return teamError(res, 400, 'DESCRIPTION_TOO_LONG');
      if (!startRoute) return teamError(res, 400, 'INVALID_START_ROUTE');
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO tenant_roles
          (tenant_id, name, description, start_route, is_system, is_owner, system_key)
         VALUES (?, ?, ?, ?, 0, 0, NULL)`,
        [currentTenantId, name, description, startRoute]
      );
      const roleId = Number(result.insertId);
      const permissionsResult = await replaceRolePermissions(conn, currentTenantId, roleId, req.body.permissions, req);
      if (!permissionsResult.ok) {
        await conn.rollback();
        return teamError(res, permissionsResult.error.endsWith('_ESCALATION_FORBIDDEN') ? 403 : 400, permissionsResult.error);
      }
      await conn.commit();
      const roles = await loadRoles(db, currentTenantId, roleId);
      return res.status(201).json({ ok: true, role: roles[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'ROLE_NAME_EXISTS');
      console.error('TEAM_ROLE_CREATE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.put('/roles/:id', requirePermission('team.roles.update'), requirePermission('team.roles.permissions'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const roleId = Number(req.params.id);
      const name = helpers.strOrNull(req.body.name);
      const description = helpers.strOrNull(req.body.description);
      const startRoute = normalizeStartRoute(req.body.start_route);
      if (!(roleId > 0)) return teamError(res, 400, 'INVALID_ROLE');
      if (!name) return teamError(res, 400, 'NAME_REQUIRED');
      if (name.length > 100) return teamError(res, 400, 'NAME_TOO_LONG');
      if (description && description.length > 255) return teamError(res, 400, 'DESCRIPTION_TOO_LONG');
      if (!startRoute) return teamError(res, 400, 'INVALID_START_ROUTE');
      await conn.beginTransaction();
      const [roles] = await conn.query(
        'SELECT id, is_system, is_owner FROM tenant_roles WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE',
        [currentTenantId, roleId]
      );
      if (!roles.length) {
        await conn.rollback();
        return teamError(res, 404, 'ROLE_NOT_FOUND');
      }
      if (Number(roles[0].is_owner) === 1 && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (Number(roles[0].is_system) === 1 && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'SYSTEM_ROLE_PROTECTED');
      }
      await conn.query(
        `UPDATE tenant_roles SET name=?, description=?, start_route=?
         WHERE tenant_id=? AND id=?`,
        [name, description, startRoute, currentTenantId, roleId]
      );
      const permissionsResult = await replaceRolePermissions(conn, currentTenantId, roleId, req.body.permissions, req);
      if (!permissionsResult.ok) {
        await conn.rollback();
        return teamError(res, permissionsResult.error.endsWith('_ESCALATION_FORBIDDEN') ? 403 : 400, permissionsResult.error);
      }
      if (Number(roles[0].is_owner) === 1) {
        const [permissionCount] = await conn.query(
          'SELECT COUNT(*) AS total FROM system_permissions'
        );
        const [rolePermissionCount] = await conn.query(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN access_rule<>'all' THEN 1 ELSE 0 END) AS restricted
           FROM role_permissions WHERE tenant_id=? AND role_id=?`,
          [currentTenantId, roleId]
        );
        if (Number(rolePermissionCount[0].total) !== Number(permissionCount[0].total)
            || Number(rolePermissionCount[0].restricted || 0) > 0) {
          await conn.rollback();
          return teamError(res, 409, 'OWNER_REQUIRES_FULL_ACCESS');
        }
      }
      await conn.commit();
      const updated = await loadRoles(db, currentTenantId, roleId);
      return res.json({ ok: true, role: updated[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'ROLE_NAME_EXISTS');
      console.error('TEAM_ROLE_UPDATE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.delete('/roles/:id', requirePermission('team.roles.delete'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const roleId = Number(req.params.id);
      await conn.beginTransaction();
      const [roles] = await conn.query(
        `SELECT id, is_system, is_owner FROM tenant_roles
         WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE`,
        [currentTenantId, roleId]
      );
      const role = roles[0];
      if (!role) {
        await conn.rollback();
        return teamError(res, 404, 'ROLE_NOT_FOUND');
      }
      if (Number(role.is_system) === 1 || Number(role.is_owner) === 1) {
        await conn.rollback();
        return teamError(res, 409, 'SYSTEM_ROLE_PROTECTED');
      }
      const [assigned] = await conn.query(
        'SELECT COUNT(*) AS total FROM user_roles WHERE tenant_id=? AND role_id=?',
        [currentTenantId, roleId]
      );
      if (Number(assigned[0].total) > 0) {
        await conn.rollback();
        return teamError(res, 409, 'ROLE_HAS_USERS');
      }
      await conn.query('DELETE FROM tenant_roles WHERE tenant_id=? AND id=?', [currentTenantId, roleId]);
      await conn.commit();
      return res.json({ ok: true });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      console.error('TEAM_ROLE_DELETE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  return router;
}

module.exports = makeAdminTeamRouter;
module.exports._test = {
  emptyEmployeeDocuments,
  normalizeDocumentSection,
  mergeEmployeeDocumentSection,
  isValidSnils,
  isValidInn,
  encryptEmployeeDocuments,
  decryptEmployeeDocuments,
  employeeDocumentSummary,
};
