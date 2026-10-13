'use strict';

const sharp = require('sharp');
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const transliteration = Object.freeze({ а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' });
function invalid(code) { const error = new Error(code); error.name = 'EmployeeIdentityError'; error.code = code; return error; }
function secureTransport(req) {
  if (process.env.NODE_ENV !== 'production' || req.secure === true) return true;
  const localProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
  return localProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}
function transliterate(value) {
  return [...String(value || '').normalize('NFC').trim().toLowerCase()]
    .map((char, index, chars) => char === 'й' && chars[index - 1] === 'ы' ? '' : (transliteration[char] ?? char)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function normalizeSuffix(value) {
  const raw = String(value || '');
  if (/[^a-zA-Z0-9 -]/.test(raw)) throw invalid('INVALID_LOGIN_SUFFIX');
  const suffix = raw.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(suffix)) throw invalid('INVALID_LOGIN_SUFFIX');
  return suffix;
}
function normalizeCorporateLogin(value, suffix) {
  const raw = String(value || '').trim();
  if (/[^\x20-\x7e]/.test(raw)) throw invalid('INVALID_LOGIN');
  const parts = raw.toLowerCase().split('@');
  if (parts.length > 2 || (parts.length === 2 && parts[1] !== suffix)) throw invalid('LOGIN_SUFFIX_MISMATCH');
  const local = parts[0];
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local)) throw invalid('INVALID_LOGIN');
  return { local, login: `${local}@${normalizeSuffix(suffix)}` };
}
function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^[+0-9 ().-]+$/.test(raw)) throw invalid('INVALID_EMPLOYEE_PHONE');
  const phone = raw.replace(/[ ().-]/g, '');
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) throw invalid('INVALID_EMPLOYEE_PHONE');
  return phone;
}
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) throw invalid('PASSWORD_TOO_SHORT');
  if (Buffer.byteLength(password, 'utf8') > 72) throw invalid('PASSWORD_TOO_LONG');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw invalid('PASSWORD_TOO_WEAK');
  return password;
}
function employeeProfile(body, existing = null) {
  const result = {};
  for (const field of ['last_name', 'first_name', 'patronymic']) {
    const value = String(body[field] ?? existing?.[field] ?? '').normalize('NFC').trim();
    if (value.length > 80 || /\p{C}/u.test(value)) throw invalid('INVALID_EMPLOYEE_NAME');
    result[field] = value || null;
  }
  if ((!existing || result.first_name || result.last_name) && (!result.first_name || !result.last_name)) throw invalid('EMPLOYEE_NAME_REQUIRED');
  result.name = [result.last_name, result.first_name, result.patronymic].filter(Boolean).join(' ') || existing?.name;
  result.phone = existing && (body.phone === undefined || String(body.phone || '').trim() === String(existing.phone || '').trim())
    ? existing.phone : normalizePhone(body.phone);
  return result;
}
async function encodeEmployeePhoto(base64) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalid('INVALID_EMPLOYEE_PHOTO');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_PHOTO_BYTES || buffer.toString('base64') !== base64) throw invalid('INVALID_EMPLOYEE_PHOTO');
  const jpeg = buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!jpeg && !png && !webp) throw invalid('INVALID_EMPLOYEE_PHOTO');
  try {
    const image = sharp(buffer, { limitInputPixels: 16 * 1024 * 1024, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw invalid('INVALID_EMPLOYEE_PHOTO');
    return await image.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { throw invalid('INVALID_EMPLOYEE_PHOTO'); }
}
async function lockLoginTenant(conn, tenantId) {
  const [rows] = await conn.query('SELECT login_suffix, corporate_logins_enabled FROM ten_tenants WHERE id=? FOR UPDATE', [tenantId]);
  if (!rows.length) throw invalid('TENANT_NOT_FOUND');
  if (!rows[0].login_suffix) throw invalid('CORPORATE_LOGIN_MIGRATION_REQUIRED');
  return rows[0];
}
async function generateAvailableLogin(db, tenantId, surname, userId = 0) {
  const base = transliterate(surname).slice(0, 58).replace(/-+$/g, '');
  if (!base) throw invalid('SURNAME_FOR_LOGIN_REQUIRED');
  const [[tenant]] = await db.query('SELECT login_suffix FROM ten_tenants WHERE id=?', [tenantId]);
  if (!tenant?.login_suffix) throw invalid('CORPORATE_LOGIN_MIGRATION_REQUIRED');
  for (let number = 1; number < 10000; number += 1) {
    const local = `${base}${number === 1 ? '' : number}`;
    const [existing] = await db.query('SELECT id FROM app_users WHERE tenant_id=? AND login_local=? AND id<>? LIMIT 1', [tenantId, local, userId]);
    if (!existing.length) return { local, login: `${local}@${tenant.login_suffix}`, suffix: tenant.login_suffix };
  }
  throw invalid('LOGIN_GENERATION_EXHAUSTED');
}
async function changeLoginSuffix(db, tenantId, value, expectedSuffix, confirmed) {
  const suffix = normalizeSuffix(value);
  if (confirmed !== true) throw invalid('LOGIN_SUFFIX_CONFIRMATION_REQUIRED');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const current = await lockLoginTenant(conn, tenantId);
    if (current.login_suffix !== expectedSuffix) throw invalid('LOGIN_SUFFIX_CHANGED');
    const [missing] = await conn.query('SELECT id FROM app_users WHERE tenant_id=? AND login IS NOT NULL AND login_local IS NULL LIMIT 1', [tenantId]);
    if (missing.length) throw invalid('CORPORATE_LOGIN_MIGRATION_REQUIRED');
    await conn.query('UPDATE ten_tenants SET login_suffix=?, corporate_logins_enabled=1 WHERE id=?', [suffix, tenantId]);
    // Avoid transient unique-key collisions with unusual legacy full logins. Both writes are in the same transaction.
    await conn.query('UPDATE app_users SET login=NULL WHERE tenant_id=? AND login_local IS NOT NULL', [tenantId]);
    await conn.query('UPDATE app_users SET login=CONCAT(login_local, ?, ?) WHERE tenant_id=? AND login_local IS NOT NULL', ['@', suffix, tenantId]);
    await conn.commit();
    return suffix;
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw invalid('LOGIN_SUFFIX_EXISTS');
    throw error;
  } finally { conn.release(); }
}
module.exports = { invalid, secureTransport, transliterate, normalizeSuffix, normalizeCorporateLogin, normalizePhone, validatePassword, employeeProfile, encodeEmployeePhoto, lockLoginTenant, generateAvailableLogin, changeLoginSuffix };
