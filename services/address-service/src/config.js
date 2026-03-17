require('dotenv').config();

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

module.exports = {
  port: Math.max(1, Number(process.env.ADDRESS_SERVICE_PORT || 3400) || 3400),
  internalToken: String(process.env.ADDRESS_SERVICE_INTERNAL_TOKEN || '').trim(),
  db: {
    host: String(process.env.ADDRESS_DB_HOST || '127.0.0.1').trim(),
    port: Math.max(1, Number(process.env.ADDRESS_DB_PORT || 5432) || 5432),
    database: String(process.env.ADDRESS_DB_NAME || 'markin_address').trim(),
    user: String(process.env.ADDRESS_DB_USER || 'postgres').trim(),
    password: String(process.env.ADDRESS_DB_PASSWORD || '').trim(),
    ssl: toBool(process.env.ADDRESS_DB_SSL, false),
  },
  queryLimit: Math.max(5, Number(process.env.ADDRESS_SERVICE_QUERY_LIMIT || 20) || 20),
  queryTimeoutMs: Math.max(1000, Number(process.env.ADDRESS_SERVICE_QUERY_TIMEOUT_MS || 5000) || 5000),
};
