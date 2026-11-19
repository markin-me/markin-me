'use strict';

const TEMPLATE_DEFINITIONS = Object.freeze([
  { key: 'welcome', title: 'Приветствие', description: 'Обычный /start без параметров', persistent: true, variables: ['store_name', 'site_url', 'mini_app_url'], defaultText: 'Добро пожаловать в {store_name}! Здесь можно открыть магазин, получить помощь и управлять рекламными сообщениями.' },
  { key: 'capabilities', title: 'Что умеет бот', description: 'Описание возможностей клиентского бота', persistent: true, variables: ['store_name', 'site_url', 'mini_app_url'], defaultText: 'Бот {store_name} помогает войти в магазин, открыть каталог и получать выбранные вами уведомления.' },
  { key: 'help', title: 'Помощь', description: 'Инструкция по использованию бота', persistent: true, variables: ['store_name', 'site_url'], defaultText: 'Используйте кнопки ниже. Для входа запускайте сценарий из магазина {site_url}.' },
  { key: 'contact_request', title: 'Запрос контакта', description: 'Сервисная инструкция перед передачей контакта', persistent: false, variables: ['store_name'], defaultText: 'Отправьте только собственный контакт системной кнопкой мессенджера.' },
  { key: 'confirmation_pending', title: 'Ожидание подтверждения', description: 'Сервисное сообщение ожидающего запроса', persistent: false, variables: ['store_name'], defaultText: 'Подтвердите вход в исходной карточке магазина. Если вы не начинали вход, ничего не подтверждайте.' },
  { key: 'link_success', title: 'Успешная привязка', description: 'Сервисное сообщение после привязки аккаунта', persistent: false, variables: ['store_name'], defaultText: 'Мессенджер успешно привязан к учётной записи {store_name}.' },
  { key: 'auth_success', title: 'Успешная авторизация', description: 'Сервисное сообщение после подтверждения входа', persistent: false, variables: ['store_name'], defaultText: 'Авторизация подтверждена. Вернитесь в магазин {store_name}.' },
  { key: 'code_sent', title: 'Отправлен код', description: 'Текст вокруг серверного одноразового кода', persistent: false, variables: ['store_name'], defaultText: 'Код для входа отправлен. Никому его не сообщайте.' },
  { key: 'request_error', title: 'Ошибка', description: 'Безопасное общее сообщение об ошибке', persistent: false, variables: ['store_name'], defaultText: 'Не удалось выполнить запрос. Начните действие заново в магазине.' },
  { key: 'request_expired', title: 'Запрос истёк', description: 'Сервисное сообщение об истёкшем запросе', persistent: false, variables: ['store_name'], defaultText: 'Запрос истёк. Начните вход заново в магазине.' },
]);

const TEMPLATE_BY_KEY = new Map(TEMPLATE_DEFINITIONS.map((item) => [item.key, item]));
const ALLOWED_BUTTON_ACTIONS = new Set(['open_store', 'open_mini_app', 'help', 'capabilities', 'marketing_subscribe', 'marketing_unsubscribe']);
const ALLOWED_VARIABLES = new Set(['store_name', 'site_url', 'mini_app_url']);

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return provider === 'telegram' || provider === 'tg' ? 'tg' : provider === 'max' ? 'max' : '';
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, 4000);
}

function validateTemplateText(text, definition) {
  const normalized = normalizeText(text);
  if (!normalized) return { ok: false, error: 'TEMPLATE_TEXT_REQUIRED' };
  const found = normalized.match(/\{[^{}]+\}/g) || [];
  for (const token of found) {
    const name = token.slice(1, -1);
    if (!ALLOWED_VARIABLES.has(name) || !definition.variables.includes(name)) {
      return { ok: false, error: 'TEMPLATE_VARIABLE_NOT_ALLOWED', variable: name };
    }
  }
  return { ok: true, text: normalized };
}

function normalizeButtons(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const source of value.slice(0, 6)) {
    const action = String(source?.action || '').trim().toLowerCase();
    const text = String(source?.text || '').trim().slice(0, 64);
    if (!text || !ALLOWED_BUTTON_ACTIONS.has(action)) continue;
    result.push({ text, action });
  }
  return result;
}

function renderTemplate(text, variables) {
  return normalizeText(text).replace(/\{(store_name|site_url|mini_app_url)\}/g, (match, key) => {
    return String(variables?.[key] || '').trim();
  });
}

function createServiceTextRenderer(db, tenantId, storeId, provider) {
  let templates;
  let variables;
  return async (key, originalText) => {
    if (!templates) templates = listTemplates(db, tenantId, storeId, provider);
    const template = (await templates).find(item => item.key === key);
    if (!template) throw new Error('BOT_TEMPLATE_KEY_INVALID');
    if (!template.customized) return originalText;
    if (!variables) variables = db.query(
      `SELECT s.name AS store_name,t.site_name,t.name FROM ten_tenants t
       LEFT JOIN ten_stores s ON s.tenant_id=t.id AND s.id=? WHERE t.id=? LIMIT 1`, [storeId, tenantId]
    ).then(([rows]) => ({ store_name: rows[0]?.store_name || rows[0]?.site_name || rows[0]?.name || '' }));
    return renderTemplate(template.text, await variables);
  };
}

