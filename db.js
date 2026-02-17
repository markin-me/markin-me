require("dotenv").config();
const mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test_shop",
  port: process.env.DB_PORT || 3306,
  charset: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

pool.on("connection", (conn) => {
  conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
});

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

module.exports = pool.promise();
