'use strict';

const crypto = require('crypto');
const { completeLinkChallenge, completeBotLoginRequest, browserBotAction } = require('./messengerAuth');
const { getTenantBotConfig, getTenantWebhookSecret, recordTenantTelegramContact, deliverCode } = require('./messengerDelivery');
const { handleTenantTelegramUpdate } = require('./tenantTelegramBot');
const { handleTenantMaxUpdate } = require('./maxBotPolling');
const { resolveTelegramOperation } = require('./telegramPolling');
const {
  createServiceInteractionContext, markCurrentOperation, recordCurrentTelegramUserServiceMessage,
  resolveServiceOperation, runWithOperation,
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
    config = await loadTenantBotConfig(eventDb, operation.tenantId, provider, { allowDisabled: true });
    if (config.token !== ingressConfig.token) throw Object.assign(new Error('BOT_SCOPE_MISMATCH'), { code: 'BOT_SCOPE_MISMATCH' });
  }
  const rawStart=provider==='tg'
    ? String(update?.message?.text||'').match(/^\/start(?:@\w+)?\s+([abl]_[A-Za-z0-9_-]{40})$/)?.[1]
    : String(update?.payload||'').match(/^[abl]_[A-Za-z0-9_-]{40}$/)?.[0];
  const rawCallback=String(provider==='tg'?update?.callback_query?.data:update?.callback?.payload);
  const scopedToken=rawStart || rawCallback.match(/^auth:([br]_[A-Za-z0-9_-]{40,43})$/)?.[1];
  if(scopedToken){
    const reference=scopedToken.startsWith('r_');
    const table=reference || /^[br]_/.test(scopedToken)?'auth_browser_requests':'auth_verification_challenges';
    const [targets]=await eventDb.query(`SELECT tenant_id FROM ${table} WHERE ${reference?'public_id':'token_hash'}=? AND provider=? LIMIT 1`,
      [reference?scopedToken.slice(2):crypto.createHash('sha256').update(scopedToken).digest(),provider]);
    if(targets[0] && Number(targets[0].tenant_id)!==config.tenantId){
      const target=await loadTenantBotConfig(eventDb,Number(targets[0].tenant_id),provider,{allowDisabled:true});
      if(target.token!==config.token)throw Object.assign(new Error('BOT_SCOPE_MISMATCH'),{code:'BOT_SCOPE_MISMATCH',status:403});
      config=target;
    }
  }
  const contactUid=provider==='tg' && update?.message?.contact ? update.message.from?.id
    : provider==='max' && update?.message?.body?.attachments?.some(a=>a.type==='contact') ? update.message.sender?.user_id : null;
  let ambiguousContact=false;
  if(contactUid){
    const tokenColumn=provider==='tg'?'telegram_bot_token':'max_bot_token';
    const [targets]=await eventDb.query(`SELECT r.tenant_id FROM auth_browser_requests r JOIN ten_tenants t ON t.id=r.tenant_id AND t.is_active=1
      WHERE r.provider=? AND r.provider_user_id=? AND r.state='started' AND r.expires_at>NOW() AND TRIM(t.${tokenColumn})=?
      UNION SELECT c.tenant_id FROM auth_verification_challenges c JOIN ten_tenants t ON t.id=c.tenant_id AND t.is_active=1
      WHERE c.provider=? AND c.completed_provider_user_id=? AND c.purpose='link' AND c.delivery_status='pending'
        AND c.consumed_at IS NULL AND c.expires_at>NOW() AND TRIM(t.${tokenColumn})=? LIMIT 2`,[provider,String(contactUid),config.token,provider,String(contactUid),config.token]);
    if(targets.length===1 && Number(targets[0].tenant_id)!==config.tenantId){
      const target=await loadTenantBotConfig(eventDb,Number(targets[0].tenant_id),provider,{allowDisabled:true});
      if(target.token!==config.token)throw Object.assign(new Error('BOT_SCOPE_MISMATCH'),{code:'BOT_SCOPE_MISMATCH',status:403});
      config=target;
    }
    ambiguousContact=targets.length>1;
  }
  const serviceContext=await measureWebhookStage(timing, 'serviceOperationMs', () => resolveServiceOperation(eventDb,{
    tenantId:config.tenantId,provider,token:scopedToken,providerUserId:contactUid,
    onTrackingTiming:addServiceOperationTiming,
  })) || createServiceInteractionContext(eventDb, {
    tenantId: config.tenantId, provider, eventKey: webhookEvent.eventKey,
    onTrackingTiming:addServiceOperationTiming,
  });
  await runWithOperation(serviceContext,async()=>{
  const customerEnabled=Boolean((await require('./helpers/customerAuth').settings(eventDb,config.tenantId))[provider]);
  const options = {
    onBrowserAuth: async ({providerUserId,token,confirm})=>{
      const result=(config.enabled||customerEnabled)
        ? await measureWebhookStage(timing, 'authMs', () => measureWebhookStage(timing, 'browserBotActionMs',
          () => browserBotAction(eventDb,{tenantId:config.tenantId,provider,providerUserId,token,confirm,employeeEnabled:config.enabled})))
        : {ok:false};
      if(confirm&&result.ok)await markCurrentOperation('success');
      else if(!result.ok)await markCurrentOperation('error');
      if(!confirm&&provider==='tg')await recordCurrentTelegramUserServiceMessage(update?.message,'start');
      return result;
    },
    onBrowserContact: async ({providerUserId,phone,name,avatarUrl})=>{
      if(ambiguousContact)return {ok:false,error:'CONTACT_REQUEST_AMBIGUOUS'};
      if(!config.enabled&&!customerEnabled)return {ok:false};
      const profileLink=await measureWebhookStage(timing, 'authMs', () => completeLinkChallenge(eventDb,provider,providerUserId,null,config.tenantId,
        provider==='tg'?{telegramContact:update.message,customerOnly:true}:{verifiedMaxContact:{providerUserId,phone},customerOnly:true}));
      if(profileLink.matched!==false){
        if(profileLink.ok&&!profileLink.contactRequired)await markCurrentOperation('success');
        else if(!profileLink.ok)await markCurrentOperation('error');
        if(provider==='tg')await recordCurrentTelegramUserServiceMessage(update?.message,'contact');
        return {...profileLink,context:'PROFILE_LINK'};
      }
      const result=await measureWebhookStage(timing, 'authMs', () => measureWebhookStage(timing, 'browserBotActionMs',
        () => browserBotAction(eventDb,{tenantId:config.tenantId,provider,providerUserId,contact:{phone,name},employeeEnabled:config.enabled})));
      if(result.autoConfirmed)await markCurrentOperation('success');
      else if(!result.ok&&result.matched!==false)await markCurrentOperation('error');
      if(provider==='tg'&&result.matched!==false)await recordCurrentTelegramUserServiceMessage(update?.message,'contact');
      return result;
    },
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
      if(result.ok&&!result.contactRequired)await markCurrentOperation('success');
      else if(!result.ok)await markCurrentOperation('error');
      if(provider==='tg')await recordCurrentTelegramUserServiceMessage(update?.message,'start');
      return result;
    },
    onAuthContact: async ({ providerUserId, message }) => {
      const result=config.enabled
        ? await measureWebhookStage(timing, 'authMs', () => completeLinkChallenge(eventDb, 'tg', providerUserId, null, config.tenantId, { telegramContact: message }))
        : { ok: false };
      if(result.ok&&!result.contactRequired)await markCurrentOperation('success');
      else if(!result.ok&&result.matched!==false)await markCurrentOperation('error');
      if(result.matched!==false)await recordCurrentTelegramUserServiceMessage(message,'contact');
      return result;
    },
  };
  if (provider === 'tg') {
    await recordTenantTelegramContact(eventDb, config, update);
    await handleTenantTelegramUpdate(eventDb, helpers, {
      tenantId: config.tenantId, token: config.token, username: config.identifier,
    }, update, options);
  } else {
    await handleTenantMaxUpdate(eventDb, helpers, {
      tenantId: config.tenantId, token: config.token,
    }, update, options);
  }
  });
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
