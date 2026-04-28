const express = require('express');

const BONUS_LEVEL_ACCESS_TYPES = new Set(['conditions', 'join', 'paid']);
const BONUS_LEVEL_REQUIREMENT_MODES = new Set(['and', 'or']);
const BONUS_LEVEL_RETENTION_STRATEGIES = new Set(['match', 'custom']);
const BONUS_LEVEL_ACTIVATION_UNITS = new Set(['immediate', 'hours', 'days']);
const BONUS_LEVEL_LIFETIME_UNITS = new Set(['forever', 'hours', 'days', 'months']);
const BONUS_LEVEL_TARIFF_UNITS = new Set(['days', 'months', 'forever']);

function makeHttpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function textOrNull(value) {
  const text = toText(value);
  return text || null;
}

function pick(source, snakeKey, camelKey = null) {
  if (!source || typeof source !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(source, snakeKey)) return source[snakeKey];
  if (camelKey && Object.prototype.hasOwnProperty.call(source, camelKey)) return source[camelKey];
  return undefined;
}

function boolFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function nonNegativeNumber(value, fieldName, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw makeHttpError(fieldName);
  }
  return parsed;
}

function nonNegativeInt(value, fieldName, fallback = 0) {
  const parsed = nonNegativeNumber(value, fieldName, fallback);
  return Math.floor(parsed);
}

function nullableNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  return nonNegativeNumber(value, fieldName, null);
}

function nullableNonNegativeInt(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  return nonNegativeInt(value, fieldName, null);
}

function positiveNumber(value, fieldName, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw makeHttpError(fieldName);
  }
  return parsed;
}

function enumValue(value, allowed, fieldName, fallback = null) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text && fallback !== null) return fallback;
  if (allowed.has(text)) return text;
  throw makeHttpError(fieldName);
}

function normalizeCode(value, fallback) {
  const raw = toText(value) || toText(fallback);
  const code = raw.replace(/\s+/g, '_').toLowerCase();
  if (!code) throw makeHttpError('INVALID_CODE');
  return code.slice(0, 64);
}

function normalizeHexColor(value) {
  const text = toText(value);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : null;
}

function normalizeHexColorOrDefault(value, fallback) {
  return normalizeHexColor(value) || fallback;
}

function opacityPercent(value, fieldName, fallback = 90) {
  return Math.min(100, nonNegativeInt(value, fieldName, fallback));
}

function normalizeSettings(payload = {}) {
  const bonusPointAmount = positiveNumber(pick(payload, 'bonus_point_amount', 'bonusPointAmount'), 'INVALID_SETTINGS', 1);
  const bonusRubleAmount = positiveNumber(pick(payload, 'bonus_ruble_amount', 'bonusRubleAmount'), 'INVALID_SETTINGS', 1);
  return {
    bonus_program_enabled: boolFlag(pick(payload, 'bonus_program_enabled', 'bonusProgramEnabled'), false) ? 1 : 0,
    referral_program_enabled: boolFlag(pick(payload, 'referral_program_enabled', 'referralProgramEnabled'), false) ? 1 : 0,
    bonus_point_amount: bonusPointAmount,
    bonus_ruble_amount: bonusRubleAmount,
    bonus_point_rate: Math.round((bonusRubleAmount / bonusPointAmount) * 10000) / 10000,
    referral_registration_reward: nonNegativeNumber(
      pick(payload, 'referral_registration_reward', 'referralRegistrationReward'),
      'INVALID_SETTINGS',
      0
    ),
    referral_first_purchase_reward: nonNegativeNumber(
      pick(payload, 'referral_first_purchase_reward', 'referralFirstPurchaseReward'),
      'INVALID_SETTINGS',
      0
    ),
    referral_card_main_color: normalizeHexColorOrDefault(
      pick(payload, 'referral_card_main_color', 'referralCardMainColor'),
      '#f3f4f6'
    ),
    referral_card_base_color: normalizeHexColorOrDefault(
      pick(payload, 'referral_card_base_color', 'referralCardBaseColor'),
      '#d1d5db'
    ),
    referral_card_content_color: normalizeHexColorOrDefault(
      pick(payload, 'referral_card_content_color', 'referralCardContentColor'),
      '#64748b'
    ),
    referral_card_button_color: normalizeHexColorOrDefault(
      pick(payload, 'referral_card_button_color', 'referralCardButtonColor'),
      '#ff6a00'
    ),
    referral_card_qr_enabled: boolFlag(pick(payload, 'referral_card_qr_enabled', 'referralCardQrEnabled'), true) ? 1 : 0,
    referral_card_title_background_enabled: boolFlag(
      pick(payload, 'referral_card_title_background_enabled', 'referralCardTitleBackgroundEnabled'),
      true
    ) ? 1 : 0,
    referral_card_title_background_color: normalizeHexColorOrDefault(
      pick(payload, 'referral_card_title_background_color', 'referralCardTitleBackgroundColor'),
      '#ffffff'
    ),
    referral_card_title_background_opacity: opacityPercent(
      pick(payload, 'referral_card_title_background_opacity', 'referralCardTitleBackgroundOpacity'),
      'INVALID_SETTINGS',
      90
    ),
    allow_redeem_and_accrue: boolFlag(pick(payload, 'allow_redeem_and_accrue', 'allowRedeemAndAccrue'), false) ? 1 : 0,
  };
}

