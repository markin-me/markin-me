"use strict";

const {randomUUID}=require('node:crypto');
const d=require('./payment-domain');
const {safeCode}=require('./durable-queue');
const FINAL=new Set(['paid','cancelled','failed','partially_refunded','refunded']);
const REVIEW=new Set(['PAYMENT_PROVIDER_RECOVERY_EXPIRED','PAYMENT_PROVIDER_RECOVERY_REQUIRED',
  'PAYMENT_PROVIDER_INVALID_RESPONSE','PAYMENT_PROVIDER_IDENTITY_MISMATCH','PAYMENT_PROVIDER_NOT_FOUND',
  'PAYMENT_IDEMPOTENCY_CONFLICT','PAYMENT_INVALID_STATE']);

// Scheduling owns technical metadata only. Financial writes stay in Provider Operations / Payment Core.
function createReconciliation(db,config,core,operations,refunds) {
  let stopped=true,timer,active=Promise.resolve(),lastSuccessfulTick=null,lastErrorCode=null;
  let lastErrorLogAt=0;
  const counters={scanned:0,attempted:0,changed:0,recovered:0,errors:0,manualReview:0,durationMs:0};
  const leaseSeconds=120;
  async function connectionClaim(payment) {
    const token=randomUUID();
    const [result]=await db.query(`UPDATE payment_provider_connections SET reconcile_lease_token=?,
      reconcile_lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND)
      WHERE tenant_id=? AND id=? AND (reconcile_lease_until IS NULL OR reconcile_lease_until<UTC_TIMESTAMP(6))
      AND (reconcile_retry_after IS NULL OR reconcile_retry_after<=UTC_TIMESTAMP(6)
        OR reconcile_blocked_revision<>credentials_version OR (reconcile_blocked_revision IS NOT NULL
          AND verification_status='verified' AND verified_revision=credentials_version AND verified_at>reconcile_blocked_at))`,
      [token,leaseSeconds,payment.tenant_id,payment.provider_connection_id]);
    return result.affectedRows?token:null;
  }
  function delay(payment,attempt) {
    const data=typeof payment.provider_data==='string'?JSON.parse(payment.provider_data):payment.provider_data;
    const base=payment.status==='created'?config.reconcileCreatedDelay:
      data?.provider_status==='waiting_for_capture'?config.reconcileCaptureDelay:config.reconcilePendingDelay;
    const bounded=Math.min(config.reconcileMaxDelay,base*2**Math.min(attempt-1,10));
    return Math.min(config.reconcileMaxDelay,Math.ceil(bounded*(1+Math.random()*0.2)));
  }
  async function run(input,manual=false) {
    const payment=await core.getPayment(input);
    if(payment.channel!=='online' || payment.provider!=='yookassa')d.fail('PAYMENT_METHOD_NOT_SUPPORTED');
    if(FINAL.has(payment.status))return manual?operations.get({...input,source:'reconciliation'}):payment;
    if(!manual && payment.reconciliation_state==='manual_review')return payment;
    const connToken=await connectionClaim(payment);
    if(!connToken){
      if(manual)d.fail('PAYMENT_OPERATION_IN_PROGRESS');
      return payment;
    }
    const token=randomUUID(),started=Date.now(),requestId=input.requestId || randomUUID();
    let claimed=false,updated=payment,result='unchanged',code=null;
    try {
      const [claim]=await db.query(`UPDATE payment_payments SET reconcile_lease_token=?,
        reconcile_lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),reconcile_attempt_count=reconcile_attempt_count+1
        WHERE tenant_id=? AND store_id=? AND id=? AND status IN ('created','pending','waiting_for_confirmation')
        AND (reconcile_lease_until IS NULL OR reconcile_lease_until<UTC_TIMESTAMP(6))
        AND (?=1 OR (reconciliation_state IN ('scheduled','retryable') AND next_reconcile_at<=UTC_TIMESTAMP(6)))`,
        [token,leaseSeconds,payment.tenant_id,payment.store_id,payment.id,manual?1:0]);
      if(!claim.affectedRows){if(manual)d.fail('PAYMENT_OPERATION_IN_PROGRESS');return payment;}
      claimed=true;counters.attempted++;
      updated=await operations.get({...input,source:'reconciliation',requestId});
      if(Number(updated.version)!==Number(payment.version)){counters.changed++;result='changed';}
      if(!payment.provider_payment_id && updated.provider_payment_id){counters.recovered++;result='recovered';}
      const [age]=await db.query('SELECT created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? HOUR) AS stale FROM payment_payments WHERE id=? AND tenant_id=?',
        [config.reconcileHorizonHours,payment.id,payment.tenant_id]);
      if(!FINAL.has(updated.status) && (age[0]?.stale || Number(payment.reconcile_attempt_count)+1>=config.reconcileMaxAttempts)) {
        code='PAYMENT_RECONCILIATION_HORIZON';result='manual_review';
        updated=await core.reconciliationAttention({...input,leaseToken:token,code});counters.manualReview++;
      }
      await db.query(`UPDATE payment_payments SET reconciliation_state=IF(status IN ('paid','cancelled','failed','refunded','partially_refunded'),'done',?),last_reconciled_at=UTC_TIMESTAMP(6),last_reconcile_error_code=?,
        next_reconcile_at=IF(?=1 OR status IN ('paid','cancelled','failed','refunded','partially_refunded'),NULL,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND))
        WHERE tenant_id=? AND store_id=? AND id=? AND reconcile_lease_token=?`,
        [result==='manual_review'?'manual_review':FINAL.has(updated.status)?'done':'scheduled',code,
          FINAL.has(updated.status) || result==='manual_review'?1:0,delay(updated,Number(payment.reconcile_attempt_count)+1),
          payment.tenant_id,payment.store_id,payment.id,token]);
      await db.query(`UPDATE payment_provider_connections SET reconcile_retry_after=NULL,reconcile_error_code=NULL,reconcile_blocked_revision=NULL
        WHERE tenant_id=? AND id=? AND reconcile_lease_token=?`,[payment.tenant_id,payment.provider_connection_id,connToken]);
      return updated;
    } catch(error) {
      code=safeCode(error);result='retry';
      if(claimed) {
        counters.errors++;
        const [age]=await db.query('SELECT created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? HOUR) AS stale FROM payment_payments WHERE id=? AND tenant_id=?',
          [config.reconcileHorizonHours,payment.id,payment.tenant_id]);
        if(REVIEW.has(code) || (code!=='PAYMENT_OPERATION_IN_PROGRESS' && (age[0]?.stale || Number(payment.reconcile_attempt_count)+1>=config.reconcileMaxAttempts))) {
          updated=await core.reconciliationAttention({...input,leaseToken:token,code});result='manual_review';counters.manualReview++;
        }
        const cooldown=['PAYMENT_PROVIDER_AUTH_FAILED','PAYMENT_PROVIDER_ACCESS_DENIED','PAYMENT_PROVIDER_RATE_LIMITED',
          'PAYMENT_PROVIDER_UNAVAILABLE','PAYMENT_PROVIDER_TIMEOUT','PAYMENT_CREDENTIALS_KEY_UNAVAILABLE'].includes(code);
        const retrySeconds=cooldown?Math.max(config.reconcileConnectionCooldown,Number(error.retryAfterSeconds)||0):delay(payment,Number(payment.reconcile_attempt_count)+1);
        if(cooldown)await db.query(`UPDATE payment_provider_connections SET reconcile_retry_after=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),
          reconcile_error_code=?,reconcile_blocked_revision=credentials_version,reconcile_blocked_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND id=? AND reconcile_lease_token=?`,
          [retrySeconds,code,payment.tenant_id,payment.provider_connection_id,connToken]);
        await db.query(`UPDATE payment_payments SET reconciliation_state=IF(status IN ('paid','cancelled','failed','refunded','partially_refunded'),'done',?),last_reconciled_at=UTC_TIMESTAMP(6),last_reconcile_error_code=?,
          next_reconcile_at=IF(?=1 OR status IN ('paid','cancelled','failed','refunded','partially_refunded'),NULL,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND))
          WHERE tenant_id=? AND store_id=? AND id=? AND reconcile_lease_token=?`,
          [result==='manual_review'?'manual_review':'retryable',code,result==='manual_review'?1:0,retrySeconds,
            payment.tenant_id,payment.store_id,payment.id,token]);
      }
      if(manual)throw error;
      return updated;
    } finally {
      if(claimed)await db.query(`UPDATE payment_payments SET reconcile_lease_token=NULL,reconcile_lease_until=NULL
        WHERE tenant_id=? AND store_id=? AND id=? AND reconcile_lease_token=?`,[payment.tenant_id,payment.store_id,payment.id,token]);
      await db.query(`UPDATE payment_provider_connections SET reconcile_lease_token=NULL,reconcile_lease_until=NULL
        WHERE tenant_id=? AND id=? AND reconcile_lease_token=?`,[payment.tenant_id,payment.provider_connection_id,connToken]);
      counters.durationMs+=Date.now()-started;
      console[result==='manual_review'?'error':'info'](JSON.stringify({operation:'payment.reconciliation',requestId,
        tenantId:String(payment.tenant_id),storeId:String(payment.store_id),orderId:String(payment.order_id),
        paymentId:String(payment.id),providerPaymentId:updated.provider_payment_id,connectionId:String(payment.provider_connection_id),
        environment:payment.environment,source:'reconciliation',attempt:Number(payment.reconcile_attempt_count)+1,
        oldState:payment.status,newState:updated.status,duration:Date.now()-started,result,causeCode:code}));
    }
  }
  async function tick() {
    if(!config.reconciliationEnabled) {if(config.refundRecoveryEnabled)await refunds.tick(()=>stopped);lastSuccessfulTick=new Date().toISOString();return;}
    const [rows]=await db.query(`SELECT p.tenant_id,p.store_id,p.id FROM payment_payments p
      JOIN payment_provider_connections c ON c.tenant_id=p.tenant_id AND c.id=p.provider_connection_id
      WHERE p.reconciliation_state IN ('scheduled','retryable') AND p.next_reconcile_at<=UTC_TIMESTAMP(6)
      AND p.status IN ('created','pending','waiting_for_confirmation') AND p.channel='online' AND p.provider='yookassa'
      AND p.created_at<=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? SECOND)
      AND (p.reconcile_lease_until IS NULL OR p.reconcile_lease_until<UTC_TIMESTAMP(6))
      AND (c.reconcile_retry_after IS NULL OR c.reconcile_retry_after<=UTC_TIMESTAMP(6) OR c.reconcile_blocked_revision<>c.credentials_version
        OR (c.verification_status='verified' AND c.verified_revision=c.credentials_version AND c.verified_at>c.reconcile_blocked_at))
      ORDER BY p.next_reconcile_at,p.id LIMIT ?`,[config.reconcileCreatedDelay,config.reconcileBatchSize]);
    counters.scanned+=rows.length;
    let index=0;
    const results=await Promise.allSettled(Array.from({length:Math.min(config.reconcileConcurrency,rows.length)},async()=>{
      while(!stopped && index<rows.length) {
        const row=rows[index++];
        await run({tenantId:String(row.tenant_id),storeId:String(row.store_id),paymentId:String(row.id)});
      }
    }));
    const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    if(config.refundRecoveryEnabled)await refunds.tick(()=>stopped);
    lastSuccessfulTick=new Date().toISOString();
    if(rows.length)console.info(JSON.stringify({operation:'payment.reconciliation.tick',scanned:rows.length,lastSuccessfulTick}));
  }
  function schedule(){if(stopped)return;timer=setTimeout(()=>{
    active=tick().then(()=>{lastErrorCode=null;}).catch(error=>{
      const code=safeCode(error),now=Date.now();
      if(code!==lastErrorCode || now-lastErrorLogAt>=60000){
        console.error(JSON.stringify({operation:'payment.reconciliation.tick',result:'worker_unavailable',causeCode:code}));
        lastErrorLogAt=now;
      }
      lastErrorCode=code;
    }).finally(schedule);
  },config.reconcilePollMs+Math.floor(Math.random()*1000));timer.unref();}
  async function stats() {
    const [payments]=await db.query(`SELECT environment,reconciliation_state,COUNT(*) AS count,
      MAX(TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP(6))) AS oldestAgeSeconds,
      SUM(TIMESTAMPDIFF(MINUTE,created_at,UTC_TIMESTAMP(6))<5) AS under5Minutes,
      SUM(TIMESTAMPDIFF(MINUTE,created_at,UTC_TIMESTAMP(6)) BETWEEN 5 AND 29) AS from5To30Minutes,
      SUM(TIMESTAMPDIFF(MINUTE,created_at,UTC_TIMESTAMP(6)) BETWEEN 30 AND 119) AS from30To120Minutes,
      SUM(TIMESTAMPDIFF(MINUTE,created_at,UTC_TIMESTAMP(6))>=120) AS over2Hours
      FROM payment_payments WHERE channel='online' AND provider='yookassa'
      AND status IN ('created','pending','waiting_for_confirmation') GROUP BY environment,reconciliation_state`);
    const [providerOperations]=await db.query(`SELECT operation,status,COUNT(*) AS count,MIN(created_at) AS oldest
      FROM payment_provider_operations WHERE status IN ('reserved','uncertain') GROUP BY operation,status`);
    const [connections]=await db.query(`SELECT tenant_id,id,environment,reconcile_error_code,reconcile_retry_after
      FROM payment_provider_connections WHERE reconcile_error_code IS NOT NULL`);
    return {enabled:config.reconciliationEnabled,lastSuccessfulTick,counters:{...counters},payments,providerOperations,connections};
  }
  return {get runtime(){return {running:!stopped,lastSuccessfulTick,lastErrorCode};},now:input=>run(input,true),stats,start(){if((config.reconciliationEnabled || config.refundRecoveryEnabled) && stopped){stopped=false;schedule();}},
    async stop(){stopped=true;clearTimeout(timer);await active;}};
}
module.exports={createReconciliation};
