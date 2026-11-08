const crypto = require('crypto');
const { promisify } = require('util');
const { ensureEmployeeCustomer } = require('./helpers/employeeCustomer');
const {
  ensureBrowserOperation,
  ensureChallengeOperation,
  markOperation,
  operationId: cleanupOperationId,
} = require('./messengerCleanup');

const scryptAsync = promisify(crypto.scrypt);
const LINK_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 3 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_ACCOUNT_REQUESTS_PER_WINDOW = 5;
const MAX_IP_REQUESTS_PER_WINDOW = 20;
const REQUEST_WINDOW_MINUTES = 15;
const ACCOUNT_TYPES = new Set(['customer', 'employee']);
const PROVIDERS = new Set(['max', 'tg']);
const CODE_PURPOSES = new Set(['login', 'password_reset', 'phone_verify']);

class MessengerAuthError extends Error {
  constructor(code, status = 400, details = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeScope(scope) {
  const tenantId = Number(scope?.tenantId || 0);
  const accountId = Number(scope?.accountId || 0);
  const accountType = String(scope?.accountType || '').trim().toLowerCase();
  if (!(tenantId > 0) || !(accountId > 0) || !ACCOUNT_TYPES.has(accountType)) {
    throw new MessengerAuthError('INVALID_ACCOUNT_SCOPE', 400);
  }
  return { tenantId, accountId, accountType };
}

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!PROVIDERS.has(value)) throw new MessengerAuthError('BAD_PROVIDER', 400);
  return value;
}

function randomPublicId() {
  return crypto.randomBytes(32).toString('base64url');
}

function randomLinkToken() {
  return `a_${crypto.randomBytes(30).toString('base64url')}`;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest();
}

function getCodePepper() {
  const value = String(process.env.AUTH_CODE_PEPPER || process.env.JWT_SECRET || '').trim();
  if (value.length < 32 || value === 'your-secret-key-change-in-production') {
    throw new MessengerAuthError('AUTH_CODE_PEPPER_REQUIRED', 503);
  }
  return value;
}

function ipHash(ipAddress) {
  const raw = String(ipAddress || '').trim();
  if (!raw) return null;
  return crypto.createHmac('sha256', getCodePepper()).update(raw, 'utf8').digest();
}

async function hashCode(code, salt, scopeKey) {
  const material = `${getCodePepper()}\u0000${scopeKey}\u0000${String(code || '')}`;
  return scryptAsync(material, salt, 32, { N: 16384, r: 8, p: 1 });
}

function safeEqual(left, right) {
  return Buffer.isBuffer(left) && Buffer.isBuffer(right)
    && left.length === right.length
    && crypto.timingSafeEqual(left, right);
}

function connectionDatabase(connection) {
  // The outer advisory-lock operation owns this connection until its finally block.
  // Nested account transactions may finish, but must not return it to the pool.
  const borrowed = {
    query: connection.query.bind(connection),
    beginTransaction: connection.beginTransaction.bind(connection),
    commit: connection.commit.bind(connection),
    rollback: connection.rollback.bind(connection),
    release() {},
  };
  return { query: borrowed.query, getConnection: async () => borrowed };
}

function maskProviderUserId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 4) return '••••';
  return `••••${raw.slice(-4)}`;
}

async function assertAccountActive(queryable, scope) {
  if (scope.accountType === 'customer') {
    const [rows] = await queryable.query(
      'SELECT id FROM cust_customers WHERE tenant_id=? AND id=? AND is_active=1 LIMIT 1',
      [scope.tenantId, scope.accountId]
    );
    if (!rows.length) throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE', 403);
    return;
  }
  const [rows] = await queryable.query(
    `SELECT u.id
     FROM app_users u
     JOIN ten_tenants t ON t.id=u.tenant_id
     WHERE u.tenant_id=? AND u.id=? AND u.is_active=1 AND u.employee_status='active' AND t.is_active=1
     LIMIT 1`,
    [scope.tenantId, scope.accountId]
  );
  if (!rows.length) throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE', 403);
}

