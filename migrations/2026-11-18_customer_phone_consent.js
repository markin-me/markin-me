'use strict';

module.exports = async function migrateCustomerPhoneConsent(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('CUSTOMER_CONSENT_DB_SCOPE_REFUSED');
  const [columns] = await db.query('SHOW COLUMNS FROM auth_browser_requests');
  for (const name of ['phone_choice_at', 'phone_consent_at', 'phone_timeout_notified_at', 'login_notified_at', 'notice_retry_at']) {
    if (!columns.some(column => column.Field === name)) {
      await db.query(`ALTER TABLE auth_browser_requests ADD COLUMN ${name} DATETIME NULL`);
      if (name === 'login_notified_at') await db.query("UPDATE auth_browser_requests SET login_notified_at=NOW() WHERE state='consumed'");
    }
  }
  if (!columns.some(column => column.Field === 'notice_attempts')) {
    await db.query('ALTER TABLE auth_browser_requests ADD COLUMN notice_attempts TINYINT NOT NULL DEFAULT 0');
  }
  if (!columns.some(column => column.Field === 'result_session_id')) {
    await db.query('ALTER TABLE auth_browser_requests ADD COLUMN result_session_id BIGINT NULL');
  }
  if (!columns.some(column => column.Field === 'contact_confirmation_required')) {
    await db.query('ALTER TABLE auth_browser_requests ADD COLUMN contact_confirmation_required TINYINT NOT NULL DEFAULT 0');
  }
};
