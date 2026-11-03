'use strict';
const fs = require('fs');
const path = require('path');

// Explicit runner invocation only. Never called by server startup.
module.exports = async function migrateBrowserContactProof(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('BROWSER_AUTH_DB_SCOPE_REFUSED');
  const [columns] = await db.query('SHOW COLUMNS FROM auth_browser_requests');
  const [indexes] = await db.query('SHOW INDEX FROM auth_browser_requests');
  const ddl = fs.readFileSync(path.join(__dirname, '2026-10-26_browser_contact_proof.sql'), 'utf8');
  const additions = [];
  for (const line of ddl.split(/\r?\n/)) {
    const match = /^\s*ADD (COLUMN|INDEX) ([a-z_]+) (.+?)[,;]?$/.exec(line);
    if (!match) continue;
    const [, kind, name, definition] = match;
    if (kind === 'COLUMN') {
      const existing = columns.find(c => c.Field === name);
      if (existing) {
        const expectedType = definition.split(/\s+(?:NULL|NOT NULL)/i)[0].toLowerCase();
        const actualType = String(existing.Type).toLowerCase().replace(/\b(bigint|int)\(\d+\)/g, '$1');
        if (actualType !== expectedType || existing.Null !== (/NOT NULL/i.test(definition) ? 'NO' : 'YES')) {
          throw new Error(`BROWSER_AUTH_COLUMN_INCOMPATIBLE:${name}`);
        }
        if(name==='ownership_status' && existing.Default!=='none')throw new Error('BROWSER_AUTH_DEFAULT_INCOMPATIBLE:ownership_status');
      } else additions.push(`ADD COLUMN ${name} ${definition}`);
    } else {
      const existing = indexes.filter(i => i.Key_name === name).sort((a,b) => a.Seq_in_index-b.Seq_in_index);
      if (existing.length) {
        if (`(${existing.map(i => i.Column_name).join(',')})` !== definition.replace(/\s/g, '')) throw new Error(`BROWSER_AUTH_INDEX_INCOMPATIBLE:${name}`);
      } else additions.push(`ADD INDEX ${name} ${definition}`);
    }
  }
  if ((ddl.match(/^\s*ADD COLUMN /gm) || []).length !== 11) throw new Error('BROWSER_AUTH_MIGRATION_DEFINITION_INVALID');
  if ((ddl.match(/^\s*ADD INDEX /gm) || []).length !== 2) throw new Error('BROWSER_AUTH_MIGRATION_DEFINITION_INVALID');
  if (additions.length) await db.query(`ALTER TABLE auth_browser_requests ${additions.join(', ')}`);
};
