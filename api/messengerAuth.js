const crypto = require('crypto');
const { promisify } = require('util');
const { telegramErrorReason } = require('./telegramApi');
const { ensureEmployeeCustomer } = require('./helpers/employeeCustomer');
const {
  ensureBrowserOperation,
  ensureChallengeOperation,
  syncBrowserCleanupDeadline,
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

function monotonicMs() {
  return Number(process.hrtime.bigint()) / 1e6;
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
       AND EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles tr ON tr.id=ur.role_id AND tr.tenant_id=ur.tenant_id
         WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)
     LIMIT 1 FOR UPDATE`,
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

async function assertEmployeeSessionVersion(conn,scope,authVersion){
  const [[employee]]=await conn.query('SELECT auth_version FROM app_users WHERE tenant_id=? AND id=? FOR UPDATE',[scope.tenantId,scope.accountId]);
  if(!employee || !Number.isFinite(Number(authVersion)) || Number(employee.auth_version)!==Number(authVersion))
    throw new MessengerAuthError('SESSION_REVOKED',401);
}

async function createLinkChallenge(db, rawScope, rawProvider, {sessionToken,authVersion} = {}) {
  const scope=normalizeScope(rawScope);
  if(scope.accountType!=='customer'){
    const conn=await db.getConnection();
    try{
      await conn.beginTransaction();
      await assertEmployeeSessionVersion(conn,scope,authVersion);
      const result=await createLinkChallengeLocked(conn,scope,rawProvider,null,true);
      await conn.commit();return result;
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[scope.tenantId]);
    const [[session]]=await conn.query(`SELECT id FROM cust_customer_sessions
      WHERE tenant_id=? AND customer_id=? AND token=? AND auth_strength='strong' AND is_active=1
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) FOR UPDATE`,
    [scope.tenantId,scope.accountId,sessionToken || '']);
    if(!session)throw new MessengerAuthError('STRONG_AUTH_REQUIRED',403);
    const result=await createLinkChallengeLocked(conn,scope,rawProvider,session.id);
    await conn.commit();
    return result;
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

// Called under the tenant lock. Browser OTP and employee operations have their own lifecycle.
async function activateCustomerOperation(conn, {tenantId, provider, uid, browserId = '', challengeId = '', accountType='customer'}) {
  if(accountType==='employee'){
    const [[customer]]=await conn.query(`SELECT public_id FROM auth_browser_requests
      WHERE tenant_id=? AND provider=? AND provider_user_id=? AND account_type='customer'
        AND state='started' AND expires_at>NOW() AND code_challenge_id IS NULL
      UNION ALL SELECT public_id FROM auth_verification_challenges
      WHERE tenant_id=? AND provider=? AND completed_provider_user_id=? AND account_type='customer'
        AND purpose='link' AND consumed_at IS NULL AND expires_at>NOW() LIMIT 1`,[tenantId,provider,uid,tenantId,provider,uid]);
    if(customer)throw new MessengerAuthError('CONTACT_REQUEST_AMBIGUOUS',409);
  }
  const [browser]=await conn.query(`SELECT public_id,state FROM auth_browser_requests
    WHERE tenant_id=? AND provider=? AND provider_user_id=? AND account_type=?
      AND code_challenge_id IS NULL AND public_id<>?`,[tenantId,provider,uid,accountType,browserId]);
  const [links]=await conn.query(`SELECT public_id,consumed_at,delivery_status FROM auth_verification_challenges
    WHERE tenant_id=? AND provider=? AND completed_provider_user_id=? AND account_type=?
      AND purpose='link' AND public_id<>?`,[tenantId,provider,uid,accountType,challengeId]);
  const waiting=browser.filter(row=>row.state==='started').map(row=>row.public_id);
  const linking=links.filter(row=>!row.consumed_at && row.delivery_status==='pending').map(row=>row.public_id);
  if(waiting.length)await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE public_id IN (?) AND state='started'",[waiting]);
  if(linking.length)await conn.query("UPDATE auth_verification_challenges SET consumed_at=NOW(),delivery_status='failed' WHERE public_id IN (?) AND consumed_at IS NULL",[linking]);
  // A previous native keyboard may still be usable. Its contact can supply
  // phone proof but only a button bound to this operation can finish it.
  if(accountType==='employee')return Boolean(waiting.length || linking.length);
  await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE tenant_id=? AND provider=? AND provider_user_id=? AND account_type='employee' AND code_challenge_id IS NULL AND state='started'",[tenantId,provider,uid]);
  await conn.query("UPDATE auth_verification_challenges SET consumed_at=NOW(),delivery_status='failed' WHERE tenant_id=? AND provider=? AND completed_provider_user_id=? AND account_type='employee' AND purpose='link' AND consumed_at IS NULL",[tenantId,provider,uid]);
  if(browser.length || links.length)return true;
  const [[previousEmployeeContact]]=await conn.query(`SELECT 1 FROM auth_browser_requests
    WHERE tenant_id=? AND provider=? AND provider_user_id=? AND account_type='employee' AND code_challenge_id IS NULL
    UNION ALL SELECT 1 FROM auth_verification_challenges
    WHERE tenant_id=? AND provider=? AND completed_provider_user_id=? AND account_type='employee' AND purpose='link'
    LIMIT 1`,[tenantId,provider,uid,tenantId,provider,uid]);
  return Boolean(previousEmployeeContact);
}

async function createLinkChallengeLocked(db, rawScope, rawProvider, sessionId = null, deferredCleanup = false) {
  const scope = normalizeScope(rawScope);
  const provider = normalizeProvider(rawProvider);
  await assertAccountActive(db, scope);
  const token = randomLinkToken();
  const publicId = randomPublicId();
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  const [replacedChallenges] = sessionId ? [[]] : await db.query(
    `SELECT public_id FROM auth_verification_challenges
     WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose='link'
       AND provider=? AND consumed_at IS NULL`,
    [scope.tenantId, scope.accountType, scope.accountId, provider]
  );
  await db.query(
    `UPDATE auth_verification_challenges
     SET consumed_at=NOW(),delivery_status='failed'
     WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose='link'
       AND provider=? AND consumed_at IS NULL`,
    [scope.tenantId, scope.accountType, scope.accountId, provider]
  );
  await db.query(
    `INSERT INTO auth_verification_challenges
     (public_id, tenant_id, account_type, account_id, purpose, provider, token_hash,
      delivery_status, expires_at, resend_after ${sessionId?',customer_session_id':''})
     VALUES (?, ?, ?, ?, 'link', ?, ?, 'sent',
       DATE_ADD(NOW(6), INTERVAL 10 MINUTE), DATE_ADD(NOW(6), INTERVAL 10 MINUTE)${sessionId?',?':''})`,
    [publicId, scope.tenantId, scope.accountType, scope.accountId, provider, tokenHash(token),...(sessionId?[sessionId]:[])]
  );
  await ensureChallengeOperation(db, {
    publicId, tenantId: scope.tenantId, provider, purpose: 'link', expiresInSeconds: LINK_TTL_MS / 1000,
  });
  if(scope.accountType!=='customer' && !deferredCleanup)for (const replaced of replacedChallenges) {
    await markOperation(db, cleanupOperationId('challenge', replaced.public_id), 'cancelled');
  }
  return { token, publicId, provider, expiresAt, context: scope.accountType === 'customer' ? 'PROFILE_LINK' : 'EMPLOYEE_LINK' };
}

async function adoptUnlinkedCustomerChannel(conn, channel, personId, provider, uid) {
  if (channel.revoked_at) throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
  const column = provider === 'tg' ? 'telegram_user_id' : 'max_user_id';
  const [[binding]] = await conn.query('SELECT 1 FROM auth_account_messenger_links WHERE channel_id=? LIMIT 1 FOR UPDATE',[channel.id]);
  const [[identity]] = await conn.query('SELECT 1 FROM cust_customer_auth_identities WHERE provider=? AND provider_user_id=? LIMIT 1 FOR UPDATE',[provider,uid]);
  const [[legacy]] = await conn.query(`SELECT 1 FROM cust_customers WHERE ${column}=? LIMIT 1 FOR UPDATE`,[uid]);
  if (binding || identity || legacy) throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
  await conn.query('UPDATE auth_messenger_channels SET person_id=? WHERE id=? AND revoked_at IS NULL',[personId,channel.id]);
  channel.person_id = personId;
}

async function completeLinkChallenge(db, rawProvider, providerUserId, rawToken, expectedTenantId, options = {}) {
  let failedContactChallengeId=null;
  let resultContext=null;
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
  const reference = /^c_[A-Za-z0-9_-]{43}$/.test(linkToken);
  if (!normalizedProviderUserId || (!contact && !reference && !/^a_[A-Za-z0-9_-]{40}$/.test(linkToken))) return { matched: false };

  const conn = await db.getConnection();
  try {
    const lookup = contact ? 'completed_provider_user_id' : reference ? 'public_id' : 'token_hash';
    const lookupValue = contact ? normalizedProviderUserId : reference ? linkToken.slice(2) : tokenHash(linkToken);
    const customerOnly = options.customerOnly || reference;
    const [[customerOperation]] = options.employeeOnly ? [[]] : await conn.query(`SELECT id FROM auth_verification_challenges
      WHERE tenant_id=? AND account_type='customer' AND provider=? AND purpose='link' AND ${lookup}=? LIMIT 1`,
    [expectedTenantId,provider,lookupValue]);
    await conn.beginTransaction();
    if(customerOperation || customerOnly)await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[expectedTenantId]);
    const contactTarget = contact && options.contactTarget;
    const [challengeRows] = await conn.query(
      `SELECT id, public_id, tenant_id, account_type, account_id, consumed_at, expires_at, delivery_status,
              (expires_at>NOW(6)) expires_valid, completed_provider_user_id,
              customer_contact_phone, customer_contact_fenced, customer_prompt_at, customer_session_id
       FROM auth_verification_challenges
       WHERE provider=? AND purpose='link' ${customerOnly ? "AND account_type='customer'" : ''}
         ${options.employeeOnly ? "AND account_type='employee'" : ''} AND ${lookup}=?
         ${contact ? "AND tenant_id=? AND delivery_status='pending' AND consumed_at IS NULL AND expires_at>NOW()" : ''}
         ${contactTarget ? 'AND public_id=?' : ''} LIMIT 2 FOR UPDATE`,
      [provider, lookupValue,...(contact ? [Number(expectedTenantId)] : []),...(contactTarget ? [contactTarget] : [])]
    );
    if (challengeRows.length !== 1) {
      await conn.rollback();
      if (contact && challengeRows.length === 0) return { matched: false };
      return { matched: true, ok: false, error: 'LINK_INVALID_OR_EXPIRED' };
    }
    const challenge = challengeRows[0];
    if(contact || reference || challenge.account_type==='customer')failedContactChallengeId=challenge.id;
    if (Number(expectedTenantId) !== Number(challenge.tenant_id)) {
      await conn.rollback();
      return { matched: true, ok: false, error: 'LINK_INVALID_OR_EXPIRED' };
    }
    if (challenge.consumed_at || !Number(challenge.expires_valid)) {
      if(challenge.account_type==='customer') { await conn.rollback();return {matched:true,ok:true,silent:true,context:'PROFILE_LINK'}; }
      await conn.rollback();
      return { matched: true, ok: false, error: 'LINK_INVALID_OR_EXPIRED' };
    }
    const scope = normalizeScope({
      tenantId: challenge.tenant_id,
      accountType: challenge.account_type,
      accountId: challenge.account_id,
    });
    const context = scope.accountType === 'customer' ? 'PROFILE_LINK' : 'EMPLOYEE_LINK';
    resultContext=context;
    if(scope.accountType==='employee' && provider==='tg' && contact
        && (!contactTarget || !challenge.customer_prompt_at || challenge.customer_contact_phone
          || !Number.isFinite(Number(contact.date))
          || Number(contact.date)<Math.floor(new Date(challenge.customer_prompt_at).getTime()/1000))){
      await conn.rollback();return {ok:true,silent:true,context};
    }
    if(scope.accountType==='customer'){
      if(!(await require('./helpers/customerAuth').settings(conn,scope.tenantId))[provider])throw new MessengerAuthError('CUSTOMER_CHANNEL_DISABLED',403);
      if (provider==='tg' && contact
          && (!contactTarget || !challenge.customer_prompt_at || challenge.customer_contact_phone
            || !Number.isFinite(Number(contact.date))
            || Number(contact.date)<Math.floor(new Date(challenge.customer_prompt_at).getTime()/1000))) {
        await conn.rollback();
        return {matched:true,ok:true,silent:true,context};
      }
      if(challenge.completed_provider_user_id && String(challenge.completed_provider_user_id)!==normalizedProviderUserId){
        await conn.rollback();
        return {matched:true,ok:true,silent:true,context};
      }
      const [[session]]=await conn.query(`SELECT id FROM cust_customer_sessions
        WHERE tenant_id=? AND customer_id=? AND id=? AND auth_strength='strong' AND is_active=1
          AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) FOR UPDATE`,
      [scope.tenantId,scope.accountId,challenge.customer_session_id]);
      if(!session)throw new MessengerAuthError('STRONG_AUTH_REQUIRED',403);
      if(reference){
        confirmedPhone=challenge.customer_contact_phone;
        if(!confirmedPhone || challenge.delivery_status!=='pending')throw new MessengerAuthError('REQUEST_NOT_STARTED');
      }else if(!contact){
        const fenced=await activateCustomerOperation(conn,{tenantId:scope.tenantId,provider,uid:normalizedProviderUserId,challengeId:challenge.public_id});
        if(challenge.delivery_status!=='pending'){
          await conn.query('UPDATE auth_verification_challenges SET customer_contact_fenced=? WHERE id=?',[fenced?1:0,challenge.id]);
        }else{
          await conn.commit();
          if(challenge.customer_prompt_at)return {matched:true,ok:true,silent:true,context};
          return {matched:true,ok:true,context,contactRequired:!challenge.customer_contact_phone,
            linkConfirmation:Boolean(challenge.customer_contact_phone),reference:`c_${challenge.public_id}`};
        }
      }
    }
    await assertAccountActive(conn, scope);
    if (scope.accountType === 'employee') {
      if(options.employeeEnabled===false)throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
      if(!contact && !reference){
        await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[scope.tenantId]);
        await activateCustomerOperation(conn,{tenantId:scope.tenantId,provider,uid:normalizedProviderUserId,challengeId:challenge.public_id,accountType:'employee'});
      }
      if(contact){
        const [[employee]]=await conn.query('SELECT phone FROM app_users WHERE tenant_id=? AND id=? FOR UPDATE',[scope.tenantId,scope.accountId]);
        if(!confirmedPhone || require('./helpers').normalizePhone(employee?.phone)!==confirmedPhone)
          throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      }
      const [roles] = await conn.query(
        `SELECT ur.role_id FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
         WHERE ur.tenant_id=? AND ur.user_id=? LIMIT 1`, [scope.tenantId, scope.accountId]
      );
      if (!roles.length) throw new MessengerAuthError('ROLE_NOT_ASSIGNED', 403);
    }
    const account = await loadAccountLink(conn, scope, true);
    if ((scope.accountType === 'customer' || scope.accountType === 'employee' || provider === 'tg' && options.requireContact) && !contact && !reference) {
      const [proof] = await conn.query(
        `SELECT c.id FROM auth_account_links a
         JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.provider=?
         JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
         WHERE a.tenant_id=? AND a.account_type=? AND a.account_id=? AND c.provider_user_id=?
           AND ${scope.accountType === 'employee'
             ? "m.verified_at IS NOT NULL AND c.verified_at IS NOT NULL"
             : "EXISTS (SELECT 1 FROM cust_customers cc WHERE cc.tenant_id=a.tenant_id AND cc.id=a.account_id AND cc.phone_verified_at IS NOT NULL)"}
         LIMIT 1`, [provider, scope.tenantId, scope.accountType, scope.accountId, normalizedProviderUserId]
      );
      if (!proof.length) {
        if (challenge.completed_provider_user_id && String(challenge.completed_provider_user_id) !== normalizedProviderUserId) {
          throw new MessengerAuthError('LINK_USER_CONFLICT', 409);
        }
        await conn.query(
          `UPDATE auth_verification_challenges SET delivery_status='pending', completed_provider_user_id=? WHERE id=?`,
          [normalizedProviderUserId, Number(challenge.id)]
        );
        await conn.commit();
        return { matched: true, ok: true, contactRequired: true, context, accountType:scope.accountType, reference:`c_${challenge.public_id}` };
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
    if(contact && scope.accountType==='customer' && Number(challenge.customer_contact_fenced)===1){
      if(challenge.customer_contact_phone && challenge.customer_contact_phone!==confirmedPhone)throw new MessengerAuthError('CONTACT_CONFLICT');
      if(!challenge.customer_contact_phone)await conn.query('UPDATE auth_verification_challenges SET customer_contact_phone=?,customer_prompt_at=NULL WHERE id=?',[confirmedPhone,challenge.id]);
      await conn.commit();
      return {matched:true,ok:true,context,linkConfirmation:true,reference:`c_${challenge.public_id}`,
        silent:Boolean(challenge.customer_contact_phone && challenge.customer_prompt_at)};
    }
    const [channelRows] = await conn.query(
      `SELECT id, person_id, revoked_at FROM auth_messenger_channels
       WHERE provider=? AND provider_user_id=?
       LIMIT 1 FOR UPDATE`,
      [provider, normalizedProviderUserId]
    );
    const existingChannel = channelRows[0] || null;
    if(existingChannel?.revoked_at)throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);

    if (account && existingChannel && Number(account.person_id) !== Number(existingChannel.person_id)) {
      await adoptUnlinkedCustomerChannel(conn,existingChannel,account.person_id,provider,normalizedProviderUserId);
    }
    if(scope.accountType==='customer'){
      const column=provider==='tg'?'telegram_user_id':'max_user_id';
      const [[legacy]]=await conn.query(`SELECT ${column} provider_user_id FROM cust_customers
        WHERE tenant_id=? AND id=? FOR UPDATE`,[scope.tenantId,scope.accountId]);
      const [identities]=await conn.query(`SELECT provider_user_id FROM cust_customer_auth_identities
        WHERE tenant_id=? AND customer_id=? AND provider=? FOR UPDATE`,[scope.tenantId,scope.accountId,provider]);
      if([legacy,...identities].some(row=>row?.provider_user_id && String(row.provider_user_id)!==normalizedProviderUserId)){
        throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
      }
      const [[other]]=await conn.query(`SELECT c.id FROM cust_customers c WHERE c.tenant_id=? AND c.id<>? AND
        (c.${column}=? OR EXISTS(SELECT 1 FROM cust_customer_auth_identities i WHERE i.tenant_id=c.tenant_id
          AND i.customer_id=c.id AND i.provider=? AND i.provider_user_id=?)
        OR EXISTS(SELECT 1 FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
          WHERE a.tenant_id=c.tenant_id AND a.account_type='customer' AND a.account_id=c.id AND m.channel_id=?))
        LIMIT 1 FOR UPDATE`,
      [scope.tenantId,scope.accountId,normalizedProviderUserId,provider,normalizedProviderUserId,existingChannel?.id || null]);
      if(other)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
    }
    if(account){
      const [prior]=await conn.query('SELECT c.provider_user_id FROM auth_account_messenger_links m JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE m.account_link_id=? AND m.provider=? FOR UPDATE',[account.id,provider]);
      if(prior.some(row=>String(row.provider_user_id)!==normalizedProviderUserId))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
    }
    if(scope.accountType==='employee' && existingChannel){
      const [[other]]=await conn.query(`SELECT a.id FROM auth_account_links a
        JOIN auth_account_messenger_links m ON m.account_link_id=a.id
        WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id<>? AND m.channel_id=? LIMIT 1 FOR UPDATE`,
      [scope.tenantId,scope.accountId,existingChannel.id]);
      if(other)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
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
      `UPDATE auth_verification_challenges SET consumed_at=NOW(),delivery_status='failed'
       WHERE tenant_id=? AND account_type=? AND account_id=? AND provider=?
         AND id<>? AND consumed_at IS NULL ${scope.accountType==='customer' ? "AND purpose='link'" : ''}`,
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
      return { matched: true, ok: false, error: error.code, context:resultContext };
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
    if(scope.accountType==='employee'){
      await assertEmployeeSessionVersion(conn,scope,options.authVersion);
      await assertAccountActive(conn,scope);
    }
    if(scope.accountType==='customer'){
      await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[scope.tenantId]);
      const [[session]]=await conn.query(`SELECT id FROM cust_customer_sessions
        WHERE tenant_id=? AND customer_id=? AND token=? AND auth_strength='strong' AND is_active=1
          AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) FOR UPDATE`,
      [scope.tenantId,scope.accountId,options.sessionToken || '']);
      if(!session)throw new MessengerAuthError('STRONG_AUTH_REQUIRED',403);
    }
    await assertAccountActive(conn, scope);
    const account = await loadAccountLink(conn, scope, true);
    if (!account) {
      if(scope.accountType==='employee'){
        await conn.query("UPDATE auth_verification_challenges SET consumed_at=NOW(),delivery_status='failed' WHERE tenant_id=? AND account_type='employee' AND account_id=? AND provider=? AND consumed_at IS NULL",[scope.tenantId,scope.accountId,provider]);
        await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE tenant_id=? AND account_type='employee' AND account_id=? AND provider=? AND state IN ('pending','started','confirmed')",[scope.tenantId,scope.accountId,provider]);
      }
      await conn.commit();
      return { ok: true, linked: false };
    }
    const [unlinkedChannels]=await conn.query('SELECT ch.provider_user_id,ch.revoked_at FROM auth_account_messenger_links m JOIN auth_messenger_channels ch ON ch.id=m.channel_id WHERE m.account_link_id=? AND m.provider=? FOR UPDATE',[account.id,provider]);
    if(unlinkedChannels.some(channel=>channel.revoked_at))throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
    await conn.query(
      'DELETE FROM auth_account_messenger_links WHERE account_link_id=? AND provider=?',
      [Number(account.id), provider]
    );
    await conn.query(
      `UPDATE auth_verification_challenges SET consumed_at=NOW()${scope.accountType==='customer'?",delivery_status=IF(purpose='link','failed',delivery_status)":",delivery_status='failed'"}
       WHERE tenant_id=? AND account_type=? AND account_id=? AND provider=? AND consumed_at IS NULL`,
      [scope.tenantId, scope.accountType, scope.accountId, provider]
    );
    if(scope.accountType==='employee')await conn.query(`UPDATE auth_browser_requests SET state='cancelled'
      WHERE tenant_id=? AND account_type='employee' AND (account_id=? OR provider_user_id=?) AND provider=? AND state IN ('pending','started','confirmed')`,
    [scope.tenantId,scope.accountId,unlinkedChannels[0]?.provider_user_id || null,provider]);
    const [[remaining]] = await conn.query(
      'SELECT COUNT(*) AS count FROM auth_account_messenger_links WHERE account_link_id=?',
      [Number(account.id)]
    );
    if (Number(remaining?.count || 0) === 0 && scope.accountType !== 'customer') {
      await conn.query('DELETE FROM auth_account_links WHERE id=?', [Number(account.id)]);
    }
    if (scope.accountType === 'customer') {
      await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE tenant_id=? AND account_type='customer' AND (account_id=? OR provider_user_id=?) AND provider=? AND state IN ('pending','started','confirmed')",[scope.tenantId,scope.accountId,unlinkedChannels[0]?.provider_user_id || null,provider]);
      await conn.query(`UPDATE auth_browser_requests SET result_session_id=NULL
        WHERE tenant_id=? AND account_type='customer' AND account_id=? AND provider=? AND state='consumed' AND result_session_id IS NOT NULL`,
      [scope.tenantId,scope.accountId,provider]);
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
  const customerConnection=scope.accountType==='customer'?await db.getConnection():null;
  try{
    if(customerConnection){
      await customerConnection.beginTransaction();
      await customerConnection.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[scope.tenantId]);
      const [[current]]=await customerConnection.query(`SELECT c.id FROM auth_account_links a
        JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.provider=?
        JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
        WHERE a.tenant_id=? AND a.account_type='customer' AND a.account_id=? AND c.id=? LIMIT 1`,
      [channel.provider,scope.tenantId,scope.accountId,channel.channelId]);
      if(!current)throw new MessengerAuthError('MESSENGER_NOT_LINKED',409);
    }
    if (pending) {
      const [updated]=await db.query(
        `UPDATE auth_verification_challenges SET code_hash=?, code_salt=?,
           expires_at=DATE_ADD(NOW(6),INTERVAL 3 MINUTE),resend_after=DATE_ADD(NOW(6),INTERVAL 60 SECOND)
         WHERE id=? AND delivery_status='pending' AND consumed_at IS NULL`,
        [digest, salt, pending.id]
      );
      if(scope.accountType==='customer' && !updated.affectedRows)throw new MessengerAuthError('BOT_LOGIN_INVALID_OR_EXPIRED',409);
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
    if(customerConnection)await customerConnection.commit();
  }catch(error){
    if(customerConnection)await customerConnection.rollback();
    throw error;
  }finally{customerConnection?.release();}
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
      accountType: scope.accountType,
      provider: channel.provider,
      providerUserId: channel.providerUserId,
      code,
      purpose,
      expiresInMinutes: Math.round(codeTtlMs / 60000),
      operationId: cleanupId,
    }, scope.accountType==='customer'?db:undefined);
    const [sent]=await db.query(
      `UPDATE auth_verification_challenges SET delivery_status='sent' WHERE id=?
        ${scope.accountType==='customer'?'AND consumed_at IS NULL':''}`,[Number(result.insertId)]
    );
    if(scope.accountType==='customer' && !sent.affectedRows)throw new MessengerAuthError('MESSENGER_NOT_LINKED',409);
    await db.query(
      `UPDATE auth_verification_challenges SET consumed_at=NOW()
       WHERE tenant_id=? AND account_type=? AND account_id=? AND purpose=?
         AND id<>? AND consumed_at IS NULL AND delivery_status='sent'`,
      [scope.tenantId, scope.accountType, scope.accountId, purpose, Number(result.insertId)]
    );
  } catch (error) {
    if(scope.accountType==='customer' && error.code==='MESSENGER_NOT_LINKED')throw error;
    console.error('AUTH_CODE_DELIVERY_FAILED', {
      provider: channel.provider, tenantId: scope.tenantId,
      reason: channel.provider === 'tg' ? telegramErrorReason(error)
        : (/^[A-Z0-9_]+$/.test(String(error.code || error.cause?.code || ''))
          ? (error.code || error.cause.code) : 'DELIVERY_ERROR'),
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
  let cleanupOutcome = null;
  try {
    await conn.beginTransaction();
    if(scope.accountType==='customer')await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[scope.tenantId]);
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
      cleanupOutcome = 'expired';
      throw new MessengerAuthError('CODE_EXPIRED', 400);
    }
    if (Number(challenge.attempts || 0) >= Number(challenge.max_attempts || MAX_CODE_ATTEMPTS)) {
      cleanupOutcome = 'error';
      throw new MessengerAuthError('CODE_ATTEMPTS_EXCEEDED', 429);
    }
    const digest = await hashCode(code, challenge.code_salt, codeScopeKey(scope, purpose, requestId));
    if (!safeEqual(digest, challenge.code_hash)) {
      await conn.query('UPDATE auth_verification_challenges SET attempts=attempts+1 WHERE id=?', [Number(challenge.id)]);
      await conn.commit();
      if (Number(challenge.attempts || 0) + 1 >= Number(challenge.max_attempts || MAX_CODE_ATTEMPTS)) {
        cleanupOutcome = 'error';
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
    cleanupOutcome = 'success';
    return { ok: true, value, provider: String(challenge.provider) };
  } catch (error) {
    try { await conn.rollback(); } catch (_) {}
    throw error;
  } finally {
    conn.release();
    if (cleanupOutcome) await markOperation(db, cleanupOperationId('challenge', requestId), cleanupOutcome);
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

async function processWebhookEvent(db, rawProvider, update, handler, namespace = '', timingHooks = null) {
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
    const lockStartedAt = monotonicMs();
    let lock;
    try {
      const [rows] = await lockConnection.query('SELECT GET_LOCK(?, 1) AS acquired', [lockName]);
      lock = rows[0];
    } finally {
      if (typeof timingHooks?.onEventLockWait === 'function') {
        try { timingHooks.onEventLockWait(monotonicMs() - lockStartedAt); } catch (_) {}
      }
    }
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) throw new MessengerAuthError('WEBHOOK_IN_PROGRESS', 503);
    const [existing] = await eventDb.query(
      'SELECT status FROM auth_webhook_events WHERE provider=? AND event_key=? LIMIT 1',
      [provider, eventKey]
    );
    if (existing[0]?.status === 'done') return { duplicate: true };
    // Preserve delivery history when moving from route-scoped webhooks to a
    // single bot-scoped poller (including several tenants sharing that bot).
    const legacyKeys = (timingHooks?.legacyNamespaces || []).filter(n => n !== namespace)
      .map(n => n ? crypto.createHash('sha256').update(`${n}:${originalKey}`).digest('hex') : originalKey);
    if (legacyKeys.length) {
      const [legacy] = await eventDb.query("SELECT event_key FROM auth_webhook_events WHERE provider=? AND event_key IN (?) AND status='done' LIMIT 1", [provider, legacyKeys]);
      if (legacy.length) return { duplicate: true };
    }
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

function browserBinding(req, res, accountType = 'employee') {
  let binding = String(req.cookies?.messenger_browser || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    binding = randomPublicId();
  }
  res.cookie('messenger_browser', binding, { httpOnly: true, sameSite: 'strict', secure: req.secure,
    path: '/api', maxAge: (accountType === 'customer' ? 30 : 10) * 60 * 1000 });
  return binding;
}

async function assertBrowserSchema(db) {
  const [columns] = await db.query('SHOW COLUMNS FROM auth_browser_requests');
  const required=['contact_phone','contact_name','contact_verified_at'];
  if(required.some(name=>!columns.some(c=>c.Field===name)))throw new MessengerAuthError('BROWSER_CONTACT_MIGRATION_REQUIRED',503);
}

async function resolveEmployeeBrowserTenant(db, { requestId, binding }) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(requestId)
      || typeof binding !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(binding)) {
    throw new MessengerAuthError('REQUEST_INVALID', 403);
  }
  const [rows] = await db.query(`SELECT r.tenant_id FROM auth_browser_requests r
    JOIN ten_tenants t ON t.id=r.tenant_id AND t.is_active=1
    WHERE r.public_id=? AND r.account_type='employee' AND r.browser_hash=? LIMIT 1`,
  [requestId, tokenHash(binding)]);
  if (!rows.length) throw new MessengerAuthError('REQUEST_INVALID', 403);
  return Number(rows[0].tenant_id);
}

async function findPhoneCustomer(conn,tenantId,phone) {
  const [rows]=await conn.query('SELECT id,phone,is_active FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 2 FOR UPDATE',[tenantId,phone]);
  const matches=rows.filter(c=>require('./helpers').normalizePhone(c.phone)===phone);
  if(matches.length>1)throw new MessengerAuthError('CUSTOMER_PHONE_CONFLICT',409);
  if(matches[0] && Number(matches[0].is_active)!==1)throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
  return matches[0] || null;
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

async function readVerifiedBrowserPhone(conn, request, uid) {
  const customer = request.account_type === 'customer';
  const [accounts] = await conn.query(`SELECT DISTINCT u.id,u.phone,${customer ? 'u.phone_verified_at' : 'm.verified_at'} verified_at
    FROM auth_account_links a
    JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.verified_at IS NOT NULL
    JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL AND c.verified_at IS NOT NULL
    JOIN ${customer ? 'cust_customers' : 'app_users'} u ON u.tenant_id=a.tenant_id AND u.id=a.account_id AND u.is_active=1
    ${customer ? '' : "JOIN ten_tenants et ON et.id=u.tenant_id AND et.is_active=1 AND u.employee_status='active'"}
    WHERE a.tenant_id=? AND a.account_type=? AND c.provider=? AND c.provider_user_id=? LIMIT 2`,
  [request.tenant_id, request.account_type, request.provider, uid]);
  if (accounts.length !== 1 || !accounts[0].verified_at) return;
  const phone = require('./helpers').normalizePhone(accounts[0].phone);
  if (!/^\d{10,15}$/.test(phone) || request.account_type !== 'customer' && request.requested_phone && request.requested_phone !== phone
      || request.account_id && Number(request.account_id) !== Number(accounts[0].id)) return;
  return phone;
}

async function restoreVerifiedBrowserContact(conn, request, uid) {
  if (request.contact_verified_at || request.purpose === 'profile_link') return;
  const phone = await readVerifiedBrowserPhone(conn, request, uid);
  if (!phone) return;
  await conn.query('UPDATE auth_browser_requests SET contact_phone=?,contact_verified_at=NOW() WHERE public_id=?', [phone, request.public_id]);
  request.contact_phone = phone;
  request.contact_verified_at = true;
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

async function browserBotAction(db, { tenantId, provider, token, providerUserId, confirm = false, contact = null, employeeEnabled=true, phoneChoice = null, contactTarget = null, employeeOnly = false }) {
  try{await assertBrowserSchema(db);}catch(error){if(error instanceof MessengerAuthError)return {ok:false,error:error.code};throw error;}
  const reference = /^r_[A-Za-z0-9_-]{43}$/.test(String(token));
  if ((!contact && !reference && !/^b_[A-Za-z0-9_-]{40}$/.test(String(token))) || !/^[1-9][0-9]{0,19}$/.test(String(providerUserId))) return { ok: false,error:'INVALID_PROVIDER_ID' };
  const conn = await db.getConnection();
  let guestRequestId=null;
  let customerAction=false;
  let employeeRequestId=null;
  let terminalCustomerRequest=null;
  try {
    const [[customerOperation]]=employeeOnly ? [[]] : await conn.query(`SELECT public_id FROM auth_browser_requests WHERE tenant_id=? AND provider=? AND account_type='customer' AND ${contact?'provider_user_id=?':reference?'public_id=?':'token_hash=?'} LIMIT 1`,[tenantId,provider,contact?String(providerUserId):reference?token.slice(2):tokenHash(token)]);
    await conn.beginTransaction();
    if(customerOperation || contactTarget)await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
    const [rows] = await conn.query(`SELECT *, (expires_at>NOW()) AS valid FROM auth_browser_requests WHERE ${contact
      ? "provider_user_id=? AND state='started' AND expires_at>NOW()"
      : reference ? 'public_id=?' : 'token_hash=?'} AND tenant_id=? AND provider=?
      ${contactTarget ? `AND account_type='${employeeOnly?'employee':'customer'}' AND public_id=?` : employeeOnly ? "AND account_type='employee'" : ''} LIMIT 2 FOR UPDATE`,
      [contact ? String(providerUserId) : reference ? token.slice(2) : tokenHash(token),tenantId,provider,...(contactTarget?[contactTarget]:[])]);
    if (contact && !rows.length) { await conn.rollback(); return {ok:false,matched:false}; }
    if (contact && rows.length !== 1) throw new MessengerAuthError('CONTACT_REQUEST_AMBIGUOUS');
    const r = rows[0], uid = String(providerUserId);
    customerAction=r?.account_type==='customer';
    if(r?.account_type==='employee')employeeRequestId=r.public_id;
    if(r?.purpose==='profile_link')guestRequestId=r.public_id;
    if(r?.account_type==='employee'&&phoneChoice)throw new MessengerAuthError('REQUEST_NOT_STARTED');
    if(r?.account_type==='employee'&&!employeeEnabled)throw new MessengerAuthError('MESSENGER_LOGIN_DISABLED',403);
    const customerPolicy=r?.account_type==='customer'?await require('./helpers/customerAuth').settings(conn,tenantId):null;
    if(customerPolicy&&!customerPolicy[provider])throw new MessengerAuthError('CUSTOMER_CHANNEL_DISABLED',403);
    if (customerAction && (['cancelled','consumed'].includes(r.state) || confirm && !Number(r.valid))) {
      await conn.rollback();
      return {ok:true,silent:true,accountType:'customer'};
    }
    if(customerAction && r.provider_user_id && String(r.provider_user_id)!==uid){
      await conn.rollback();return {ok:true,silent:true,accountType:'customer'};
    }
    if (!r || Number(r.valid)!==1 || ['cancelled','consumed'].includes(r.state)
        || (r.provider_user_id && r.provider_user_id !== uid)) throw new MessengerAuthError('REQUEST_EXPIRED');
    if(r.account_type==='employee' && (r.purpose==='login' || r.account_id)){
      await assertAccountActive(conn,{tenantId,accountType:'employee',accountId:Number(r.account_id)});
      const [[employee]]=await conn.query('SELECT phone FROM app_users WHERE tenant_id=? AND id=? FOR UPDATE',[tenantId,r.account_id]);
      if(!r.requested_phone || require('./helpers').normalizePhone(employee?.phone)!==r.requested_phone)
        throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
    }
    if(r.guest_session_hash){
      const [[guest]]=await conn.query('SELECT phone,revoked_at,(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) valid FROM cust_guest_sessions WHERE tenant_id=? AND token_hash=? FOR UPDATE',[tenantId,r.guest_session_hash]);
      if(!guest || guest.revoked_at || !Number(guest.valid)){
        terminalCustomerRequest=customerAction?r.public_id:null;
        throw new MessengerAuthError('GUEST_SESSION_EXPIRED',409);
      }
      if(r.purpose==='profile_link')r.guest_profile_phone=require('./helpers').normalizePhone(guest.phone);
      // A guest's typed phone is not proof of identity. The verified native
      // contact below supplies the authoritative phone for account discovery.
    }
    if ((customerAction || r.account_type==='employee') && provider==='tg' && contact
        && (!contactTarget || !r.customer_contact_prompt_at || r.contact_verified_at
          || !Number.isFinite(Number(contact.messageDate))
          || r.phone_choice_at || r.customer_final_prompt_at
          || Number(contact.messageDate)<Math.floor(new Date(r.customer_contact_prompt_at).getTime()/1000))) {
      await conn.rollback();
      return {ok:true,silent:true,accountType:r.account_type};
    }
    if ((customerAction || r.account_type==='employee') && r.state==='started' && (contact || confirm))terminalCustomerRequest=r.public_id;
    if (contact) {
      const phone = require('./helpers').normalizePhone(contact.phone);
      if (!/^\d{10,15}$/.test(phone)) throw new MessengerAuthError('CONTACT_INVALID');
      if(r.purpose==='profile_link'&&r.guest_profile_phone!==phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      if(r.account_type==='customer'&&r.code_challenge_id)throw new MessengerAuthError('CUSTOMER_CODE_REQUIRED',409);
      // The webhook adapter verifies native contact ownership before calling this function.
      if (r.contact_phone && r.contact_phone !== phone) throw new MessengerAuthError('CONTACT_CONFLICT');
      await conn.query("UPDATE auth_browser_requests SET contact_phone=?,contact_name=?,contact_verified_at=NOW() WHERE public_id=?",
        [phone,String(contact.name || '').replace(/[\p{C}]/gu,'').trim().slice(0,100) || null,r.public_id]);
      if(r.account_type==='employee'&&r.requested_phone&&r.requested_phone!==phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      r.contact_phone=phone;r.contact_name=String(contact.name || '').replace(/[\p{C}]/gu,'').trim().slice(0,100);r.contact_verified_at=true;confirm=true;
    }
    const customerLogin = customerAction && r.purpose === 'login';
    if(r.account_type==='employee' && !confirm && !contact && r.state==='pending'){
      await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
      await activateCustomerOperation(conn,{tenantId,provider,uid,browserId:r.public_id,accountType:'employee'});
    }
    if(customerLogin && confirm && !contact && !phoneChoice){
      await conn.rollback();return {ok:true,silent:true,accountType:'customer'};
    }
    if(customerAction && !confirm && r.state==='pending'){
      const fenced=await activateCustomerOperation(conn,{tenantId,provider,uid,browserId:r.public_id});
      if(fenced && !customerLogin){
        await conn.query('UPDATE auth_browser_requests SET contact_confirmation_required=1 WHERE public_id=?',[r.public_id]);
        r.contact_confirmation_required=1;
      }
    }
    if (customerAction && r.state === 'confirmed') { await conn.commit(); return {ok:true,silent:true,accountType:'customer'}; }
    if (customerLogin && r.contact_verified_at && r.requested_phone && r.requested_phone !== r.contact_phone) {
      if (phoneChoice && (!reference || r.state !== 'started' || r.provider_user_id !== uid || !r.phone_choice_at)){
        await conn.rollback();return {ok:true,silent:true,accountType:'customer'};
      }
      if (phoneChoice === 'no' && !r.phone_consent_at) {
        await conn.query("UPDATE auth_browser_requests SET state='cancelled',customer_declined_at=NOW() WHERE public_id=?",[r.public_id]);
        await conn.commit(); return {ok:true,cancelled:true,silent:true,accountType:'customer'};
      }
      if (!r.phone_consent_at) {
        if(!phoneChoice && r.customer_choice_prompt_at){await conn.commit();return {ok:true,silent:true,accountType:'customer'};}
        if (phoneChoice === 'yes') {
          await conn.query('UPDATE auth_browser_requests SET phone_consent_at=NOW(),expires_at=DATE_ADD(NOW(),INTERVAL 3 MINUTE) WHERE public_id=?',[r.public_id]);
          await syncBrowserCleanupDeadline(conn,r.public_id);
          r.phone_consent_at=true;
          confirm=true;
        } else {
          if (!r.phone_choice_at){
            await conn.query("UPDATE auth_browser_requests SET state='started',provider_user_id=?,phone_choice_at=NOW(),expires_at=DATE_ADD(NOW(),INTERVAL 3 MINUTE) WHERE public_id=?",[uid,r.public_id]);
            await syncBrowserCleanupDeadline(conn,r.public_id);
          }
          await conn.commit(); return {ok:true,phoneChoiceRequired:true,accountType:'customer',reference:`r_${r.public_id}`};
        }
      }
      if (phoneChoice === 'no' || contact) {
        await conn.commit();return {ok:true,silent:true,accountType:'customer'};
      }
      // The operation-bound Yes callback is the final consent to use this phone.

    } else if (phoneChoice) { await conn.rollback();return {ok:true,silent:true,accountType:'customer'}; }
    if(customerAction && !customerLogin && contact && Number(r.contact_confirmation_required)===1){
      await conn.commit();
      return {ok:true,consentAccepted:true,purpose:r.purpose,accountType:'customer',reference:`r_${r.public_id}`,
        silent:Boolean(r.customer_final_prompt_at)};
    }
    if (!confirm) {
      if(customerAction && r.state==='started'){
        await conn.commit();
        return {ok:true,accountType:'customer',purpose:r.purpose,reference:`r_${r.public_id}`,
          contactRequired:!r.contact_verified_at,silent:Boolean(r.contact_verified_at?r.customer_final_prompt_at:r.customer_contact_prompt_at)};
      }
      if (r.state === 'confirmed') { await conn.commit(); return { ok: true, confirmed: true, purpose:r.purpose }; }
      const known=!customerAction && await hasBrowserAccountBinding(conn,{tenantId,accountType:r.account_type,provider,uid});
      if(known && r.account_type==='employee' && r.purpose==='password_reset' && !r.account_id){
        const [accounts]=await conn.query(`SELECT u.id,u.phone FROM auth_account_links a
          JOIN auth_account_messenger_links m ON m.account_link_id=a.id
          JOIN auth_messenger_channels c ON c.id=m.channel_id AND c.person_id=a.person_id AND c.revoked_at IS NULL
          JOIN app_users u ON u.tenant_id=a.tenant_id AND u.id=a.account_id
          WHERE a.tenant_id=? AND a.account_type='employee' AND c.provider=? AND c.provider_user_id=? LIMIT 2 FOR UPDATE`,[tenantId,provider,uid]);
        if(accounts.length!==1)throw new MessengerAuthError('EMPLOYEE_CONTACT_CONFLICT',403);
        r.account_id=accounts[0].id;r.requested_phone=require('./helpers').normalizePhone(accounts[0].phone);
        await assertAccountActive(conn,{tenantId,accountType:'employee',accountId:r.account_id});
        await conn.query('UPDATE auth_browser_requests SET account_id=?,requested_phone=? WHERE public_id=?',[r.account_id,r.requested_phone,r.public_id]);
      }
      if (known) await restoreVerifiedBrowserContact(conn, r, uid);
      await conn.query("UPDATE auth_browser_requests SET state='started',provider_user_id=? WHERE public_id=?", [uid,r.public_id]);
      if(!known && r.purpose==='password_reset')throw new MessengerAuthError('EMPLOYEE_MESSENGER_NOT_LINKED');
      await conn.commit(); return { ok: true, purpose:r.purpose,accountType:r.account_type,reference:`r_${r.public_id}`,contactRequired:!r.contact_verified_at };
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
        if(r.account_id && Number(r.account_id)!==Number(employees[0].id))throw new MessengerAuthError('EMPLOYEE_CONTACT_CONFLICT',403);
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
        if(r.account_id && Number(r.account_id)!==accountId)throw new MessengerAuthError('EMPLOYEE_CONTACT_CONFLICT',403);
        const [other]=await conn.query(`SELECT a.account_id FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
          JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id<>? AND c.provider=? AND c.provider_user_id=?`,[tenantId,accountId,provider,uid]);
        if(other.length)throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
        const existing=await loadAccountLink(conn,{tenantId,accountType:'employee',accountId},true);
        if(existing){
          const [prior]=await conn.query(`SELECT c.provider_user_id FROM auth_account_messenger_links m
            JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE m.account_link_id=? AND m.provider=? FOR UPDATE`,[existing.id,provider]);
          if(prior.some(row=>String(row.provider_user_id)!==uid))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
        }
        if(existing&&channel&&Number(existing.person_id)!==Number(channel.person_id))await adoptUnlinkedCustomerChannel(conn,channel,existing.person_id,provider,uid);
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
      if (customers.length) accountId = Number(customers[0].id);
      else {
        if (!r.contact_verified_at || !r.contact_phone) throw new MessengerAuthError('CONTACT_REQUIRED');
        const candidate=await findPhoneCustomer(conn,tenantId,r.contact_phone);
        if(candidate) accountId=Number(candidate.id);
        else{
          const [created] = await conn.query("INSERT INTO cust_customers (tenant_id,name,phone,phone_verified_at,is_active,registration_date) VALUES (?,?,?,NOW(),1,CURDATE())", [tenantId,r.contact_name || 'Клиент',r.contact_phone]);
          accountId = Number(created.insertId);
        }
      }
      await assertAccountActive(conn,{tenantId,accountType:'customer',accountId});
      const phoneMatch=await findPhoneCustomer(conn,tenantId,r.contact_phone);
      if(phoneMatch && Number(phoneMatch.id)!==accountId)throw new MessengerAuthError('CUSTOMER_PHONE_CONFLICT',409);
      const [legacy]=await conn.query(`SELECT ${column} provider_user_id,phone FROM cust_customers WHERE tenant_id=? AND id=? FOR UPDATE`,[tenantId,accountId]);
      if(legacy[0]?.phone && require('./helpers').normalizePhone(legacy[0].phone)!==r.contact_phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
      const [identities]=await conn.query('SELECT provider_user_id FROM cust_customer_auth_identities WHERE tenant_id=? AND customer_id=? AND provider=? FOR UPDATE',[tenantId,accountId,provider]);
      if([...legacy,...identities].some(c=>c.provider_user_id && String(c.provider_user_id)!==uid))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT',409);
      const existing = await loadAccountLink(conn,{tenantId,accountType:'customer',accountId},true);
      if(existing){
        const [prior]=await conn.query('SELECT c.provider_user_id FROM auth_account_messenger_links m JOIN auth_messenger_channels c ON c.id=m.channel_id WHERE m.account_link_id=? AND m.provider=?',[existing.id,provider]);
        if(prior.some(c=>String(c.provider_user_id)!==uid))throw new MessengerAuthError('ACCOUNT_PERSON_CONFLICT');
      }
      if (existing && channel && Number(existing.person_id)!==Number(channel.person_id)) {
        await adoptUnlinkedCustomerChannel(conn,channel,existing.person_id,provider,uid);
      }
      let personId = Number(channel?.person_id || existing?.person_id || 0);
      if (!personId) { const [p] = await conn.query('INSERT INTO auth_people (created_at,updated_at) VALUES (NOW(),NOW())'); personId=Number(p.insertId); }
      if (!channel) { const [c] = await conn.query('INSERT INTO auth_messenger_channels (person_id,provider,provider_user_id,verified_at) VALUES (?,?,?,NOW())',[personId,provider,uid]); channel={id:c.insertId,person_id:personId}; }
      let accountLinkId=existing?.id;
      if (!accountLinkId) { const [a] = await conn.query("INSERT INTO auth_account_links (person_id,tenant_id,account_type,account_id,linked_at) VALUES (?,?,'customer',?,NOW())",[personId,tenantId,accountId]); accountLinkId=a.insertId; }
      await conn.query('INSERT INTO auth_account_messenger_links (account_link_id,channel_id,provider,verified_at) VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id),verified_at=NOW()',[accountLinkId,channel.id,provider]);
      await conn.query(`UPDATE cust_customers SET ${column}=?,phone_verified_at=NOW(),guest_bonus_only=0,updated_at=NOW() WHERE tenant_id=? AND id=?`,[uid,tenantId,accountId]);
      await conn.query("UPDATE cust_customer_sessions SET is_active=0,revoked_at=NOW() WHERE tenant_id=? AND customer_id=? AND auth_strength='weak'",[tenantId,accountId]);
      await conn.query(`UPDATE cust_customer_sessions SET expires_at=NULL
        WHERE tenant_id=? AND customer_id=? AND auth_strength='strong' AND is_active=1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())`,[tenantId,accountId]);
      await conn.query('INSERT INTO cust_customer_auth_identities (tenant_id,customer_id,provider,provider_user_id,linked_at) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE provider_user_id=VALUES(provider_user_id)',[tenantId,accountId,provider,uid]);
    }
    await conn.query("UPDATE auth_browser_requests SET state='confirmed',account_id=?,expires_at=IF(account_type='customer',DATE_ADD(NOW(),INTERVAL 10 MINUTE),expires_at) WHERE public_id=?",[accountId,r.public_id]);
    if(customerAction)await syncBrowserCleanupDeadline(conn,r.public_id);
    await conn.commit();
    return { ok:true,confirmed:true,purpose:r.purpose,accountType:r.account_type,context:r.purpose==='profile_link'?'PROFILE_LINK':r.account_type==='customer'?'LOGIN':undefined,guestConfirmed:r.purpose==='profile_link',autoConfirmed:Boolean(contact) };
  } catch (error) {
    await conn.rollback();
    if (error instanceof MessengerAuthError) {
      console.warn('BROWSER_BOT_ACTION_REJECTED',{tenantId,provider,reason:error.code});
      if(terminalCustomerRequest || employeeRequestId)await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE public_id=? AND state IN ('pending','started')",[terminalCustomerRequest || employeeRequestId]);
      return {ok:false,error:error.code,...(customerAction?{accountType:'customer'}:{}),...(guestRequestId?{context:'PROFILE_LINK'}:{})};
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
  let cleanupOutcome = null;
  try {
    await conn.beginTransaction();
    if(accountType==='customer')await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
    const [rows]=await conn.query('SELECT *, (expires_at>NOW()) AS valid FROM auth_browser_requests WHERE public_id=? AND tenant_id=? AND account_type=? FOR UPDATE',[requestId,tenantId,accountType]);
    const r=rows[0];
    if (!r || !safeEqual(r.browser_hash,tokenHash(binding || ''))) throw new MessengerAuthError('REQUEST_INVALID',403);
    if(r.guest_session_hash){
      if(accountType==='customer' && r.state==='consumed' && r.result_session_id){
        const [[session]]=await conn.query('SELECT id FROM cust_customer_sessions WHERE tenant_id=? AND customer_id=? AND id=? AND token=? AND is_active=1 AND revoked_at IS NULL',[tenantId,r.account_id,r.result_session_id,guestToken]);
        if(!session && !safeEqual(r.guest_session_hash,tokenHash(guestToken || '')))throw new MessengerAuthError('GUEST_SESSION_MISMATCH',403);
      }else{
        const guest=await require('./helpers/customerAuth').getGuest(conn,tenantId,guestToken,true,storeId);
        if(!guest || !safeEqual(r.guest_session_hash,guest.token_hash))throw new MessengerAuthError('GUEST_SESSION_MISMATCH',403);
      }
    }
    if (cancel) {
      await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE public_id=? AND state IN ('pending','started','confirmed') AND (account_type<>'customer' OR expires_at>NOW() OR phone_choice_at IS NULL OR phone_consent_at IS NOT NULL)",[requestId]);
      await conn.commit();
      cleanupOutcome = 'cancelled';
      return {ok:true,state:'cancelled'};
    }
    if(accountType==='customer' && (r.state==='cancelled' || Number(r.valid)!==1)){
      await conn.commit();
      if(!Number(r.valid) && r.state!=='cancelled')cleanupOutcome='expired';
      return {ok:true,state:r.state==='cancelled' && !r.phone_timeout_notified_at?'cancelled':'expired'};
    }
    if (Number(r.valid)!==1 || (r.state==='cancelled' || r.state==='consumed' && !(accountType==='customer' && r.result_session_id))) {
      if (Number(r.valid)!==1) cleanupOutcome = 'expired';
      throw new MessengerAuthError('REQUEST_EXPIRED',409);
    }
    if(r.state!=='confirmed' && !(accountType==='customer' && r.state==='consumed' && r.result_session_id)){
      if(accountType==='customer'){
        const requiredAction=r.phone_choice_at && !r.phone_consent_at ? 'choose_phone_in_bot'
          : r.state==='started' && !r.contact_verified_at ? 'share_contact' : 'confirm_in_bot';
        await conn.commit();
        return {ok:true,state:'pending',required_action:requiredAction};
      }
      let requiredAction='confirm_in_bot';
      if(r.state==='started'){
        const linked=await hasBrowserAccountBinding(conn,{tenantId,accountType,provider:r.provider,uid:r.provider_user_id});
        if(!linked){
          requiredAction = !r.contact_verified_at ? 'share_contact' : 'confirm_in_bot';
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
    if(accountType==='customer' && !r.result_session_id){
      const [[session]]=await conn.query('SELECT id FROM cust_customer_sessions WHERE tenant_id=? AND customer_id=? AND token=? AND is_active=1 AND revoked_at IS NULL',[tenantId,r.account_id,value.token]);
      if(!session)throw new MessengerAuthError('REQUEST_INVALID',403);
      await conn.query("UPDATE auth_browser_requests SET state='consumed',result_session_id=? WHERE public_id=?",[session.id,requestId]);
    }else await conn.query("UPDATE auth_browser_requests SET state='consumed' WHERE public_id=?",[requestId]);
    await conn.commit();
    cleanupOutcome = 'success';
    return {ok:true,state:'confirmed',...value};
  } catch(error){await conn.rollback();throw error;} finally {
    conn.release();
    if (cleanupOutcome) await markOperation(db, cleanupOperationId('browser', requestId), cleanupOutcome);
  }
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
    const [links]=await conn.query(`SELECT u.id,u.phone FROM app_users u
      JOIN ten_tenants t ON t.id=u.tenant_id AND t.is_active=1
      JOIN auth_account_links a ON a.tenant_id=u.tenant_id AND a.account_type='employee' AND a.account_id=u.id
      JOIN auth_account_messenger_links m ON m.account_link_id=a.id AND m.provider=? AND m.channel_id=?
      JOIN auth_messenger_channels ch ON ch.id=m.channel_id AND ch.person_id=a.person_id AND ch.revoked_at IS NULL
      WHERE u.tenant_id=? AND u.id=? AND u.is_active=1 AND u.employee_status='active'
        AND EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles tr ON tr.id=ur.role_id AND tr.tenant_id=ur.tenant_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)
      LIMIT 1`,[current.provider,challenge.channel_id,options.tenantId,current.account_id]);
    if(links.length && require('./helpers').normalizePhone(links[0].phone)!==current.requested_phone)throw new MessengerAuthError('CONTACT_PHONE_MISMATCH',409);
    if(!links.length)throw new MessengerAuthError('MESSENGER_NOT_LINKED',403);
  }});
}

module.exports = {
  verifyCustomerBrowserCode,
  verifyEmployeeBrowserCode,
  resolveEmployeeBrowserTenant,
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
