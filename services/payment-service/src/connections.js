"use strict";

const { randomBytes, randomUUID, createCipheriv, createDecipheriv } = require("node:crypto");
const d = require("./payment-domain");
const fs=require('node:fs');
const path=require('node:path');
const { PROVIDER_DEFINITIONS: PROVIDERS } = require("./payment-provider");
function json(value, fallback) { return value == null ? fallback : typeof value === "string" ? JSON.parse(value) : value; }
function masterKey(config,version=config.credentialsKeyVersion) {
  const selected=version===config.credentialsKeyVersion?config.credentialsMasterKey:config.credentialsPreviousKeys?.[String(version)];
  if (!/^[a-fA-F0-9]{64}$/.test(selected || "")) d.fail("PAYMENT_CREDENTIALS_KEY_UNAVAILABLE");
  return Buffer.from(selected, "hex");
}
function encrypt(secret, config, tenantId, connectionId) {
  const key = masterKey(config);
  try {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`payment-credentials:${tenantId}:${connectionId}`));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return JSON.stringify({ version: 1, keyVersion: config.credentialsKeyVersion,
      algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: ciphertext.toString("base64") });
  } catch { d.fail("PAYMENT_CREDENTIALS_ENCRYPTION_FAILED"); }
}
// For provider operations only; never called by list/detail API.
function decrypt(payload, config, tenantId, connectionId) {
  try {
    const envelope = json(payload);
    if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm" || !Number.isInteger(envelope.keyVersion) || envelope.keyVersion<1)
      d.fail("PAYMENT_CREDENTIALS_ENCRYPTION_FAILED");
    const cipher = createDecipheriv("aes-256-gcm", masterKey(config,envelope.keyVersion), Buffer.from(envelope.iv, "base64"));
    cipher.setAAD(Buffer.from(`payment-credentials:${tenantId}:${connectionId}`));
    cipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    return Buffer.concat([cipher.update(Buffer.from(envelope.data, "base64")), cipher.final()]).toString("utf8");
  } catch (error) {
    if (error.code === "PAYMENT_CREDENTIALS_KEY_UNAVAILABLE") throw error;
    d.fail("PAYMENT_CREDENTIALS_ENCRYPTION_FAILED");
  }
}
function createConnections(db, config) {
  function dto(row, stores) {
    return { id: String(row.id), provider: row.provider, name: row.name, environment: row.environment,
      enabled: !!row.enabled, verificationStatus: row.verification_status, revision: row.revision,
      configuration: json(row.configuration, {}), credentials: { secretKeyConfigured: row.credentials_encrypted != null, secretKeyViewAllowed:!config.production },
      scope: { type: row.scope_type, storeIds: stores.map(store => String(store.store_id)) },
      archived: row.archived_at != null, hasHistory: !!row.has_history,
      operational: !!row.enabled && row.archived_at == null && row.verification_status === "verified"
        && row.verified_revision === row.credentials_version,
      verifiedAt: row.verified_at, lastCheckedAt: row.last_checked_at, verificationCode: row.verification_code,
      providerCapabilities: row.verification_status === "verified" && row.verified_revision === row.credentials_version
        ? json(row.provider_capabilities, null) : null,
      createdAt: row.created_at, updatedAt: row.updated_at };
  }
  async function detail(conn,row) {
    const [stores] = await conn.query("SELECT store_id FROM payment_connection_stores WHERE tenant_id=? AND connection_id=? ORDER BY store_id", [row.tenant_id,row.id]);
    return dto(row,stores);
  }
  async function find(conn, tenantId, id, lock = false) {
    const [rows] = await conn.query(`SELECT c.*, EXISTS(SELECT 1 FROM payment_payments p
      WHERE p.tenant_id=c.tenant_id AND p.provider_connection_id=c.id) AS has_history
      FROM payment_provider_connections c WHERE c.tenant_id=? AND c.id=? AND c.archived_at IS NULL ${lock ? "FOR UPDATE" : ""}`,
      [tenantId, id]);
    if (!rows.length) d.fail("PAYMENT_NOT_FOUND");
    return rows[0];
  }
  async function list(input) {
    const tenantId = d.identifier(input.tenantId);
    const [rows] = await db.query("SELECT * FROM payment_provider_connections WHERE tenant_id=? AND archived_at IS NULL ORDER BY enabled DESC,provider,name,id", [tenantId]);
    const [assignments] = await db.query("SELECT connection_id,store_id FROM payment_connection_stores WHERE tenant_id=? ORDER BY store_id", [tenantId]);
    const byId = new Map();
    assignments.forEach(row => { const key = String(row.connection_id); if (!byId.has(key)) byId.set(key, []); byId.get(key).push(row); });
    return rows.map(row => dto(row,byId.get(String(row.id)) || []));
  }
  async function get(input) { return detail(db, await find(db, d.identifier(input.tenantId), d.identifier(input.connectionId))); }
  async function webhookInfo(input){
    const row=await find(db,d.identifier(input.tenantId),d.identifier(input.connectionId));
    let url=config.webhookPublicUrl,temporary=false;
    if(config.webhookDevTunnel && !url){
      const file=path.resolve(__dirname,'../../../tmp/dev-payment-webhook-tunnel.json');
      let state;
      try{state=JSON.parse(await fs.promises.readFile(file,'utf8'));}
      catch(error){if(error.code!=='ENOENT')d.fail('PAYMENT_SERVICE_NOT_READY');}
      if(state && Number.isInteger(state.pid) && state.pid>0 && state.provider==='cloudflared'
        && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(state.public_url)){
        let running=true;try{process.kill(state.pid,0);}catch{running=false;}
        if(running){url=`${state.public_url}/webhooks/yookassa`;temporary=true;}
      }
    }
    const [last]=await db.query(`SELECT MAX(i.processed_at) AS last_processed_at FROM payment_payments p
      INNER JOIN payment_webhook_inbox i ON i.provider=p.provider AND i.object_id=p.provider_payment_id AND i.status='done'
      WHERE p.tenant_id=? AND p.provider_connection_id=?`,[row.tenant_id,row.id]);
    return {url,temporary,receiverEnabled:config.webhooksEnabled,
      events:['payment.succeeded','payment.canceled','payment.waiting_for_capture'],lastProcessedAt:last[0].last_processed_at};
  }
  async function save(input, archived = false) {
    const tenantId = d.identifier(input.tenantId), actorId = d.identifier(input.actorId);
    const id = input.connectionId == null ? null : d.identifier(input.connectionId);
    const body = input.data;
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => !["provider", "name", "environment", "enabled", "configuration", "credentials", "scope", "revision"].includes(key))
      || Object.values(body).some(value => value === null)) d.fail("PAYMENT_INPUT_INVALID");
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("INSERT INTO payment_connection_guards (tenant_id) VALUES (?) ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id)", [tenantId]);
      const old = id ? await find(conn, tenantId, id, true) : null;
      if (old && body.revision !== old.revision) d.fail("PAYMENT_CONNECTION_VERSION_CONFLICT");
      if (archived) {
        if (!old) d.fail("PAYMENT_NOT_FOUND");
        await conn.query("UPDATE payment_provider_connections SET enabled=0,archived_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6),revision=revision+1 WHERE tenant_id=? AND id=?", [tenantId,id]);
        await audit("payment_connection.archived", {});
        await conn.commit();
        return { id, archived: true };
      }
      const provider = body.provider ?? old?.provider;
      if (!PROVIDERS.some(item => item.id === provider) || (old && provider !== old.provider)) d.fail("PAYMENT_INPUT_INVALID");
      const rawName = body.name ?? old?.name;
      if (typeof rawName !== "string") d.fail("PAYMENT_INPUT_INVALID");
      const name = d.text(rawName.trim(), 150);
      const environment = body.environment ?? old?.environment;
      if (!["test", "live"].includes(environment)) d.fail("PAYMENT_INPUT_INVALID");
      const enabled = body.enabled ?? (old ? !!old.enabled : false);
      if (typeof enabled !== "boolean") d.fail("PAYMENT_INPUT_INVALID");
      const configuration = body.configuration ?? json(old?.configuration, {});
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)
        || Object.keys(configuration).some(key => key !== "shopId") || typeof configuration.shopId !== "string"
        || !/^[1-9]\d{0,31}$/.test(configuration.shopId)) d.fail("PAYMENT_INPUT_INVALID");
      const credentialsChanged = Object.hasOwn(body, "credentials");
      let secret;
      if (credentialsChanged) {
        if (!body.credentials || typeof body.credentials !== "object" || Array.isArray(body.credentials)
          || Object.keys(body.credentials).some(key => key !== "secretKey")) d.fail("PAYMENT_INPUT_INVALID");
        secret = d.text(body.credentials.secretKey, 512);
        if (!/^[\x21-\x7e]+$/.test(secret) || /^\*+$/.test(secret)) d.fail("PAYMENT_INPUT_INVALID");
        masterKey(config);
      } else if (!old?.credentials_encrypted) d.fail("PAYMENT_INPUT_INVALID");
      const previousConfiguration = json(old?.configuration, {});
      const identityChanged = old && (environment !== old.environment || configuration.shopId !== previousConfiguration.shopId);
      if (old?.has_history && identityChanged) d.fail("PAYMENT_CONNECTION_HISTORY_LOCKED");
      const scope = body.scope ?? { type: old?.scope_type, storeIds: old ? (await detail(conn,old)).scope.storeIds : [] };
      if (!scope || typeof scope !== "object" || Array.isArray(scope)
        || Object.keys(scope).some(key => !["type","storeIds"].includes(key)) || !["all","selected"].includes(scope.type)
        || !Array.isArray(scope.storeIds)) d.fail("PAYMENT_INPUT_INVALID");
      const storeIds = [...new Set(scope.storeIds.map(d.identifier))].sort((a,b) => Number(a)-Number(b));
      if ((scope.type === "selected" && !storeIds.length) || (scope.type === "all" && storeIds.length)) d.fail("PAYMENT_INPUT_INVALID");
      for (const storeId of storeIds) {
        const [stores] = await conn.query("SELECT id FROM ten_stores WHERE tenant_id=? AND id=?", [tenantId,storeId]);
        if (!stores.length) d.fail("PAYMENT_INPUT_INVALID");
      }
      if (enabled) {
        const [others] = await conn.query(`SELECT c.id,c.scope_type,s.store_id FROM payment_provider_connections c
          LEFT JOIN payment_connection_stores s ON s.tenant_id=c.tenant_id AND s.connection_id=c.id
          WHERE c.tenant_id=? AND c.provider=? AND c.environment=? AND c.enabled=1 AND c.archived_at IS NULL
          AND c.id<>? FOR UPDATE`, [tenantId,provider,environment,id || 0]);
        if (others.some(row => scope.type === "all" || row.scope_type === "all" || storeIds.includes(String(row.store_id))))
          d.fail("PAYMENT_CONNECTION_STORE_CONFLICT");
      }
      let connectionId = id;
      if (!old) {
        const [insert] = await conn.query(`INSERT INTO payment_provider_connections
          (tenant_id,provider,name,environment,enabled,configuration,scope_type,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`, [tenantId,provider,name,environment,enabled,JSON.stringify(configuration),scope.type]);
        connectionId = String(insert.insertId);
      }
      let encrypted = old?.credentials_encrypted == null ? null : JSON.stringify(json(old.credentials_encrypted));
      if (credentialsChanged) encrypted = encrypt(secret,config,tenantId,connectionId);
      const reset = credentialsChanged || identityChanged;
      await conn.query(`UPDATE payment_provider_connections SET name=?,environment=?,enabled=?,configuration=?,
        credentials_encrypted=?,credentials_version=credentials_version+?,scope_type=?,verification_status=?,
        revision=revision+?,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND id=?`,
        [name,environment,enabled,JSON.stringify(configuration),encrypted,reset ? 1 : 0,scope.type,
          reset ? (old?.verified_at ? "stale" : "not_checked") : old.verification_status,old ? 1 : 0,tenantId,connectionId]);
      await conn.query("DELETE FROM payment_connection_stores WHERE tenant_id=? AND connection_id=?", [tenantId,connectionId]);
      for (const storeId of storeIds) await conn.query("INSERT INTO payment_connection_stores (tenant_id,connection_id,store_id,created_at) VALUES (?,?,?,UTC_TIMESTAMP(6))", [tenantId,connectionId,storeId]);
      await audit(old ? "payment_connection.updated" : "payment_connection.created", { credentialsChanged, scopeType: scope.type, storeIds }, connectionId);
      if (reset) await audit("payment_connection.credentials_changed", { credentialsChanged },connectionId);
      if (old && credentialsChanged) await audit("payment_connection.secret_rotated", {},connectionId);
      if (!old || !!old.enabled !== enabled) await audit(enabled ? "payment_connection.enabled" : "payment_connection.disabled",{},connectionId);
      if (Object.hasOwn(body,"scope")) await audit("payment_connection.store_assignments_changed", { scopeType:scope.type,storeIds },connectionId);
      const result = await detail(conn,await find(conn,tenantId,connectionId));
      await conn.commit();
      return result;
      async function audit(type,metadata,connectionId = id) {
        await conn.query(`INSERT INTO payment_connection_audit (tenant_id,connection_id,actor_user_id,type,request_id,metadata,created_at)
          VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6))`, [tenantId,connectionId,actorId,type,d.text(input.requestId),JSON.stringify(metadata)]);
      }
    } catch (error) {
      try { await conn.rollback(); } catch { conn.destroy(); }
      if (!(error instanceof d.PaymentError) || error.code === "PAYMENT_CREDENTIALS_ENCRYPTION_FAILED")
        console.error(JSON.stringify({ operation:"connection.save",result:"failed",requestId:input.requestId,
          code: /^[A-Z_]{1,64}$/.test(error.code || "") ? error.code : "PAYMENT_INTERNAL_ERROR" }));
      throw error;
    } finally { conn.release(); }
  }
  async function providerContext(input, historical = false) {
    const tenantId = d.identifier(input.tenantId), id = d.identifier(input.connectionId);
    const [rows] = await db.query("SELECT * FROM payment_provider_connections WHERE tenant_id=? AND id=?", [tenantId,id]);
    if (!rows.length) d.fail("PAYMENT_CONNECTION_INVALID");
    const row = rows[0];
    if (!historical && (!row.enabled || row.archived_at || row.verification_status !== "verified"
      || row.verified_revision !== row.credentials_version)) d.fail("PAYMENT_CONNECTION_NOT_OPERATIONAL");
    if (!historical && row.scope_type === "selected") {
      const [assignments] = await db.query("SELECT store_id FROM payment_connection_stores WHERE tenant_id=? AND connection_id=? AND store_id=?", [tenantId,id,d.identifier(input.storeId)]);
      if (!assignments.length) d.fail("PAYMENT_CONNECTION_INVALID");
    }
    return { ...input, connectionId:id, tenantId, shopId:json(row.configuration,{}).shopId,
      requireOperational:!historical,
      environment:row.environment, provider:row.provider, credentialsRevision:row.credentials_version,
      capabilities:json(row.provider_capabilities,null), connectionRevision:row.revision };
  }
  async function resolveCredentials(context) {
    if (context.requireOperational) await providerContext(context);
    const [rows] = await db.query("SELECT configuration,credentials_encrypted,credentials_version FROM payment_provider_connections WHERE tenant_id=? AND id=?",[d.identifier(context.tenantId),d.identifier(context.connectionId)]);
    if (!rows.length || rows[0].credentials_version !== context.credentialsRevision) d.fail("PAYMENT_CONNECTION_VERSION_CONFLICT");
    const shopId = json(rows[0].configuration,{}).shopId;
    if (shopId !== context.shopId) d.fail("PAYMENT_CONNECTION_VERSION_CONFLICT");
    return { shopId, secretKey:decrypt(rows[0].credentials_encrypted,config,context.tenantId,context.connectionId) };
  }
  async function verify(input, registry) {
    if (!Number.isInteger(input.data?.revision) || input.data.revision<1) d.fail("PAYMENT_INPUT_INVALID");
    const attemptId=randomUUID();
    const tenantId=d.identifier(input.tenantId), id=d.identifier(input.connectionId), actor=d.identifier(input.actorId);
    const conn=await db.getConnection(); let row;
    try {
      await conn.beginTransaction(); row=await find(conn,tenantId,id,true);
      if (row.revision !== input.data.revision) d.fail("PAYMENT_CONNECTION_VERSION_CONFLICT");
      const [reserved]=await conn.query(`UPDATE payment_provider_connections SET verification_attempt_id=?,verification_lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND)
        WHERE tenant_id=? AND id=? AND (verification_lease_until IS NULL OR verification_lease_until<UTC_TIMESTAMP(6))`,[attemptId,tenantId,id]);
      if (!reserved.affectedRows) d.fail("PAYMENT_OPERATION_IN_PROGRESS");
      await conn.query(`INSERT INTO payment_connection_audit(tenant_id,connection_id,actor_user_id,type,request_id,metadata,created_at)
        VALUES (?,?,?,'payment_connection.verification_started',?,'{}',UTC_TIMESTAMP(6))`,[tenantId,id,actor,input.requestId]);
      await conn.commit();
    } catch(error) { try{await conn.rollback();}catch{conn.destroy();} throw error; } finally{conn.release();}
    let capabilities, error;
    try {
      capabilities=await registry.get(row.provider).verifyConnection({tenantId,connectionId:id,
        shopId:json(row.configuration,{}).shopId,environment:row.environment,credentialsRevision:row.credentials_version,requestId:input.requestId});
    } catch(failure) { error=failure; }
    const outcome=await db.getConnection();
    try {
      await outcome.beginTransaction(); const current=await find(outcome,tenantId,id,true);
      if (current.verification_attempt_id !== attemptId) d.fail("PAYMENT_CONNECTION_VERSION_CONFLICT");
      if (current.credentials_version !== row.credentials_version) {
        await outcome.query("UPDATE payment_provider_connections SET verification_lease_until=NULL WHERE tenant_id=? AND id=?",[tenantId,id]);
        await outcome.commit(); d.fail("PAYMENT_CONNECTION_VERSION_CONFLICT");
      }
      const definite=error && ["PAYMENT_PROVIDER_AUTH_FAILED","PAYMENT_PROVIDER_ACCESS_DENIED","PAYMENT_PROVIDER_IDENTITY_MISMATCH"].includes(error.code);
      const status=error ? (definite ? "failed" : current.verification_status) : "verified";
      await outcome.query(`UPDATE payment_provider_connections SET verification_status=?,verification_code=?,last_checked_at=UTC_TIMESTAMP(6),
        verified_at=IF(?=1,UTC_TIMESTAMP(6),verified_at),verified_revision=IF(?=1,credentials_version,verified_revision),
        provider_capabilities=IF(?=1,?,provider_capabilities),capabilities_synced_at=IF(?=1,UTC_TIMESTAMP(6),capabilities_synced_at),
        verification_lease_until=NULL,updated_at=UTC_TIMESTAMP(6),revision=revision+1 WHERE tenant_id=? AND id=?`,
        [status,error?.code || null,!error,!error,!error,JSON.stringify(capabilities||null),!error,tenantId,id]);
      await outcome.query(`INSERT INTO payment_connection_audit(tenant_id,connection_id,actor_user_id,type,request_id,metadata,created_at)
        VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6))`,[tenantId,id,actor,error ? "payment_connection.verification_failed" : "payment_connection.verified",input.requestId,
          JSON.stringify({result:error?.code || "ok",environment:row.environment})]);
      const result=await detail(outcome,await find(outcome,tenantId,id)); await outcome.commit();
      return { connection:result, ok:!error, code:error?.code || null };
    } catch(failure) { try{await outcome.rollback();}catch{outcome.destroy();} throw failure; } finally{outcome.release();}
  }
  async function revealSecret(input) {
    if(config.production)d.fail("PAYMENT_SECRET_VIEW_DISABLED");
    const tenantId=d.identifier(input.tenantId), id=d.identifier(input.connectionId), actor=d.identifier(input.actorId);
    const conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      const row=await find(conn,tenantId,id,true);
      const secretKey=decrypt(row.credentials_encrypted,config,tenantId,id);
      await conn.query(`INSERT INTO payment_connection_audit(tenant_id,connection_id,actor_user_id,type,request_id,metadata,created_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6))`,[tenantId,id,actor,"payment_connection.secret_viewed",input.requestId,"{}"]);
      await conn.commit(); return {secretKey};
    } catch(error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  return { webhookInfo,revealSecret, providers: () => PROVIDERS, list, get, save, archive: input => save(input,true),
    providerContext, resolveCredentials, verify };
}
module.exports = { createConnections, decrypt, encrypt };
