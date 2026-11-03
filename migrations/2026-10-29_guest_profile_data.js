'use strict';

// Explicit test-only migration. Never run on application startup.
module.exports = async function migrateGuestProfileData(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('GUEST_PROFILE_DB_SCOPE_REFUSED');
  const fs = require('fs');
  const path = require('path');
  const mysql = require('mysql2');
  const conn = await db.getConnection();
  const statements = ['-- Guest profile snapshot', 'USE `a1186497_test`;'];
  let count;
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [[ddl]] = await conn.query('SHOW CREATE TABLE cust_guest_sessions');
    statements.push(ddl['Create Table'] + ';');
    const [rows] = await conn.query({ sql: 'SELECT * FROM cust_guest_sessions', dateStrings: true });
    count = rows.length;
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map(key => mysql.escape(row[key] && typeof row[key] === 'object' && !Buffer.isBuffer(row[key]) ? JSON.stringify(row[key]) : row[key]));
      statements.push(`INSERT INTO cust_guest_sessions (${columns.map(key => mysql.escapeId(key)).join(',')}) VALUES (${values.join(',')});`);
    }
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
  const directory = path.resolve(__dirname, '../tmp/backups');
  fs.mkdirSync(directory, { recursive: true });
  const backup = path.join(directory, `a1186497_test_guest_profile_${Date.now()}.sql`);
  fs.writeFileSync(backup, statements.join('\n') + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (!fs.statSync(backup).size) throw new Error('GUEST_PROFILE_BACKUP_FAILED');
  for (const [name, definition, type] of [
    ['name', 'VARCHAR(100) NULL', 'varchar(100)'],
    ['photo', 'VARCHAR(255) NULL', 'varchar(255)'],
    ['photo_set', 'TINYINT NOT NULL DEFAULT 0', 'tinyint'],
  ]) {
    const [columns] = await db.query('SHOW COLUMNS FROM cust_guest_sessions LIKE ?', [name]);
    if (!columns.length) await db.query(`ALTER TABLE cust_guest_sessions ADD COLUMN ${mysql.escapeId(name)} ${definition}`);
    else if (!columns[0].Type.startsWith(type)) throw new Error('GUEST_PROFILE_SCHEMA_INCOMPATIBLE');
  }
  return { backup, guestSessionsBackedUp: count };
};
