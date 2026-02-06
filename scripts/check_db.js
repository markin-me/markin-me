const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const db = require(path.join(__dirname, "..", "db"));

async function main() {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    const ok = rows && rows[0] && rows[0].ok === 1;
    console.log(ok ? "DB_CONNECT_OK" : "DB_CONNECT_UNKNOWN");

    const [tables] = await db.query("SHOW TABLES");
    console.log(`TABLES_COUNT=${tables.length}`);
  } catch (err) {
    console.error("DB_CONNECT_ERROR", err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try {
      await db.end();
    } catch (_) {
      // ignore pool close errors
    }
  }
}

main();
