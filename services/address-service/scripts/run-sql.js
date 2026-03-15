require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error('SQL_FILE_REQUIRED');
  }
  const fullPath = path.resolve(process.cwd(), file);
  const sql = fs.readFileSync(fullPath, 'utf8');
  await db.query(sql);
  await db.end();
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
