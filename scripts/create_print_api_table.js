const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const db = require(path.join(__dirname, "..", "db"));

async function main() {
  const sql = `
    CREATE TABLE IF NOT EXISTS print_api_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      store_id INT NOT NULL,
      token VARCHAR(64) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_used_at DATETIME NULL,
      UNIQUE KEY uniq_token (token),
      UNIQUE KEY uniq_store (tenant_id, store_id),
      INDEX idx_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  try {
    await db.query(sql);
    console.log("PRINT_API_TABLE_OK");
  } catch (err) {
    console.error("PRINT_API_TABLE_ERROR", err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try {
      await db.end();
    } catch (_) {}
  }
}

main();
