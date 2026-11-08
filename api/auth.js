const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const employeeIdentity = require('./helpers/employeeIdentity');
const { ensureEmployeeCustomer } = require('./helpers/employeeCustomer');
const { loadLegacyOwner, authMiddleware, revokeUserStreams } = require('./middleware/auth');
const {
  MessengerAuthError,
  createLinkChallenge,
  getAccountChannels,
  unlinkAccountChannel,
  browserBinding, createBrowserRequest, consumeBrowserRequest, proveBrowserEmployee,
  issueCodeChallenge, verifyEmployeeBrowserCode,
} = require('./messengerAuth');
const { buildProviderLink, deliverCode, getTenantChannelAvailability, getTenantBotConfig, assertBrowserProviderReady } = require('./messengerDelivery');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

module.exports = function makeAuthRouter({ db, helpers }) {
  const router = express.Router();
  const loginAttempts = new Map();
  router.use('/messenger-browser',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
  // Context is fixed by this employee router, never taken from the browser body.
  const browserTenant = req => Number(req._resolvedTenant?.id || (process.env.DB_NAME === 'a1186497_test' && ['localhost','127.0.0.1','::1'].includes(req.hostname) ? 1 : 0));
  async function employeeByPhone(tenantId, phone) {
    const [users]=await db.query(`SELECT u.*,t.name tenant_name,t.slug tenant_slug FROM app_users u
      JOIN ten_tenants t ON t.id=u.tenant_id AND t.is_active=1
      WHERE u.tenant_id=? AND u.is_active=1 AND u.employee_status='active'
        AND EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles tr ON tr.id=ur.role_id AND tr.tenant_id=ur.tenant_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id)`,[tenantId]);
    const matches=users.filter(user=>helpers.normalizePhone(user.phone)===phone);
    return matches.length===1?matches[0]:null;
  }
  router.post('/phone-flow/start',async(req,res)=>{
    try{
      if(process.env.NODE_ENV==='production'&&!req.secure)throw new MessengerAuthError('HTTPS_REQUIRED',426);
      const tenantId=browserTenant(req),phone=helpers.normalizePhone(req.body.phone);
      if(!tenantId)throw new MessengerAuthError('TENANT_REQUIRED',400);
      if(!/^7\d{10}$/.test(phone))throw new MessengerAuthError('PHONE_REQUIRED',400);
      const providers=[];
      for(const provider of ['max','tg'])try{await getTenantBotConfig(db,tenantId,provider);providers.push(provider);}catch(error){if(error.code!=='TENANT_BOT_UNAVAILABLE')throw error;}
      const employee=await employeeByPhone(tenantId,phone);
      if(!employee)throw new MessengerAuthError('EMPLOYEE_NOT_FOUND',404);
      const channels=await getAccountChannels(db,{tenantId,accountType:'employee',accountId:employee.id},{includePrivate:true});
      const available=providers.filter(provider=>channels.some(channel=>channel.provider===provider&&channel.verifiedAt));
      if(!available.length)return res.json({ok:true,mode:'unverified',channels:providers,employee_exists:true,relink_required:true});
      let provider=req.body.provider?String(req.body.provider):available[0];
      if(!available.includes(provider))throw new MessengerAuthError('EMPLOYEE_CHANNEL_DISABLED',403);
      const binding=browserBinding(req,res);
      const request=await createBrowserRequest(db,{tenantId,accountType:'employee',provider,binding,ipAddress:req.ip,requestedPhone:phone});
      await db.query('UPDATE auth_browser_requests SET account_id=? WHERE public_id=?',[employee.id,request.requestId]);
      let challenge;
      try{challenge=await issueCodeChallenge(db,{tenantId,accountType:'employee',accountId:employee.id,purpose:'login',provider,ipAddress:req.ip,deliver:payload=>deliverCode(db,payload)});}
      catch(error){
        const otherProvider=available.find(candidate=>candidate!==provider);
        if(['CODE_DELIVERY_FAILED','TELEGRAM_BOT_START_REQUIRED'].includes(error.code)&&otherProvider){
          provider=otherProvider;
          challenge=await issueCodeChallenge(db,{tenantId,accountType:'employee',accountId:employee.id,purpose:'login',provider,ipAddress:req.ip,deliver:payload=>deliverCode(db,payload)});
        }else throw error;
      }
      await db.query('UPDATE auth_browser_requests SET provider=?,code_challenge_id=?,expires_at=DATE_ADD(NOW(),INTERVAL 3 MINUTE) WHERE public_id=?',[provider,challenge.requestId,request.requestId]);
      res.json({ok:true,mode:'code',request_id:request.requestId,provider,channels:available,link_channels:providers,expires_in:180,resend_after:0});
    }catch(error){sendMessengerError(res,error);}
  });
  router.post('/phone-flow/verify',async(req,res)=>{
    try{
      if(process.env.NODE_ENV==='production'&&!req.secure)throw new MessengerAuthError('HTTPS_REQUIRED',426);
      res.json(await verifyEmployeeBrowserCode(db,{tenantId:browserTenant(req),requestId:req.body.request_id,binding:req.cookies?.messenger_browser,code:req.body.code,onVerified:async(conn,r)=>{
      const [users]=await conn.query('SELECT u.*,t.name tenant_name,t.slug tenant_slug FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id WHERE u.id=? AND u.tenant_id=?',[r.account_id,r.tenant_id]);
      const auth=users[0]&&await buildSuccessfulAuth(users[0],{id:r.tenant_id,name:users[0].tenant_name,slug:users[0].tenant_slug},conn);
      if(!auth?.body?.ok)throw new MessengerAuthError(auth?.body?.error||'ACCOUNT_NOT_AVAILABLE',auth?.status||403);
      return auth.body;
    }}));}catch(error){sendMessengerError(res,error);}
  });
  router.post('/messenger-browser/start', async (req,res) => {
    try {
      if(process.env.NODE_ENV==='production'&&!req.secure)throw new MessengerAuthError('HTTPS_REQUIRED',426);
      const tenantId=browserTenant(req);
      if (!tenantId) throw new MessengerAuthError('TENANT_REQUIRED',400);
      const provider=String(req.body.provider || '');
      const purpose=req.body.purpose||'login';
      const requestedPhone=purpose==='login'?helpers.normalizePhone(req.body.phone):null;
      if(purpose==='login'&&!/^7\d{10}$/.test(requestedPhone))throw new MessengerAuthError('PHONE_REQUIRED',400);
      if(purpose==='login'){
        const employee=await employeeByPhone(tenantId,requestedPhone);
        if(employee&&(await getAccountChannels(db,{tenantId,accountType:'employee',accountId:employee.id},{includePrivate:true})).some(channel=>channel.provider===provider&&channel.verifiedAt))throw new MessengerAuthError('EMPLOYEE_CODE_REQUIRED',409);
      }
      await assertBrowserProviderReady(await getTenantBotConfig(db,tenantId,provider));
      const request=await createBrowserRequest(db,{tenantId,accountType:'employee',provider,binding:browserBinding(req,res),ipAddress:req.ip,purpose,requestedPhone});
      res.json({ok:true,request_id:request.requestId,bot_link:await buildProviderLink(db,tenantId,provider,request.token)});
    } catch(e){sendMessengerError(res,e);}
  });
  router.post('/messenger-browser/status', async (req,res) => {
    try {
      if(process.env.NODE_ENV==='production'&&!req.secure)throw new MessengerAuthError('HTTPS_REQUIRED',426);
      const value=await consumeBrowserRequest(db,{tenantId:browserTenant(req),accountType:'employee',requestId:req.body.request_id,
        binding:req.cookies?.messenger_browser,cancel:req.body.cancel===true,onVerified:async(conn,r)=>{
          await getTenantBotConfig(conn,r.tenant_id,r.provider);
          const [users]=await conn.query(`SELECT u.*,t.name tenant_name,t.slug tenant_slug FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id WHERE u.id=? AND u.tenant_id=? AND t.is_active=1`,[r.account_id,r.tenant_id]);
          if(!users[0])throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
          if(r.requested_phone&&helpers.normalizePhone(users[0].phone)!==r.requested_phone)throw new MessengerAuthError('EMPLOYEE_CONTACT_CONFLICT',403);
          if(r.purpose==='password_reset'){
            try{employeeIdentity.validatePassword(req.body.new_password);}catch(error){throw new MessengerAuthError(error.code,400);}
            const hash=await bcrypt.hash(req.body.new_password,10);
            await conn.query("UPDATE app_users SET password_hash=?,auth_version=auth_version+1,must_change_password=0 WHERE tenant_id=? AND id=?",[hash,r.tenant_id,r.account_id]);
            await conn.query("UPDATE auth_verification_challenges SET consumed_at=NOW() WHERE tenant_id=? AND account_type='employee' AND account_id=? AND consumed_at IS NULL",[r.tenant_id,r.account_id]);
            await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE tenant_id=? AND account_type='employee' AND provider=? AND provider_user_id=? AND public_id<>? AND state IN ('pending','started','confirmed')",[r.tenant_id,r.provider,r.provider_user_id,r.public_id]);
            return {next:'login',password_reset:true,revokedUserId:r.account_id};
          }
          const auth=await buildSuccessfulAuth(users[0],{id:r.tenant_id,name:users[0].tenant_name,slug:users[0].tenant_slug},conn);
          if(!auth.body.ok)throw new MessengerAuthError(auth.body.error,auth.status);
          return auth.body;
        }});
      if(value.password_reset){revokeUserStreams(browserTenant(req),value.revokedUserId);delete value.revokedUserId;}
      res.json(value);
    } catch(e){sendMessengerError(res,e);}
  });
  router.use(['/login', '/change-password', '/messenger-code/request', '/messenger-code/verify', '/messenger-links'], (req, res, next) => {
    if (!employeeIdentity.secureTransport(req)) return res.status(426).json({ ok: false, error: 'HTTPS_REQUIRED' });
    const now = Date.now();
    for (const [key, item] of loginAttempts) if (item.until <= now) loginAttempts.delete(key);
    const key = req.ip;
    const item = loginAttempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    item.count += 1;
    if (loginAttempts.size >= 10000 && !loginAttempts.has(key)) return res.status(429).json({ ok: false, error: 'LOGIN_RATE_LIMITED' });
    loginAttempts.set(key, item);
    if (item.count > 100) {
      res.set('Retry-After', String(Math.ceil((item.until - now) / 1000)));
      return res.status(429).json({ ok: false, error: 'LOGIN_RATE_LIMITED' });
    }
    next();
  });

  function signUserToken(user, options = {}) {
    return jwt.sign({
      userId: user.id || null,
      tenantId: Number(user.tenant_id),
      email: user.email || null,
      login: user.login || null,
      activeRoleId: options.activeRoleId || null,
      loginType: options.loginType || 'user',
      authStage: options.authStage || 'active',
      authVersion: Number(user.auth_version || 0),
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  function readRequestToken(req) {
    const header = String(req.headers.authorization || '');
    if (header.startsWith('Bearer ')) return header.slice(7);
    return req.cookies?.token || req.body?.token || null;
  }

  function publicRole(role) {
    return {
      id: Number(role.id),
      name: role.name,
      description: role.description || '',
      start_route: role.start_route,
    };
  }

  function publicUser(user, activeRoleId = null) {
    return {
      id: user.id ? Number(user.id) : null,
      email: user.email || null,
      login: user.login || null,
      name: user.name,
      last_name: user.last_name || null,
      first_name: user.first_name || null,
      patronymic: user.patronymic || null,
      photo_revision: user.photo_revision || null,
      role: user.role,
      tenant_id: Number(user.tenant_id),
      active_role_id: activeRoleId ? Number(activeRoleId) : null,
    };
  }

  async function loadUserRoles(queryable, tenantId, userId) {
    const [roles] = await queryable.query(
      `SELECT r.id, r.name, r.description, r.start_route, r.is_owner
       FROM user_roles ur
       JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
       WHERE ur.tenant_id=? AND ur.user_id=?
       ORDER BY r.is_owner DESC, r.name, r.id`,
      [tenantId, userId]
    );
    return roles;
  }

  async function ensureOwnerRole(queryable, tenantId, userId) {
    let [roles] = await queryable.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id=? AND system_key='owner'
       LIMIT 1`,
      [tenantId]
    );
    let roleId = roles[0] ? Number(roles[0].id) : 0;
    if (!roleId) {
      const [result] = await queryable.query(
        `INSERT INTO tenant_roles
          (tenant_id, name, description, start_route, is_system, is_owner, system_key)
         VALUES (?, 'Владелец', 'Системная роль с полным доступом', '/dashboard/products', 1, 1, 'owner')`,
        [tenantId]
      );
      roleId = Number(result.insertId);
    }
    await queryable.query(
      `INSERT INTO role_permissions (tenant_id, role_id, permission_id, access_rule)
       SELECT ?, ?, id, 'all' FROM system_permissions
       ON DUPLICATE KEY UPDATE access_rule='all'`,
      [tenantId, roleId]
    );
    await queryable.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role_id=VALUES(role_id)`,
      [tenantId, userId, roleId]
    );
    return roleId;
  }

  async function buildSuccessfulAuth(user, tenant, queryable = db) {
    const roles = await loadUserRoles(queryable, user.tenant_id, user.id);
    if (!roles.length) return { status: 403, body: { ok: false, error: 'ROLE_NOT_ASSIGNED' } };

    if (roles.length > 1) {
      return {
        status: 200,
        body: {
          ok: true,
          next: 'select-role',
          token: signUserToken(user, { authStage: 'role-selection' }),
          user: publicUser(user),
          tenant,
          roles: roles.map(publicRole),
        },
      };
    }

    const role = roles[0];
    return {
      status: 200,
      body: {
        ok: true,
        next: 'dashboard',
        redirect: role.start_route,
        token: signUserToken(user, { activeRoleId: role.id }),
        user: publicUser(user, role.id),
        tenant,
        roles: [publicRole(role)],
        active_role: publicRole(role),
      },
    };
  }


  function currentEmployeeScope(req) {
    const accountId = Number(req.user?.userId || req.user?.sessionUserId || 0);
    const tenantId = Number(req.user?.tenantId || 0);
    if (!(accountId > 0) || !(tenantId > 0)) throw new MessengerAuthError('EMPLOYEE_ACCOUNT_REQUIRED', 403);
    return { tenantId, accountType: 'employee', accountId };
  }

  function sendMessengerError(res, error, fallback = 'MESSENGER_AUTH_ERROR') {
    const status = Number(error?.status || 0) || 500;
    const code = error instanceof MessengerAuthError ? error.code : fallback;
    if (error?.details?.retryAfter) res.set('Retry-After', String(error.details.retryAfter));
    return res.status(status).json({
      ok: false,
      error: code,
      ...(error?.details && typeof error.details === 'object' ? {
        fallback_available: Boolean(error.details.fallbackAvailable),
        provider: error.details.provider || undefined,
        retry_after: error.details.retryAfter || undefined,
        attempts_remaining: error.details.attemptsRemaining,
      } : {}),
    });
  }

  router.post('/register', async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const email = helpers.strOrNull(req.body.email);
      const password = helpers.strOrNull(req.body.password);
      const name = helpers.strOrNull(req.body.name);
      const shopName = helpers.strOrNull(req.body.shop_name) || 'Мой Магазин';
      const slug = helpers.strOrNull(req.body.slug);

      if (!email || !email.includes('@')) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'INVALID_EMAIL' });
      }
      if (!password || password.length < 6) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'PASSWORD_TOO_SHORT' });
      }

      const [existingUsers] = await conn.query('SELECT id FROM app_users WHERE email=? LIMIT 1', [email]);
      const [existingTenants] = await conn.query('SELECT id FROM ten_tenants WHERE email=? LIMIT 1', [email]);
      if (existingUsers.length || existingTenants.length) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'EMAIL_EXISTS' });
      }

      let finalSlug = slug;
      if (!finalSlug) {
        const base = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        finalSlug = base || 'shop';
        let counter = 1;
        let candidate = finalSlug;
        while (true) {
          const [exists] = await conn.query('SELECT id FROM ten_tenants WHERE slug=? LIMIT 1', [candidate]);
          if (!exists.length) { finalSlug = candidate; break; }
          candidate = `${finalSlug}-${counter++}`;
        }
      } else {
        const [exists] = await conn.query('SELECT id FROM ten_tenants WHERE slug=? LIMIT 1', [finalSlug]);
        if (exists.length) {
          await conn.rollback();
          return res.status(409).json({ ok: false, error: 'SLUG_EXISTS' });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const [tenantResult] = await conn.query(
        `INSERT INTO ten_tenants (name, slug, subdomain, email, password_hash, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [shopName, finalSlug, null, email, passwordHash]
      );
      const tenantId = Number(tenantResult.insertId);
      const generatedSubdomain = `shop-${tenantId}`;
      await conn.query('UPDATE ten_tenants SET subdomain=? WHERE id=?', [generatedSubdomain, tenantId]);
      let loginSuffix = `tenant-${tenantId}`;
      for (let number = 1; ; number += 1) {
        const [taken] = await conn.query('SELECT id FROM ten_tenants WHERE login_suffix=?', [loginSuffix]);
        if (!taken.length) break;
        loginSuffix = `tenant-${tenantId}-${number}`;
      }
      await conn.query('UPDATE ten_tenants SET login_suffix=?, corporate_logins_enabled=1 WHERE id=?', [loginSuffix, tenantId]);

      const [userResult] = await conn.query(
        `INSERT INTO app_users
          (tenant_id, email, login, password_hash, must_change_password, name, role, is_active)
         VALUES (?, ?, NULL, ?, 0, ?, 'owner', 1)`,
        [tenantId, email, passwordHash, name || 'Владелец']
      );
      const userId = Number(userResult.insertId);
      const ownerRoleId = await ensureOwnerRole(conn, tenantId, userId);
      await helpers.ensureDefaultCategories(conn, tenantId);
      await ensureEmployeeCustomer(conn, tenantId, userId);
      await conn.commit();

      const user = { id: userId, tenant_id: tenantId, email, login: null, name: name || 'Владелец', role: 'owner' };
      const tenant = { id: tenantId, name: shopName, slug: finalSlug, subdomain: generatedSubdomain };
      return res.json({
        ok: true,
        next: 'dashboard',
        redirect: '/dashboard/products',
        token: signUserToken(user, { activeRoleId: ownerRoleId }),
        user: publicUser(user, ownerRoleId),
        tenant,
      });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      console.error('Ошибка регистрации:', error);
      return res.status(500).json({ ok: false, error: 'REGISTRATION_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/messenger-code/request', (req,res)=>res.status(410).json({ok:false,error:'BROWSER_CONFIRMATION_REQUIRED'}));
  router.post('/messenger-code/verify', (req,res)=>res.status(410).json({ok:false,error:'BROWSER_CONFIRMATION_REQUIRED'}));

  router.get('/messenger-links', authMiddleware, async (req, res) => {
    try {
      const channels = await getAccountChannels(db, currentEmployeeScope(req));
      const availability = await getTenantChannelAvailability(db, currentEmployeeScope(req).tenantId);
      const byProvider = Object.fromEntries(channels.map((channel) => [channel.provider, channel]));
      return res.json({
        ok: true,
        availability,
        channels: {
          max: byProvider.max || null,
          tg: byProvider.tg || null,
        },
      });
    } catch (error) {
      console.error('EMPLOYEE_MESSENGER_LINKS_FAILED:', error.code || error.name);
      return sendMessengerError(res, error);
    }
  });

  router.post('/messenger-links/:provider', authMiddleware, async (req, res) => {
    try {
      const provider = String(req.params.provider || '').trim().toLowerCase();
      if (!await buildProviderLink(db, currentEmployeeScope(req).tenantId, provider, 'configuration-check')) {
        throw new MessengerAuthError('BOT_NOT_CONFIGURED', 409);
      }
      const challenge = await createLinkChallenge(db, currentEmployeeScope(req), provider);
      return res.json({
        ok: true,
        provider: challenge.provider,
        link: await buildProviderLink(db, currentEmployeeScope(req).tenantId, challenge.provider, challenge.token),
        expires_at: challenge.expiresAt,
      });
    } catch (error) {
      console.error('EMPLOYEE_MESSENGER_LINK_CREATE_FAILED:', error.code || error.name);
      return sendMessengerError(res, error);
    }
  });

  router.delete('/messenger-links/:provider', authMiddleware, async (req, res) => {
    try {
      const scope = currentEmployeeScope(req);
      await unlinkAccountChannel(db, scope, req.params.provider);
      return res.json({ ok: true });
    } catch (error) {
      console.error('EMPLOYEE_MESSENGER_UNLINK_FAILED:', error.code || error.name);
      return sendMessengerError(res, error);
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const credential = helpers.strOrNull(req.body.login) || helpers.strOrNull(req.body.email);
      const password = helpers.strOrNull(req.body.password);
      if (!credential || !password) return res.status(400).json({ ok: false, error: 'LOGIN_PASSWORD_REQUIRED' });

      const corporate = /^([a-z0-9._-]+)@([a-z0-9-]+)$/i.exec(credential);
      let params;
      let identityFilter;
      if (corporate) {
        params = [corporate[1].toLowerCase(), corporate[2].toLowerCase()];
        identityFilter = 'u.login_local=? AND t.login_suffix=?';
      } else {
        if (!credential.includes('@')) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        params = [credential];
        identityFilter = `(u.email=? AND (u.role='owner' OR EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1)))`;
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.password_hash, u.must_change_password, u.employee_status, u.auth_version,
                u.name, u.role, u.is_active, t.name AS tenant_name, t.slug AS tenant_slug,
                t.is_active AS tenant_active
         FROM app_users u
         JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE (${identityFilter})
         ORDER BY u.id
         LIMIT 2`,
        params
      );

      if (users.length > 1) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

      if (users.length === 1) {
        const user = users[0];
        if (!await bcrypt.compare(password, user.password_hash)) {
          return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        }
        if (user.employee_status === 'archived') return res.status(403).json({ ok: false, error: 'USER_ARCHIVED' });
        if (user.employee_status !== 'active' || Number(user.is_active) !== 1) return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
        if (Number(user.tenant_active) !== 1) return res.status(403).json({ ok: false, error: 'TENANT_BLOCKED' });
        if(req.body.messenger_request_id){
          if(Number(user.tenant_id)!==browserTenant(req))throw new MessengerAuthError('INVALID_CREDENTIALS',401);
          if(Number(user.must_change_password))throw new MessengerAuthError('PASSWORD_CHANGE_REQUIRED',403);
          return res.json(await proveBrowserEmployee(db,{tenantId:user.tenant_id,accountId:user.id,
            requestId:req.body.messenger_request_id,binding:req.cookies?.messenger_browser,passwordHash:user.password_hash,authVersion:user.auth_version}));
        }
        await db.query('UPDATE app_users SET last_login_at=NOW() WHERE id=? AND tenant_id=?', [user.id, user.tenant_id]);
        const tenant = { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug };
        const auth = await buildSuccessfulAuth(user, tenant);
        return res.status(auth.status).json(auth.body);
      }

      if (req.body.messenger_request_id || corporate || !credential.includes('@')) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      const [tenants] = await db.query(
        `SELECT id AS tenant_id, email, password_hash, name AS tenant_name, slug AS tenant_slug, is_active
         FROM ten_tenants WHERE email=? LIMIT 1`,
        [credential]
      );
      const tenant = tenants[0];
      if (!tenant || Number(tenant.is_active) !== 1 || !tenant.password_hash
          || !await bcrypt.compare(password, tenant.password_hash)) {
        return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      }
      const legacyOwner = await loadLegacyOwner(db, tenant.tenant_id, tenant.email);
      if (legacyOwner && (legacyOwner.employee_status !== 'active' || Number(legacyOwner.is_active) !== 1 || Number(legacyOwner.is_owner) !== 1)) return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
      const tokenUser = { id: null, tenant_id: tenant.tenant_id, email: tenant.email, login: null, name: `${tenant.tenant_name} (Магазин)`, role: 'owner', auth_version: Number(legacyOwner?.auth_version || 0) };
      return res.json({
        ok: true,
        next: 'dashboard',
        redirect: '/dashboard/products',
        token: signUserToken(tokenUser, { loginType: 'tenant' }),
        user: publicUser(tokenUser),
        tenant: { id: Number(tenant.tenant_id), name: tenant.tenant_name, slug: tenant.tenant_slug },
      });
    } catch (error) {
      if(error instanceof MessengerAuthError)return sendMessengerError(res,error);
      console.error('Ошибка входа:', error);
      return res.status(500).json({ ok: false, error: 'LOGIN_ERROR' });
    }
  });

  router.post('/change-password', async (req, res) => {
    try {
      const token = readRequestToken(req);
      const currentPassword = typeof req.body.current_password === 'string' ? req.body.current_password : '';
      const newPassword = req.body.new_password;
      if (!employeeIdentity.secureTransport(req)) return res.status(426).json({ ok: false, error: 'HTTPS_REQUIRED' });
      try { employeeIdentity.validatePassword(newPassword); } catch (error) { return res.status(400).json({ ok: false, error: error.code }); }
      if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
      if (!currentPassword) return res.status(400).json({ ok: false, error: 'CURRENT_PASSWORD_REQUIRED' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!(Number(decoded.userId) > 0) || !(Number(decoded.tenantId) > 0)) {
        return res.status(403).json({ ok: false, error: 'PASSWORD_CHANGE_NOT_ALLOWED' });
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.role, u.is_active, u.employee_status, u.auth_version,
                u.password_hash, u.must_change_password, t.name AS tenant_name, t.slug AS tenant_slug, t.is_active AS tenant_active
         FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE u.id=? AND u.tenant_id=? LIMIT 1`,
        [decoded.userId, decoded.tenantId]
      );
      const user = users[0];
      if (!user || user.employee_status !== 'active' || Number(user.is_active) !== 1 || Number(user.tenant_active) !== 1) {
        return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
      }
      if (Number(decoded.authVersion || 0) !== Number(user.auth_version)) return res.status(401).json({ ok: false, error: 'SESSION_REVOKED' });
      if (!await bcrypt.compare(currentPassword, user.password_hash)) {
        return res.status(400).json({ ok: false, error: 'CURRENT_PASSWORD_INVALID' });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [updated] = await conn.query(
          "UPDATE app_users SET password_hash=?, must_change_password=0, auth_version=auth_version+1 WHERE id=? AND tenant_id=? AND password_hash=? AND is_active=1 AND employee_status='active' AND auth_version=?",
          [passwordHash, user.id, user.tenant_id, user.password_hash, user.auth_version]
        );
        if (!updated.affectedRows) throw new MessengerAuthError('PASSWORD_CHANGE_CONFLICT', 409);
        await conn.query(
          `UPDATE auth_verification_challenges SET consumed_at=NOW()
           WHERE tenant_id=? AND account_type='employee' AND account_id=? AND consumed_at IS NULL`,
          [user.tenant_id, user.id]
        );
        await conn.commit();
      } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        throw error;
      } finally {
        conn.release();
      }
      user.must_change_password = 0;
      user.auth_version = Number(user.auth_version || 0) + 1;
      revokeUserStreams(user.tenant_id, user.id);
      const tenant = { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug };
      const auth = await buildSuccessfulAuth(user, tenant);
      return res.status(auth.status).json(auth.body);
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
      }
      console.error('PASSWORD_CHANGE_FAILED:', error.code || error.name);
      if (error instanceof MessengerAuthError) return sendMessengerError(res, error);
      return res.status(500).json({ ok: false, error: 'PASSWORD_CHANGE_ERROR' });
    }
  });

  router.post('/active-role', async (req, res) => {
    try {
      const token = readRequestToken(req);
      const roleId = Number(req.body.role_id || 0);
      if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
      if (!(roleId > 0)) return res.status(400).json({ ok: false, error: 'ROLE_REQUIRED' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.userId || !(Number(decoded.tenantId) > 0)) {
        return res.status(403).json({ ok: false, error: 'ROLE_SWITCH_NOT_ALLOWED' });
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.last_name, u.first_name, u.patronymic, u.photo_revision, u.role, u.is_active, u.employee_status, u.auth_version, u.must_change_password,
                t.name AS tenant_name, t.slug AS tenant_slug, t.is_active AS tenant_active
         FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE u.id=? AND u.tenant_id=? LIMIT 1`,
        [decoded.userId, decoded.tenantId]
      );
      const user = users[0];
      if (!user || user.employee_status !== 'active' || Number(user.is_active) !== 1 || Number(user.tenant_active) !== 1) {
        return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
      }
      if (Number(decoded.authVersion || 0) !== Number(user.auth_version)) return res.status(401).json({ ok: false, error: 'SESSION_REVOKED' });
      const roles = await loadUserRoles(db, user.tenant_id, user.id);
      const selected = roles.find((role) => Number(role.id) === roleId);
      if (!selected) return res.status(403).json({ ok: false, error: 'ROLE_NOT_ASSIGNED' });
      const tenant = { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug };
      return res.json({
        ok: true,
        token: signUserToken(user, { activeRoleId: selected.id }),
        user: publicUser(user, selected.id),
        tenant,
        roles: roles.map(publicRole),
        active_role: publicRole(selected),
        redirect: selected.start_route,
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
      }
      console.error('Ошибка переключения роли:', error);
      return res.status(500).json({ ok: false, error: 'ROLE_SWITCH_ERROR' });
    }
  });

  router.get('/me/photo', authMiddleware, async (req, res) => {
    try {
      const userId = Number(req.user.userId || req.user.sessionUserId || 0);
      if (!(userId > 0)) return res.status(404).json({ ok: false, error: 'PHOTO_NOT_FOUND' });
      return await employeeIdentity.sendEmployeePhoto(db, res, Number(req.user.tenantId), userId);
    } catch (error) {
      console.error('AUTH_PROFILE_PHOTO_FAILED:', error.code || error.name);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/me', async (req, res) => {
    try {
      const token = readRequestToken(req);
      if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.userId && (decoded.loginType === 'tenant' || decoded.role === 'owner')) {
        const [tenants] = await db.query('SELECT id, name, slug, email FROM ten_tenants WHERE id=? AND is_active=1 LIMIT 1', [decoded.tenantId]);
        const tenant = tenants[0];
        if (!tenant) return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
        const legacyOwner = await loadLegacyOwner(db, tenant.id, tenant.email);
        if (legacyOwner) {
          if (legacyOwner.employee_status !== 'active' || Number(legacyOwner.is_active) !== 1 || Number(legacyOwner.is_owner) !== 1) return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
          if (Number(decoded.authVersion || 0) !== Number(legacyOwner.auth_version)) return res.status(401).json({ ok: false, error: 'SESSION_REVOKED' });
        }
        const [stores] = await db.query('SELECT id, name FROM ten_stores WHERE tenant_id=? AND is_active=1 ORDER BY name, id', [tenant.id]);
        return res.json({ ok: true, user: { id: null, email: tenant.email, name: `${tenant.name} (Магазин)`, profile_name: legacyOwner?.name || null, last_name: legacyOwner?.last_name || null, first_name: legacyOwner?.first_name || null, patronymic: legacyOwner?.patronymic || null, photo_revision: legacyOwner?.photo_revision || null, tenant_id: Number(tenant.id) }, tenant: { id: Number(tenant.id), name: tenant.name, slug: tenant.slug }, roles: [], permissions: ['*'], stores });
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.last_name, u.first_name, u.patronymic, u.photo_revision, u.role, u.is_active, u.employee_status, u.auth_version, u.must_change_password,
                t.name AS tenant_name, t.slug AS tenant_slug
         FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE u.id=? AND u.tenant_id=? AND u.is_active=1 AND t.is_active=1 LIMIT 1`,
        [decoded.userId, decoded.tenantId]
      );
      const user = users[0];
      if (!user) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      if (user.employee_status !== 'active') return res.status(403).json({ ok: false, error: user.employee_status === 'archived' ? 'USER_ARCHIVED' : 'USER_BLOCKED' });
      if (Number(decoded.authVersion || 0) !== Number(user.auth_version)) return res.status(401).json({ ok: false, error: 'SESSION_REVOKED' });
      const roles = await loadUserRoles(db, user.tenant_id, user.id);
      const activeRole = roles.find((role) => Number(role.id) === Number(decoded.activeRoleId))
        || (roles.length === 1 ? roles[0] : null);
      const [permissionRows] = activeRole ? await db.query(
        `SELECT p.permission_key, rp.access_rule
         FROM role_permissions rp
         JOIN system_permissions p ON p.id=rp.permission_id
         WHERE rp.tenant_id=? AND rp.role_id=?
         ORDER BY p.sort_order, p.id`,
        [user.tenant_id, activeRole.id]
      ) : [[]];
      const [stores] = await db.query(
        `SELECT s.id, s.name
         FROM user_stores us
         JOIN ten_stores s ON s.tenant_id=us.tenant_id AND s.id=us.store_id
         WHERE us.tenant_id=? AND us.user_id=? AND s.is_active=1
         ORDER BY s.name, s.id`,
        [user.tenant_id, user.id]
      );
      return res.json({
        ok: true,
        user: publicUser(user, activeRole && activeRole.id),
        tenant: { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug },
        roles: roles.map(publicRole),
        active_role: activeRole ? publicRole(activeRole) : null,
        permissions: permissionRows.map((permission) => ({ key: permission.permission_key, access_rule: permission.access_rule })),
        stores,
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
      }
      console.error('Ошибка получения данных пользователя:', error);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
