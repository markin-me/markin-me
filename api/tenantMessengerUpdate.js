'use strict';

const crypto = require('crypto');
const { recordMessengerBotContact } = require('./messengerBotContacts');
const { completeLinkChallenge, completeBotLoginRequest, browserBotAction } = require('./messengerAuth');
const { getTenantBotConfig, getTenantWebhookSecret, recordTenantTelegramContact, deliverCode } = require('./messengerDelivery');
const { handleTenantTelegramUpdate } = require('./tenantTelegramBot');
const { handleTenantMaxUpdate } = require('./maxBotPolling');
const { resolveTelegramOperation } = require('./telegramPolling');
const {
  createServiceInteractionContext, markCurrentOperation, recordCurrentTelegramUserServiceMessage,
  resolveServiceOperation, runWithOperation, recordCustomerPrompt, scheduleCurrentControlCleanup,
} = require('./messengerCleanup');

async function measureWebhookStage(timing, field, handler) {
  if (!timing) return handler();
  const start = Number(process.hrtime.bigint()) / 1e6;
  try { return await handler(); }
  finally { timing[field] += Number(process.hrtime.bigint()) / 1e6 - start; }
}

// Shared business dispatcher for webhook and on-demand polling.
async function handleTenantMessengerUpdate(eventDb, helpers, ingressConfig, update, webhookEvent, timing = null, resolvedOperation = null) {
  const provider = ingressConfig.provider;
  const loadTenantBotConfig = (...args) => measureWebhookStage(timing, 'configMs', () => getTenantBotConfig(...args));
  const addServiceOperationTiming = timing ? ms => { timing.serviceOperationMs += Math.max(0, Number(ms) || 0); } : null;
  let config=ingressConfig;
  if (provider === 'tg') {
    if (update?.my_chat_member) {
      await recordTelegramMembership(eventDb, config.token, update);
      return;
    }
    const operation = resolvedOperation || await resolveTelegramOperation(eventDb, config.token, update);
    if (!operation) return { ignored: true };
    resolvedOperation=operation;
    config = await loadTenantBotConfig(eventDb, operation.tenantId, provider, { allowDisabled: true });
    if (config.token !== ingressConfig.token) throw Object.assign(new Error('BOT_SCOPE_MISMATCH'), { code: 'BOT_SCOPE_MISMATCH' });
  }
  const rawStart=provider==='tg'
    ? String(update?.message?.text||'').match(/^\/start(?:@\w+)?\s+([abl]_[A-Za-z0-9_-]{40})$/)?.[1]
    : String(update?.payload || update?.message?.body?.text || '').match(/^(?:\/start\s+)?([abl]_[A-Za-z0-9_-]{40})$/)?.[1];
  const rawCallback=String(provider==='tg'?update?.callback_query?.data:update?.callback?.payload);
  if(provider==='max' && !rawStart && /^(?:\/start\s+)?[abl]_/.test(String(update?.payload || update?.message?.body?.text || '')))
    return {ignored:true};
  const scopedToken=rawStart || rawCallback.match(/^auth:([bcr]_[A-Za-z0-9_-]{40,43})(?::(?:yes|no))?$/)?.[1];
  let scopedAccountType=null;
  if(scopedToken){
    const reference=/^[cr]_/.test(scopedToken);
    const table=/^[br]_/.test(scopedToken)?'auth_browser_requests':'auth_verification_challenges';
    const [targets]=await eventDb.query(`SELECT tenant_id,account_type FROM ${table} WHERE ${reference?'public_id':'token_hash'}=? AND provider=? LIMIT 1`,
      [reference?scopedToken.slice(2):crypto.createHash('sha256').update(scopedToken).digest(),provider]);
    if(!targets.length)return {ignored:true};
    scopedAccountType=targets[0]?.account_type;
    if(targets[0] && Number(targets[0].tenant_id)!==config.tenantId){
      const target=await loadTenantBotConfig(eventDb,Number(targets[0].tenant_id),provider,{allowDisabled:true});
      if(target.token!==config.token)throw Object.assign(new Error('BOT_SCOPE_MISMATCH'),{code:'BOT_SCOPE_MISMATCH',status:403});
      config=target;
    }
  }
  const contactUid=provider==='tg' && update?.message?.contact ? update.message.from?.id
    : provider==='max' && update?.message?.body?.attachments?.some(a=>a.type==='contact') ? update.message.sender?.user_id : null;
  let contactOperation = null;
  let ambiguousContact = false;
  let employeeContact = false;
  if(contactUid){
    const tokenColumn=provider==='tg'?'telegram_bot_token':'max_bot_token';
    const [targets]=await eventDb.query(`SELECT r.tenant_id,r.public_id,r.account_type,'browser' source_type,
        UNIX_TIMESTAMP(r.created_at) created_seconds
      FROM auth_browser_requests r JOIN ten_tenants t ON t.id=r.tenant_id AND t.is_active=1
      WHERE r.provider=? AND r.provider_user_id=? AND r.state='started' AND r.expires_at>NOW()
        AND r.code_challenge_id IS NULL AND TRIM(t.${tokenColumn})=?
      UNION ALL SELECT c.tenant_id,c.public_id,c.account_type,'challenge',UNIX_TIMESTAMP(c.created_at)
      FROM auth_verification_challenges c JOIN ten_tenants t ON t.id=c.tenant_id AND t.is_active=1
      WHERE c.provider=? AND c.completed_provider_user_id=? AND c.purpose='link' AND c.delivery_status='pending'
        AND c.consumed_at IS NULL AND c.expires_at>NOW() AND TRIM(t.${tokenColumn})=?`,
    [provider,String(contactUid),config.token,provider,String(contactUid),config.token]);
    const tenants = new Set(targets.map(row=>Number(row.tenant_id)));
    if(tenants.size===1 && !tenants.has(config.tenantId)){
      const target=await loadTenantBotConfig(eventDb,Number(targets[0].tenant_id),provider,{allowDisabled:true});
      if(target.token!==config.token)throw Object.assign(new Error('BOT_SCOPE_MISMATCH'),{code:'BOT_SCOPE_MISMATCH',status:403});
      config=target;
    }
    const relevant = targets.filter(row=>provider!=='tg' || Number(update.message.date)>=Number(row.created_seconds));
    employeeContact = config.enabled && relevant.some(row=>row.account_type==='employee');
    const customers = relevant.filter(row=>row.account_type==='customer');
    const employees = relevant.filter(row=>row.account_type==='employee');
    ambiguousContact = tenants.size>1 || relevant.length>1;
    if(!ambiguousContact){
      contactOperation = employeeContact
        ? employees.find(row=>row.source_type==='browser') || (employees.length===1?employees[0]:null)
        : customers[0] || null;
    }
    // The Telegram resolver selected a specific contact before a competing start
    // could commit. Never transfer that event to the replacement.
    const ingressSource=resolvedOperation?.source;
    if(ingressSource?.account_type==='customer' && !employeeContact
      && contactOperation?.public_id!==ingressSource.public_id) return {ignored:true};
  }
  if(ambiguousContact){
    console.warn('CONTACT_REQUEST_AMBIGUOUS',{tenantId:config.tenantId,provider});
    return {ignored:true};
  }
  if(contactUid && !ambiguousContact && !contactOperation && !employeeContact)return {ignored:true};
  const uid=String(contactUid || (provider==='tg' ? update?.callback_query?.from?.id || update?.message?.from?.id
    : update?.callback?.user?.user_id || update?.message?.sender?.user_id || update?.user?.user_id) || '');
  const customerEvent=(contactOperation?.account_type || scopedAccountType)==='customer';
  // The dispatcher already borrows the webhook connection. Serialize outbound
  // prompts for the same customer without taking another pool connection.
  const promptLock=customerEvent && /^[1-9][0-9]{0,19}$/.test(uid)
    ? `customer-prompt:${config.tenantId}:${provider}:${uid}` : null;
  if(promptLock){
    const [[lock]]=await eventDb.query('SELECT GET_LOCK(?,1) acquired',[promptLock]);
    if(Number(lock.acquired)!==1)throw Object.assign(new Error('WEBHOOK_IN_PROGRESS'),{code:'WEBHOOK_IN_PROGRESS',status:503});
  }
  try{
    const scopedContactToken = contactOperation && `${contactOperation.source_type==='browser'?'r':'c'}_${contactOperation.public_id}`;
    const serviceContext=await measureWebhookStage(timing, 'serviceOperationMs', () => resolveServiceOperation(eventDb,{
      tenantId:config.tenantId,provider,token:scopedToken || scopedContactToken,providerUserId:contactUid,
      onTrackingTiming:addServiceOperationTiming,
    })) || createServiceInteractionContext(eventDb, {
      tenantId: config.tenantId, provider, eventKey: webhookEvent.eventKey,
      onTrackingTiming:addServiceOperationTiming,
    });
    await runWithOperation(serviceContext,async()=>{
    const customerEnabled=Boolean((await require('./helpers/customerAuth').settings(eventDb,config.tenantId))[provider]);
    const options = {
      employeeOperation: (contactOperation?.account_type || scopedAccountType) === 'employee',
      onBrowserAuth: async ({providerUserId,token,confirm,phoneChoice})=>{
        if(token.startsWith('c_')){
          if(scopedAccountType==='employee')return {ok:true,silent:true,accountType:'employee'};
          const result=await measureWebhookStage(timing,'authMs',()=>completeLinkChallenge(eventDb,provider,providerUserId,token,config.tenantId,{customerOnly:true}));
          if(result.ok&&!result.silent)await markCurrentOperation('success');
          else if(!result.ok)await markCurrentOperation('error');
          return {...result,context:'PROFILE_LINK'};
        }
        const result=(config.enabled||customerEnabled)
          ? await measureWebhookStage(timing, 'authMs', () => measureWebhookStage(timing, 'browserBotActionMs',
            () => browserBotAction(eventDb,{tenantId:config.tenantId,provider,providerUserId,token,confirm,phoneChoice,employeeEnabled:config.enabled})))
          : {ok:false};
        if(result.cancelled)await markCurrentOperation('cancelled');
        else if(!result.ok)await markCurrentOperation('error');
        if(!confirm&&provider==='tg'&&result.accountType!=='customer')await recordCurrentTelegramUserServiceMessage(update?.message,'start');
        return result;
      },
      onBrowserContact: async ({providerUserId,phone,name,messageDate})=>{
        if(ambiguousContact)return {ok:false,error:'CONTACT_REQUEST_AMBIGUOUS'};
        if(!config.enabled&&!customerEnabled)return {ok:false};
        if(contactOperation?.account_type==='customer' && !customerEnabled)return {ok:true,silent:true};
        if(contactOperation?.account_type==='customer' && contactOperation.source_type==='challenge'){
          const result=await measureWebhookStage(timing,'authMs',()=>completeLinkChallenge(eventDb,provider,providerUserId,null,config.tenantId,{
            ...(provider==='tg'?{telegramContact:update.message}:{verifiedMaxContact:{providerUserId,phone}}),
            customerOnly:true,contactTarget:contactOperation.public_id,
          }));
          if(result.ok&&!result.contactRequired&&!result.linkConfirmation&&!result.silent)await markCurrentOperation('success');
          else if(!result.ok&&result.matched!==false)await markCurrentOperation('error');
          return result.matched===false?{ok:true,silent:true}:{...result,context:'PROFILE_LINK'};
        }
        if(contactOperation?.account_type==='employee' && contactOperation.source_type==='challenge'){
          const result=await completeLinkChallenge(eventDb,provider,providerUserId,null,config.tenantId,{
            ...(provider==='tg'?{telegramContact:update.message}:{verifiedMaxContact:{providerUserId,phone}}),
            employeeOnly:true,employeeEnabled:config.enabled,contactTarget:contactOperation.public_id,
          });
          if(result.ok&&!result.contactRequired&&!result.silent)await markCurrentOperation('success');
          else if(!result.ok)await markCurrentOperation('error');
          if(provider==='tg')await recordCurrentTelegramUserServiceMessage(update.message,'contact');
          return {...result,accountType:'employee'};
        }
        if(!contactOperation || contactOperation.account_type==='employee' && contactOperation.source_type==='challenge'){
          return provider==='tg' || employeeContact?{ok:false,matched:false}:{ok:true,silent:true};
        }
        const result=await measureWebhookStage(timing, 'authMs', () => measureWebhookStage(timing, 'browserBotActionMs',
          () => browserBotAction(eventDb,{tenantId:config.tenantId,provider,providerUserId,contact:{phone,name,...(provider==='tg'?{messageDate}:{})},employeeEnabled:config.enabled,
            contactTarget:contactOperation.public_id,employeeOnly:employeeContact})));
        if(contactOperation.account_type==='customer' && result.matched===false)return {ok:true,silent:true};
        if(!result.ok&&result.matched!==false)await markCurrentOperation('error');
        if(provider==='tg'&&result.matched!==false&&result.accountType!=='customer')await recordCurrentTelegramUserServiceMessage(update?.message,'contact');
        return result;
      },
      customerContactEvent: contactOperation?.account_type==='customer',
      onCustomerControlsUsed: scheduleCurrentControlCleanup,
      onCustomerPrompt: (result,phase) => recordCustomerPrompt(eventDb,{
        tenantId:config.tenantId,provider,reference:result.reference,phase,
      }),
      loginEnabled: config.enabled||customerEnabled,
      miniAppEnabled: config.miniAppEnabled,
      onTelegramApiTiming: timing ? timing.addTelegramApi : null,
      onStartKind: timing ? startKind => { timing.startKind = startKind; } : null,
      onStageTiming: timing ? (field, durationMs) => {
        if (field === 'pendingOriginMs' || field === 'knownCustomerMs') {
          timing[field] += Math.max(0, Number(durationMs) || 0);
        }
      } : null,
      onAuthLogin: async ({ providerUserId, token }) => {
        if(scopedAccountType==='employee')return {ok:true,silent:true,accountType:'employee'};
        const result=await measureWebhookStage(timing, 'authMs', () => completeBotLoginRequest(eventDb, provider, providerUserId, token, config.tenantId,
          message => deliverCode(eventDb, message, { onTelegramApiTiming: timing ? timing.addTelegramApi : null })));
        if(!result.ok)await markCurrentOperation('error');
        if(provider==='tg')await recordCurrentTelegramUserServiceMessage(update?.message,'start');
        return result;
      },
      onAuthLink: async ({ providerUserId, token }) => {
        const result=config.enabled||customerEnabled
          ? await measureWebhookStage(timing, 'authMs', () => completeLinkChallenge(eventDb, provider, providerUserId, token, config.tenantId,{employeeEnabled:config.enabled}))
          : { ok: false };
        if(result.ok&&!result.contactRequired&&!result.linkConfirmation&&!result.silent)await markCurrentOperation('success');
        else if(!result.ok)await markCurrentOperation('error');
        if(provider==='tg'&&result.context!=='PROFILE_LINK')await recordCurrentTelegramUserServiceMessage(update?.message,'start');
        return result;
      },
      onAuthContact: async ({ providerUserId, message }) => {
        if (contactOperation?.account_type !== 'employee' || contactOperation.source_type !== 'challenge') {
          return {ok:true,silent:true};
        }
        const result=config.enabled
          ? await measureWebhookStage(timing, 'authMs', () => completeLinkChallenge(eventDb, 'tg', providerUserId, null, config.tenantId, {
            telegramContact: message,employeeOnly:true,contactTarget:contactOperation.public_id,
          }))
          : { ok: false };
        if(result.ok&&!result.contactRequired)await markCurrentOperation('success');
        else if(!result.ok&&result.matched!==false)await markCurrentOperation('error');
        if(result.matched!==false)await recordCurrentTelegramUserServiceMessage(message,'contact');
        return result;
      },
    };
    await recordMessengerBotContact(eventDb, config, update);
    if (provider === 'tg') {
      await recordTenantTelegramContact(eventDb, config, update);
      await handleTenantTelegramUpdate(eventDb, helpers, {
        tenantId: config.tenantId, storeId: config.storeId, token: config.token, username: config.identifier,
      }, update, options);
    } else {
      await handleTenantMaxUpdate(eventDb, helpers, {
        tenantId: config.tenantId, storeId: config.storeId, token: config.token,
      }, update, options);
    }
    });
  }finally{
    if(promptLock)await eventDb.query('SELECT RELEASE_LOCK(?)',[promptLock]);
  }
}

async function telegramLegacyNamespaces(db, token) {
  const [tenants] = await db.query('SELECT id FROM ten_tenants WHERE TRIM(telegram_bot_token)=?', [token]);
  return tenants.map(tenant => getTenantWebhookSecret({ tenantId: Number(tenant.id), provider: 'tg' }));
}

async function recordTelegramMembership(db, token, update) {
  const { botKey } = require('./telegramPolling');
  const [tenants] = await db.query(`SELECT DISTINCT t.id FROM ten_tenants t
    JOIN auth_telegram_bot_contacts c ON c.tenant_id=t.id AND c.bot_key=? AND c.provider_user_id=?
    WHERE t.is_active=1 AND TRIM(t.telegram_bot_token)=?`,
  [botKey(token), String(update.my_chat_member?.chat?.id || ''), token]);
  for (const tenant of tenants) await recordTenantTelegramContact(db, { tenantId: Number(tenant.id), token }, update);
}

module.exports = { handleTenantMessengerUpdate, telegramLegacyNamespaces, recordTelegramMembership };