async function loadAccountLink(queryable, scope, lock = false) {
  const [rows] = await queryable.query(
    `SELECT id, person_id, linked_at
     FROM auth_account_links
     WHERE tenant_id=? AND account_type=? AND account_id=?
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [scope.tenantId, scope.accountType, scope.accountId]
  );
  return rows[0] || null;
}

async function loadLegacyCustomerChannels(queryable, scope) {
  if (scope.accountType !== 'customer') return [];
  const [identityRows] = await queryable.query(
    `SELECT provider, provider_user_id, linked_at
     FROM cust_customer_auth_identities
     WHERE tenant_id=? AND customer_id=? AND provider_user_id IS NOT NULL AND provider_user_id<>''`,
    [scope.tenantId, scope.accountId]
  );
  const byProvider = new Map();
  for (const row of identityRows || []) {
    const provider = String(row.provider || '').trim().toLowerCase();
    const providerUserId = String(row.provider_user_id || '').trim();
    if (PROVIDERS.has(provider) && providerUserId) {
      byProvider.set(provider, { provider, providerUserId, linkedAt: row.linked_at || null });
    }
  }
  const [customerRows] = await queryable.query(
    'SELECT max_user_id, telegram_user_id, updated_at FROM cust_customers WHERE tenant_id=? AND id=? LIMIT 1',
    [scope.tenantId, scope.accountId]
  );
  const customer = customerRows[0] || {};
  if (!byProvider.has('max') && String(customer.max_user_id || '').trim()) {
    byProvider.set('max', { provider: 'max', providerUserId: String(customer.max_user_id).trim(), linkedAt: customer.updated_at || null });
  }
  if (!byProvider.has('tg') && String(customer.telegram_user_id || '').trim()) {
    byProvider.set('tg', { provider: 'tg', providerUserId: String(customer.telegram_user_id).trim(), linkedAt: customer.updated_at || null });
  }
  return Array.from(byProvider.values());
}

async function ensureLegacyCustomerAccount(db, rawScope) {
  const scope = normalizeScope(rawScope);
  if (scope.accountType !== 'customer') return loadAccountLink(db, scope);
  const existing = await loadAccountLink(db, scope);
  if (existing) return existing;
  const legacyChannels = await loadLegacyCustomerChannels(db, scope);
  if (!legacyChannels.length) return null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const current = await loadAccountLink(conn, scope, true);
    if (current) {
      await conn.commit();
      return current;
    }

    const existingPeople = new Set();
    const knownChannels = new Map();
    for (const legacy of legacyChannels) {
      const [rows] = await conn.query(
        `SELECT id, person_id FROM auth_messenger_channels
         WHERE provider=? AND provider_user_id=? AND revoked_at IS NULL
         LIMIT 1 FOR UPDATE`,
        [legacy.provider, legacy.providerUserId]
      );
      if (rows[0]) {
        knownChannels.set(legacy.provider, rows[0]);
        existingPeople.add(Number(rows[0].person_id));
      }
    }
    if (existingPeople.size > 1) throw new MessengerAuthError('LEGACY_IDENTITY_CONFLICT', 409);

    let personId = existingPeople.size ? Array.from(existingPeople)[0] : 0;
    if (!personId) {
      const [personResult] = await conn.query('INSERT INTO auth_people (created_at, updated_at) VALUES (NOW(), NOW())');
      personId = Number(personResult.insertId);
    }
    const [accountResult] = await conn.query(
      `INSERT INTO auth_account_links (person_id, tenant_id, account_type, account_id, linked_at)
       VALUES (?, ?, 'customer', ?, NOW())`,
      [personId, scope.tenantId, scope.accountId]
    );
    const accountLinkId = Number(accountResult.insertId);

    for (const legacy of legacyChannels) {
      let channel = knownChannels.get(legacy.provider);
      if (!channel) {
        const [channelResult] = await conn.query(
          `INSERT INTO auth_messenger_channels
           (person_id, provider, provider_user_id, verified_at)
           VALUES (?, ?, ?, COALESCE(?, NOW()))`,
          [personId, legacy.provider, legacy.providerUserId, legacy.linkedAt]
        );
        channel = { id: Number(channelResult.insertId), person_id: personId };
      }
      await conn.query(
        `INSERT INTO auth_account_messenger_links
         (account_link_id, channel_id, provider, verified_at)
         VALUES (?, ?, ?, COALESCE(?, NOW()))
         ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id), verified_at=VALUES(verified_at)`,
        [accountLinkId, Number(channel.id), legacy.provider, legacy.linkedAt]
      );
    }
    await conn.commit();
    return { id: accountLinkId, person_id: personId, linked_at: new Date() };
  } catch (error) {
    try { await conn.rollback(); } catch (_) {}
    throw error;
  } finally {
    conn.release();
  }
}

async function getAccountChannels(db, rawScope, options = {}) {
  const scope = normalizeScope(rawScope);
  if (scope.accountType === 'customer') await ensureLegacyCustomerAccount(db, scope);
  const [rows] = await db.query(
    `SELECT c.id AS channel_id, c.provider, c.provider_user_id, l.verified_at
     FROM auth_account_links a
     JOIN auth_account_messenger_links l ON l.account_link_id=a.id
     JOIN auth_messenger_channels c ON c.id=l.channel_id AND c.person_id=a.person_id
     WHERE a.tenant_id=? AND a.account_type=? AND a.account_id=? AND c.revoked_at IS NULL
     ORDER BY CASE c.provider WHEN 'max' THEN 0 ELSE 1 END, l.id`,
    [scope.tenantId, scope.accountType, scope.accountId]
  );
  return rows.map((row) => ({
    channelId: Number(row.channel_id),
    provider: String(row.provider),
    providerUserId: options.includePrivate ? String(row.provider_user_id) : undefined,
    masked: maskProviderUserId(row.provider_user_id),
    verifiedAt: row.verified_at || null,
  }));
}

async function createLinkChallenge(db, rawScope, rawProvider) {
  const scope = normalizeScope(rawScope);
  const provider = normalizeProvider(rawProvider);
  await assertAccountActive(db, scope);
  const token = randomLinkToken();
  const publicId = randomPublicId();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const [replacedChallenges] = await db.query(
    `SELECT public_id FROM auth_verification_challenges
     WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose='link'
       AND provider=? AND consumed_at IS NULL`,
    [scope.tenantId, scope.accountType, scope.accountId, provider]
  );
  await db.query(
    `UPDATE auth_verification_challenges
     SET consumed_at=NOW()
     WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose='link'
       AND provider=? AND consumed_at IS NULL`,
    [scope.tenantId, scope.accountType, scope.accountId, provider]
  );
  await db.query(
    `INSERT INTO auth_verification_challenges
     (public_id, tenant_id, account_type, account_id, purpose, provider, token_hash,
      delivery_status, expires_at, resend_after)
     VALUES (?, ?, ?, ?, 'link', ?, ?, 'sent',
       DATE_ADD(NOW(6), INTERVAL 10 MINUTE), DATE_ADD(NOW(6), INTERVAL 10 MINUTE))`,
    [publicId, scope.tenantId, scope.accountType, scope.accountId, provider, tokenHash(token)]
  );
  await ensureChallengeOperation(db, {
    publicId, tenantId: scope.tenantId, provider, purpose: 'link', expiresInSeconds: LINK_TTL_MS / 1000,
  });
  for (const replaced of replacedChallenges) {
    await markOperation(db, cleanupOperationId('challenge', replaced.public_id), 'cancelled');
  }
  return { token, publicId, provider, expiresAt, context: scope.accountType === 'customer' ? 'PROFILE_LINK' : 'EMPLOYEE_LINK' };
}

async function completeLinkChallenge(db, rawProvider, providerUserId, rawToken, expectedTenantId, options = {}) {
  let failedContactChallengeId=null;
  const provider = normalizeProvider(rawProvider);
  const normalizedProviderUserId = String(providerUserId || '').trim();
  if(!/^[1-9][0-9]{0,19}$/.test(normalizedProviderUserId))return {matched:true,ok:false,error:'INVALID_PROVIDER_ID'};
  const linkToken = String(rawToken || '').trim();
  const contact = options.telegramContact || options.verifiedMaxContact;
  let confirmedPhone = null;
  if (options.verifiedMaxContact) {
    if (provider !== 'max' || String(contact.providerUserId) !== normalizedProviderUserId) return { matched: true, ok: false, error: 'CONTACT_INVALID' };
    confirmedPhone = require('./helpers').normalizePhone(contact.phone);
    if (!/^\d{10,15}$/.test(confirmedPhone)) return { matched: true, ok: false, error: 'CONTACT_INVALID' };
  } else if (contact) {
    if (provider !== 'tg' || contact.chat?.type !== 'private' || contact.from?.is_bot
        || contact.forward_origin || contact.forward_date || contact.forward_from
        || contact.forward_from_chat || contact.forward_sender_name
        || !contact.contact?.user_id
        || String(contact.contact.user_id) !== normalizedProviderUserId
        || String(contact.from?.id) !== normalizedProviderUserId
        || String(contact.chat.id) !== normalizedProviderUserId) {
      return { matched: true, ok: false, error: 'CONTACT_INVALID' };
    }
    confirmedPhone = require('./helpers').normalizePhone(contact.contact.phone_number);
    if (!/^\d{10,15}$/.test(confirmedPhone)) return { matched: true, ok: false, error: 'CONTACT_INVALID' };
  }
  if (!normalizedProviderUserId || (!contact && !/^a_[A-Za-z0-9_-]{40}$/.test(linkToken))) return { matched: false };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [challengeRows] = await conn.query(
      `SELECT id, tenant_id, account_type, account_id, consumed_at, expires_at,
              (expires_at>NOW(6)) expires_valid, completed_provider_user_id
       FROM auth_verification_challenges
       WHERE provider=? AND purpose='link' ${options.customerOnly ? "AND account_type='customer'" : ''} AND ${contact
         ? "tenant_id=? AND completed_provider_user_id=? AND delivery_status='pending' AND consumed_at IS NULL AND expires_at>NOW()"
         : 'token_hash=?'}
       LIMIT 2 FOR UPDATE`,
      contact ? [provider, Number(expectedTenantId), normalizedProviderUserId] : [provider, tokenHash(linkToken)]
    );
    if (challengeRows.length !== 1) {
      await conn.rollback();
      if (contact && challengeRows.length === 0) return { matched: false };
      return { matched: true, ok: false, error: 'LINK_INVALID_OR_EXPIRED' };
    }
    const challenge = challengeRows[0];
    if(contact)failedContactChallengeId=challenge.id;
    if (Number(expectedTenantId) !== Number(challenge.tenant_id)) {
      await conn.rollback();
      return { matched: true, ok: false, error: 'LINK_INVALID_OR_EXPIRED' };
    }
    if (challenge.consumed_at || !Number(challenge.expires_valid)) {
      await conn.rollback();
      return { matched: true, ok: false, error: 'LINK_INVALID_OR_EXPIRED' };
    }
    const scope = normalizeScope({
      tenantId: challenge.tenant_id,
      accountType: challenge.account_type,
      accountId: challenge.account_id,
    });
    const context = scope.accountType === 'customer' ? 'PROFILE_LINK' : 'EMPLOYEE_LINK';
    await assertAccountActive(conn, scope);
    if (scope.accountType === 'employee') {
      if(options.employeeEnabled===false)throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
      const [roles] = await conn.query(
        `SELECT ur.role_id FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
         WHERE ur.tenant_id=? AND ur.user_id=? LIMIT 1`, [scope.tenantId, scope.accountId]
      );
      if (!roles.length) throw new MessengerAuthError('ROLE_NOT_ASSIGNED', 403);
    }
    const account = await loadAccountLink(conn, scope, true);
    if ((scope.accountType === 'customer' || scope.accountType === 'employee' || provider === 'tg' && options.requireContact) && !contact) {
      const [proof] = await conn.query(
        `SELECT c.id FROM auth_account_links a
         JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.provider=?
         JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
         WHERE a.tenant_id=? AND a.account_type=? AND a.account_id=? AND c.provider_user_id=?
           AND ${scope.accountType === 'employee'
             ? "EXISTS (SELECT 1 FROM auth_employee_customer_links ec WHERE ec.tenant_id=a.tenant_id AND ec.employee_id=a.account_id AND ec.phone_verified_at IS NOT NULL AND ec.conflict_code IS NULL)"
             : "EXISTS (SELECT 1 FROM cust_customers cc WHERE cc.tenant_id=a.tenant_id AND cc.id=a.account_id AND cc.phone_verified_at IS NOT NULL)"}
         LIMIT 1`, [provider, scope.tenantId, scope.accountType, scope.accountId, normalizedProviderUserId]
      );
      if (!proof.length || scope.accountType === 'employee') {
        if (challenge.completed_provider_user_id && String(challenge.completed_provider_user_id) !== normalizedProviderUserId) {
          throw new MessengerAuthError('LINK_USER_CONFLICT', 409);
        }
        await conn.query(
          `UPDATE auth_verification_challenges SET delivery_status='pending', completed_provider_user_id=? WHERE id=?`,
          [normalizedProviderUserId, Number(challenge.id)]
        );
        await conn.commit();
        return { matched: true, ok: true, contactRequired: true, context };
      }
    }
    if (confirmedPhone && scope.accountType === 'customer') {
      const [customers] = await conn.query(
        'SELECT id, phone FROM cust_customers WHERE tenant_id=? AND (id=? OR phone=?) FOR UPDATE',
        [scope.tenantId, scope.accountId, confirmedPhone]
      );
      const targetCustomer=customers.find(row=>Number(row.id)===scope.accountId);
      if(targetCustomer?.phone&&require('./helpers').normalizePhone(targetCustomer.phone)!==confirmedPhone){
        throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      }
      if (customers.some(row => Number(row.id) !== scope.accountId || (row.phone && row.phone !== confirmedPhone))) {
        throw new MessengerAuthError('PHONE_OWNERSHIP_REVIEW_REQUIRED', 409);
      }
    }
    const [channelRows] = await conn.query(
      `SELECT id, person_id FROM auth_messenger_channels
       WHERE provider=? AND provider_user_id=?
       LIMIT 1 FOR UPDATE`,
      [provider, normalizedProviderUserId]
    );
    const existingChannel = channelRows[0] || null;

    if (account && existingChannel && Number(account.person_id) !== Number(existingChannel.person_id)) {
      throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT', 409);
    }
    let personId = Number(account?.person_id || existingChannel?.person_id || 0);
    if (!personId) {
      const [personResult] = await conn.query('INSERT INTO auth_people (created_at, updated_at) VALUES (NOW(), NOW())');
      personId = Number(personResult.insertId);
    }
    let accountLinkId = Number(account?.id || 0);
    if (!accountLinkId) {
      const [accountResult] = await conn.query(
        `INSERT INTO auth_account_links (person_id, tenant_id, account_type, account_id, linked_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [personId, scope.tenantId, scope.accountType, scope.accountId]
      );
      accountLinkId = Number(accountResult.insertId);
    }
    let channelId = Number(existingChannel?.id || 0);
    if (!channelId) {
      const [channelResult] = await conn.query(
        `INSERT INTO auth_messenger_channels
         (person_id, provider, provider_user_id, verified_at, revoked_at)
         VALUES (?, ?, ?, NOW(), NULL)`,
        [personId, provider, normalizedProviderUserId]
      );
      channelId = Number(channelResult.insertId);
    } else {
      await conn.query(
        'UPDATE auth_messenger_channels SET verified_at=NOW(), revoked_at=NULL WHERE id=?',
        [channelId]
      );
    }
    await conn.query(
      `INSERT INTO auth_account_messenger_links
       (account_link_id, channel_id, provider, verified_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id), verified_at=NOW()`,
      [accountLinkId, channelId, provider]
    );
    await conn.query(
      `UPDATE auth_verification_challenges
       SET consumed_at=NOW(), completed_provider_user_id=?
       WHERE id=?`,
      [normalizedProviderUserId, Number(challenge.id)]
    );
    await conn.query(
      `UPDATE auth_verification_challenges SET consumed_at=NOW()
       WHERE tenant_id=? AND account_type=? AND account_id=? AND provider=?
         AND id<>? AND consumed_at IS NULL`,
      [scope.tenantId, scope.accountType, scope.accountId, provider, Number(challenge.id)]
    );
    if (scope.accountType === 'customer') {
      const column = provider === 'max' ? 'max_user_id' : 'telegram_user_id';
      await conn.query(
        `UPDATE cust_customers SET ${column}=?,
         phone_verified_at=IF(? IS NULL, phone_verified_at, NOW()), updated_at=NOW() WHERE tenant_id=? AND id=?`,
        [normalizedProviderUserId, confirmedPhone, scope.tenantId, scope.accountId]
      );
      await conn.query(
        `INSERT INTO cust_customer_auth_identities
         (tenant_id, customer_id, provider, provider_user_id, linked_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE provider_user_id=VALUES(provider_user_id), linked_at=NOW()`,
        [scope.tenantId, scope.accountId, provider, normalizedProviderUserId]
      );
      await conn.query(`UPDATE cust_customer_sessions SET expires_at=NULL
        WHERE tenant_id=? AND customer_id=? AND auth_strength='strong' AND is_active=1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())`,[scope.tenantId,scope.accountId]);
    }
    let customer = null;
    if (scope.accountType === 'employee') customer = await ensureEmployeeCustomer(conn, scope.tenantId, scope.accountId, {
      provider, providerUserId: normalizedProviderUserId, phone: confirmedPhone,
    });
    await conn.commit();
    return { matched: true, ok: true, context, scope, provider, customer, phoneConflict: Boolean(customer?.conflict) };
  } catch (error) {
    try { await conn.rollback(); } catch (_) {}
    if (error instanceof MessengerAuthError) {
      if(failedContactChallengeId)await conn.query("UPDATE auth_verification_challenges SET delivery_status='failed',consumed_at=NOW() WHERE id=? AND purpose='link' AND consumed_at IS NULL",[failedContactChallengeId]);
      return { matched: true, ok: false, error: error.code };
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function unlinkAccountChannel(db, rawScope, rawProvider, options = {}) {
  const scope = normalizeScope(rawScope);
  const provider = normalizeProvider(rawProvider);
  if (scope.accountType === 'customer') await ensureLegacyCustomerAccount(db, scope);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await assertAccountActive(conn, scope);
    const account = await loadAccountLink(conn, scope, true);
    if (!account) {
      await conn.commit();
      return { ok: true, linked: false };
    }
    await conn.query(
      'DELETE FROM auth_account_messenger_links WHERE account_link_id=? AND provider=?',
      [Number(account.id), provider]
    );
    await conn.query(
      `UPDATE auth_verification_challenges SET consumed_at=NOW()
       WHERE tenant_id=? AND account_type=? AND account_id=? AND provider=? AND consumed_at IS NULL`,
      [scope.tenantId, scope.accountType, scope.accountId, provider]
    );
    const [[remaining]] = await conn.query(
      'SELECT COUNT(*) AS count FROM auth_account_messenger_links WHERE account_link_id=?',
      [Number(account.id)]
    );
    if (Number(remaining?.count || 0) === 0 && scope.accountType !== 'customer') {
      await conn.query('DELETE FROM auth_account_links WHERE id=?', [Number(account.id)]);
    }
    if (scope.accountType === 'customer') {
      const column = provider === 'max' ? 'max_user_id' : 'telegram_user_id';
      await conn.query(
        `UPDATE cust_customers SET ${column}=NULL, updated_at=NOW() WHERE tenant_id=? AND id=?`,
        [scope.tenantId, scope.accountId]
      );
      await conn.query(
        'DELETE FROM cust_customer_auth_identities WHERE tenant_id=? AND customer_id=? AND provider=?',
        [scope.tenantId, scope.accountId, provider]
      );
      const [[active]]=await conn.query(`SELECT COUNT(*) count FROM auth_account_messenger_links l
        JOIN auth_messenger_channels ch ON ch.id=l.channel_id AND ch.person_id=? AND ch.revoked_at IS NULL
        WHERE l.account_link_id=?`,[account.person_id,account.id]);
      if(Number(active.count)>0){
        await conn.query(`UPDATE cust_customer_sessions SET expires_at=NULL
          WHERE tenant_id=? AND customer_id=? AND auth_strength='strong' AND is_active=1 AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())`,[scope.tenantId,scope.accountId]);
      }else{
        const [[current]]=await conn.query(`SELECT id,store_id FROM cust_customer_sessions
          WHERE tenant_id=? AND customer_id=? AND token=? AND auth_strength='strong' AND is_active=1
          AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) FOR UPDATE`,
          [scope.tenantId,scope.accountId,String(options.sessionToken||'')]);
        if(!current)throw new MessengerAuthError('STRONG_AUTH_REQUIRED',403);
        const offset=await require('./helpers/customerAuth').guestStoreOffset(conn,scope.tenantId,Number(current.store_id));
        await conn.query(`UPDATE cust_customer_sessions SET is_active=0,revoked_at=UTC_TIMESTAMP()
          WHERE tenant_id=? AND customer_id=? AND auth_strength='strong' AND id<>? AND is_active=1`,[scope.tenantId,scope.accountId,current.id]);
        await conn.query(`UPDATE cust_customer_sessions SET expires_at=LEAST(COALESCE(expires_at,'9999-12-31'),
          TIMESTAMPADD(MINUTE,?,DATE_ADD(DATE(TIMESTAMPADD(MINUTE,?,UTC_TIMESTAMP())),INTERVAL 1 DAY)))
          WHERE tenant_id=? AND id=?`,[-offset,offset,scope.tenantId,current.id]);
      }
    }
    await conn.commit();
    if(scope.accountType==='customer')console.info('CUSTOMER_MESSENGER_UNLINKED',{tenantId:scope.tenantId,provider,accountRef:crypto.createHash('sha256').update(`${scope.tenantId}:${scope.accountId}`).digest('hex').slice(0,16)});
    return { ok: true, linked: false };
  } catch (error) {
    try { await conn.rollback(); } catch (_) {}
    throw error;
  } finally {
    conn.release();
  }
}

function codeScopeKey(scope, purpose, publicId) {
  return `${scope.tenantId}:${scope.accountType}:${scope.accountId}:${purpose}:${publicId}`;
}

async function issueCodeChallenge(db, options) {
  const scope = normalizeScope(options);
  const lockName = `auth-code:${scope.tenantId}:${scope.accountType}:${scope.accountId}`;
  const lockConnection = await db.getConnection();
  let acquired = false;
  try {
    const [[row]] = await lockConnection.query('SELECT GET_LOCK(?, 1) AS acquired', [lockName]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired) throw new MessengerAuthError('CODE_RESEND_TOO_SOON', 429, { retryAfter: 1 });
    return await issueCodeChallengeLocked(connectionDatabase(lockConnection), options);
  } finally {
    try {
      if (acquired) await lockConnection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally {
      lockConnection.release();
    }
  }
}

async function issueCodeChallengeLocked(db, options) {
  const scope = normalizeScope(options);
  const purpose = String(options?.purpose || '').trim().toLowerCase();
  const browserLogin=['customer','employee'].includes(scope.accountType)&&purpose==='login';
  if (!CODE_PURPOSES.has(purpose)) throw new MessengerAuthError('BAD_PURPOSE', 400);
  await assertAccountActive(db, scope);
  const channels = await getAccountChannels(db, scope, { includePrivate: true });
  const requestedProvider = options?.provider ? normalizeProvider(options.provider) : '';
  let channel = null;
  if (requestedProvider) channel = channels.find((item) => item.provider === requestedProvider) || null;
  else channel = channels.find((item) => item.provider === 'max') || channels.find((item) => item.provider === 'tg') || null;
  if (!channel) throw new MessengerAuthError('MESSENGER_NOT_LINKED', 409);

  let pending = null;
  if (options.pendingStartToken) {
    const [pendingRows] = await db.query(
      `SELECT *, (expires_at>NOW(6)) expires_valid FROM auth_verification_challenges
       WHERE token_hash=? AND tenant_id=? AND account_type=? AND account_id=? AND purpose=? AND provider=? LIMIT 1`,
      [tokenHash(options.pendingStartToken), scope.tenantId, scope.accountType, scope.accountId, purpose, channel.provider]
    );
    pending = pendingRows[0];
    if (!pending || pending.consumed_at || !Number(pending.expires_valid)
        || Number(pending.channel_id) !== channel.channelId
        || String(options.providerUserId) !== channel.providerUserId) {
      throw new MessengerAuthError('BOT_LOGIN_INVALID_OR_EXPIRED', 409);
    }
    if (pending.delivery_status === 'sent') return { alreadySent: true };
    if (pending.delivery_status !== 'pending') throw new MessengerAuthError('BOT_LOGIN_INVALID_OR_EXPIRED', 409);
  }
  const requestedIpHash = pending ? pending.requested_ip_hash : ipHash(options?.ipAddress);
  const [accountRateRows] = await db.query(
      `SELECT public_id,created_at,resend_after,delivery_status,TIMESTAMPDIFF(SECOND,NOW(),resend_after) resend_seconds
     FROM auth_verification_challenges
     WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose=?
       AND (? IS NULL OR id<>?)
       AND created_at > DATE_SUB(NOW(), INTERVAL ${REQUEST_WINDOW_MINUTES} MINUTE)
     ORDER BY id DESC`,
    [scope.tenantId, scope.accountType, scope.accountId, purpose, pending?.id || null, pending?.id || null]
  );
  if (!browserLogin && accountRateRows.length >= MAX_ACCOUNT_REQUESTS_PER_WINDOW) {
    throw new MessengerAuthError('CODE_RATE_LIMITED', 429, { retryAfter: REQUEST_WINDOW_MINUTES * 60 });
  }
  const latest = accountRateRows.find((row) => row.delivery_status !== 'failed');
  const resendWait = Number(latest?.resend_seconds || 0);
  if (!browserLogin&&resendWait>0) {
    const retryAfter = Math.max(1,resendWait);
    throw new MessengerAuthError('CODE_RESEND_TOO_SOON', 429, { retryAfter });
  }
  if (requestedIpHash && !browserLogin) {
    const [[ipRate]] = await db.query(
      `SELECT COUNT(*) AS count FROM auth_verification_challenges
       WHERE requested_ip_hash=? AND created_at > DATE_SUB(NOW(), INTERVAL ${REQUEST_WINDOW_MINUTES} MINUTE)
         AND (? IS NULL OR id<>?)`,
      [requestedIpHash, pending?.id || null, pending?.id || null]
    );
    if (Number(ipRate?.count || 0) >= MAX_IP_REQUESTS_PER_WINDOW) {
      throw new MessengerAuthError('CODE_RATE_LIMITED', 429, { retryAfter: REQUEST_WINDOW_MINUTES * 60 });
    }
  }

  const deferred = options.deferUntilStart === true;
  const startToken = deferred ? `l_${crypto.randomBytes(30).toString('base64url')}` : null;
  const publicId = pending ? pending.public_id : randomPublicId();
  const code = deferred ? null : String(crypto.randomInt(0, 10000)).padStart(4, '0');
  const salt = deferred ? null : crypto.randomBytes(16);
  const digest = deferred ? null : await hashCode(code, salt, codeScopeKey(scope, purpose, publicId));
  const codeTtlMs = CODE_TTL_MS;
  const expiresAt = new Date(Date.now() + codeTtlMs);
  const resendAfter = new Date(Date.now() + RESEND_DELAY_MS);
  let result;
  if (pending) {
    await db.query(
      `UPDATE auth_verification_challenges SET code_hash=?, code_salt=?,
         expires_at=DATE_ADD(NOW(6),INTERVAL 3 MINUTE),resend_after=DATE_ADD(NOW(6),INTERVAL 60 SECOND)
       WHERE id=? AND delivery_status='pending' AND consumed_at IS NULL`,
      [digest, salt, pending.id]
    );
    result = { insertId: pending.id };
  } else {
  [result] = await db.query(
    `INSERT INTO auth_verification_challenges
     (public_id, tenant_id, account_type, account_id, purpose, provider, channel_id,
      code_hash, code_salt, max_attempts, delivery_status, requested_ip_hash, expires_at, resend_after, token_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?,
        DATE_ADD(NOW(6),INTERVAL 3 MINUTE),DATE_ADD(NOW(6),INTERVAL 60 SECOND),?)`,
    [publicId, scope.tenantId, scope.accountType, scope.accountId, purpose, channel.provider,
      channel.channelId, digest, salt, MAX_CODE_ATTEMPTS, requestedIpHash, startToken ? tokenHash(startToken) : null]
  );
  }
  const cleanupId = await ensureChallengeOperation(db, {
    publicId, tenantId: scope.tenantId, provider: channel.provider, purpose, expiresInSeconds: CODE_TTL_MS / 1000,
  });
  for (const replaced of accountRateRows) {
    if (replaced.public_id !== publicId) {
      await markOperation(db, cleanupOperationId('challenge', replaced.public_id), 'cancelled');
    }
  }
  if (deferred) {
    await db.query(
      `UPDATE auth_verification_challenges SET consumed_at=NOW()
       WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose=?
         AND id<>? AND consumed_at IS NULL AND delivery_status='pending'`,
      [scope.tenantId, scope.accountType, scope.accountId, purpose, Number(result.insertId)]
    );
    return { requestId: publicId, provider: channel.provider, masked: channel.masked, expiresAt, resendAfter, startToken, deferred: true };
  }
  try {
    await options.deliver({
      tenantId: scope.tenantId,
      provider: channel.provider,
      providerUserId: channel.providerUserId,
      code,
      purpose,
      expiresInMinutes: Math.round(codeTtlMs / 60000),
      operationId: cleanupId,
    });
    await db.query(
      `UPDATE auth_verification_challenges SET delivery_status='sent' WHERE id=?`,
      [Number(result.insertId)]
    );
    await db.query(
      `UPDATE auth_verification_challenges SET consumed_at=NOW()
       WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose=?
         AND id<>? AND consumed_at IS NULL AND delivery_status='sent'`,
      [scope.tenantId, scope.accountType, scope.accountId, purpose, Number(result.insertId)]
    );
  } catch (error) {
    console.error('AUTH_CODE_DELIVERY_FAILED', {
      provider: channel.provider, tenantId: scope.tenantId,
      reason: /^[A-Z0-9_]+$/.test(String(error.code || error.cause?.code || ''))
        ? (error.code || error.cause.code) : 'DELIVERY_ERROR',
      httpStatus: Number(error.httpStatus) || undefined
    });
    await db.query(
      `UPDATE auth_verification_challenges SET delivery_status='failed', consumed_at=NOW() WHERE id=?`,
      [Number(result.insertId)]
    );
    await markOperation(db, cleanupId, 'error');
    const needsStart = error.code === 'TELEGRAM_BOT_START_REQUIRED';
    const wrapped = new MessengerAuthError(needsStart ? error.code : 'CODE_DELIVERY_FAILED', needsStart ? 409 : 503, {
      provider: channel.provider,
      fallbackAvailable: channel.provider === 'max' && channels.some((item) => item.provider === 'tg'),
    });
    wrapped.cause = error;
    throw wrapped;
  }
  return {
    requestId: publicId,
    provider: channel.provider,
    masked: channel.masked,
    expiresAt,
    resendAfter,
    fallbackAvailable: channel.provider === 'max' && channels.some((item) => item.provider === 'tg'),
  };
}

async function completeBotLoginRequest(db, provider, providerUserId, token, tenantId, deliver) {
  if (!/^l_[A-Za-z0-9_-]{40}$/.test(String(token))) return { ok: false, error: 'BOT_LOGIN_INVALID_OR_EXPIRED' };
  const [rows] = await db.query(
    `SELECT tenant_id, account_type, account_id, purpose, provider
     FROM auth_verification_challenges WHERE token_hash=? AND provider=? AND tenant_id=? LIMIT 1`,
    [tokenHash(token), normalizeProvider(provider), Number(tenantId)]
  );
  if (!rows.length || !CODE_PURPOSES.has(rows[0].purpose)) return { ok: false, error: 'BOT_LOGIN_INVALID_OR_EXPIRED' };
  if(['login','password_reset'].includes(rows[0].purpose))return {ok:false,error:'BROWSER_CONFIRMATION_REQUIRED'};
  const row = rows[0];
  try {
    const result = await issueCodeChallenge(db, {
      tenantId: row.tenant_id, accountType: row.account_type, accountId: row.account_id,
      purpose: row.purpose, provider, providerUserId: String(providerUserId),
      pendingStartToken: token, deliver
    });
    return { ok: true, alreadySent: Boolean(result.alreadySent) };
  } catch (error) {
    if (error instanceof MessengerAuthError) return { ok: false, error: error.code };
    throw error;
  }
}

async function verifyCodeChallenge(db, options) {
  const scope = normalizeScope(options);
  const purpose = String(options?.purpose || '').trim().toLowerCase();
  const requestId = String(options?.requestId || '').trim();
  const code = String(options?.code ?? '');
  if (!CODE_PURPOSES.has(purpose) || !requestId || !/^\d{4}$/.test(code)) {
    throw new MessengerAuthError('CODE_INVALID', 400);
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT *,expires_at>NOW() AND (account_type<>'customer' OR purpose<>'login' OR DATE_ADD(created_at,INTERVAL 3 MINUTE)>NOW()) expires_valid FROM auth_verification_challenges
       WHERE public_id=? AND tenant_id=? AND account_type=? AND account_id=? AND purpose=?
       LIMIT 1 FOR UPDATE`,
      [requestId, scope.tenantId, scope.accountType, scope.accountId, purpose]
    );
    const challenge = rows[0];
    if (!challenge || challenge.delivery_status !== 'sent') throw new MessengerAuthError('CODE_NOT_REQUESTED', 400);
    if (challenge.consumed_at) throw new MessengerAuthError('CODE_ALREADY_USED', 400);
    if (!Number(challenge.expires_valid)) {
      await markOperation(db, cleanupOperationId('challenge', requestId), 'expired');
      throw new MessengerAuthError('CODE_EXPIRED', 400);
    }
    if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || MAX_CODE_ATTEMPTS)) {
      await markOperation(db, cleanupOperationId('challenge', requestId), 'error');
      throw new MessengerAuthError('CODE_ATTEMPTS_EXCEEDED', 429);
    }
    const digest = await hashCode(code, challenge.code_salt, codeScopeKey(scope, purpose, requestId));
    if (!safeEqual(digest, challenge.code_hash)) {
      await conn.query('UPDATE auth_verification_challenges SET attempts=attempts+1 WHERE id=?', [Number(challenge.id)]);
      await conn.commit();
      if (Number(challenge.attempts || 0) + 1 >= Number(challenge.max_attempts || MAX_CODE_ATTEMPTS)) {
        await markOperation(db, cleanupOperationId('challenge', requestId), 'error');
      }
      throw new MessengerAuthError('CODE_INVALID', 400, {
        attemptsRemaining: Math.max(0, Number(challenge.max_attempts) - Number(challenge.attempts) - 1),
      });
    }
    await assertAccountActive(conn, scope);
    const value = typeof options.onVerified === 'function'
      ? await options.onVerified(conn, { ...challenge, scope })
      : null;
    await conn.query(
      'UPDATE auth_verification_challenges SET consumed_at=NOW(), attempts=attempts+1 WHERE id=?',
      [Number(challenge.id)]
    );
    await conn.commit();
    await markOperation(db, cleanupOperationId('challenge', requestId), 'success');
    return { ok: true, value, provider: String(challenge.provider) };
  } catch (error) {
    try { await conn.rollback(); } catch (_) {}
    throw error;
  } finally {
    conn.release();
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function webhookEventKey(provider, update) {
  const direct = update?.update_id ?? update?.event_id ?? update?.id
    ?? update?.message?.mid ?? update?.message?.id ?? update?.event?.id;
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    const type = String(update?.update_type || update?.event?.type || '').trim();
    return `${type}:${String(direct).trim()}`.slice(0, 191);
  }
  return crypto.createHash('sha256').update(stableJson(update), 'utf8').digest('hex');
}

async function processWebhookEvent(db, rawProvider, update, handler, namespace = '') {
  const provider = normalizeProvider(rawProvider);
  const originalKey = webhookEventKey(provider, update);
  const eventKey = namespace
    ? crypto.createHash('sha256').update(`${namespace}:${originalKey}`).digest('hex')
    : originalKey;
  const lockName = `auth-hook:${crypto.createHash('sha256').update(`${provider}:${eventKey}`).digest('hex').slice(0, 48)}`;
  const lockConnection = await db.getConnection();
  const eventDb = connectionDatabase(lockConnection);
  let acquired = false;
  try {
    const [[lock]] = await lockConnection.query('SELECT GET_LOCK(?, 1) AS acquired', [lockName]);
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) throw new MessengerAuthError('WEBHOOK_IN_PROGRESS', 503);
    const [existing] = await eventDb.query(
      'SELECT status FROM auth_webhook_events WHERE provider=? AND event_key=? LIMIT 1',
      [provider, eventKey]
    );
    if (existing[0]?.status === 'done') return { duplicate: true };
    if (!existing.length) {
      await eventDb.query(
        `INSERT INTO auth_webhook_events (provider, event_key, status, received_at)
         VALUES (?, ?, 'processing', NOW())`,
        [provider, eventKey]
      );
    }
    await handler(eventDb, { eventKey });
    await eventDb.query(
      `UPDATE auth_webhook_events SET status='done', processed_at=NOW()
       WHERE provider=? AND event_key=?`,
      [provider, eventKey]
    );
    return { duplicate: false };
  } catch (error) {
    if (acquired) await eventDb.query(
      `DELETE FROM auth_webhook_events WHERE provider=? AND event_key=? AND status='processing'`,
      [provider, eventKey]
    ).catch(() => {});
    throw error;
  } finally {
    try {
      if (acquired) await lockConnection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally {
      lockConnection.release();
    }
  }
}

function browserBinding(req, res) {
  let binding = String(req.cookies?.messenger_browser || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    binding = randomPublicId();
  }
  res.cookie('messenger_browser', binding, { httpOnly: true, sameSite: 'strict', secure: req.secure,
    path: '/api', maxAge: 10 * 60 * 1000 });
  return binding;
}

async function assertBrowserSchema(db) {
  const [columns] = await db.query('SHOW COLUMNS FROM auth_browser_requests');
  const required=['contact_phone','contact_name','contact_verified_at'];
  if(required.some(name=>!columns.some(c=>c.Field===name)))throw new MessengerAuthError('BROWSER_CONTACT_MIGRATION_REQUIRED',503);
}

async function findPhoneCustomer(conn,tenantId,phone) {
  const [rows]=await conn.query('SELECT id,phone,is_active,phone_verified_at,guest_bonus_only FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 2 FOR UPDATE',[tenantId,phone]);
  const matches=rows.filter(c=>require('./helpers').normalizePhone(c.phone)===phone);
  if(matches.length>1)throw new MessengerAuthError('CUSTOMER_PHONE_CONFLICT',409);
  if(matches[0] && Number(matches[0].is_active)!==1)throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
  return matches[0] || null;
}

async function assertCustomerRelink(conn,tenantId,customerId,provider,uid,phone) {
  const [active]=await conn.query(`SELECT m.id FROM auth_account_links a
    JOIN auth_account_messenger_links m ON m.account_link_id=a.id
    JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.revoked_at IS NULL
    WHERE a.tenant_id=? AND a.account_type='customer' AND a.account_id=? LIMIT 1 FOR UPDATE`,[tenantId,customerId]);
  if(active.length)throw new MessengerAuthError('CUSTOMER_CODE_REQUIRED',409);
  // Native contact alone must not transfer an established account to a new messenger ID.
  const [history]=await conn.query(`SELECT public_id FROM auth_browser_requests
    WHERE tenant_id=? AND account_type='customer' AND account_id=? AND provider=?
      AND provider_user_id=? AND contact_phone=? AND contact_verified_at IS NOT NULL
      AND state IN ('confirmed','consumed') LIMIT 1`,[tenantId,customerId,provider,uid,phone]);
  if(!history.length)throw new MessengerAuthError('CUSTOMER_RELINK_PROOF_REQUIRED',409);
}

async function hasBrowserAccountBinding(conn,{tenantId,accountType,provider,uid}){
  const [linked]=await conn.query(`SELECT a.id FROM auth_account_links a
    JOIN auth_account_messenger_links m ON m.account_link_id=a.id
    JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
    WHERE a.tenant_id=? AND a.account_type=? AND c.provider=? AND c.provider_user_id=? LIMIT 1`,[tenantId,accountType,provider,uid]);
  if(linked.length || accountType!=='customer')return linked.length>0;
  const column=provider==='tg'?'telegram_user_id':'max_user_id';
  const [legacy]=await conn.query(`SELECT c.id FROM cust_customers c WHERE c.tenant_id=? AND c.is_active=1 AND
    (c.${column}=? OR EXISTS(SELECT 1 FROM cust_customer_auth_identities i WHERE i.tenant_id=c.tenant_id AND i.customer_id=c.id AND i.provider=? AND i.provider_user_id=?)) LIMIT 2`,[tenantId,uid,provider,uid]);
  if(legacy.length>1)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
  return legacy.length===1;
}

async function createBrowserRequest(db, { tenantId, accountType, provider, binding, ipAddress, purpose='login', guestSessionHash=null, requestedPhone=null }) {
  await assertBrowserSchema(db);
  if (!['customer','employee'].includes(accountType)) throw new MessengerAuthError('INVALID_ACCOUNT_SCOPE');
  if(!['login','password_reset','profile_link'].includes(purpose)||(accountType==='customer'&&purpose==='password_reset')
    || (purpose==='profile_link'&&(accountType!=='customer'||!Buffer.isBuffer(guestSessionHash)||guestSessionHash.length!==32))
    || (guestSessionHash&&(accountType!=='customer'||!['profile_link','login'].includes(purpose)||!Buffer.isBuffer(guestSessionHash)||guestSessionHash.length!==32)))throw new MessengerAuthError('INVALID_AUTH_PURPOSE');
  normalizeProvider(provider);
  const hash = ipHash(ipAddress);
  const [[rate]] = await db.query('SELECT COUNT(*) n FROM auth_browser_requests WHERE ip_hash=? AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE)', [hash]);
  if (Number(rate.n) >= 20) throw new MessengerAuthError('LOGIN_RATE_LIMITED', 429);
  const publicId = randomPublicId(), token = `b_${crypto.randomBytes(30).toString('base64url')}`;
  const expiresMinutes = purpose === 'profile_link' ? 10 : 3;
  await db.query(`INSERT INTO auth_browser_requests
    (public_id,token_hash,browser_hash,ip_hash,tenant_id,account_type,provider,purpose,guest_session_hash,requested_phone,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? MINUTE))`,
  [publicId,tokenHash(token),tokenHash(binding),hash,tenantId,accountType,provider,purpose,guestSessionHash,requestedPhone,expiresMinutes]);
  await ensureBrowserOperation(db, {
    publicId, tenantId, provider, purpose, expiresInSeconds: expiresMinutes * 60,
  });
  return { requestId: publicId, token };
}

async function browserBotAction(db, { tenantId, provider, token, providerUserId, confirm = false, contact = null, employeeEnabled=true }) {
  try{await assertBrowserSchema(db);}catch(error){if(error instanceof MessengerAuthError)return {ok:false,error:error.code};throw error;}
  const reference = /^r_[A-Za-z0-9_-]{43}$/.test(String(token));
  if ((!contact && !reference && !/^b_[A-Za-z0-9_-]{40}$/.test(String(token))) || !/^[1-9][0-9]{0,19}$/.test(String(providerUserId))) return { ok: false,error:'INVALID_PROVIDER_ID' };
  const conn = await db.getConnection();
  let relinkedCustomerId=null;
  let guestRequestId=null;
  let profileLinkResolvedAsLogin=false;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT *, (expires_at>NOW()) AS valid FROM auth_browser_requests WHERE ${contact
      ? "provider_user_id=? AND state='started' AND expires_at>NOW()"
      : reference ? 'public_id=?' : 'token_hash=?'} AND tenant_id=? AND provider=? LIMIT 2 FOR UPDATE`,
      [contact ? String(providerUserId) : reference ? token.slice(2) : tokenHash(token),tenantId,provider]);
    if (contact && !rows.length) { await conn.rollback(); return {ok:false,matched:false}; }
    if (contact && rows.length !== 1) throw new MessengerAuthError('CONTACT_REQUEST_AMBIGUOUS');
    const r = rows[0], uid = String(providerUserId);
    if(r?.purpose==='profile_link')guestRequestId=r.public_id;
    if(r?.account_type==='employee'&&!employeeEnabled)throw new MessengerAuthError('MESSENGER_LOGIN_DISABLED',403);
    const customerPolicy=r?.account_type==='customer'?await require('./helpers/customerAuth').settings(conn,tenantId):null;
    if(customerPolicy&&!customerPolicy[provider])throw new MessengerAuthError('CUSTOMER_CHANNEL_DISABLED',403);
    if (!r || Number(r.valid)!==1 || ['cancelled','consumed'].includes(r.state)
        || (r.provider_user_id && r.provider_user_id !== uid)) throw new MessengerAuthError('REQUEST_EXPIRED');
    if(r.guest_session_hash){
      const [[guest]]=await conn.query('SELECT phone,revoked_at,(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) valid FROM cust_guest_sessions WHERE tenant_id=? AND token_hash=? FOR UPDATE',[tenantId,r.guest_session_hash]);
      if(!guest || guest.revoked_at || !Number(guest.valid))throw new MessengerAuthError('GUEST_SESSION_EXPIRED',409);
      if(r.purpose==='profile_link')r.guest_profile_phone=require('./helpers').normalizePhone(guest.phone);
      // A guest's typed phone is not proof of identity. The verified native
      // contact below supplies the authoritative phone for account discovery.
    }
    if (contact) {
      const phone = require('./helpers').normalizePhone(contact.phone);
      if (!/^\d{10,15}$/.test(phone)) throw new MessengerAuthError('CONTACT_INVALID');
      if(r.purpose==='profile_link'&&r.guest_profile_phone!==phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      if(r.account_type==='customer'&&r.code_challenge_id)throw new MessengerAuthError('CUSTOMER_CODE_REQUIRED',409);
      // The webhook adapter verifies native contact ownership before calling this function.
      if (r.contact_phone && r.contact_phone !== phone) throw new MessengerAuthError('CONTACT_CONFLICT');
      await conn.query("UPDATE auth_browser_requests SET contact_phone=?,contact_name=?,contact_verified_at=NOW(),requested_phone=IF(account_type='customer',?,requested_phone) WHERE public_id=?",
        [phone,String(contact.name || '').replace(/[\p{C}]/gu,'').trim().slice(0,100) || null,phone,r.public_id]);
      if(r.account_type==='customer')r.requested_phone=phone;
      if(r.account_type==='employee'&&r.requested_phone&&r.requested_phone!==phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      r.contact_phone=phone;r.contact_name=String(contact.name || '').replace(/[\p{C}]/gu,'').trim().slice(0,100);r.contact_verified_at=true;confirm=true;
    }
    if (!confirm) {
      if (r.state === 'confirmed') { await conn.commit(); return { ok: true, confirmed: true, purpose:r.purpose }; }
      const known=await hasBrowserAccountBinding(conn,{tenantId,accountType:r.account_type,provider,uid});
      await conn.query("UPDATE auth_browser_requests SET state='started',provider_user_id=? WHERE public_id=?", [uid,r.public_id]);
      if(!known && r.purpose==='password_reset')throw new MessengerAuthError('EMPLOYEE_MESSENGER_NOT_LINKED');
      await conn.commit(); return { ok: true, purpose:r.purpose,contactRequired:!r.contact_verified_at };
    }
    if (r.state === 'confirmed') { await conn.commit(); return { ok: true, confirmed: true, purpose:r.purpose }; }
    if (r.state !== 'started' || r.provider_user_id !== uid) throw new MessengerAuthError('REQUEST_NOT_STARTED');
    // Serialize identity discovery and creation across requests/tenants without merging by phone.
    const [tenants] = await conn.query('SELECT id FROM ten_tenants WHERE id=? AND is_active=1 FOR UPDATE', [tenantId]);
    if (!tenants.length) throw new MessengerAuthError('TENANT_BLOCKED');
    const [channels] = await conn.query('SELECT id,person_id,revoked_at FROM auth_messenger_channels WHERE provider=? AND provider_user_id=? FOR UPDATE', [provider,uid]);
    let channel = channels[0];
    if (channel?.revoked_at) throw new MessengerAuthError('MESSENGER_NOT_LINKED');
    const column = provider === 'tg' ? 'telegram_user_id' : 'max_user_id';
    let accountId;
    if (r.account_type === 'employee') {
      const [employees] = await conn.query(`SELECT DISTINCT u.id,u.phone FROM auth_account_links a
        JOIN auth_account_messenger_links m ON m.account_link_id=a.id
        JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
        JOIN app_users u ON u.tenant_id=a.tenant_id AND u.id=a.account_id AND u.is_active=1 AND u.employee_status='active'
        WHERE a.tenant_id=? AND a.account_type='employee' AND c.provider=? AND c.provider_user_id=?
          AND EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles tr ON tr.id=ur.role_id AND tr.tenant_id=ur.tenant_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)
        LIMIT 2`, [tenantId,provider,uid]);
      if(employees.length===1){
        if(require('./helpers').normalizePhone(employees[0].phone)!==r.contact_phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
        accountId=Number(employees[0].id);
      }
      else{
        if(!r.contact_verified_at||!r.contact_phone)throw new MessengerAuthError('CONTACT_REQUIRED',409);
        const [candidates]=await conn.query(`SELECT u.id,u.phone FROM app_users u
          WHERE u.tenant_id=? AND u.is_active=1 AND u.employee_status='active'
            AND EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles tr ON tr.id=ur.role_id AND tr.tenant_id=ur.tenant_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)
          FOR UPDATE`,[tenantId]);
        const matches=candidates.filter(employee=>require('./helpers').normalizePhone(employee.phone)===r.contact_phone);
        if(matches.length!==1)throw new MessengerAuthError('EMPLOYEE_CONTACT_CONFLICT',403);
        accountId=Number(matches[0].id);
        const [other]=await conn.query(`SELECT a.account_id FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
          JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id<>? AND c.provider=? AND c.provider_user_id=?`,[tenantId,accountId,provider,uid]);
        if(other.length)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
        const existing=await loadAccountLink(conn,{tenantId,accountType:'employee',accountId},true);
        if(existing&&channel&&Number(existing.person_id)!==Number(channel.person_id))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
        let personId=Number(existing?.person_id||channel?.person_id||0);
        if(!personId){const [person]=await conn.query('INSERT INTO auth_people (created_at,updated_at) VALUES (NOW(),NOW())');personId=Number(person.insertId);}
        if(!channel){const [createdChannel]=await conn.query('INSERT INTO auth_messenger_channels (person_id,provider,provider_user_id,verified_at) VALUES (?,?,?,NOW())',[personId,provider,uid]);channel={id:createdChannel.insertId,person_id:personId};}
        let accountLinkId=existing?.id;
        if(!accountLinkId){const [accountLink]=await conn.query("INSERT INTO auth_account_links (person_id,tenant_id,account_type,account_id,linked_at) VALUES (?,?,'employee',?,NOW())",[personId,tenantId,accountId]);accountLinkId=accountLink.insertId;}
        await conn.query('INSERT INTO auth_account_messenger_links (account_link_id,channel_id,provider,verified_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id),verified_at=NOW()',[accountLinkId,channel.id,provider]);
      }
      await ensureEmployeeCustomer(conn,tenantId,accountId,{provider,providerUserId:uid,phone:r.contact_phone,requirePhone:true});
    } else {
      const policy=customerPolicy;
      if(!policy[provider])throw new MessengerAuthError('CUSTOMER_CHANNEL_DISABLED',403);
      if(!r.contact_verified_at||!r.contact_phone)throw new MessengerAuthError('CONTACT_REQUIRED',409);
      const [customers] = await conn.query(`SELECT DISTINCT c.id FROM cust_customers c WHERE c.tenant_id=? AND (
        c.${column}=? OR EXISTS(SELECT 1 FROM cust_customer_auth_identities i WHERE i.tenant_id=c.tenant_id AND i.customer_id=c.id AND i.provider=? AND i.provider_user_id=?)
        OR EXISTS(SELECT 1 FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
          JOIN auth_messenger_channels ch ON ch.id=m.channel_id AND ch.person_id=a.person_id AND ch.revoked_at IS NULL
          WHERE a.tenant_id=c.tenant_id AND a.account_type='customer' AND a.account_id=c.id AND ch.provider=? AND ch.provider_user_id=?))
        LIMIT 2 FOR UPDATE`, [tenantId,uid,provider,uid,provider,uid]);
      if (customers.length > 1) throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT');
      if(r.purpose==='profile_link' && customers.length){
        // Existing identity, not a phone match, proves which account is being entered.
        // Keep the guest/browser binding, but never overwrite this account's profile.
        r.purpose='login';
        await conn.query("UPDATE auth_browser_requests SET purpose='login' WHERE public_id=?",[r.public_id]);
      }
      if (customers.length) accountId = Number(customers[0].id);
      else {
        if (!r.contact_verified_at || !r.contact_phone) throw new MessengerAuthError('CONTACT_REQUIRED');
        const candidate=await findPhoneCustomer(conn,tenantId,r.contact_phone);
        if(r.purpose==='profile_link' && candidate && Number(candidate.guest_bonus_only)!==1){
          r.purpose='login';
          profileLinkResolvedAsLogin=true;
          await conn.query("UPDATE auth_browser_requests SET purpose='login' WHERE public_id=?",[r.public_id]);
        }
        if(candidate){
          if(Number(candidate.guest_bonus_only)===1){
            const [[owned]]=await conn.query(`SELECT
              EXISTS(SELECT 1 FROM order_orders WHERE tenant_id=? AND customer_id=?) orders,
              EXISTS(SELECT 1 FROM cust_customer_addresses WHERE tenant_id=? AND customer_id=?) addresses,
              EXISTS(SELECT 1 FROM cust_customer_sessions WHERE tenant_id=? AND customer_id=?) sessions`,
              [tenantId,candidate.id,tenantId,candidate.id,tenantId,candidate.id]);
            if(candidate.phone_verified_at||Number(owned.orders)||Number(owned.addresses)||Number(owned.sessions))throw new MessengerAuthError('GUEST_PROFILE_CONFLICT',409);
          }
          if(candidate.phone_verified_at&&!profileLinkResolvedAsLogin){await assertCustomerRelink(conn,tenantId,candidate.id,provider,uid,r.contact_phone);relinkedCustomerId=Number(candidate.id);}
          const [priorIdentities]=await conn.query('SELECT id FROM cust_customer_auth_identities WHERE tenant_id=? AND customer_id=? LIMIT 1',[tenantId,candidate.id]);
          const [priorLinks]=await conn.query("SELECT m.id FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id WHERE a.tenant_id=? AND a.account_type='customer' AND a.account_id=? LIMIT 1",[tenantId,candidate.id]);
          const [[legacyCandidate]]=await conn.query('SELECT telegram_user_id,max_user_id FROM cust_customers WHERE tenant_id=? AND id=?',[tenantId,candidate.id]);
          if(priorIdentities.length || priorLinks.length || legacyCandidate.telegram_user_id || legacyCandidate.max_user_id)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
          accountId=Number(candidate.id);
        }
        else{
          const [created] = await conn.query("INSERT INTO cust_customers (tenant_id,name,phone,phone_verified_at,is_active,registration_date) VALUES (?,?,?,NOW(),1,CURDATE())", [tenantId,r.contact_name || 'Клиент',r.contact_phone]);
          accountId = Number(created.insertId);
        }
      }
      await assertAccountActive(conn,{tenantId,accountType:'customer',accountId});
      const phoneMatch=await findPhoneCustomer(conn,tenantId,r.contact_phone);
      if(phoneMatch && Number(phoneMatch.id)!==accountId)throw new MessengerAuthError('CUSTOMER_PHONE_CONFLICT',409);
      const [legacy]=await conn.query(`SELECT ${column} provider_user_id FROM cust_customers WHERE tenant_id=? AND id=? FOR UPDATE`,[tenantId,accountId]);
      const [identities]=await conn.query('SELECT provider_user_id FROM cust_customer_auth_identities WHERE tenant_id=? AND customer_id=? AND provider=? FOR UPDATE',[tenantId,accountId,provider]);
      if([...legacy,...identities].some(c=>c.provider_user_id && String(c.provider_user_id)!==uid))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
      const existing = await loadAccountLink(conn,{tenantId,accountType:'customer',accountId},true);
      if(existing){
        const [prior]=await conn.query('SELECT c.provider_user_id FROM auth_account_messenger_links m JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE m.account_link_id=? AND m.provider=?',[existing.id,provider]);
        if(prior.some(c=>String(c.provider_user_id)!==uid))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT');
      }
      if (existing && channel && Number(existing.person_id)!==Number(channel.person_id)) throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT');
      let personId = Number(channel?.person_id || existing?.person_id || 0);
      if (!personId) { const [p] = await conn.query('INSERT INTO auth_people (created_at,updated_at) VALUES (NOW(),NOW())'); personId=Number(p.insertId); }
      if (!channel) { const [c] = await conn.query('INSERT INTO auth_messenger_channels (person_id,provider,provider_user_id,verified_at) VALUES (?,?,?,NOW())',[personId,provider,uid]); channel={id:c.insertId,person_id:personId}; }
      let accountLinkId=existing?.id;
      if (!accountLinkId) { const [a] = await conn.query("INSERT INTO auth_account_links (person_id,tenant_id,account_type,account_id,linked_at) VALUES (?,?,'customer',?,NOW())",[personId,tenantId,accountId]); accountLinkId=a.insertId; }
      await conn.query('INSERT INTO auth_account_messenger_links (account_link_id,channel_id,provider,verified_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id),verified_at=NOW()',[accountLinkId,channel.id,provider]);
      await conn.query(`UPDATE cust_customers SET ${column}=?,phone=?,phone_verified_at=NOW(),guest_bonus_only=0,updated_at=NOW() WHERE tenant_id=? AND id=?`,[uid,r.contact_phone,tenantId,accountId]);
      await conn.query("UPDATE cust_customer_sessions SET is_active=0,revoked_at=NOW() WHERE tenant_id=? AND customer_id=? AND auth_strength='weak'",[tenantId,accountId]);
      await conn.query(`UPDATE cust_customer_sessions SET expires_at=NULL
        WHERE tenant_id=? AND customer_id=? AND auth_strength='strong' AND is_active=1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())`,[tenantId,accountId]);
      await conn.query('INSERT INTO cust_customer_auth_identities (tenant_id,customer_id,provider,provider_user_id,linked_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE provider_user_id=VALUES(provider_user_id)',[tenantId,accountId,provider,uid]);
    }
    await conn.query("UPDATE auth_browser_requests SET state='confirmed',account_id=?,expires_at=IF(account_type='customer' AND guest_session_hash IS NULL,DATE_ADD(NOW(),INTERVAL 10 MINUTE),expires_at) WHERE public_id=?",[accountId,r.public_id]);
    await conn.commit();
    if(relinkedCustomerId)console.info('CUSTOMER_MESSENGER_RELINKED',{tenantId,provider,accountRef:crypto.createHash('sha256').update(`${tenantId}:${relinkedCustomerId}`).digest('hex').slice(0,16)});
    return { ok:true,confirmed:true,purpose:r.purpose,accountType:r.account_type,context:r.purpose==='profile_link'?'PROFILE_LINK':r.account_type==='customer'?'LOGIN':undefined,guestConfirmed:r.purpose==='profile_link',autoConfirmed:Boolean(contact) };
  } catch (error) {
    await conn.rollback();
    if (error instanceof MessengerAuthError) {
      console.warn('BROWSER_BOT_ACTION_REJECTED',{tenantId,provider,reason:error.code});
      if(guestRequestId)await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE public_id=? AND state IN ('pending','started')",[guestRequestId]);
      return {ok:false,error:error.code,...(guestRequestId?{context:'PROFILE_LINK'}:{})};
    }
    throw error;
  } finally { conn.release(); }
}

// Password verification remains in /api/auth/login. This only attaches the verified account
// to the same browser-bound request; it never creates employees or issues sessions.
async function proveBrowserEmployee(db,{tenantId,accountId,requestId,binding,passwordHash,authVersion}) {
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    const [requests]=await conn.query("SELECT *,expires_at>NOW() valid FROM auth_browser_requests WHERE public_id=? AND tenant_id=? AND account_type='employee' FOR UPDATE",[requestId,tenantId]);
    const r=requests[0];
    if(!r || !safeEqual(r.browser_hash,tokenHash(binding || '')) || !Number(r.valid) || r.state!=='started' || r.purpose!=='login'
      || !r.contact_verified_at || !r.contact_phone || !r.provider_user_id) throw new MessengerAuthError('REQUEST_INVALID',403);
    await assertAccountActive(conn,{tenantId,accountType:'employee',accountId});
    const [tenants]=await conn.query('SELECT id FROM ten_tenants WHERE id=? AND is_active=1 FOR UPDATE',[tenantId]);
    if(!tenants.length)throw new MessengerAuthError('TENANT_BLOCKED',403);
    const [employees]=await conn.query('SELECT id,phone,password_hash,auth_version,is_active,employee_status,must_change_password FROM app_users WHERE tenant_id=? AND phone IS NOT NULL FOR UPDATE',[tenantId]);
    const matches=employees.filter(e=>require('./helpers').normalizePhone(e.phone)===r.contact_phone);
    if(matches.length!==1 || Number(matches[0].id)!==Number(accountId))throw new MessengerAuthError('EMPLOYEE_CONTACT_CONFLICT',403);
    const current=matches[0];
    if(current.password_hash!==passwordHash || Number(current.auth_version)!==Number(authVersion) || Number(current.is_active)!==1
      || current.employee_status!=='active' || Number(current.must_change_password))throw new MessengerAuthError('INVALID_CREDENTIALS',401);
    const [roles]=await conn.query('SELECT ur.role_id FROM user_roles ur JOIN tenant_roles tr ON tr.tenant_id=ur.tenant_id AND tr.id=ur.role_id WHERE ur.tenant_id=? AND ur.user_id=? LIMIT 1',[tenantId,accountId]);
    if(!roles.length)throw new MessengerAuthError('ROLE_NOT_ASSIGNED',403);
    const [channels]=await conn.query('SELECT id,person_id,revoked_at FROM auth_messenger_channels WHERE provider=? AND provider_user_id=? FOR UPDATE',[r.provider,r.provider_user_id]);
    let channel=channels[0];
    if(channel?.revoked_at)throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
    const [other]=await conn.query(`SELECT a.account_id FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
      JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id<>? AND c.provider=? AND c.provider_user_id=?`,[tenantId,accountId,r.provider,r.provider_user_id]);
    if(other.length)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
    const scope={tenantId,accountType:'employee',accountId};
    const existing=await loadAccountLink(conn,scope,true);
    if(existing && channel && Number(existing.person_id)!==Number(channel.person_id))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
    const [prior]=await conn.query(`SELECT c.provider_user_id FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
      JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id=? AND m.provider=?`,[tenantId,accountId,r.provider]);
    if(prior.some(c=>c.provider_user_id!==r.provider_user_id))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
    let personId=Number(existing?.person_id || channel?.person_id || 0);
    if(!personId){const [p]=await conn.query('INSERT INTO auth_people (created_at,updated_at) VALUES (NOW(),NOW())');personId=p.insertId;}
    if(!channel){const [c]=await conn.query('INSERT INTO auth_messenger_channels (person_id,provider,provider_user_id,verified_at) VALUES (?,?,?,NOW())',[personId,r.provider,r.provider_user_id]);channel={id:c.insertId};}
    let linkId=existing?.id;
    if(!linkId){const [a]=await conn.query("INSERT INTO auth_account_links (person_id,tenant_id,account_type,account_id,linked_at) VALUES (?,?,'employee',?,NOW())",[personId,tenantId,accountId]);linkId=a.insertId;}
    await conn.query('INSERT INTO auth_account_messenger_links (account_link_id,channel_id,provider,verified_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE verified_at=NOW()',[linkId,channel.id,r.provider]);
    await ensureEmployeeCustomer(conn,tenantId,accountId,{provider:r.provider,providerUserId:r.provider_user_id,phone:r.contact_phone,requirePhone:true});
    await conn.commit();
    return {ok:true,state:'pending',required_action:'confirm_in_bot'};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function consumeBrowserRequest(db, { tenantId, accountType, requestId, binding, guestToken, storeId=1, cancel, onVerified }) {
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]=await conn.query('SELECT *, (expires_at>NOW()) AS valid FROM auth_browser_requests WHERE public_id=? AND tenant_id=? AND account_type=? FOR UPDATE',[requestId,tenantId,accountType]);
    const r=rows[0];
    if (!r || !safeEqual(r.browser_hash,tokenHash(binding || ''))) throw new MessengerAuthError('REQUEST_INVALID',403);
    if(r.guest_session_hash){
      const guest=await require('./helpers/customerAuth').getGuest(conn,tenantId,guestToken,true,storeId);
      if(!guest || !safeEqual(r.guest_session_hash,guest.token_hash))throw new MessengerAuthError('GUEST_SESSION_MISMATCH',403);
    }
    if (cancel) {
      await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE public_id=? AND state IN ('pending','started','confirmed')",[requestId]);
      await conn.commit();
      await markOperation(db, cleanupOperationId('browser', requestId), 'cancelled');
      return {ok:true,state:'cancelled'};
    }
    if (Number(r.valid)!==1 || ['consumed','cancelled'].includes(r.state)) {
      if (Number(r.valid)!==1) await markOperation(db, cleanupOperationId('browser', requestId), 'expired');
      throw new MessengerAuthError('REQUEST_EXPIRED',409);
    }
    if(r.state!=='confirmed'){
      let requiredAction='confirm_in_bot';
      if(r.state==='started'){
        const linked=await hasBrowserAccountBinding(conn,{tenantId,accountType,provider:r.provider,uid:r.provider_user_id});
        if(!linked){
          requiredAction = !r.contact_verified_at ? 'share_contact' : 'confirm_in_bot';
          if(accountType==='customer' && r.contact_verified_at){
            const candidate=await findPhoneCustomer(conn,tenantId,r.contact_phone);
            if(candidate){
              requiredAction='share_contact';
            }
          }
        }
      }
      await conn.commit();return {ok:true,state:'pending',required_action:requiredAction};
    }
    await assertAccountActive(conn,{tenantId,accountType,accountId:r.account_id});
    const [currentLinks]=await conn.query(`SELECT c.id FROM auth_account_links a
      JOIN auth_account_messenger_links m ON m.account_link_id=a.id
      JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
      WHERE a.tenant_id=? AND a.account_type=? AND a.account_id=? AND c.provider=? AND c.provider_user_id=? LIMIT 1`,
      [tenantId,accountType,r.account_id,r.provider,r.provider_user_id]);
    if(!currentLinks.length)throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
    const value=await onVerified(conn,r);
    await conn.query("UPDATE auth_browser_requests SET state='consumed' WHERE public_id=?",[requestId]);
    await conn.commit();
    await markOperation(db, cleanupOperationId('browser', requestId), 'success');
    return {ok:true,state:'confirmed',...value};
  } catch(error){await conn.rollback();throw error;} finally{conn.release();}
}

async function verifyBrowserCode(db,{tenantId,accountType,requestId,binding,code,validateAccount,onVerified}){
  const [rows]=await db.query('SELECT *,expires_at>NOW() valid FROM auth_browser_requests WHERE public_id=? AND tenant_id=? AND account_type=?',[requestId,tenantId,accountType]);
  const r=rows[0];
  if(!r || !safeEqual(r.browser_hash,tokenHash(binding || '')) || !Number(r.valid) || r.state!=='pending' || !r.code_challenge_id || !r.account_id)throw new MessengerAuthError('REQUEST_INVALID',403);
  const result=await verifyCodeChallenge(db,{tenantId,accountType,accountId:r.account_id,purpose:'login',requestId:r.code_challenge_id,code,onVerified:async(conn,challenge)=>{
    const [[current]]=await conn.query('SELECT *,expires_at>NOW() valid FROM auth_browser_requests WHERE public_id=? AND tenant_id=? FOR UPDATE',[requestId,tenantId]);
    if(!Number(current?.valid) || current.state!=='pending' || current.code_challenge_id!==r.code_challenge_id)throw new MessengerAuthError('REQUEST_EXPIRED',409);
    await validateAccount(conn,current,challenge);
    // OTP proves the already-verified identity; guest ownership is still checked
    // against the stored session hash in customerBrowserSession/promoteGuest.
    current.state='confirmed';current.contact_phone=current.requested_phone;current.contact_verified_at=true;
    const value=await onVerified(conn,current);
    await conn.query("UPDATE auth_browser_requests SET state='consumed' WHERE public_id=?",[requestId]);return value;
  }});
  await markOperation(db, cleanupOperationId('browser', requestId), 'success');
  return result.value;
}

async function verifyCustomerBrowserCode(db,options){
  return verifyBrowserCode(db,{...options,accountType:'customer',validateAccount:async(conn,current,challenge)=>{
    const policy=await require('./helpers/customerAuth').settings(conn,options.tenantId);
    if(!policy[current.provider])throw new MessengerAuthError('CUSTOMER_CHANNEL_DISABLED',403);
    await require('./messengerDelivery').getTenantBotConfig(conn,options.tenantId,current.provider,{customer:true});
    const [links]=await conn.query(`SELECT c.id FROM cust_customers c JOIN auth_account_links a ON a.tenant_id=c.tenant_id AND a.account_type='customer' AND a.account_id=c.id
      JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.provider=? AND m.channel_id=?
      JOIN auth_messenger_channels ch ON ch.id=m.channel_id AND ch.person_id=a.person_id AND ch.revoked_at IS NULL
      WHERE c.tenant_id=? AND c.id=? AND c.phone=? AND c.phone_verified_at IS NOT NULL LIMIT 1`,[current.provider,challenge.channel_id,options.tenantId,current.account_id,current.requested_phone]);
    if(!links.length)throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
  }});
}

async function verifyEmployeeBrowserCode(db,options){
  return verifyBrowserCode(db,{...options,accountType:'employee',validateAccount:async(conn,current,challenge)=>{
    await require('./messengerDelivery').getTenantBotConfig(conn,options.tenantId,current.provider);
    const [links]=await conn.query(`SELECT u.id FROM app_users u
      JOIN ten_tenants t ON t.id=u.tenant_id AND t.is_active=1
      JOIN auth_account_links a ON a.tenant_id=u.tenant_id AND a.account_type='employee' AND a.account_id=u.id
      JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.provider=? AND m.channel_id=?
      JOIN auth_messenger_channels ch ON ch.id=m.channel_id AND ch.person_id=a.person_id AND ch.revoked_at IS NULL
      WHERE u.tenant_id=? AND u.id=? AND u.is_active=1 AND u.employee_status='active'
        AND EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles tr ON tr.id=ur.role_id AND tr.tenant_id=ur.tenant_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)
      LIMIT 1`,[current.provider,challenge.channel_id,options.tenantId,current.account_id]);
    if(!links.length)throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
  }});
}

module.exports = {
  verifyCustomerBrowserCode,
  verifyEmployeeBrowserCode,
  assertBrowserSchema,
  browserBinding, createBrowserRequest, browserBotAction, consumeBrowserRequest, proveBrowserEmployee,
  completeBotLoginRequest,
  MessengerAuthError,
  completeLinkChallenge,
  createLinkChallenge,
  ensureLegacyCustomerAccount,
  getAccountChannels,
  issueCodeChallenge,
  maskProviderUserId,
  processWebhookEvent,
  unlinkAccountChannel,
  verifyCodeChallenge,
};
