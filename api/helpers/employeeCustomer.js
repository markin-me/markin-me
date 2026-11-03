'use strict';

const { normalizePhone } = require('../helpers');

function fail(code) {
  return Object.assign(new Error(code), { code });
}

// Caller owns the transaction. Tenant lock serializes create/save/backfill/link.
async function ensureEmployeeCustomer(conn, tenantId, employeeId, proof = null) {
  if (!Number.isSafeInteger(Number(tenantId)) || Number(tenantId) <= 0
      || !Number.isSafeInteger(Number(employeeId)) || Number(employeeId) <= 0) throw fail('INVALID_EMPLOYEE_CUSTOMER_SCOPE');
  const [tenants] = await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE', [tenantId]);
  if (!tenants.length) throw fail('TENANT_NOT_FOUND');
  const [employees] = await conn.query(
    'SELECT id, name, phone FROM app_users WHERE tenant_id=? AND id=? FOR UPDATE', [tenantId, employeeId]
  );
  if (!employees.length) throw fail('EMPLOYEE_NOT_FOUND');
  const employee = employees[0];
  const [links] = await conn.query(
    'SELECT * FROM auth_employee_customer_links WHERE tenant_id=? AND employee_id=? FOR UPDATE', [tenantId, employeeId]
  );
  let customerId = Number(links[0]?.customer_id || 0);
  if (!customerId) {
    const [owned] = await conn.query(
      `SELECT DISTINCT c.id FROM auth_account_links e
       JOIN auth_account_messenger_links em ON em.account_link_id=e.id
       JOIN auth_messenger_channels ch ON ch.id=em.channel_id AND ch.revoked_at IS NULL
       JOIN auth_account_messenger_links cm ON cm.channel_id=ch.id
       JOIN auth_account_links ca ON ca.id=cm.account_link_id AND ca.tenant_id=e.tenant_id AND ca.account_type='customer'
       JOIN cust_customers c ON c.tenant_id=ca.tenant_id AND c.id=ca.account_id AND c.is_active=1
       WHERE e.tenant_id=? AND e.account_type='employee' AND e.account_id=?
         AND ca.person_id=e.person_id
         AND NOT EXISTS (SELECT 1 FROM auth_employee_customer_links l WHERE l.tenant_id=c.tenant_id AND l.customer_id=c.id)
       `, [tenantId, employeeId]
    );
    if (owned.length === 1) customerId = Number(owned[0].id);
    if (!customerId) {
      // An administrator-entered employee phone is not proof of customer ownership.
      let initialPhone=null;
      if(proof?.requirePhone){
        initialPhone=normalizePhone(proof.phone);
        if(!/^\d{10,15}$/.test(initialPhone || ''))throw fail('CONTACT_REQUIRED');
        const [candidates]=await conn.query('SELECT phone FROM cust_customers WHERE tenant_id=? AND phone IS NOT NULL FOR UPDATE',[tenantId]);
        if(candidates.some(c=>normalizePhone(c.phone)===initialPhone))throw fail('CUSTOMER_OWNERSHIP_PROOF_REQUIRED');
      }
      const [created] = await conn.query(
        `INSERT INTO cust_customers (tenant_id, phone, name, is_active, registration_date)
         VALUES (?, ?, ?, 1, CURDATE())`, [tenantId, initialPhone, String(employee.name || 'Клиент').slice(0, 100)]
      );
      customerId = Number(created.insertId);
    }
    await conn.query(
      'INSERT INTO auth_employee_customer_links (tenant_id, employee_id, customer_id) VALUES (?, ?, ?)',
      [tenantId, employeeId, customerId]
    );
    if (owned.length > 1) await conn.query(
      `UPDATE auth_employee_customer_links SET conflict_code='MULTIPLE_CONFIRMED_CUSTOMERS' WHERE tenant_id=? AND employee_id=?`,
      [tenantId, employeeId]
    );
    if (!owned.length && normalizePhone(employee.phone)) {
      const [phoneCandidates] = await conn.query(
        'SELECT id, phone FROM cust_customers WHERE tenant_id=? AND id<>? AND phone IS NOT NULL', [tenantId, customerId]
      );
      if (phoneCandidates.some(row => normalizePhone(row.phone) === normalizePhone(employee.phone))) await conn.query(
        `UPDATE auth_employee_customer_links SET conflict_code='UNVERIFIED_PHONE_MATCH' WHERE tenant_id=? AND employee_id=?`,
        [tenantId, employeeId]
      );
    }
  }
  if (!proof) return { customerId };
  const provider = proof.provider;
  const providerUserId = String(proof.providerUserId || '');
  if (!['tg', 'max'].includes(provider) || !providerUserId) throw fail('INVALID_EMPLOYEE_CUSTOMER_PROOF');
  // This relation must already have been authorized by the employee CRM session.
  const [accounts] = await conn.query(
    `SELECT a.person_id, m.channel_id FROM auth_account_links a
     JOIN auth_account_messenger_links m ON m.account_link_id=a.id
     JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.revoked_at IS NULL
     WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id=?
       AND c.provider=? AND c.provider_user_id=? FOR UPDATE`,
    [tenantId, employeeId, provider, providerUserId]
  );
  if (accounts.length !== 1) throw fail('EMPLOYEE_MESSENGER_PROOF_REQUIRED');
  const account = accounts[0];
  const phone = proof.phone == null ? null : normalizePhone(proof.phone);
  if (phone !== null && !/^\d{10,15}$/.test(phone)) throw fail('INVALID_VERIFIED_PHONE');
  const [customers] = await conn.query(
    `SELECT id, phone, telegram_user_id, max_user_id FROM cust_customers
     WHERE tenant_id=? AND id=? FOR UPDATE`, [tenantId, customerId]
  );
  if (!customers.length) throw fail('EMPLOYEE_CUSTOMER_NOT_FOUND');
  const customer = customers[0];
  const conflict = async (code) => {
    await conn.query(
      `UPDATE auth_employee_customer_links SET conflict_code=?, verified_phone=COALESCE(?, verified_phone),
       phone_verified_at=IF(? IS NULL, phone_verified_at, NOW()), updated_at=NOW()
       WHERE tenant_id=? AND employee_id=?`, [code, phone, phone, tenantId, employeeId]
    );
    return { customerId, conflict: code };
  };
  // Never reassign a historical customer or silently replace a messenger identity.
  const column = provider === 'tg' ? 'telegram_user_id' : 'max_user_id';
  if (customer[column] && String(customer[column]) !== providerUserId) return conflict('MESSENGER_IDENTITY_CONFLICT');
  const [otherIdentities] = await conn.query(
    `SELECT customer_id FROM cust_customer_auth_identities
     WHERE tenant_id=? AND provider=? AND provider_user_id=? AND customer_id<>? FOR UPDATE`,
    [tenantId, provider, providerUserId, customerId]
  );
  const [otherCustomers] = await conn.query(
    `SELECT id FROM cust_customers WHERE tenant_id=? AND ${column}=? AND id<>? FOR UPDATE`,
    [tenantId, providerUserId, customerId]
  );
  if (otherIdentities.length || otherCustomers.length) return conflict('EXISTING_CUSTOMER_REVIEW_REQUIRED');
  if (phone) {
    // Check normalized legacy forms too; do not rely solely on the raw unique index.
    const [phoneRows] = await conn.query('SELECT id, phone FROM cust_customers WHERE tenant_id=? AND phone IS NOT NULL FOR UPDATE', [tenantId]);
    if (phoneRows.some(row => Number(row.id) !== customerId && normalizePhone(row.phone) === phone)) {
      return conflict('PHONE_OWNERSHIP_REVIEW_REQUIRED');
    }
    if (customer.phone && normalizePhone(customer.phone) !== phone) return conflict('PHONE_CHANGE_REVIEW_REQUIRED');
  }
  const [customerAccounts] = await conn.query(
    `SELECT id, person_id FROM auth_account_links
     WHERE tenant_id=? AND account_type='customer' AND account_id=? FOR UPDATE`, [tenantId, customerId]
  );
  if (customerAccounts[0] && Number(customerAccounts[0].person_id) !== Number(account.person_id)) return conflict('ACCOUNT_PERSON_CONFLICT');
  let customerAccountId = Number(customerAccounts[0]?.id || 0);
  if (!customerAccountId) {
    const [created] = await conn.query(
      `INSERT INTO auth_account_links (person_id, tenant_id, account_type, account_id, linked_at)
       VALUES (?, ?, 'customer', ?, NOW())`, [account.person_id, tenantId, customerId]
    );
    customerAccountId = Number(created.insertId);
  }
  await conn.query(
    `INSERT INTO auth_account_messenger_links (account_link_id, channel_id, provider, verified_at)
     VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id), verified_at=NOW()`,
    [customerAccountId, account.channel_id, provider]
  );
  await conn.query(
    `UPDATE cust_customers SET ${column}=?, phone=COALESCE(?, phone),
     phone_verified_at=IF(? IS NULL, phone_verified_at, NOW()), updated_at=NOW() WHERE tenant_id=? AND id=?`,
    [providerUserId, phone, phone, tenantId, customerId]
  );
  await conn.query(
    `INSERT INTO cust_customer_auth_identities (tenant_id, customer_id, provider, provider_user_id, linked_at)
     VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE provider_user_id=VALUES(provider_user_id), linked_at=NOW()`,
    [tenantId, customerId, provider, providerUserId]
  );
  await conn.query(
    `UPDATE auth_employee_customer_links SET verified_phone=COALESCE(?, verified_phone),
     phone_verified_at=IF(? IS NULL, phone_verified_at, NOW()), updated_at=NOW()
     WHERE tenant_id=? AND employee_id=?`, [phone, phone, tenantId, employeeId]
  );
  return { customerId };
}