async function listTemplates(db, tenantId, storeId, providerValue) {
  const provider = normalizeProvider(providerValue);
  if (!provider) throw Object.assign(new Error('BOT_PROVIDER_INVALID'), { status: 400, code: 'BOT_PROVIDER_INVALID' });
  const [rows] = await db.query(
    `SELECT template_key,text_template,buttons_json,updated_at
       FROM bot_content_templates
      WHERE tenant_id=? AND store_id=? AND provider=?`,
    [tenantId, storeId, provider]
  );
  const saved = new Map((rows || []).map((row) => [String(row.template_key), row]));
  return TEMPLATE_DEFINITIONS.map((definition) => {
    const row = saved.get(definition.key);
    let buttons = [];
    try { buttons = normalizeButtons(typeof row?.buttons_json === 'string' ? JSON.parse(row.buttons_json) : row?.buttons_json); } catch {}
    return {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      persistent: definition.persistent,
      variables: definition.variables,
      text: row ? String(row.text_template || '') : definition.defaultText,
      default_text: definition.defaultText,
      buttons,
      customized: Boolean(row),
      updated_at: row?.updated_at || null,
    };
  });
}

async function saveTemplates(db, { tenantId, storeId, provider: providerValue, templates, userId }) {
  const provider = normalizeProvider(providerValue);
  if (!provider) throw Object.assign(new Error('BOT_PROVIDER_INVALID'), { status: 400, code: 'BOT_PROVIDER_INVALID' });
  if (!Array.isArray(templates) || !templates.length) throw Object.assign(new Error('TEMPLATES_REQUIRED'), { status: 400, code: 'TEMPLATES_REQUIRED' });
  const normalized = [];
  for (const item of templates) {
    const key = String(item?.key || '').trim();
    const definition = TEMPLATE_BY_KEY.get(key);
    if (!definition) throw Object.assign(new Error('TEMPLATE_KEY_INVALID'), { status: 400, code: 'TEMPLATE_KEY_INVALID' });
    const checked = validateTemplateText(item?.text, definition);
    if (!checked.ok) throw Object.assign(new Error(checked.error), { status: 400, code: checked.error, variable: checked.variable });
    normalized.push({ key, text: checked.text, buttons: normalizeButtons(item?.buttons) });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of normalized) {
      await conn.query(
        `INSERT INTO bot_content_templates
           (tenant_id,store_id,provider,template_key,text_template,buttons_json,updated_by)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE text_template=VALUES(text_template),buttons_json=VALUES(buttons_json),updated_by=VALUES(updated_by)`,
        [tenantId, storeId, provider, item.key, item.text, JSON.stringify(item.buttons), userId || null]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return listTemplates(db, tenantId, storeId, provider);
}

async function resetTemplate(db, tenantId, storeId, providerValue, key) {
  const provider = normalizeProvider(providerValue);
  if (!provider || !TEMPLATE_BY_KEY.has(key)) throw Object.assign(new Error('TEMPLATE_KEY_INVALID'), { status: 400, code: 'TEMPLATE_KEY_INVALID' });
  await db.query(
    'DELETE FROM bot_content_templates WHERE tenant_id=? AND store_id=? AND provider=? AND template_key=?',
    [tenantId, storeId, provider, key]
  );
}

function employeeAuthResponse(result, provider) {
  if (result.accountType !== 'employee' && result.context !== 'EMPLOYEE_LINK' && result.scope?.accountType !== 'employee') return null;
  if (result.silent || result.confirmed || result.autoConfirmed || result.matched === false) return {};
  const name = provider === 'tg' ? 'Telegram' : 'MAX';
  const link = result.context === 'EMPLOYEE_LINK';
  if (result.error === 'CONTACT_PHONE_MISMATCH') return {
    text: `Номер телефона в ${name} отличается от номера, указанного в вашем профиле. ${link ? 'Привязка' : 'Авторизация'} невозможна.`
  };
  if (!result.ok) {
    if (['REQUEST_EXPIRED','LINK_INVALID_OR_EXPIRED','BOT_LOGIN_INVALID_OR_EXPIRED'].includes(result.error)) return {};
    if (['ACCOUNT_PERSON_CONFLICT','LINK_USER_CONFLICT','EMPLOYEE_CONTACT_CONFLICT','MESSENGER_NOT_LINKED'].includes(result.error)) return {
      text: 'Обнаружена другая подтверждённая привязка. Доступ не выдан; требуется безопасное разрешение конфликта администратором.'
    };
    return {};
  }
  if (link && !result.contactRequired) return { text: `${name} успешно привязан.` };
  return {
    text: link ? 'Для привязки мессенджера нажмите кнопку „Привязать“.' : 'Для авторизации нажмите кнопку „Авторизоваться“.',
    button: link ? 'Привязать' : 'Авторизоваться',
    contact: Boolean(result.contactRequired), reference: result.reference,
    phase: result.contactRequired ? 'contact' : 'final'
  };
}

module.exports = {
  employeeAuthResponse,
  createServiceTextRenderer,
  TEMPLATE_DEFINITIONS,
  listTemplates,
  normalizeButtons,
  normalizeProvider,
  renderTemplate,
  resetTemplate,
  saveTemplates,
};
