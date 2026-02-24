const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { sendNewOrderNotification } = require('../telegramNotifications');
const { sendOrderToPrintBot } = require('../printPush');
const discountHelpers = require('../helpers/discounts');
const {
  makeLinkToken,
  buildMaxDeepLink,
  getTenantMaxBotId,
  getTenantMaxBotToken,
  sendMaxMessage,
  confirmMaxLink,
  notifyCustomerLogin,
} = require('../maxIntegration');
const {
  applyStockDeductionForOrderItems,
  checkStockAvailabilityForOrderItems,
} = require('../helpers/orderStock');
const TELEGRAM_API = 'https://api.telegram.org/bot';

module.exports = function makePublicShopRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();

  // ------------------------------
  // Upload: customer avatar
  // POST /api/public/me/photo (field: photo|avatar)
  // ------------------------------
  const avatarStorage = multer.diskStorage({
    destination(req, file, cb) {
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    }
  });

  const avatarUpload = multer({
    storage: avatarStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  // ------------------------------
  // small utils (local)
  // ------------------------------
  function safeJsonArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function getThumbUrl(url) {
    if (!url) return null;
    if (typeof helpers.getThumbUrlIfExists === 'function') {
      return helpers.getThumbUrlIfExists(url);
    }
    return null;
  }

  async function isTenantMaxLoginEnabled(tenantId) {
    const [rows] = await db.query(
      'SELECT max_login_enabled FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    if (!rows.length) return false;
    return Number(rows[0].max_login_enabled || 0) === 1;
  }

  async function isTenantTgLoginEnabled(tenantId) {
    const [rows] = await db.query(
      'SELECT tg_login_enabled FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    if (!rows.length) return false;
    return Number(rows[0].tg_login_enabled || 0) === 1;
  }

  async function sendTenantTelegramText({ tenantId, telegramUserId, text }) {
    const [rows] = await db.query(
      'SELECT telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    const botToken = String(rows[0]?.telegram_bot_token || '').trim();
    if (!botToken) throw new Error('TG_BOT_NOT_CONFIGURED');
    if (!telegramUserId) throw new Error('TG_USER_NOT_LINKED');

    const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(telegramUserId),
        text: String(text || ''),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      throw new Error(`TG_SEND_FAILED:${data?.description || `HTTP_${res.status}`}`);
    }
    return true;
  }

  function attachProductThumbs(row) {
    const photos = Array.isArray(row?.photos) ? row.photos : [];
    const main = photos[0] || null;
    row.photo_thumb = getThumbUrl(main);
    return row;
  }

  function attachComboThumbs(combo) {
    combo.image_thumb = getThumbUrl(combo.image_url);
    if (Array.isArray(combo.grid_photos)) {
      combo.grid_photos_thumb = combo.grid_photos.map((u) => getThumbUrl(u));
    }
    return combo;
  }

  function publishStockChanged(tenantId, storeId, payload = {}) {
    try {
      if (!ordersEvents || typeof ordersEvents.publish !== 'function') return;
      ordersEvents.publish(tenantId, storeId, 'stock.changed', {
        tenant_id: Number(tenantId),
        store_id: Number(storeId),
        ...payload,
      });
    } catch (err) {
      console.error('publishStockChanged error:', err);
    }
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  const CHAT_ASSISTANT_GENDER_MALE = 'm';
  const CHAT_ASSISTANT_GENDER_FEMALE = 'f';
  const DEFAULT_CHAT_ASSISTANT_GENDER = CHAT_ASSISTANT_GENDER_MALE;
  const DEFAULT_CHAT_ASSISTANT_NAME = '\u041d\u044f\u043c-\u041d\u044f\u043c';
  const DEFAULT_CHAT_WELCOME_MESSAGE =
    '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u041d\u044f\u043c-\u041d\u044f\u043c!\n' +
    '\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' +
    '\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 ' +
    '\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 ' +
    '\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.';
  const DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE =
    '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u0446\u0430 \u041d\u044f\u043c-\u041d\u044f\u043c!\n' +
    '\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' +
    '\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 ' +
    '\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 ' +
    '\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.';
  const DEFAULT_CHAT_QUICK_QUESTIONS = [
    '\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?',
    '\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430',
    '\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430',
    '\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441',
  ];
  const CHAT_QUICK_QUESTIONS_MAX = 6;

  function normalizeAssistantGender(value) {
    const raw = str(value).trim().toLowerCase();
    if (raw === CHAT_ASSISTANT_GENDER_FEMALE || raw === 'f' || raw === 'female' || raw === '\u0436') {
      return CHAT_ASSISTANT_GENDER_FEMALE;
    }
    return DEFAULT_CHAT_ASSISTANT_GENDER;
  }

  function getDefaultWelcomeMessageByGender(gender) {
    return normalizeAssistantGender(gender) === CHAT_ASSISTANT_GENDER_FEMALE
      ? DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE
      : DEFAULT_CHAT_WELCOME_MESSAGE;
  }

  function parseTenantChatQuickQuestions(rawValue) {
    let parsed = [];
    if (Array.isArray(rawValue)) {
      parsed = rawValue;
    } else if (typeof rawValue === 'string') {
      try {
        const value = JSON.parse(rawValue);
        if (Array.isArray(value)) {
          parsed = value;
        }
      } catch {
        parsed = [];
      }
    }
    const normalized = parsed
      .map((item) => str(item).trim())
      .filter(Boolean)
      .slice(0, CHAT_QUICK_QUESTIONS_MAX);
    return normalized.length ? normalized : DEFAULT_CHAT_QUICK_QUESTIONS.slice();
  }

  function buildPublicTenantChatSettings(tenantRow) {
    const row = tenantRow && typeof tenantRow === 'object' ? tenantRow : {};
    const assistantGender = normalizeAssistantGender(row.chat_assistant_gender);
    const assistantName = str(row.chat_assistant_name).trim() || DEFAULT_CHAT_ASSISTANT_NAME;
    const welcomeMessage = str(row.chat_welcome_message) || getDefaultWelcomeMessageByGender(assistantGender);
    const chatWidgetRaw = row.chat_widget_enabled;
    const chatWidgetNorm = str(chatWidgetRaw).trim().toLowerCase();
    const isEnabled = !(
      chatWidgetRaw === false
      || chatWidgetRaw === 0
      || chatWidgetNorm === '0'
      || chatWidgetNorm === 'false'
    );
    const operatorName =
      str(row.chat_operator_name).trim()
      || str(row.site_name).trim()
      || str(row.name).trim()
      || '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440';
    const quickQuestions = parseTenantChatQuickQuestions(row.chat_quick_questions_json);
    return {
      assistant_name: assistantName,
      assistant_gender: assistantGender,
      welcome_message: welcomeMessage,
      operator_name: operatorName,
      quick_questions: quickQuestions,
      is_enabled: isEnabled,
    };
  }

  function normalizePhoneLookupCandidates(phoneRaw) {
    const sourceDigits = str(phoneRaw).replace(/[^\d]/g, '');
    if (!sourceDigits) return [];

    const digits = sourceDigits.slice(-32);
    const candidates = new Set();

    function pushVariant(value) {
      const normalized = String(helpers.normalizePhone(value) || '').replace(/[^\d]/g, '');
      if (normalized.length < 10) return;
      candidates.add(normalized);
    }

    function pushTenDigitVariants(tenDigits) {
      if (!/^\d{10}$/.test(tenDigits)) return;
      pushVariant(tenDigits);
      pushVariant(`7${tenDigits}`);
      pushVariant(`8${tenDigits}`);
    }

    pushVariant(digits);

    if (digits.length === 10) {
      pushTenDigitVariants(digits);
    }

    if (digits.length >= 11) {
      for (let idx = 0; idx <= digits.length - 11; idx += 1) {
        const seq11 = digits.slice(idx, idx + 11);
        if (/^[78]\d{10}$/.test(seq11)) {
          pushVariant(seq11);
          pushTenDigitVariants(seq11.slice(1));
        }
      }
      pushVariant(digits.slice(-11));
      pushTenDigitVariants(digits.slice(-10));
    }

    return Array.from(candidates).slice(0, 20);
  }
  router.get('/changes', (req, res) => {
    try {
      if (!ordersEvents || typeof ordersEvents.getChanges !== 'function') {
        return res.status(503).json({ ok: false, error: 'EVENTS_UNAVAILABLE' });
      }
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = req.query.since;
      const data = ordersEvents.getChanges(tenantId, storeId, since);
      return res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/unit-conversions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT id, from_unit_id, to_unit_id, factor, is_active
         FROM prod_unit_conversions
         WHERE tenant_id=? AND is_active=1`,
        [tenantId]
      );
      return res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/changes/wait', async (req, res) => {
    try {
      if (!ordersEvents || typeof ordersEvents.waitForChanges !== 'function') {
        return res.status(503).json({ ok: false, error: 'EVENTS_UNAVAILABLE' });
      }

      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const since = Number(req.query.since || 0);
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);
      const cursorNow = ordersEvents.getCurrentCursor(tenantId, storeId);

      if (Number.isFinite(since) && since > 0 && cursorNow > since) {
        return res.json({ ok: true, data: { changed: true, timeout: false, cursor: cursorNow } });
      }
      if ((!Number.isFinite(since) || since <= 0) && cursorNow > 0) {
        return res.json({ ok: true, data: { changed: true, timeout: false, cursor: cursorNow } });
      }

      const waitResult = await ordersEvents.waitForChanges(tenantId, storeId, timeoutMs);
      const cursor = Number(waitResult?.cursor || ordersEvents.getCurrentCursor(tenantId, storeId) || 0);
      const changed = Number.isFinite(cursor) && cursor > (Number.isFinite(since) ? since : 0);

      return res.json({
        ok: true,
        data: {
          changed,
          timeout: waitResult?.timeout === true,
          cursor,
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function parseVariantValueNumber(value) {
    const s = String(value ?? '').replace(',', '.');
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getProductIsAvailableSql(productAlias = 'p', stockAlias = 's') {
    return `
      (${stockAlias}.qty IS NULL OR ${stockAlias}.qty > 0)
      AND NOT EXISTS (
        SELECT 1
        FROM prod_product_ingredients i
        JOIN prod_product_stocks si
          ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
        WHERE i.tenant_id=${productAlias}.tenant_id AND i.product_id=${productAlias}.id
          AND si.qty IS NOT NULL AND si.qty <= 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM prod_option_assignments oa
        JOIN prod_option_groups og
          ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
        WHERE oa.tenant_id=${productAlias}.tenant_id
          AND oa.assign_type='product' AND oa.assign_id=${productAlias}.id
          AND oa.is_active=1
          AND og.is_active=1
          AND COALESCE(og.out_of_stock_action, 1)=0
          AND NOT EXISTS (
            SELECT 1
            FROM prod_option_items oi
            JOIN prod_products op
              ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
            LEFT JOIN prod_product_stocks ops
              ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
            WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
              AND oi.target_type='product'
              AND oi.is_active=1
              AND op.is_active=1
              AND op.site_visibility=1
              AND (ops.qty IS NULL OR ops.qty > 0)
              AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients ip
                JOIN prod_product_stocks ips
                  ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                  AND ips.qty IS NOT NULL AND ips.qty <= 0
              )
          )
      )
    `;
  }

  function getConversionFactorMap(tenantId, db) {
    const map = new Map();
    return async function getConversionFactor(fromUnitId, toUnitId) {
      if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) {
        return 1;
      }
      const key = `${Number(fromUnitId)}_${Number(toUnitId)}`;
      if (map.has(key)) {
        return map.get(key);
      }
      const [direct] = await db.query(
        `SELECT factor FROM prod_unit_conversions
         WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
        [tenantId, fromUnitId, toUnitId]
      );
      if (direct.length && direct[0].factor) {
        const f = Number(direct[0].factor);
        map.set(key, f);
        return f;
      }
      const [inverse] = await db.query(
        `SELECT factor FROM prod_unit_conversions
         WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
        [tenantId, toUnitId, fromUnitId]
      );
      if (inverse.length && inverse[0].factor) {
        const f = 1 / Number(inverse[0].factor);
        map.set(key, f);
        return f;
      }
      map.set(key, null);
      return null;
    };
  }

  async function computeDisplayPriceForProduct(product, variant, getConversionFactor, roundPrice) {
    const basePrice = Number(product.price || 0);

    if (!variant || !variant.values || !variant.values.length) {
      return roundPrice(basePrice);
    }

    const defaultIndex = variant.default_value_index != null ? Number(variant.default_value_index) : 0;
    const selectedIndex = defaultIndex >= 0 && defaultIndex < variant.values.length ? defaultIndex : 0;
    const value = variant.values[selectedIndex];
    const numericValue = parseVariantValueNumber(value);

    if (!Number.isFinite(numericValue)) {
      return roundPrice(basePrice);
    }

    const baseUnitId = Number(product.base_unit_id || product.unit_id || variant.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(variant.unit_id || 0);

    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) {
      return roundPrice(basePrice);
    }

    const factor = await getConversionFactor(variantUnitId, baseUnitId);

    if (factor == null) {
      return roundPrice(basePrice);
    }

    const qtyInBase = numericValue * Number(factor || 0);

    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) {
      return roundPrice(basePrice);
    }

    let unitPrice = basePrice * (qtyInBase / baseQty);

    const tiers = Array.isArray(variant.discount_tiers) ? variant.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === selectedIndex);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;

    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }

    return roundPrice(unitPrice);
  }

  /**
   * РњРёРЅРёРјР°Р»СЊРЅР°СЏ РІРѕР·РјРѕР¶РЅР°СЏ С†РµРЅР° С‚РѕРІР°СЂР° СЃ СѓС‡С‘С‚РѕРј РІР°СЂРёР°РЅС‚РѕРІ (РїРѕСЂС†РёР№/РѕР±СЉС‘РјРѕРІ).
   * Р•СЃР»Рё Сѓ С‚РѕРІР°СЂР° РµСЃС‚СЊ РІР°СЂРёР°РЅС‚С‹ вЂ” РїРµСЂРµР±РёСЂР°РµРј РІСЃРµ Р·РЅР°С‡РµРЅРёСЏ Рё РІРѕР·РІСЂР°С‰Р°РµРј РјРёРЅРёРјСѓРј; РёРЅР°С‡Рµ вЂ” Р±Р°Р·РѕРІСѓСЋ С†РµРЅСѓ.
   */
  async function computeMinPriceForProduct(product, variant, getConversionFactor, roundPrice) {
    const basePrice = Number(product.price || 0);
    if (!variant || !variant.values || !variant.values.length) return roundPrice(basePrice);

    const baseUnitId = Number(product.base_unit_id || product.unit_id || variant.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(variant.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return roundPrice(basePrice);

    const factor = await getConversionFactor(variantUnitId, baseUnitId);
    if (factor == null) return roundPrice(basePrice);

    const tiers = Array.isArray(variant.discount_tiers) ? variant.discount_tiers : [];
    let minPrice = basePrice;

    for (let selectedIndex = 0; selectedIndex < variant.values.length; selectedIndex++) {
      const value = variant.values[selectedIndex];
      const numericValue = parseVariantValueNumber(value);
      if (!Number.isFinite(numericValue)) continue;
      const qtyInBase = numericValue * Number(factor || 0);
      if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) continue;

      let unitPrice = basePrice * (qtyInBase / baseQty);
      const tier = tiers.find((t) => Number(t.sort_order) === selectedIndex);
      const discountPercent = Number(tier?.discount_percent || 0) || 0;
      if (discountPercent !== 0) {
        unitPrice = unitPrice * (1 - discountPercent / 100);
      }
      if (unitPrice < minPrice) minPrice = unitPrice;
    }

    return roundPrice(minPrice);
  }

  async function enrichProductsWithDisplayPrice(rows, tenantId) {
    if (!rows.length) return;
    const productIds = [...new Set(rows.map((r) => Number(r.id)).filter(Boolean))];
    if (!productIds.length) return;

    const [tenantRows] = await db.query(
      'SELECT price_rounding_mode, price_rounding_precision FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    const roundingModeRaw = tenantRows[0]?.price_rounding_mode || 'none';
    const roundingPrecisionRaw = Number(tenantRows[0]?.price_rounding_precision);
    const allowedRounding = new Set(['none', 'down', 'up', 'nearest']);
    const roundingMode = allowedRounding.has(roundingModeRaw) ? roundingModeRaw : 'none';
    const roundingPrecision = roundingPrecisionRaw === 0 ? 0 : 2;

    function roundPrice(value) {
      const n = Number(value || 0);
      if (!Number.isFinite(n)) return 0;
      if (roundingMode === 'none') return n;
      const factor = roundingPrecision > 0 ? Math.pow(10, roundingPrecision) : 1;
      if (roundingMode === 'up') return Math.ceil(n * factor) / factor;
      if (roundingMode === 'down') return Math.floor(n * factor) / factor;
      return Math.round(n * factor) / factor;
    }

    const getConversionFactor = getConversionFactorMap(tenantId, db);

    const placeholders = productIds.map(() => '?').join(',');
    const [vaRows] = await db.query(
      `SELECT va.product_id, va.variant_group_id,
              COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
              vg.unit_id, vg.values, vg.sort_order
       FROM prod_variant_assignments va
       JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
       WHERE va.tenant_id = ? AND va.product_id IN (${placeholders})
         AND va.is_active = 1 AND vg.is_active = 1
       ORDER BY va.sort_order ASC, vg.sort_order ASC`,
      [tenantId, ...productIds]
    );

    const variantGroupIds = [...new Set(vaRows.map((r) => Number(r.variant_group_id)).filter(Boolean))];
    let tiersByGroup = new Map();
    if (variantGroupIds.length) {
      const tierPlaceholders = variantGroupIds.map(() => '?').join(',');
      const [tierRows] = await db.query(
        `SELECT variant_group_id, min_quantity, discount_percent, sort_order
         FROM prod_variant_discount_tiers
         WHERE tenant_id = ? AND variant_group_id IN (${tierPlaceholders})
         ORDER BY variant_group_id, sort_order ASC`,
        [tenantId, ...variantGroupIds]
      );
      for (const t of tierRows) {
        const gid = Number(t.variant_group_id);
        if (!tiersByGroup.has(gid)) tiersByGroup.set(gid, []);
        tiersByGroup.get(gid).push({
          min_quantity: t.min_quantity,
          discount_percent: t.discount_percent,
          sort_order: t.sort_order,
        });
      }
    }

    const variantByProductId = new Map();
    for (const r of vaRows) {
      const pid = Number(r.product_id);
      if (variantByProductId.has(pid)) continue;
      const values = safeJsonArray(r.values);
      if (!values.length) continue;
      const defaultIdx = r.default_value_index != null ? Number(r.default_value_index) : 0;
      const tiers = tiersByGroup.get(Number(r.variant_group_id)) || [];
      variantByProductId.set(pid, {
        unit_id: r.unit_id,
        values,
        default_value_index: defaultIdx >= 0 && defaultIdx < values.length ? defaultIdx : 0,
        discount_tiers: tiers,
      });
    }

    for (const row of rows) {
      const variant = variantByProductId.get(Number(row.id));
      row.display_price = await computeDisplayPriceForProduct(row, variant, getConversionFactor, roundPrice);
    }
  }

  /**
   * РћР±РѕРіР°С‚РёС‚СЊ С‚РѕРІР°СЂС‹ РёРЅС„РѕСЂРјР°С†РёРµР№ Рѕ СЃРєРёРґРєР°С…
   * @param {Object[]} rows - РјР°СЃСЃРёРІ С‚РѕРІР°СЂРѕРІ
   * @param {number} tenantId
   * @param {number} storeId
   */
  async function enrichProductsWithDiscounts(rows, tenantId, storeId) {
    if (!rows.length) return;
    
    const productIds = rows.map(r => Number(r.id)).filter(Boolean);
    if (!productIds.length) return;

    // РџРѕР»СѓС‡Р°РµРј РєР°С‚РµРіРѕСЂРёРё РґР»СЏ РєР°Р¶РґРѕРіРѕ С‚РѕРІР°СЂР°
    const placeholders = productIds.map(() => '?').join(',');
    const [catRows] = await db.query(
      `SELECT product_id, category_id FROM prod_product_categories
       WHERE tenant_id = ? AND product_id IN (${placeholders})`,
      [tenantId, ...productIds]
    );
    
    const catByProduct = new Map();
    for (const r of catRows) {
      const pid = Number(r.product_id);
      if (!catByProduct.has(pid)) catByProduct.set(pid, []);
      catByProduct.get(pid).push(Number(r.category_id));
    }

    // РџРѕР»СѓС‡Р°РµРј РІСЃРµ Р°РєС‚РёРІРЅС‹Рµ СЃРєРёРґРєРё РЅР° С‚РѕРІР°СЂС‹ Рё РєР°С‚РµРіРѕСЂРёРё
    const [discountRows] = await db.query(
      `SELECT d.*, dp.product_id, dp.category_id, dp.combo_id
       FROM mkt_discounts d
       JOIN mkt_discount_products dp ON dp.discount_id = d.id AND dp.tenant_id = d.tenant_id
       WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_active = 1
         AND (dp.product_id IN (${placeholders}) OR dp.category_id IS NOT NULL)`,
      [tenantId, storeId, ...productIds]
    );

    // Р“СЂСѓРїРїРёСЂСѓРµРј СЃРєРёРґРєРё РїРѕ С‚РѕРІР°СЂР°Рј Рё РєР°С‚РµРіРѕСЂРёСЏРј
    const discountsByProduct = new Map();
    const discountsByCategory = new Map();

    for (const disc of discountRows) {
      if (disc.product_id) {
        const pid = Number(disc.product_id);
        if (!discountsByProduct.has(pid)) discountsByProduct.set(pid, []);
        discountsByProduct.get(pid).push(disc);
      }
      if (disc.category_id) {
        const cid = Number(disc.category_id);
        if (!discountsByCategory.has(cid)) discountsByCategory.set(cid, []);
        discountsByCategory.get(cid).push(disc);
      }
    }

    // РџСЂРёРјРµРЅСЏРµРј СЃРєРёРґРєРё Рє РєР°Р¶РґРѕРјСѓ С‚РѕРІР°СЂСѓ
    for (const row of rows) {
      const pid = Number(row.id);
      const discounts = [];
      const seenIds = new Set();

      // РџСЂСЏРјС‹Рµ СЃРєРёРґРєРё РЅР° С‚РѕРІР°СЂ
      const directDiscounts = discountsByProduct.get(pid) || [];
      for (const d of directDiscounts) {
        if (!seenIds.has(d.id) && discountHelpers.isDiscountActive(d)) {
          discounts.push(d);
          seenIds.add(d.id);
        }
      }

      // РЎРєРёРґРєРё РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј С‚РѕРІР°СЂР°
      const cats = catByProduct.get(pid) || [];
      for (const catId of cats) {
        const catDiscounts = discountsByCategory.get(catId) || [];
        for (const d of catDiscounts) {
          if (!seenIds.has(d.id) && discountHelpers.isDiscountActive(d)) {
            discounts.push(d);
            seenIds.add(d.id);
          }
        }
      }

      if (discounts.length > 0) {
        // РЎРѕСЂС‚РёСЂСѓРµРј РїРѕ РїСЂРёРѕСЂРёС‚РµС‚Сѓ
        discounts.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const best = discounts[0];
        const price = Number(row.display_price || row.price || 0);
        
        row.discount = {
          id: best.id,
          title: best.title,
          discount_type: best.discount_type,
          discount_value: Number(best.discount_value),
          discount_amount: discountHelpers.calculateDiscount(
            price,
            best.discount_type,
            Number(best.discount_value),
            best.max_discount_amount ? Number(best.max_discount_amount) : null
          ),
        };
        row.original_price = price;
        row.discounted_price = Math.max(0, price - row.discount.discount_amount);
      } else {
        row.discount = null;
        row.original_price = null;
        row.discounted_price = null;
      }
    }
  }

  function parseBirthdayDDMMYYYY(input) {
    const s = str(input).trim();
    // dd.mm.yyyy
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);

    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
    if (yyyy < 1900 || yyyy > 2100) return null;
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;

    // check real date
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== (mm - 1) || d.getUTCDate() !== dd) return null;

    // MySQL DATE
    const MM = String(mm).padStart(2, '0');
    const DD = String(dd).padStart(2, '0');
    return `${yyyy}-${MM}-${DD}`;
  }

  function makeToken32() {
    // session/public id вЂ“ 32 hex or uuid without dashes
    if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '');
    return crypto.randomBytes(16).toString('hex');
  }

  function makeUuid36() {
    // nice public id (fits varchar(36))
    if (crypto.randomUUID) return crypto.randomUUID();
    const hex = crypto.randomBytes(16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function dualWriteAuthToken(connOrDb, payload) {
    try {
      await connOrDb.query(
        `INSERT INTO cust_customer_auth_tokens
         (tenant_id, customer_id, provider, purpose, token, expires_at, used_at, provider_user_id, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          Number(payload.tenantId),
          payload.customerId == null ? null : Number(payload.customerId),
          String(payload.provider),
          String(payload.purpose),
          String(payload.token),
          payload.expiresAt,
          payload.usedAt || null,
          payload.providerUserId || null,
          payload.phone || null,
          payload.createdAt || null,
        ]
      );
    } catch (err) {
      console.error('AUTH_DUAL_WRITE_TOKEN_FAILED:', err.message || err);
    }
  }

  async function dualWriteSession(connOrDb, payload) {
    try {
      await connOrDb.query(
        `INSERT INTO cust_customer_sessions
         (tenant_id, store_id, customer_id, token, expires_at, is_active, user_agent, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           expires_at=VALUES(expires_at),
           is_active=VALUES(is_active),
           user_agent=COALESCE(VALUES(user_agent), user_agent),
           ip_address=COALESCE(VALUES(ip_address), ip_address)`,
        [
          Number(payload.tenantId),
          Number(payload.storeId || 1),
          Number(payload.customerId),
          String(payload.token),
          payload.expiresAt || null,
          Number(payload.isActive == null ? 1 : payload.isActive),
          payload.userAgent || null,
          payload.ipAddress || null,
        ]
      );
    } catch (err) {
      console.error('AUTH_DUAL_WRITE_SESSION_FAILED:', err.message || err);
    }
  }

  async function getActiveStatusIdDefault(tenantId, storeId) {
    // РїСЂРѕР±СѓРµРј "new", РµСЃР»Рё РЅРµС‚ вЂ” РїРµСЂРІС‹Р№ Р°РєС‚РёРІРЅС‹Р№ РїРѕ sort
    const [r1] = await db.query(
      `SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND code='new' AND is_active=1 LIMIT 1`,
      [tenantId, storeId]
    );
    if (r1.length) return Number(r1[0].id);

    const [r2] = await db.query(
      `SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY sort ASC, id ASC LIMIT 1`,
      [tenantId, storeId]
    );
    return r2.length ? Number(r2[0].id) : null;
  }

  async function getCustomerByToken(tenantId, token) {
    if (!token) return null;
    const sessionTable = 'cust_customer_sessions';
    const [rows] = await db.query(
      `SELECT
         s.id AS session_id,
         s.token,
         s.expires_at,
         s.is_active AS session_active,
         c.id AS customer_id,
         c.name,
         c.phone,
         DATE_FORMAT(c.birthday, '%Y-%m-%d') AS birthday,
         c.photo,
         c.is_active
       FROM ${sessionTable} s
       JOIN cust_customers c
         ON c.tenant_id=s.tenant_id AND c.id=s.customer_id
       WHERE s.tenant_id=? AND s.token=? AND s.is_active=1
       LIMIT 1`,
      [tenantId, token]
    );

    if (!rows.length) return null;

    const r = rows[0];
    if (Number(r.is_active || 0) !== 1) return null;

    if (r.expires_at) {
      const exp = new Date(r.expires_at);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) return null;
    }

    // Sliding session: on each valid request reset TTL to 30 days from now.
    // This does not accumulate beyond 30 days ahead because we set from NOW().
    try {
      await db.query(
        `UPDATE ${sessionTable}
         SET expires_at=DATE_ADD(NOW(), INTERVAL 30 DAY)
         WHERE id=? AND tenant_id=? AND is_active=1`,
        [Number(r.session_id), tenantId]
      );
      await db.query(
        `UPDATE cust_customer_sessions
         SET expires_at=DATE_ADD(NOW(), INTERVAL 30 DAY)
         WHERE tenant_id=? AND token=? AND is_active=1`,
        [tenantId, token]
      );
    } catch {}

    return {
      id: Number(r.customer_id),
      name: r.name,
      phone: r.phone,
      birthday: r.birthday || null,
      photo: r.photo || null,
    };
  }


  async function pickIdByCodeOrFirstActive({ tenantId, storeId, table, code }) {
    const c = str(code).trim();
    if (c) {
      const [r] = await db.query(
        `SELECT id FROM ${table} WHERE tenant_id=? AND store_id=? AND code=? AND is_active=1 LIMIT 1`,
        [tenantId, storeId, c]
      );
      if (r.length) return Number(r[0].id);
    }

    const [r2] = await db.query(
      `SELECT id FROM ${table} WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY sort ASC, id ASC LIMIT 1`,
      [tenantId, storeId]
    );
    return r2.length ? Number(r2[0].id) : null;
  }

  async function getStoreTimezone(tenantId, storeId) {
    let storeTimezone = '+0';
    if (storeId) {
      const [rows] = await db.query(
        'SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (rows[0]?.timezone) {
        storeTimezone = rows[0].timezone;
      }
    }
    if (!storeTimezone || storeTimezone === '+0') {
      const [tenantRows] = await db.query(
        'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (tenantRows[0]?.timezone) {
        storeTimezone = tenantRows[0].timezone;
      }
    }
    return storeTimezone || '+0';
  }

  async function fetchOrderPayload(tenantId, storeId, id, opts = {}) {
    const storeTimezone = opts.storeTimezone ?? await getStoreTimezone(tenantId, storeId);
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.public_id,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_utc,
        o.customer_id,
        o.customer_name,
        o.customer_phone,
        o.address,
        o.comment,
        o.address_comment,
        o.cutlery_qty,
        o.change_from,
        o.total_price,
        o.delivery_cost,
        o.discount_amount,
        o.discounts_json,
        o.items,
        DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
        o.delivery_type_id,
        o.payment_id,
        o.time_option_id,
        o.status_id,

        s.code AS statusCode,
        s.title AS statusTitle,

        p.code AS paymentCode,
        p.title AS paymentTitle,

        m.code AS methodCode,
        m.title AS methodTitle,

        t.code AS timeOptionCode,
        t.title AS timeOptionTitle,

        ca.comment AS address_comment_from_cust
      FROM order_orders o
      LEFT JOIN order_statuses s
        ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
      LEFT JOIN order_payments p
        ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
      LEFT JOIN order_delivery_types m
        ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
      LEFT JOIN order_time_options t
        ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
      LEFT JOIN cust_customer_addresses ca
        ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
      WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
      LIMIT 1
      `,
      [tenantId, storeId, id]
    );

    if (!rows.length) return null;
    const r = rows[0];

    let items = [];
    try {
      const parsed = r.items ? JSON.parse(r.items) : [];
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
    let discountsJson = [];
    try {
      const parsedDiscounts = r.discounts_json ? JSON.parse(r.discounts_json) : [];
      if (Array.isArray(parsedDiscounts)) discountsJson = parsedDiscounts;
    } catch {}
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalPrice = Number(r.total_price || 0);
    let deliveryCost = 0;
    if ((r.methodCode ?? null) === 'delivery') {
      const diff = totalPrice - itemsTotal;
      const computed = diff > 0 ? diff : 0;
      const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
      deliveryCost = stored && stored > 0 ? stored : computed;
    }

    return {
      id: r.id,
      public_id: r.public_id || null,
      created_at: helpers.utcToStoreDateTime(r.created_at_utc ?? r.created_at, storeTimezone),
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      address: r.address,
      comment: r.comment,
      address_comment: (r.address_comment && String(r.address_comment).trim()) ? r.address_comment : (r.address_comment_from_cust && String(r.address_comment_from_cust).trim()) ? r.address_comment_from_cust : null,
      cutlery_qty: r.cutlery_qty,
      change_from: r.change_from,
      total_price: totalPrice,
      items_total: itemsTotal,
      delivery_cost: deliveryCost,
      discount_amount: Number(r.discount_amount || 0),
      discounts_json: discountsJson,
      items,
      scheduled_at: r.scheduled_at,
      delivery_type_id: r.delivery_type_id,
      payment_id: r.payment_id,
      time_option_id: r.time_option_id,
      status_id: r.status_id,

      status_code: r.statusCode ?? null,
      status_title: r.statusTitle ?? null,

      payment_code: r.paymentCode ?? null,
      payment_title: r.paymentTitle ?? null,

      method_code: r.methodCode ?? null,
      method_title: r.methodTitle ?? null,

      time_option_code: r.timeOptionCode ?? null,
      time_option_title: r.timeOptionTitle ?? null,
    };
  }

  function toPositiveIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
  }

  function toNonNegativeIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.trunc(n);
  }

  function toFiniteNumberOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeFavoriteIngredients(rawList, maxItems = 64) {
    const list = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const ingredientId = toPositiveIntOrNull(raw.ingredient_id || raw.product_id || raw.id);
      if (!ingredientId) continue;
      const quantityRaw = Number(raw.quantity ?? raw.qty ?? 0);
      const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
      out.push({
        ingredient_id: ingredientId,
        ingredient_name: str(raw.ingredient_name || raw.name || '').trim(),
        name: str(raw.name || raw.ingredient_name || '').trim(),
        quantity,
        qty: quantity,
        unit_id: toPositiveIntOrNull(raw.unit_id),
        unit_label: str(raw.unit_label || raw.unit || '').trim(),
        unit: str(raw.unit || raw.unit_label || '').trim(),
      });
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeFavoriteOptionItems(rawList, maxItems = 64) {
    const list = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const optionId = toPositiveIntOrNull(raw.id || raw.option_item_id);
      if (!optionId) continue;

      const qtyRaw = Number(raw.qty ?? raw.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;
      const targetProductId = toPositiveIntOrNull(raw.target_product_id || raw.product_id);
      const variantSource =
        raw.variant && typeof raw.variant === 'object'
          ? raw.variant
          : (Array.isArray(raw.variants) ? raw.variants[0] : null);
      const variantGroupId = toPositiveIntOrNull(raw.variant_group_id ?? variantSource?.variant_group_id);
      const variantValueIndex = toNonNegativeIntOrNull(raw.variant_value_index ?? variantSource?.variant_value_index);
      out.push({
        id: optionId,
        title: str(raw.title || raw.name || '').trim(),
        name: str(raw.name || raw.title || '').trim(),
        price: Number(raw.price || 0),
        qty,
        quantity: qty,
        target_product_id: targetProductId,
        product_id: targetProductId,
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        variant_label: str(raw.variant_label || variantSource?.label || variantSource?.value || '').trim(),
        variant_price_diff: Number(raw.variant_price_diff || 0),
      });
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeFavoriteComboSelections(rawList, maxItems = 24) {
    const list = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const productId = toPositiveIntOrNull(raw.product_id || raw.id || raw.product?.id);
      if (!productId) continue;
      const variantSource =
        raw.variant && typeof raw.variant === 'object'
          ? raw.variant
          : (Array.isArray(raw.variants) ? raw.variants[0] : null);
      const rawIngredients = Array.isArray(raw.ingredients_display)
        ? raw.ingredients_display
        : (Array.isArray(raw.ingredients) ? raw.ingredients : []);
      out.push({
        product_id: productId,
        product_name: str(raw.product_name || raw.name || '').trim(),
        product_photo: str(raw.product_photo || raw.photo || '').trim(),
        variant_label: str(raw.variant_label || variantSource?.label || variantSource?.value || '').trim(),
        variant_group_id: toPositiveIntOrNull(raw.variant_group_id ?? variantSource?.variant_group_id),
        variant_value_index: toNonNegativeIntOrNull(raw.variant_value_index ?? variantSource?.variant_value_index),
        variant_group_title: str(raw.variant_group_title || variantSource?.group_title || '').trim(),
        variant_unit: str(raw.variant_unit || variantSource?.unit || '').trim(),
        unit_id: toPositiveIntOrNull(raw.unit_id),
        unit_price_override: toFiniteNumberOrNull(raw.unit_price_override),
        unit_price_before_discount: toFiniteNumberOrNull(raw.unit_price_before_discount),
        ingredients_display: normalizeFavoriteIngredients(rawIngredients, 64).map((ing) => ({
          ingredient_id: ing.ingredient_id,
          name: str(ing.name || ing.ingredient_name || '').trim(),
          quantity: ing.quantity,
          qty: ing.qty,
          unit_id: ing.unit_id,
          unit: str(ing.unit || ing.unit_label || '').trim(),
        })),
      });
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeFavoriteItemSnapshot(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const typeRaw = str(rawItem.type || '').trim().toLowerCase();
    const hasComboId = toPositiveIntOrNull(rawItem.combo_id || rawItem.combo?.id);

    if (typeRaw === 'combo' || hasComboId) {
      const comboId = hasComboId;
      if (!comboId) return null;
      const qtyRaw = Number(rawItem.qty ?? rawItem.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;
      const selections = normalizeFavoriteComboSelections(rawItem.selections, 24);
      const photos = safeJsonArray(rawItem.photos);
      const derivedPhotos = selections
        .map((sel) => str(sel.product_photo || '').trim())
        .filter(Boolean);
      const lineTotalRaw = Number(rawItem.line_total);
      const priceRaw = Number(rawItem.price);
      const unitPrice = Number.isFinite(priceRaw)
        ? priceRaw
        : (qty > 0 && Number.isFinite(lineTotalRaw) ? lineTotalRaw / qty : 0);
      const lineTotal = Number.isFinite(lineTotalRaw)
        ? lineTotalRaw
        : Number(unitPrice * qty);

      return {
        type: 'combo',
        combo_id: comboId,
        combo_title: str(rawItem.combo_title || rawItem.name || '').trim() || 'РљРѕРјР±Рѕ',
        name: str(rawItem.name || rawItem.combo_title || '').trim() || 'РљРѕРјР±Рѕ',
        qty,
        price: Number(unitPrice || 0),
        line_total: Number(lineTotal || 0),
        old_line_total: Number(rawItem.old_line_total || 0),
        unit_price_before_discount: Number(rawItem.unit_price_before_discount || 0),
        photos: photos.length ? photos : derivedPhotos,
        selections,
      };
    }

    const productId = toPositiveIntOrNull(rawItem.product_id || rawItem.id || rawItem.product?.id);
    if (!productId) return null;
    const qtyRaw = Number(rawItem.qty ?? rawItem.quantity ?? 1);
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;

    const rawOptions = [
      ...(Array.isArray(rawItem.option_items) ? rawItem.option_items : []),
      ...(Array.isArray(rawItem.options) ? rawItem.options : []),
    ];
    const options = normalizeFavoriteOptionItems(rawOptions, 64);
    const ingredients = normalizeFavoriteIngredients(rawItem.ingredients, 64);

    const variantFromArray = Array.isArray(rawItem.variants) ? rawItem.variants[0] : null;
    const variantGroupId = toPositiveIntOrNull(rawItem.variant_group_id ?? variantFromArray?.variant_group_id);
    const variantValueIndex = toNonNegativeIntOrNull(rawItem.variant_value_index ?? variantFromArray?.variant_value_index);
    const variantLabel = str(
      rawItem.variant_label ||
      variantFromArray?.label ||
      variantFromArray?.value ||
      ''
    ).trim();
    const variantGroupTitle = str(variantFromArray?.group_title || '').trim();
    const variantValue = str(variantFromArray?.value || variantLabel || '').trim();

    const hasVariantSelection =
      variantGroupId &&
      variantValueIndex !== null &&
      (variantLabel || variantValue);

    const variants = hasVariantSelection
      ? [{
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        group_title: variantGroupTitle,
        value: variantValue || variantLabel,
        label: variantLabel || variantValue,
        price_diff: Number(variantFromArray?.price_diff || 0),
      }]
      : [];

    const lineTotalRaw = Number(rawItem.line_total);
    const priceRaw = Number(rawItem.price);
    const unitPrice = Number.isFinite(priceRaw)
      ? priceRaw
      : (qty > 0 && Number.isFinite(lineTotalRaw) ? lineTotalRaw / qty : 0);
    const lineTotal = Number.isFinite(lineTotalRaw)
      ? lineTotalRaw
      : Number(unitPrice * qty);

    return {
      type: 'product',
      product_id: productId,
      name: str(rawItem.name || rawItem.product_name || '').trim() || 'РўРѕРІР°СЂ',
      qty,
      price: Number(unitPrice || 0),
      old_price: Number(rawItem.old_price || 0),
      line_total: Number(lineTotal || 0),
      photos: safeJsonArray(rawItem.photos),
      option_item_ids: options.map((opt) => opt.id),
      options,
      option_items: options,
      ingredients,
      variant_group_id: hasVariantSelection ? variantGroupId : null,
      variant_value_index: hasVariantSelection ? variantValueIndex : null,
      variant_label: hasVariantSelection ? variantLabel : '',
      variants,
      discount: rawItem.discount && typeof rawItem.discount === 'object'
        ? {
          original_line_total: toFiniteNumberOrNull(rawItem.discount.original_line_total),
        }
        : null,
    };
  }

  function buildFavoriteSignaturePayload(item) {
    if (!item || typeof item !== 'object') return null;
    if (str(item.type).toLowerCase() === 'combo') {
      const comboId = toPositiveIntOrNull(item.combo_id);
      if (!comboId) return null;
      const selections = (Array.isArray(item.selections) ? item.selections : []).map((sel) => {
        const ingredients = (Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [])
          .map((ing) => ({
            ingredient_id: toPositiveIntOrNull(ing.ingredient_id),
            qty: Number(ing.qty ?? ing.quantity ?? 0),
          }))
          .filter((ing) => ing.ingredient_id)
          .sort((a, b) => a.ingredient_id - b.ingredient_id);
        return {
          product_id: toPositiveIntOrNull(sel.product_id),
          variant_group_id: toPositiveIntOrNull(sel.variant_group_id),
          variant_value_index: toNonNegativeIntOrNull(sel.variant_value_index),
          ingredients,
        };
      });
      return {
        type: 'combo',
        combo_id: comboId,
        selections,
      };
    }

    const productId = toPositiveIntOrNull(item.product_id);
    if (!productId) return null;
    const options = (Array.isArray(item.option_items) ? item.option_items : [])
      .map((opt) => ({
        id: toPositiveIntOrNull(opt.id),
        qty: Math.max(1, Number(opt.qty ?? opt.quantity ?? 1)),
        target_product_id: toPositiveIntOrNull(opt.target_product_id || opt.product_id),
        variant_group_id: toPositiveIntOrNull(opt.variant_group_id),
        variant_value_index: toNonNegativeIntOrNull(opt.variant_value_index),
      }))
      .filter((opt) => opt.id)
      .sort((a, b) => (
        a.id - b.id ||
        Number(a.target_product_id || 0) - Number(b.target_product_id || 0) ||
        Number(a.variant_group_id || 0) - Number(b.variant_group_id || 0) ||
        Number(a.variant_value_index || 0) - Number(b.variant_value_index || 0)
      ));

    const ingredients = (Array.isArray(item.ingredients) ? item.ingredients : [])
      .map((ing) => ({
        ingredient_id: toPositiveIntOrNull(ing.ingredient_id || ing.product_id),
        qty: Number(ing.qty ?? ing.quantity ?? 0),
      }))
      .filter((ing) => ing.ingredient_id)
      .sort((a, b) => a.ingredient_id - b.ingredient_id);

    return {
      type: 'product',
      product_id: productId,
      variant_group_id: toPositiveIntOrNull(item.variant_group_id),
      variant_value_index: toNonNegativeIntOrNull(item.variant_value_index),
      options,
      ingredients,
    };
  }

  function buildFavoriteSignature(item) {
    const payload = buildFavoriteSignaturePayload(item);
    if (!payload) return null;
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  function extractFavoritePreview(item) {
    const snapshot = item && typeof item === 'object' ? item : {};
    const isCombo = str(snapshot.type || '').toLowerCase() === 'combo';
    if (isCombo) {
      const comboPhotos = safeJsonArray(snapshot.photos);
      const fallbackPhoto = (Array.isArray(snapshot.selections) ? snapshot.selections : [])
        .map((sel) => str(sel?.product_photo || '').trim())
        .find(Boolean) || null;
      return {
        itemType: 'combo',
        productId: null,
        comboId: toPositiveIntOrNull(snapshot.combo_id),
        title: str(snapshot.combo_title || snapshot.name || '').trim() || 'РљРѕРјР±Рѕ',
        photo: comboPhotos[0] || fallbackPhoto,
      };
    }
    const photos = safeJsonArray(snapshot.photos);
    return {
      itemType: 'product',
      productId: toPositiveIntOrNull(snapshot.product_id),
      comboId: null,
      title: str(snapshot.name || '').trim() || 'РўРѕРІР°СЂ',
      photo: photos[0] || null,
    };
  }

  function parseFavoriteItemJson(rawJson) {
    if (!rawJson) return null;
    if (typeof rawJson === 'object') return rawJson;
    if (typeof rawJson !== 'string') return null;
    try {
      const parsed = JSON.parse(rawJson);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  // ------------------------------
  // AUTH
  // ------------------------------

  // POST /api/public/auth/phone-status
  // body: { phone }
  router.post('/auth/phone-status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const phone = helpers.normalizePhone(str(req.body.phone));
      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const [rows] = await db.query(
        `SELECT id, phone_verified_at
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );
      if (!rows.length) {
        return res.json({ ok: true, exists: false, requires_messenger_login: false });
      }

      const row = rows[0];
      const [tenantRows] = await db.query(
        `SELECT tg_login_enabled, max_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const tenantCfg = tenantRows[0] || {};
      const hasMessengerLogin = Number(tenantCfg.tg_login_enabled || 0) === 1 || Number(tenantCfg.max_login_enabled || 0) === 1;

      return res.json({
        ok: true,
        exists: true,
        requires_messenger_login: Boolean(row.phone_verified_at) && hasMessengerLogin,
      });
    } catch (e) {
      console.error('AUTH_PHONE_STATUS_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/messenger-code/send
  // body: { phone }
  router.post('/auth/messenger-code/send', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const phone = helpers.normalizePhone(str(req.body.phone));
      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const [rows] = await db.query(
        `SELECT id, is_active, phone_verified_at, telegram_user_id, max_user_id
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      const row = rows[0];
      if (Number(row.is_active || 0) !== 1) return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
      if (!row.phone_verified_at) return res.status(409).json({ ok: false, error: 'BIRTHDAY_LOGIN_REQUIRED' });

      const [tenantRows] = await db.query(
        `SELECT tg_login_enabled, max_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const tenantCfg = tenantRows[0] || {};
      const tgEnabled = Number(tenantCfg.tg_login_enabled || 0) === 1;
      const maxEnabled = Number(tenantCfg.max_login_enabled || 0) === 1;

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.query(
        `UPDATE cust_customers
         SET phone_verify_code=?, phone_verify_expires_at=?, updated_at=NOW()
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [code, expiresAt, tenantId, Number(row.id)]
      );

      const messageText = `\u041a\u043e\u0434 \u0432\u0445\u043e\u0434\u0430: ${code}. \u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f: 24 \u0447\u0430\u0441\u0430.`;
      let sentVia = null;
      let lastSendErr = null;

      // Priority: MAX (if tenant enabled) -> Telegram (fallback if tenant enabled)
      if (maxEnabled && row.max_user_id) {
        try {
          await sendMaxMessage({
            db,
            tenantId,
            maxUserId: row.max_user_id,
            text: messageText,
          });
          sentVia = 'max';
        } catch (maxErr) {
          lastSendErr = maxErr;
        }
      }
      if (!sentVia && tgEnabled && row.telegram_user_id) {
        try {
          await sendTenantTelegramText({
            tenantId,
            telegramUserId: row.telegram_user_id,
            text: messageText,
          });
          sentVia = 'telegram';
        } catch (tgErr) {
          lastSendErr = tgErr;
        }
      }
      if (!sentVia) {
        if (!tgEnabled && !maxEnabled) {
          return res.status(409).json({ ok: false, error: 'MESSENGER_LOGIN_DISABLED' });
        }
        if ((maxEnabled && !row.max_user_id) && (tgEnabled && !row.telegram_user_id)) {
          return res.status(409).json({ ok: false, error: 'MESSENGER_NOT_LINKED' });
        }
        if (lastSendErr) throw lastSendErr;
        return res.status(409).json({ ok: false, error: 'MESSENGER_NOT_AVAILABLE' });
      }

      return res.json({ ok: true, sent_via: sentVia, ttl_sec: 86400 });
    } catch (e) {
      console.error('AUTH_MESSENGER_CODE_SEND_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'SEND_FAILED' });
    }
  });

  // POST /api/public/auth/messenger-code/verify
  // body: { phone, code }
  router.post('/auth/messenger-code/verify', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const phone = helpers.normalizePhone(str(req.body.phone));
      const code = String(req.body?.code || '').replace(/\D/g, '').slice(0, 4);
      if (!phone || phone.length < 10) return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      if (code.length !== 4) return res.status(400).json({ ok: false, error: 'CODE_INVALID' });

      const [rows] = await db.query(
        `SELECT id, name, phone, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday, photo,
                is_active, phone_verified_at, phone_verify_code, phone_verify_expires_at
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      const row = rows[0];
      if (Number(row.is_active || 0) !== 1) return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
      if (!row.phone_verified_at) return res.status(409).json({ ok: false, error: 'BIRTHDAY_LOGIN_REQUIRED' });
      if (!row.phone_verify_code || !row.phone_verify_expires_at) {
        return res.status(400).json({ ok: false, error: 'CODE_NOT_REQUESTED' });
      }
      if (Date.now() > new Date(row.phone_verify_expires_at).getTime()) {
        return res.status(400).json({ ok: false, error: 'CODE_EXPIRED' });
      }
      if (String(row.phone_verify_code) !== code) {
        return res.status(400).json({ ok: false, error: 'CODE_INVALID' });
      }

      const customerId = Number(row.id);
      const token = makeToken32();
      await dualWriteSession(db, {
        tenantId,
        storeId: 1,
        customerId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: 1,
      });

      await db.query(
        `UPDATE cust_customers
         SET phone_verify_code=NULL, phone_verify_expires_at=NULL, updated_at=NOW()
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );

      return res.json({
        ok: true,
        token,
        customer: {
          id: row.id,
          name: row.name,
          phone: row.phone,
          birthday: row.birthday || null,
          photo: row.photo || null,
        },
      });
    } catch (e) {
      console.error('AUTH_MESSENGER_CODE_VERIFY_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/login
  // body: { phone, birthday } ; birthday = dd.mm.yyyy
  router.post('/auth/login', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const phoneRaw = str(req.body.phone);
      const phone = helpers.normalizePhone(phoneRaw);

      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const birthday = parseBirthdayDDMMYYYY(req.body.birthday);
      if (!birthday) {
        return res.status(400).json({ ok: false, error: 'BIRTHDAY_REQUIRED' });
      }

      // РёС‰РµРј РєР»РёРµРЅС‚Р°
      const [ex] = await db.query(
        `SELECT c.id, c.name, c.phone, DATE_FORMAT(c.birthday, '%Y-%m-%d') AS birthday, c.is_active, c.phone_verified_at,
                t.tg_login_enabled, t.max_login_enabled
         FROM cust_customers c
         JOIN ten_tenants t ON t.id = c.tenant_id
         WHERE c.tenant_id=? AND c.phone=?
         LIMIT 1`,
        [tenantId, phone]
      );

      let customerId = null;

      if (!ex.length) {
        // СЃРѕР·РґР°С‘Рј РЅРѕРІРѕРіРѕ РєР»РёРµРЅС‚Р°
        const [ins] = await db.query(
          `INSERT INTO cust_customers
           (tenant_id, name, phone, birthday, is_active, registration_date)
           VALUES (?,?,?,?,1, CURDATE())`,
          [tenantId, 'РљР»РёРµРЅС‚', phone, birthday]
        );
        customerId = Number(ins.insertId);
      } else {
        const c = ex[0];
        if (Number(c.is_active || 0) !== 1) {
          return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
        }
        const hasMessengerLogin = Number(c.tg_login_enabled || 0) === 1 || Number(c.max_login_enabled || 0) === 1;
        if (c.phone_verified_at && hasMessengerLogin) {
          return res.status(403).json({ ok: false, error: 'MESSENGER_LOGIN_REQUIRED' });
        }

        customerId = Number(c.id);

        // РµСЃР»Рё birthday СѓР¶Рµ РµСЃС‚СЊ вЂ” РїСЂРѕРІРµСЂСЏРµРј
        if (c.birthday && String(c.birthday) !== String(birthday)) {
          return res.status(401).json({ ok: false, error: 'WRONG_BIRTHDAY' });
        }

        // РµСЃР»Рё birthday Р±С‹Р» NULL вЂ” Р·Р°РїРёС€РµРј (РїРµСЂРІС‹Р№ РІС…РѕРґ)
        if (!c.birthday) {
          await db.query(
            `UPDATE cust_customers SET birthday=? WHERE tenant_id=? AND id=?`,
            [birthday, tenantId, customerId]
          );
        }
      }

      // СЃРѕР·РґР°С‘Рј СЃРµСЃСЃРёСЋ
      const token = makeToken32();

      // СЃСЂРѕРє 30 РґРЅРµР№
      await dualWriteSession(db, {
        tenantId,
        storeId: 1,
        customerId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: 1,
      });

      const [me] = await db.query(
        `SELECT id, name, phone, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday, photo
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );

      res.json({ ok: true, token, customer: me[0] || null });

      setImmediate(async () => {
        try {
          await notifyCustomerLogin({ db, tenantId, customerId });
        } catch (err) {
          console.error('MAX login notify error:', err.message || err);
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/max/link-token
  // headers: x-customer-token
  router.post('/max/link-token', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const tenantBotId = await getTenantMaxBotId(db, tenantId);
      const tenantBotToken = await getTenantMaxBotToken(db, tenantId);
      if (!tenantBotId || !tenantBotToken) {
        return res.status(409).json({ ok: false, error: 'MAX_BOT_NOT_CONFIGURED' });
      }

      const linkToken = makeLinkToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await dualWriteAuthToken(db, {
        tenantId,
        customerId: Number(customer.id),
        provider: 'max',
        purpose: 'link',
        token: linkToken,
        expiresAt,
      });

      res.json({
        ok: true,
        token: linkToken,
        link: buildMaxDeepLink(linkToken, tenantBotId),
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/tg/link-token
  // headers: x-customer-token
  router.post('/tg/link-token', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        'SELECT telegram_bot_username, telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const row = rows[0] || {};
      const username = String(row.telegram_bot_username || '').trim().replace(/^@/, '');
      const token = String(row.telegram_bot_token || '').trim();
      if (!username || !token) {
        return res.status(409).json({ ok: false, error: 'TG_BOT_NOT_CONFIGURED' });
      }

      const linkToken = makeLinkToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await dualWriteAuthToken(db, {
        tenantId,
        customerId: Number(customer.id),
        provider: 'tg',
        purpose: 'link',
        token: linkToken,
        expiresAt,
      });

      const link = `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(linkToken)}`;
      res.json({
        ok: true,
        token: linkToken,
        link,
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/max/auth-link
  // Public link for "Login via MAX" (without existing customer session)
  router.get('/max/auth-link', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      if (!(await isTenantMaxLoginEnabled(tenantId))) {
        return res.json({ ok: true, link: null, disabled: true });
      }
      const tenantBotId = await getTenantMaxBotId(db, tenantId);
      const tenantBotToken = await getTenantMaxBotToken(db, tenantId);
      if (!tenantBotId || !tenantBotToken) {
        return res.status(409).json({ ok: false, error: 'MAX_BOT_NOT_CONFIGURED' });
      }
      const link = `https://max.ru/${encodeURIComponent(tenantBotId)}?start=link`;
      return res.json({ ok: true, link });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/tg/auth-link
  // Public link for "Login via Telegram" (without existing customer session)
  router.get('/tg/auth-link', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      if (!(await isTenantTgLoginEnabled(tenantId))) {
        return res.json({ ok: true, link: null, disabled: true });
      }

      const [rows] = await db.query(
        'SELECT telegram_bot_username, telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const row = rows[0] || {};
      const username = String(row.telegram_bot_username || '').trim().replace(/^@/, '');
      const token = String(row.telegram_bot_token || '').trim();
      if (!username || !token) {
        return res.status(409).json({ ok: false, error: 'TG_BOT_NOT_CONFIGURED' });
      }

      const link = `https://t.me/${encodeURIComponent(username)}?start=login`;
      return res.json({ ok: true, link });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/max/finish-login?token=...
  // One-time MAX login token exchange -> customer session + redirect to site/miniapp
  router.get('/max/finish-login', async (req, res) => {
    const loginToken = str(req.query.token);
    const target = str(req.query.target).toLowerCase() === 'miniapp' ? 'miniapp' : 'site';
    if (!loginToken) return res.status(400).send('TOKEN_REQUIRED');

    const maxLoginReadTable = 'cust_customer_auth_tokens';
    const conn = await db.getConnection();
    try {
      const [tenantRows] = await conn.query(
        `SELECT t.max_login_enabled
         FROM ${maxLoginReadTable} lt
         JOIN ten_tenants t ON t.id = lt.tenant_id
         WHERE lt.token=? AND lt.provider='max' AND lt.purpose='login'
         LIMIT 1`,
        [loginToken]
      );
      if (!tenantRows.length || Number(tenantRows[0].max_login_enabled || 0) !== 1) {
        return res.status(403).send('MAX_LOGIN_DISABLED');
      }

      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, tenant_id, customer_id
         FROM ${maxLoginReadTable}
         WHERE token=? AND provider='max' AND purpose='login' AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1
         FOR UPDATE`,
        [loginToken]
      );
      if (!rows.length) {
        await conn.rollback();
        return res.status(400).send('TOKEN_INVALID_OR_EXPIRED');
      }

      const row = rows[0];
      const tenantId = Number(row.tenant_id);
      const customerId = Number(row.customer_id);

      const [customerRows] = await conn.query(
        `SELECT id, is_active
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );
      if (!customerRows.length || Number(customerRows[0].is_active || 0) !== 1) {
        await conn.rollback();
        return res.status(404).send('CUSTOMER_NOT_FOUND');
      }

      const sessionToken = makeToken32();
      await dualWriteSession(conn, {
        tenantId,
        storeId: 1,
        customerId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: 1,
      });

      await conn.query(
        `UPDATE cust_customer_auth_tokens
         SET used_at=NOW()
         WHERE tenant_id=? AND provider='max' AND purpose='login' AND token=? AND used_at IS NULL
         LIMIT 1`,
        [tenantId, loginToken]
      );

      await conn.commit();

      const redirectUrl = target === 'miniapp'
        ? `/max-app?tenant_id=${tenantId}&max_login=1`
        : `/shop?tenant_id=${tenantId}&max_login=1`;
      const html = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<script>
try {
  localStorage.setItem('shop_customer_token_t${tenantId}', ${JSON.stringify(sessionToken)});
} catch (e) {}
window.location.replace(${JSON.stringify(redirectUrl)});
</script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (e) {
      await conn.rollback();
      console.error('MAX_FINISH_LOGIN_ERROR:', e);
      return res.status(500).send('DB_ERROR');
    } finally {
      conn.release();
    }
  });

  // GET /api/public/tg/finish-login?token=...
  // One-time Telegram login token exchange -> customer session + redirect to site/miniapp
  router.get('/tg/finish-login', async (req, res) => {
    const loginToken = str(req.query.token);
    const target = str(req.query.target).toLowerCase() === 'miniapp' ? 'miniapp' : 'site';
    if (!loginToken) return res.status(400).send('TOKEN_REQUIRED');

    const tgLoginReadTable = 'cust_customer_auth_tokens';
    const conn = await db.getConnection();
    try {
      const [tenantRows] = await conn.query(
        `SELECT t.tg_login_enabled
         FROM ${tgLoginReadTable} lt
         JOIN ten_tenants t ON t.id = lt.tenant_id
         WHERE lt.token=? AND lt.provider='tg' AND lt.purpose='login'
         LIMIT 1`,
        [loginToken]
      );
      if (!tenantRows.length || Number(tenantRows[0].tg_login_enabled || 0) !== 1) {
        return res.status(403).send('TG_LOGIN_DISABLED');
      }

      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, tenant_id, customer_id
         FROM ${tgLoginReadTable}
         WHERE token=? AND provider='tg' AND purpose='login' AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1
         FOR UPDATE`,
        [loginToken]
      );
      if (!rows.length) {
        await conn.rollback();
        return res.status(400).send('TOKEN_INVALID_OR_EXPIRED');
      }

      const tokenRow = rows[0];
      const tenantId = Number(tokenRow.tenant_id);
      const customerId = Number(tokenRow.customer_id);

      const [customerRows] = await conn.query(
        `SELECT id, is_active
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1
         FOR UPDATE`,
        [tenantId, customerId]
      );
      if (!customerRows.length || Number(customerRows[0].is_active || 0) !== 1) {
        await conn.rollback();
        return res.status(404).send('CUSTOMER_NOT_FOUND');
      }

      const sessionToken = makeLinkToken();
      const sessionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      await dualWriteSession(conn, {
        tenantId,
        storeId: 1,
        customerId,
        token: sessionToken,
        expiresAt: sessionExpiresAt,
        isActive: 1,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
        ipAddress: String(req.ip || req.connection?.remoteAddress || '').slice(0, 64),
      });

      await conn.query(
        `UPDATE cust_customer_auth_tokens
         SET used_at=NOW()
         WHERE tenant_id=? AND provider='tg' AND purpose='login' AND token=? AND used_at IS NULL
         LIMIT 1`,
        [tenantId, loginToken]
      );

      await conn.commit();

      const redirectUrl = target === 'miniapp'
        ? `/tg-app?tenant_id=${tenantId}&tg_login=1`
        : `/shop?tenant_id=${tenantId}&tg_login=1`;
      const html = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<script>
try {
  localStorage.setItem('shop_customer_token', ${JSON.stringify(sessionToken)});
} catch (e) {}
window.location.replace(${JSON.stringify(redirectUrl)});
</script>
</body>
</html>`;
      return res.set('content-type', 'text/html; charset=utf-8').send(html);
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error('TG finish login error:', e);
      return res.status(500).send('SERVER_ERROR');
    } finally {
      conn.release();
    }
  });

  // GET /api/public/max/link-status
  // headers: x-customer-token
  router.get('/max/link-status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT max_user_id, phone, updated_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );

      if (!rows.length) {
        return res.json({ ok: true, linked: false, data: null });
      }

      return res.json({
        ok: true,
        linked: true,
        data: {
          max_user_id: rows[0].max_user_id,
          phone: rows[0].phone,
          linked_at: rows[0].updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/tg/link-status
  // headers: x-customer-token
  router.get('/tg/link-status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT telegram_user_id, phone, updated_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );

      if (!rows.length) {
        return res.json({ ok: true, linked: false, data: null });
      }

      const tgUserId = String(rows[0].telegram_user_id || '').trim();
      if (!tgUserId) {
        return res.json({ ok: true, linked: false, data: null });
      }

      return res.json({
        ok: true,
        linked: true,
        data: {
          telegram_user_id: tgUserId,
          phone: rows[0].phone,
          linked_at: rows[0].updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/max/link-confirm
  // body: { token, max_user_id, phone }
  router.post('/max/link-confirm', async (req, res) => {
    try {
      const secret = String(process.env.MAX_BOT_INTERNAL_SECRET || '').trim();
      if (!secret) return res.status(503).json({ ok: false, error: 'MAX_SECRET_NOT_CONFIGURED' });

      const givenSecret = str(req.headers['x-max-bot-secret']);
      if (!givenSecret || givenSecret !== secret) {
        return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      }

      const result = await confirmMaxLink({
        db,
        helpers,
        token: req.body.token,
        maxUserId: req.body.max_user_id,
        phone: req.body.phone,
      });

      if (!result.ok) {
        return res.status(result.status || 400).json({ ok: false, error: result.error || 'LINK_FAILED' });
      }

      return res.json({
        ok: true,
        data: {
          tenant_id: result.tenantId,
          customer_id: result.customerId,
          max_user_id: result.maxUserId,
          phone: result.phone,
        },
      });
    } catch (e) {
      console.error('MAX link confirm error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/phone-verification/status
  router.get('/phone-verification/status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT phone_verified_at, phone_verify_expires_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0] || {};
      return res.json({
        ok: true,
        data: {
          verified: Boolean(row.phone_verified_at),
          phone_verified_at: row.phone_verified_at || null,
          expires_at: row.phone_verify_expires_at || null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/phone-verification/send
  router.post('/phone-verification/send', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT id, max_user_id, telegram_user_id
         FROM cust_customers
         WHERE tenant_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.query(
        `UPDATE cust_customers
         SET phone_verify_code=?, phone_verify_expires_at=?, phone_verified_at=NULL, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [code, expiresAt, tenantId, Number(customer.id)]
      );

      const messageText = `\u041a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u043d\u043e\u043c\u0435\u0440\u0430: ${code}. \u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f: 24 \u0447\u0430\u0441\u0430.`;
      let sentVia = '';

      try {
        await sendTenantTelegramText({
          tenantId,
          telegramUserId: row.telegram_user_id,
          text: messageText,
        });
        sentVia = 'telegram';
      } catch {
        if (!row.max_user_id) {
          return res.status(409).json({ ok: false, error: 'TG_NOT_LINKED_AND_MAX_NOT_LINKED' });
        }

        await sendMaxMessage({
          db,
          tenantId,
          maxUserId: row.max_user_id,
          text: messageText,
        });
        sentVia = 'max';
      }

      return res.json({
        ok: true,
        data: {
          expires_at: expiresAt.toISOString(),
          sent_via: sentVia,
        },
      });
    } catch (e) {
      console.error('PHONE_VERIFY_SEND_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'SEND_FAILED' });
    }
  });

  // POST /api/public/phone-verification/verify
  // body: { code }
  router.post('/phone-verification/verify', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const code = String(req.body?.code || '').replace(/\D/g, '').slice(0, 4);
      if (code.length !== 4) return res.status(400).json({ ok: false, error: 'CODE_INVALID' });

      const [rows] = await db.query(
        `SELECT phone_verify_code, phone_verify_expires_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      if (!row.phone_verify_code || !row.phone_verify_expires_at) {
        return res.status(400).json({ ok: false, error: 'CODE_NOT_REQUESTED' });
      }

      const expMs = new Date(row.phone_verify_expires_at).getTime();
      if (!Number.isFinite(expMs) || expMs < Date.now()) {
        return res.status(400).json({ ok: false, error: 'CODE_EXPIRED' });
      }
      if (String(row.phone_verify_code) !== code) {
        return res.status(400).json({ ok: false, error: 'CODE_INVALID' });
      }

      await db.query(
        `UPDATE cust_customers
         SET phone_verified_at=NOW(), phone_verify_code=NULL, phone_verify_expires_at=NULL, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [tenantId, Number(customer.id)]
      );

      return res.json({ ok: true, data: { verified: true } });
    } catch (e) {
      console.error('PHONE_VERIFY_CHECK_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/logout
  router.post('/auth/logout', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token'] || req.body.token);

      if (!token) return res.json({ ok: true });

      await db.query(
        `UPDATE cust_customer_sessions
         SET is_active=0, revoked_at=NOW()
         WHERE tenant_id=? AND token=?`,
        [tenantId, token]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me
  router.get('/me', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);

      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      res.json({ ok: true, customer });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/tenant/chat-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT *
         FROM ten_tenants
         WHERE id=? AND is_active=1
         LIMIT 1`,
        [tenantId]
      );
      const tenant = rows[0];
      if (!tenant) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }
      return res.json({
        ok: true,
        tenant_id: Number(tenant.id || tenantId),
        settings: buildPublicTenantChatSettings(tenant),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/auth/options', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT max_login_enabled, tg_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const row = rows && rows[0] ? rows[0] : {};
      return res.json({
        ok: true,
        data: {
          max_login_enabled: Number(row.max_login_enabled || 0) === 1,
          tg_login_enabled: Number(row.tg_login_enabled || 0) === 1,
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/tenant/stores', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT tenant_id, id, code, name, city, address, phone, timezone, is_active
         FROM ten_stores
         WHERE tenant_id=? AND is_active=1
         ORDER BY id ASC`,
        [tenantId]
      );

      // Р”Р»СЏ РєР°Р¶РґРѕРіРѕ С„РёР»РёР°Р»Р° Р·Р°РіСЂСѓР¶Р°РµРј С‡Р°СЃС‹ СЂР°Р±РѕС‚С‹ Рё РїСЂРѕРІРµСЂСЏРµРј СЃС‚Р°С‚СѓСЃ
      const storesWithHours = await Promise.all(rows.map(async (store) => {
        const [storeHours] = await db.query(
          `SELECT day_of_week, opens_at, closes_at, is_closed
           FROM ten_store_hours
           WHERE tenant_id=? AND store_id=?
           ORDER BY day_of_week ASC`,
          [tenantId, store.id]
        );

        const storeTimezone = store.timezone || "+0";
        const isOpen = isStoreOpenNow(storeHours, storeTimezone);

        return {
          ...store,
          storeHours,
          isOpen
        };
      }));

      res.json({ ok: true, stores: storesWithHours });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С‚РѕС‡РµРє РїСЂРѕРґР°Р¶:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /stores-availability
   * Returns all stores with their current open/closed status
   * Used when customer selects a city to show which stores can accept orders
   */
  router.get('/stores-availability', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const city = req.query.city;

      if (!city) {
        return res.status(400).json({ ok: false, error: 'CITY_REQUIRED' });
      }

      // Get all stores in this city
      const [stores] = await db.query(
        `SELECT id, name, city, address, phone, timezone, is_active
         FROM ten_stores
         WHERE tenant_id=? AND city=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, city]
      );

      // For each store, check if it's currently open
      const storesWithStatus = await Promise.all(stores.map(async (store) => {
        // Get store hours
        const [storeHours] = await db.query(
          `SELECT day_of_week, opens_at, closes_at, is_closed
           FROM ten_store_hours
           WHERE tenant_id=? AND store_id=?
           ORDER BY day_of_week ASC`,
          [tenantId, store.id]
        );

        // Get delivery hours
        const [deliveryHours] = await db.query(
          `SELECT day_of_week, opens_at, closes_at, is_closed
           FROM ten_store_delivery_hours
           WHERE tenant_id=? AND store_id=?
           ORDER BY day_of_week ASC`,
          [tenantId, store.id]
        );

        const storeTimezone = store.timezone || "+0";
        const isOpen = isStoreOpenNow(storeHours, storeTimezone);
        const deliveryIsOpen = isStoreDeliveryOpenNow(deliveryHours, storeTimezone);

        return {
          ...store,
          isOpen,
          deliveryIsOpen,
          storeHours,
          deliveryHours
        };
      }));

      res.json({
        ok: true,
        stores: storesWithStatus
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // PUT /api/public/me  body: { name }
  router.put('/me', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      await db.query(
        `UPDATE cust_customers
         SET name=?
         WHERE tenant_id=? AND id=?`,
        [name, tenantId, customer.id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/me/photo (multipart/form-data, field: photo|avatar)
  router.post(
    '/me/photo',
    avatarUpload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'avatar', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const tenantId = helpers.getTenantId(req);
        const token = str(req.headers['x-customer-token']);
        const customer = await getCustomerByToken(tenantId, token);
        if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

        const file =
          (req.files && req.files.photo && req.files.photo[0]) ||
          (req.files && req.files.avatar && req.files.avatar[0]);

        if (!file) return res.status(400).json({ ok: false, error: 'PHOTO_REQUIRED' });

        // РЎРѕР·РґР°С‘Рј WebP-РІР°СЂРёР°РЅС‚ Р°РІР°С‚Р°СЂР° (РѕСЂРёРіРёРЅР°Р» РѕСЃС‚Р°С‘С‚СЃСЏ РєР°Рє fallback)
        await helpers.ensureWebpVariant(file.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars', file.filename));

        const photoUrl = `/static/uploads/avatars/${file.filename.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`;

        await db.query(
          `UPDATE cust_customers
           SET photo=?
           WHERE tenant_id=? AND id=?`,
          [photoUrl, tenantId, customer.id]
        );

        res.json({ ok: true, photoUrl });
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    }
  );

  // DELETE /api/public/me/photo
  router.delete('/me/photo', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      await db.query(
        `UPDATE cust_customers
         SET photo=NULL
         WHERE tenant_id=? AND id=?`,
        [tenantId, customer.id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/addresses
  router.get('/me/addresses', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT
           id, city, street, house, entrance, floor, apartment, comment,
           is_default, is_active,
           created_at, updated_at
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1
         ORDER BY is_default DESC, updated_at DESC, id DESC`,
        [tenantId, customer.id]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/me/addresses
  router.post('/me/addresses', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const city = helpers.strOrNull(req.body.city);
      const street = helpers.strOrNull(req.body.street);
      const house = helpers.strOrNull(req.body.house);
      if (!street) return res.status(400).json({ ok: false, error: 'STREET_REQUIRED' });
      if (!house) return res.status(400).json({ ok: false, error: 'HOUSE_REQUIRED' });

      const entrance = helpers.strOrNull(req.body.entrance);
      const floor = helpers.strOrNull(req.body.floor);
      const apartment = helpers.strOrNull(req.body.apartment);
      const comment = helpers.strOrNull(req.body.comment);

      let isDefault = helpers.toBool(req.body.is_default, false) ? 1 : 0;

      await conn.beginTransaction();

      const [cnt] = await conn.query(
        `SELECT COUNT(*) AS c
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1`,
        [tenantId, customer.id]
      );
      const hasAny = Number(cnt?.[0]?.c || 0) > 0;
      if (!hasAny) isDefault = 1;

      if (isDefault === 1) {
        await conn.query(
          `UPDATE cust_customer_addresses
           SET is_default=0
           WHERE tenant_id=? AND customer_id=?`,
          [tenantId, customer.id]
        );
      }

      const [r] = await conn.query(
        `INSERT INTO cust_customer_addresses
         (tenant_id, customer_id, city, street, house, entrance, floor, apartment, comment, is_default, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
        [tenantId, customer.id, city, street, house, entrance, floor, apartment, comment, isDefault]
      );

      await conn.commit();
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });


  // PUT /api/public/me/addresses/:id
  // body: { street, house, entrance?, floor?, apartment?, comment?, is_default? }
  router.put('/me/addresses/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const addressId = Number(req.params.id);
      if (!Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const city = helpers.strOrNull(req.body.city);
      const street = helpers.strOrNull(req.body.street);
      const house = helpers.strOrNull(req.body.house);
      if (!street) return res.status(400).json({ ok: false, error: 'STREET_REQUIRED' });
      if (!house) return res.status(400).json({ ok: false, error: 'HOUSE_REQUIRED' });

      const entrance = helpers.strOrNull(req.body.entrance);
      const floor = helpers.strOrNull(req.body.floor);
      const apartment = helpers.strOrNull(req.body.apartment);
      const comment = helpers.strOrNull(req.body.comment);

      const makeDefault = helpers.toBool(req.body.is_default, false) ? 1 : 0;

      await conn.beginTransaction();

      const [cur] = await conn.query(
        `SELECT id
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customer.id, addressId]
      );
      if (!cur.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      if (makeDefault === 1) {
        await conn.query(
          `UPDATE cust_customer_addresses
           SET is_default=0
           WHERE tenant_id=? AND customer_id=?`,
          [tenantId, customer.id]
        );
      }

      await conn.query(
        `UPDATE cust_customer_addresses
         SET city=?, street=?, house=?, entrance=?, floor=?, apartment=?, comment=?${makeDefault === 1 ? ', is_default=1' : ''}
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [city, street, house, entrance, floor, apartment, comment, tenantId, customer.id, addressId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });


  // DELETE /api/public/me/addresses/:id
  router.delete('/me/addresses/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const addressId = Number(req.params.id);
      if (!Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [cur] = await conn.query(
        `SELECT id, is_default
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customer.id, addressId]
      );
      if (!cur.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      const wasDefault = Number(cur[0].is_default || 0) === 1;

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_active=0, is_default=0
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customer.id, addressId]
      );

      if (wasDefault) {
        const [any] = await conn.query(
          `SELECT id
           FROM cust_customer_addresses
           WHERE tenant_id=? AND customer_id=? AND is_active=1
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
          [tenantId, customer.id]
        );
        if (any.length) {
          await conn.query(
            `UPDATE cust_customer_addresses
             SET is_default=1
             WHERE tenant_id=? AND customer_id=? AND id=?`,
            [tenantId, customer.id, Number(any[0].id)]
          );
        }
      }

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // PUT /api/public/me/addresses/:id/default
  router.put('/me/addresses/:id/default', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const addressId = Number(req.params.id);
      if (!Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [a] = await conn.query(
        `SELECT id
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customer.id, addressId]
      );
      if (!a.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=0
         WHERE tenant_id=? AND customer_id=?`,
        [tenantId, customer.id]
      );

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=1
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customer.id, addressId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // GET /api/public/orders/by-phone
  // public endpoint for chat assistant: finds active orders by customer phone
  router.get('/orders/by-phone', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const phone = str(req.query.phone || req.query.q);
      const phoneCandidates = normalizePhoneLookupCandidates(phone);
      if (!phoneCandidates.length) {
        return res.status(400).json({ ok: false, error: 'BAD_PHONE' });
      }

      let limit = Number(req.query.limit ?? 5);
      if (!Number.isFinite(limit) || limit <= 0) limit = 5;
      if (limit > 200) limit = 200;
      limit = Math.floor(limit);

      const fetchLimit = limit + 1;
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const placeholders = phoneCandidates.map(() => '?').join(', ');
      const [rows] = await db.query(
        `SELECT
           o.id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_utc,
           o.total_price, o.items, o.public_id,
           s.title AS status_title, s.code AS status_code, s.is_final AS status_is_final,
           p.title AS payment_title, p.code AS payment_code
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         LEFT JOIN order_payments p
           ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
         LEFT JOIN cust_customers c
           ON c.tenant_id=o.tenant_id AND c.id=o.customer_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.is_active=1
           AND COALESCE(s.is_final, 0)=0
           AND (
             o.customer_phone IN (${placeholders})
             OR c.phone IN (${placeholders})
           )
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT ?`,
        [tenantId, storeId, ...phoneCandidates, ...phoneCandidates, fetchLimit]
      );

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const data = pageRows.map((r) => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}

        return {
          id: Number(r.id),
          public_id: r.public_id || null,
          created_at: helpers.utcToStoreDateTime(r.created_at_utc ?? r.created_at, storeTimezone),
          total_price: Number(r.total_price || 0),
          status_title: r.status_title || null,
          status_code: r.status_code || null,
          status_is_final: r.status_is_final ? Number(r.status_is_final) : 0,
          payment_title: r.payment_title || null,
          payment_code: r.payment_code || null,
          items,
        };
      });

      res.json({
        ok: true,
        data,
        paging: {
          limit,
          has_more: hasMore,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/orders
  router.get('/me/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      let limit = Number(req.query.limit ?? 50);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;
      limit = Math.floor(limit);

      let offset = Number(req.query.offset ?? 0);
      if (!Number.isFinite(offset) || offset < 0) offset = 0;
      if (offset > 100000) offset = 100000;
      offset = Math.floor(offset);

      let statusIsFinal = null;
      if (req.query.status_is_final !== undefined) {
        const parsedStatusIsFinal = Number(req.query.status_is_final);
        if (parsedStatusIsFinal === 0 || parsedStatusIsFinal === 1) {
          statusIsFinal = parsedStatusIsFinal;
        }
      }

      const fetchLimit = limit + 1;
      const storeTimezone = await getStoreTimezone(tenantId, storeId);

      let summary = null;
      if (statusIsFinal !== null) {
        const [summaryRows] = await db.query(
          `SELECT
             SUM(CASE WHEN COALESCE(s.is_final, 0) = 1 THEN 1 ELSE 0 END) AS completed_count,
             SUM(CASE WHEN COALESCE(s.is_final, 0) = 1 THEN 0 ELSE 1 END) AS active_count
           FROM order_orders o
           LEFT JOIN order_statuses s
             ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
           WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1`,
          [tenantId, storeId, customer.id]
        );
        const summaryRow = summaryRows?.[0] || {};
        summary = {
          active_count: Math.max(0, Number(summaryRow.active_count || 0)),
          completed_count: Math.max(0, Number(summaryRow.completed_count || 0)),
        };
        summary.total_count = summary.active_count + summary.completed_count;
      }

      const [rows] = await db.query(
        `SELECT
           o.id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_utc,
           o.total_price, o.items, o.public_id,
           s.title AS status_title, s.code AS status_code, s.is_final AS status_is_final,
           p.title AS payment_title, p.code AS payment_code
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         LEFT JOIN order_payments p
           ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1
           AND (? IS NULL OR COALESCE(s.is_final, 0)=?)
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT ?
         OFFSET ?`,
        [tenantId, storeId, customer.id, statusIsFinal, statusIsFinal, fetchLimit, offset]
      );

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      const data = pageRows.map(r => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}
        return {
          id: Number(r.id),
          public_id: r.public_id || null,
          created_at: helpers.utcToStoreDateTime(r.created_at_utc ?? r.created_at, storeTimezone),
          total_price: Number(r.total_price || 0),
          status_title: r.status_title || null,
          status_code: r.status_code || null,
          status_is_final: r.status_is_final ? Number(r.status_is_final) : 0,
          payment_title: r.payment_title || null,
          payment_code: r.payment_code || null,
          items,
        };
      });

      res.json({
        ok: true,
        data,
        ...(summary ? { summary } : {}),
        paging: {
          limit,
          offset,
          next_offset: hasMore ? offset + data.length : null,
          has_more: hasMore,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/orders/:id
  router.get('/me/orders/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const orderId = Number(req.params.id);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const payload = await fetchOrderPayload(tenantId, storeId, orderId);
      if (!payload) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ Р·Р°РєР°Р· РїСЂРёРЅР°РґР»РµР¶РёС‚ РєР»РёРµРЅС‚Сѓ
      if (Number(payload.customer_id) !== Number(customer.id)) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }

      res.json({ ok: true, data: payload });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // РЎРєРёРґРєРё РєР»РёРµРЅС‚Р°
  // ------------------------------
  // GET /api/public/me/favorites
  router.get('/me/favorites', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      let limit = Number(req.query.limit ?? 200);
      if (!Number.isFinite(limit) || limit <= 0) limit = 200;
      if (limit > 500) limit = 500;

      const [rows] = await db.query(
        `SELECT
           id,
           item_signature,
           item_type,
           product_id,
           combo_id,
           title,
           photo,
           item_json,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM cust_customer_favorites
         WHERE tenant_id=? AND store_id=? AND customer_id=?
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
        [tenantId, storeId, customer.id, limit]
      );

      const data = rows
        .map((row) => {
          const item = parseFavoriteItemJson(row.item_json);
          if (!item) return null;
          return {
            id: Number(row.id),
            item_signature: row.item_signature || null,
            item_type: row.item_type || null,
            product_id: row.product_id != null ? Number(row.product_id) : null,
            combo_id: row.combo_id != null ? Number(row.combo_id) : null,
            title: row.title || null,
            photo: row.photo || null,
            item,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
          };
        })
        .filter(Boolean);

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/me/favorites
  // body: { item }
  router.post('/me/favorites', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const rawItem =
        (req.body && req.body.item && typeof req.body.item === 'object' ? req.body.item : null) ||
        (req.body && typeof req.body === 'object' ? req.body : null);
      const item = normalizeFavoriteItemSnapshot(rawItem);
      if (!item) {
        return res.status(400).json({ ok: false, error: 'BAD_ITEM' });
      }

      const signature = buildFavoriteSignature(item);
      if (!signature) {
        return res.status(400).json({ ok: false, error: 'BAD_ITEM' });
      }

      const preview = extractFavoritePreview(item);
      const itemType = preview.itemType === 'combo' ? 'combo' : 'product';
      const itemJson = JSON.stringify(item);

      const [ins] = await db.query(
        `INSERT INTO cust_customer_favorites
         (tenant_id, store_id, customer_id, item_signature, item_type, product_id, combo_id, title, photo, item_json)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           item_type = VALUES(item_type),
           product_id = VALUES(product_id),
           combo_id = VALUES(combo_id),
           title = VALUES(title),
           photo = VALUES(photo),
           item_json = VALUES(item_json),
           updated_at = CURRENT_TIMESTAMP`,
        [
          tenantId,
          storeId,
          customer.id,
          signature,
          itemType,
          preview.productId,
          preview.comboId,
          preview.title,
          preview.photo,
          itemJson,
        ]
      );

      const favoriteId = Number(ins.insertId || 0);
      if (!favoriteId) {
        return res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }

      const [rows] = await db.query(
        `SELECT
           id,
           item_signature,
           item_type,
           product_id,
           combo_id,
           title,
           photo,
           item_json,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM cust_customer_favorites
         WHERE tenant_id=? AND store_id=? AND customer_id=? AND id=?
         LIMIT 1`,
        [tenantId, storeId, customer.id, favoriteId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const row = rows[0];
      const parsedItem = parseFavoriteItemJson(row.item_json);
      if (!parsedItem) {
        return res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }

      res.json({
        ok: true,
        data: {
          id: Number(row.id),
          item_signature: row.item_signature || null,
          item_type: row.item_type || null,
          product_id: row.product_id != null ? Number(row.product_id) : null,
          combo_id: row.combo_id != null ? Number(row.combo_id) : null,
          title: row.title || null,
          photo: row.photo || null,
          item: parsedItem,
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // DELETE /api/public/me/favorites/:id
  router.delete('/me/favorites/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const favoriteId = Number(req.params.id);
      if (!Number.isFinite(favoriteId) || favoriteId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [del] = await db.query(
        `DELETE FROM cust_customer_favorites
         WHERE tenant_id=? AND store_id=? AND customer_id=? AND id=?
         LIMIT 1`,
        [tenantId, storeId, customer.id, favoriteId]
      );

      if (Number(del.affectedRows || 0) < 1) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/me/discounts', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = customer.id;

      // РџРѕР»СѓС‡Р°РµРј СЃРєРёРґРєРё, РїСЂРёРІСЏР·Р°РЅРЅС‹Рµ РЅР°РїСЂСЏРјСѓСЋ Рє РєР»РёРµРЅС‚Сѓ
      // store_id = 0 РёР»Рё СЃРѕРІРїР°РґР°РµС‚ СЃ С‚РµРєСѓС‰РёРј store_id - СЃРєРёРґРєР° РїСЂРёРјРµРЅРёРјР°
      const [directDiscounts] = await db.query(
        `SELECT d.id, d.store_id, d.title, d.description, d.discount_type, d.discount_value,
                d.apply_to, d.min_order_amount, d.max_discount_amount, d.is_stackable,
                d.usage_limit, d.usage_count,
                d.starts_at, d.ends_at, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
                d.is_active,
                'direct' AS link_type
         FROM mkt_discounts d
         JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND (d.store_id = ? OR d.store_id = 0 OR d.store_id IS NULL) AND dc.customer_id = ?`,
        [tenantId, storeId, customerId]
      );

      // РџРѕР»СѓС‡Р°РµРј РєР°С‚РµРіРѕСЂРёРё РєР»РёРµРЅС‚Р° РёР· С‚Р°Р±Р»РёС†С‹ СЃРІСЏР·РµР№ (РµСЃР»Рё С‚Р°Р±Р»РёС†Р° СЃСѓС‰РµСЃС‚РІСѓРµС‚)
      let categoryIds = [];
      try {
        const [customerCats] = await db.query(
          `SELECT category_id FROM cust_customer_category_links WHERE tenant_id = ? AND customer_id = ?`,
          [tenantId, customerId]
        );
        categoryIds = customerCats.map(c => Number(c.category_id));
      } catch (catErr) {
        // РўР°Р±Р»РёС†Р° РјРѕР¶РµС‚ РЅРµ СЃСѓС‰РµСЃС‚РІРѕРІР°С‚СЊ - РїСЂРѕРїСѓСЃРєР°РµРј
        console.warn('cust_customer_category_links РЅРµ РЅР°Р№РґРµРЅР°, РїСЂРѕРїСѓСЃРєР°РµРј:', catErr.code);
      }

      // РџРѕР»СѓС‡Р°РµРј СЃРєРёРґРєРё РїРѕ РєР°С‚РµРіРѕСЂРёСЏРј РєР»РёРµРЅС‚Р°
      let categoryDiscounts = [];
      if (categoryIds.length > 0) {
        const [catDisc] = await db.query(
          `SELECT d.id, d.store_id, d.title, d.description, d.discount_type, d.discount_value,
                  d.apply_to, d.min_order_amount, d.max_discount_amount, d.is_stackable,
                  d.usage_limit, d.usage_count,
                  d.starts_at, d.ends_at, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
                  d.is_active,
                  'category' AS link_type
           FROM mkt_discounts d
           JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
           WHERE d.tenant_id = ? AND (d.store_id = ? OR d.store_id = 0 OR d.store_id IS NULL) AND dc.customer_category_id IN (?)`,
          [tenantId, storeId, categoryIds]
        );
        categoryDiscounts = catDisc;
      }

      // РћР±СЉРµРґРёРЅСЏРµРј Рё СѓРґР°Р»СЏРµРј РґСѓР±Р»РёРєР°С‚С‹
      const allDiscounts = [...directDiscounts, ...categoryDiscounts];
      const uniqueDiscounts = [];
      const seenIds = new Set();

      for (const discount of allDiscounts) {
        if (!seenIds.has(discount.id)) {
          // Р”РѕР±Р°РІР»СЏРµРј С„Р»Р°Рі Р°РєС‚РёРІРЅРѕСЃС‚Рё РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РЅР° С„СЂРѕРЅС‚РµРЅРґРµ
          discount.is_currently_active = discountHelpers.isDiscountActive(discount);
          uniqueDiscounts.push(discount);
          seenIds.add(discount.id);
        }
      }

      res.json({ ok: true, data: uniqueDiscounts });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // PUBLIC SHOP: categories/products
  // ------------------------------

  router.get('/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const [rows] = await db.query(
        `SELECT id, tenant_id, code, title, icon, site_visibility, is_active, sort_order
         FROM prod_categories
         WHERE tenant_id=? AND is_active=1 AND site_visibility=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * РљРѕРјР±Рѕ-Р±Р»РѕРєРё РґР»СЏ РєР»РёРµРЅС‚Р°: С‚РѕР»СЊРєРѕ Р±Р»РѕРєРё Рё С‚РѕР»СЊРєРѕ С‚РѕРІР°СЂС‹, РґРѕСЃС‚СѓРїРЅС‹Рµ РЅР° СЃР°Р№С‚Рµ
   * (is_active=1, site_visibility=1). РўРѕРІР°СЂС‹ СЃ РѕСЃС‚Р°С‚РєРѕРј 0 / РІС‹РєР»СЋС‡РµРЅРЅС‹Рµ РІ Р±Р»РѕРєРµ РѕСЃС‚Р°СЋС‚СЃСЏ,
   * РЅРѕ РІ РѕС‚РІРµС‚ РЅРµ РїРѕРїР°РґР°СЋС‚ вЂ” РєР»РёРµРЅС‚ РёС… РЅРµ РІРёРґРёС‚.
   */
  router.get('/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productIsAvailableSql = getProductIsAvailableSql('p', 's');

      const [blocks] = await db.query(
        `SELECT id, title, sort_order, min_select, max_select FROM prod_combo_blocks
         WHERE tenant_id=? ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );

      const result = [];
      for (const block of blocks) {
        const [productsRaw] = await db.query(
          `SELECT bp.product_id, bp.sort_order, bp.is_default, p.name AS product_name, p.price, p.photos_json AS product_photos_json
           FROM prod_combo_block_products bp
           JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           WHERE bp.tenant_id=? AND bp.block_id=? AND p.is_active=1 AND p.site_visibility=1
             AND ${productIsAvailableSql}
           ORDER BY bp.sort_order ASC, bp.id ASC`,
          [storeId, tenantId, block.id, storeId, storeId, storeId]
        );
        const products = productsRaw.map((r) => {
          const photos = safeJsonArray(r.product_photos_json);
          return {
            product_id: r.product_id,
            product_name: r.product_name,
            price: Number(r.price) || 0,
            sort_order: r.sort_order,
            is_default: Number(r.is_default) === 1,
            product_photo: photos.length ? photos[0] : null,
          };
        });
        let defaultSet = false;
        for (const p of products) {
          const wasDefault = p.is_default;
          p.is_default = wasDefault && !defaultSet;
          if (wasDefault) defaultSet = true;
        }
        result.push({ id: block.id, title: block.title, sort_order: block.sort_order, min_select: block.min_select ?? 1, max_select: block.max_select ?? 1, products });
      }

      res.json({ ok: true, data: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * РћРґРёРЅ РєРѕРјР±Рѕ-РЅР°Р±РѕСЂ РґР»СЏ РјР°РіР°Р·РёРЅР°: РґР°РЅРЅС‹Рµ РєРѕРјР±Рѕ + Р±Р»РѕРєРё СЃ С‚РѕРІР°СЂР°РјРё (РґР»СЏ СЌРєСЂР°РЅР° РІС‹Р±РѕСЂР°).
   */
  router.get('/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productIsAvailableSql = getProductIsAvailableSql('p', 's');
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [[combo]] = await db.query(
        `SELECT id, title, description, discount_percent, image_url
         FROM prod_combos WHERE tenant_id=? AND id=? AND is_active=1 LIMIT 1`,
        [tenantId, id]
      );
      if (!combo) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const [setBlocks] = await db.query(
        `SELECT sb.block_id, sb.sort_order, b.title AS block_title, b.min_select, b.max_select
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, id]
      );

      const blocks = [];
      for (const sb of setBlocks) {
        const [productsRaw] = await db.query(
          `SELECT bp.product_id, bp.sort_order, bp.is_default, p.name AS product_name, p.description_short AS product_description_short, p.price, p.photos_json AS product_photos_json
           FROM prod_combo_block_products bp
           JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           WHERE bp.tenant_id=? AND bp.block_id=? AND p.is_active=1 AND p.site_visibility=1
             AND ${productIsAvailableSql}
           ORDER BY bp.sort_order ASC, bp.id ASC`,
          [storeId, tenantId, sb.block_id, storeId, storeId, storeId]
        );
        const minSelect = Math.max(1, Number(sb.min_select) || 1);
        if (!productsRaw.length) {
          return res.status(409).json({ ok: false, error: 'OUT_OF_STOCK' });
        }
        const products = productsRaw.map((r) => {
          const photos = safeJsonArray(r.product_photos_json);
          return {
            product_id: r.product_id,
            product_name: r.product_name,
            product_description_short: r.product_description_short || null,
            price: Number(r.price) || 0,
            sort_order: r.sort_order,
            is_default: Number(r.is_default) === 1,
            product_photo: photos.length ? photos[0] : null,
          };
        });
        let defaultSet = false;
        for (const p of products) {
          const wasDefault = p.is_default;
          p.is_default = wasDefault && !defaultSet;
          if (wasDefault) defaultSet = true;
        }
        blocks.push({
          block_id: sb.block_id,
          block_title: sb.block_title || '',
          min_select: minSelect,
          max_select: Math.max(1, Number(sb.max_select) || 1),
          products,
        });
      }

      res.json({
        ok: true,
        data: {
          id: combo.id,
          title: combo.title || '',
          description: combo.description || '',
          discount_percent: Number(combo.discount_percent) || 0,
          image_url: combo.image_url || null,
          blocks,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function resolveCategoryIdFromQuery(tenantId, req) {
    const code = helpers.strOrNull(req.query.category_code);
    if (code) {
      const [r] = await db.query(
        'SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1',
        [tenantId, code]
      );
      if (r.length) return Number(r[0].id);
    }

    const byId = Number(req.query.category_id);
    if (Number.isFinite(byId) && byId > 0) return byId;

    // fallback: "all"
    const [all] = await db.query(
      `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
      [tenantId]
    );
    return all.length ? Number(all[0].id) : null;
  }

  /**
   * РљРѕРјР±Рѕ-РЅР°Р±РѕСЂС‹ РґР»СЏ РєР°С‚Р°Р»РѕРіР°: РїРѕ РєР°С‚РµРіРѕСЂРёРё (category_code), СЃ min_price Рё С„РѕС‚Рѕ РґР»СЏ 2x2 СЃРµС‚РєРё.
   * РЎР°РјР°СЏ РЅРёР·РєР°СЏ С†РµРЅР° В«РћС‚ X Р В»: РїРѕ РєР°Р¶РґРѕРјСѓ Р±Р»РѕРєСѓ Р±РµСЂС‘Рј min_select С‚РѕРІР°СЂРѕРІ СЃ РЅР°РёРјРµРЅСЊС€РµР№ РІРѕР·РјРѕР¶РЅРѕР№ С†РµРЅРѕР№
   * (СЃ СѓС‡С‘С‚РѕРј РІР°СЂРёР°РЅС‚РѕРІ/РїРѕСЂС†РёР№ вЂ” Р±РµСЂС‘С‚СЃСЏ РјРёРЅРёРјСѓРј РїРѕ РІСЃРµРј РІР°СЂРёР°РЅС‚Р°Рј С‚РѕРІР°СЂР°), СЃСѓРјРјРёСЂСѓРµРј, РїСЂРёРјРµРЅСЏРµРј СЃРєРёРґРєСѓ РєРѕРјР±Рѕ.
   */
  async function getCombosForCategory(tenantId, storeId, categoryId) {
    const [[catRow]] = await db.query(
      'SELECT id, code FROM prod_categories WHERE tenant_id=? AND id=? LIMIT 1',
      [tenantId, categoryId]
    );
    if (!catRow) return [];
    const categoryCode = (catRow.code || '').trim().toLowerCase();
    if (categoryCode === 'all') return [];

    const [combos] = await db.query(
      `SELECT id, title, description, discount_percent, image_url, sort_order
       FROM prod_combos
       WHERE tenant_id=? AND is_active=1 AND (category_code = ? OR (category_code IS NULL AND ? = ''))
       ORDER BY sort_order ASC, id ASC`,
      [tenantId, categoryCode, categoryCode]
    );
    if (!combos.length) return [];

    const roundPrice = (v) => Math.round(Number(v) * 100) / 100;
    const getConversionFactor = getConversionFactorMap(tenantId, db);
    const productIsAvailableSql = getProductIsAvailableSql('p', 's');
    const result = [];

    for (const combo of combos) {
      const [setBlocks] = await db.query(
        `SELECT sb.block_id, b.min_select
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=?
         ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, combo.id]
      );

      if (!setBlocks.length) continue;

      let minPriceSum = 0;
      const gridPhotos = [];
      let comboIsAvailable = true;
      const blockIds = setBlocks.map((sb) => Number(sb.block_id)).filter((id) => Number.isFinite(id) && id > 0);
      if (!blockIds.length) continue;

      const [allBlockProductsRaw] = await db.query(
        `SELECT bp.block_id, p.id, p.price, p.photos_json, p.base_unit_id, p.base_qty, p.unit_id
         FROM prod_combo_block_products bp
         JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
         LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
         WHERE bp.tenant_id=? AND bp.block_id IN (${blockIds.map(() => '?').join(',')})
           AND p.is_active=1 AND p.site_visibility=1
           AND ${productIsAvailableSql}
         ORDER BY bp.block_id ASC, bp.sort_order ASC, bp.id ASC`,
        [storeId, tenantId, ...blockIds, storeId, storeId, storeId]
      );

      const blockProductsById = new Map();
      for (const row of allBlockProductsRaw) {
        const bid = Number(row.block_id);
        if (!blockProductsById.has(bid)) blockProductsById.set(bid, []);
        blockProductsById.get(bid).push(row);
      }

      const allProductIds = [...new Set(allBlockProductsRaw.map((r) => Number(r.id)).filter(Boolean))];
      let variantByProductId = new Map();
      if (allProductIds.length) {
        const [vaRows] = await db.query(
          `SELECT va.product_id, va.variant_group_id,
                  COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
                  vg.unit_id, vg.values, vg.sort_order
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
           WHERE va.tenant_id=? AND va.product_id IN (${allProductIds.map(() => '?').join(',')})
             AND va.is_active=1 AND vg.is_active=1
           ORDER BY va.sort_order ASC, vg.sort_order ASC`,
          [tenantId, ...allProductIds]
        );

        const variantGroupIds = [...new Set(vaRows.map((r) => Number(r.variant_group_id)).filter(Boolean))];
        const tiersByGroup = new Map();
        if (variantGroupIds.length) {
          const [tierRows] = await db.query(
            `SELECT variant_group_id, min_quantity, discount_percent, sort_order
             FROM prod_variant_discount_tiers
             WHERE tenant_id=? AND variant_group_id IN (${variantGroupIds.map(() => '?').join(',')})
             ORDER BY variant_group_id, sort_order ASC`,
            [tenantId, ...variantGroupIds]
          );
          for (const t of tierRows) {
            const gid = Number(t.variant_group_id);
            if (!tiersByGroup.has(gid)) tiersByGroup.set(gid, []);
            tiersByGroup.get(gid).push({
              min_quantity: t.min_quantity,
              discount_percent: t.discount_percent,
              sort_order: t.sort_order,
            });
          }
        }

        variantByProductId = new Map();
        for (const r of vaRows) {
          const pid = Number(r.product_id);
          if (variantByProductId.has(pid)) continue;
          const values = safeJsonArray(r.values);
          if (!values.length) continue;
          variantByProductId.set(pid, {
            unit_id: r.unit_id,
            values,
            default_value_index: r.default_value_index != null ? Number(r.default_value_index) : 0,
            discount_tiers: tiersByGroup.get(Number(r.variant_group_id)) || [],
          });
        }
      }

      for (const sb of setBlocks) {
        const minSelect = Math.max(1, Number(sb.min_select) || 1);
        const blockProductsRaw = blockProductsById.get(Number(sb.block_id)) || [];
        if (!blockProductsRaw.length) {
          comboIsAvailable = false;
          break;
        }

        const productsWithMinPrice = await Promise.all(
          blockProductsRaw.map(async (r) => {
            const variant = variantByProductId.get(Number(r.id));
            const minP = await computeMinPriceForProduct(r, variant, getConversionFactor, roundPrice);
            return { ...r, minPrice: minP };
          })
        );
        productsWithMinPrice.sort((a, b) => (a.minPrice || 0) - (b.minPrice || 0));
        const selected = productsWithMinPrice.slice(0, minSelect);
        let blockSum = 0;
        for (const r of selected) {
          blockSum += Number(r.minPrice || 0);
          if (gridPhotos.length < 4) {
            const photos = safeJsonArray(r.photos_json);
            if (photos.length) gridPhotos.push(photos[0]);
          }
        }
        minPriceSum += roundPrice(blockSum);
      }

      if (!comboIsAvailable) continue;

      const discountPercent = Number(combo.discount_percent) || 0;
      const minPrice = discountPercent > 0
        ? roundPrice(minPriceSum * (1 - discountPercent / 100))
        : roundPrice(minPriceSum);

      const gridPhotosFinal = gridPhotos.slice(0, 4);
      const entry = {
        id: combo.id,
        title: combo.title || '',
        description: combo.description || '',
        discount_percent: discountPercent,
        image_url: combo.image_url || null,
        min_price: minPrice,
        grid_photos: gridPhotosFinal,
      };
      attachComboThumbs(entry);
      result.push(entry);
    }

    return result;
  }

  const COMBOS_CACHE_TTL_MS = 15000;
  const combosByCategoryCache = new Map();
  const combosByCategoryInflight = new Map();

  function getCombosCacheKey(tenantId, storeId, categoryId) {
    return `${Number(tenantId) || 0}:${Number(storeId) || 0}:${Number(categoryId) || 0}`;
  }

  async function getCombosForCategoryCached(tenantId, storeId, categoryId) {
    const key = getCombosCacheKey(tenantId, storeId, categoryId);
    const now = Date.now();
    const cached = combosByCategoryCache.get(key);
    if (cached && cached.expiresAt > now) return cached.data;

    const inflight = combosByCategoryInflight.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      const data = await getCombosForCategory(tenantId, storeId, categoryId);
      combosByCategoryCache.set(key, {
        data,
        expiresAt: Date.now() + COMBOS_CACHE_TTL_MS,
      });
      return data;
    })().finally(() => {
      combosByCategoryInflight.delete(key);
    });

    combosByCategoryInflight.set(key, p);
    return p;
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const list = Array.isArray(items) ? items : [];
    const cap = Math.max(1, Number(limit) || 1);
    const results = new Array(list.length);
    let index = 0;

    const workers = Array.from({ length: Math.min(cap, list.length) }, async () => {
      while (true) {
        const i = index++;
        if (i >= list.length) break;
        results[i] = await mapper(list[i], i);
      }
    });
    await Promise.all(workers);
    return results;
  }

  router.get('/cart-upsell', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const [rows] = await db.query(
        `SELECT p.id, p.tenant_id, p.name, p.price, p.base_qty, p.base_unit_id, p.unit_id, p.photos_json,
                s.qty AS stock_qty,
                EXISTS(
                  SELECT 1
                  FROM prod_option_assignments oa
                  JOIN prod_option_groups og ON og.tenant_id = oa.tenant_id AND og.id = oa.group_id
                  WHERE oa.tenant_id = p.tenant_id
                    AND oa.assign_type = 'product' AND oa.assign_id = p.id
                    AND oa.is_active = 1 AND og.is_active = 1
                  LIMIT 1
                ) AS has_options
         FROM prod_categories c
         JOIN prod_product_categories pc ON pc.tenant_id = c.tenant_id AND pc.category_id = c.id
         JOIN prod_products p ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE c.tenant_id = ? AND c.cart_visibility = 1 AND c.is_active = 1
           AND p.is_active = 1 AND p.site_visibility = 1
         GROUP BY p.id
         ORDER BY c.sort_order ASC, pc.sort_order ASC, p.id ASC
         LIMIT 30`,
        [storeId, tenantId]
      );

      for (const r of rows) {
        r.photos = safeJsonArray(r.photos_json);
        r.is_available = (r.stock_qty == null || Number(r.stock_qty) > 0);
        attachProductThumbs(r);
      }
      await enrichProductsWithDisplayPrice(rows, tenantId);
      await enrichProductsWithDiscounts(rows, tenantId, storeId);

      // Р”РѕР±Р°РІР»СЏРµРј РґР°РЅРЅС‹Рµ РґРµС„РѕР»С‚РЅРѕРіРѕ РІР°СЂРёР°РЅС‚Р° РґР»СЏ РєРѕСЂСЂРµРєС‚РЅРѕРіРѕ РґРѕР±Р°РІР»РµРЅРёСЏ РІ РєРѕСЂР·РёРЅСѓ
      const upsellProductIds = rows.map(r => Number(r.id)).filter(Boolean);
      if (upsellProductIds.length) {
        const phUpsell = upsellProductIds.map(() => '?').join(',');
        const [vaUpsellRows] = await db.query(
          `SELECT va.product_id, va.variant_group_id,
                  COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
                  vg.unit_id, vg.values,
                  u.short_title AS unit_short_title
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
           LEFT JOIN prod_units u ON u.id = vg.unit_id
           WHERE va.tenant_id = ? AND va.product_id IN (${phUpsell})
             AND va.is_active = 1 AND vg.is_active = 1
           ORDER BY va.sort_order ASC, vg.sort_order ASC`,
          [tenantId, ...upsellProductIds]
        );
        const variantMap = new Map();
        for (const r of vaUpsellRows) {
          const pid = Number(r.product_id);
          if (variantMap.has(pid)) continue;
          const values = safeJsonArray(r.values);
          if (!values.length) continue;
          const defaultIdx = r.default_value_index != null ? Number(r.default_value_index) : 0;
          const idx = defaultIdx >= 0 && defaultIdx < values.length ? defaultIdx : 0;
          variantMap.set(pid, {
            variant_group_id: Number(r.variant_group_id),
            variant_value_index: idx,
            variant_label: String(values[idx]) + (r.unit_short_title ? ' ' + r.unit_short_title : ''),
          });
        }
        for (const row of rows) {
          const v = variantMap.get(Number(row.id));
          if (v) {
            v.variant_unit_price = row.display_price;
            row.default_variant = v;
          }
        }
      }

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const categoryId = await resolveCategoryIdFromQuery(tenantId, req);
      if (!Number.isFinite(categoryId)) {
        return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
      }

      // Р‘С‹СЃС‚СЂС‹Р№ "lite" СЂРµР¶РёРј РґР»СЏ РїРµСЂРІРѕРіРѕ СЌРєСЂР°РЅР° РІРёС‚СЂРёРЅС‹:
      // - РјРёРЅРёРјР°Р»СЊРЅС‹Р№ РЅР°Р±РѕСЂ РїРѕР»РµР№
      // - СѓРїСЂРѕС‰С‘РЅРЅР°СЏ РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ (С‚РѕР»СЊРєРѕ РїРѕ stock_qty)
      // - РѕРіСЂР°РЅРёС‡РµРЅРёРµ РєРѕР»РёС‡РµСЃС‚РІР°
      // РќСѓР¶РµРЅ, С‡С‚РѕР±С‹ LCP-РєР°СЂС‚РёРЅРєР° РЅР°С‡РёРЅР°Р»Р° РіСЂСѓР·РёС‚СЊСЃСЏ СЃСЂР°Р·Сѓ, Р° РЅРµ РїРѕСЃР»Рµ С‚СЏР¶С‘Р»С‹С… РїРѕРґР·Р°РїСЂРѕСЃРѕРІ.
      const lite = helpers.toBool(req.query.lite, false);
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 0)) || 0;
      if (lite) {
        // "all"
        const [all] = await db.query(
          `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
          [tenantId]
        );
        const allCategoryId = all.length ? Number(all[0].id) : null;

        const limSql = limit > 0 ? `LIMIT ${Number(limit)}` : '';

        if (allCategoryId && categoryId === allCategoryId) {
          const [rows] = await db.query(
            `SELECT p.id, p.tenant_id, p.name, p.description_short, p.price, p.base_qty, p.base_unit_id, p.unit_id, p.photos_json,
              s.qty AS stock_qty,
              pc.sort_order AS link_sort_order
             FROM prod_products p
             LEFT JOIN prod_product_stocks s
               ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
             LEFT JOIN prod_product_categories pc
               ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
             WHERE p.tenant_id=? AND p.is_active=1 AND p.site_visibility=1
             ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC
             ${limSql}`,
            [storeId, categoryId, tenantId]
          );
          for (const r of rows) {
            r.photos = safeJsonArray(r.photos_json);
            r.is_available = (r.stock_qty == null || Number(r.stock_qty) > 0);
            attachProductThumbs(r);
          }
          await enrichProductsWithDisplayPrice(rows, tenantId);
          await enrichProductsWithDiscounts(rows, tenantId, storeId);
          return res.json({ ok: true, data: rows, combos: [], category_id: categoryId, lite: true });
        }

        const [rows] = await db.query(
          `SELECT p.id, p.tenant_id, p.name, p.description_short, p.price, p.base_qty, p.base_unit_id, p.unit_id, p.photos_json,
            s.qty AS stock_qty,
            pc.sort_order AS link_sort_order
           FROM prod_product_categories pc
           JOIN prod_products p
             ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
           LEFT JOIN prod_product_stocks s
             ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
           WHERE pc.tenant_id=? AND pc.category_id=?
             AND p.is_active=1 AND p.site_visibility=1
           ORDER BY pc.sort_order ASC, pc.id ASC
           ${limSql}`,
          [storeId, tenantId, categoryId]
        );
        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = (r.stock_qty == null || Number(r.stock_qty) > 0);
          attachProductThumbs(r);
        }
        await enrichProductsWithDisplayPrice(rows, tenantId);
        await enrichProductsWithDiscounts(rows, tenantId, storeId);
        return res.json({ ok: true, data: rows, combos: [], category_id: categoryId, lite: true });
      }

      // "all"
      const [all] = await db.query(
        `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
        [tenantId]
      );
      const allCategoryId = all.length ? Number(all[0].id) : null;

      if (allCategoryId && categoryId === allCategoryId) {
        const [rows] = await db.query(
          `SELECT p.*, pc.sort_order AS link_sort_order,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients i
                JOIN prod_product_stocks si
                  ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                  AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1
                FROM prod_option_assignments oa
                JOIN prod_option_groups og
                  ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id
                  AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1
                  AND og.is_active=1
                  AND COALESCE(og.out_of_stock_action, 1)=0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM prod_option_items oi
                    JOIN prod_products op
                      ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops
                      ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product'
                      AND oi.is_active=1
                      AND op.is_active=1
                      AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1
                        FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips
                          ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                          AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
           FROM prod_products p
           LEFT JOIN prod_product_stocks s
             ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
           LEFT JOIN prod_product_categories pc
             ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
           WHERE p.tenant_id=? AND p.is_active=1 AND p.site_visibility=1
           ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
          [storeId, storeId, storeId, storeId, categoryId, tenantId]
        );

        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = Number(r.is_available || 0) === 1;
          attachProductThumbs(r);
        }
        await enrichProductsWithDisplayPrice(rows, tenantId);
        await enrichProductsWithDiscounts(rows, tenantId, storeId);
        const combos = await getCombosForCategoryCached(tenantId, storeId, categoryId);
        return res.json({ ok: true, data: rows, combos, category_id: categoryId });
      }

      const [rows] = await db.query(
        `SELECT p.*, pc.sort_order AS link_sort_order,
          s.qty AS stock_qty,
          CASE
            WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
              SELECT 1
              FROM prod_product_ingredients i
              JOIN prod_product_stocks si
                ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
              WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                AND si.qty IS NOT NULL AND si.qty <= 0
            ) AND NOT EXISTS (
              SELECT 1
              FROM prod_option_assignments oa
              JOIN prod_option_groups og
                ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
              WHERE oa.tenant_id=p.tenant_id
                AND oa.assign_type='product' AND oa.assign_id=p.id
                AND oa.is_active=1
                AND og.is_active=1
                AND COALESCE(og.out_of_stock_action, 1)=0
                AND NOT EXISTS (
                  SELECT 1
                  FROM prod_option_items oi
                  JOIN prod_products op
                    ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                  LEFT JOIN prod_product_stocks ops
                    ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                  WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                    AND oi.target_type='product'
                    AND oi.is_active=1
                    AND op.is_active=1
                    AND op.site_visibility=1
                    AND (ops.qty IS NULL OR ops.qty > 0)
                    AND NOT EXISTS (
                      SELECT 1
                      FROM prod_product_ingredients ip
                      JOIN prod_product_stocks ips
                        ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                      WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                        AND ips.qty IS NOT NULL AND ips.qty <= 0
                    )
                )
            )
            THEN 1 ELSE 0
          END AS is_available
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE pc.tenant_id=? AND pc.category_id=?
           AND p.is_active=1 AND p.site_visibility=1
         ORDER BY pc.sort_order ASC, pc.id ASC`,
        [storeId, storeId, storeId, storeId, tenantId, categoryId]
      );

      for (const r of rows) {
        r.photos = safeJsonArray(r.photos_json);
        r.is_available = Number(r.is_available || 0) === 1;
        attachProductThumbs(r);
      }
      await enrichProductsWithDisplayPrice(rows, tenantId);
      await enrichProductsWithDiscounts(rows, tenantId, storeId);
      const combos = await getCombosForCategoryCached(tenantId, storeId, categoryId);
      res.json({ ok: true, data: rows, combos, category_id: categoryId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // Р‘Р°С‚С‡-Р·Р°РіСЂСѓР·РєР° РїСЂРѕРґСѓРєС‚РѕРІ РїРѕ РЅРµСЃРєРѕР»СЊРєРёРј РєР°С‚РµРіРѕСЂРёСЏРј Р·Р° РѕРґРёРЅ Р·Р°РїСЂРѕСЃ
  router.post('/products/batch/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const rawIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids : [];
      const categoryIds = rawIds.map(Number).filter(n => Number.isFinite(n) && n > 0);
      if (!categoryIds.length) return res.json({ ok: true, data: {} });
      if (categoryIds.length > 50) return res.status(400).json({ ok: false, error: 'TOO_MANY' });

      // РћРїСЂРµРґРµР»СЏРµРј "all"-РєР°С‚РµРіРѕСЂРёСЋ
      const [allRows] = await db.query(
        `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
        [tenantId]
      );
      const allCategoryId = allRows.length ? Number(allRows[0].id) : null;

      // Р Р°Р·РґРµР»СЏРµРј: РѕР±С‹С‡РЅС‹Рµ РєР°С‚РµРіРѕСЂРёРё Рё "all"
      const normalIds = categoryIds.filter(id => id !== allCategoryId);
      const hasAll = allCategoryId && categoryIds.includes(allCategoryId);

      const productIsAvailableSql = getProductIsAvailableSql('p', 's');
      const allProducts = []; // { ...product, _category_id }

      // Р—Р°РіСЂСѓР¶Р°РµРј РїСЂРѕРґСѓРєС‚С‹ РѕР±С‹С‡РЅС‹С… РєР°С‚РµРіРѕСЂРёР№ РѕРґРЅРёРј Р·Р°РїСЂРѕСЃРѕРј
      if (normalIds.length) {
        const ph = normalIds.map(() => '?').join(',');
        const [rows] = await db.query(
          `SELECT p.*, pc.category_id AS _category_id, pc.sort_order AS link_sort_order,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1 FROM prod_product_ingredients i
                JOIN prod_product_stocks si ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1 FROM prod_option_assignments oa
                JOIN prod_option_groups og ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1 AND og.is_active=1 AND COALESCE(og.out_of_stock_action,1)=0
                  AND NOT EXISTS (
                    SELECT 1 FROM prod_option_items oi
                    JOIN prod_products op ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product' AND oi.is_active=1 AND op.is_active=1 AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1 FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
           FROM prod_product_categories pc
           JOIN prod_products p ON p.tenant_id=pc.tenant_id AND p.id=pc.product_id
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           WHERE pc.tenant_id=? AND pc.category_id IN (${ph})
             AND p.is_active=1 AND p.site_visibility=1
           ORDER BY pc.category_id ASC, pc.sort_order ASC, pc.id ASC`,
          [storeId, storeId, storeId, storeId, tenantId, ...normalIds]
        );
        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = Number(r.is_available || 0) === 1;
          attachProductThumbs(r);
          allProducts.push(r);
        }
      }

      // Р—Р°РіСЂСѓР¶Р°РµРј РїСЂРѕРґСѓРєС‚С‹ "all"-РєР°С‚РµРіРѕСЂРёРё
      if (hasAll) {
        const [rows] = await db.query(
          `SELECT p.*, ? AS _category_id, pc.sort_order AS link_sort_order,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1 FROM prod_product_ingredients i
                JOIN prod_product_stocks si ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1 FROM prod_option_assignments oa
                JOIN prod_option_groups og ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1 AND og.is_active=1 AND COALESCE(og.out_of_stock_action,1)=0
                  AND NOT EXISTS (
                    SELECT 1 FROM prod_option_items oi
                    JOIN prod_products op ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product' AND oi.is_active=1 AND op.is_active=1 AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1 FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
           FROM prod_products p
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           LEFT JOIN prod_product_categories pc ON pc.tenant_id=p.tenant_id AND pc.product_id=p.id AND pc.category_id=?
           WHERE p.tenant_id=? AND p.is_active=1 AND p.site_visibility=1
           ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
          [allCategoryId, storeId, storeId, storeId, storeId, allCategoryId, tenantId]
        );
        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = Number(r.is_available || 0) === 1;
          attachProductThumbs(r);
          allProducts.push(r);
        }
      }

      // РћР±РѕРіР°С‰Р°РµРј РІСЃРµ РїСЂРѕРґСѓРєС‚С‹ Р·Р° РѕРґРёРЅ РїСЂРѕС…РѕРґ
      await enrichProductsWithDisplayPrice(allProducts, tenantId);
      await enrichProductsWithDiscounts(allProducts, tenantId, storeId);

      // Р“СЂСѓРїРїРёСЂСѓРµРј РїРѕ category_id
      const productsByCategory = {};
      for (const id of categoryIds) productsByCategory[id] = [];
      for (const p of allProducts) {
        const cid = Number(p._category_id);
        if (productsByCategory[cid]) productsByCategory[cid].push(p);
      }

      // Р—Р°РіСЂСѓР¶Р°РµРј РєРѕРјР±Рѕ РґР»СЏ РІСЃРµС… РєР°С‚РµРіРѕСЂРёР№ РїР°СЂР°Р»Р»РµР»СЊРЅРѕ
      const combosResults = await mapWithConcurrency(categoryIds, 4, async (id) => {
        try {
          const combos = await getCombosForCategoryCached(tenantId, storeId, id);
          return [id, combos];
        } catch {
          return [id, []];
        }
      });
      const combosByCategory = {};
      for (const [id, combos] of combosResults) combosByCategory[id] = combos;

      res.json({ ok: true, data: productsByCategory, combos: combosByCategory });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [rows] = await db.query(
        `SELECT p.*,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients i
                JOIN prod_product_stocks si
                  ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                  AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1
                FROM prod_option_assignments oa
                JOIN prod_option_groups og
                  ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id
                  AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1
                  AND og.is_active=1
                  AND COALESCE(og.out_of_stock_action, 1)=0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM prod_option_items oi
                    JOIN prod_products op
                      ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops
                      ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product'
                      AND oi.is_active=1
                      AND op.is_active=1
                      AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1
                        FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips
                          ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                          AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
         FROM prod_products p
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE p.tenant_id=? AND p.id=? AND p.is_active=1 AND p.site_visibility=1
         LIMIT 1`,
        [storeId, storeId, storeId, storeId, tenantId, id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const p = rows[0];
      p.photos = safeJsonArray(p.photos_json);
      attachProductThumbs(p);
      p.is_available = Number(p.is_available || 0) === 1;

      await enrichProductsWithDisplayPrice([p], tenantId);
      await enrichProductsWithDiscounts([p], tenantId, storeId);

      res.json({ ok: true, data: p });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [pcsRows] = await db.query(
        `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
        [tenantId]
      );
      const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : null;

      const [rows] = await db.query(
        `SELECT 
           i.id,
           i.ingredient_id,
           i.quantity,
           i.unit_id,
           i.quantity_min,
           i.quantity_max,
           i.quantity_step,
           i.price_override,
           i.is_variable,
           i.sort_order,
           p.name AS ingredient_name,
           p.price AS ingredient_price,
           p.base_unit_id AS ingredient_base_unit_id,
           p.base_qty AS ingredient_base_qty,
           p.unit_id AS ingredient_unit_id,
           p.photos_json AS ingredient_photos,
           u.code AS unit_code,
           u.title AS unit_title,
           u.short_title AS unit_short_title,
           pul.factor AS ingredient_pcs_factor
         FROM prod_product_ingredients i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
         JOIN prod_units u ON u.id=i.unit_id
         LEFT JOIN prod_product_unit_links pul
           ON pul.tenant_id=i.tenant_id
          AND pul.product_id=i.ingredient_id
          AND pul.base_unit_id=p.base_unit_id
          AND pul.unit_id=?
         WHERE i.tenant_id=? AND i.product_id=?
           AND (i.is_variable = 1 OR i.is_variable IS NULL)
         ORDER BY i.sort_order ASC, i.id ASC`,
        [pcsUnitId || 0, tenantId, productId]
      );

      for (const r of rows) {
        r.ingredient_photos = safeJsonArray(r.ingredient_photos);
      }

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // Batch ingredients for multiple products in one request
  router.post('/products/batch/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
      if (!ids.length) return res.json({ ok: true, data: {} });
      if (ids.length > 200) return res.status(400).json({ ok: false, error: 'TOO_MANY' });

      const [pcsRows] = await db.query(
        `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
        [tenantId]
      );
      const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : null;

      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT
           i.product_id,
           i.id,
           i.ingredient_id,
           i.quantity,
           i.unit_id,
           i.quantity_min,
           i.quantity_max,
           i.quantity_step,
           i.price_override,
           i.is_variable,
           i.sort_order,
           p.name AS ingredient_name,
           p.price AS ingredient_price,
           p.base_unit_id AS ingredient_base_unit_id,
           p.base_qty AS ingredient_base_qty,
           p.unit_id AS ingredient_unit_id,
           p.photos_json AS ingredient_photos,
           u.code AS unit_code,
           u.title AS unit_title,
           u.short_title AS unit_short_title,
           pul.factor AS ingredient_pcs_factor
         FROM prod_product_ingredients i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
         JOIN prod_units u ON u.id=i.unit_id
         LEFT JOIN prod_product_unit_links pul
           ON pul.tenant_id=i.tenant_id
          AND pul.product_id=i.ingredient_id
          AND pul.base_unit_id=p.base_unit_id
          AND pul.unit_id=?
         WHERE i.tenant_id=? AND i.product_id IN (${placeholders})
           AND (i.is_variable = 1 OR i.is_variable IS NULL)
         ORDER BY i.product_id ASC, i.sort_order ASC, i.id ASC`,
        [pcsUnitId || 0, tenantId, ...ids]
      );

      const result = {};
      for (const r of rows) {
        r.ingredient_photos = safeJsonArray(r.ingredient_photos);
        const pid = Number(r.product_id);
        if (!result[pid]) result[pid] = [];
        result[pid].push(r);
      }

      res.json({ ok: true, data: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ С‚РѕРІР°СЂ Р°РєС‚РёРІРµРЅ Рё РІРёРґРµРЅ РЅР° СЃР°Р№С‚Рµ
      const [productCheck] = await db.query(
        `SELECT id FROM prod_products 
         WHERE tenant_id=? AND id=? AND is_active=1 AND site_visibility=1 
         LIMIT 1`,
        [tenantId, productId]
      );
      if (!productCheck.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // РџРѕР»СѓС‡Р°РµРј Р°РєС‚РёРІРЅС‹Рµ РЅР°Р·РЅР°С‡РµРЅРёСЏ РѕРїС†РёР№ РґР»СЏ С‚РѕРІР°СЂР°
      const [rows] = await db.query(
        `SELECT 
           a.id AS assignment_id, 
           a.group_id, 
           a.priority, 
           a.sort_order, 
           a.is_active,
           a.selection_type AS assignment_selection_type,
           a.min_select AS assignment_min_select,
           a.max_select AS assignment_max_select,
           g.title, 
           g.selection_type AS group_selection_type, 
           g.min_select AS group_min_select, 
           g.max_select AS group_max_select,
           g.is_required,
           g.out_of_stock_action
         FROM prod_option_assignments a
         JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
         WHERE a.tenant_id=? 
           AND a.assign_type='product' 
           AND a.assign_id=?
           AND a.is_active=1
           AND g.is_active=1
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, productId]
      );

      // РќРѕСЂРјР°Р»РёР·СѓРµРј РґР°РЅРЅС‹Рµ: РёСЃРїРѕР»СЊР·СѓРµРј Р·РЅР°С‡РµРЅРёСЏ РёР· РЅР°Р·РЅР°С‡РµРЅРёСЏ, РµСЃР»Рё Р·Р°РґР°РЅС‹, РёРЅР°С‡Рµ РёР· РіСЂСѓРїРїС‹
      const assignments = rows.map((r) => ({
        assignment_id: Number(r.assignment_id),
        group_id: Number(r.group_id),
        title: str(r.title || ""),
        selection_type: r.assignment_selection_type || r.group_selection_type || "single",
        min_select: r.assignment_min_select ?? r.group_min_select ?? 0,
        max_select: r.assignment_max_select ?? r.group_max_select ?? null,
        is_required: Number(r.is_required ?? 0) === 1,
        is_active: Number(r.is_active || 0) === 1,
        out_of_stock_action: r.out_of_stock_action == null ? 1 : Number(r.out_of_stock_action),
        priority: Number(r.priority || 0),
        sort_order: Number(r.sort_order || 0),
      }));

      res.json({ ok: true, data: assignments });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/options/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // РџРѕР»СѓС‡Р°РµРј РіСЂСѓРїРїСѓ РѕРїС†РёР№
      let group;
      try {
        const [rows] = await db.query(
          `SELECT * FROM prod_option_groups 
           WHERE tenant_id=? AND id=? AND is_active=1 
           LIMIT 1`,
          [tenantId, id]
        );
        group = rows[0] || null;
      } catch (dbError) {
        console.error('DB query error in /options/groups/:id:', dbError);
        if (dbError.code === 'ETIMEDOUT' || dbError.code === 'ECONNREFUSED') {
          return res.status(503).json({ ok: false, error: 'DB_CONNECTION_ERROR', message: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ Рє Р±Р°Р·Рµ РґР°РЅРЅС‹С…' });
        }
        throw dbError;
      }
      
      if (!group) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // РџРѕР»СѓС‡Р°РµРј СЌР»РµРјРµРЅС‚С‹ РѕРїС†РёРё (С‚РѕР»СЊРєРѕ Р°РєС‚РёРІРЅС‹Рµ С‚РѕРІР°СЂС‹)
      const [items] = await db.query(
        `SELECT 
           i.id,
           i.group_id,
           i.target_product_id,
           i.target_type,
           i.price_mode,
           i.price_value,
           i.qty_min,
           i.qty_max,
           i.is_active,
           i.sort_order,
           p.name AS product_name,
           p.price AS product_price,
           p.photos_json AS product_photos_json
         FROM prod_option_items i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
         LEFT JOIN prod_product_stocks ps
           ON ps.tenant_id = p.tenant_id AND ps.store_id = ? AND ps.product_id = p.id
         WHERE i.tenant_id=? 
           AND i.group_id=? 
           AND i.target_type='product'
           AND i.is_active=1
           AND p.is_active=1
           AND p.site_visibility=1
           AND (ps.qty IS NULL OR ps.qty > 0)
           AND NOT EXISTS (
             SELECT 1
             FROM prod_product_ingredients pi
             JOIN prod_product_stocks psi
               ON psi.tenant_id=pi.tenant_id AND psi.store_id=? AND psi.product_id=pi.ingredient_id
             WHERE pi.tenant_id=p.tenant_id AND pi.product_id=p.id
               AND psi.qty IS NOT NULL AND psi.qty <= 0
           )
           AND NOT EXISTS (
             SELECT 1
             FROM prod_option_assignments oa
             JOIN prod_option_groups og
               ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
             WHERE oa.tenant_id=p.tenant_id
               AND oa.assign_type='product' AND oa.assign_id=p.id
               AND oa.is_active=1
               AND og.is_active=1
               AND COALESCE(og.out_of_stock_action, 1)=0
               AND NOT EXISTS (
                 SELECT 1
                 FROM prod_option_items oi
                 JOIN prod_products op
                   ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                 LEFT JOIN prod_product_stocks ops
                   ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                 WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                   AND oi.target_type='product'
                   AND oi.is_active=1
                   AND op.is_active=1
                   AND op.site_visibility=1
                   AND (ops.qty IS NULL OR ops.qty > 0)
                   AND NOT EXISTS (
                     SELECT 1
                     FROM prod_product_ingredients ip
                     JOIN prod_product_stocks ips
                       ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                     WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                       AND ips.qty IS NOT NULL AND ips.qty <= 0
                   )
               )
           )
         ORDER BY i.sort_order ASC, i.id ASC`,
        [storeId, tenantId, id, storeId, storeId, storeId]
      );

      // РЎРѕР±РёСЂР°РµРј РІСЃРµ product_id РґР»СЏ Р·Р°РіСЂСѓР·РєРё РІР°СЂРёР°РЅС‚РѕРІ
      const productIds = items.map(item => Number(item.target_product_id)).filter(Number.isFinite);
      
      // Р—Р°РіСЂСѓР¶Р°РµРј РІР°СЂРёР°РЅС‚С‹ РґР»СЏ РІСЃРµС… С‚РѕРІР°СЂРѕРІ-РѕРїС†РёР№ РѕРґРЅРёРј Р·Р°РїСЂРѕСЃРѕРј
      let variantsByProductId = new Map();
      let tiersByGroupId = new Map();
      if (productIds.length > 0) {
        const [variantAssignments] = await db.query(
          `SELECT 
             va.product_id,
             vg.id AS variant_group_id,
             vg.title AS variant_title,
             vg.unit_id,
             vg.values AS variant_values,
             vg.default_value_index AS group_default_value_index,
             va.default_value_index AS assignment_default_value_index,
             u.code AS unit_code,
             u.title AS unit_title,
             u.short_title AS unit_short_title,
             va.sort_order
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id
           LEFT JOIN prod_units u ON u.id = vg.unit_id
           WHERE va.tenant_id = ? 
             AND va.product_id IN (${productIds.map(() => '?').join(',')})
             AND va.is_active = 1 AND vg.is_active = 1
           ORDER BY va.product_id, va.sort_order ASC`,
          [tenantId, ...productIds]
        );

        // РЎРѕР±РёСЂР°РµРј РІСЃРµ id РіСЂСѓРїРї РІР°СЂРёР°РЅС‚РѕРІ, С‡С‚РѕР±С‹ РїРѕРґС‚СЏРЅСѓС‚СЊ СЃРєРёРґРєРё/РЅР°РґР±Р°РІРєРё
        const variantGroupIds = Array.from(
          new Set(variantAssignments.map((va) => Number(va.variant_group_id)).filter(Number.isFinite))
        );
        if (variantGroupIds.length > 0) {
          const [tiers] = await db.query(
            `SELECT variant_group_id, min_quantity, discount_percent, sort_order
             FROM prod_variant_discount_tiers
             WHERE tenant_id=? AND variant_group_id IN (${variantGroupIds.map(() => '?').join(',')})
             ORDER BY variant_group_id ASC, sort_order ASC, min_quantity ASC`,
            [tenantId, ...variantGroupIds]
          );
          for (const t of tiers) {
            const gid = Number(t.variant_group_id);
            if (!tiersByGroupId.has(gid)) tiersByGroupId.set(gid, []);
            tiersByGroupId.get(gid).push({
              min_quantity: t.min_quantity,
              discount_percent: t.discount_percent,
              sort_order: t.sort_order,
            });
          }
        }
        
        // Р“СЂСѓРїРїРёСЂСѓРµРј РІР°СЂРёР°РЅС‚С‹ РїРѕ product_id
        for (const va of variantAssignments) {
          const pid = Number(va.product_id);
          if (!variantsByProductId.has(pid)) {
            variantsByProductId.set(pid, []);
          }
          const groupDefaultIdx = va.group_default_value_index != null ? Number(va.group_default_value_index) : null;
          const assignmentDefaultIdx = va.assignment_default_value_index != null ? Number(va.assignment_default_value_index) : null;
          // РћРїСЂРµРґРµР»СЏРµРј РґРµС„РѕР»С‚РЅС‹Р№ РёРЅРґРµРєСЃ: СЃРЅР°С‡Р°Р»Р° РёР· РїСЂРёРІСЏР·РєРё, РїРѕС‚РѕРј РёР· РіСЂСѓРїРїС‹
          const defaultIdx = assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx;
          const groupId = Number(va.variant_group_id);
          variantsByProductId.get(pid).push({
            variant_group_id: groupId,
            title: str(va.variant_title || ""),
            unit_id: va.unit_id ? Number(va.unit_id) : null,
            unit_code: str(va.unit_code || ""),
            unit_title: str(va.unit_title || ""),
            unit_short_title: str(va.unit_short_title || ""),
            values: safeJsonArray(va.variant_values),
            default_value_index: defaultIdx,
            discount_tiers: tiersByGroupId.get(groupId) || [],
          });
        }
      }

      // РќРѕСЂРјР°Р»РёР·СѓРµРј СЌР»РµРјРµРЅС‚С‹
      const normalizedItems = items.map((item) => {
        const photos = safeJsonArray(item.product_photos_json);
        const productId = Number(item.target_product_id);
        const variants = variantsByProductId.get(productId) || [];
        
        return {
          id: Number(item.id),
          target_product_id: productId,
          name: str(item.product_name || ""),
          product_name: str(item.product_name || ""),
          product_price: Number(item.product_price || 0),
          product_photos_json: photos,
          price_mode: item.price_mode || "from_target",
          price_value: Number(item.price_value || 0),
          qty_min: Number(item.qty_min ?? 1),
          qty_max: Number(item.qty_max ?? 1),
          is_active: Number(item.is_active || 0) === 1,
          sort_order: Number(item.sort_order || 0),
          // Р’Р°СЂРёР°РЅС‚С‹ С‚РѕРІР°СЂР°-РѕРїС†РёРё
          variants: variants,
        };
      });

      res.json({
        ok: true,
        data: {
          group: {
            id: Number(group.id),
            title: str(group.title || ""),
            selection_type: group.selection_type || "single",
            min_select: group.min_select ?? 0,
            max_select: group.max_select ?? null,
            is_required: Number(group.is_required ?? 0) === 1,
            allow_variants: Number(group.allow_variants ?? 0) === 1,
            is_active: Number(group.is_active || 0) === 1,
          },
          items: normalizedItems,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id/variants', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [variants] = await db.query(
        `SELECT 
           vg.id,
           vg.title,
           vg.unit_id,
           vg.values,
           vg.is_active,
           vg.sort_order,
           vg.default_value_index AS group_default_value_index,
           va.default_value_index AS assignment_default_value_index,
           u.code AS unit_code,
           u.title AS unit_title,
           u.short_title AS unit_short_title,
           va.sort_order AS assignment_sort_order
         FROM prod_variant_assignments va
         JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
         LEFT JOIN prod_units u ON u.id=vg.unit_id
         WHERE va.tenant_id=? AND va.product_id=?
           AND va.is_active=1 AND vg.is_active=1
         ORDER BY va.sort_order ASC, vg.sort_order ASC`,
        [tenantId, productId]
      );

      for (const v of variants) {
        v.values = safeJsonArray(v.values);
        const groupDefaultIdx = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
        const assignmentDefaultIdx = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
        v.default_value_index = assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx;
        const [tiers] = await db.query(
          `SELECT min_quantity, discount_percent, sort_order
           FROM prod_variant_discount_tiers
           WHERE tenant_id=? AND variant_group_id=?
           ORDER BY sort_order ASC, min_quantity ASC`,
          [tenantId, v.id]
        );
        v.discount_tiers = tiers;
      }

      res.json({ ok: true, data: variants });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function parseDeliveryTimeMinutes(value) {
    if (!value) return null;
    const [hours, mins] = String(value).split(":");
    const h = Number(hours);
    const m = Number(mins);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(24 * 60, h * 60 + m));
  }

  function getStoreLocalTimestamp(offsetValue) {
    const offsetHours = Number.isNaN(Number(offsetValue)) ? 0 : Number(offsetValue);
    const offsetMinutes = Math.round(offsetHours * 60);
    return Date.now() + offsetMinutes * 60 * 1000;
  }

  function isStoreDeliveryOpenNow(hours, timezoneOffset) {
    if (!Array.isArray(hours) || !hours.length) return false;
    if (!timezoneOffset && timezoneOffset !== 0) timezoneOffset = "+0";
    const ts = getStoreLocalTimestamp(timezoneOffset);
    const local = new Date(ts);
    const day = local.getUTCDay();
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const entry = hours.find((row) => Number(row.day_of_week) === day);
    if (!entry) return false;
    if (Number(entry.is_closed) === 1) return false;
    const opens = parseDeliveryTimeMinutes(entry.opens_at);
    const closes = parseDeliveryTimeMinutes(entry.closes_at);
    if (opens === null || closes === null) return false;
    return minutes >= opens && minutes < closes;
  }

  /**
   * Check if store is currently open (based on regular hours, not delivery hours)
   */
  function isStoreOpenNow(hours, timezoneOffset) {
    if (!Array.isArray(hours) || !hours.length) return false;
    if (!timezoneOffset && timezoneOffset !== 0) timezoneOffset = "+0";
    const ts = getStoreLocalTimestamp(timezoneOffset);
    const local = new Date(ts);
    const day = local.getUTCDay();
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const entry = hours.find((row) => Number(row.day_of_week) === day);
    if (!entry) return false;
    if (Number(entry.is_closed) === 1) return false;
    const opens = parseDeliveryTimeMinutes(entry.opens_at);
    const closes = parseDeliveryTimeMinutes(entry.closes_at);
    if (opens === null || closes === null) return false;
    return minutes >= opens && minutes < closes;
  }

  // ------------------------------
  // order-config (РґР»СЏ РѕС„РѕСЂРјР»РµРЅРёСЏ)
  // Р’РђР–РќРћ: С‚РІРѕР№ С„СЂРѕРЅС‚ Р¶РґС‘С‚ methods / payments / timeOptions
  // ------------------------------
  router.get('/order-config', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const [statuses] = await db.query(
        `SELECT id, code, title, subtitle, icon, color, sort
         FROM order_statuses
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [payments] = await db.query(
        `SELECT id, code, title, icon, sort
         FROM order_payments
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      // РџР•Р Р•РРњР•РќРћР’РђРќРћ: order_delivery_types (Р±С‹РІС€Р°СЏ order_methods)
      const [methods] = await db.query(
        `SELECT id, code, title, icon, sort, is_default
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY is_default DESC, sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [timeOptions] = await db.query(
        `SELECT id, code, title, description,
                has_time_window, starts_at, ends_at, step_minutes, lead_minutes, sort
         FROM order_time_options
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [storeRows] = await db.query(
        'SELECT id, timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      const store = storeRows[0] || null;
      const storeTimezone = store?.timezone || "+0";

      const [storeHours] = await db.query(
        `SELECT day_of_week, opens_at, closes_at, is_closed
         FROM ten_store_hours
         WHERE tenant_id=? AND store_id=?
         ORDER BY day_of_week ASC`,
        [tenantId, storeId]
      );

      const [deliveryHours] = await db.query(
        `SELECT day_of_week, opens_at, closes_at, is_closed
         FROM ten_store_delivery_hours
         WHERE tenant_id=? AND store_id=?
         ORDER BY day_of_week ASC`,
        [tenantId, storeId]
      );

      const storeIsOpen = isStoreOpenNow(storeHours, storeTimezone);
      const deliveryIsOpen = isStoreDeliveryOpenNow(deliveryHours, storeTimezone);

      res.json({
        ok: true,
        data: {
          statuses,
          payments,
          methods,
          timeOptions,
          storeHours,
          storeDeliveryHours: deliveryHours,
          storeTimezone,
          storeIsOpen,
          deliveryIsOpen
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // pre-check cart stock availability (without deduction)
  // ------------------------------
  router.post('/orders/stock-check', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!items.length) {
        return res.json({
          ok: true,
          data: {
            available: true,
            shortages: [],
            stock_levels: [],
          },
        });
      }

      const checkResult = await checkStockAvailabilityForOrderItems({
        db,
        tenantId,
        storeId,
        items,
      });

      if (!checkResult.available) {
        return res.json({
          ok: true,
          data: {
            available: false,
            shortages: checkResult.shortages,
            stock_levels: Array.isArray(checkResult.stockLevels) ? checkResult.stockLevels : [],
          },
        });
      }

      return res.json({
        ok: true,
        data: {
          available: true,
          shortages: [],
          stock_levels: Array.isArray(checkResult.stockLevels) ? checkResult.stockLevels : [],
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // create order
  // ------------------------------
  router.post('/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      let orderStoreId = storeId;

      const [tenantRows] = await db.query(
        'SELECT price_rounding_mode, price_rounding_precision, order_stock_deduct_mode, order_stock_deduct_status_id FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const roundingModeRaw = tenantRows[0]?.price_rounding_mode || 'none';
      const roundingPrecisionRaw = Number(tenantRows[0]?.price_rounding_precision);
      const stockDeductModeRaw = String(tenantRows[0]?.order_stock_deduct_mode || 'on_create').trim();
      const stockDeductMode = stockDeductModeRaw === 'on_status' ? 'on_status' : 'on_create';
      const allowedRounding = new Set(['none', 'down', 'up', 'nearest']);
      const roundingMode = allowedRounding.has(roundingModeRaw) ? roundingModeRaw : 'none';
      const roundingPrecision = roundingPrecisionRaw === 0 ? 0 : 2;

      function roundPrice(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n)) return 0;
        if (roundingMode === 'none') return n;
        const factor = roundingPrecision > 0 ? Math.pow(10, roundingPrecision) : 1;
        if (roundingMode === 'up') return Math.ceil(n * factor) / factor;
        if (roundingMode === 'down') return Math.floor(n * factor) / factor;
        return Math.round(n * factor) / factor;
      }

      // auth customer (optional)
      const token = str(req.headers['x-customer-token']);
      const authCustomer = token ? await getCustomerByToken(tenantId, token) : null;

      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ ok: false, error: 'EMPTY_ITEMS' });

      const paymentCode = helpers.strOrNull(req.body.payment_code);
      const methodCode = helpers.strOrNull(req.body.method_code);
      const timeOptionCode = helpers.strOrNull(req.body.time_option_code);

      // map code -> id
      const paymentId = await pickIdByCodeOrFirstActive({
        tenantId,
        storeId,
        table: 'order_payments',
        code: paymentCode,
      });

      const deliveryTypeId = await pickIdByCodeOrFirstActive({
        tenantId,
        storeId,
        table: 'order_delivery_types',
        code: methodCode,
      });

      const timeOptionId = await pickIdByCodeOrFirstActive({
        tenantId,
        storeId,
        table: 'order_time_options',
        code: timeOptionCode,
      });

      if (!paymentId) return res.status(500).json({ ok: false, error: 'NO_PAYMENTS' });
      if (!deliveryTypeId) return res.status(500).json({ ok: false, error: 'NO_METHODS' });
      if (!timeOptionId) return res.status(500).json({ ok: false, error: 'NO_TIME_OPTIONS' });

      // customer data:
      let customerId = authCustomer?.id || null;

      let customerName = helpers.strOrNull(req.body.customer_name);
      let customerPhone = helpers.normalizePhone(req.body.customer_phone);

      if (authCustomer) {
        customerPhone = authCustomer.phone; // С‚РµР»РµС„РѕРЅ РЅРµ РјРµРЅСЏРµРј
        if (!customerName) customerName = authCustomer.name || 'РљР»РёРµРЅС‚';
      } else {
        if (!customerPhone) return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
        if (!customerName) customerName = 'РљР»РёРµРЅС‚';
      }

      // ensure customer exists if not authed
      if (!customerId) {
        const [ex] = await db.query(
          `SELECT id FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 1`,
          [tenantId, customerPhone]
        );
        if (ex.length) {
          customerId = Number(ex[0].id);
          // РѕР±РЅРѕРІРёРј РёРјСЏ РµСЃР»Рё РїСЂРёС€Р»Рѕ
          if (customerName) {
            await db.query(
              `UPDATE cust_customers SET name=? WHERE tenant_id=? AND id=?`,
              [customerName, tenantId, customerId]
            );
          }
        } else {
          const [ins] = await db.query(
            `INSERT INTO cust_customers
             (tenant_id, name, phone, is_active, registration_date)
             VALUES (?,?,?,?, CURDATE())`,
            [tenantId, customerName, customerPhone, 1]
          );
          customerId = Number(ins.insertId);
        }
      }

      // product_ids С‚РѕР»СЊРєРѕ Сѓ РѕР±С‹С‡РЅС‹С… С‚РѕРІР°СЂРѕРІ; РєРѕРјР±Рѕ РїСЂРёС…РѕРґСЏС‚ СЃ type === 'combo'
      const ids = items
        .filter(it => it.type !== 'combo')
        .map(it => Number(it.product_id))
        .filter(n => Number.isFinite(n) && n > 0);
      const hasCombos = items.some(it => it.type === 'combo');
      if (!ids.length && !hasCombos) return res.status(400).json({ ok: false, error: 'BAD_ITEMS' });

      // availability check for products (stock + ingredients) вЂ” С‚РѕР»СЊРєРѕ РµСЃР»Рё РІ Р·Р°РєР°Р·Рµ РµСЃС‚СЊ РѕР±С‹С‡РЅС‹Рµ С‚РѕРІР°СЂС‹
      if (ids.length) {
        const [availability] = await db.query(
          `SELECT p.id,
              CASE
                WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                  SELECT 1
                  FROM prod_product_ingredients i
                  JOIN prod_product_stocks si
                    ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                  WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                    AND si.qty IS NOT NULL AND si.qty <= 0
                ) AND NOT EXISTS (
                  SELECT 1
                  FROM prod_option_assignments oa
                  JOIN prod_option_groups og
                    ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                  WHERE oa.tenant_id=p.tenant_id
                    AND oa.assign_type='product' AND oa.assign_id=p.id
                    AND oa.is_active=1
                    AND og.is_active=1
                    AND COALESCE(og.out_of_stock_action, 1)=0
                    AND NOT EXISTS (
                      SELECT 1
                      FROM prod_option_items oi
                      JOIN prod_products op
                        ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                      LEFT JOIN prod_product_stocks ops
                        ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                      WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                        AND oi.target_type='product'
                        AND oi.is_active=1
                        AND op.is_active=1
                        AND op.site_visibility=1
                        AND (ops.qty IS NULL OR ops.qty > 0)
                        AND NOT EXISTS (
                          SELECT 1
                          FROM prod_product_ingredients ip
                          JOIN prod_product_stocks ips
                            ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                          WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                            AND ips.qty IS NOT NULL AND ips.qty <= 0
                        )
                    )
                )
                THEN 1 ELSE 0
              END AS is_available
           FROM prod_products p
           LEFT JOIN prod_product_stocks s
             ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
           WHERE p.tenant_id=? AND p.id IN (${ids.map(() => '?').join(',')})`,
          [storeId, storeId, storeId, storeId, tenantId, ...ids]
        );

        const foundIds = new Set(availability.map(r => Number(r.id)));
        const notAvailable = availability.some(r => Number(r.is_available || 0) !== 1);
        const missing = ids.some((id) => !foundIds.has(Number(id)));
        if (notAvailable || missing) {
          return res.status(409).json({ ok: false, error: 'OUT_OF_STOCK' });
        }
      }

      let byId = new Map();
      if (ids.length) {
        const [products] = await db.query(
          `SELECT id, name, price, old_price, photos_json, unit_id, base_unit_id, base_qty, cost_price
           FROM prod_products
           WHERE tenant_id=? AND id IN (${ids.map(() => '?').join(',')})`,
          [tenantId, ...ids]
        );
        byId = new Map(products.map(p => [Number(p.id), p]));
      }

      const [autoAddRows] = await db.query(
        `SELECT i.*
         FROM prod_auto_add_items i
         JOIN prod_auto_add_groups g
           ON g.tenant_id=i.tenant_id AND g.id=i.group_id
         WHERE i.tenant_id=? AND i.is_active=1 AND g.is_active=1`,
        [tenantId]
      );
      const autoRulesByProduct = new Map(autoAddRows.map(r => [Number(r.product_id), r]));

      function calcAutoFreeQty(rule, baseTotal) {
        let freeQty = Math.max(0, Number(rule.free_first_qty || 0));
        const amountStep = Number(rule.free_per_amount || 0);
        const stepQty = Math.max(0, Number(rule.free_per_amount_qty || 0));
        if (amountStep > 0 && stepQty > 0 && baseTotal > 0) {
          freeQty += Math.floor(baseTotal / amountStep) * stepQty;
        }
        const maxFree = rule.max_free_qty != null ? Number(rule.max_free_qty) : null;
        if (maxFree != null && Number.isFinite(maxFree)) {
          freeQty = Math.min(freeQty, Math.max(0, maxFree));
        }
        return freeQty;
      }

      let nonAutoItemsTotal = 0;
      for (const it of items) {
        if (it.type === 'combo') {
          const lineTotalFromRequest = Number(it.line_total);
          if (Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0) {
            nonAutoItemsTotal += roundPrice(lineTotalFromRequest);
          }
          continue;
        }
        const pid = Number(it.product_id);
        const p = byId.get(pid);
        if (!p) continue;
        if (autoRulesByProduct.has(pid)) continue;
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const basePrice = Number(p.price || 0);
        const lineTotalFromRequest = Number(it.line_total);
        const useLineTotalFromRequest = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0;
        const lineTotalRaw = useLineTotalFromRequest ? lineTotalFromRequest : basePrice * qty;
        const lineTotal = roundPrice(lineTotalRaw);
        nonAutoItemsTotal += lineTotal;
      }

      // ============ Р РђРЎР§Р•Рў РЎРљРР”РћРљ ============
      // РџРѕР»СѓС‡Р°РµРј СЃРєРёРґРєРё РєР»РёРµРЅС‚Р° (РїСЂРёРІСЏР·Р°РЅРЅС‹Рµ РЅР°РїСЂСЏРјСѓСЋ РёР»Рё С‡РµСЂРµР· РєР°С‚РµРіРѕСЂРёРё)
      let orderDiscountAmount = 0;
      const appliedDiscounts = [];
      
      // РџРѕР»СѓС‡Р°РµРј РєР°С‚РµРіРѕСЂРёРё С‚РѕРІР°СЂРѕРІ РґР»СЏ РїСЂРѕРІРµСЂРєРё СЃРєРёРґРѕРє
      const productCategoriesMap = new Map();
      if (ids.length) {
        const catPlaceholders = ids.map(() => '?').join(',');
        const [catRows] = await db.query(
          `SELECT product_id, category_id FROM prod_product_categories
           WHERE tenant_id = ? AND product_id IN (${catPlaceholders})`,
          [tenantId, ...ids]
        );
        for (const cr of catRows) {
          const pid = Number(cr.product_id);
          if (!productCategoriesMap.has(pid)) productCategoriesMap.set(pid, []);
          productCategoriesMap.get(pid).push(Number(cr.category_id));
        }
      }

      // РџРѕР»СѓС‡Р°РµРј Р°РєС‚РёРІРЅС‹Рµ СЃРєРёРґРєРё РґР»СЏ РєР»РёРµРЅС‚Р° Рё С‚РѕРІР°СЂРѕРІ
      const customerDiscounts = await discountHelpers.getActiveDiscountsForCustomer(db, tenantId, storeId, customerId);
      
      // РњР°РїР° СЃРєРёРґРѕРє РґР»СЏ С‚РѕРІР°СЂРѕРІ (product_id -> discount)
      const productDiscountMap = new Map();
      
      // Р”Р»СЏ РєР°Р¶РґРѕРіРѕ С‚РѕРІР°СЂР° РїСЂРѕРІРµСЂСЏРµРј РїСЂРёРјРµРЅРёРјС‹Рµ СЃРєРёРґРєРё
      for (const pid of ids) {
        const categoryIds = productCategoriesMap.get(pid) || [];
        const productDiscounts = await discountHelpers.getActiveDiscountsForProduct(db, tenantId, storeId, pid, categoryIds);
        
        if (productDiscounts.length > 0) {
          // Р‘РµСЂРµРј Р»СѓС‡С€СѓСЋ СЃРєРёРґРєСѓ (СЃ РЅР°РёРІС‹СЃС€РёРј РїСЂРёРѕСЂРёС‚РµС‚РѕРј)
          const bestDiscount = productDiscounts[0];
          productDiscountMap.set(pid, bestDiscount);
        }
      }

      const normItems = [];
      let total = 0;

      // РЎРѕР±РёСЂР°РµРј РІСЃРµ option_item_ids РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ РёРЅС„РѕСЂРјР°С†РёРё РёР· Р‘Р”
      const allOptionItemIds = [];
      for (const it of items) {
        const optionIds = Array.isArray(it.option_item_ids) ? it.option_item_ids : [];
        optionIds.forEach(id => {
          const numId = Number(id);
          if (Number.isFinite(numId) && numId > 0 && !allOptionItemIds.includes(numId)) {
            allOptionItemIds.push(numId);
          }
        });
      }

      // РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ РѕР± РѕРїС†РёСЏС… РёР· Р‘Р”
      const optionItemsMap = new Map();
      if (allOptionItemIds.length) {
        const placeholders = allOptionItemIds.map(() => '?').join(',');
        const [optionRows] = await db.query(
          `SELECT 
            i.id,
            i.price_mode,
            i.price_value,
            p.id AS product_id,
            p.name AS product_name,
            p.price AS product_price,
            CASE
              WHEN p.id IS NULL THEN 0
              WHEN (ps.qty IS NULL OR ps.qty > 0) AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients pi
                JOIN prod_product_stocks psi
                  ON psi.tenant_id=pi.tenant_id AND psi.store_id=? AND psi.product_id=pi.ingredient_id
                WHERE pi.tenant_id=p.tenant_id AND pi.product_id=p.id
                  AND psi.qty IS NOT NULL AND psi.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1
                FROM prod_option_assignments oa
                JOIN prod_option_groups og
                  ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id
                  AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1
                  AND og.is_active=1
                  AND COALESCE(og.out_of_stock_action, 1)=0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM prod_option_items oi
                    JOIN prod_products op
                      ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops
                      ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product'
                      AND oi.is_active=1
                      AND op.is_active=1
                      AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1
                        FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips
                          ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                          AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
          FROM prod_option_items i
          LEFT JOIN prod_products p 
            ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
          LEFT JOIN prod_product_stocks ps
            ON ps.tenant_id = p.tenant_id AND ps.store_id = ? AND ps.product_id = p.id
          WHERE i.tenant_id=? AND i.id IN (${placeholders}) AND i.is_active=1`,
          [storeId, storeId, storeId, storeId, tenantId, ...allOptionItemIds]
        );

        if (optionRows.some((row) => Number(row.is_available || 0) !== 1)) {
          return res.status(409).json({ ok: false, error: 'OUT_OF_STOCK' });
        }

        optionRows.forEach((row) => {
          let optionPrice = 0;
          if (row.price_mode === 'fixed') {
            optionPrice = Number(row.price_value || 0);
          } else if (row.price_mode === 'from_target' || row.price_mode === 'delta') {
            optionPrice = Number(row.product_price || 0);
            if (row.price_mode === 'delta') {
              optionPrice += Number(row.price_value || 0);
            }
          }

          optionItemsMap.set(Number(row.id), {
            id: Number(row.id),
            title: row.product_name || '',
            price: optionPrice,
            target_product_id: row.product_id != null ? Number(row.product_id) : null,
          });
        });
        }

      for (const it of items) {
        if (it.type === 'combo') {
          const qty = Math.max(1, Number(it.qty || it.quantity || 1));
          const lineTotalFromRequest = Number(it.line_total);
          const lineTotal = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0
            ? roundPrice(lineTotalFromRequest)
            : roundPrice(0);
          total += lineTotal;
          const oldLineTotalFromRequest = Number(it.old_line_total) || 0;
          const selections = Array.isArray(it.selections) ? it.selections : [];
          const photos = [];
          selections.forEach((s) => {
            if (s.product_photo) photos.push(s.product_photo);
          });
          normItems.push({
            type: 'combo',
            combo_id: it.combo_id,
            name: it.combo_title || 'РљРѕРјР±Рѕ',
            qty,
            price: qty > 0 ? roundPrice(lineTotal / qty) : 0,
            old_price: oldLineTotalFromRequest > 0 && qty > 0 ? roundPrice(oldLineTotalFromRequest / qty) : 0,
            line_total: lineTotal,
            old_line_total: oldLineTotalFromRequest,
            photos,
            selections: selections.map((s) => ({
              product_id: s.product_id,
              product_name: s.product_name,
              product_photo: s.product_photo,
              variant_group_id: s.variant_group_id != null ? Number(s.variant_group_id) : undefined,
              variant_value_index: s.variant_value_index != null ? Number(s.variant_value_index) : undefined,
              unit_id: s.unit_id != null ? Number(s.unit_id) : undefined,
              variant_label: s.variant_label,
              variant_group_title: s.variant_group_title,
              variant_unit: s.variant_unit,
              ingredients_display: Array.isArray(s.ingredients_display)
                ? s.ingredients_display.map((ing) => ({
                    ingredient_id: ing.ingredient_id != null ? Number(ing.ingredient_id) : undefined,
                    product_id: ing.product_id != null ? Number(ing.product_id) : undefined,
                    quantity: ing.quantity != null ? Number(ing.quantity) : undefined,
                    qty: ing.qty != null ? Number(ing.qty) : undefined,
                    unit: ing.unit,
                    unit_id: ing.unit_id != null ? Number(ing.unit_id) : undefined,
                    name: ing.name,
                  }))
                : [],
            })),
            auto_add: 0,
          });
          continue;
        }

        const pid = Number(it.product_id);
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const p = byId.get(pid);
        if (!p) continue;

        const basePrice = Number(p.price || 0);
        const oldPrice = Number(p.old_price || 0);

        // Р’РђР–РќРћ: РёСЃРїРѕР»СЊР·СѓРµРј line_total РёР· Р·Р°РїСЂРѕСЃР° (СѓР¶Рµ РїРѕСЃС‡РёС‚Р°РЅ РЅР° С„СЂРѕРЅС‚Рµ)
        // РќРµ РїРµСЂРµСЃС‡РёС‚С‹РІР°РµРј С†РµРЅСѓ Р·Р°РЅРѕРІРѕ, С‡С‚РѕР±С‹ РёР·Р±РµР¶Р°С‚СЊ РґРІРѕР№РЅРѕРіРѕ РїРѕРґСЃС‡РµС‚Р° Р±Р°Р·РѕРІРѕР№ С†РµРЅС‹
        const lineTotalFromRequest = Number(it.line_total);
        const useLineTotalFromRequest = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0;

        // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј РѕРїС†РёРё (С‚РѕР»СЊРєРѕ РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ СЃРѕСЃС‚Р°РІР°, РЅРµ РґР»СЏ РїРµСЂРµСЃС‡РµС‚Р° С†РµРЅС‹)
        const options = [];
        
        // РЎРѕР±РёСЂР°РµРј РѕРїС†РёРё: РёСЃРїРѕР»СЊР·СѓРµРј option_items РёР· Р·Р°РїСЂРѕСЃР° (СЃ qty), РµСЃР»Рё РµСЃС‚СЊ, РёРЅР°С‡Рµ option_item_ids
        const optionItemsFromRequest = Array.isArray(it.option_items) && it.option_items.length > 0
          ? it.option_items
          : [];
        const optionIdsFromRequest = Array.isArray(it.option_item_ids) ? it.option_item_ids : [];
        
        // РЎРѕР·РґР°РµРј map РґР»СЏ Р±С‹СЃС‚СЂРѕРіРѕ РїРѕРёСЃРєР° qty Рё РІР°СЂРёР°РЅС‚РѕРІ РёР· Р·Р°РїСЂРѕСЃР°
        const qtyMap = new Map();
        const optionVariantsMap = new Map(); // Р’Р°СЂРёР°РЅС‚С‹ РґР»СЏ РєР°Р¶РґРѕР№ РѕРїС†РёРё
        optionItemsFromRequest.forEach(opt => {
          const id = Number(opt.id);
          if (Number.isFinite(id) && id > 0) {
            qtyMap.set(id, Math.max(1, Number(opt.qty || opt.quantity || 1)));
            // РЎРѕС…СЂР°РЅСЏРµРј РґР°РЅРЅС‹Рµ Рѕ РІР°СЂРёР°РЅС‚Рµ РѕРїС†РёРё, РµСЃР»Рё РµСЃС‚СЊ
            if (opt.variant_group_id != null && opt.variant_value_index != null) {
              optionVariantsMap.set(id, {
                variant_group_id: Number(opt.variant_group_id),
                variant_value_index: Number(opt.variant_value_index),
                variant_label: str(opt.variant_label || ""),
                variant_price_diff: Number(opt.variant_price_diff || 0),
              });
            }
          }
        });

        // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј РѕРїС†РёРё: РёСЃРїРѕР»СЊР·СѓРµРј option_item_ids РєР°Рє РѕСЃРЅРѕРІРЅРѕР№ СЃРїРёСЃРѕРє
        const allOptionIds = new Set();
        optionItemsFromRequest.forEach(opt => {
          const id = Number(opt.id);
          if (Number.isFinite(id) && id > 0) allOptionIds.add(id);
        });
        optionIdsFromRequest.forEach(id => {
          const numId = Number(id);
          if (Number.isFinite(numId) && numId > 0) allOptionIds.add(numId);
        });

        for (const optId of allOptionIds) {
          const optInfo = optionItemsMap.get(optId);
          if (!optInfo) continue; // РџСЂРѕРїСѓСЃРєР°РµРј РѕРїС†РёРё, РєРѕС‚РѕСЂС‹С… РЅРµС‚ РІ Р‘Р”

          const optQty = qtyMap.get(optId) || 1; // РљРѕР»РёС‡РµСЃС‚РІРѕ РёР· Р·Р°РїСЂРѕСЃР° РёР»Рё 1 РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ
          const optPrice = optInfo.price; // Р¦РµРЅР° РІСЃРµРіРґР° РёР· Р‘Р”
          // РќР• РґРѕР±Р°РІР»СЏРµРј Рє optionsTotal - С†РµРЅР° СѓР¶Рµ СѓС‡С‚РµРЅР° РІ line_total

          const optionEntry = {
            id: optId,
            title: optInfo.title,
            price: optPrice,
            qty: optQty,
            target_product_id: optInfo.target_product_id || undefined,
          };
          
          // Р”РѕР±Р°РІР»СЏРµРј РґР°РЅРЅС‹Рµ Рѕ РІР°СЂРёР°РЅС‚Рµ РѕРїС†РёРё, РµСЃР»Рё РµСЃС‚СЊ
          const optVariant = optionVariantsMap.get(optId);
          if (optVariant) {
            optionEntry.variant_group_id = optVariant.variant_group_id;
            optionEntry.variant_value_index = optVariant.variant_value_index;
            optionEntry.variant_label = optVariant.variant_label;
            optionEntry.variant_price_diff = optVariant.variant_price_diff;
          }

          options.push(optionEntry);
        }

        // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј РёРЅРіСЂРµРґРёРµРЅС‚С‹ (С‚РѕР»СЊРєРѕ РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ СЃРѕСЃС‚Р°РІР°, РЅРµ РґР»СЏ РїРµСЂРµСЃС‡РµС‚Р° С†РµРЅС‹)
        const ingredients = [];
        
        const cartIngredients = Array.isArray(it.ingredients) ? it.ingredients : [];
        if (cartIngredients.length) {
          // РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ РѕР± РёРЅРіСЂРµРґРёРµРЅС‚Р°С… РёР· Р‘Р”
          const ingIds = cartIngredients.map(ci => Number(ci.ingredient_id)).filter(n => Number.isFinite(n) && n > 0);
          if (ingIds.length) {
            const [ingRows] = await db.query(
              `SELECT
                i.id,
                i.ingredient_id,
                i.unit_id,
                i.price_override,
                p.price AS ingredient_price,
                p.name AS ingredient_name,
                p.base_unit_id AS ingredient_base_unit_id,
                p.base_qty AS ingredient_base_qty,
                u.short_title AS unit_short_title,
                u.title AS unit_title,
                u.code AS unit_code
              FROM prod_product_ingredients i
              JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
              LEFT JOIN prod_units u ON u.id=i.unit_id AND u.tenant_id=i.tenant_id
              WHERE i.tenant_id=? AND i.product_id=? AND i.ingredient_id IN (${ingIds.map(() => '?').join(',')})`,
              [tenantId, pid, ...ingIds]
            );

            const ingMap = new Map(ingRows.map(r => [Number(r.ingredient_id), r]));
            
            // Р¤СѓРЅРєС†РёСЏ РґР»СЏ РїРѕР»СѓС‡РµРЅРёСЏ С„Р°РєС‚РѕСЂР° РєРѕРЅРІРµСЂС‚Р°С†РёРё РјРµР¶РґСѓ РµРґРёРЅРёС†Р°РјРё
            async function getConversionFactor(fromUnitId, toUnitId, productIdForPul = null) {
              if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
              
              // РџСЂСЏРјР°СЏ РєРѕРЅРІРµСЂС‚Р°С†РёСЏ РёР· prod_unit_conversions
              const [direct] = await db.query(
                `SELECT factor FROM prod_unit_conversions 
                 WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
                [tenantId, fromUnitId, toUnitId]
              );
              if (direct.length && direct[0].factor) return Number(direct[0].factor);
              
              // РћР±СЂР°С‚РЅР°СЏ РєРѕРЅРІРµСЂС‚Р°С†РёСЏ
              const [inverse] = await db.query(
                `SELECT factor FROM prod_unit_conversions 
                 WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
                [tenantId, toUnitId, fromUnitId]
              );
              if (inverse.length && inverse[0].factor) return 1 / Number(inverse[0].factor);
              
              // РљРѕРЅРІРµСЂС‚Р°С†РёСЏ С‡РµСЂРµР· prod_product_unit_links (РµСЃР»Рё СѓРєР°Р·Р°РЅ product_id)
              if (productIdForPul) {
                const [pul] = await db.query(
                  `SELECT factor FROM prod_product_unit_links
                   WHERE tenant_id=? AND product_id=? AND base_unit_id=? AND unit_id=? LIMIT 1`,
                  [tenantId, productIdForPul, toUnitId, fromUnitId]
                );
                if (pul.length && pul[0].factor) return Number(pul[0].factor);
              }
              
              return null;
            }
            
            for (const cartIng of cartIngredients) {
              const ingId = Number(cartIng.ingredient_id);
              const ingQty = Number(cartIng.quantity ?? 1);
              const ingInfo = ingMap.get(ingId);
              if (!ingInfo) continue;

              // РџРµСЂРµРІРѕРґРёРј quantity РІ Р±Р°Р·РѕРІСѓСЋ РµРґРёРЅРёС†Сѓ РёР·РјРµСЂРµРЅРёСЏ
              let qtyInBase = ingQty;
              const ingredientBaseQty = ingInfo.ingredient_base_qty != null && Number(ingInfo.ingredient_base_qty) > 0 
                ? Number(ingInfo.ingredient_base_qty) 
                : 1;
              const ingredientUnitId = Number(ingInfo.unit_id || 0);
              const ingredientBaseUnitId = Number(ingInfo.ingredient_base_unit_id || 0);
              
              // Р•СЃР»Рё РµРґРёРЅРёС†Р° РёР·РјРµСЂРµРЅРёСЏ РёРЅРіСЂРµРґРёРµРЅС‚Р° РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РѕС‚ Р±Р°Р·РѕРІРѕР№, РєРѕРЅРІРµСЂС‚РёСЂСѓРµРј
              if (ingredientUnitId && ingredientBaseUnitId && ingredientUnitId !== ingredientBaseUnitId) {
                const factor = await getConversionFactor(ingredientUnitId, ingredientBaseUnitId, ingId);
                if (factor != null && factor > 0) {
                  qtyInBase = ingQty * factor;
                }
              }

              // Р Р°СЃСЃС‡РёС‚С‹РІР°РµРј С†РµРЅСѓ СЃ СѓС‡РµС‚РѕРј base_qty
              let ingPricePerUnit = 0;
              
              if (ingInfo.price_override != null) {
                // Р•СЃР»Рё РµСЃС‚СЊ price_override - РёСЃРїРѕР»СЊР·СѓРµРј РµРіРѕ РєР°Рє С†РµРЅСѓ Р·Р° РµРґРёРЅРёС†Сѓ РІ Р±Р°Р·РѕРІРѕР№ РµРґРёРЅРёС†Рµ РёР·РјРµСЂРµРЅРёСЏ
                ingPricePerUnit = Number(ingInfo.price_override);
              } else {
                // Р Р°СЃСЃС‡РёС‚С‹РІР°РµРј С†РµРЅСѓ Р·Р° РµРґРёРЅРёС†Сѓ РёР· base_qty
                const ingredientPrice = Number(ingInfo.ingredient_price || 0);
                
                if (ingredientBaseQty > 0 && ingredientPrice > 0) {
                  // Р¦РµРЅР° Р·Р° РµРґРёРЅРёС†Сѓ (РІ Р±Р°Р·РѕРІРѕР№ РµРґРёРЅРёС†Рµ) = С†РµРЅР° С‚РѕРІР°СЂР° / base_qty
                  ingPricePerUnit = ingredientPrice / ingredientBaseQty;
                } else if (ingredientPrice > 0) {
                  ingPricePerUnit = ingredientPrice;
                }
              }
              
              // РС‚РѕРіРѕРІР°СЏ С†РµРЅР° РёРЅРіСЂРµРґРёРµРЅС‚Р° = С†РµРЅР° Р·Р° РµРґРёРЅРёС†Сѓ * РєРѕР»РёС‡РµСЃС‚РІРѕ (РІ Р±Р°Р·РѕРІРѕР№ РµРґРёРЅРёС†Рµ)
              // РќР• РґРѕР±Р°РІР»СЏРµРј Рє ingredientsTotal - С†РµРЅР° СѓР¶Рµ СѓС‡С‚РµРЅР° РІ line_total
              const ingTotal = ingPricePerUnit * qtyInBase;

              // Р”Р»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ: price РґРѕР»Р¶РЅР° Р±С‹С‚СЊ С†РµРЅРѕР№ Р·Р° РµРґРёРЅРёС†Сѓ РІ С‚РѕР№ РµРґРёРЅРёС†Рµ РёР·РјРµСЂРµРЅРёСЏ, РІ РєРѕС‚РѕСЂРѕР№ СѓРєР°Р·Р°РЅРѕ quantity
              // ingPricePerUnit - СЌС‚Рѕ С†РµРЅР° Р·Р° РµРґРёРЅРёС†Сѓ РІ Р±Р°Р·РѕРІРѕР№ РµРґРёРЅРёС†Рµ (base_unit_id)
              // quantity (ingQty) СѓРєР°Р·Р°РЅРѕ РІ unit_id
              // РќСѓР¶РЅРѕ РїРµСЂРµСЃС‡РёС‚Р°С‚СЊ С†РµРЅСѓ Р·Р° РµРґРёРЅРёС†Сѓ РґР»СЏ unit_id
              let priceForDisplay = ingPricePerUnit;
              
              // Р•СЃР»Рё quantity РІ С‚РѕР№ Р¶Рµ РµРґРёРЅРёС†Рµ, С‡С‚Рѕ Рё Р±Р°Р·РѕРІР°СЏ, price СѓР¶Рµ РїСЂР°РІРёР»СЊРЅС‹Р№
              if (ingredientUnitId && ingredientBaseUnitId && ingredientUnitId !== ingredientBaseUnitId && ingQty > 0) {
                // Р•СЃР»Рё РµРґРёРЅРёС†С‹ СЂР°Р·РЅС‹Рµ, РїРµСЂРµСЃС‡РёС‚С‹РІР°РµРј С†РµРЅСѓ Р·Р° РµРґРёРЅРёС†Сѓ РІ unit_id
                const factor = await getConversionFactor(ingredientUnitId, ingredientBaseUnitId, ingId);
                if (factor != null && factor > 0) {
                  // priceForDisplay = С†РµРЅР° Р·Р° РµРґРёРЅРёС†Сѓ РІ unit_id
                  // Р•СЃР»Рё quantity РІ unit_id, Р° С†РµРЅР° Р·Р° РµРґРёРЅРёС†Сѓ РІ base_unit_id = ingPricePerUnit,
                  // С‚Рѕ С†РµРЅР° Р·Р° unit_id = ingPricePerUnit * factor
                  // (РїРѕС‚РѕРјСѓ С‡С‚Рѕ 1 unit_id = factor * base_unit_id)
                  priceForDisplay = ingPricePerUnit * factor;
                }
              }

              // РђР»СЊС‚РµСЂРЅР°С‚РёРІРЅС‹Р№ СЂР°СЃС‡РµС‚: РµСЃР»Рё total СѓР¶Рµ РїРѕСЃС‡РёС‚Р°РЅ, РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РµРіРѕ
              // priceForDisplay = ingTotal / ingQty (РµСЃР»Рё ingQty > 0)
              if (ingQty > 0 && ingTotal > 0) {
                priceForDisplay = ingTotal / ingQty;
              }

              ingredients.push({
                ingredient_id: ingId,
                name: ingInfo.ingredient_name || '',
                quantity: ingQty,
                unit_id: ingredientUnitId || undefined,
                price: priceForDisplay,
                total: ingTotal,
                unit_label: ingInfo.unit_short_title || ingInfo.unit_title || ingInfo.unit_code || '',
              });
            }
          }
        }

        // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј РІР°СЂРёР°РЅС‚С‹ (С‚РѕР»СЊРєРѕ РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ СЃРѕСЃС‚Р°РІР°, РЅРµ РґР»СЏ РїРµСЂРµСЃС‡РµС‚Р° С†РµРЅС‹)
        let variantData = null;
        const variantGroupId = Number(it.variant_group_id);
        const variantValueIndex = Number(it.variant_value_index);
        const variantLabel = str(it.variant_label || "");
        
        if (variantGroupId && Number.isFinite(variantValueIndex)) {
          // РџРѕР»СѓС‡Р°РµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РіСЂСѓРїРїРµ РІР°СЂРёР°РЅС‚РѕРІ РёР· Р‘Р”
          const [variantGroupRows] = await db.query(
            `SELECT id, title, unit_id
             FROM prod_variant_groups
             WHERE tenant_id=? AND id=? AND is_active=1
             LIMIT 1`,
            [tenantId, variantGroupId]
          );
          
          if (variantGroupRows.length) {
            const vg = variantGroupRows[0];
            const groupTitle = str(vg.title || "");
            
            // РџРѕР»СѓС‡Р°РµРј Р·РЅР°С‡РµРЅРёРµ РІР°СЂРёР°РЅС‚Р°
            const [variantValuesRows] = await db.query(
              `SELECT \`values\`
               FROM prod_variant_groups
               WHERE tenant_id=? AND id=?
               LIMIT 1`,
              [tenantId, variantGroupId]
            );
            
            let variantValue = variantLabel;
            if (variantValuesRows.length && variantValuesRows[0].values) {
              try {
                const values = JSON.parse(variantValuesRows[0].values);
                if (Array.isArray(values) && values[variantValueIndex] != null) {
                  variantValue = String(values[variantValueIndex]);
                }
              } catch {}
            }
            
            // Р•СЃР»Рё variant_label СЃРѕРґРµСЂР¶РёС‚ "РќР°Р·РІР°РЅРёРµ: Р·РЅР°С‡РµРЅРёРµ", РёР·РІР»РµРєР°РµРј Р·РЅР°С‡РµРЅРёРµ
            if (variantLabel.includes(":")) {
              const parts = variantLabel.split(":");
              if (parts.length > 1) {
                variantValue = parts.slice(1).join(":").trim();
              }
            }
            
            // Р’Р°СЂРёР°РЅС‚С‹ РЅРµ РґРѕР±Р°РІР»СЏСЋС‚ РґРѕРїР»Р°С‚Сѓ - РѕРЅРё РїРµСЂРµСЃС‡РёС‚С‹РІР°СЋС‚ С†РµРЅСѓ РїСЂРѕРїРѕСЂС†РёРѕРЅР°Р»СЊРЅРѕ РєРѕР»РёС‡РµСЃС‚РІСѓ
            // variant_unit_price СѓР¶Рµ СѓС‡С‚РµРЅР° РІ line_total, РїРѕСЌС‚РѕРјСѓ price_diff РІСЃРµРіРґР° 0
            variantData = {
              variant_group_id: variantGroupId,
              variant_value_index: variantValueIndex,
              group_title: groupTitle,
              unit_id: Number(vg.unit_id || 0) || undefined,
              value: variantValue,
              label: variantValue, // Р”Р»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ
              price_diff: 0, // Р’Р°СЂРёР°РЅС‚С‹ РЅРµ РёРјРµСЋС‚ РґРѕРїР»Р°С‚С‹, С†РµРЅР° СѓР¶Рµ СѓС‡С‚РµРЅР° РІ variant_unit_price
            };
          }
        }

        // РСЃРїРѕР»СЊР·СѓРµРј line_total РёР· Р·Р°РїСЂРѕСЃР° (СѓР¶Рµ РїРѕСЃС‡РёС‚Р°РЅ РЅР° С„СЂРѕРЅС‚Рµ)
        // Р•СЃР»Рё line_total РЅРµ РїРµСЂРµРґР°РЅ, РёСЃРїРѕР»СЊР·СѓРµРј Р±Р°Р·РѕРІСѓСЋ С†РµРЅСѓ С‚РѕРІР°СЂР° (РґР»СЏ С‚РѕРІР°СЂРѕРІ Р±РµР· РѕРїС†РёР№/РІР°СЂРёР°РЅС‚РѕРІ/СЃРѕСЃС‚Р°РІР°)
        const autoRule = autoRulesByProduct.get(pid);
        let unitPrice = basePrice;
        let paidQty = qty;
        let lineTotal = useLineTotalFromRequest ? lineTotalFromRequest : basePrice * qty;
        if (autoRule) {
          unitPrice = autoRule.price_override != null ? Number(autoRule.price_override) : basePrice;
          const freeQty = calcAutoFreeQty(autoRule, nonAutoItemsTotal);
          paidQty = Math.max(0, qty - freeQty);
          lineTotal = paidQty * unitPrice;
        }

        unitPrice = roundPrice(unitPrice);
        if (autoRule) {
          lineTotal = roundPrice(unitPrice * paidQty);
        } else {
          lineTotal = roundPrice(useLineTotalFromRequest ? lineTotalFromRequest : unitPrice * paidQty);
        }

        // Р Р°СЃС‡РµС‚ СЃРєРёРґРєРё РґР»СЏ С‚РѕРІР°СЂР°
        // РќР• РїСЂРёРјРµРЅСЏРµРј СЃРєРёРґРєСѓ РµСЃР»Рё:
        // - line_total СѓР¶Рµ РїРµСЂРµРґР°РЅ СЃ С„СЂРѕРЅС‚Р° (СЃРєРёРґРєР° СѓР¶Рµ СѓС‡С‚РµРЅР° РІ С†РµРЅРµ)
        // - СЌС‚Рѕ auto-add С‚РѕРІР°СЂ
        let itemDiscountAmount = 0;
        let itemAppliedDiscount = null;
        const productDiscount = productDiscountMap.get(pid);
        if (productDiscount && !autoRule && !useLineTotalFromRequest) {
          itemDiscountAmount = discountHelpers.calculateDiscount(
            lineTotal,
            productDiscount.discount_type,
            Number(productDiscount.discount_value),
            productDiscount.max_discount_amount ? Number(productDiscount.max_discount_amount) : null
          );
          if (itemDiscountAmount > 0) {
            itemAppliedDiscount = {
              discount_id: productDiscount.id,
              title: productDiscount.title,
              discount_type: productDiscount.discount_type,
              discount_value: Number(productDiscount.discount_value),
              discount_amount: itemDiscountAmount,
              apply_to: 'product',
              product_id: pid,
            };
            orderDiscountAmount += itemDiscountAmount;
            appliedDiscounts.push(itemAppliedDiscount);
          }
        } else if (productDiscount && !autoRule && useLineTotalFromRequest) {
          // Р•СЃР»Рё line_total РїРµСЂРµРґР°РЅ СЃ С„СЂРѕРЅС‚Р°, РЅРѕ РµСЃС‚СЊ СЃРєРёРґРєР° вЂ” СЃРѕС…СЂР°РЅСЏРµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ СЃРєРёРґРєРµ
          // Р±РµР· РїРѕРІС‚РѕСЂРЅРѕРіРѕ СЂР°СЃС‡С‘С‚Р° (СЃРєРёРґРєР° СѓР¶Рµ СѓС‡С‚РµРЅР° РІ line_total)
          const estimatedDiscount = discountHelpers.calculateDiscount(
            unitPrice * paidQty, // Р¦РµРЅР° Р±РµР· СЃРєРёРґРєРё
            productDiscount.discount_type,
            Number(productDiscount.discount_value),
            productDiscount.max_discount_amount ? Number(productDiscount.max_discount_amount) : null
          );
          if (estimatedDiscount > 0) {
            itemDiscountAmount = estimatedDiscount;
            orderDiscountAmount += estimatedDiscount;
            itemAppliedDiscount = {
              discount_id: productDiscount.id,
              title: productDiscount.title,
              discount_type: productDiscount.discount_type,
              discount_value: Number(productDiscount.discount_value),
              discount_amount: estimatedDiscount,
              apply_to: 'product',
              product_id: pid,
            };
            appliedDiscounts.push(itemAppliedDiscount);
          }
        }
        
        // Р•СЃР»Рё line_total РїРµСЂРµРґР°РЅ СЃ С„СЂРѕРЅС‚Р° - РёСЃРїРѕР»СЊР·СѓРµРј РµРіРѕ РєР°Рє РµСЃС‚СЊ (СЃРєРёРґРєР° СѓР¶Рµ РїСЂРёРјРµРЅРµРЅР°)
        // РРЅР°С‡Рµ - РІС‹С‡РёС‚Р°РµРј СЃРєРёРґРєСѓ
        const lineTotalAfterDiscount = useLineTotalFromRequest ? lineTotal : roundPrice(lineTotal - itemDiscountAmount);
        total += lineTotalAfterDiscount;

        // РџРѕР»СѓС‡Р°РµРј С„РѕС‚Рѕ С‚РѕРІР°СЂР° РґР»СЏ СЃРѕС…СЂР°РЅРµРЅРёСЏ РІ Р·Р°РєР°Р·Рµ
        let photos = [];
        try {
          if (p.photos_json) {
            const parsed = JSON.parse(p.photos_json);
            if (Array.isArray(parsed)) photos = parsed;
          }
        } catch {}

        const itemEntry = {
          product_id: pid,
          name: p.name,
          qty,
          price: unitPrice,
          old_price: oldPrice,
          line_total: lineTotalAfterDiscount,
          photos, // РЎРѕС…СЂР°РЅСЏРµРј С„РѕС‚Рѕ РґР»СЏ РѕС‚С‡РµС‚РѕРІ
          options: options.length > 0 ? options : undefined, // РЎРѕС…СЂР°РЅСЏРµРј РѕРїС†РёРё С‚РѕР»СЊРєРѕ РµСЃР»Рё РѕРЅРё РµСЃС‚СЊ
          ingredients: ingredients.length > 0 ? ingredients : undefined, // РЎРѕС…СЂР°РЅСЏРµРј РёРЅРіСЂРµРґРёРµРЅС‚С‹ С‚РѕР»СЊРєРѕ РµСЃР»Рё РѕРЅРё РµСЃС‚СЊ
          variants: variantData ? [variantData] : undefined, // РЎРѕС…СЂР°РЅСЏРµРј РІР°СЂРёР°РЅС‚С‹ С‚РѕР»СЊРєРѕ РµСЃР»Рё РѕРЅРё РµСЃС‚СЊ
          auto_add: Number(it.auto_add || 0) === 1 ? 1 : 0, // Р”Р»СЏ СЃРѕСЂС‚РёСЂРѕРІРєРё: Р°РІС‚РѕРґРѕР±Р°РІР»РµРЅРёСЏ (РїСЂРёР±РѕСЂС‹) РІ РєРѕРЅРµС† СЃРїРёСЃРєР°
        };
        
        // Р”РѕР±Р°РІР»СЏРµРј РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ СЃРєРёРґРєРµ РµСЃР»Рё РµСЃС‚СЊ
        if (itemAppliedDiscount) {
          // original_line_total - С†РµРЅР° РґРѕ СЃРєРёРґРєРё
          // РСЃРїРѕР»СЊР·СѓРµРј РїРµСЂРµРґР°РЅРЅС‹Р№ original_line_total, РµСЃР»Рё РµСЃС‚СЊ (СЃ СѓС‡С‘С‚РѕРј РІР°СЂРёР°РЅС‚Р°)
          const originalLineTotalFromRequest = Number(it.original_line_total) || 0;
          const originalLineTotal = originalLineTotalFromRequest > 0
            ? roundPrice(originalLineTotalFromRequest)
            : (useLineTotalFromRequest 
                ? roundPrice(lineTotal + itemDiscountAmount) 
                : lineTotal);
          itemEntry.discount = {
            id: itemAppliedDiscount.discount_id,
            title: itemAppliedDiscount.title,
            amount: itemAppliedDiscount.discount_amount,
            original_line_total: originalLineTotal,
          };
        }
        
        normItems.push(itemEntry);
      }

      if (!normItems.length) return res.status(400).json({ ok: false, error: 'NO_PRODUCTS' });

      // РџСЂРёРјРµРЅСЏРµРј СЃРєРёРґРєРё РєР»РёРµРЅС‚Р° РЅР° РІРµСЃСЊ Р·Р°РєР°Р· (РµСЃР»Рё РµСЃС‚СЊ)
      const orderDiscountsForCustomer = await discountHelpers.getOrderDiscounts(db, tenantId, storeId, customerId, total);
      if (orderDiscountsForCustomer.length > 0) {
        // РџСЂРёРјРµРЅСЏРµРј СЃРєРёРґРєРё СЃ СѓС‡РµС‚РѕРј is_stackable
        const { totalDiscount, appliedDiscounts: orderApplied } = discountHelpers.applyBestDiscounts(orderDiscountsForCustomer, total);
        if (totalDiscount > 0) {
          orderDiscountAmount += totalDiscount;
          total = roundPrice(total - totalDiscount);
          for (const od of orderApplied) {
            appliedDiscounts.push({
              discount_id: od.id,
              title: od.title,
              discount_type: od.discount_type,
              discount_value: Number(od.discount_value),
              discount_amount: od.discountAmount,
              apply_to: 'order',
            });
          }
        }
      }

      const discountsJson = appliedDiscounts.length > 0 ? JSON.stringify(appliedDiscounts) : null;

      const itemsJson = JSON.stringify(normItems);
      let deliveryCost = 0;
      const isDeliveryMethod = str(methodCode).trim() === 'delivery';
      if (isDeliveryMethod) {
        let minOrderAmount = 0;
        let freeDeliveryFrom = null;

        const [settings] = await db.query(
          `SELECT ds.delivery_cost, ds.min_order_amount, ds.free_delivery_from, ds.default_store_id
           FROM ten_delivery_settings ds
           JOIN ten_delivery_settings_stores dss ON dss.delivery_setting_id = ds.id AND dss.tenant_id = ds.tenant_id
           WHERE ds.tenant_id=? AND dss.store_id=? AND ds.is_active=1
           LIMIT 1`,
          [tenantId, storeId]
        );

        if (settings.length) {
          const s = settings[0];
          deliveryCost = Number(s.delivery_cost || 0);
          minOrderAmount = Number(s.min_order_amount || 0);
          freeDeliveryFrom = s.free_delivery_from != null ? Number(s.free_delivery_from) : null;
          if (s.default_store_id != null && Number.isFinite(Number(s.default_store_id))) {
            orderStoreId = Number(s.default_store_id);
          }
        }

        if (minOrderAmount > 0 && total < minOrderAmount) {
          return res.status(409).json({ ok: false, error: 'MIN_ORDER', min_order_amount: minOrderAmount });
        }

        if (freeDeliveryFrom != null && total >= freeDeliveryFrom) {
          deliveryCost = 0;
        }

        total += deliveryCost;
      }

      // Timezone С„РёР»РёР°Р»Р°, Рє РєРѕС‚РѕСЂРѕРјСѓ РїСЂРёРІСЏР·Р°РЅ Р·Р°РєР°Р· (orderStoreId)
      const storeTimezone = await getStoreTimezone(tenantId, orderStoreId);

      // РђРґСЂРµСЃ Рё С‚РѕС‡РєР° СЃР°РјРѕРІС‹РІРѕР·Р° РЅСѓР¶РЅС‹ РґР»СЏ РїСЂРѕРІРµСЂРєРё РґСѓР±Р»СЏ (С‡РёС‚Р°РµРј РґРѕ РЅРµС‘)
      const deliveryAddress = helpers.strOrNull(req.body.delivery_address);
      const pickupStoreId = Number.isFinite(Number(req.body.pickup_store_id)) ? Number(req.body.pickup_store_id) : null;
      const addrForDup = (deliveryAddress && String(deliveryAddress).trim()) ? String(deliveryAddress).trim() : '';
      const pickupIdForDup = (pickupStoreId && Number.isFinite(pickupStoreId)) ? pickupStoreId : 0;

      // РЎРµСЂРІРµСЂРЅР°СЏ Р·Р°С‰РёС‚Р° РѕС‚ РґСѓР±Р»РµР№ (РґРІРѕР№РЅР°СЏ РѕС‚РїСЂР°РІРєР° / РїРѕРІС‚РѕСЂ Р·Р°РїСЂРѕСЃР°). РћРєРЅРѕ 60 СЃРµРє.
      // created_at РІ Р‘Р” С…СЂР°РЅРёС‚СЃСЏ РІ UTC вЂ” СЃСЂР°РІРЅРёРІР°РµРј С‚РѕР¶Рµ РІ UTC.
      const forceNew = req.body.force_new === true || req.body.force_new === 'true';
      if (!forceNew) {
        const dupThresholdStr = helpers.formatUtcDateTime(Date.now() - 60000);
        const [recentDup] = await db.query(
          `SELECT id, public_id, total_price
           FROM order_orders
           WHERE tenant_id=? AND store_id=? AND is_active=1
             AND customer_phone=?
             AND total_price=?
             AND items=?
             AND COALESCE(address, '') = ?
             AND COALESCE(pickup_store_id, 0) = ?
             AND created_at >= ?
           ORDER BY id DESC
           LIMIT 1`,
          [tenantId, orderStoreId, customerPhone, total, itemsJson, addrForDup, pickupIdForDup, dupThresholdStr]
        );
        if (recentDup.length) {
          const dup = recentDup[0];
          return res.json({
            ok: true,
            data: {
              id: dup.id,
              public_id: dup.public_id,
              duplicate: true,
              needConfirmation: true,
              existingOrder: { id: dup.id, public_id: dup.public_id, total_price: dup.total_price }
            }
          });
        }
      }

      const statusId = await getActiveStatusIdDefault(tenantId, orderStoreId);
      if (!statusId) return res.status(500).json({ ok: false, error: 'NO_STATUSES' });

      const addrLine = (str(methodCode).trim() === 'delivery') ? deliveryAddress : null;
      const deliveryAddressId = (str(methodCode).trim() === 'delivery' && Number.isFinite(Number(req.body.delivery_address_id)) && Number(req.body.delivery_address_id) > 0)
        ? Number(req.body.delivery_address_id)
        : null;

      const comment = helpers.strOrNull(req.body.comment);
      const addressComment = helpers.strOrNull(req.body.address_comment);
      const promoCode = helpers.strOrNull(req.body.promo_code);

      const cutleryQty = Math.max(0, Number(req.body.cutlery_qty || 0));
      const changeFrom = Number.isFinite(Number(req.body.change_from)) ? Number(req.body.change_from) : null;

      const scheduledAt = helpers.strOrNull(req.body.scheduled_at) || null;

      const publicId = makeUuid36();

      // created_at РІ Р‘Р” СЃРѕС…СЂР°РЅСЏРµРј С‚РѕР»СЊРєРѕ РІ UTC.
      const createdAt = helpers.formatUtcDateTime(Date.now());
      let stockDeductedAt = null;
      let stockDocumentId = null;
      let stockChangedProductIds = [];

      let orderId = null;
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        if (stockDeductMode === 'on_create') {
          const deductionResult = await applyStockDeductionForOrderItems({
            db: conn,
            tenantId,
            storeId: orderStoreId,
            items: normItems,
            publicId,
            createdBy: null,
          });
          stockDeductedAt = deductionResult?.stockDeductedAt || null;
          stockDocumentId = deductionResult?.stockDocumentId || null;
          stockChangedProductIds = Array.from(
            new Set(
              (Array.isArray(deductionResult?.deductions) ? deductionResult.deductions : [])
                .map((d) => Number(d?.productId))
                .filter((id) => Number.isFinite(id) && id > 0)
            )
          );
        } else {
          const stockCheck = await checkStockAvailabilityForOrderItems({
            db: conn,
            tenantId,
            storeId: orderStoreId,
            items: normItems,
          });
          if (!stockCheck.available) {
            const stockErr = new Error('OUT_OF_STOCK');
            stockErr.code = 'OUT_OF_STOCK';
            stockErr.shortages = stockCheck.shortages || [];
            throw stockErr;
          }
        }

        // Р’РђР–РќРћ: РЅРёРєР°РєРёС… updated_at С‚СѓС‚ РЅРµС‚ (РІ С‚РІРѕРµР№ С‚Р°Р±Р»РёС†Рµ order_orders РµРіРѕ РЅРµС‚)
        const [r] = await conn.query(
          `INSERT INTO order_orders
           (tenant_id, store_id, customer_id, customer_name, customer_phone, promo_code,
            address, delivery_address_id, pickup_store_id, comment, address_comment, cutlery_qty, change_from,
            items, total_price, delivery_cost, discount_amount, discounts_json,
            delivery_type_id, payment_id, time_option_id,
            status_id, status_sort, scheduled_at, created_at, stock_deducted_at, stock_document_id,
            created_via, is_active, public_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'web', 1, ?)`,
          [
            tenantId,
            orderStoreId,
            customerId,
            customerName,
            customerPhone,
            promoCode,
            addrLine,
            deliveryAddressId,
            pickupStoreId,
            comment,
            addressComment,
            cutleryQty,
            changeFrom,
            itemsJson,
            total,
            deliveryCost,
            orderDiscountAmount,
            discountsJson,
            deliveryTypeId,
            paymentId,
            timeOptionId,
            statusId,
            0, // status_sort
            scheduledAt,
            createdAt,
            stockDeductedAt,
            stockDocumentId,
            publicId,
          ]
        );

        orderId = Number(r.insertId || 0);

        if (stockDocumentId) {
          await conn.query(
            `UPDATE prod_stock_documents
             SET number=?, comment=?
             WHERE tenant_id=? AND store_id=? AND id=?`,
            [
              `ORD-${orderId}`,
              `РђРІС‚РѕСЃРїРёСЃР°РЅРёРµ РїРѕ Р·Р°РєР°Р·Сѓ #${orderId} (${publicId})`,
              tenantId,
              orderStoreId,
              stockDocumentId,
            ]
          );
        }

        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        if (txErr && txErr.code === 'OUT_OF_STOCK') {
          return res.status(409).json({
            ok: false,
            error: 'OUT_OF_STOCK',
            data: { shortages: Array.isArray(txErr.shortages) ? txErr.shortages : [] },
          });
        }
        throw txErr;
      }
      conn.release();

      // Р—Р°РїРёСЃС‹РІР°РµРј РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ СЃРєРёРґРѕРє
      res.json({ ok: true, data: { id: orderId, public_id: publicId } });

      // Heavy post-actions run in background, response is already sent.
      setImmediate(async () => {
        try {
          for (const appliedDiscount of appliedDiscounts) {
            try {
              await discountHelpers.recordDiscountUsage(
                db,
                tenantId,
                appliedDiscount.discount_id,
                orderId,
                customerId,
                appliedDiscount.discount_amount
              );
            } catch (discountErr) {
              console.error('Failed to record discount usage:', discountErr);
            }
          }

          const payload = await fetchOrderPayload(tenantId, orderStoreId, orderId, { storeTimezone });

          if (payload) {
            if (ordersEvents && typeof ordersEvents.publish === 'function') {
              ordersEvents.publish(tenantId, orderStoreId, 'order.created', payload);
            }
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
              sendNewOrderNotification(tenantId, orderStoreId, payload, { db, botToken }).catch((err) =>
                console.error('Telegram new order notify:', err)
              );
            }
            sendOrderToPrintBot({ db, order: payload, tenantId, storeId: orderStoreId }).catch(() => {});
          }

          if (stockChangedProductIds.length) {
            publishStockChanged(tenantId, orderStoreId, {
              source: 'order.create',
              order_id: orderId,
              product_ids: stockChangedProductIds,
            });
          }
        } catch (postErr) {
          console.error('Order post-actions error:', postErr);
        }
      });

      return;
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });


  // ------------------------------
  // Auto-add items config (public)
  // ------------------------------
  router.get('/auto-add', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const [groupRows] = await db.query(
        `SELECT id, title, description, sort_order,
                min_cart_amount, max_cart_amount, include_auto_in_total,
                max_items_qty, allow_customer_qty, allow_customer_remove
         FROM prod_auto_add_groups
         WHERE tenant_id=? AND is_active=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      const groups = groupRows.map((g) => ({
        id: Number(g.id),
        title: g.title,
        description: g.description,
        sort_order: Number(g.sort_order || 0),
        min_cart_amount: g.min_cart_amount != null ? Number(g.min_cart_amount) : null,
        max_cart_amount: g.max_cart_amount != null ? Number(g.max_cart_amount) : null,
        include_auto_in_total: Number(g.include_auto_in_total || 0),
        max_items_qty: g.max_items_qty != null ? Number(g.max_items_qty) : null,
        allow_customer_qty: Number(g.allow_customer_qty ?? 1),
        allow_customer_remove: Number(g.allow_customer_remove ?? 1),
      }));

      const [rows] = await db.query(
        `SELECT i.*,
                p.name AS product_name,
                p.price AS product_price,
                p.old_price AS product_old_price,
                p.photos_json AS product_photos_json,
                p.base_unit_id AS product_base_unit_id,
                p.unit_id AS product_unit_id,
                p.base_qty AS product_base_qty,
                s.qty AS stock_qty
         FROM prod_auto_add_items i
         JOIN prod_auto_add_groups g
           ON g.tenant_id=i.tenant_id AND g.id=i.group_id
         JOIN prod_products p
           ON p.tenant_id=i.tenant_id AND p.id=i.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
         WHERE i.tenant_id=? AND i.is_active=1 AND g.is_active=1 AND p.is_active=1
         ORDER BY g.sort_order ASC, i.sort_order ASC, i.id ASC`,
        [storeId, tenantId]
      );

      // РЎРѕР±РёСЂР°РµРј РїСЂРѕРґСѓРєС‚С‹ РґР»СЏ СЂР°СЃС‡С‘С‚Р° display_price
      const productIds = [...new Set(rows.map(r => Number(r.product_id)).filter(Boolean))];
      const displayPriceMap = new Map();

      if (productIds.length > 0) {
        // Р¤РѕСЂРјРёСЂСѓРµРј РјР°СЃСЃРёРІ РїСЂРѕРґСѓРєС‚РѕРІ РґР»СЏ enrichProductsWithDisplayPrice
        const productsForEnrich = rows.map(r => ({
          id: Number(r.product_id),
          price: Number(r.product_price || 0),
          base_unit_id: r.product_base_unit_id,
          unit_id: r.product_unit_id,
          base_qty: r.product_base_qty,
        }));

        // РЈРґР°Р»СЏРµРј РґСѓР±Р»РёРєР°С‚С‹ РїРѕ id
        const uniqueProducts = [];
        const seenIds = new Set();
        for (const p of productsForEnrich) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            uniqueProducts.push(p);
          }
        }

        await enrichProductsWithDisplayPrice(uniqueProducts, tenantId);

        for (const p of uniqueProducts) {
          displayPriceMap.set(p.id, p.display_price);
        }
      }

      const items = rows.map((r) => ({
        id: Number(r.id),
        group_id: Number(r.group_id),
        product_id: Number(r.product_id),
        default_qty: Number(r.default_qty || 0),
        min_qty: Number(r.min_qty || 0),
        max_qty: r.max_qty != null ? Number(r.max_qty) : null,
        price_override: r.price_override != null ? Number(r.price_override) : null,
        free_first_qty: Number(r.free_first_qty || 0),
        free_per_amount: r.free_per_amount != null ? Number(r.free_per_amount) : null,
        free_per_amount_qty: Number(r.free_per_amount_qty || 0),
        max_free_qty: r.max_free_qty != null ? Number(r.max_free_qty) : null,
        sort_order: Number(r.sort_order || 0),
        product: {
          id: Number(r.product_id),
          name: r.product_name || "",
          price: Number(r.product_price || 0),
          old_price: Number(r.product_old_price || 0),
          photos: helpers.safeJsonArray(r.product_photos_json),
          stock_qty: r.stock_qty != null ? Number(r.stock_qty) : null,
          display_price: displayPriceMap.get(Number(r.product_id)) ?? Number(r.product_price || 0),
        },
      }));

      res.json({ ok: true, data: { groups, items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/public/delivery-settings
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ РЅР°СЃС‚СЂРѕР№РєРё РґРѕСЃС‚Р°РІРєРё РґР»СЏ С‚РµРєСѓС‰РµРіРѕ С„РёР»РёР°Р»Р°
   */
  router.get('/delivery-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      // РС‰РµРј РЅР°СЃС‚СЂРѕР№РєСѓ РґРѕСЃС‚Р°РІРєРё, РїСЂРёРІСЏР·Р°РЅРЅСѓСЋ Рє С‚РµРєСѓС‰РµРјСѓ С„РёР»РёР°Р»Сѓ
      const [settings] = await db.query(
        `SELECT ds.id, ds.name, ds.delivery_cost, ds.min_order_amount, ds.free_delivery_from, ds.is_active
         FROM ten_delivery_settings ds
         JOIN ten_delivery_settings_stores dss ON dss.delivery_setting_id = ds.id AND dss.tenant_id = ds.tenant_id
         WHERE ds.tenant_id=? AND dss.store_id=? AND ds.is_active=1
         LIMIT 1`,
        [tenantId, storeId]
      );

      if (!settings.length) {
        // РќРµС‚ РЅР°СЃС‚СЂРѕРµРє - РґРѕСЃС‚Р°РІРєР° Р±РµСЃРїР»Р°С‚РЅР°СЏ, Р±РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№
        return res.json({
          ok: true,
          data: {
            delivery_cost: 0,
            min_order_amount: 0,
            free_delivery_from: null,
            has_settings: false
          }
        });
      }

      const s = settings[0];
      res.json({
        ok: true,
        data: {
          delivery_cost: Number(s.delivery_cost || 0),
          min_order_amount: Number(s.min_order_amount || 0),
          free_delivery_from: s.free_delivery_from != null ? Number(s.free_delivery_from) : null,
          has_settings: true
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};

