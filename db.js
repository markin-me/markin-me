require("dotenv").config();
const mysql = require("mysql2");
const { AsyncLocalStorage } = require("async_hooks");

const requestMetricsStore = new AsyncLocalStorage();
const PERF_CONSOLE_LOGS_ENABLED = String(process.env.ENABLE_PERF_LOGS || "").trim() === "1";
const DB_CONNECTION_LIMIT = Math.max(
  1,
  Number(process.env.DB_CONNECTION_LIMIT || process.env.DB_POOL_CONNECTION_LIMIT || 16) || 16
);
const DB_SLOW_QUERY_MS = Math.max(0, Number(process.env.DB_SLOW_QUERY_MS || 400) || 400);
const DB_SLOW_ACQUIRE_MS = Math.max(0, Number(process.env.DB_SLOW_ACQUIRE_MS || 150) || 150);
const SQL_PREVIEW_MAX_LEN = Math.max(40, Number(process.env.DB_SQL_PREVIEW_MAX_LEN || 180) || 180);
const DB_TRANSIENT_RETRY_COUNT = Math.max(0, Number(process.env.DB_TRANSIENT_RETRY_COUNT || 1) || 1);
const DB_TRANSIENT_RETRY_DELAY_MS = Math.max(0, Number(process.env.DB_TRANSIENT_RETRY_DELAY_MS || 80) || 80);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test_shop",
  port: process.env.DB_PORT || 3306,
  charset: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: 0,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

pool.on("connection", (conn) => {
  conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
  conn.on("error", (err) => {
    if (!isTransientDbPoolError(err)) return;
    try {
      conn.destroy();
    } catch {}
  });
});

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function createEmptyRequestMetrics() {
  return {
    dbQueryCount: 0,
    dbQueryMs: 0,
    dbWaitCount: 0,
    dbWaitMs: 0,
  };
}

function getCurrentRequestMetrics() {
  return requestMetricsStore.getStore() || null;
}

function withRequestMetrics(metrics, fn) {
  const store = metrics && typeof metrics === "object" ? metrics : createEmptyRequestMetrics();
  return requestMetricsStore.run(store, fn);
}

function addMetric(key, value) {
  const store = getCurrentRequestMetrics();
  if (!store) return;
  const current = Number(store[key] || 0);
  store[key] = current + (Number(value) || 0);
}

function incrementMetric(key) {
  addMetric(key, 1);
}

function normalizeSqlPreview(sql) {
  let raw = sql;
  if (Array.isArray(raw)) raw = raw[0];
  if (raw && typeof raw === "object" && typeof raw.sql === "string") {
    raw = raw.sql;
  }
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "[empty sql]";
  if (text.length <= SQL_PREVIEW_MAX_LEN) return text;
  return `${text.slice(0, SQL_PREVIEW_MAX_LEN - 3)}...`;
}

function logSlowOperation(kind, durationMs, sql) {
  if (!PERF_CONSOLE_LOGS_ENABLED) return;
  const safeDuration = Math.max(0, Number(durationMs) || 0).toFixed(1);
  const preview = normalizeSqlPreview(sql);
  console.warn(`[db] slow ${kind} ${safeDuration}ms :: ${preview}`);
}

function isTransientDbPoolError(err) {
  const code = String(err?.code || "").trim().toUpperCase();
  const sqlState = String(err?.sqlState || "").trim().toUpperCase();
  if (
    code === "PROTOCOL_CONNECTION_LOST"
    || code === "ECONNRESET"
    || code === "ECONNREFUSED"
    || code === "ETIMEDOUT"
    || code === "EPIPE"
    || code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR"
    || code === "PROTOCOL_ENQUEUE_AFTER_QUIT"
    || code === "ER_NET_READ_INTERRUPTED"
  ) {
    return true;
  }
  if (sqlState === "08S01") {
    return true;
  }
  const message = String(err?.message || err?.sqlMessage || "").toLowerCase();
  return (
    message.includes("packets out of order")
    || message.includes("timeout reading communication packets")
    || message.includes("reading communication packets")
    || message.includes("server closed the connection")
    || message.includes("connection lost")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithPoolTransientRetry(operation, sql, label) {
  const maxRetries = DB_TRANSIENT_RETRY_COUNT;
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (err) {
      if (label !== "pool" || attempt >= maxRetries || !isTransientDbPoolError(err)) {
        throw err;
      }
      attempt += 1;
      if (PERF_CONSOLE_LOGS_ENABLED) {
        console.warn(`[db] transient ${label} retry ${attempt}/${maxRetries} :: ${normalizeSqlPreview(sql)}`);
      }
      await sleep(DB_TRANSIENT_RETRY_DELAY_MS * attempt);
    }
  }
}

function wrapQueryable(target, label) {
  if (!target || target.__perfWrapped === true) return target;

  if (typeof target.query === "function") {
    const originalQuery = target.query.bind(target);
    target.query = async function instrumentedQuery(sql, ...args) {
      const startedAt = nowMs();
      try {
        return await runWithPoolTransientRetry(
          () => originalQuery(sql, ...args),
          sql,
          label
        );
      } finally {
        const durationMs = nowMs() - startedAt;
        incrementMetric("dbQueryCount");
        addMetric("dbQueryMs", durationMs);
        if (durationMs >= DB_SLOW_QUERY_MS) {
          logSlowOperation(`${label}.query`, durationMs, sql);
        }
      }
    };
  }

  if (typeof target.execute === "function") {
    const originalExecute = target.execute.bind(target);
    target.execute = async function instrumentedExecute(sql, ...args) {
      const startedAt = nowMs();
      try {
        return await runWithPoolTransientRetry(
          () => originalExecute(sql, ...args),
          sql,
          label
        );
      } finally {
        const durationMs = nowMs() - startedAt;
        incrementMetric("dbQueryCount");
        addMetric("dbQueryMs", durationMs);
        if (durationMs >= DB_SLOW_QUERY_MS) {
          logSlowOperation(`${label}.execute`, durationMs, sql);
        }
      }
    };
  }

  Object.defineProperty(target, "__perfWrapped", {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return target;
}

const promisePool = wrapQueryable(pool.promise(), "pool");
const originalGetConnection = promisePool.getConnection.bind(promisePool);

promisePool.getConnection = async function instrumentedGetConnection(...args) {
  const startedAt = nowMs();
  const connection = await runWithPoolTransientRetry(
    () => originalGetConnection(...args),
    "[pool.acquire]",
    "pool"
  );
  const waitMs = nowMs() - startedAt;

  incrementMetric("dbWaitCount");
  addMetric("dbWaitMs", waitMs);

  if (PERF_CONSOLE_LOGS_ENABLED && waitMs >= DB_SLOW_ACQUIRE_MS) {
    console.warn(`[db] slow acquire ${waitMs.toFixed(1)}ms`);
  }

  return wrapQueryable(connection, "connection");
};

promisePool.withRequestMetrics = withRequestMetrics;
promisePool.getCurrentRequestMetrics = getCurrentRequestMetrics;
promisePool.createEmptyRequestMetrics = createEmptyRequestMetrics;

pool.getConnection((err, conn) => {
  if (err) {
    console.error("DB connection error:", err.message);
    console.error(`  - host: ${process.env.DB_HOST || "not set"}`);
    console.error(`  - port: ${process.env.DB_PORT || 3306}`);
    console.error(`  - user: ${process.env.DB_USER || "not set"}`);
    console.error(`  - database: ${process.env.DB_NAME || "not set"}`);
    return;
  }
  console.log("MySQL connected");
  conn.release();
});

module.exports = promisePool;
