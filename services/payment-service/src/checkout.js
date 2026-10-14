"use strict";

const d = require("./payment-domain");

// Checkout orchestration stays inside Payment Service; Orders supplies its committed payable snapshot.
function createCheckout(db, config, core, connections, operations,reconciliation) {
  async function route(input) {
    if (!config.checkoutEnabled || !["test","live"].includes(config.checkoutEnvironment)) d.fail("PAYMENT_CONNECTION_NOT_OPERATIONAL");
    // Live release requires a separately confirmed fiscal configuration and production acceptance.
    if (config.checkoutEnvironment === "live" && !config.liveReleaseApproved) d.fail("PAYMENT_LIVE_RELEASE_REQUIRED");
    const [rows] = await db.query(`SELECT c.id FROM payment_provider_connections c
      WHERE c.tenant_id=? AND c.environment=? AND c.enabled=1 AND c.archived_at IS NULL
      AND c.verification_status='verified' AND c.verified_revision=c.credentials_version
      AND (c.scope_type='all' OR EXISTS(SELECT 1 FROM payment_connection_stores s
        WHERE s.tenant_id=c.tenant_id AND s.connection_id=c.id AND s.store_id=?))`,
    [d.identifier(input.tenantId),config.checkoutEnvironment,d.identifier(input.storeId)]);
    if (rows.length !== 1) d.fail("PAYMENT_CONNECTION_NOT_OPERATIONAL");
    const context = await connections.providerContext({...input,connectionId:rows[0].id});
    if (context.provider !== "yookassa" || !context.capabilities?.supportedMethods?.length)
      d.fail("PAYMENT_PROVIDER_NOT_CONFIGURED");
    return context;
  }
  async function availability(input) {
    try { await route(input); return {available:true}; }
    catch(error) { if (error instanceof d.PaymentError) return {available:false,code:error.code}; throw error; }
  }
  async function payments(input,executor=db) {
    const [rows] = await executor.query("SELECT * FROM payment_payments WHERE tenant_id=? AND store_id=? AND order_id=? ORDER BY id DESC",
      [d.identifier(input.tenantId),d.identifier(input.storeId),d.identifier(input.orderId)]);
    return rows;
  }
  async function snapshot(input) {
    const conn=await db.getConnection();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.beginTransaction();const result=await snapshotRead(input,conn);await conn.commit();return result;
    }catch(error){try{await conn.rollback();}catch{conn.destroy();}throw error;}finally{conn.release();}
  }
  async function snapshotRead(input,executor) {
    const rows=await payments(input,executor);
    const successful=rows.filter(row=>d.minor(row.captured_amount,true)>0n);
    const selected=successful[0] || rows[0];
    const connectionsById=new Map();
    const operationRows=rows.length?(await executor.query(`SELECT id,payment_id,operation,status,recovery_attempt_count,error_code
      FROM payment_provider_operations WHERE tenant_id=? AND store_id=? AND payment_id IN (?) ORDER BY id`,
      [d.identifier(input.tenantId),d.identifier(input.storeId),rows.map(row=>row.id)]))[0]:[];
    if(rows.length) {
      const [names]=await executor.query('SELECT id,name FROM payment_provider_connections WHERE tenant_id=? AND id IN (?)',
        [d.identifier(input.tenantId),[...new Set(rows.map(row=>row.provider_connection_id))]]);
      names.forEach(row=>connectionsById.set(row.id,row.name));
    }
    const refundRows=rows.length?(await executor.query(`SELECT r.* FROM payment_refunds r WHERE r.tenant_id=? AND r.payment_id IN (?) ORDER BY r.id`,[input.tenantId,rows.map(row=>row.id)]))[0]:[];
    const active=rows.some(row=>['created','pending','waiting_for_confirmation'].includes(row.status));
    const attentionRequired=rows.some(row=>row.reconciliation_state==='manual_review' && ['created','pending','waiting_for_confirmation'].includes(row.status));
    const anomalies=successful.length>1 ? ['PAYMENT_DUPLICATE_SUCCESS'] : [];
    if(successful.some(row=>row.currency!=='RUB'))anomalies.push('PAYMENT_CURRENCY_MISMATCH');
    if(refundRows.some(row=>row.origin==='provider_external'))anomalies.push('PAYMENT_EXTERNAL_REFUND');
    if(anomalies.length)console.error(JSON.stringify({operation:'order.payment.summary',tenantId:input.tenantId,orderId:input.orderId,code:anomalies[0]}));
    return {state:selected?.status || 'unpaid',paidAmount:Number(successful.reduce((sum,row)=>sum+d.minor(row.captured_amount,true),0n)),
      refundedAmount:Number(successful.reduce((sum,row)=>sum+d.minor(row.refunded_amount,true),0n)),
      currentPaymentId:selected?String(selected.id):null,successfulPaymentId:successful[0]?String(successful[0].id):null,
      paidAt:selected?.paid_at || null,updatedAt:selected?.updated_at || null,activePayment:active,anomalies,
      attentionRequired,paymentVersions:Object.fromEntries(rows.map(row=>[String(row.id),Number(row.version)])),
      canContinue:Boolean(!attentionRequired && !successful.length && selected?.confirmation_url && ['waiting_for_confirmation','pending'].includes(selected.status)),
      refunds:refundRows.map(row=>({id:String(row.id),paymentId:String(row.payment_id),orderReturnId:row.order_return_id==null?null:String(row.order_return_id),businessAttempt:/^return:[1-9][0-9]*:[1-9][0-9]*$/.test(row.idempotency_key)?Number(row.idempotency_key.split(':')[2]):null,origin:row.origin,amount:row.amount,currency:row.currency,status:row.status,recoveryState:row.recovery_state,errorCode:row.recovery_error_code,receiptRegistration:row.receipt_registration})),
      attempts:rows.map(row=>({id:String(row.id),state:row.status,amount:row.amount,currency:row.currency,
        provider:row.provider,connectionName:connectionsById.get(row.provider_connection_id) || null,
        providerPaymentId:row.provider_payment_id,createdAt:row.created_at,paidAt:row.paid_at,
        operations:operationRows.filter(operation=>String(operation.payment_id)===String(row.id)).map(operation=>({
          id:String(operation.id),operation:operation.operation,status:operation.status,attempts:Number(operation.recovery_attempt_count),errorCode:operation.error_code})),
        reconciliation:{state:row.reconciliation_state,lastCheckedAt:row.last_reconciled_at,nextCheckAt:row.next_reconcile_at,
          attempts:Number(row.reconcile_attempt_count),errorCode:row.last_reconcile_error_code}}))};
  }
  async function state(input, refresh = false) {
    const rows = await payments(input);
    const paid = rows.find(row => d.minor(row.captured_amount,true)>0n);
    let payment = paid || rows[0];
    if (payment && refresh && !["paid","refunded","partially_refunded","cancelled","failed"].includes(payment.status))
      payment = await reconciliation.now({...input,paymentId:payment.id});
    return payment || null;
  }
  async function pay(input) {
    const amount = d.amount(input.amount,true);
    if (input.currency !== "RUB") d.fail("PAYMENT_INPUT_INVALID");
    if (amount === "0.00") return null;
    const current = await state(input,true);
    if(current?.reconciliation_state==='manual_review' && !['paid','refunded','partially_refunded','cancelled','failed'].includes(current.status))d.fail('PAYMENT_PROVIDER_RECOVERY_REQUIRED');
    if (current && d.minor(current.captured_amount,true)>0n) {
      if (current.amount !== amount || current.currency !== input.currency) d.fail("PAYMENT_AMOUNT_INVALID");
      return current;
    }
    if (current && ["pending","waiting_for_confirmation"].includes(current.status)) {
      if (current.amount !== amount || current.currency !== input.currency) d.fail("PAYMENT_AMOUNT_INVALID");
      if (current.confirmation_url) return current;
      d.fail("PAYMENT_OPERATION_IN_PROGRESS");
    }
    const context = await route(input);
    if(context.capabilities.supportedMethods.includes('card') && (d.minor(amount)<100n || d.minor(amount)>35000000n))d.fail('PAYMENT_AMOUNT_INVALID');
    const payment = await core.createPayment({...input,amount,connectionId:context.connectionId,
      method:context.capabilities.supportedMethods.includes("card") ? "card" : context.capabilities.supportedMethods[0],
      channel:"online",reuseOrderAttempt:true});
    if (payment.provider_payment_id) return state(input,true);
    const operationInput = {...input,paymentId:payment.id,idempotencyKey:`checkout:${payment.id}`};
    // Persisted operation parameters must survive changes to the site/receipt settings during a retry.
    const [existing] = await db.query("SELECT payload,request_snapshot FROM payment_provider_operations WHERE tenant_id=? AND payment_id=? AND operation='create' LIMIT 1",
      [d.identifier(input.tenantId),payment.id]);
    const previous = existing.length ? (existing[0].request_snapshot?JSON.parse(existing[0].request_snapshot):
      typeof existing[0].payload === "string" ? JSON.parse(existing[0].payload) : existing[0].payload) : null;
    try {
      return await operations.execute(operationInput,"create",{checkout:true,capture:true,
        returnUrl:previous?.returnUrl || d.returnUrl(input.returnUrl,config.checkoutAllowLocalReturn && context.environment==='test'),
        description:previous?.description || `Order ${d.identifier(input.orderId)}`,
        receipt:previous ? previous.receipt : input.receipt});
    } catch(error) {
      if (!error.uncertain && ["PAYMENT_PROVIDER_AUTH_FAILED","PAYMENT_PROVIDER_ACCESS_DENIED","PAYMENT_PROVIDER_REQUEST_INVALID","PAYMENT_RECEIPT_CONFIGURATION_REQUIRED"].includes(error.code))
        await core.transitionPayment({...operationInput,status:"failed",source:"system",metadata:{operation:"create"}});
      throw error;
    }
  }
  return {availability,pay,state,snapshot};
}
module.exports = {createCheckout};
