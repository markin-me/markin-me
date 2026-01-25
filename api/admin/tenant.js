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
