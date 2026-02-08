const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { sendNewOrderNotification } = require('../telegramNotifications');
const { sendOrderToPrintBot } = require('../printPush');

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

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function parseVariantValueNumber(value) {
    const s = String(value ?? '').replace(',', '.');
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
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
   * Минимальная возможная цена товара с учётом вариантов (порций/объёмов).
   * Если у товара есть варианты — перебираем все значения и возвращаем минимум; иначе — базовую цену.
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
    // session/public id – 32 hex or uuid without dashes
    if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '');
    return crypto.randomBytes(16).toString('hex');
  }

  function makeUuid36() {
    // nice public id (fits varchar(36))
    if (crypto.randomUUID) return crypto.randomUUID();
    const hex = crypto.randomBytes(16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function getActiveStatusIdDefault(tenantId, storeId) {
    // пробуем "new", если нет — первый активный по sort
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
       FROM cust_customer_sessions s
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
        o.items,
        o.scheduled_at,
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

// ------------------------------
  // AUTH
  // ------------------------------

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

      // ищем клиента
      const [ex] = await db.query(
        `SELECT id, name, phone, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday, is_active
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );

      let customerId = null;

      if (!ex.length) {
        // создаём нового клиента
        const [ins] = await db.query(
          `INSERT INTO cust_customers
           (tenant_id, name, phone, birthday, is_active, registration_date)
           VALUES (?,?,?,?,1, CURDATE())`,
          [tenantId, 'Клиент', phone, birthday]
        );
        customerId = Number(ins.insertId);
      } else {
        const c = ex[0];
        if (Number(c.is_active || 0) !== 1) {
          return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
        }

        customerId = Number(c.id);

        // если birthday уже есть — проверяем
        if (c.birthday && String(c.birthday) !== String(birthday)) {
          return res.status(401).json({ ok: false, error: 'WRONG_BIRTHDAY' });
        }

        // если birthday был NULL — запишем (первый вход)
        if (!c.birthday) {
          await db.query(
            `UPDATE cust_customers SET birthday=? WHERE tenant_id=? AND id=?`,
            [birthday, tenantId, customerId]
          );
        }
      }

      // создаём сессию
      const token = makeToken32();

      // срок 30 дней
      await db.query(
        `INSERT INTO cust_customer_sessions
         (tenant_id, customer_id, token, expires_at, is_active)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), 1)`,
        [tenantId, customerId, token]
      );

      const [me] = await db.query(
        `SELECT id, name, phone, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday, photo
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );

      res.json({ ok: true, token, customer: me[0] || null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
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
         SET is_active=0
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

      // Для каждого филиала загружаем часы работы и проверяем статус
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
      console.error('Ошибка получения точек продаж:', err);
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

        // Создаём WebP-вариант аватара (оригинал остаётся как fallback)
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
           id, street, house, entrance, floor, apartment, comment,
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
         (tenant_id, customer_id, street, house, entrance, floor, apartment, comment, is_default, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        [tenantId, customer.id, street, house, entrance, floor, apartment, comment, isDefault]
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
         SET street=?, house=?, entrance=?, floor=?, apartment=?, comment=?${makeDefault === 1 ? ', is_default=1' : ''}
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [street, house, entrance, floor, apartment, comment, tenantId, customer.id, addressId]
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
      const storeTimezone = await getStoreTimezone(tenantId, storeId);

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
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT ?`,
        [tenantId, storeId, customer.id, limit]
      );

      const data = rows.map(r => {
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

      res.json({ ok: true, data });
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

      // Проверяем, что заказ принадлежит клиенту
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
   * Комбо-блоки для клиента: только блоки и только товары, доступные на сайте
   * (is_active=1, site_visibility=1). Товары с остатком 0 / выключенные в блоке остаются,
   * но в ответ не попадают — клиент их не видит.
   */
  router.get('/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

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
             AND (s.qty IS NULL OR s.qty > 0)
           ORDER BY bp.sort_order ASC, bp.id ASC`,
          [storeId, tenantId, block.id]
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
   * Один комбо-набор для магазина: данные комбо + блоки с товарами (для экрана выбора).
   */
  router.get('/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
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
             AND (s.qty IS NULL OR s.qty > 0)
           ORDER BY bp.sort_order ASC, bp.id ASC`,
          [storeId, tenantId, sb.block_id]
        );
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
          min_select: Math.max(1, Number(sb.min_select) || 1),
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
   * Комбо-наборы для каталога: по категории (category_code), с min_price и фото для 2x2 сетки.
   * Самая низкая цена «От X Р»: по каждому блоку берём min_select товаров с наименьшей возможной ценой
   * (с учётом вариантов/порций — берётся минимум по всем вариантам товара), суммируем, применяем скидку комбо.
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

      let minPriceSum = 0;
      const gridPhotos = [];

      for (const sb of setBlocks) {
        const minSelect = Math.max(1, Number(sb.min_select) || 1);
        // Все доступные товары блока (с base_unit_id, base_qty для расчёта цены вариантов)
        const [blockProductsRaw] = await db.query(
          `SELECT p.id, p.price, p.photos_json, p.base_unit_id, p.base_qty, p.unit_id
           FROM prod_combo_block_products bp
           JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           WHERE bp.tenant_id=? AND bp.block_id=? AND p.is_active=1 AND p.site_visibility=1
             AND (s.qty IS NULL OR s.qty > 0)
           ORDER BY bp.sort_order ASC, bp.id ASC`,
          [storeId, tenantId, sb.block_id]
        );
        if (!blockProductsRaw.length) continue;

        const blockProductIds = blockProductsRaw.map((r) => Number(r.id)).filter(Boolean);
        const [vaRows] = await db.query(
          `SELECT va.product_id, va.variant_group_id,
                  COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
                  vg.unit_id, vg.values, vg.sort_order
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
           WHERE va.tenant_id=? AND va.product_id IN (${blockProductIds.map(() => '?').join(',')})
             AND va.is_active=1 AND vg.is_active=1
           ORDER BY va.sort_order ASC, vg.sort_order ASC`,
          [tenantId, ...blockProductIds]
        );

        const variantGroupIds = [...new Set(vaRows.map((r) => Number(r.variant_group_id)).filter(Boolean))];
        let tiersByGroup = new Map();
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

        const variantByProductId = new Map();
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

  router.get('/products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const categoryId = await resolveCategoryIdFromQuery(tenantId, req);
      if (!Number.isFinite(categoryId)) {
        return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
      }

      // Быстрый "lite" режим для первого экрана витрины:
      // - минимальный набор полей
      // - упрощённая доступность (только по stock_qty)
      // - ограничение количества
      // Нужен, чтобы LCP-картинка начинала грузиться сразу, а не после тяжёлых подзапросов.
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
        const combos = await getCombosForCategory(tenantId, storeId, categoryId);
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
      const combos = await getCombosForCategory(tenantId, storeId, categoryId);
      res.json({ ok: true, data: rows, combos, category_id: categoryId });
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

  router.get('/products/:id/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Проверяем, что товар активен и виден на сайте
      const [productCheck] = await db.query(
        `SELECT id FROM prod_products 
         WHERE tenant_id=? AND id=? AND is_active=1 AND site_visibility=1 
         LIMIT 1`,
        [tenantId, productId]
      );
      if (!productCheck.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Получаем активные назначения опций для товара
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

      // Нормализуем данные: используем значения из назначения, если заданы, иначе из группы
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

      // Получаем группу опций
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
          return res.status(503).json({ ok: false, error: 'DB_CONNECTION_ERROR', message: 'Не удалось подключиться к базе данных' });
        }
        throw dbError;
      }
      
      if (!group) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Получаем элементы опции (только активные товары)
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

      // Собираем все product_id для загрузки вариантов
      const productIds = items.map(item => Number(item.target_product_id)).filter(Number.isFinite);
      
      // Загружаем варианты для всех товаров-опций одним запросом
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

        // Собираем все id групп вариантов, чтобы подтянуть скидки/надбавки
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
        
        // Группируем варианты по product_id
        for (const va of variantAssignments) {
          const pid = Number(va.product_id);
          if (!variantsByProductId.has(pid)) {
            variantsByProductId.set(pid, []);
          }
          const groupDefaultIdx = va.group_default_value_index != null ? Number(va.group_default_value_index) : null;
          const assignmentDefaultIdx = va.assignment_default_value_index != null ? Number(va.assignment_default_value_index) : null;
          // Определяем дефолтный индекс: сначала из привязки, потом из группы
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

      // Нормализуем элементы
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
          // Варианты товара-опции
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
  // order-config (для оформления)
  // ВАЖНО: твой фронт ждёт methods / payments / timeOptions
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

      // ПЕРЕИМЕНОВАНО: order_delivery_types (бывшая order_methods)
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
  // create order
  // ------------------------------
  router.post('/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      let orderStoreId = storeId;

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
        customerPhone = authCustomer.phone; // телефон не меняем
        if (!customerName) customerName = authCustomer.name || 'Клиент';
      } else {
        if (!customerPhone) return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
        if (!customerName) customerName = 'Клиент';
      }

      // ensure customer exists if not authed
      if (!customerId) {
        const [ex] = await db.query(
          `SELECT id FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 1`,
          [tenantId, customerPhone]
        );
        if (ex.length) {
          customerId = Number(ex[0].id);
          // обновим имя если пришло
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

      // product_ids только у обычных товаров; комбо приходят с type === 'combo'
      const ids = items
        .filter(it => it.type !== 'combo')
        .map(it => Number(it.product_id))
        .filter(n => Number.isFinite(n) && n > 0);
      const hasCombos = items.some(it => it.type === 'combo');
      if (!ids.length && !hasCombos) return res.status(400).json({ ok: false, error: 'BAD_ITEMS' });

      // availability check for products (stock + ingredients) — только если в заказе есть обычные товары
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
          `SELECT id, name, price, old_price, photos_json
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

      const normItems = [];
      let total = 0;

      // Собираем все option_item_ids для получения информации из БД
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

      // Получаем информацию об опциях из БД
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

        optionRows.forEach(row => {
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
          const selections = Array.isArray(it.selections) ? it.selections : [];
          const photos = [];
          selections.forEach((s) => {
            if (s.product_photo) photos.push(s.product_photo);
          });
          normItems.push({
            type: 'combo',
            combo_id: it.combo_id,
            name: it.combo_title || 'Комбо',
            qty,
            price: qty > 0 ? roundPrice(lineTotal / qty) : 0,
            old_price: 0,
            line_total: lineTotal,
            photos,
            selections: selections.map((s) => ({
              product_id: s.product_id,
              product_name: s.product_name,
              product_photo: s.product_photo,
              variant_label: s.variant_label,
              variant_group_title: s.variant_group_title,
              variant_unit: s.variant_unit,
              ingredients_display: Array.isArray(s.ingredients_display) ? s.ingredients_display : [],
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

        // ВАЖНО: используем line_total из запроса (уже посчитан на фронте)
        // Не пересчитываем цену заново, чтобы избежать двойного подсчета базовой цены
        const lineTotalFromRequest = Number(it.line_total);
        const useLineTotalFromRequest = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0;

        // Обрабатываем опции (только для сохранения состава, не для пересчета цены)
        const options = [];
        
        // Собираем опции: используем option_items из запроса (с qty), если есть, иначе option_item_ids
        const optionItemsFromRequest = Array.isArray(it.option_items) && it.option_items.length > 0
          ? it.option_items
          : [];
        const optionIdsFromRequest = Array.isArray(it.option_item_ids) ? it.option_item_ids : [];
        
        // Создаем map для быстрого поиска qty и вариантов из запроса
        const qtyMap = new Map();
        const optionVariantsMap = new Map(); // Варианты для каждой опции
        optionItemsFromRequest.forEach(opt => {
          const id = Number(opt.id);
          if (Number.isFinite(id) && id > 0) {
            qtyMap.set(id, Math.max(1, Number(opt.qty || opt.quantity || 1)));
            // Сохраняем данные о варианте опции, если есть
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

        // Обрабатываем опции: используем option_item_ids как основной список
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
          if (!optInfo) continue; // Пропускаем опции, которых нет в БД

          const optQty = qtyMap.get(optId) || 1; // Количество из запроса или 1 по умолчанию
          const optPrice = optInfo.price; // Цена всегда из БД
          // НЕ добавляем к optionsTotal - цена уже учтена в line_total

          const optionEntry = {
            id: optId,
            title: optInfo.title,
            price: optPrice,
            qty: optQty,
          };
          
          // Добавляем данные о варианте опции, если есть
          const optVariant = optionVariantsMap.get(optId);
          if (optVariant) {
            optionEntry.variant_group_id = optVariant.variant_group_id;
            optionEntry.variant_value_index = optVariant.variant_value_index;
            optionEntry.variant_label = optVariant.variant_label;
            optionEntry.variant_price_diff = optVariant.variant_price_diff;
          }

          options.push(optionEntry);
        }

        // Обрабатываем ингредиенты (только для сохранения состава, не для пересчета цены)
        const ingredients = [];
        
        const cartIngredients = Array.isArray(it.ingredients) ? it.ingredients : [];
        if (cartIngredients.length) {
          // Получаем информацию об ингредиентах из БД
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
            
            // Функция для получения фактора конвертации между единицами
            async function getConversionFactor(fromUnitId, toUnitId, productIdForPul = null) {
              if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
              
              // Прямая конвертация из prod_unit_conversions
              const [direct] = await db.query(
                `SELECT factor FROM prod_unit_conversions 
                 WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
                [tenantId, fromUnitId, toUnitId]
              );
              if (direct.length && direct[0].factor) return Number(direct[0].factor);
              
              // Обратная конвертация
              const [inverse] = await db.query(
                `SELECT factor FROM prod_unit_conversions 
                 WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
                [tenantId, toUnitId, fromUnitId]
              );
              if (inverse.length && inverse[0].factor) return 1 / Number(inverse[0].factor);
              
              // Конвертация через prod_product_unit_links (если указан product_id)
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

              // Переводим quantity в базовую единицу измерения
              let qtyInBase = ingQty;
              const ingredientBaseQty = ingInfo.ingredient_base_qty != null && Number(ingInfo.ingredient_base_qty) > 0 
                ? Number(ingInfo.ingredient_base_qty) 
                : 1;
              const ingredientUnitId = Number(ingInfo.unit_id || 0);
              const ingredientBaseUnitId = Number(ingInfo.ingredient_base_unit_id || 0);
              
              // Если единица измерения ингредиента отличается от базовой, конвертируем
              if (ingredientUnitId && ingredientBaseUnitId && ingredientUnitId !== ingredientBaseUnitId) {
                const factor = await getConversionFactor(ingredientUnitId, ingredientBaseUnitId, ingId);
                if (factor != null && factor > 0) {
                  qtyInBase = ingQty * factor;
                }
              }

              // Рассчитываем цену с учетом base_qty
              let ingPricePerUnit = 0;
              
              if (ingInfo.price_override != null) {
                // Если есть price_override - используем его как цену за единицу в базовой единице измерения
                ingPricePerUnit = Number(ingInfo.price_override);
              } else {
                // Рассчитываем цену за единицу из base_qty
                const ingredientPrice = Number(ingInfo.ingredient_price || 0);
                
                if (ingredientBaseQty > 0 && ingredientPrice > 0) {
                  // Цена за единицу (в базовой единице) = цена товара / base_qty
                  ingPricePerUnit = ingredientPrice / ingredientBaseQty;
                } else if (ingredientPrice > 0) {
                  ingPricePerUnit = ingredientPrice;
                }
              }
              
              // Итоговая цена ингредиента = цена за единицу * количество (в базовой единице)
              // НЕ добавляем к ingredientsTotal - цена уже учтена в line_total
              const ingTotal = ingPricePerUnit * qtyInBase;

              // Для сохранения: price должна быть ценой за единицу в той единице измерения, в которой указано quantity
              // ingPricePerUnit - это цена за единицу в базовой единице (base_unit_id)
              // quantity (ingQty) указано в unit_id
              // Нужно пересчитать цену за единицу для unit_id
              let priceForDisplay = ingPricePerUnit;
              
              // Если quantity в той же единице, что и базовая, price уже правильный
              if (ingredientUnitId && ingredientBaseUnitId && ingredientUnitId !== ingredientBaseUnitId && ingQty > 0) {
                // Если единицы разные, пересчитываем цену за единицу в unit_id
                const factor = await getConversionFactor(ingredientUnitId, ingredientBaseUnitId, ingId);
                if (factor != null && factor > 0) {
                  // priceForDisplay = цена за единицу в unit_id
                  // Если quantity в unit_id, а цена за единицу в base_unit_id = ingPricePerUnit,
                  // то цена за unit_id = ingPricePerUnit * factor
                  // (потому что 1 unit_id = factor * base_unit_id)
                  priceForDisplay = ingPricePerUnit * factor;
                }
              }

              // Альтернативный расчет: если total уже посчитан, можно использовать его
              // priceForDisplay = ingTotal / ingQty (если ingQty > 0)
              if (ingQty > 0 && ingTotal > 0) {
                priceForDisplay = ingTotal / ingQty;
              }

              ingredients.push({
                ingredient_id: ingId,
                name: ingInfo.ingredient_name || '',
                quantity: ingQty,
                price: priceForDisplay,
                total: ingTotal,
                unit_label: ingInfo.unit_short_title || ingInfo.unit_title || ingInfo.unit_code || '',
              });
            }
          }
        }

        // Обрабатываем варианты (только для сохранения состава, не для пересчета цены)
        let variantData = null;
        const variantGroupId = Number(it.variant_group_id);
        const variantValueIndex = Number(it.variant_value_index);
        const variantLabel = str(it.variant_label || "");
        
        if (variantGroupId && Number.isFinite(variantValueIndex)) {
          // Получаем информацию о группе вариантов из БД
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
            
            // Получаем значение варианта
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
            
            // Если variant_label содержит "Название: значение", извлекаем значение
            if (variantLabel.includes(":")) {
              const parts = variantLabel.split(":");
              if (parts.length > 1) {
                variantValue = parts.slice(1).join(":").trim();
              }
            }
            
            // Варианты не добавляют доплату - они пересчитывают цену пропорционально количеству
            // variant_unit_price уже учтена в line_total, поэтому price_diff всегда 0
            variantData = {
              variant_group_id: variantGroupId,
              variant_value_index: variantValueIndex,
              group_title: groupTitle,
              value: variantValue,
              label: variantValue, // Для отображения
              price_diff: 0, // Варианты не имеют доплаты, цена уже учтена в variant_unit_price
            };
          }
        }

        // Используем line_total из запроса (уже посчитан на фронте)
        // Если line_total не передан, используем базовую цену товара (для товаров без опций/вариантов/состава)
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
        total += lineTotal;

        // Получаем фото товара для сохранения в заказе
        let photos = [];
        try {
          if (p.photos_json) {
            const parsed = JSON.parse(p.photos_json);
            if (Array.isArray(parsed)) photos = parsed;
          }
        } catch {}

        normItems.push({
          product_id: pid,
          name: p.name,
          qty,
          price: unitPrice,
          old_price: oldPrice,
          line_total: lineTotal,
          photos, // Сохраняем фото для отчетов
          options: options.length > 0 ? options : undefined, // Сохраняем опции только если они есть
          ingredients: ingredients.length > 0 ? ingredients : undefined, // Сохраняем ингредиенты только если они есть
          variants: variantData ? [variantData] : undefined, // Сохраняем варианты только если они есть
          auto_add: Number(it.auto_add || 0) === 1 ? 1 : 0, // Для сортировки: автодобавления (приборы) в конец списка
        });
      }

      if (!normItems.length) return res.status(400).json({ ok: false, error: 'NO_PRODUCTS' });

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

      // Timezone филиала, к которому привязан заказ (orderStoreId)
      const storeTimezone = await getStoreTimezone(tenantId, orderStoreId);

      // Адрес и точка самовывоза нужны для проверки дубля (читаем до неё)
      const deliveryAddress = helpers.strOrNull(req.body.delivery_address);
      const pickupStoreId = Number.isFinite(Number(req.body.pickup_store_id)) ? Number(req.body.pickup_store_id) : null;
      const addrForDup = (deliveryAddress && String(deliveryAddress).trim()) ? String(deliveryAddress).trim() : '';
      const pickupIdForDup = (pickupStoreId && Number.isFinite(pickupStoreId)) ? pickupStoreId : 0;

      // Серверная защита от дублей (двойная отправка / повтор запроса). Окно 60 сек.
      // created_at в БД хранится в UTC — сравниваем тоже в UTC.
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

      // created_at в БД сохраняем только в UTC.
      const createdAt = helpers.formatUtcDateTime(Date.now());

      // ВАЖНО: никаких updated_at тут нет (в твоей таблице order_orders его нет)
      const [r] = await db.query(
        `INSERT INTO order_orders
         (tenant_id, store_id, customer_id, customer_name, customer_phone, promo_code,
          address, delivery_address_id, pickup_store_id, comment, address_comment, cutlery_qty, change_from,
          items, total_price, delivery_cost,
          delivery_type_id, payment_id, time_option_id,
          status_id, status_sort, scheduled_at, created_at,
          created_via, is_active, public_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'web', 1, ?)`,
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
          deliveryTypeId,
          paymentId,
          timeOptionId,
          statusId,
          0, // status_sort
          scheduledAt,
          createdAt,
          publicId,
        ]
      );

      const payload = await fetchOrderPayload(tenantId, orderStoreId, r.insertId, { storeTimezone });

      if (payload) {
        ordersEvents.publish(tenantId, orderStoreId, 'order.created', payload);
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          sendNewOrderNotification(tenantId, orderStoreId, payload, { db, botToken }).catch((err) =>
            console.error('Telegram new order notify:', err)
          );
        }
        sendOrderToPrintBot({ db, order: payload, tenantId, storeId: orderStoreId }).catch(() => {});
      }

      res.json({ ok: true, data: { id: r.insertId, public_id: publicId } });
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

      // Собираем продукты для расчёта display_price
      const productIds = [...new Set(rows.map(r => Number(r.product_id)).filter(Boolean))];
      const displayPriceMap = new Map();

      if (productIds.length > 0) {
        // Формируем массив продуктов для enrichProductsWithDisplayPrice
        const productsForEnrich = rows.map(r => ({
          id: Number(r.product_id),
          price: Number(r.product_price || 0),
          base_unit_id: r.product_base_unit_id,
          unit_id: r.product_unit_id,
          base_qty: r.product_base_qty,
        }));

        // Удаляем дубликаты по id
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
   * Возвращает настройки доставки для текущего филиала
   */
  router.get('/delivery-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      // Ищем настройку доставки, привязанную к текущему филиалу
      const [settings] = await db.query(
        `SELECT ds.id, ds.name, ds.delivery_cost, ds.min_order_amount, ds.free_delivery_from, ds.is_active
         FROM ten_delivery_settings ds
         JOIN ten_delivery_settings_stores dss ON dss.delivery_setting_id = ds.id AND dss.tenant_id = ds.tenant_id
         WHERE ds.tenant_id=? AND dss.store_id=? AND ds.is_active=1
         LIMIT 1`,
        [tenantId, storeId]
      );

      if (!settings.length) {
        // Нет настроек - доставка бесплатная, без ограничений
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
