"use strict";

const d=require('./payment-domain');
// Read-only support diagnostics. Tenant-scoped, bounded histories, cached aggregates.
function createOperationalStatus(db,config,delivery,reconciliation) {
  const cache=new Map();
  async function status(input) {
    const tenantId=d.identifier(input.tenantId);
    const previous=cache.get(tenantId);
    if(previous && Date.now()<previous.expires)return previous.value;
    const value=read(tenantId).catch(error=>{cache.delete(tenantId);throw error;});
    if(cache.size>=32)cache.delete(cache.keys().next().value);
    cache.set(tenantId,{expires:Date.now()+30000,value});
    return value;
  }
  async function read(tenantId) {
    const [payments]=await db.query(`SELECT environment,currency,status,COUNT(*) AS count,
      SUM(captured_amount) AS capturedAmount,SUM(refunded_amount) AS refundedAmount
      FROM payment_payments WHERE tenant_id=? AND created_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 DAY)
      GROUP BY environment,currency,status`,[tenantId]);
    const [operations]=await db.query(`SELECT p.environment,o.operation,o.status,COUNT(*) AS count,
      MIN(o.created_at) AS oldest FROM payment_provider_operations o
      JOIN payment_payments p ON p.tenant_id=o.tenant_id AND p.id=o.payment_id
      WHERE o.tenant_id=? AND o.status IN ('reserved','uncertain') GROUP BY p.environment,o.operation,o.status`,[tenantId]);
    const [providerResults]=await db.query(`SELECT p.environment,o.operation,o.status,o.error_code AS errorCode,COUNT(*) AS count
      FROM payment_provider_operations o JOIN payment_payments p ON p.tenant_id=o.tenant_id AND p.id=o.payment_id
      WHERE o.tenant_id=? AND o.created_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 DAY) GROUP BY p.environment,o.operation,o.status,o.error_code`,[tenantId]);
    const [stuck]=await db.query(`SELECT environment,status,COUNT(*) AS count,MAX(TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP(6))) AS oldestAgeSeconds
      FROM payment_payments WHERE tenant_id=? AND status IN ('created','pending','waiting_for_confirmation')
      AND created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 2 HOUR) GROUP BY environment,status`,[tenantId]);
    const [refunds]=await db.query(`SELECT p.environment,r.currency,r.status,COUNT(*) AS count,SUM(r.amount) AS amount,
      MIN(r.created_at) AS oldest FROM payment_refunds r
      JOIN payment_payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id
      WHERE r.tenant_id=? AND (r.status IN ('created','pending') OR r.created_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 DAY))
      GROUP BY p.environment,r.currency,r.status`,[tenantId]);
    const [outbox]=await db.query(`SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest,
      MAX(TIMESTAMPDIFF(SECOND,created_at,UTC_TIMESTAMP(6))) AS oldestAgeSeconds
      FROM payment_event_outbox WHERE tenant_id=? AND status<>'done' GROUP BY status`,[tenantId]);
    const [inbox]=await db.query(`SELECT i.status,COUNT(DISTINCT i.id) AS count,MIN(i.created_at) AS oldest
      FROM payment_webhook_inbox i
      LEFT JOIN payment_payments p ON p.provider='yookassa' AND p.provider_payment_id=i.object_id AND i.event_type LIKE 'payment.%'
      LEFT JOIN payment_refunds r ON r.provider_refund_id=i.object_id AND i.event_type='refund.succeeded'
      WHERE (p.tenant_id=? OR r.tenant_id=?) AND i.status<>'done' GROUP BY i.status`,[tenantId,tenantId]);
    const [attention]=await db.query(`SELECT id,store_id,order_id,environment,status,last_reconcile_error_code AS errorCode,
      created_at FROM payment_payments WHERE tenant_id=? AND reconciliation_state='manual_review' ORDER BY id LIMIT 100`,[tenantId]);
    const [duplicates]=await db.query(`SELECT store_id,order_id,GROUP_CONCAT(DISTINCT environment ORDER BY environment) AS environment,COUNT(*) AS successfulPayments
      FROM payment_payments WHERE tenant_id=? AND captured_amount>0 GROUP BY store_id,order_id
      HAVING COUNT(*)>1 LIMIT 100`,[tenantId]);
    const [mismatches]=await db.query(`SELECT p.id,p.store_id,p.order_id,p.environment,p.refunded_amount AS aggregateAmount,
      COALESCE(SUM(r.amount),0) AS successfulRefundAmount FROM payment_payments p
      LEFT JOIN payment_refunds r ON r.tenant_id=p.tenant_id AND r.payment_id=p.id AND r.status='succeeded'
      WHERE p.tenant_id=? AND p.captured_amount>0
      GROUP BY p.id,p.store_id,p.order_id,p.environment,p.refunded_amount
      HAVING aggregateAmount<>successfulRefundAmount LIMIT 100`,[tenantId]);
    const [connections]=await db.query(`SELECT id,environment,enabled,verification_status AS verificationStatus,
      reconcile_error_code AS errorCode,reconcile_retry_after AS retryAfter
      FROM payment_provider_connections WHERE tenant_id=? AND archived_at IS NULL ORDER BY id LIMIT 100`,[tenantId]);
    const workers={...delivery.runtime,reconciliation:reconciliation.runtime};
    const [incidents]=await db.query(`SELECT CAST(id AS CHAR) AS id,'outbox' AS queue,error_code AS errorCode,created_at FROM payment_event_outbox
      WHERE tenant_id=? AND status='dead' AND lease_token IS NULL ORDER BY id LIMIT 50`,[tenantId]);
    const [inboxIncidents]=await db.query(`SELECT CAST(i.id AS CHAR) AS id,'inbox' AS queue,i.error_code AS errorCode,i.created_at FROM payment_webhook_inbox i
      WHERE i.status='dead' AND i.lease_token IS NULL AND EXISTS(SELECT 1 FROM payment_payments p WHERE p.tenant_id=? AND p.provider='yookassa'
      AND ((i.event_type LIKE 'payment.%' AND p.provider_payment_id=i.object_id)
        OR (i.event_type='refund.succeeded' AND (p.provider_payment_id=JSON_UNQUOTE(JSON_EXTRACT(i.references_json,'$.providerPaymentId'))
          OR EXISTS(SELECT 1 FROM payment_refunds r WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id AND r.provider_refund_id=i.object_id))))) ORDER BY i.id LIMIT 50`,[tenantId]);
    const [refundAttention]=await db.query(`SELECT CAST(r.id AS CHAR) AS id,p.store_id,p.order_id,p.environment,r.status,r.recovery_state AS recoveryState,
      r.recovery_error_code AS errorCode,r.receipt_registration AS receiptRegistration,r.origin FROM payment_refunds r
      JOIN payment_payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id WHERE r.tenant_id=?
      AND (r.recovery_state='manual_review' OR r.receipt_registration='canceled' OR r.origin='provider_external') ORDER BY r.id LIMIT 100`,[tenantId]);
    const alerts=[];
    if(workers.inbox.lastErrorCode || workers.outbox.lastErrorCode || workers.reconciliation.lastErrorCode)alerts.push("QUEUE_WORKER_UNAVAILABLE");
    if(stuck.length)alerts.push('PAYMENT_STUCK');
    if(Object.values(workers).some(worker=>worker.running && worker.lastSuccessfulTick && Date.now()-Date.parse(worker.lastSuccessfulTick)>Math.max(300000,config.reconcilePollMs*3)))alerts.push('WORKER_HEARTBEAT_STALE');
    if(outbox.some(row=>row.status==='dead'))alerts.push('OUTBOX_DEAD');
    if(inbox.some(row=>row.status==='dead'))alerts.push('INBOX_DEAD');
    if(outbox.some(row=>Number(row.oldestAgeSeconds)>300))alerts.push('ORDER_SYNC_DELAY');
    if(attention.length)alerts.push('PAYMENT_MANUAL_REVIEW');
    if(duplicates.length)alerts.push('DUPLICATE_PAYMENT');
    if(mismatches.length)alerts.push('REFUND_AGGREGATE_MISMATCH');
    if(operations.some(row=>row.status==='uncertain'))alerts.push('PROVIDER_OPERATION_UNCERTAIN');
    if(refundAttention.some(row=>row.origin==='provider_external'))alerts.push('EXTERNAL_REFUND');
    if(refundAttention.some(row=>row.recoveryState==='manual_review'))alerts.push('REFUND_MANUAL_REVIEW');
    if(refundAttention.some(row=>row.receiptRegistration==='canceled'))alerts.push('REFUND_RECEIPT_FAILED');
    const blockers=[];
    if(!config.production || !config.liveReleaseApproved || config.checkoutEnvironment!=='live')blockers.push('LIVE_ACCEPTANCE_PENDING');
    if(!config.checkoutEnabled || !config.refundsEnabled)blockers.push('NEW_FINANCIAL_OPERATIONS_DISABLED');
    if(!config.webhookPublicUrl)blockers.push('PUBLIC_WEBHOOK_NOT_CONFIGURED');
    if(Object.values(workers).some(worker=>!worker.running || !worker.lastSuccessfulTick))blockers.push('WORKERS_NOT_READY');
    if(alerts.length)blockers.push('OPERATIONAL_ALERTS_PRESENT');
    return {asOf:new Date().toISOString(),windowHours:24,readiness:blockers.length?'BLOCKED':'READY',
      blockers,
      flags:{newPayments:config.checkoutEnabled,newRefunds:config.refundsEnabled,refundRecovery:config.refundRecoveryEnabled,webhook:config.webhooksEnabled,outbox:config.outboxEnabled,reconciliation:config.reconciliationEnabled},
      workers,payments,operations,providerResults,stuck,refunds,inbox,outbox,attention,refundAttention,incidents:[...incidents,...inboxIncidents],duplicates,mismatches,connections,alerts};
  }
  return {status,invalidate(input){cache.delete(d.identifier(input.tenantId));}};
}
module.exports={createOperationalStatus};
