"use strict";

const d = require("./payment-domain");
const {createRefunds}=require("./refunds");
const {createOperationalStatus}=require("./operational-status");
const { createPaymentCore } = require("./payment-core");
const { createProviderRegistry } = require("./payment-provider");
const { createConnections } = require("./connections");
const { createYooKassaProvider } = require("./yookassa-provider");
const { createProviderOperations } = require("./provider-operations");
const { createCheckout } = require("./checkout");
const { createWebhookDelivery } = require("./webhooks");
const {createReconciliation}=require('./reconciliation');

function timestamp(value) { return value == null ? null : String(value).replace(" ", "T") + "Z"; }
function paymentDto(row) {
  return { id: String(row.id), tenantId: String(row.tenant_id), storeId: String(row.store_id),
    orderId: String(row.order_id), providerConnectionId: String(row.provider_connection_id),
    provider: row.provider, environment: row.environment, channel: row.channel, method: row.method,
    amount: row.amount, currency: row.currency, status: row.status,
    providerPaymentId:row.provider_payment_id,attentionRequired:row.reconciliation_state==='manual_review',
    capturedAmount: row.captured_amount, refundedAmount: row.refunded_amount,
    confirmation: d.paymentConfirmation(row),
    createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), paidAt: timestamp(row.paid_at) };
}
function refundDto(row) {
  return { id: String(row.id), paymentId: String(row.payment_id), amount: row.amount,
    origin:row.origin,
    recoveryState:row.recovery_state,errorCode:row.recovery_error_code,receiptRegistration:row.receipt_registration,providerRefundId:row.provider_refund_id,orderReturnId:row.order_return_id==null?null:String(row.order_return_id),
    currency: row.currency, status: row.status, reason: row.reason,
    createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), completedAt: timestamp(row.completed_at) };
}
function createApplication(db, config) {
  const core = createPaymentCore(db);
  const registry = createProviderRegistry();
  const connections = createConnections(db,config);
  registry.register("yookassa",createYooKassaProvider(config,connections.resolveCredentials));
  const operations=createProviderOperations(db,config,core,connections,registry);
  const refunds=createRefunds(db,config,core,operations);
  const reconciliation=createReconciliation(db,config,core,operations,refunds);
  const checkout=createCheckout(db,config,core,connections,operations,reconciliation);
  const delivery=createWebhookDelivery(db,config,operations);
  const operational=createOperationalStatus(db,config,delivery,reconciliation);
  async function supportAudit(input,action) {
    const payment=await core.getPayment(input);
    const [users]=await db.query("SELECT id FROM app_users WHERE tenant_id=? AND id=? AND is_active=1 AND role IN ('owner','admin')",[d.identifier(input.tenantId),d.identifier(input.actorId)]);
    if(!users.length)d.fail('PAYMENT_SERVICE_UNAUTHORIZED');
    await db.query(`INSERT INTO payment_operational_audit (tenant_id,actor_user_id,request_id,action,entity_id,created_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))`,[input.tenantId,input.actorId,input.requestId,action,String(payment.id)]);
  }
  let stopping=false;
  return Object.freeze({
    get stopping(){return stopping;},beginShutdown(){stopping=true;},
    refunds,operational,delivery,reconciliation,
    prepareAbandon:input=>core.prepareAbandon({...input,horizonHours:config.abandonedOrderHours}),
    closeForMethodChange:input=>core.prepareAbandon({...input,changeMethod:true}),
    async createPayment(input) { return paymentDto(await core.createPayment(input)); },
    async getPayment(input) { return paymentDto(await core.getPayment(input)); },
    async orderReturnRefund(input){return refundDto(await refunds.request(input));},
    async getRefunds(input) { return (await core.getRefunds(input)).map(refundDto); },
    async createTestPayment(input) { return paymentDto(await operations.createTest(input)); },
    async refreshPayment(input) {
      if(input.actorId)await supportAudit(input,'payment.refresh');
      try{return paymentDto(await reconciliation.now(input));}finally{operational.invalidate(input);}
    },
    async importRefund(input) {
      await supportAudit(input,'refund.verify_external');
      try{return refundDto(await operations.importRefund({...input,webhookMetadata:{request_id:input.requestId}}));}finally{operational.invalidate(input);}
    },
    async refreshRefund(input) { return refundDto(await operations.refreshRefund(input)); },
    connections,
    checkoutAvailability: input => checkout.availability(input),
    async checkoutPayment(input) { const row=await checkout.pay(input);return row ? paymentDto(row) : {status:"not_required",amount:"0.00",currency:input.currency,confirmation:null}; },
    async checkoutState(input) { const row=await checkout.state(input,input.refresh!==false);return row ? paymentDto(row) : {status:"not_started",confirmation:null}; },
    checkoutSnapshot: input => checkout.snapshot(input),
    async providerOperation(input) {
      const operation = input.operation === "refunds" ? "refund" : input.operation;
      const payment = await core.getPayment(input);
      if (operation === "capture" && (d.amount(input.amount) !== payment.amount || input.currency !== payment.currency)) d.fail("PAYMENT_AMOUNT_INVALID");
      const result=await operations.execute(input,operation,input);
      return operation === "refund" ? refundDto(result) : paymentDto(result);
    },
    async readiness() {
      for (const table of ["payment_payments", "payment_events", "payment_refunds", "payment_provider_connections", "payment_order_guards", "payment_connection_stores", "payment_connection_guards", "payment_connection_audit", "payment_provider_operations"])
        await db.query(`SELECT 1 FROM ${table} LIMIT 0`);
      await db.query("SELECT origin,order_return_id,actor_user_id,recovery_state,next_check_at,check_lease_until,receipt_registration FROM payment_refunds LIMIT 0");
      await db.query('SELECT tenant_id,actor_user_id,request_id FROM payment_operational_audit LIMIT 0');
      await db.query('SELECT closed_at FROM payment_order_guards LIMIT 0');
      await db.query('SELECT payment_abandoned_at FROM order_orders LIMIT 0');
      await db.query("SELECT financial_state,financial_attempt,dispatch_after FROM order_refunds LIMIT 0");
      await db.query("SELECT verified_revision,verification_lease_until FROM payment_provider_connections LIMIT 0");
      await db.query("SELECT version,refresh_lease_until FROM payment_payments LIMIT 0");
      await db.query('SELECT next_reconcile_at,reconcile_lease_until,refresh_available_at FROM payment_payments LIMIT 0');
      await db.query('SELECT reconcile_retry_after,reconcile_lease_until FROM payment_provider_connections LIMIT 0');
      await db.query('SELECT request_snapshot,recovery_attempt_count FROM payment_provider_operations LIMIT 0');
      for(const table of ["payment_webhook_inbox","payment_event_outbox"])await db.query(`SELECT id,status,lease_until FROM ${table} LIMIT 0`);
    },
    providerCount: 1,
    registry,
  });
}
module.exports = { createApplication };
