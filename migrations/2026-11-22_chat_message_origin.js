'use strict';

// Explicit migration only; no startup DDL and no message/history rewrite.
module.exports = async function migrateChatMessageOrigin(db) {
  const [[scope]]=await db.query('SELECT DATABASE() name');
  if(scope.name!=='a1186497_test')throw new Error('CHAT_MESSAGE_ORIGIN_DB_SCOPE_REFUSED');
  const [columns]=await db.query('SHOW COLUMNS FROM chat_messages');
  const additions=[];
  if(!columns.some(column=>column.Field==='source_client_id'))additions.push('ADD COLUMN source_client_id BIGINT UNSIGNED NULL');
  if(!columns.some(column=>column.Field==='source_message_id'))additions.push('ADD COLUMN source_message_id VARCHAR(120) NULL');
  if(additions.length)await db.query(`ALTER TABLE chat_messages ${additions.join(',')}`);
};