// Call only from the authenticated tenant Telegram webhook, never from browser input.
async function confirmEmployeeTelegramPhone(db, tenantId, update) {
  const message = update?.message;
  if (message?.chat?.type !== 'private' || message.from?.is_bot
      || !message.contact?.user_id || String(message.contact.user_id) !== String(message.from?.id)
      || String(message.chat.id) !== String(message.from.id)) return { verified: false };
  const phone = normalizePhone(message.contact.phone_number);
  if (!/^\d{10,15}$/.test(phone)) return { verified: false };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE', [tenantId]);
    const [employees] = await conn.query(
      `SELECT DISTINCT a.account_id FROM auth_account_links a
       JOIN auth_account_messenger_links m ON m.account_link_id=a.id
       JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.revoked_at IS NULL
       WHERE a.tenant_id=? AND a.account_type='employee' AND c.provider='tg' AND c.provider_user_id=?`,
      [tenantId, String(message.from.id)]
    );
    for (const employee of employees) await ensureEmployeeCustomer(conn, tenantId, Number(employee.account_id), {
      provider: 'tg', providerUserId: String(message.from.id), phone,
    });
    await conn.commit();
    return { verified: true, employees: employees.length };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

module.exports = { ensureEmployeeCustomer, confirmEmployeeTelegramPhone };
