const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const db = require(path.join(__dirname, "..", "db"));

async function scalar(sql) {
  const [rows] = await db.query(sql);
  const row = rows[0] || {};
  const key = Object.keys(row)[0];
  return Number(row[key] || 0);
}

async function main() {
  try {
    const checks = [
      {
        name: "sessions_total",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_sessions",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_sessions",
      },
      {
        name: "sessions_active",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_sessions WHERE is_active=1",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_sessions WHERE is_active=1",
      },
      {
        name: "max_link_tokens",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_max_link_tokens",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_tokens WHERE provider='max' AND purpose='link'",
      },
      {
        name: "max_login_tokens",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_max_login_tokens",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_tokens WHERE provider='max' AND purpose='login'",
      },
      {
        name: "max_pending_tokens",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_max_pending",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_tokens WHERE provider='max' AND purpose='pending'",
      },
      {
        name: "tg_link_tokens",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_tg_link_tokens",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_tokens WHERE provider='tg' AND purpose='link'",
      },
      {
        name: "tg_login_tokens",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customer_tg_login_tokens",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_tokens WHERE provider='tg' AND purpose='login'",
      },
      {
        name: "identities_max_from_customers",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customers WHERE max_user_id IS NOT NULL AND max_user_id<>''",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_identities WHERE provider='max'",
      },
      {
        name: "identities_tg_from_customers",
        oldSql: "SELECT COUNT(*) AS c FROM cust_customers WHERE telegram_user_id IS NOT NULL",
        newSql: "SELECT COUNT(*) AS c FROM cust_customer_auth_identities WHERE provider='tg'",
      },
    ];

    let mismatches = 0;
    for (const item of checks) {
      const oldCount = await scalar(item.oldSql);
      const newCount = await scalar(item.newSql);
      const ok = newCount >= oldCount;
      if (!ok) mismatches += 1;
      console.log(`${item.name}: old=${oldCount} new=${newCount} status=${ok ? "OK" : "MISMATCH"}`);
    }

    if (mismatches > 0) {
      console.log(`AUTH_MIGRATION_CHECK_FAILED mismatches=${mismatches}`);
      process.exitCode = 1;
    } else {
      console.log("AUTH_MIGRATION_CHECK_OK");
    }
  } catch (err) {
    console.error("AUTH_MIGRATION_CHECK_ERROR", err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    try {
      await db.end();
    } catch (_) {
      // ignore
    }
  }
}

main();
