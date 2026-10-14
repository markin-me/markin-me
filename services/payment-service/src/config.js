"use strict";

const path = require("node:path");
const proxyaddr = require("proxy-addr");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

function loadConfig(env = process.env) {
  function required(name) {
    const value = env[name];
    if (typeof value !== "string" || !value.trim()) throw new Error(`CONFIG_REQUIRED:${name}`);
    return value;
  }
  function integer(name, fallback, max = 2147483647) {
    const raw = env[name] ?? String(fallback);
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) throw new Error(`CONFIG_INVALID:${name}`);
    return Number(raw);
  }
  const token = required("PAYMENT_SERVICE_INTERNAL_TOKEN");
  if (token.length < 32 || token.length > 256 || !/^[\x21-\x7e]+$/.test(token)) throw new Error("CONFIG_INVALID:PAYMENT_SERVICE_INTERNAL_TOKEN");
  const port = integer("PAYMENT_SERVICE_PORT", 3500, 65535);
  if (port === 3000) throw new Error("CONFIG_INVALID:PAYMENT_SERVICE_PORT");
  if (env.PAYMENT_CHECKOUT_ENABLED!==undefined && !["0","1"].includes(env.PAYMENT_CHECKOUT_ENABLED)) throw new Error("CONFIG_INVALID:PAYMENT_CHECKOUT_ENABLED");
  if (env.PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN!==undefined && !["0","1"].includes(env.PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN)) throw new Error("CONFIG_INVALID:PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN");
  if (env.PAYMENT_CHECKOUT_ENVIRONMENT!==undefined && !["test","live"].includes(env.PAYMENT_CHECKOUT_ENVIRONMENT)) throw new Error("CONFIG_INVALID:PAYMENT_CHECKOUT_ENVIRONMENT");
  if (env.PAYMENT_PROVIDER_TEST_ENABLED !== undefined && !["0","1"].includes(env.PAYMENT_PROVIDER_TEST_ENABLED))
    throw new Error("CONFIG_INVALID:PAYMENT_PROVIDER_TEST_ENABLED");
  if (env.PAYMENT_PROVIDER_TEST_ENABLED === "1") {
    let returnUrl;
    try { returnUrl=new URL(env.PAYMENT_PROVIDER_TEST_RETURN_URL); } catch { throw new Error("CONFIG_REQUIRED:PAYMENT_PROVIDER_TEST_RETURN_URL"); }
    if (returnUrl.protocol !== "https:" || returnUrl.username || returnUrl.password || returnUrl.href.length>2048)
      throw new Error("CONFIG_INVALID:PAYMENT_PROVIDER_TEST_RETURN_URL");
  }
  if(env.PAYMENT_WEBHOOKS_ENABLED!==undefined && !["0","1"].includes(env.PAYMENT_WEBHOOKS_ENABLED))throw new Error("CONFIG_INVALID:PAYMENT_WEBHOOKS_ENABLED");
  const webhooksEnabled=env.PAYMENT_WEBHOOKS_ENABLED==="1";
  if(env.PAYMENT_RECONCILIATION_ENABLED!==undefined && !['0','1'].includes(env.PAYMENT_RECONCILIATION_ENABLED))throw new Error('CONFIG_INVALID:PAYMENT_RECONCILIATION_ENABLED');
  const reconciliationEnabled=env.PAYMENT_RECONCILIATION_ENABLED==='1' ||
    (env.PAYMENT_RECONCILIATION_ENABLED===undefined && env.PAYMENT_CHECKOUT_ENABLED==='1' && env.PAYMENT_CHECKOUT_ENVIRONMENT==='live');
  const webhookTrustedProxies=(env.PAYMENT_WEBHOOK_TRUSTED_PROXIES || "").split(",").map(x=>x.trim()).filter(Boolean);
  const webhookSourceCidrs=(env.PAYMENT_WEBHOOK_SOURCE_CIDRS || "185.71.76.0/27,185.71.77.0/27,77.75.153.0/25,77.75.156.11,77.75.156.35,77.75.154.128/25,2a02:5180::/32").split(",").map(x=>x.trim()).filter(Boolean);
  try{if(!webhookSourceCidrs.length)throw new Error();proxyaddr.compile(webhookSourceCidrs);proxyaddr.compile(webhookTrustedProxies);}catch{throw new Error("CONFIG_INVALID:PAYMENT_WEBHOOK_CIDRS");}
  if(webhookTrustedProxies.some(x=>["0.0.0.0/0","::/0"].includes(x)))throw new Error("CONFIG_INVALID:PAYMENT_WEBHOOK_TRUSTED_PROXIES");
  let mainEventsUrl;
  let webhookPublicUrl=null;
  if(env.PAYMENT_WEBHOOK_PUBLIC_URL){
    let url;try{url=new URL(env.PAYMENT_WEBHOOK_PUBLIC_URL);}catch{throw new Error('CONFIG_INVALID:PAYMENT_WEBHOOK_PUBLIC_URL');}
    if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/webhooks/yookassa')throw new Error('CONFIG_INVALID:PAYMENT_WEBHOOK_PUBLIC_URL');
    webhookPublicUrl=url.href;
  }
  if(env.PAYMENT_WEBHOOK_DEV_TUNNEL!==undefined && !['0','1'].includes(env.PAYMENT_WEBHOOK_DEV_TUNNEL))throw new Error('CONFIG_INVALID:PAYMENT_WEBHOOK_DEV_TUNNEL');
  const webhookDevTunnel=env.PAYMENT_WEBHOOK_DEV_TUNNEL==='1';
  if(webhookDevTunnel && (env.PAYMENT_CHECKOUT_ENVIRONMENT || 'test')!=='test')throw new Error('CONFIG_INVALID:PAYMENT_WEBHOOK_DEV_TUNNEL');
  if(webhooksEnabled || reconciliationEnabled){
    try{mainEventsUrl=new URL(required("PAYMENT_MAIN_EVENTS_URL"));}catch{throw new Error("CONFIG_INVALID:PAYMENT_MAIN_EVENTS_URL");}
    if(mainEventsUrl.username || mainEventsUrl.password || mainEventsUrl.search || mainEventsUrl.hash
      || mainEventsUrl.pathname!=="/internal/v1/payment-events"
      || !(mainEventsUrl.protocol==="https:" || (mainEventsUrl.protocol==="http:" && ["127.0.0.1","[::1]"].includes(mainEventsUrl.hostname))))
      throw new Error("CONFIG_INVALID:PAYMENT_MAIN_EVENTS_URL");
  }
  let credentialsPreviousKeys={};
  try {
    credentialsPreviousKeys=JSON.parse(env.PAYMENT_CREDENTIALS_PREVIOUS_KEYS || '{}');
    if(!credentialsPreviousKeys || typeof credentialsPreviousKeys!=='object' || Array.isArray(credentialsPreviousKeys)
      || Object.keys(credentialsPreviousKeys).length>4
      || Object.entries(credentialsPreviousKeys).some(([version,key])=>!(/^[1-9][0-9]{0,8}$/.test(version)) || !/^[a-fA-F0-9]{64}$/.test(key)))throw new Error();
  }catch{throw new Error('CONFIG_INVALID:PAYMENT_CREDENTIALS_PREVIOUS_KEYS');}
  if(env.PAYMENT_REFUNDS_ENABLED!==undefined && !["0","1"].includes(env.PAYMENT_REFUNDS_ENABLED))throw new Error("CONFIG_INVALID:PAYMENT_REFUNDS_ENABLED");
  if(env.PAYMENT_REFUND_RECOVERY_ENABLED!==undefined && !['0','1'].includes(env.PAYMENT_REFUND_RECOVERY_ENABLED))throw new Error('CONFIG_INVALID:PAYMENT_REFUND_RECOVERY_ENABLED');
  const refundsEnabled=env.PAYMENT_REFUNDS_ENABLED==='1';
  const refundRecoveryEnabled=env.PAYMENT_REFUND_RECOVERY_ENABLED===undefined?(reconciliationEnabled || refundsEnabled):env.PAYMENT_REFUND_RECOVERY_ENABLED==='1';
  const production=env.NODE_ENV==='production';
  if(env.PAYMENT_LIVE_RELEASE_APPROVED!==undefined && !['0','1'].includes(env.PAYMENT_LIVE_RELEASE_APPROVED))throw new Error('CONFIG_INVALID:PAYMENT_LIVE_RELEASE_APPROVED');
  const liveReleaseApproved=env.PAYMENT_LIVE_RELEASE_APPROVED==='1';
  if(liveReleaseApproved && (!production || !webhooksEnabled || !reconciliationEnabled || !refundRecoveryEnabled || !webhookPublicUrl))throw new Error('CONFIG_INVALID:PAYMENT_LIVE_RELEASE_APPROVED');
  if(production && (env.PAYMENT_PROVIDER_TEST_ENABLED==='1' || webhookDevTunnel || env.PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN==='1'))
    throw new Error('CONFIG_INVALID:PRODUCTION_TEST_TOOLING');
  if(production && !/^[a-fA-F0-9]{64}$/.test(env.PAYMENT_CREDENTIALS_MASTER_KEY || ''))
    throw new Error('CONFIG_INVALID:PAYMENT_CREDENTIALS_MASTER_KEY');
  if(env.PAYMENT_OUTBOX_ENABLED!==undefined && !['0','1'].includes(env.PAYMENT_OUTBOX_ENABLED))throw new Error('CONFIG_INVALID:PAYMENT_OUTBOX_ENABLED');
  const outboxEnabled=env.PAYMENT_OUTBOX_ENABLED===undefined?(webhooksEnabled || reconciliationEnabled || refundRecoveryEnabled || refundsEnabled):env.PAYMENT_OUTBOX_ENABLED==='1';
  if(liveReleaseApproved && !outboxEnabled)throw new Error('CONFIG_INVALID:PAYMENT_LIVE_RELEASE_APPROVED');
  if(production && env.PAYMENT_CHECKOUT_ENABLED==='1' && (!reconciliationEnabled || !webhooksEnabled || !outboxEnabled || !webhookPublicUrl))
    throw new Error('CONFIG_INVALID:PRODUCTION_PAYMENT_WORKERS');
  if(outboxEnabled && !mainEventsUrl) {
    try{mainEventsUrl=new URL(required('PAYMENT_MAIN_EVENTS_URL'));}catch{throw new Error('CONFIG_INVALID:PAYMENT_MAIN_EVENTS_URL');}
    if(mainEventsUrl.username || mainEventsUrl.password || mainEventsUrl.search || mainEventsUrl.hash
      || mainEventsUrl.pathname!=='/internal/v1/payment-events'
      || !(mainEventsUrl.protocol==='https:' || (mainEventsUrl.protocol==='http:' && ['127.0.0.1','[::1]'].includes(mainEventsUrl.hostname))))
      throw new Error('CONFIG_INVALID:PAYMENT_MAIN_EVENTS_URL');
  }
  return Object.freeze({
    webhooksEnabled,webhookTrustedProxies,webhookSourceCidrs,webhookPublicUrl,webhookDevTunnel,mainEventsUrl:mainEventsUrl?.href,
    liveReleaseApproved,refundRecoveryEnabled,refundsEnabled,production,outboxEnabled,reconciliationEnabled,
    abandonedOrderHours:integer('PAYMENT_ABANDONED_ORDER_HOURS',72,720),
    inboxRetentionDays:env.PAYMENT_INBOX_RETENTION_DAYS===undefined?null:integer("PAYMENT_INBOX_RETENTION_DAYS",1,3650),
    outboxRetentionDays:env.PAYMENT_OUTBOX_RETENTION_DAYS===undefined?null:integer("PAYMENT_OUTBOX_RETENTION_DAYS",1,3650),
    reconcilePollMs:integer('PAYMENT_RECONCILIATION_POLL_MS',30000,300000),
    reconcileBatchSize:integer('PAYMENT_RECONCILIATION_BATCH_SIZE',25,100),
    reconcileConcurrency:integer('PAYMENT_RECONCILIATION_CONCURRENCY',2,8),
    reconcileCreatedDelay:integer('PAYMENT_RECONCILIATION_CREATED_DELAY_SECONDS',60,3600),
    reconcilePendingDelay:integer('PAYMENT_RECONCILIATION_PENDING_DELAY_SECONDS',120,3600),
    reconcileCaptureDelay:integer('PAYMENT_RECONCILIATION_CAPTURE_DELAY_SECONDS',300,3600),
    reconcileMaxDelay:integer('PAYMENT_RECONCILIATION_MAX_DELAY_SECONDS',3600,86400),
    reconcileHorizonHours:integer('PAYMENT_RECONCILIATION_HORIZON_HOURS',72,720),
    reconcileMaxAttempts:integer('PAYMENT_RECONCILIATION_MAX_ATTEMPTS',100,1000),
    reconcileConnectionCooldown:integer('PAYMENT_RECONCILIATION_CONNECTION_COOLDOWN_SECONDS',900,86400),
    refreshCooldownSeconds:integer('PAYMENT_REFRESH_COOLDOWN_SECONDS',15,300),
    deliveryPollMs:integer("PAYMENT_DELIVERY_POLL_MS",1000,60000),
    deliveryMaxAttempts:integer("PAYMENT_DELIVERY_MAX_ATTEMPTS",20,100),
    deliveryTimeoutMs:integer("PAYMENT_DELIVERY_TIMEOUT_MS",10000,30000),
    host: env.PAYMENT_SERVICE_HOST || "127.0.0.1", port, token,
    shutdownMs: integer("PAYMENT_SERVICE_SHUTDOWN_MS", 15000, 120000),
    providerTimeoutMs: integer("PAYMENT_PROVIDER_TIMEOUT_MS", 3000, 30000),
    providerTestEnabled: env.PAYMENT_PROVIDER_TEST_ENABLED === "1",
    providerTestReturnUrl: env.PAYMENT_PROVIDER_TEST_RETURN_URL,
    checkoutEnabled: env.PAYMENT_CHECKOUT_ENABLED === "1",
    checkoutEnvironment: env.PAYMENT_CHECKOUT_ENVIRONMENT || "test",
    checkoutAllowLocalReturn: env.PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN === "1",
    credentialsPreviousKeys:Object.freeze(credentialsPreviousKeys),
    credentialsMasterKey: env.PAYMENT_CREDENTIALS_MASTER_KEY,
    credentialsKeyVersion: integer("PAYMENT_CREDENTIALS_KEY_VERSION", 1),
    db: {
      host: required("PAYMENT_DB_HOST"), user: required("PAYMENT_DB_USER"),
      password: required("PAYMENT_DB_PASSWORD"), database: required("PAYMENT_DB_NAME"),
      port: integer("PAYMENT_DB_PORT", 3306, 65535),
      connectionLimit: integer("PAYMENT_DB_POOL_SIZE", 8, 64),
      connectTimeout: integer("PAYMENT_DB_CONNECT_TIMEOUT_MS", 5000, 60000),
      charset: "utf8mb4_general_ci", timezone: "Z", dateStrings: true,
      decimalNumbers: false, waitForConnections: true, queueLimit: 64,
    },
  });
}
module.exports = { loadConfig };
