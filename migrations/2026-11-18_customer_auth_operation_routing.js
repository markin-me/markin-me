'use strict';

module.exports = async function migrateCustomerAuthOperationRouting(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('CUSTOMER_AUTH_ROUTING_DB_SCOPE_REFUSED');

  const columns = {
    auth_browser_requests: {
      customer_declined_at: 'DATETIME NULL',
      customer_decline_notified_at: 'DATETIME NULL',
      customer_contact_prompt_at: 'DATETIME NULL',
      customer_choice_prompt_at: 'DATETIME NULL',
      customer_final_prompt_at: 'DATETIME NULL',
    },
    auth_verification_challenges: {
      customer_session_id: 'BIGINT NULL',
      customer_contact_phone: 'VARCHAR(15) NULL',
      customer_contact_fenced: 'TINYINT NOT NULL DEFAULT 0',
      customer_prompt_at: 'DATETIME NULL',
    },
  };
  for (const [table, definitions] of Object.entries(columns)) {
    const [existing] = await db.query(`SHOW COLUMNS FROM ${table}`);
    for (const [name, type] of Object.entries(definitions)) {
      if (!existing.some(column => column.Field === name)) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      }
    }
  }

  const indexes = {
    auth_browser_requests: ['idx_browser_messenger_user', 'tenant_id, provider, provider_user_id, account_type, state'],
    auth_verification_challenges: ['idx_challenge_messenger_user', 'tenant_id, provider, completed_provider_user_id, account_type, purpose'],
  };
  for (const [table, [name, fields]] of Object.entries(indexes)) {
    const [existing] = await db.query(`SHOW INDEX FROM ${table}`);
    if (!existing.some(index => index.Key_name === name)) {
      await db.query(`ALTER TABLE ${table} ADD INDEX ${name} (${fields})`);
    }
  }
};
