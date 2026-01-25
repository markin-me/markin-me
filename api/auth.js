const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Секретный ключ для JWT (в продакшене должен быть в .env)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

module.exports = function makeAuthRouter({ db, helpers }) {
  const router = express.Router();

  /**
   * POST /api/auth/register
   * Регистрация нового владельца магазина
   * body: { email, password, name, shop_name, slug? }
   */
  router.post('/register', async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const email = helpers.strOrNull(req.body.email);
      const password = helpers.strOrNull(req.body.password);
      const name = helpers.strOrNull(req.body.name);
      const shopName = helpers.strOrNull(req.body.shop_name) || 'Мой Магазин';
      const slug = helpers.strOrNull(req.body.slug);

      // Валидация
      if (!email || !email.includes('@')) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'INVALID_EMAIL' });
      }

      if (!password || password.length < 6) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'PASSWORD_TOO_SHORT' });
      }

      // Проверяем, не занят ли email
      const [existingUser] = await conn.query(
        'SELECT id FROM app_users WHERE email=? LIMIT 1',
        [email]
      );
      if (existingUser.length > 0) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'EMAIL_EXISTS' });
      }

      // Генерируем slug, если не указан
      let finalSlug = slug;
      if (!finalSlug) {
        const base = shopName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        finalSlug = base || 'shop';
        
        // Проверяем уникальность
        let counter = 1;
        let testSlug = finalSlug;
        while (true) {
          const [exists] = await conn.query(
            'SELECT id FROM ten_tenants WHERE slug=? LIMIT 1',
            [testSlug]
          );
          if (exists.length === 0) {
            finalSlug = testSlug;
            break;
          }
          testSlug = `${finalSlug}-${counter}`;
          counter++;
        }
      } else {
        // Проверяем уникальность указанного slug
        const [exists] = await conn.query(
          'SELECT id FROM ten_tenants WHERE slug=? LIMIT 1',
          [finalSlug]
        );
        if (exists.length > 0) {
          await conn.rollback();
          return res.status(409).json({ ok: false, error: 'SLUG_EXISTS' });
        }
      }

      // Хешируем пароль
      const passwordHash = await bcrypt.hash(password, 10);

      // Создаём tenant (магазин) с email и паролем
      const [tenantResult] = await conn.query(
        `INSERT INTO ten_tenants (name, slug, subdomain, email, password_hash, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [shopName, finalSlug, null, email, passwordHash]
      );
      const tenantId = tenantResult.insertId;
      const generatedSubdomain = `shop-${tenantId}`;

      await conn.query(
        'UPDATE ten_tenants SET subdomain=? WHERE id=?',
        [generatedSubdomain, tenantId]
      );

      // Создаём пользователя-владельца
      const [userResult] = await conn.query(
        `INSERT INTO app_users (tenant_id, email, password_hash, name, role, is_active)
         VALUES (?, ?, ?, ?, 'owner', 1)`,
        [tenantId, email, passwordHash, name || 'Владелец']
      );
      const userId = userResult.insertId;

      // Создаём дефолтные категории для нового магазина
      await helpers.ensureDefaultCategories(conn, tenantId);

      await conn.commit();

      // Генерируем JWT токен
      const token = jwt.sign(
        { userId, tenantId, email, role: 'owner' },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        ok: true,
        token,
        user: {
          id: userId,
          email,
          name: name || 'Владелец',
          role: 'owner',
          tenant_id: tenantId
        },
        tenant: {
          id: tenantId,
          name: shopName,
          slug: finalSlug,
          subdomain: generatedSubdomain
        }
      });
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      console.error('Ошибка регистрации:', e);
      console.error('Stack:', e.stack);
      // Возвращаем более детальную ошибку для отладки
      const errorMessage = e.message || 'REGISTRATION_ERROR';
      const errorCode = e.code || 'UNKNOWN';
      res.status(500).json({ 
        ok: false, 
        error: 'REGISTRATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        code: process.env.NODE_ENV === 'development' ? errorCode : undefined
      });
    } finally {
      conn.release();
    }
  });

  /**
   * POST /api/auth/login
   * Вход в систему
   * body: { email, password }
   */
  router.post('/login', async (req, res) => {
    try {
      const email = helpers.strOrNull(req.body.email);
      const password = helpers.strOrNull(req.body.password);

      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'EMAIL_PASSWORD_REQUIRED' });
      }

      // Сначала пытаемся найти по email пользователя (app_users)
      let [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.is_active,
                t.name AS tenant_name, t.slug AS tenant_slug, t.is_active AS tenant_active,
                'user' AS login_type
         FROM app_users u
         JOIN ten_tenants t ON t.id = u.tenant_id
         WHERE u.email = ?
         LIMIT 1`,
        [email]
      );

      let user = null;
      let passwordHash = null;
      let loginType = 'user';

      // Если не нашли пользователя, проверяем email магазина (ten_tenants)
      if (users.length === 0) {
        const [tenants] = await db.query(
          `SELECT t.id AS tenant_id, t.email, t.password_hash, t.name AS tenant_name, 
                  t.slug AS tenant_slug, t.is_active AS tenant_active,
                  'tenant' AS login_type
           FROM ten_tenants t
           WHERE t.email = ? AND t.is_active = 1
           LIMIT 1`,
          [email]
        );

        if (tenants.length === 0) {
          return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        }

        const tenant = tenants[0];
        passwordHash = tenant.password_hash;
        
        // Если у магазина нет пароля, нельзя войти
        if (!passwordHash) {
          return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        }

        // Проверяем пароль магазина
        const passwordMatch = await bcrypt.compare(password, passwordHash);
        if (!passwordMatch) {
          return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        }

        // Создаём объект пользователя для магазина (владелец по умолчанию)
        user = {
          id: null,
          tenant_id: tenant.tenant_id,
          email: tenant.email,
          name: tenant.tenant_name + ' (Магазин)',
          role: 'owner',
          is_active: 1,
          tenant_name: tenant.tenant_name,
          tenant_slug: tenant.tenant_slug,
          tenant_active: tenant.tenant_active,
          login_type: 'tenant'
        };
        loginType = 'tenant';
      } else {
        user = users[0];
        passwordHash = user.password_hash;
        loginType = user.login_type || 'user';

        // Проверяем активность пользователя
        if (Number(user.is_active) !== 1) {
          return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
        }

        if (Number(user.tenant_active) !== 1) {
          return res.status(403).json({ ok: false, error: 'TENANT_BLOCKED' });
        }

        // Проверяем пароль пользователя
        const passwordMatch = await bcrypt.compare(password, passwordHash);
        if (!passwordMatch) {
          return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        }
      }

      // Обновляем время последнего входа (только для пользователей, не для входа по email магазина)
      if (loginType === 'user' && user.id) {
        await db.query(
          'UPDATE app_users SET last_login_at = NOW() WHERE id = ?',
          [user.id]
        );
      }

      // Генерируем JWT токен
      const token = jwt.sign(
        {
          userId: user.id,
          tenantId: user.tenant_id,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenant_id: user.tenant_id
        },
        tenant: {
          id: user.tenant_id,
          name: user.tenant_name,
          slug: user.tenant_slug
        }
      });
    } catch (e) {
      console.error('Ошибка входа:', e);
      res.status(500).json({ ok: false, error: 'LOGIN_ERROR' });
    }
  });

  /**
   * GET /api/auth/me
   * Получить информацию о текущем пользователе (требует авторизации)
   */
  router.get('/me', async (req, res) => {
    try {
      // userId и tenantId должны быть установлены middleware авторизации
      const userId = req.user?.userId;
      const tenantId = req.user?.tenantId;

      if (!userId || !tenantId) {
        return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      }

      const [users] = await db.query(
        `SELECT u.id, u.email, u.name, u.role, u.is_active,
                t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
         FROM app_users u
         JOIN ten_tenants t ON t.id = u.tenant_id
         WHERE u.id = ? AND u.tenant_id = ? AND u.is_active = 1 AND t.is_active = 1
         LIMIT 1`,
        [userId, tenantId]
      );

      if (users.length === 0) {
        return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      }

      const user = users[0];
      res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenant_id: user.tenant_id
        },
        tenant: {
          id: user.tenant_id,
          name: user.tenant_name,
          slug: user.tenant_slug
        }
      });
    } catch (e) {
      console.error('Ошибка получения данных пользователя:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
