const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware для проверки JWT токена
 * Устанавливает req.user = { userId, tenantId, email, role }
 */
function authMiddleware(req, res, next) {
  try {
    // Пытаемся получить токен из заголовка Authorization
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      // Или из cookies
      token = req.cookies.token;
    } else if (req.query.token) {
      // Или из query параметра (для отладки)
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
    }

    // Проверяем токен
    const decoded = jwt.verify(token, JWT_SECRET);

    // Устанавливаем данные пользователя в req
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'TOKEN_EXPIRED' });
    }
    console.error('Ошибка проверки токена:', error);
    return res.status(500).json({ ok: false, error: 'AUTH_ERROR' });
  }
}

/**
 * Опциональная авторизация (не блокирует, если токена нет)
 * Устанавливает req.user только если токен валиден
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
          userId: decoded.userId,
          tenantId: decoded.tenantId,
          email: decoded.email,
          role: decoded.role
        };
      } catch (e) {
        // Токен невалиден, но продолжаем без авторизации
      }
    }

    next();
  } catch (error) {
    next();
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware
};
