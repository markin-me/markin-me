"use strict";

const { createHash, randomUUID } = require("node:crypto");
const d = require("./payment-domain");
function parse(value) { return typeof value === "string" ? JSON.parse(value) : value; }
function createProviderOperations(db, config, core, connections, registry) {
  async function context(input, payment, historical) {
    const result=await connections.providerContext({...input,connectionId:payment.provider_connection_id},historical);
    if (result.provider !== payment.provider || result.environment !== payment.environment) d.fail("PAYMENT_PROVIDER_IDENTITY_MISMATCH");
    return {...result,paymentId:String(payment.id),providerPaymentId:payment.provider_payment_id};
  }
  function testOnly(connection) {
    if (!config.providerTestEnabled || connection.environment !== "test") d.fail("PAYMENT_TEST_OPERATION_NOT_ALLOWED");
  }
  function validateResult(payment,result) {
    if (result.amount !== payment.amount || result.currency !== payment.currency
      || (payment.provider_payment_id && payment.provider_payment_id !== result.providerPaymentId))
      d.fail("PAYMENT_PROVIDER_INVALID_RESPONSE");
  }
  async function apply(input,payment,result) {
    validateResult(payment,result);
    return core.transitionPayment({...input,status:result.status,providerPaymentId:result.providerPaymentId,
      ...(result.status === "paid" ? {capturedAmount:result.capturedAmount} : {}),
      ...(result.confirmation ? {confirmation:result.confirmation,...(result.confirmation.type==='redirect'?{confirmationUrl:result.confirmation.url}:{})} : {}),
      expectedVersion:payment.version,source:input.source || "provider",rawMetadata:result.rawMetadata,
      metadata:{...result.rawMetadata,...input.webhookMetadata,...(input.recoveryOperationId?{recovery_operation_id:String(input.recoveryOperationId)}:{})}});
  }
  async function reserve(input,payment,operation,payload) {
    const key=d.text(input.idempotencyKey), hash=createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("SELECT id FROM payment_payments WHERE tenant_id=? AND store_id=? AND id=? FOR UPDATE",[input.tenantId,input.storeId,payment.id]);
      const [rows]=await conn.query("SELECT *,lease_until>UTC_TIMESTAMP(6) AS in_flight,created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 23 HOUR) AS expired FROM payment_provider_operations WHERE tenant_id=? AND operation=? AND idempotency_key=? FOR UPDATE",[input.tenantId,operation,key]);
      if (rows.length) {
        const row=rows[0];
        if (row.payload_hash!==hash || String(row.payment_id)!==String(payment.id) || String(row.store_id)!==String(input.storeId)) d.fail("PAYMENT_IDEMPOTENCY_CONFLICT");
        if (["succeeded","failed"].includes(row.status)) { await conn.commit(); return row; }
        if (row.in_flight) d.fail("PAYMENT_OPERATION_IN_PROGRESS");
        if (row.expired) d.fail("PAYMENT_PROVIDER_RECOVERY_REQUIRED");
        await conn.query("UPDATE payment_provider_operations SET status='reserved',lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND),updated_at=UTC_TIMESTAMP(6) WHERE id=?",[row.id]);
        await conn.commit(); return {...row,status:"reserved",replaying:true};
      }
      const [inFlight]=await conn.query("SELECT id FROM payment_provider_operations WHERE tenant_id=? AND payment_id=? AND status IN ('reserved','uncertain') FOR UPDATE",[input.tenantId,payment.id]);
      if (inFlight.length) d.fail("PAYMENT_PROVIDER_RECOVERY_REQUIRED");
      if (operation === "create") {
        const [creates]=await conn.query("SELECT id FROM payment_provider_operations WHERE tenant_id=? AND payment_id=? AND operation='create' LIMIT 1 FOR UPDATE",[input.tenantId,payment.id]);
        if (creates.length || payment.provider_payment_id || payment.status !== "created") d.fail("PAYMENT_INVALID_STATE");
      }
      if (["capture","cancel"].includes(operation) && !["pending","waiting_for_confirmation"].includes(payment.status)) d.fail("PAYMENT_INVALID_STATE");
      const providerKey=randomUUID();
      const [insert]=await conn.query(`INSERT INTO payment_provider_operations
        (tenant_id,store_id,payment_id,provider_connection_id,operation,idempotency_key,provider_key,payload_hash,payload,request_snapshot,status,lease_until,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'reserved',DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,
        [input.tenantId,input.storeId,payment.id,payment.provider_connection_id,operation,key,providerKey,hash,JSON.stringify(payload),JSON.stringify(payload)]);
      await conn.commit(); return {id:insert.insertId,provider_key:providerKey,status:"reserved"};
    }catch(error){try{await conn.rollback();}catch{conn.destroy();}throw error;}finally{conn.release();}
  }
  async function execute(input,operation,options={}) {
    let payment=await core.getPayment(input);
    const ctx=await context(input,payment,operation !== "create");
    if (options.checkout) {
      if (!config.checkoutEnabled || ctx.environment !== config.checkoutEnvironment) d.fail("PAYMENT_CONNECTION_NOT_OPERATIONAL");
      if (ctx.environment === "live" && !config.liveReleaseApproved) d.fail("PAYMENT_LIVE_RELEASE_REQUIRED");
      if(ctx.environment==='live' && !options.receipt)d.fail('PAYMENT_RECEIPT_CONFIGURATION_REQUIRED');
    } else if(operation==='refund' && (options.orderReturnId || options.recovery)) {
      if(!config.refundsEnabled && !options.recovery)d.fail("PAYMENT_REFUNDS_DISABLED");
    } else testOnly(ctx);
    const payload={paymentId:String(payment.id),operation,amount:payment.amount,currency:payment.currency,
      ...(operation === "create" ? {returnUrl:d.returnUrl(options.checkout ? options.returnUrl : config.providerTestReturnUrl,Boolean(options.checkout && config.checkoutAllowLocalReturn && ctx.environment==='test')),capture:options.capture,
        ...(options.confirmationType!==undefined ? {confirmationType:options.confirmationType} : {}),
        ...(options.checkout ? {description:options.description,receipt:options.receipt ?? null} : {})} : {}),
      ...(operation === "refund" ? {amount:d.amount(options.amount),currency:d.currency(options.currency),reason:options.reason ?? null,orderReturnId:options.orderReturnId ?? null,actorUserId:options.actorUserId ?? null,receipt:options.receipt ?? null} : {})};
    if (operation === "create") {
      if (typeof options.capture !== "boolean" || !payload.returnUrl) d.fail("PAYMENT_INPUT_INVALID");
      if (!ctx.capabilities?.supportedMethods?.includes(payment.method)) d.fail("PAYMENT_METHOD_NOT_SUPPORTED");
      if (ctx.capabilities.fiscalizationEnabled && !payload.receipt) d.fail("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED");
    }
    if(operation==='refund' && ctx.capabilities?.fiscalizationEnabled && d.minor(payload.amount)<d.minor(payment.amount) && !payload.receipt)d.fail('PAYMENT_RECEIPT_CONFIGURATION_REQUIRED');
    const reservation=await reserve(input,payment,operation,payload);
    if (reservation.status === "succeeded") {
      if (operation !== "refund") return core.getPayment(input);
      const refund = (await core.getRefunds(input)).find(row=>String(row.id)===String(reservation.refund_id));
      if (!refund) d.fail("PAYMENT_PROVIDER_RECOVERY_REQUIRED");
      return refund;
    }
    if (reservation.status === "failed") d.fail(reservation.error_code);
    let refund, accepted=false;

    try {
      if(operation==="refund")refund=await core.createRefund({...input,...options,providerOperationId:reservation.id});
      const adapter=registry.get(payment.provider);
      const providerInput={...ctx,...payload,orderId:String(payment.order_id),storeId:String(payment.store_id),method:payment.method,channel:payment.channel,idempotencyKey:reservation.provider_key,operation};
      let result;
      if (operation === "refund") {
        if (!ctx.capabilities?.supportsRefund || !ctx.capabilities?.supportsPartialRefund) d.fail("PAYMENT_METHOD_NOT_SUPPORTED");
        const current=await adapter.getPayment(ctx); validateResult(payment,current);
        if (!reservation.replaying && (current.status !== "paid" || !current.refundable)) d.fail("PAYMENT_INVALID_STATE");
        result=await adapter.refundPayment({...providerInput,refundId:refund.id});
        accepted=true;
        if (result.amount !== refund.amount || result.currency !== refund.currency) d.fail("PAYMENT_PROVIDER_INVALID_RESPONSE");
        result=await core.transitionRefund({...input,refundId:refund.id,status:result.status,
          providerRefundId:result.providerRefundId,receiptRegistration:result.receiptRegistration,providerOperationId:reservation.id,source:"provider",metadata:result.rawMetadata});
      } else {
        if (operation !== "create") {
          if (!ctx.capabilities?.[operation === "capture" ? "supportsCapture" : "supportsCancel"]) d.fail("PAYMENT_METHOD_NOT_SUPPORTED");
          const current=await adapter.getPayment(ctx); validateResult(payment,current);
          if ((operation === "capture" && current.status === "paid") || (operation === "cancel" && current.status === "cancelled")) {
            payment=await apply({...input,providerOperationId:reservation.id},payment,current);
            return payment;
          }
          if (current.rawMetadata.provider_status !== "waiting_for_capture") d.fail("PAYMENT_INVALID_STATE");
        }
        result=await adapter[{create:"createPayment",capture:"capturePayment",cancel:"cancelPayment"}[operation]](providerInput);
        accepted=true;
        payment=await apply({...input,providerOperationId:reservation.id},payment,result); result=payment;
      }
      return result;
    }catch(error){
      // A provider object might exist even when local persistence failed. Never mark the payment failed.
      const uncertain=reservation.replaying || accepted || error.uncertain || !(error instanceof d.PaymentError) || error.code === "PAYMENT_PROVIDER_INVALID_RESPONSE";
      error.uncertain=Boolean(uncertain);
      const code=error instanceof d.PaymentError ? error.code : "PAYMENT_PROVIDER_RECOVERY_REQUIRED";
      await db.query("UPDATE payment_provider_operations SET status=?,error_code=?,lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND id=? AND status IN ('reserved','uncertain')",[uncertain ? "uncertain" : "failed",code,input.tenantId,reservation.id]);
      if(refund && !uncertain)await core.transitionRefund({...input,refundId:refund.id,status:"failed",source:"system",metadata:{error_code:code}});
      throw error;
    }
  }
  async function get(input) {
    const token=randomUUID();
    const [claim]=await db.query(`UPDATE payment_payments SET refresh_lease_token=?,refresh_lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 60 SECOND)
      WHERE tenant_id=? AND store_id=? AND id=? AND (refresh_lease_until IS NULL OR refresh_lease_until<UTC_TIMESTAMP(6))
      AND (?=1 OR refresh_available_at IS NULL OR refresh_available_at<=UTC_TIMESTAMP(6))`,
    [token,d.identifier(input.tenantId),d.identifier(input.storeId),d.identifier(input.paymentId),input.webhookMetadata?1:0]);
    if(!claim.affectedRows)d.fail("PAYMENT_OPERATION_IN_PROGRESS");
    try{return await getClaimed({...input,refreshLeaseToken:token});}
    finally{await db.query(`UPDATE payment_payments SET refresh_lease_token=NULL,refresh_lease_until=NULL,
      refresh_available_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND) WHERE tenant_id=? AND store_id=? AND id=? AND refresh_lease_token=?`,
      [config.refreshCooldownSeconds,input.tenantId,input.storeId,input.paymentId,token]);}
  }
  async function getClaimed(input) {
    const payment=await core.getPayment(input), ctx=await context(input,payment,true);
    if (!payment.provider_payment_id && !input.webhookProviderId) return recoverCreate(input,payment,ctx);
    if(input.webhookProviderId)ctx.providerPaymentId=input.webhookProviderId;
    const result=await registry.get(payment.provider).getPayment(ctx);
    if(result.providerPaymentId!==ctx.providerPaymentId)d.fail("PAYMENT_PROVIDER_IDENTITY_MISMATCH");
    if(input.webhookProviderId){
      const refs=result.references;
      if(refs?.internalPaymentId!==String(payment.id) || refs.tenantReference!==String(payment.tenant_id)
        || refs.storeReference!==String(payment.store_id) || refs.orderReference!==String(payment.order_id))d.fail("PAYMENT_PROVIDER_IDENTITY_MISMATCH");
    }
    // Refund aggregate state remains owned by Refund Core.
    if (["partially_refunded","refunded"].includes(payment.status)) { validateResult(payment,result); return payment; }
    const updated=await apply(input,payment,result);
    const completed=["create", ...(result.status === "paid" ? ["capture"] : []), ...(result.status === "cancelled" ? ["cancel"] : [])];
    for (const operation of completed) await db.query(`UPDATE payment_provider_operations SET status='succeeded',result=?,error_code=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(6)
      WHERE tenant_id=? AND store_id=? AND payment_id=? AND operation=? AND status IN ('reserved','uncertain')
      AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(6))`,[JSON.stringify(updated),input.tenantId,input.storeId,payment.id,operation]);
    return updated;
  }
  async function recoverCreate(input,payment,ctx) {
    const [rows]=await db.query(`SELECT *,created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 23 HOUR) AS expired
      FROM payment_provider_operations WHERE tenant_id=? AND store_id=? AND payment_id=? AND operation='create' LIMIT 1`,
      [input.tenantId,input.storeId,payment.id]);
    const row=rows[0];
    if(!row || !['reserved','uncertain'].includes(row.status))d.fail('PAYMENT_PROVIDER_RECOVERY_REQUIRED');
    if(row.expired)d.fail('PAYMENT_PROVIDER_RECOVERY_EXPIRED');
    // MySQL JSON storage can reorder keys. Replay the exact pre-request snapshot, never reserialize that JSON column.
    if(typeof row.request_snapshot!=='string')d.fail('PAYMENT_PROVIDER_RECOVERY_REQUIRED');
    const payload=JSON.parse(row.request_snapshot);
    if(createHash('sha256').update(JSON.stringify(payload)).digest('hex')!==row.payload_hash
      || payload.paymentId!==String(payment.id) || payload.amount!==payment.amount || payload.currency!==payment.currency
      || String(row.provider_connection_id)!==String(payment.provider_connection_id))d.fail('PAYMENT_IDEMPOTENCY_CONFLICT');
    const [claim]=await db.query(`UPDATE payment_provider_operations SET lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 60 SECOND),
      recovery_attempt_count=recovery_attempt_count+1,updated_at=UTC_TIMESTAMP(6)
      WHERE id=? AND tenant_id=? AND status IN ('reserved','uncertain') AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(6))
      AND created_at>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 23 HOUR)`,[row.id,input.tenantId]);
    if(!claim.affectedRows)d.fail('PAYMENT_OPERATION_IN_PROGRESS');
    try {
      const result=await registry.get(payment.provider).createPayment({...ctx,...payload,operation:'create',
        orderId:String(payment.order_id),storeId:String(payment.store_id),method:payment.method,channel:payment.channel,idempotencyKey:row.provider_key});
      const refs=result.references;
      if(refs?.internalPaymentId!==String(payment.id) || refs.tenantReference!==String(payment.tenant_id)
        || refs.storeReference!==String(payment.store_id) || refs.orderReference!==String(payment.order_id))d.fail('PAYMENT_PROVIDER_IDENTITY_MISMATCH');
      const updated=await apply({...input,recoveryOperationId:row.id,providerOperationId:row.id},payment,result);
      return updated;
    } catch(error) {
      await db.query(`UPDATE payment_provider_operations SET status='uncertain',error_code=?,lease_until=NULL,updated_at=UTC_TIMESTAMP(6)
        WHERE id=? AND tenant_id=? AND status IN ('reserved','uncertain')`,[error instanceof d.PaymentError?error.code:'PAYMENT_PROVIDER_RECOVERY_REQUIRED',row.id,input.tenantId]);
      throw error;
    }
  }
  async function createTest(input) {
    const ctx=await connections.providerContext({...input,connectionId:input.connectionId}); testOnly(ctx);
    if (input.currency !== "RUB" || d.minor(input.amount)>10000n) d.fail("PAYMENT_AMOUNT_INVALID");
    const payment=await core.createPayment({...input,channel:"online"});
    return execute({...input,paymentId:payment.id},"create",{capture:input.capture});
  }
  async function replayRefund(input) {
    const [rows]=await db.query("SELECT *,created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 23 HOUR) AS expired FROM payment_provider_operations WHERE tenant_id=? AND store_id=? AND payment_id=? AND refund_id=? AND operation='refund' LIMIT 1",[input.tenantId,input.storeId,input.paymentId,input.refundId]);
    const row=rows[0];if(!row || row.expired || !row.request_snapshot)d.fail("PAYMENT_PROVIDER_RECOVERY_EXPIRED");
    const payload=JSON.parse(row.request_snapshot);
    if(createHash("sha256").update(JSON.stringify(payload)).digest("hex")!==row.payload_hash)d.fail("PAYMENT_IDEMPOTENCY_CONFLICT");
    return execute({...input,idempotencyKey:row.idempotency_key},"refund",{...payload,recovery:true});
  }
  async function refreshRefund(input) {
    const payment=await core.getPayment(input),ctx=await context(input,payment,true);
    const refunds=await core.getRefunds(input),refund=refunds.find(row=>String(row.id)===d.identifier(input.refundId));
    if (!refund?.provider_refund_id) d.fail("PAYMENT_NOT_FOUND");
    validateResult(payment,await registry.get(payment.provider).getPayment(ctx));
    const result=await registry.get(payment.provider).getRefund({...ctx,providerRefundId:refund.provider_refund_id,operation:"get"});
    if (result.amount!==refund.amount || result.currency!==refund.currency || result.providerRefundId!==refund.provider_refund_id) d.fail("PAYMENT_PROVIDER_INVALID_RESPONSE");
    const updated=await core.transitionRefund({...input,status:result.status,providerRefundId:result.providerRefundId,receiptRegistration:result.receiptRegistration,source:input.source || "provider",metadata:{...result.rawMetadata,...input.webhookMetadata}});
    await db.query(`UPDATE payment_provider_operations SET status='succeeded',result=?,error_code=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(6)
      WHERE tenant_id=? AND store_id=? AND payment_id=? AND refund_id=? AND operation='refund' AND status IN ('reserved','uncertain')
      AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(6))`,[JSON.stringify(updated),input.tenantId,input.storeId,payment.id,refund.id]);
    return updated;
  }
  async function importRefund(input) {
    const payment=await core.getPayment(input),ctx=await context(input,payment,true),adapter=registry.get(payment.provider);
    if(!payment.provider_payment_id)d.fail('PAYMENT_PROVIDER_IDENTITY_MISMATCH');
    validateResult(payment,await adapter.getPayment(ctx));
    const result=await adapter.getRefund({...ctx,providerRefundId:input.providerRefundId,operation:'get'});
    if(result.providerRefundId!==input.providerRefundId)d.fail('PAYMENT_PROVIDER_IDENTITY_MISMATCH');
    const known=(await core.getRefunds(input)).find(row=>row.provider_refund_id===result.providerRefundId || (result.internalRefundId && String(row.id)===result.internalRefundId));
    if(known && (known.amount!==result.amount || known.currency!==result.currency))d.fail('PAYMENT_PROVIDER_IDENTITY_MISMATCH');
    const refund=known || await core.createRefund({...input,amount:result.amount,currency:result.currency,reason:null,
      idempotencyKey:createHash('sha256').update(`external:${payment.provider_connection_id}:${result.providerRefundId}`).digest('hex'),externalRefund:true});
    return core.transitionRefund({...input,refundId:String(refund.id),status:result.status,providerRefundId:result.providerRefundId,
      receiptRegistration:result.receiptRegistration,source:'provider',metadata:{...result.rawMetadata,...input.webhookMetadata,external_refund:!known}});
  }
  return {execute,get,createTest,refreshRefund,replayRefund,importRefund};
}
module.exports={createProviderOperations};