function normalizeTariffRows(items, errorCode = 'INVALID_LEVELS') {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw makeHttpError(errorCode);
  return items.map((item, idx) => {
    const periodUnit = enumValue(pick(item, 'period_unit', 'periodUnit'), BONUS_LEVEL_TARIFF_UNITS, errorCode, 'months');
    const periodValue = periodUnit === 'forever'
      ? 0
      : Math.max(1, nonNegativeInt(pick(item, 'period_value', 'periodValue'), errorCode, 1));
    return {
      price: nonNegativeNumber(pick(item, 'price'), errorCode, 0),
      discount_percent: nonNegativeNumber(pick(item, 'discount_percent', 'discountPercent'), errorCode, 0),
      period_value: periodValue,
      period_unit: periodUnit,
      sort_order: nonNegativeInt(pick(item, 'sort_order', 'sortOrder'), errorCode, idx),
    };
  });
}

function normalizeOrderRanges(items, errorCode = 'INVALID_LEVELS') {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw makeHttpError(errorCode);
  return items.map((item, idx) => {
    const amount = nonNegativeNumber(pick(item, 'amount'), errorCode, 0);
    const percent = nonNegativeNumber(pick(item, 'percent'), errorCode, 0);
    if (!(amount > 0) || !(percent > 0)) throw makeHttpError(errorCode);
    return {
      amount,
      percent,
      sort_order: nonNegativeInt(pick(item, 'sort_order', 'sortOrder'), errorCode, idx),
    };
  });
}

function normalizeFavoriteCategoryIds(items, errorCode = 'INVALID_LEVELS') {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw makeHttpError(errorCode);
  const ids = items.map((item) => {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) throw makeHttpError(errorCode);
    return id;
  });
  return [...new Set(ids)];
}

