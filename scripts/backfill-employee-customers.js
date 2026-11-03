'use strict';

// Default is read-only preview. No migration is run by this command.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');
const { ensureEmployeeCustomer } = require('../api/helpers/employeeCustomer');

async function main() {
  if (process.env.DB_NAME !== 'a1186497_test') throw new Error('BACKFILL_DB_SCOPE_REFUSED');
  const tenantId = Number(process.argv.find(arg => arg.startsWith('--tenant='))?.slice(9));
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) throw new Error('EXPLICIT_TENANT_REQUIRED');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const [[table]] = await conn.query(`SELECT COUNT(*) AS count FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auth_employee_customer_links'`);
    const migrationApplied = Number(table.count) > 0;
    if (!migrationApplied && process.argv.includes('--apply')) throw new Error('EMPLOYEE_CUSTOMER_MIGRATION_REQUIRED');
    const [rows] = await conn.query(migrationApplied ? `SELECT u.id FROM app_users u
      LEFT JOIN auth_employee_customer_links l ON l.tenant_id=u.tenant_id AND l.employee_id=u.id
      WHERE u.tenant_id=? AND l.employee_id IS NULL ORDER BY u.id`
      : 'SELECT id FROM app_users WHERE tenant_id=? ORDER BY id', [tenantId]);
    console.log(JSON.stringify({ tenantId, migrationApplied, missingLinks: rows.length, mode: process.argv.includes('--apply') ? 'apply' : 'preview' }));
    if (!process.argv.includes('--apply')) return;
    // One tenant transaction; a failed row rolls back the entire batch.
    await conn.beginTransaction();
    try {
      for (const row of rows) await ensureEmployeeCustomer(conn, tenantId, Number(row.id));
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; }
    console.log('BACKFILL_COMPLETE');
  } finally { await conn.end(); }
}

main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
