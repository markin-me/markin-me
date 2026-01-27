const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');

module.exports = function makeAdminTenantRouter({ db, helpers }) {
  const router = express.Router();
  const subdomainRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

  function normalizeSubdomain(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim().toLowerCase();
    return s === '' ? null : s;
  }

  const listConfigs = {
    'order-statuses': {
      table: 'order_statuses',
      hasFinal: true
    },
    'order-payments': {
      table: 'order_payments',
      hasFinal: false
    },
    'order-delivery': {
      table: 'order_delivery_types',
      hasFinal: false,
      defaultField: 'is_default'
    },
    'order-time-options': {
      table: 'order_time_options',
      hasFinal: false,
      hasIcon: false
    }
  };

  function getListConfig(type) {
    return listConfigs[type] || null;
  }

  // ------------------------------
  // Upload: tenant assets (logo/favicon)
  // POST /api/admin/tenant/upload
  // form-data: { file, field }
  // ------------------------------
  const tenantAssetStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId));
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const tenantAssetUpload = multer({
    storage: tenantAssetStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload', tenantAssetUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const field = helpers.strOrNull(req.body.field);
      const file = req.file;

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });

      const allowed = new Set([
        'logo_light_url',
        'logo_dark_url',
        'favicon_light_url',
        'favicon_dark_url'
      ]);
      if (!field || !allowed.has(field)) {
        return res.status(400).json({ ok: false, error: 'FIELD_INVALID' });
      }

      const url = `/static/uploads/tenants/${tenantId}/${file.filename}`;

      await db.query(
        `UPDATE ten_tenants SET ${field}=? WHERE id=?`,
        [url, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, url, tenant: rows[0] || null });
    } catch (err) {
      console.error('Ошибка загрузки tenant ассета:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant
   * Возвращает профиль магазина (tenant) для текущего пользователя
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      res.json({ ok: true, tenant: rows[0] });
    } catch (err) {
      console.error('Ошибка получения tenant профиля:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/tenant
   * Обновление отдельных полей профиля (пока только timezone)
   * body: { timezone }
   */
  router.put('/', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const timezone = helpers.strOrNull(req.body.timezone);
      const name = req.body.name !== undefined ? helpers.strOrNull(req.body.name) : undefined;
      const email = req.body.email !== undefined ? helpers.strOrNull(req.body.email) : undefined;
      const phone = req.body.phone !== undefined ? helpers.strOrNull(req.body.phone) : undefined;
      const logoLight = req.body.logo_light_url !== undefined ? helpers.strOrNull(req.body.logo_light_url) : undefined;
      const logoDark = req.body.logo_dark_url !== undefined ? helpers.strOrNull(req.body.logo_dark_url) : undefined;
      const faviconLight = req.body.favicon_light_url !== undefined ? helpers.strOrNull(req.body.favicon_light_url) : undefined;
      const faviconDark = req.body.favicon_dark_url !== undefined ? helpers.strOrNull(req.body.favicon_dark_url) : undefined;
      const siteName = req.body.site_name !== undefined ? helpers.strOrNull(req.body.site_name) : undefined;
      const siteDescription = req.body.site_description !== undefined ? helpers.strOrNull(req.body.site_description) : undefined;
      const subdomain = req.body.subdomain !== undefined ? normalizeSubdomain(req.body.subdomain) : undefined;
      const customDomain = req.body.custom_domain !== undefined ? helpers.strOrNull(req.body.custom_domain) : undefined;

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const [currentRows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (!currentRows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const current = currentRows[0];
      const nextTimezone = timezone !== undefined ? timezone : current.timezone;
      const nextLogoLight = logoLight !== undefined ? logoLight : current.logo_light_url;
      const nextLogoDark = logoDark !== undefined ? logoDark : current.logo_dark_url;
      const nextFaviconLight = faviconLight !== undefined ? faviconLight : current.favicon_light_url;
      const nextFaviconDark = faviconDark !== undefined ? faviconDark : current.favicon_dark_url;
      const nextSiteName = siteName !== undefined ? siteName : current.site_name;
      const nextSiteDescription = siteDescription !== undefined ? siteDescription : current.site_description;
      let nextSubdomain = subdomain !== undefined ? subdomain : current.subdomain;

      if (subdomain !== undefined) {
        if (!subdomain) {
          nextSubdomain = `shop-${tenantId}`;
        } else {
          if (!subdomainRe.test(subdomain)) {
            return res.status(400).json({ ok: false, error: 'INVALID_SUBDOMAIN' });
          }
          const [exists] = await db.query(
            'SELECT id FROM ten_tenants WHERE subdomain=? AND id<>? LIMIT 1',
            [subdomain, tenantId]
          );
          if (exists.length > 0) {
            return res.status(409).json({ ok: false, error: 'SUBDOMAIN_TAKEN' });
          }
        }
      }
      const nextCustomDomain = customDomain !== undefined ? customDomain : current.custom_domain;
      const nextName = name !== undefined ? name : current.name;
      const nextEmail = email !== undefined ? email : current.email;
      const nextPhone = phone !== undefined ? phone : current.phone;

      if (email !== undefined && email && email !== current.email) {
        const [existsEmail] = await db.query(
          'SELECT id FROM ten_tenants WHERE email=? AND id<>? LIMIT 1',
          [email, tenantId]
        );
        if (existsEmail.length > 0) {
          return res.status(409).json({ ok: false, error: 'EMAIL_TAKEN' });
        }
      }

      await db.query(
        'UPDATE ten_tenants SET name=?, email=?, phone=?, timezone=?, logo_light_url=?, logo_dark_url=?, favicon_light_url=?, favicon_dark_url=?, site_name=?, site_description=?, subdomain=?, custom_domain=? WHERE id=?',
        [nextName, nextEmail, nextPhone, nextTimezone, nextLogoLight, nextLogoDark, nextFaviconLight, nextFaviconDark, nextSiteName, nextSiteDescription, nextSubdomain, nextCustomDomain, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, tenant: rows[0] || null });
    } catch (err) {
      console.error('Ошибка обновления tenant профиля:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function getNextStoreId(tenantId) {
    const [rows] = await db.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ten_stores WHERE tenant_id=?',
      [tenantId]
    );
    return Number(rows?.[0]?.next_id || 1);
  }

  router.get('/stores', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active, created_at, updated_at
         FROM ten_stores
         WHERE tenant_id=?
         ORDER BY id ASC`,
        [tenantId]
      );
      res.json({ ok: true, stores: rows || [] });
    } catch (err) {
      console.error('Ошибка получения списка точек продаж:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

    router.post('/stores', async (req, res) => {
      try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const name = helpers.strOrNull(req.body.name);
      const codeInput = helpers.strOrNull(req.body.code);
      const address = helpers.strOrNull(req.body.address);
      const city = helpers.strOrNull(req.body.city);
      const phone = helpers.strOrNull(req.body.phone);
      let timezone = helpers.strOrNull(req.body.timezone);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!name) {
        return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      }

      if (!timezone) {
        const [tenantRows] = await db.query(
          'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        timezone = tenantRows?.[0]?.timezone || null;
      }

      const nextId = await getNextStoreId(tenantId);
      const code = codeInput || `store-${nextId}`;
      const [exists] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND code=? LIMIT 1',
        [tenantId, code]
      );
      if (exists.length) {
        return res.status(409).json({ ok: false, error: 'CODE_TAKEN' });
      }

      await db.query(
        'INSERT INTO ten_stores (tenant_id, id, code, name, address, city, phone, timezone, is_active) VALUES (?,?,?,?,?,?,?,?,?)',
        [tenantId, nextId, code, name, address, city, phone, timezone, isActive]
      );

      const [rows] = await db.query(
        'SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active, created_at, updated_at FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, nextId]
      );

      res.json({ ok: true, store: rows[0] || null });
      } catch (err) {
        console.error('Ошибка создания точки продаж:', err);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    });

    router.patch('/stores/:id', async (req, res) => {
      try {
        const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
        const id = helpers.numOrNull(req.params.id);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
        if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

        const [existingRows] = await db.query(
          'SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, id]
        );
        if (!existingRows.length) {
          return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });
        }
        const existing = existingRows[0];

        const name = req.body.name !== undefined ? helpers.strOrNull(req.body.name) : undefined;
        const code = req.body.code !== undefined ? helpers.strOrNull(req.body.code) : undefined;
        const address = req.body.address !== undefined ? helpers.strOrNull(req.body.address) : undefined;
        const city = req.body.city !== undefined ? helpers.strOrNull(req.body.city) : undefined;
        const phone = req.body.phone !== undefined ? helpers.strOrNull(req.body.phone) : undefined;
        const timezone = req.body.timezone !== undefined ? helpers.strOrNull(req.body.timezone) : undefined;
        const isActive = req.body.is_active !== undefined ? (helpers.toBool(req.body.is_active, true) ? 1 : 0) : undefined;

        if (name !== undefined && !name) {
          return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
        }

        if (code !== undefined && code !== existing.code) {
          if (code) {
            const [exists] = await db.query(
              'SELECT id FROM ten_stores WHERE tenant_id=? AND code=? AND id<>? LIMIT 1',
              [tenantId, code, id]
            );
            if (exists.length) {
              return res.status(409).json({ ok: false, error: 'CODE_TAKEN' });
            }
          }
        }

        const updates = [];
        const params = [];
        if (name !== undefined) {
          updates.push('name=?');
          params.push(name);
        }
        if (code !== undefined) {
          updates.push('code=?');
          params.push(code);
        }
        if (address !== undefined) {
          updates.push('address=?');
          params.push(address);
        }
        if (city !== undefined) {
          updates.push('city=?');
          params.push(city);
        }
        if (phone !== undefined) {
          updates.push('phone=?');
          params.push(phone);
        }
        if (timezone !== undefined) {
          updates.push('timezone=?');
          params.push(timezone);
        }
        if (isActive !== undefined) {
          updates.push('is_active=?');
          params.push(isActive);
        }

        if (updates.length) {
          params.push(tenantId, id);
          await db.query(
            `UPDATE ten_stores SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
            params
          );
        }

        const [rows] = await db.query(
          'SELECT tenant_id, id, code, name, address, city, phone, timezone, is_active, created_at, updated_at FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, id]
        );
        res.json({ ok: true, store: rows[0] || null });
      } catch (err) {
        console.error('Ошибка обновления точки продаж:', err);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    });


    // ------------------------------
  // Order settings lists (tenant-level)
  // ------------------------------
  router.get('/order-statuses', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active, is_final
         FROM order_statuses
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения списка статусов:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-payments', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active
         FROM order_payments
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения способов оплаты:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-delivery-types', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active, is_default
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения способов получения:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-time-options', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, description, sort, is_active
         FROM order_time_options
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('Ошибка получения интервалов времени:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function patchListItem(req, res, type) {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      const cfg = getListConfig(type);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });

      const title = req.body.title !== undefined ? helpers.strOrNull(req.body.title) : undefined;
      const icon = cfg.hasIcon !== false && req.body.icon !== undefined ? helpers.strOrNull(req.body.icon) : undefined;
      const isActive = req.body.is_active !== undefined ? (helpers.toBool(req.body.is_active, true) ? 1 : 0) : undefined;
      const isFinal = cfg.hasFinal && req.body.is_final !== undefined ? (helpers.toBool(req.body.is_final, false) ? 1 : 0) : undefined;
      const defaultField = cfg.defaultField;
      const isDefault = defaultField && req.body[defaultField] !== undefined
        ? (helpers.toBool(req.body[defaultField], false) ? 1 : 0)
        : undefined;

      const updates = [];
      const params = [];
      if (title !== undefined) {
        updates.push('title=?');
        params.push(title);
      }
      if (icon !== undefined) {
        updates.push('icon=?');
        params.push(icon);
      }
      if (isActive !== undefined) {
        updates.push('is_active=?');
        params.push(isActive);
      }
      if (isFinal !== undefined) {
        updates.push('is_final=?');
        params.push(isFinal);
      }
      if (isDefault !== undefined) {
        updates.push(`${defaultField}=?`);
        params.push(isDefault);
      }

      if (!updates.length) {
        return res.json({ ok: true });
      }

      if (isDefault === 1) {
        await db.query(
          `UPDATE ${cfg.table} SET ${defaultField}=0
           WHERE tenant_id=? AND store_id=1 AND id!=?`,
          [tenantId, id]
        );
      }

      params.push(tenantId, id);
      await db.query(
        `UPDATE ${cfg.table} SET ${updates.join(', ')} WHERE tenant_id=? AND store_id=1 AND id=?`,
        params
      );

      const baseFields = ['id', 'code', 'title'];
      if (cfg.hasIcon !== false) baseFields.push('icon');
      baseFields.push('sort', 'is_active');
      if (cfg.hasFinal) baseFields.push('is_final');
      if (cfg.defaultField) baseFields.push(cfg.defaultField);
      const fields = baseFields.join(', ');
      const [rows] = await db.query(
        `SELECT ${fields} FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );

      res.json({ ok: true, item: rows[0] || null });
    } catch (err) {
      console.error('Ошибка обновления списка:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.patch('/order-statuses/:id', (req, res) => patchListItem(req, res, 'order-statuses'));
  router.patch('/order-payments/:id', (req, res) => patchListItem(req, res, 'order-payments'));
  router.patch('/order-delivery-types/:id', (req, res) => patchListItem(req, res, 'order-delivery'));
  router.patch('/order-time-options/:id', (req, res) => patchListItem(req, res, 'order-time-options'));

  async function reorderList(req, res, type) {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const cfg = getListConfig(type);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });

      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((v) => Number.isFinite(v) && v > 0) : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: 'IDS_REQUIRED' });

      const caseParts = [];
      const params = [];
      ids.forEach((id, idx) => {
        caseParts.push('WHEN ? THEN ?');
        params.push(id, (idx + 1) * 10);
      });
      const inSql = ids.map(() => '?').join(',');
      params.push(tenantId, ...ids);

      await db.query(
        `UPDATE ${cfg.table} SET sort = CASE id ${caseParts.join(' ')} ELSE sort END
         WHERE tenant_id=? AND store_id=1 AND id IN (${inSql})`,
        params
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Ошибка сохранения сортировки:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.post('/order-statuses/reorder', (req, res) => reorderList(req, res, 'order-statuses'));
  router.post('/order-payments/reorder', (req, res) => reorderList(req, res, 'order-payments'));
  router.post('/order-delivery-types/reorder', (req, res) => reorderList(req, res, 'order-delivery'));
  router.post('/order-time-options/reorder', (req, res) => reorderList(req, res, 'order-time-options'));

  const listIconStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'lists');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const listIconUpload = multer({
    storage: listIconStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/list-icon', listIconUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const type = helpers.strOrNull(req.body.type);
      const id = helpers.numOrNull(req.body.id);
      const file = req.file;
      const cfg = getListConfig(type);

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });
      if (cfg.hasIcon === false) return res.status(400).json({ ok: false, error: 'ICON_NOT_SUPPORTED' });

      const url = `/static/uploads/tenants/${tenantId}/lists/${file.filename}`;
      await db.query(
        `UPDATE ${cfg.table} SET icon=? WHERE tenant_id=? AND store_id=1 AND id=?`,
        [url, tenantId, id]
      );

      const baseIconFields = ['id', 'code', 'title', 'icon', 'sort', 'is_active'];
      if (cfg.hasFinal) baseIconFields.push('is_final');
      if (cfg.defaultField) baseIconFields.push(cfg.defaultField);
      const fields = baseIconFields.join(', ');
      const [rows] = await db.query(
        `SELECT ${fields} FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );

      res.json({ ok: true, url, item: rows[0] || null });
    } catch (err) {
      console.error('Ошибка загрузки иконки:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/password
   * body: { password, password_confirm }
   */
  router.post('/password', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const password = helpers.strOrNull(req.body.password);
      const confirm = helpers.strOrNull(req.body.password_confirm);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ ok: false, error: 'PASSWORD_TOO_SHORT' });
      }
      if (password !== confirm) {
        return res.status(400).json({ ok: false, error: 'PASSWORD_MISMATCH' });
      }

      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE ten_tenants SET password_hash=? WHERE id=?',
        [hash, tenantId]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Ошибка смены пароля tenant:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
