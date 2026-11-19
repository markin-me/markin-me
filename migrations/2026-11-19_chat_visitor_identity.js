'use strict';

module.exports = async function migrateChatVisitorIdentity(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('CHAT_VISITOR_DB_SCOPE_REFUSED');
  await db.query(`CREATE TABLE IF NOT EXISTS chat_visitor_identities (
    tenant_id INT NOT NULL,
    token_hash BINARY(32) NOT NULL,
    client_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    claimed_at DATETIME(6) NULL,
    PRIMARY KEY (tenant_id, token_hash),
    UNIQUE KEY uq_chat_visitor_client (tenant_id, client_id),
    KEY idx_chat_visitor_expiry (expires_at)
  ) ENGINE=InnoDB`);
  const [columns]=await db.query('SHOW COLUMNS FROM chat_push_subscriptions');
  if(!columns.some(column=>column.Field==='customer_session_id')){
    await db.query('ALTER TABLE chat_push_subscriptions ADD COLUMN customer_session_id BIGINT NULL');
  }
};
