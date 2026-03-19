require('dotenv').config();
const db = require('../src/db');
const config = require('../src/config');

async function main() {
  const infoResult = await db.query(
    'SELECT current_database() AS database_name, current_user AS current_user'
  );
  const extensionResult = await db.query(
    `SELECT extname
       FROM pg_extension
      WHERE extname = ANY($1::text[])
      ORDER BY extname ASC`,
    [['postgis', 'pg_trgm', 'unaccent']]
  );

  const info = infoResult && infoResult.rows && infoResult.rows[0]
    ? infoResult.rows[0]
    : {};

  console.log(JSON.stringify({
    ok: true,
    host: config.db.host,
    port: config.db.port,
    database: info.database_name || config.db.database,
    user: info.current_user || config.db.user,
    installedExtensions: (extensionResult.rows || []).map((row) => row.extname),
  }, null, 2));

  await db.end();
}

main().catch(async (error) => {
  console.error(JSON.stringify({
    ok: false,
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    error: error && error.message ? error.message : String(error),
  }, null, 2));
  try {
    await db.end();
  } catch (_) {
    // Ignore shutdown failures after a connection error.
  }
  process.exit(1);
});
