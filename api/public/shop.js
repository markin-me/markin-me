const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

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

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
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

  async function fetchOrderPayload(tenantId, storeId, id) {
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.public_id,
        o.created_at,
        o.customer_id,
        o.customer_name,
        o.customer_phone,
        o.address,
        o.comment,
        o.cutlery_qty,
        o.change_from,
        o.total_price,
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
        t.title AS timeOptionTitle
      FROM order_orders o
      LEFT JOIN order_statuses s
        ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
      LEFT JOIN order_payments p
        ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
      LEFT JOIN order_delivery_types m
        ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
      LEFT JOIN order_time_options t
        ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
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

    return {
      id: r.id,
      public_id: r.public_id || null,
      created_at: r.created_at,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      address: r.address,
      comment: r.comment,
      cutlery_qty: r.cutlery_qty,
      change_from: r.change_from,
      total_price: Number(r.total_price || 0),
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

        const photoUrl = `/static/uploads/avatars/${file.filename}`;

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

      const [rows] = await db.query(
        `SELECT
           o.id, o.created_at, o.total_price, o.items, o.public_id,
           s.title AS status_title, s.code AS status_code,
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
          created_at: r.created_at,
          total_price: Number(r.total_price || 0),
          status_title: r.status_title || null,
          status_code: r.status_code || null,
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
         WHERE tenant_id=? AND store_id=? AND is_active=1 AND site_visibility=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId, storeId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function resolveCategoryIdFromQuery(tenantId, storeId, req) {
    const code = helpers.strOrNull(req.query.category_code);
    if (code) {
      const [r] = await db.query(
        'SELECT id FROM prod_categories WHERE tenant_id=? AND store_id=? AND code=? LIMIT 1',
        [tenantId, storeId, code]
      );
      if (r.length) return Number(r[0].id);
    }

    const byId = Number(req.query.category_id);
    if (Number.isFinite(byId) && byId > 0) return byId;

    // fallback: "all"
    const [all] = await db.query(
      `SELECT id FROM prod_categories WHERE tenant_id=? AND store_id=? AND code='all' LIMIT 1`,
      [tenantId, storeId]
    );
    return all.length ? Number(all[0].id) : null;
  }

  router.get('/products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const categoryId = await resolveCategoryIdFromQuery(tenantId, storeId, req);
      if (!Number.isFinite(categoryId)) {
        return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
      }

      // "all"
      const [all] = await db.query(
        `SELECT id FROM prod_categories WHERE tenant_id=? AND store_id=? AND code='all' LIMIT 1`,
        [tenantId, storeId]
      );
      const allCategoryId = all.length ? Number(all[0].id) : null;

      if (allCategoryId && categoryId === allCategoryId) {
        const [rows] = await db.query(
          `SELECT p.*, pc.sort_order AS link_sort_order
           FROM prod_products p
           LEFT JOIN prod_product_categories pc
             ON pc.tenant_id = p.tenant_id AND pc.store_id = p.store_id AND pc.product_id = p.id AND pc.category_id = ?
           WHERE p.tenant_id=? AND p.store_id=? AND p.is_active=1 AND p.site_visibility=1
           ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
          [categoryId, tenantId, storeId]
        );

        for (const r of rows) r.photos = safeJsonArray(r.photos_json);
        return res.json({ ok: true, data: rows, category_id: categoryId });
      }

      const [rows] = await db.query(
        `SELECT p.*, pc.sort_order AS link_sort_order
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.store_id = pc.store_id AND p.id = pc.product_id
         WHERE pc.tenant_id=? AND pc.store_id=? AND pc.category_id=?
           AND p.is_active=1 AND p.site_visibility=1
         ORDER BY pc.sort_order ASC, pc.id ASC`,
        [tenantId, storeId, categoryId]
      );

      for (const r of rows) r.photos = safeJsonArray(r.photos_json);
      res.json({ ok: true, data: rows, category_id: categoryId });
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
        `SELECT *
         FROM prod_products
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1 AND site_visibility=1
         LIMIT 1`,
        [tenantId, storeId, id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const p = rows[0];
      p.photos = safeJsonArray(p.photos_json);

      res.json({ ok: true, data: p });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

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
        `SELECT id, code, title, icon, sort
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [timeOptions] = await db.query(
        `SELECT id, code, title, sort
         FROM order_time_options
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      res.json({ ok: true, data: { statuses, payments, methods, timeOptions } });
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

      // calculate total from products
      const ids = items.map(it => Number(it.product_id)).filter(n => Number.isFinite(n) && n > 0);
      if (!ids.length) return res.status(400).json({ ok: false, error: 'BAD_ITEMS' });

      const [products] = await db.query(
        `SELECT id, name, price, old_price, photos_json
         FROM prod_products
         WHERE tenant_id=? AND id IN (${ids.map(() => '?').join(',')})`,
        [tenantId, ...ids]
      );
      const byId = new Map(products.map(p => [Number(p.id), p]));

      const normItems = [];
      let total = 0;

      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const p = byId.get(pid);
        if (!p) continue;

        const price = Number(p.price || 0);
        const oldPrice = Number(p.old_price || 0);
        const lineTotal = price * qty;

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
          price,
          old_price: oldPrice,
          line_total: lineTotal,
          photos, // Сохраняем фото для отчетов
        });
      }

      if (!normItems.length) return res.status(400).json({ ok: false, error: 'NO_PRODUCTS' });

      const statusId = await getActiveStatusIdDefault(tenantId, storeId);
      if (!statusId) return res.status(500).json({ ok: false, error: 'NO_STATUSES' });

      // ПЕРЕИМЕНОВАНО: delivery_address -> address (в таблице order_orders)
      const deliveryAddress = helpers.strOrNull(req.body.delivery_address);
      const addrLine = (str(methodCode).trim() === 'delivery') ? deliveryAddress : null;

      const comment = helpers.strOrNull(req.body.comment);
      const promoCode = helpers.strOrNull(req.body.promo_code);

      const cutleryQty = Math.max(0, Number(req.body.cutlery_qty || 0));
      const changeFrom = Number.isFinite(Number(req.body.change_from)) ? Number(req.body.change_from) : null;

      const scheduledAt = helpers.strOrNull(req.body.scheduled_at) || null;

      const publicId = makeUuid36();

      // ВАЖНО: никаких updated_at тут нет (в твоей таблице order_orders его нет)
      const [r] = await db.query(
        `INSERT INTO order_orders
         (tenant_id, store_id, customer_id, customer_name, customer_phone, promo_code,
          address, delivery_address_id, comment, cutlery_qty, change_from,
          items, total_price,
          delivery_type_id, payment_id, time_option_id,
          status_id, status_sort, scheduled_at,
          created_via, is_active, public_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'web', 1, ?)`,
        [
          tenantId,
          storeId,
          customerId,
          customerName,
          customerPhone,
          promoCode,
          addrLine,
          null, // delivery_address_id (пока не используем)
          comment,
          cutleryQty,
          changeFrom,
          JSON.stringify(normItems),
          total,
          deliveryTypeId,
          paymentId,
          timeOptionId,
          statusId,
          0, // status_sort
          scheduledAt,
          publicId,
        ]
      );

      const payload = await fetchOrderPayload(tenantId, storeId, r.insertId);

      if (payload) {
        ordersEvents.publish(tenantId, storeId, 'order.created', payload);
      }

      res.json({ ok: true, data: { id: r.insertId, public_id: publicId } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};