function normalizeBonusLevels(items) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw makeHttpError('INVALID_LEVELS');
  const seen = new Set();
  return items.map((item, idx) => {
    if (!item || typeof item !== 'object') throw makeHttpError('INVALID_LEVELS');
    const title = toText(pick(item, 'title'));
    if (!title) throw makeHttpError('INVALID_LEVELS');
    const code = normalizeCode(pick(item, 'code') ?? pick(item, 'id'), `level_${idx + 1}`);
    if (seen.has(code)) throw makeHttpError('DUPLICATE_LEVEL_CODE');
    seen.add(code);
    const activationUnit = enumValue(
      pick(item, 'activation_delay_unit', 'activationDelayUnit'),
      BONUS_LEVEL_ACTIVATION_UNITS,
      'INVALID_LEVELS',
      'immediate'
    );
    const lifetimeUnit = enumValue(
      pick(item, 'lifetime_unit', 'lifetimeUnit'),
      BONUS_LEVEL_LIFETIME_UNITS,
      'INVALID_LEVELS',
      'forever'
    );
    return {
      code,
      sort_order: nonNegativeInt(pick(item, 'sort_order', 'sortOrder'), 'INVALID_LEVELS', idx),
      title,
      subtitle: textOrNull(pick(item, 'subtitle')),
      description: textOrNull(pick(item, 'description')),
      access_type: enumValue(pick(item, 'access_type', 'accessType'), BONUS_LEVEL_ACCESS_TYPES, 'INVALID_LEVELS', 'conditions'),
      min_spent: nonNegativeNumber(pick(item, 'min_spent', 'minSpent'), 'INVALID_LEVELS', 0),
      min_orders: nonNegativeInt(pick(item, 'min_orders', 'minOrders'), 'INVALID_LEVELS', 0),
      requirement_amount: nullableNonNegativeNumber(pick(item, 'requirement_amount', 'requirementAmount'), 'INVALID_LEVELS'),
      requirement_mode: enumValue(pick(item, 'requirement_mode', 'requirementMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      requirement_orders: nullableNonNegativeInt(pick(item, 'requirement_orders', 'requirementOrders'), 'INVALID_LEVELS'),
      requirement_referral_mode: enumValue(pick(item, 'requirement_referral_mode', 'requirementReferralMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      requirement_referrals: nullableNonNegativeInt(pick(item, 'requirement_referrals', 'requirementReferrals'), 'INVALID_LEVELS'),
      requirement_period_days: nullableNonNegativeInt(pick(item, 'requirement_period_days', 'requirementPeriodDays'), 'INVALID_LEVELS'),
      retention_strategy: enumValue(pick(item, 'retention_strategy', 'retentionStrategy'), BONUS_LEVEL_RETENTION_STRATEGIES, 'INVALID_LEVELS', 'match'),
      retention_amount: nullableNonNegativeNumber(pick(item, 'retention_amount', 'retentionAmount'), 'INVALID_LEVELS'),
      retention_mode: enumValue(pick(item, 'retention_mode', 'retentionMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      retention_orders: nullableNonNegativeInt(pick(item, 'retention_orders', 'retentionOrders'), 'INVALID_LEVELS'),
      retention_referral_mode: enumValue(pick(item, 'retention_referral_mode', 'retentionReferralMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      retention_referrals: nullableNonNegativeInt(pick(item, 'retention_referrals', 'retentionReferrals'), 'INVALID_LEVELS'),
      cashback_percent: nonNegativeNumber(pick(item, 'cashback_percent', 'cashbackPercent'), 'INVALID_LEVELS', 0),
      redeem_percent: nonNegativeNumber(pick(item, 'redeem_percent', 'redeemPercent'), 'INVALID_LEVELS', 0),
      referral_bonus_percent: nonNegativeNumber(pick(item, 'referral_bonus_percent', 'referralBonusPercent'), 'INVALID_LEVELS', 0),
      favorite_categories_bonus_percent: nonNegativeNumber(
        pick(item, 'favorite_categories_bonus_percent', 'favoriteCategoriesBonusPercent'),
        'INVALID_LEVELS',
        0
      ),
      favorite_categories_limit: nonNegativeInt(pick(item, 'favorite_categories_limit', 'favoriteCategoriesLimit'), 'INVALID_LEVELS', 0),
      activation_delay_value: nonNegativeInt(pick(item, 'activation_delay_value', 'activationDelayValue'), 'INVALID_LEVELS', 0),
      activation_delay_unit: activationUnit,
      lifetime_value: lifetimeUnit === 'forever'
        ? 0
        : nonNegativeInt(pick(item, 'lifetime_value', 'lifetimeValue'), 'INVALID_LEVELS', 0),
      lifetime_unit: lifetimeUnit,
      qr_enabled: boolFlag(pick(item, 'qr_enabled', 'qrEnabled'), true) ? 1 : 0,
      show_title_on_card: boolFlag(pick(item, 'show_title_on_card', 'showTitleOnCard'), true) ? 1 : 0,
      design_color: normalizeHexColor(pick(item, 'design_color', 'designColor')),
      accent_color: normalizeHexColor(pick(item, 'accent_color', 'accentColor')),
      main_color: normalizeHexColor(pick(item, 'main_color', 'mainColor')),
      base_color: normalizeHexColor(pick(item, 'base_color', 'baseColor')),
      content_color: normalizeHexColor(pick(item, 'content_color', 'contentColor')),
      title_color: normalizeHexColor(pick(item, 'title_color', 'titleColor')),
      title_background_enabled: boolFlag(pick(item, 'title_background_enabled', 'titleBackgroundEnabled'), true) ? 1 : 0,
      title_background_color: normalizeHexColor(pick(item, 'title_background_color', 'titleBackgroundColor')),
      title_background_opacity: Math.min(100, nonNegativeInt(
        pick(item, 'title_background_opacity', 'titleBackgroundOpacity'),
        'INVALID_LEVELS',
        90
      )),
      is_active: boolFlag(pick(item, 'is_active', 'isActive'), true) ? 1 : 0,
      tariff_rows: normalizeTariffRows(pick(item, 'tariff_rows', 'tariffRows')),
      order_bonus_ranges: normalizeOrderRanges(pick(item, 'order_bonus_ranges', 'orderBonusRanges')),
      favorite_category_ids: normalizeFavoriteCategoryIds(pick(item, 'favorite_category_ids', 'favoriteCategoryIds')),
    };
  });
}

function normalizeReferralLevels(items) {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw makeHttpError('INVALID_REFERRAL_LEVELS');
  const seen = new Set();
  return items.map((item, idx) => {
    if (!item || typeof item !== 'object') throw makeHttpError('INVALID_REFERRAL_LEVELS');
    const title = toText(pick(item, 'title'));
    if (!title) throw makeHttpError('INVALID_REFERRAL_LEVELS');
    const code = normalizeCode(pick(item, 'code') ?? pick(item, 'id'), `referral_${idx + 1}`);
    if (seen.has(code)) throw makeHttpError('DUPLICATE_REFERRAL_LEVEL_CODE');
    seen.add(code);
    return {
      code,
      title,
      invited_count: nonNegativeInt(pick(item, 'invited_count', 'invitedCount'), 'INVALID_REFERRAL_LEVELS', idx),
      percent: nonNegativeNumber(pick(item, 'percent'), 'INVALID_REFERRAL_LEVELS', 0),
      sort_order: nonNegativeInt(pick(item, 'sort_order', 'sortOrder'), 'INVALID_REFERRAL_LEVELS', idx),
      is_active: boolFlag(pick(item, 'is_active', 'isActive') ?? pick(item, 'enabled'), true) ? 1 : 0,
    };
  });
}

function mapSettingsRow(row) {
  return {
    bonus_program_enabled: Number(row?.bonus_program_enabled || 0) === 1,
    referral_program_enabled: Number(row?.referral_program_enabled || 0) === 1,
    bonus_point_amount: Number(row?.bonus_point_amount || 1),
    bonus_ruble_amount: Number(row?.bonus_ruble_amount || row?.bonus_point_rate || 1),
    bonus_point_rate: Number(row?.bonus_point_rate || 1),
    referral_registration_reward: Number(row?.referral_registration_reward || 0),
    referral_first_purchase_reward: Number(row?.referral_first_purchase_reward || 0),
    referral_card_main_color: row?.referral_card_main_color || '#f3f4f6',
    referral_card_base_color: row?.referral_card_base_color || '#d1d5db',
    referral_card_content_color: row?.referral_card_content_color || '#64748b',
    referral_card_button_color: row?.referral_card_button_color || '#ff6a00',
    referral_card_qr_enabled: row ? Number(row.referral_card_qr_enabled || 0) === 1 : true,
    referral_card_title_background_enabled: row ? Number(row.referral_card_title_background_enabled || 0) === 1 : true,
    referral_card_title_background_color: row?.referral_card_title_background_color || '#ffffff',
    referral_card_title_background_opacity: Number(row?.referral_card_title_background_opacity || 90),
    allow_redeem_and_accrue: Number(row?.allow_redeem_and_accrue || 0) === 1,
  };
}

function mapBonusLevelRow(row, children) {
  const levelId = Number(row.id || 0);
  return {
    id: levelId,
    code: row.code,
    sort_order: Number(row.sort_order || 0),
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    access_type: row.access_type,
    min_spent: Number(row.min_spent || 0),
    min_orders: Number(row.min_orders || 0),
    requirement_amount: row.requirement_amount == null ? null : Number(row.requirement_amount),
    requirement_mode: row.requirement_mode,
    requirement_orders: row.requirement_orders == null ? null : Number(row.requirement_orders),
    requirement_referral_mode: row.requirement_referral_mode,
    requirement_referrals: row.requirement_referrals == null ? null : Number(row.requirement_referrals),
    requirement_period_days: row.requirement_period_days == null ? null : Number(row.requirement_period_days),
    retention_strategy: row.retention_strategy,
    retention_amount: row.retention_amount == null ? null : Number(row.retention_amount),
    retention_mode: row.retention_mode,
    retention_orders: row.retention_orders == null ? null : Number(row.retention_orders),
    retention_referral_mode: row.retention_referral_mode,
    retention_referrals: row.retention_referrals == null ? null : Number(row.retention_referrals),
    cashback_percent: Number(row.cashback_percent || 0),
    redeem_percent: Number(row.redeem_percent || 0),
    referral_bonus_percent: Number(row.referral_bonus_percent || 0),
    favorite_categories_bonus_percent: Number(row.favorite_categories_bonus_percent || 0),
    favorite_categories_limit: Number(row.favorite_categories_limit || 0),
    activation_delay_value: Number(row.activation_delay_value || 0),
    activation_delay_unit: row.activation_delay_unit,
    lifetime_value: Number(row.lifetime_value || 0),
    lifetime_unit: row.lifetime_unit,
    qr_enabled: Number(row.qr_enabled || 0) === 1,
    show_title_on_card: Number(row.show_title_on_card || 0) === 1,
    design_color: row.design_color || null,
    accent_color: row.accent_color || null,
    main_color: row.main_color || null,
    base_color: row.base_color || null,
    content_color: row.content_color || null,
    title_color: row.title_color || null,
    title_background_enabled: Number(row.title_background_enabled || 0) === 1,
    title_background_color: row.title_background_color || null,
    title_background_opacity: Number(row.title_background_opacity || 0),
    is_active: Number(row.is_active || 0) === 1,
    tariff_rows: children.tariffsByLevel.get(levelId) || [],
    order_bonus_ranges: children.rangesByLevel.get(levelId) || [],
    favorite_category_ids: children.categoriesByLevel.get(levelId) || [],
  };
}

function formatEventDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBonusAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return '—';
  return `${amount > 0 ? '+' : ''}${amount.toLocaleString('ru-RU')} бонусов`;
}

function mapBonusTransactionRow(row) {
  const type = String(row.type || 'adjustment');
  const actionByType = {
    join: 'Присоединился к программе',
    level_up: 'Повысил статус',
    accrual: 'Начисление бонусов',
    redeem: 'Списание бонусов',
    expire: 'Сгорание бонусов',
    adjustment: 'Корректировка бонусов',
    referral_accrual: 'Начисление за реферала',
    refund: 'Возврат бонусов',
  };
  return {
    id: `bonus_tx_${row.id}`,
    type,
    clientName: row.customer_name || `Клиент #${row.customer_id}`,
    phone: row.customer_phone || '',
    action: row.reason || actionByType[type] || 'Операция с бонусами',
    status: row.level_title || formatBonusAmount(row.amount),
    amount: Number(row.amount || 0),
    balance: row.balance_after == null ? null : Number(row.balance_after),
    at: formatEventDate(row.created_at),
  };
}

function mapReferralEventRow(row) {
  const statusByCode = {
    registered: 'Зарегистрировался по ссылке',
    first_purchase_paid: 'Первый заказ оплачен',
    cancelled: 'Отменён',
  };
  const inviterName = row.inviter_name || 'Без приглашения';
  return {
    id: `referral_${row.id}`,
    inviterName,
    inviterPhone: row.inviter_phone || '—',
    referralName: row.referral_name || `Клиент #${row.referral_customer_id}`,
    referralPhone: row.referral_phone || '',
    relation: row.inviter_name ? `Реферал ${row.inviter_name}` : 'Самостоятельная регистрация',
    status: statusByCode[String(row.status || '')] || String(row.status || ''),
    reward: formatBonusAmount(row.reward_amount),
    at: formatEventDate(row.first_purchase_paid_at || row.registered_at || row.created_at),
  };
}

async function loadConfig(db, tenantId) {
  const [[settingsRow]] = await db.query(
    `SELECT bonus_program_enabled, referral_program_enabled,
            bonus_point_amount, bonus_ruble_amount, bonus_point_rate,
            referral_registration_reward, referral_first_purchase_reward,
            referral_card_main_color, referral_card_base_color,
            referral_card_content_color, referral_card_button_color,
            referral_card_qr_enabled, referral_card_title_background_enabled,
            referral_card_title_background_color, referral_card_title_background_opacity,
            allow_redeem_and_accrue
       FROM mkt_bonus_program_settings
      WHERE tenant_id = ?
      LIMIT 1`,
    [tenantId]
  );
  const [levelRows] = await db.query(
    `SELECT *
       FROM mkt_bonus_levels
      WHERE tenant_id = ?
      ORDER BY sort_order ASC, id ASC`,
    [tenantId]
  );
  const [tariffRows] = await db.query(
    `SELECT level_id, price, discount_percent, period_value, period_unit, sort_order
       FROM mkt_bonus_level_tariffs
      WHERE tenant_id = ?
      ORDER BY level_id ASC, sort_order ASC, id ASC`,
    [tenantId]
  );
  const [rangeRows] = await db.query(
    `SELECT level_id, amount, percent, sort_order
       FROM mkt_bonus_level_order_ranges
      WHERE tenant_id = ?
      ORDER BY level_id ASC, amount ASC, sort_order ASC, id ASC`,
    [tenantId]
  );
  const [categoryRows] = await db.query(
    `SELECT level_id, category_id
       FROM mkt_bonus_level_favorite_categories
      WHERE tenant_id = ?
      ORDER BY level_id ASC, id ASC`,
    [tenantId]
  );
  const [referralRows] = await db.query(
    `SELECT id, code, title, invited_count, percent, sort_order, is_active
       FROM mkt_referral_levels
      WHERE tenant_id = ?
      ORDER BY sort_order ASC, invited_count ASC, id ASC`,
    [tenantId]
  );
  const [bonusEventRows] = await db.query(
    `SELECT t.id, t.customer_id, t.type, t.amount, t.balance_after, t.reason, t.created_at,
            c.name AS customer_name, c.phone AS customer_phone,
            l.title AS level_title
       FROM mkt_customer_bonus_transactions t
       LEFT JOIN cust_customers c ON c.tenant_id = t.tenant_id AND c.id = t.customer_id
       LEFT JOIN mkt_bonus_levels l ON l.id = t.level_id
      WHERE t.tenant_id = ?
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 50`,
    [tenantId]
  );
  const [referralEventRows] = await db.query(
    `SELECT r.id, r.inviter_customer_id, r.referral_customer_id, r.status,
            r.registered_at, r.first_purchase_paid_at, r.created_at,
            inviter.name AS inviter_name, inviter.phone AS inviter_phone,
            referral.name AS referral_name, referral.phone AS referral_phone,
            rewards.reward_amount
       FROM mkt_customer_referrals r
       LEFT JOIN cust_customers inviter ON inviter.tenant_id = r.tenant_id AND inviter.id = r.inviter_customer_id
       LEFT JOIN cust_customers referral ON referral.tenant_id = r.tenant_id AND referral.id = r.referral_customer_id
       LEFT JOIN (
         SELECT tenant_id, referral_id, SUM(amount) AS reward_amount
           FROM mkt_referral_rewards
          WHERE tenant_id = ?
          GROUP BY tenant_id, referral_id
       ) rewards ON rewards.tenant_id = r.tenant_id AND rewards.referral_id = r.id
      WHERE r.tenant_id = ?
      ORDER BY r.registered_at DESC, r.id DESC
      LIMIT 50`,
    [tenantId, tenantId]
  );

  const tariffsByLevel = new Map();
  tariffRows.forEach((row) => {
    const levelId = Number(row.level_id || 0);
    if (!tariffsByLevel.has(levelId)) tariffsByLevel.set(levelId, []);
    tariffsByLevel.get(levelId).push({
      price: Number(row.price || 0),
      discount_percent: Number(row.discount_percent || 0),
      period_value: Number(row.period_value || 0),
      period_unit: row.period_unit,
      sort_order: Number(row.sort_order || 0),
    });
  });

  const rangesByLevel = new Map();
  rangeRows.forEach((row) => {
    const levelId = Number(row.level_id || 0);
    if (!rangesByLevel.has(levelId)) rangesByLevel.set(levelId, []);
    rangesByLevel.get(levelId).push({
      amount: Number(row.amount || 0),
      percent: Number(row.percent || 0),
      sort_order: Number(row.sort_order || 0),
    });
  });

  const categoriesByLevel = new Map();
  categoryRows.forEach((row) => {
    const levelId = Number(row.level_id || 0);
    if (!categoriesByLevel.has(levelId)) categoriesByLevel.set(levelId, []);
    categoriesByLevel.get(levelId).push(Number(row.category_id || 0));
  });

  return {
    settings: settingsRow ? mapSettingsRow(settingsRow) : mapSettingsRow(null),
    levels: levelRows.map((row) => mapBonusLevelRow(row, { tariffsByLevel, rangesByLevel, categoriesByLevel })),
    referral_levels: referralRows.map((row) => ({
      id: Number(row.id || 0),
      code: row.code,
      title: row.title,
      invited_count: Number(row.invited_count || 0),
      percent: Number(row.percent || 0),
      sort_order: Number(row.sort_order || 0),
      is_active: Number(row.is_active || 0) === 1,
    })),
    bonus_events: bonusEventRows.map(mapBonusTransactionRow),
    referral_events: referralEventRows.map(mapReferralEventRow),
  };
}

async function saveLevelChildren(conn, tenantId, levelId, level) {
  for (const row of level.tariff_rows) {
    await conn.query(
      `INSERT INTO mkt_bonus_level_tariffs
        (tenant_id, level_id, price, discount_percent, period_value, period_unit, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, levelId, row.price, row.discount_percent, row.period_value, row.period_unit, row.sort_order]
    );
  }
  for (const row of level.order_bonus_ranges) {
    await conn.query(
      `INSERT INTO mkt_bonus_level_order_ranges
        (tenant_id, level_id, amount, percent, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, levelId, row.amount, row.percent, row.sort_order]
    );
  }
  for (const categoryId of level.favorite_category_ids) {
    await conn.query(
      `INSERT INTO mkt_bonus_level_favorite_categories
        (tenant_id, level_id, category_id)
       VALUES (?, ?, ?)`,
      [tenantId, levelId, categoryId]
    );
  }
}

async function saveConfig(db, tenantId, payload) {
  const settings = normalizeSettings(payload?.settings || {});
  const levels = normalizeBonusLevels(payload?.levels || []);
  const referralLevels = normalizeReferralLevels(payload?.referral_levels || payload?.referralLevels || []);
  const conn = await db.getConnection();
  let inTransaction = false;
  try {
    await conn.beginTransaction();
    inTransaction = true;

    await conn.query(
      `INSERT INTO mkt_bonus_program_settings
        (tenant_id, bonus_program_enabled, referral_program_enabled,
         bonus_point_amount, bonus_ruble_amount, bonus_point_rate,
         referral_registration_reward, referral_first_purchase_reward,
         referral_card_main_color, referral_card_base_color,
         referral_card_content_color, referral_card_button_color,
         referral_card_qr_enabled, referral_card_title_background_enabled,
         referral_card_title_background_color, referral_card_title_background_opacity,
         allow_redeem_and_accrue)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         bonus_program_enabled = VALUES(bonus_program_enabled),
         referral_program_enabled = VALUES(referral_program_enabled),
         bonus_point_amount = VALUES(bonus_point_amount),
         bonus_ruble_amount = VALUES(bonus_ruble_amount),
         bonus_point_rate = VALUES(bonus_point_rate),
         referral_registration_reward = VALUES(referral_registration_reward),
         referral_first_purchase_reward = VALUES(referral_first_purchase_reward),
         referral_card_main_color = VALUES(referral_card_main_color),
         referral_card_base_color = VALUES(referral_card_base_color),
         referral_card_content_color = VALUES(referral_card_content_color),
         referral_card_button_color = VALUES(referral_card_button_color),
         referral_card_qr_enabled = VALUES(referral_card_qr_enabled),
         referral_card_title_background_enabled = VALUES(referral_card_title_background_enabled),
         referral_card_title_background_color = VALUES(referral_card_title_background_color),
         referral_card_title_background_opacity = VALUES(referral_card_title_background_opacity),
         allow_redeem_and_accrue = VALUES(allow_redeem_and_accrue)`,
      [
        tenantId,
        settings.bonus_program_enabled,
        settings.referral_program_enabled,
        settings.bonus_point_amount,
        settings.bonus_ruble_amount,
        settings.bonus_point_rate,
        settings.referral_registration_reward,
        settings.referral_first_purchase_reward,
        settings.referral_card_main_color,
        settings.referral_card_base_color,
        settings.referral_card_content_color,
        settings.referral_card_button_color,
        settings.referral_card_qr_enabled,
        settings.referral_card_title_background_enabled,
        settings.referral_card_title_background_color,
        settings.referral_card_title_background_opacity,
        settings.allow_redeem_and_accrue,
      ]
    );

    const [existingLevelRows] = await conn.query(
      `SELECT id, code FROM mkt_bonus_levels WHERE tenant_id = ?`,
      [tenantId]
    );
    const existingLevelIdsByCode = new Map(
      (Array.isArray(existingLevelRows) ? existingLevelRows : [])
        .map((row) => [String(row.code || ''), Number(row.id || 0)])
        .filter(([code, id]) => code && id > 0)
    );
    const nextLevelCodes = levels.map((level) => level.code);
    if (nextLevelCodes.length) {
      await conn.query(
        `DELETE FROM mkt_bonus_levels WHERE tenant_id = ? AND code NOT IN (?)`,
        [tenantId, nextLevelCodes]
      );
    } else {
      await conn.query(`DELETE FROM mkt_bonus_levels WHERE tenant_id = ?`, [tenantId]);
    }

    for (const level of levels) {
      const levelParams = [
        level.sort_order,
        level.title,
        level.subtitle,
        level.description,
        level.access_type,
        level.min_spent,
        level.min_orders,
        level.requirement_amount,
        level.requirement_mode,
        level.requirement_orders,
        level.requirement_referral_mode,
        level.requirement_referrals,
        level.requirement_period_days,
        level.retention_strategy,
        level.retention_amount,
        level.retention_mode,
        level.retention_orders,
        level.retention_referral_mode,
        level.retention_referrals,
        level.cashback_percent,
        level.redeem_percent,
        level.referral_bonus_percent,
        level.favorite_categories_bonus_percent,
        level.favorite_categories_limit,
        level.activation_delay_value,
        level.activation_delay_unit,
        level.lifetime_value,
        level.lifetime_unit,
        level.qr_enabled,
        level.show_title_on_card,
        level.design_color,
        level.accent_color,
        level.main_color,
        level.base_color,
        level.content_color,
        level.title_color,
        level.title_background_enabled,
        level.title_background_color,
        level.title_background_opacity,
        level.is_active,
      ];
      let levelId = existingLevelIdsByCode.get(level.code) || 0;
      if (levelId > 0) {
        await conn.query(
          `UPDATE mkt_bonus_levels SET
            sort_order = ?, title = ?, subtitle = ?, description = ?, access_type = ?,
            min_spent = ?, min_orders = ?, requirement_amount = ?, requirement_mode = ?,
            requirement_orders = ?, requirement_referral_mode = ?, requirement_referrals = ?,
            requirement_period_days = ?, retention_strategy = ?, retention_amount = ?,
            retention_mode = ?, retention_orders = ?, retention_referral_mode = ?, retention_referrals = ?,
            cashback_percent = ?, redeem_percent = ?, referral_bonus_percent = ?,
            favorite_categories_bonus_percent = ?, favorite_categories_limit = ?,
            activation_delay_value = ?, activation_delay_unit = ?, lifetime_value = ?, lifetime_unit = ?,
            qr_enabled = ?, show_title_on_card = ?, design_color = ?, accent_color = ?, main_color = ?,
            base_color = ?, content_color = ?, title_color = ?, title_background_enabled = ?,
            title_background_color = ?, title_background_opacity = ?, is_active = ?
           WHERE tenant_id = ? AND id = ?`,
          [...levelParams, tenantId, levelId]
        );
      } else {
        const [result] = await conn.query(
          `INSERT INTO mkt_bonus_levels (
            tenant_id, code, sort_order, title, subtitle, description, access_type,
            min_spent, min_orders, requirement_amount, requirement_mode,
            requirement_orders, requirement_referral_mode, requirement_referrals,
            requirement_period_days, retention_strategy, retention_amount,
            retention_mode, retention_orders, retention_referral_mode, retention_referrals,
            cashback_percent, redeem_percent, referral_bonus_percent,
            favorite_categories_bonus_percent, favorite_categories_limit,
            activation_delay_value, activation_delay_unit, lifetime_value, lifetime_unit,
            qr_enabled, show_title_on_card, design_color, accent_color, main_color,
            base_color, content_color, title_color, title_background_enabled,
            title_background_color, title_background_opacity, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, level.code, ...levelParams]
        );
        levelId = Number(result.insertId || 0);
      }
      await conn.query(`DELETE FROM mkt_bonus_level_tariffs WHERE tenant_id = ? AND level_id = ?`, [tenantId, levelId]);
      await conn.query(`DELETE FROM mkt_bonus_level_order_ranges WHERE tenant_id = ? AND level_id = ?`, [tenantId, levelId]);
      await conn.query(`DELETE FROM mkt_bonus_level_favorite_categories WHERE tenant_id = ? AND level_id = ?`, [tenantId, levelId]);
      await saveLevelChildren(conn, tenantId, levelId, level);
    }

    await conn.query(`DELETE FROM mkt_referral_levels WHERE tenant_id = ?`, [tenantId]);
    for (const level of referralLevels) {
      await conn.query(
        `INSERT INTO mkt_referral_levels
          (tenant_id, code, title, invited_count, percent, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          level.code,
          level.title,
          level.invited_count,
          level.percent,
          level.sort_order,
          level.is_active,
        ]
      );
    }

    await conn.commit();
    inTransaction = false;
  } catch (err) {
    if (inTransaction) await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = function makeAdminBonusRouter({ db, helpers }) {
  const router = express.Router();

  router.get('/config', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const data = await loadConfig(db, tenantId);
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error('GET /api/admin/bonus/config error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  router.put('/config', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      await saveConfig(db, tenantId, req.body || {});
      const data = await loadConfig(db, tenantId);
      return res.json({ ok: true, ...data });
    } catch (err) {
      const statusCode = err?.statusCode || 500;
      const errorCode = statusCode === 400 ? err.message : 'SERVER_ERROR';
      if (statusCode >= 500) {
        console.error('PUT /api/admin/bonus/config error:', err);
      }
      return res.status(statusCode).json({ ok: false, error: errorCode });
    }
  });

  return router;
};
