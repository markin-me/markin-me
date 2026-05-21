const express = require('express');

const BONUS_LEVEL_ACCESS_TYPES = new Set(['conditions', 'join', 'paid']);
const BONUS_LEVEL_REQUIREMENT_MODES = new Set(['and', 'or']);
const BONUS_LEVEL_RETENTION_STRATEGIES = new Set(['match', 'custom']);
const BONUS_LEVEL_ACTIVATION_UNITS = new Set(['immediate', 'hours', 'days']);
const BONUS_LEVEL_LIFETIME_UNITS = new Set(['forever', 'hours', 'days', 'months']);
const BONUS_LEVEL_TARIFF_UNITS = new Set(['days', 'months', 'forever']);
const BONUS_MODAL_KEYS = new Set(['join', 'level-up', 'level-down']);

const DEFAULT_BONUS_MODAL_SETTINGS = [
  { key: 'join', title: 'Присоединение к программе', description: '', image_url: null, is_enabled: 1, sort_order: 0 },
  { key: 'level-up', title: 'Повышение уровня', description: '', image_url: null, is_enabled: 1, sort_order: 1 },
  { key: 'level-down', title: 'Понижение уровня', description: '', image_url: null, is_enabled: 1, sort_order: 2 },
];

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
    bonus_program_name_base: toText(pick(payload, 'bonus_program_name_base', 'bonusProgramNameBase')) || 'Бонусная программа',
    bonus_program_logo_base: textOrNull(pick(payload, 'bonus_program_logo_base', 'bonusProgramLogoBase')),
    bonus_program_name_paid: toText(pick(payload, 'bonus_program_name_paid', 'bonusProgramNamePaid')) || 'Привилегии Plus',
    bonus_program_logo_paid: textOrNull(pick(payload, 'bonus_program_logo_paid', 'bonusProgramLogoPaid')),
    bonus_coin_name: toText(pick(payload, 'bonus_coin_name', 'bonusCoinName')) || 'Бонусы',
    bonus_coin_logo: textOrNull(pick(payload, 'bonus_coin_logo', 'bonusCoinLogo')),
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
      reward_bonus_amount: nonNegativeNumber(pick(item, 'reward_bonus_amount', 'rewardBonusAmount'), 'INVALID_LEVELS', 0),
      min_spent: nonNegativeNumber(pick(item, 'min_spent', 'minSpent'), 'INVALID_LEVELS', 0),
      min_orders: nonNegativeInt(pick(item, 'min_orders', 'minOrders'), 'INVALID_LEVELS', 0),
      requirement_amount: nullableNonNegativeNumber(pick(item, 'requirement_amount', 'requirementAmount'), 'INVALID_LEVELS'),
      requirement_mode: enumValue(pick(item, 'requirement_mode', 'requirementMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      requirement_orders: nullableNonNegativeInt(pick(item, 'requirement_orders', 'requirementOrders'), 'INVALID_LEVELS'),
      requirement_referral_mode: enumValue(pick(item, 'requirement_referral_mode', 'requirementReferralMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      requirement_referrals: nullableNonNegativeInt(pick(item, 'requirement_referrals', 'requirementReferrals'), 'INVALID_LEVELS'),
      requirement_bonus_accrued: nullableNonNegativeNumber(pick(item, 'requirement_bonus_accrued', 'requirementBonusAccrued'), 'INVALID_LEVELS'),
      requirement_bonus_redeemed: nullableNonNegativeNumber(pick(item, 'requirement_bonus_redeemed', 'requirementBonusRedeemed'), 'INVALID_LEVELS'),
      requirement_match_count: Math.max(1, nonNegativeInt(pick(item, 'requirement_match_count', 'requirementMatchCount'), 'INVALID_LEVELS', 1)),
      requirement_period_days: nullableNonNegativeInt(pick(item, 'requirement_period_days', 'requirementPeriodDays'), 'INVALID_LEVELS'),
      retention_strategy: enumValue(pick(item, 'retention_strategy', 'retentionStrategy'), BONUS_LEVEL_RETENTION_STRATEGIES, 'INVALID_LEVELS', 'match'),
      retention_amount: nullableNonNegativeNumber(pick(item, 'retention_amount', 'retentionAmount'), 'INVALID_LEVELS'),
      retention_mode: enumValue(pick(item, 'retention_mode', 'retentionMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      retention_orders: nullableNonNegativeInt(pick(item, 'retention_orders', 'retentionOrders'), 'INVALID_LEVELS'),
      retention_referral_mode: enumValue(pick(item, 'retention_referral_mode', 'retentionReferralMode'), BONUS_LEVEL_REQUIREMENT_MODES, 'INVALID_LEVELS', 'and'),
      retention_referrals: nullableNonNegativeInt(pick(item, 'retention_referrals', 'retentionReferrals'), 'INVALID_LEVELS'),
      retention_bonus_accrued: nullableNonNegativeNumber(pick(item, 'retention_bonus_accrued', 'retentionBonusAccrued'), 'INVALID_LEVELS'),
      retention_bonus_redeemed: nullableNonNegativeNumber(pick(item, 'retention_bonus_redeemed', 'retentionBonusRedeemed'), 'INVALID_LEVELS'),
      retention_match_count: Math.max(1, nonNegativeInt(pick(item, 'retention_match_count', 'retentionMatchCount'), 'INVALID_LEVELS', 1)),
      cashback_percent: nonNegativeNumber(pick(item, 'cashback_percent', 'cashbackPercent'), 'INVALID_LEVELS', 0),
      redeem_percent: nonNegativeNumber(pick(item, 'redeem_percent', 'redeemPercent'), 'INVALID_LEVELS', 0),
      referral_bonus_percent: nonNegativeNumber(pick(item, 'referral_bonus_percent', 'referralBonusPercent'), 'INVALID_LEVELS', 0),
      favorite_categories_bonus_percent: 0,
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
      favorite_category_group_id: null,
      order_bonus_ranges: normalizeOrderRanges(pick(item, 'order_bonus_ranges', 'orderBonusRanges')),
      favorite_category_ids: [],
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

const BONUS_CATEGORY_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function getBonusCategoryMonthTitle(monthNumber) {
  return BONUS_CATEGORY_MONTHS[Number(monthNumber || 0) - 1] || 'Подборка категорий';
}

function normalizeCategoryGroupItems(items, fallbackIds = [], fallbackPercent = 0) {
  const source = Array.isArray(items) && items.length
    ? items
    : normalizeFavoriteCategoryIds(fallbackIds).map((categoryId) => ({
        category_id: categoryId,
        bonus_percent: fallbackPercent,
      }));
  const byCategoryId = new Map();
  source.forEach((item) => {
    const categoryId = Number(pick(item, 'category_id', 'categoryId', 'id'));
    if (!Number.isInteger(categoryId) || categoryId <= 0) return;
    byCategoryId.set(categoryId, {
      category_id: categoryId,
      bonus_percent: nonNegativeNumber(pick(item, 'bonus_percent', 'bonusPercent', 'percent'), 'INVALID_SETTINGS', fallbackPercent),
    });
  });
  return Array.from(byCategoryId.values());
}

function normalizeMonthNumber(value, fallback) {
  const monthNumber = Number(value);
  if (Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12) return monthNumber;
  if (Number.isInteger(fallback) && fallback >= 1 && fallback <= 12) return fallback;
  throw makeHttpError('INVALID_SETTINGS');
}

function normalizeCategoryGroups(items) {
  if (!Array.isArray(items)) return [];
  const seenMonths = new Set();
  return items.map((item, idx) => {
    const rawId = pick(item, 'id');
    const id = Number(rawId);
    const month_number = normalizeMonthNumber(pick(item, 'month_number', 'monthNumber'), idx + 1);
    if (seenMonths.has(month_number)) throw makeHttpError('DUPLICATE_CATEGORY_GROUP_MONTH');
    seenMonths.add(month_number);
    const fallbackPercent = nonNegativeNumber(pick(item, 'favoriteCategoriesBonusPercent', 'bonus_percent'), 'INVALID_SETTINGS', 0);
    const category_items = normalizeCategoryGroupItems(
      pick(item, 'category_items', 'categoryItems'),
      pick(item, 'favoriteCategoryIds', 'category_ids'),
      fallbackPercent
    );
    const category_ids = category_items.map((row) => row.category_id);
    return {
      ...(Number.isInteger(id) && id > 0 ? { id } : {}),
      month_number,
      title: getBonusCategoryMonthTitle(month_number),
      bonus_percent: category_items.reduce((max, row) => Math.max(max, Number(row.bonus_percent || 0)), fallbackPercent),
      categories_limit: nonNegativeInt(pick(item, 'favoriteCategoriesLimit', 'categories_limit'), 'INVALID_SETTINGS', 0),
      category_ids,
      category_items,
    };
  });
}

function normalizeBonusModalSettings(items) {
  const source = Array.isArray(items) ? items : [];
  const byKey = new Map();
  source.forEach((item, idx) => {
    const key = toText(pick(item, 'modal_key', 'key'));
    if (!BONUS_MODAL_KEYS.has(key)) return;
    byKey.set(key, {
      key,
      title: toText(pick(item, 'title')) || DEFAULT_BONUS_MODAL_SETTINGS.find((row) => row.key === key)?.title || '',
      description: toText(pick(item, 'description')),
      image_url: textOrNull(pick(item, 'image_url', 'imageUrl')),
      is_enabled: boolFlag(pick(item, 'is_enabled', 'enabled'), true) ? 1 : 0,
      sort_order: nonNegativeInt(pick(item, 'sort_order', 'sortOrder'), 'INVALID_MODAL_SETTINGS', idx),
    });
  });
  return DEFAULT_BONUS_MODAL_SETTINGS.map((row) => ({
    ...row,
    ...(byKey.get(row.key) || {}),
  }));
}

function mapBonusModalSettingsRows(rows) {
  const byKey = new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.modal_key || ''), row]));
  return DEFAULT_BONUS_MODAL_SETTINGS.map((fallback) => {
    const row = byKey.get(fallback.key) || {};
    return {
      key: fallback.key,
      title: row.title || fallback.title,
      description: row.description || '',
      image_url: row.image_url || null,
      enabled: row.id == null ? fallback.is_enabled === 1 : Number(row.is_enabled || 0) === 1,
      sort_order: row.sort_order == null ? fallback.sort_order : Number(row.sort_order || 0),
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
    bonus_program_name_base: row?.bonus_program_name_base || 'Бонусная программа',
    bonus_program_logo_base: row?.bonus_program_logo_base || null,
    bonus_program_name_paid: row?.bonus_program_name_paid || 'Привилегии Plus',
    bonus_program_logo_paid: row?.bonus_program_logo_paid || null,
    bonus_coin_name: row?.bonus_coin_name || 'Бонусы',
    bonus_coin_logo: row?.bonus_coin_logo || null,
  };
}

function mapBonusLevelRow(row, children) {
  const levelId = Number(row.id || 0);
  const favoriteGroup = children.activeFavoriteGroup || null;
  return {
    id: levelId,
    code: row.code,
    sort_order: Number(row.sort_order || 0),
    title: row.title,
    subtitle: row.subtitle || '',
    description: row.description || '',
    access_type: row.access_type,
    reward_bonus_amount: Number(row.reward_bonus_amount || 0),
    min_spent: Number(row.min_spent || 0),
    min_orders: Number(row.min_orders || 0),
    requirement_amount: row.requirement_amount == null ? null : Number(row.requirement_amount),
    requirement_mode: row.requirement_mode,
    requirement_orders: row.requirement_orders == null ? null : Number(row.requirement_orders),
    requirement_referral_mode: row.requirement_referral_mode,
    requirement_referrals: row.requirement_referrals == null ? null : Number(row.requirement_referrals),
    requirement_bonus_accrued: row.requirement_bonus_accrued == null ? null : Number(row.requirement_bonus_accrued),
    requirement_bonus_redeemed: row.requirement_bonus_redeemed == null ? null : Number(row.requirement_bonus_redeemed),
    requirement_match_count: Number(row.requirement_match_count || 1),
    requirement_period_days: row.requirement_period_days == null ? null : Number(row.requirement_period_days),
    retention_strategy: row.retention_strategy,
    retention_amount: row.retention_amount == null ? null : Number(row.retention_amount),
    retention_mode: row.retention_mode,
    retention_orders: row.retention_orders == null ? null : Number(row.retention_orders),
    retention_referral_mode: row.retention_referral_mode,
    retention_referrals: row.retention_referrals == null ? null : Number(row.retention_referrals),
    retention_bonus_accrued: row.retention_bonus_accrued == null ? null : Number(row.retention_bonus_accrued),
    retention_bonus_redeemed: row.retention_bonus_redeemed == null ? null : Number(row.retention_bonus_redeemed),
    retention_match_count: Number(row.retention_match_count || 1),
    cashback_percent: Number(row.cashback_percent || 0),
    redeem_percent: Number(row.redeem_percent || 0),
    referral_bonus_percent: Number(row.referral_bonus_percent || 0),
    favorite_categories_bonus_percent: favoriteGroup ? Number(favoriteGroup.bonus_percent || 0) : 0,
    favorite_categories_min_bonus_percent: favoriteGroup ? Number(favoriteGroup.min_bonus_percent || 0) : 0,
    favorite_categories_max_bonus_percent: favoriteGroup ? Number(favoriteGroup.max_bonus_percent || 0) : 0,
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
    favorite_category_ids: favoriteGroup ? favoriteGroup.category_ids : [],
    favorite_category_group_id: null,
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
            allow_redeem_and_accrue,
            bonus_program_name_base, bonus_program_logo_base,
            bonus_program_name_paid, bonus_program_logo_paid,
            bonus_coin_name, bonus_coin_logo
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
  const [categoryGroupRows] = await db.query(
    `SELECT id, title, month_number, bonus_percent, categories_limit, category_ids
       FROM mkt_bonus_category_groups
      WHERE tenant_id = ?
      ORDER BY COALESCE(month_number, 99) ASC, id ASC`,
    [tenantId]
  );
  const [categoryGroupItemRows] = await db.query(
    `SELECT group_id, category_id, bonus_percent
       FROM mkt_bonus_category_group_items
      WHERE tenant_id = ?
      ORDER BY group_id ASC, id ASC`,
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
  const [modalRows] = await db.query(
    `SELECT id, modal_key, title, description, image_url, is_enabled, sort_order
       FROM mkt_bonus_modal_settings
      WHERE tenant_id = ?
      ORDER BY sort_order ASC, id ASC`,
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

  const categoryItemsByGroupId = new Map();
  categoryGroupItemRows.forEach((row) => {
    const groupId = Number(row.group_id || 0);
    if (!(groupId > 0)) return;
    if (!categoryItemsByGroupId.has(groupId)) categoryItemsByGroupId.set(groupId, []);
    categoryItemsByGroupId.get(groupId).push({
      category_id: Number(row.category_id || 0),
      bonus_percent: Number(row.bonus_percent || 0),
    });
  });
  const categoryGroupsByMonth = new Map();
  categoryGroupRows.forEach((row) => {
    const monthNumber = Number(row.month_number || 0);
    const groupId = Number(row.id || 0);
    const legacyCategoryIds = Array.isArray(row.category_ids) ? row.category_ids : JSON.parse(row.category_ids || '[]');
    const categoryItems = categoryItemsByGroupId.get(groupId) || normalizeCategoryGroupItems([], legacyCategoryIds, Number(row.bonus_percent || 0));
    const itemPercents = categoryItems
      .map((item) => Math.max(0, Number(item.bonus_percent || 0)))
      .filter((value) => value > 0);
    const group = {
      id: row.id,
      title: getBonusCategoryMonthTitle(monthNumber),
      month_number: monthNumber,
      bonus_percent: itemPercents.length ? Math.max(...itemPercents) : Number(row.bonus_percent || 0),
      min_bonus_percent: itemPercents.length ? Math.min(...itemPercents) : 0,
      max_bonus_percent: itemPercents.length ? Math.max(...itemPercents) : Number(row.bonus_percent || 0),
      categories_limit: Number(row.categories_limit || 0),
      category_ids: categoryItems.map((item) => Number(item.category_id || 0)).filter((id) => id > 0),
      category_items: categoryItems,
    };
    if (monthNumber >= 1 && monthNumber <= 12 && !categoryGroupsByMonth.has(monthNumber)) {
      categoryGroupsByMonth.set(monthNumber, group);
    }
  });
  const categoryGroups = BONUS_CATEGORY_MONTHS.map((title, idx) => {
    const monthNumber = idx + 1;
    return categoryGroupsByMonth.get(monthNumber) || {
      title,
      month_number: monthNumber,
      bonus_percent: 0,
      categories_limit: 0,
      category_ids: [],
      category_items: [],
    };
  });
  const categoryGroupsById = new Map(
    categoryGroups
      .map((row) => [Number(row.id || 0), row])
      .filter(([id]) => id > 0)
  );
  const activeFavoriteGroup = categoryGroups.find((row) => Number(row.month_number || 0) === (new Date().getMonth() + 1)) || null;

  return {
    settings: settingsRow ? mapSettingsRow(settingsRow) : mapSettingsRow(null),
    levels: levelRows.map((row) => mapBonusLevelRow(row, { tariffsByLevel, rangesByLevel, categoriesByLevel, categoryGroupsById, activeFavoriteGroup })),
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
    modal_settings: mapBonusModalSettingsRows(modalRows),
    category_groups: categoryGroups.map((row) => ({
      id: row.id,
      title: row.title,
      monthNumber: row.month_number,
      favoriteCategoriesBonusPercent: row.bonus_percent,
      favoriteCategoriesLimit: row.categories_limit,
      favoriteCategoryIds: row.category_ids,
      categoryItems: row.category_items.map((item) => ({
        categoryId: item.category_id,
        bonusPercent: item.bonus_percent,
      })),
    })),
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
}

async function saveConfig(db, tenantId, payload) {
  const settings = normalizeSettings(payload?.settings || {});
  const levels = normalizeBonusLevels(payload?.levels || []);
  const referralLevels = normalizeReferralLevels(payload?.referral_levels || payload?.referralLevels || []);
  const categoryGroups = normalizeCategoryGroups(payload?.category_groups || payload?.categoryGroups || []);
  const hasModalSettingsPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'modal_settings')
    || Object.prototype.hasOwnProperty.call(payload || {}, 'modalSettings');
  const modalSettings = hasModalSettingsPayload
    ? normalizeBonusModalSettings(payload?.modal_settings || payload?.modalSettings || [])
    : [];
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
         allow_redeem_and_accrue,
         bonus_program_name_base, bonus_program_logo_base,
         bonus_program_name_paid, bonus_program_logo_paid,
         bonus_coin_name, bonus_coin_logo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
         allow_redeem_and_accrue = VALUES(allow_redeem_and_accrue),
         bonus_program_name_base = VALUES(bonus_program_name_base),
         bonus_program_logo_base = VALUES(bonus_program_logo_base),
         bonus_program_name_paid = VALUES(bonus_program_name_paid),
         bonus_program_logo_paid = VALUES(bonus_program_logo_paid),
         bonus_coin_name = VALUES(bonus_coin_name),
         bonus_coin_logo = VALUES(bonus_coin_logo)`,
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
        settings.bonus_program_name_base,
        settings.bonus_program_logo_base,
        settings.bonus_program_name_paid,
        settings.bonus_program_logo_paid,
        settings.bonus_coin_name,
        settings.bonus_coin_logo,
      ]
    );

    const payloadGroups = categoryGroups || [];
    const allGroupCategoryIds = Array.from(new Set(payloadGroups.flatMap((group) => group.category_ids || [])));
    if (allGroupCategoryIds.length) {
      const [categoryValidationRows] = await conn.query(
        `SELECT id FROM prod_categories WHERE tenant_id = ? AND id IN (?)`,
        [tenantId, allGroupCategoryIds]
      );
      const validCategoryIds = new Set((Array.isArray(categoryValidationRows) ? categoryValidationRows : []).map((row) => Number(row.id || 0)));
      if (allGroupCategoryIds.some((categoryId) => !validCategoryIds.has(Number(categoryId)))) {
        throw makeHttpError('INVALID_SETTINGS');
      }
    }
    const groupIdsToKeep = payloadGroups.map(g => g.id).filter(id => id && typeof id === 'number');
    
    if (groupIdsToKeep.length > 0) {
      await conn.query(`DELETE FROM mkt_bonus_category_groups WHERE tenant_id = ? AND id NOT IN (?)`, [tenantId, groupIdsToKeep]);
    } else {
      await conn.query(`DELETE FROM mkt_bonus_category_groups WHERE tenant_id = ?`, [tenantId]);
    }

    for (const group of payloadGroups) {
      if (group.id && typeof group.id === 'number') {
        await conn.query(
          `UPDATE mkt_bonus_category_groups SET 
            title = ?, month_number = ?, bonus_percent = ?, categories_limit = ?, category_ids = ?
           WHERE tenant_id = ? AND id = ?`,
          [group.title, group.month_number, group.bonus_percent, group.categories_limit, JSON.stringify(group.category_ids), tenantId, group.id]
        );
        await conn.query(`DELETE FROM mkt_bonus_category_group_items WHERE tenant_id = ? AND group_id = ?`, [tenantId, group.id]);
        for (const item of group.category_items) {
          await conn.query(
            `INSERT INTO mkt_bonus_category_group_items
              (tenant_id, group_id, category_id, bonus_percent)
             VALUES (?, ?, ?, ?)`,
            [tenantId, group.id, item.category_id, item.bonus_percent]
          );
        }
      } else {
        const [result] = await conn.query(
          `INSERT INTO mkt_bonus_category_groups
            (tenant_id, title, month_number, bonus_percent, categories_limit, category_ids)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [tenantId, group.title, group.month_number, group.bonus_percent, group.categories_limit, JSON.stringify(group.category_ids)]
        );
        const groupId = Number(result.insertId || 0);
        for (const item of group.category_items) {
          await conn.query(
            `INSERT INTO mkt_bonus_category_group_items
              (tenant_id, group_id, category_id, bonus_percent)
             VALUES (?, ?, ?, ?)`,
            [tenantId, groupId, item.category_id, item.bonus_percent]
          );
        }
      }
    }

    const [savedGroupRows] = await conn.query(
      `SELECT id FROM mkt_bonus_category_groups WHERE tenant_id = ?`,
      [tenantId]
    );
    const savedGroupIds = new Set(
      (Array.isArray(savedGroupRows) ? savedGroupRows : [])
        .map((row) => Number(row.id || 0))
        .filter((id) => id > 0)
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
        level.reward_bonus_amount,
        level.min_spent,
        level.min_orders,
        level.requirement_amount,
        level.requirement_mode,
        level.requirement_orders,
        level.requirement_referral_mode,
        level.requirement_referrals,
        level.requirement_bonus_accrued,
        level.requirement_bonus_redeemed,
        level.requirement_match_count,
        level.requirement_period_days,
        level.retention_strategy,
        level.retention_amount,
        level.retention_mode,
        level.retention_orders,
        level.retention_referral_mode,
        level.retention_referrals,
        level.retention_bonus_accrued,
        level.retention_bonus_redeemed,
        level.retention_match_count,
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
        null,
        level.is_active,
      ];
      let levelId = existingLevelIdsByCode.get(level.code) || 0;
      if (levelId > 0) {
        await conn.query(
          `UPDATE mkt_bonus_levels SET
            sort_order = ?, title = ?, subtitle = ?, description = ?, access_type = ?, reward_bonus_amount = ?,
            min_spent = ?, min_orders = ?, requirement_amount = ?, requirement_mode = ?,
            requirement_orders = ?, requirement_referral_mode = ?, requirement_referrals = ?,
            requirement_bonus_accrued = ?, requirement_bonus_redeemed = ?,
            requirement_match_count = ?, requirement_period_days = ?, retention_strategy = ?, retention_amount = ?,
            retention_mode = ?, retention_orders = ?, retention_referral_mode = ?, retention_referrals = ?,
            retention_bonus_accrued = ?, retention_bonus_redeemed = ?,
            retention_match_count = ?, cashback_percent = ?, redeem_percent = ?, referral_bonus_percent = ?,
            favorite_categories_bonus_percent = ?, favorite_categories_limit = ?,
            activation_delay_value = ?, activation_delay_unit = ?, lifetime_value = ?, lifetime_unit = ?,
            qr_enabled = ?, show_title_on_card = ?, design_color = ?, accent_color = ?, main_color = ?,
            base_color = ?, content_color = ?, title_color = ?, title_background_enabled = ?,
            title_background_color = ?, title_background_opacity = ?,
            favorite_category_group_id = ?, is_active = ?
           WHERE tenant_id = ? AND id = ?`,
          [...levelParams, tenantId, levelId]
        );
      } else {
        const [result] = await conn.query(
          `INSERT INTO mkt_bonus_levels (
            tenant_id, code, sort_order, title, subtitle, description, access_type, reward_bonus_amount,
            min_spent, min_orders, requirement_amount, requirement_mode,
            requirement_orders, requirement_referral_mode, requirement_referrals,
            requirement_bonus_accrued, requirement_bonus_redeemed,
            requirement_match_count, requirement_period_days, retention_strategy, retention_amount,
            retention_mode, retention_orders, retention_referral_mode, retention_referrals,
            retention_bonus_accrued, retention_bonus_redeemed,
            retention_match_count, cashback_percent, redeem_percent, referral_bonus_percent,
            favorite_categories_bonus_percent, favorite_categories_limit,
            activation_delay_value, activation_delay_unit, lifetime_value, lifetime_unit,
            qr_enabled, show_title_on_card, design_color, accent_color, main_color,
            base_color, content_color, title_color, title_background_enabled,
            title_background_color, title_background_opacity,
            favorite_category_group_id, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    if (hasModalSettingsPayload) {
      for (const item of modalSettings) {
        await conn.query(
          `INSERT INTO mkt_bonus_modal_settings
            (tenant_id, modal_key, title, description, image_url, is_enabled, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             description = VALUES(description),
             image_url = VALUES(image_url),
             is_enabled = VALUES(is_enabled),
             sort_order = VALUES(sort_order)`,
          [
            tenantId,
            item.key,
            item.title,
            item.description,
            item.image_url,
            item.is_enabled,
            item.sort_order,
          ]
        );
      }
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

function toMysqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function maxDateOrNull(...values) {
  const dates = values
    .map((value) => (value instanceof Date ? value : new Date(value)))
    .filter((date) => Number.isFinite(date.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function getBonusRequirementTargets(levelRow, accountRow) {
  const isCurrentLevel = Number(accountRow?.level_id || 0) > 0
    && Number(accountRow?.level_id || 0) === Number(levelRow?.id || 0);
  const useRetention = isCurrentLevel;
  const periodDays = Math.max(0, Math.floor(Number(levelRow?.requirement_period_days || 0)));
  if (useRetention && !(periodDays > 0)) return null;
  const retentionStrategy = String(levelRow?.retention_strategy || 'match');
  if (useRetention && retentionStrategy === 'custom') {
    return {
      scope: 'retention',
      amount: levelRow.retention_amount == null ? null : Number(levelRow.retention_amount),
      orders: levelRow.retention_orders == null ? null : Number(levelRow.retention_orders),
      referrals: levelRow.retention_referrals == null ? null : Number(levelRow.retention_referrals),
      bonusAccrued: levelRow.retention_bonus_accrued == null ? null : Number(levelRow.retention_bonus_accrued),
      bonusRedeemed: levelRow.retention_bonus_redeemed == null ? null : Number(levelRow.retention_bonus_redeemed),
      matchCount: Number(levelRow.retention_match_count || 1),
    };
  }
  return {
    scope: useRetention ? 'retention' : 'requirement',
    amount: levelRow.requirement_amount == null ? null : Number(levelRow.requirement_amount),
    orders: levelRow.requirement_orders == null ? null : Number(levelRow.requirement_orders),
    referrals: levelRow.requirement_referrals == null ? null : Number(levelRow.requirement_referrals),
    bonusAccrued: levelRow.requirement_bonus_accrued == null ? null : Number(levelRow.requirement_bonus_accrued),
    bonusRedeemed: levelRow.requirement_bonus_redeemed == null ? null : Number(levelRow.requirement_bonus_redeemed),
    matchCount: Number(levelRow.requirement_match_count || 1),
  };
}

function isBonusProgressComplete(progress) {
  if (!progress || typeof progress !== 'object') return false;
  const rows = [
    [progress.amount_current, progress.amount_target],
    [progress.orders_current, progress.orders_target],
    [progress.referrals_current, progress.referrals_target],
    [progress.bonus_accrued_current, progress.bonus_accrued_target],
    [progress.bonus_redeemed_current, progress.bonus_redeemed_target],
  ].filter(([, target]) => Number(target || 0) > 0);
  if (!rows.length) return false;
  const required = Math.min(rows.length, Math.max(1, Math.floor(Number(progress.match_count || 1))));
  const matched = rows.filter(([current, target]) => Number(current || 0) >= Number(target || 0)).length;
  return matched >= required;
}

function getBonusProgressLevelIds(accountRow, levels) {
  const rows = Array.isArray(levels) ? levels : [];
  const result = new Set();
  if (!accountRow?.joined_at || !rows.length) return result;
  const currentLevelId = Number(accountRow.level_id || 0);
  const currentIndex = rows.findIndex((row) => Number(row?.id || 0) === currentLevelId);
  if (currentIndex >= 0) result.add(currentLevelId);
  const nextLevel = rows.slice(currentIndex + 1).find((row) => String(row?.access_type || '').trim() === 'conditions');
  if (nextLevel) result.add(Number(nextLevel.id || 0));
  return result;
}

function getBonusAccruedTarget(levelRow) {
  if (!levelRow || String(levelRow?.access_type || '').trim() !== 'conditions') return 0;
  return Math.max(0, Number(levelRow.requirement_bonus_accrued || 0));
}

function getBonusAccruedConsumedBeforeLevel(levels, targetLevelId) {
  const rows = Array.isArray(levels) ? levels : [];
  const targetId = Number(targetLevelId || 0);
  let consumed = 0;
  for (const row of rows) {
    if (Number(row?.id || 0) === targetId) break;
    consumed += getBonusAccruedTarget(row);
  }
  return consumed;
}

async function loadBonusProgressByLevel(db, tenantId, customerId, accountRow, levels) {
  const rows = Array.isArray(levels) ? levels : [];
  const progressByLevel = new Map();
  if (!(tenantId > 0) || !(customerId > 0) || !accountRow?.joined_at || !rows.length) return progressByLevel;
  const allowedLevelIds = getBonusProgressLevelIds(accountRow, rows);

  for (const levelRow of rows) {
    if (!allowedLevelIds.has(Number(levelRow.id || 0))) continue;
    const targets = getBonusRequirementTargets(levelRow, accountRow);
    if (!targets) continue;
    const amountTarget = Math.max(0, Number(targets.amount || 0));
    const ordersTarget = Math.max(0, Math.floor(Number(targets.orders || 0)));
    const referralsTarget = Math.max(0, Math.floor(Number(targets.referrals || 0)));
    const bonusAccruedTarget = Math.max(0, Number(targets.bonusAccrued || 0));
    const bonusRedeemedTarget = Math.max(0, Number(targets.bonusRedeemed || 0));
    if (!(amountTarget > 0) && !(ordersTarget > 0) && !(referralsTarget > 0) && !(bonusAccruedTarget > 0) && !(bonusRedeemedTarget > 0)) continue;

    const periodDays = Math.max(0, Math.floor(Number(levelRow.requirement_period_days || 0)));
    const periodStart = periodDays > 0 ? new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) : null;
    const baseStart = accountRow.level_assigned_at || accountRow.joined_at;
    const sinceDate = periodStart ? maxDateOrNull(baseStart, periodStart) : maxDateOrNull(baseStart);
    const sinceAt = toMysqlDateTime(sinceDate);
    if (!sinceAt) continue;
    const useCumulativeBonusAccrued = bonusAccruedTarget > 0
      && targets.scope !== 'retention'
      && !(periodDays > 0);
    const bonusAccruedSinceAt = useCumulativeBonusAccrued
      ? toMysqlDateTime(maxDateOrNull(accountRow.joined_at))
      : sinceAt;
    const bonusStatsSinceAt = bonusAccruedSinceAt && bonusAccruedSinceAt < sinceAt ? bonusAccruedSinceAt : sinceAt;
    const bonusAccruedConsumed = useCumulativeBonusAccrued
      ? getBonusAccruedConsumedBeforeLevel(rows, Number(levelRow.id || 0))
      : 0;

    const [[orderStats]] = await db.query(
      `SELECT COUNT(*) AS orders_count,
              COALESCE(SUM(COALESCE(o.total_price, 0)), 0) AS orders_amount
         FROM order_orders o
         LEFT JOIN order_statuses os
           ON os.tenant_id = o.tenant_id
          AND os.store_id = o.store_id
          AND os.id = o.status_id
        WHERE o.tenant_id = ?
          AND o.customer_id = ?
          AND o.is_active = 1
          AND o.created_at >= ?
          AND LOWER(COALESCE(os.code, '')) NOT IN ('canceled', 'cancelled')
          AND (o.is_paid = 1 OR COALESCE(os.is_final, 0) = 1)`,
      [tenantId, customerId, sinceAt]
    );
    const [[referralStats]] = await db.query(
      `SELECT COUNT(*) AS referrals_count
         FROM mkt_customer_referrals
        WHERE tenant_id = ?
          AND inviter_customer_id = ?
          AND status IN ('registered', 'first_purchase_paid')
          AND registered_at >= ?`,
      [tenantId, customerId, sinceAt]
    );
    const [[bonusStats]] = await db.query(
      `SELECT
          COALESCE(SUM(CASE WHEN type IN ('join', 'accrual', 'referral_accrual', 'level_up') AND created_at >= ? THEN amount ELSE 0 END), 0) AS bonus_accrued,
          COALESCE(SUM(CASE WHEN type = 'redeem' AND created_at >= ? THEN amount ELSE 0 END), 0) AS bonus_redeemed
         FROM mkt_customer_bonus_transactions
        WHERE tenant_id = ?
          AND customer_id = ?
          AND created_at >= ?`,
      [bonusAccruedSinceAt || sinceAt, sinceAt, tenantId, customerId, bonusStatsSinceAt]
    );

    progressByLevel.set(Number(levelRow.id || 0), {
      scope: targets.scope,
      since_at: sinceAt,
      period_days: periodDays || null,
      amount_current: Number(orderStats?.orders_amount || 0),
      amount_target: amountTarget || null,
      orders_current: Number(orderStats?.orders_count || 0),
      orders_target: ordersTarget || null,
      referrals_current: Number(referralStats?.referrals_count || 0),
      referrals_target: referralsTarget || null,
      bonus_accrued_current: Math.max(0, Number(bonusStats?.bonus_accrued || 0) - bonusAccruedConsumed),
      bonus_accrued_target: bonusAccruedTarget || null,
      bonus_redeemed_current: Number(bonusStats?.bonus_redeemed || 0),
      bonus_redeemed_target: bonusRedeemedTarget || null,
      match_count: Math.max(1, Number(targets.matchCount || 1)),
    });
  }

  return progressByLevel;
}

async function promoteBonusAccountIfEligible(db, tenantId, customerId, accountRow, levels) {
  const accountId = Number(accountRow?.id || 0);
  const rows = Array.isArray(levels) ? levels : [];
  if (!(tenantId > 0) || !(customerId > 0) || !(accountId > 0) || !accountRow?.joined_at || !rows.length) {
    return accountRow || null;
  }
  let currentAccount = { ...accountRow };
  for (let guard = 0; guard < rows.length; guard += 1) {
    const currentLevelId = Number(currentAccount.level_id || 0);
    const currentIndex = rows.findIndex((row) => Number(row?.id || 0) === currentLevelId);
    if (currentIndex < 0) break;
    const nextLevel = rows.slice(currentIndex + 1).find((row) => String(row?.access_type || '').trim() === 'conditions');
    if (!nextLevel) break;

    const progressByLevel = await loadBonusProgressByLevel(db, tenantId, customerId, currentAccount, rows);
    const progress = progressByLevel.get(Number(nextLevel.id || 0));
    if (!isBonusProgressComplete(progress)) break;

    const rewardAmount = Math.max(0, Number(nextLevel.reward_bonus_amount || 0));
    const currentBalance = Math.max(0, Number(currentAccount.balance || 0));
    const nextBalance = currentBalance + rewardAmount;
    const [updateResult] = await db.query(
      `UPDATE mkt_customer_bonus_accounts
          SET level_id = ?,
              balance = COALESCE(balance, 0) + ?,
              total_accrued = COALESCE(total_accrued, 0) + ?,
              level_assigned_at = NOW()
        WHERE tenant_id = ? AND id = ? AND customer_id = ? AND level_id = ?`,
      [Number(nextLevel.id), rewardAmount, rewardAmount, tenantId, accountId, customerId, currentLevelId]
    );
    if (!(Number(updateResult?.affectedRows || 0) > 0)) break;

    await db.query(
      `INSERT INTO mkt_customer_bonus_transactions
         (tenant_id, account_id, customer_id, level_id, type, amount, balance_after, reason, created_at)
       VALUES (?, ?, ?, ?, 'level_up', ?, ?, ?, NOW())`,
      [tenantId, accountId, customerId, Number(nextLevel.id), rewardAmount, nextBalance, 'level_up']
    );
    await db.query(
      `INSERT INTO mkt_customer_bonus_modal_events
         (tenant_id, customer_id, event_type, from_level_id, to_level_id, created_at)
       VALUES (?, ?, 'level_up', ?, ?, NOW())`,
      [tenantId, customerId, currentLevelId || null, Number(nextLevel.id)]
    );
    currentAccount = {
      ...currentAccount,
      level_id: Number(nextLevel.id),
      balance: nextBalance,
      level_assigned_at: new Date(),
    };
  }

  const [[updatedAccountRow]] = await db.query(
    `SELECT id, customer_id, level_id, balance, total_accrued, total_redeemed,
            total_expired, status, joined_at, level_assigned_at
       FROM mkt_customer_bonus_accounts
      WHERE tenant_id = ? AND customer_id = ?
      LIMIT 1`,
    [tenantId, customerId]
  );
  return updatedAccountRow || accountRow;
}

module.exports = function makeAdminBonusRouter({ db, helpers }) {
  const router = express.Router();

  router.post('/customers/:customerId/join', async (req, res) => {
    let conn;
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.customerId || 0);
      if (!Number.isInteger(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_CUSTOMER_ID' });
      }

      const [[customerRow]] = await db.query(
        `SELECT id
           FROM cust_customers
          WHERE tenant_id = ? AND id = ?
          LIMIT 1`,
        [tenantId, customerId]
      );
      if (!customerRow) {
        return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      }

      const [[settingsRow]] = await db.query(
        `SELECT bonus_program_enabled
           FROM mkt_bonus_program_settings
          WHERE tenant_id = ?
          LIMIT 1`,
        [tenantId]
      );
      if (Number(settingsRow?.bonus_program_enabled || 0) !== 1) {
        return res.status(409).json({ ok: false, error: 'BONUS_PROGRAM_DISABLED' });
      }

      const [[joinLevel]] = await db.query(
        `SELECT id, title, reward_bonus_amount
           FROM mkt_bonus_levels
          WHERE tenant_id = ? AND is_active = 1 AND access_type = 'join'
          ORDER BY sort_order ASC, id ASC
          LIMIT 1`,
        [tenantId]
      );
      const joinLevelId = Number(joinLevel?.id || 0);
      const joinRewardAmount = Math.max(0, Number(joinLevel?.reward_bonus_amount || 0));
      if (!(joinLevelId > 0)) {
        return res.status(409).json({ ok: false, error: 'BONUS_JOIN_LEVEL_NOT_FOUND' });
      }

      conn = await db.getConnection();
      await conn.beginTransaction();

      const [[existingAccount]] = await conn.query(
        `SELECT id, customer_id, level_id, balance, status, joined_at, level_assigned_at
           FROM mkt_customer_bonus_accounts
          WHERE tenant_id = ? AND customer_id = ?
          LIMIT 1
          FOR UPDATE`,
        [tenantId, customerId]
      );

      let accountId = Number(existingAccount?.id || 0);
      const alreadyJoined = !!existingAccount?.joined_at;
      let rewardBalanceAfter = joinRewardAmount;
      if (accountId > 0) {
        const currentBalance = Math.max(0, Number(existingAccount?.balance || 0));
        rewardBalanceAfter = alreadyJoined ? currentBalance : currentBalance + joinRewardAmount;
        await conn.query(
          `UPDATE mkt_customer_bonus_accounts
              SET level_id = COALESCE(level_id, ?),
                  balance = CASE WHEN joined_at IS NULL THEN COALESCE(balance, 0) + ? ELSE balance END,
                  total_accrued = CASE WHEN joined_at IS NULL THEN COALESCE(total_accrued, 0) + ? ELSE total_accrued END,
                  status = 'active',
                  joined_at = COALESCE(joined_at, NOW()),
                  level_assigned_at = COALESCE(level_assigned_at, NOW())
            WHERE tenant_id = ? AND customer_id = ?`,
          [joinLevelId, joinRewardAmount, joinRewardAmount, tenantId, customerId]
        );
      } else {
        const [insertResult] = await conn.query(
          `INSERT INTO mkt_customer_bonus_accounts
             (tenant_id, customer_id, level_id, balance, total_accrued, total_redeemed, total_expired, status, joined_at, level_assigned_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 'active', NOW(), NOW())`,
          [tenantId, customerId, joinLevelId, joinRewardAmount, joinRewardAmount]
        );
        accountId = Number(insertResult.insertId || 0);
      }

      if (!alreadyJoined) {
        await conn.query(
          `INSERT INTO mkt_customer_bonus_transactions
             (tenant_id, account_id, customer_id, level_id, type, amount, balance_after, reason, created_at)
           VALUES (?, ?, ?, ?, 'join', ?, ?, ?, NOW())`,
          [tenantId, accountId || null, customerId, joinLevelId, joinRewardAmount, rewardBalanceAfter, 'join']
        );
      }

      const [[accountRow]] = await conn.query(
        `SELECT id, customer_id, level_id, balance, total_accrued, total_redeemed,
                total_expired, status, joined_at, level_assigned_at
           FROM mkt_customer_bonus_accounts
          WHERE tenant_id = ? AND customer_id = ?
          LIMIT 1`,
        [tenantId, customerId]
      );
      await conn.commit();

      return res.json({
        ok: true,
        data: {
          account: accountRow ? {
            id: Number(accountRow.id || 0),
            customer_id: Number(accountRow.customer_id || 0),
            level_id: accountRow.level_id == null ? null : Number(accountRow.level_id),
            balance: Number(accountRow.balance || 0),
            total_accrued: Number(accountRow.total_accrued || 0),
            total_redeemed: Number(accountRow.total_redeemed || 0),
            total_expired: Number(accountRow.total_expired || 0),
            status: accountRow.status || 'active',
            joined_at: accountRow.joined_at || null,
            level_assigned_at: accountRow.level_assigned_at || null,
          } : null,
          already_joined: alreadyJoined,
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
      }
      console.error('POST /api/admin/bonus/customers/:customerId/join error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    } finally {
      if (conn) conn.release();
    }
  });

  router.get('/customers/:customerId/card', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.customerId || 0);
      if (!Number.isInteger(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_CUSTOMER_ID' });
      }

      const [[customerRow]] = await db.query(
        `SELECT
            c.id, c.name, c.phone, c.photo,
            COALESCE(order_metrics.total_orders, 0) AS total_orders,
            COALESCE(order_metrics.total_spent, 0) AS total_spent
           FROM cust_customers c
           LEFT JOIN (
             SELECT
               tenant_id,
               customer_id,
               COUNT(*) AS total_orders,
               COALESCE(SUM(COALESCE(total_price, 0)), 0) AS total_spent
             FROM order_orders
             WHERE tenant_id = ? AND is_active = 1 AND customer_id IS NOT NULL
             GROUP BY tenant_id, customer_id
           ) order_metrics
             ON order_metrics.tenant_id = c.tenant_id
            AND order_metrics.customer_id = c.id
          WHERE c.tenant_id = ? AND c.id = ?
          LIMIT 1`,
        [tenantId, tenantId, customerId]
      );
      if (!customerRow) {
        return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      }

      const config = await loadConfig(db, tenantId);
      const [[accountRow]] = await db.query(
        `SELECT id, customer_id, level_id, balance, total_accrued, total_redeemed,
                total_expired, status, joined_at, level_assigned_at
           FROM mkt_customer_bonus_accounts
          WHERE tenant_id = ? AND customer_id = ?
          LIMIT 1`,
        [tenantId, customerId]
      );
      const promotedAccountRow = await promoteBonusAccountIfEligible(db, tenantId, customerId, accountRow, config.levels);
      const accountLevelId = Number(promotedAccountRow?.level_id || 0);
      const level = config.levels.find((item) => Number(item?.id || 0) === accountLevelId)
        || config.levels.find((item) => item?.is_active)
        || config.levels[0]
        || null;
      const levelId = Number(level?.id || accountLevelId || 0);
      const progressByLevel = await loadBonusProgressByLevel(db, tenantId, customerId, promotedAccountRow, config.levels);
      const levelsWithProgress = config.levels.map((item) => ({
        ...item,
        progress: progressByLevel.get(Number(item?.id || 0)) || null,
      }));
      const currentLevel = level
        ? (levelsWithProgress.find((item) => Number(item?.id || 0) === Number(level.id || 0)) || level)
        : null;

      let favoriteCategories = [];
      if (levelId > 0) {
        const favoriteLimit = Math.max(0, Math.floor(Number(currentLevel?.favorite_categories_limit || 0)));
        const [categoryRows] = await db.query(
          `SELECT pc.id, pc.title, pc.icon, pc.sort_order, i.bonus_percent,
                  CASE WHEN selected.category_id IS NULL THEN 0 ELSE 1 END AS selected,
                  selected.created_at AS selected_at
             FROM mkt_bonus_category_groups g
             JOIN mkt_bonus_category_group_items i
               ON i.tenant_id = g.tenant_id AND i.group_id = g.id
             JOIN prod_categories pc
               ON pc.tenant_id = i.tenant_id AND pc.id = i.category_id
             LEFT JOIN mkt_customer_bonus_favorite_categories selected
               ON selected.tenant_id = i.tenant_id
              AND selected.customer_id = ?
              AND selected.level_id = ?
              AND selected.category_id = i.category_id
            WHERE g.tenant_id = ? AND g.month_number = MONTH(CURDATE()) AND pc.is_active = 1
            ORDER BY selected.category_id IS NULL ASC, selected.created_at ASC, pc.sort_order ASC, pc.id ASC`,
          [customerId, levelId, tenantId]
        );
        let selectedCount = 0;
        favoriteCategories = (Array.isArray(categoryRows) ? categoryRows : []).map((row) => {
          const selected = Number(row.selected || 0) === 1 && favoriteLimit > 0 && selectedCount < favoriteLimit;
          if (selected) selectedCount += 1;
          return {
          id: Number(row.id || 0),
          title: row.title || '',
          icon: row.icon || null,
          bonus_percent: Math.max(0, Number(row.bonus_percent || 0)),
          selected,
        };
        });
      }

      const [transactionRows] = await db.query(
        `SELECT t.id, t.level_id, t.type, t.amount, t.balance_after, t.reason, t.created_at,
                l.title AS level_title
           FROM mkt_customer_bonus_transactions t
           LEFT JOIN mkt_bonus_levels l ON l.tenant_id = t.tenant_id AND l.id = t.level_id
          WHERE t.tenant_id = ? AND t.customer_id = ?
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 10`,
        [tenantId, customerId]
      );

      return res.json({
        ok: true,
        data: {
          settings: config.settings,
          customer: {
            id: Number(customerRow.id || 0),
            name: customerRow.name || '',
            phone: customerRow.phone || '',
            photo: customerRow.photo || '',
            total_orders: Number(customerRow.total_orders || 0),
            total_spent: Number(customerRow.total_spent || 0),
          },
          account: promotedAccountRow ? {
            id: Number(promotedAccountRow.id || 0),
            customer_id: Number(promotedAccountRow.customer_id || 0),
            level_id: promotedAccountRow.level_id == null ? null : Number(promotedAccountRow.level_id),
            balance: Number(promotedAccountRow.balance || 0),
            total_accrued: Number(promotedAccountRow.total_accrued || 0),
            total_redeemed: Number(promotedAccountRow.total_redeemed || 0),
            total_expired: Number(promotedAccountRow.total_expired || 0),
            status: promotedAccountRow.status || 'active',
            joined_at: promotedAccountRow.joined_at || null,
            level_assigned_at: promotedAccountRow.level_assigned_at || null,
          } : null,
          level: currentLevel,
          levels: levelsWithProgress,
          favorite_categories: favoriteCategories,
          transactions: (Array.isArray(transactionRows) ? transactionRows : []).map(mapBonusTransactionRow),
        },
      });
    } catch (err) {
      console.error('GET /api/admin/bonus/customers/:customerId/card error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

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
