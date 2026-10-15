'use strict';

const jwt = require('jsonwebtoken');
const { createHash } = require('crypto');
const { secureTransport } = require('./employeeIdentity');
const COOKIE_NAME = 'admin_navigation';

function options(req) {
  if (!secureTransport(req)) throw Object.assign(new Error('HTTPS_REQUIRED'), { status: 426 });
  return { httpOnly: true, secure: req.secure === true || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/dashboard' };
}
function clear(req, res) { res.clearCookie(COOKIE_NAME, options(req)); }
function issue(req, res, token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
  if (decoded.authStage && decoded.authStage !== 'active') { clear(req, res); return; }
  if (!Number.isFinite(decoded.exp)) throw Object.assign(new Error('SESSION_EXPIRY_REQUIRED'), { status: 403 });
  res.cookie(COOKIE_NAME, token, { ...options(req), expires: new Date(decoded.exp * 1000) });
}
function sameOrigin(req, res, next) {
  try {
    options(req);
    const origin = req.headers.origin && new URL(req.headers.origin);
    if (req.headers['sec-fetch-site'] === 'cross-site'
      || (origin && (origin.host !== req.get('host') || origin.protocol !== (req.secure || process.env.NODE_ENV === 'production' ? 'https:' : 'http:')))) {
      return res.status(403).json({ ok: false, error: 'ORIGIN_FORBIDDEN' });
    }
    return next();
  } catch (error) { return res.status(error.status || 403).json({ ok: false, error: error.status === 426 ? 'HTTPS_REQUIRED' : 'ORIGIN_FORBIDDEN' }); }
}
function requireTransport(req, res, next) {
  try { options(req); return next(); }
  catch (_) { return res.status(426).send('HTTPS_REQUIRED'); }
}
function tokenBinding(token) { return createHash('sha256').update(token).digest('hex'); }
module.exports = { COOKIE_NAME, issue, clear, sameOrigin, requireTransport, tokenBinding };
