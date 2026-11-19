'use strict';

module.exports = async function migrateChatRetention(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('CHAT_RETENTION_DB_SCOPE_REFUSED');
  const [columns] = await db.query('SHOW COLUMNS FROM chat_visitor_identities');
  if (!columns.some(column => column.Field === 'is_client_chat')) {
    await db.query('ALTER TABLE chat_visitor_identities ADD COLUMN is_client_chat TINYINT(1) NULL');
  }
  if (!columns.some(column => column.Field === 'active_session_id')) {
    await db.query('ALTER TABLE chat_visitor_identities ADD COLUMN active_session_id BIGINT NULL');
  }
  if (!columns.some(column => column.Field === 'claimed_customer_id')) {
    await db.query('ALTER TABLE chat_visitor_identities ADD COLUMN claimed_customer_id BIGINT NULL');
  }
  await db.query('ALTER TABLE chat_visitor_identities MODIFY expires_at DATETIME(6) NULL');
  await db.query('UPDATE chat_visitor_identities SET expires_at=NULL WHERE claimed_at IS NULL AND expires_at IS NOT NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS chat_attachment_gc (
    tenant_id BIGINT UNSIGNED NOT NULL,
    path VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (tenant_id,path)
  ) ENGINE=InnoDB`);
};
