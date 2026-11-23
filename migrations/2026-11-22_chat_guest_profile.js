'use strict';

// Explicit migration only; never invoked on application startup.
module.exports = async function migrateChatGuestProfile(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('CHAT_GUEST_PROFILE_DB_SCOPE_REFUSED');
  const [columns] = await db.query('SHOW COLUMNS FROM chat_visitor_identities');
  if (!columns.some(column => column.Field === 'guest_session_hash')) {
    await db.query('ALTER TABLE chat_visitor_identities ADD COLUMN guest_session_hash BINARY(32) NULL');
  }
};
