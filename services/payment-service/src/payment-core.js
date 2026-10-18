"use strict";

const d = require("./payment-domain");
const {randomUUID} = require("node:crypto");
const {isDeepStrictEqual} = require('node:util');

// Passive domain module: no routes, workers, provider calls or Order writes.
function createPaymentCore(db) {
  function scope(input) {
    return [d.identifier(input.tenantId), d.identifier(input.storeId)];
  }
  async function transaction(work) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try { await conn.rollback(); } catch { conn.destroy(); }
      throw error;
    } finally { conn.release(); }
  }
  async function orderLock(conn, input, orderId) {
    const args = [...scope(input), d.identifier(orderId)];
    await conn.query(`INSERT INTO payment_order_guards (tenant_id,store_id,order_id)
      VALUES (?,?,?) ON DUPLICATE KEY UPDATE order_id=VALUES(order_id)`, args);
    await conn.query("SELECT order_id FROM payment_order_guards WHERE tenant_id=? AND store_id=? AND order_id=? FOR UPDATE", args);
  }
  async function paymentLock(conn, input) {
    const args = [...scope(input), d.identifier(input.paymentId)];
    const [lookup] = await conn.query(
      "SELECT order_id FROM payment_payments WHERE tenant_id=? AND store_id=? AND id=?", args);
    if (!lookup.length) d.fail("PAYMENT_NOT_FOUND");
    await orderLock(conn, input, lookup[0].order_id);
    const [rows] = await conn.query(
      "SELECT *,refresh_lease_until>UTC_TIMESTAMP(6) AS refresh_lease_active FROM payment_payments WHERE tenant_id=? AND store_id=? AND id=? FOR UPDATE", args);
    if (!rows.length) d.fail("PAYMENT_NOT_FOUND");
    return { payment: rows[0] };
  }
  async function event(conn, payment, type, previous, next, input) {
    const source = input.source ?? "system";
    if (!["system", "provider", "admin", "reconciliation"].includes(source)) d.fail("PAYMENT_INPUT_INVALID");
    await conn.query(
      `INSERT INTO payment_events
       (tenant_id, payment_id, provider_connection_id, type, previous_status, new_status, source, provider, provider_event_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [payment.tenant_id, payment.id, payment.provider_connection_id, type, previous, next, source, payment.provider,
        input.providerEventId == null ? null : d.text(input.providerEventId, 128), d.metadata(input.metadata)]);
  }
  async function getPayment(input) {
    const [rows] = await db.query(
      "SELECT * FROM payment_payments WHERE tenant_id=? AND store_id=? AND id=?",
      [...scope(input), d.identifier(input.paymentId)]);
    if (!rows.length) d.fail("PAYMENT_NOT_FOUND");
    return rows[0];
  }
  async function createPayment(input) {
    const ids = scope(input);
    const orderId = d.identifier(input.orderId);
    const connectionId = d.identifier(input.connectionId);
    const value = d.amount(input.amount);
    const curr = d.currency(input.currency);
    const channel = d.token(input.channel), method = d.token(input.method);
    const key = d.text(input.idempotencyKey);
    return transaction(async conn => {
      await orderLock(conn, input, orderId);
      const [guards]=await conn.query('SELECT closed_at FROM payment_order_guards WHERE tenant_id=? AND store_id=? AND order_id=?',[...ids,orderId]);
      if(guards[0]?.closed_at)d.fail('PAYMENT_ORDER_CLOSED');
      if(input.reuseOrderAttempt) {
        const [orders]=await conn.query(`SELECT o.total_price,o.is_paid,o.online_payment_required,p.code AS payment_code,s.code AS status_code,s.is_final
          FROM order_orders o LEFT JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.id=o.status_id
          LEFT JOIN order_payments p ON p.tenant_id=o.tenant_id AND p.id=o.payment_id
          WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1 FOR UPDATE`,[...ids,orderId]);
        const order=orders[0];
        if(!order || !Number(order.online_payment_required) || order.payment_code!=='online' || ['canceled','cancelled'].includes(order.status_code))d.fail('PAYMENT_INVALID_STATE');
        if(Number(order.is_paid))d.fail('PAYMENT_ALREADY_PAID');
        if(d.amount(order.total_price)!==value)d.fail('PAYMENT_AMOUNT_INVALID');
      }
      const [existing] = await conn.query(
        "SELECT * FROM payment_payments WHERE tenant_id=? AND idempotency_key=? FOR UPDATE", [ids[0], key]);
      if (existing.length) {
        const row = existing[0];
        if (String(row.store_id) !== ids[1] || String(row.order_id) !== orderId
          || String(row.provider_connection_id) !== connectionId || row.amount !== value
          || row.currency !== curr || row.channel !== channel || row.method !== method)
          d.fail("PAYMENT_IDEMPOTENCY_CONFLICT");
        return row;
      }
      const [paid] = await conn.query(
        "SELECT id FROM payment_payments WHERE tenant_id=? AND store_id=? AND order_id=? AND captured_amount>0 LIMIT 1 FOR UPDATE",
        [...ids, orderId]);
      if (paid.length) d.fail("PAYMENT_ALREADY_PAID");
      if (input.reuseOrderAttempt) {
        const [active] = await conn.query("SELECT * FROM payment_payments WHERE tenant_id=? AND store_id=? AND order_id=? AND status IN ('created','pending','waiting_for_confirmation') ORDER BY id DESC LIMIT 1 FOR UPDATE", [...ids,orderId]);
        if (active.length) {
          if (active[0].amount !== value || active[0].currency !== curr) d.fail("PAYMENT_AMOUNT_INVALID");
          return active[0];
        }
      }
      const [connections] = await conn.query(
        "SELECT * FROM payment_provider_connections WHERE tenant_id=? AND id=? AND enabled=1 AND archived_at IS NULL FOR UPDATE",
        [ids[0], connectionId]);
      if (!connections.length) d.fail("PAYMENT_CONNECTION_INVALID");
      const connection = connections[0];
      if (connection.verification_status !== "verified" || connection.verified_revision !== connection.credentials_version)
        d.fail("PAYMENT_CONNECTION_NOT_OPERATIONAL");
      if (connection.scope_type === "selected") {
        const [assignments] = await conn.query("SELECT store_id FROM payment_connection_stores WHERE tenant_id=? AND connection_id=? AND store_id=?", [ids[0],connectionId,ids[1]]);
        if (!assignments.length) d.fail("PAYMENT_CONNECTION_INVALID");
      }
      const [result] = await conn.query(
        `INSERT INTO payment_payments
         (tenant_id, store_id, order_id, provider_connection_id, provider, environment, channel, method,
          amount, currency, status, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [...ids, orderId, connectionId, connection.provider, connection.environment, channel, method, value, curr, key]);
      const payment = { id: result.insertId, tenant_id: ids[0], provider: connection.provider, provider_connection_id: connectionId };
      await event(conn, payment, "payment.created", null, "created", input);
      const [rows] = await conn.query("SELECT * FROM payment_payments WHERE tenant_id=? AND id=?", [ids[0], payment.id]);
      return rows[0];
    });
  }
  async function transitionPayment(input) {
    return transaction(async conn => {
      const { payment } = await paymentLock(conn, input);
      if(input.refreshLeaseToken && (payment.refresh_lease_token!==input.refreshLeaseToken || !payment.refresh_lease_active))d.fail("PAYMENT_OPERATION_IN_PROGRESS");
      if(input.expectedVersion!==undefined && Number(payment.version)!==Number(input.expectedVersion))d.fail('PAYMENT_OPERATION_IN_PROGRESS');
      // Refund aggregate states are owned exclusively by transitionRefund.
      if (["partially_refunded", "refunded"].includes(input.status)) d.fail("PAYMENT_INVALID_STATE");
      const externalId = input.providerPaymentId == null ? payment.provider_payment_id : d.text(input.providerPaymentId, 128);
      if (payment.provider_payment_id && externalId !== payment.provider_payment_id) d.fail("PAYMENT_INPUT_INVALID");
      const url = input.confirmationUrl === undefined ? payment.confirmation_url : d.confirmationUrl(input.confirmationUrl);
      const captured = input.status === "paid" ? d.amount(input.capturedAmount) : payment.captured_amount;
      if (input.status !== "paid" && input.capturedAmount !== undefined) d.fail("PAYMENT_AMOUNT_INVALID");
      if (input.status === "paid" && (!externalId || captured !== payment.amount)) d.fail("PAYMENT_AMOUNT_INVALID");
      const previousSnapshot=typeof payment.provider_data==='string'?JSON.parse(payment.provider_data):payment.provider_data;
      const snapshotData=input.rawMetadata===undefined ? {...previousSnapshot} : JSON.parse(d.metadata(input.rawMetadata));
      const confirmation=['created','pending','waiting_for_confirmation'].includes(input.status)
        ? input.confirmation===undefined ? previousSnapshot?.confirmation : d.confirmation(input.confirmation) : null;
      if(confirmation)snapshotData.confirmation=confirmation;
      else delete snapshotData.confirmation;
      const snapshot=JSON.stringify(snapshotData);
      const sameStatus = payment.status === input.status;
      const clearAttention=input.source==='reconciliation' && payment.reconciliation_state==='manual_review';
      if (sameStatus && captured !== payment.captured_amount) d.fail("PAYMENT_INVALID_STATE");
      if (!clearAttention && sameStatus && externalId === payment.provider_payment_id && url === payment.confirmation_url
        && isDeepStrictEqual(previousSnapshot,snapshotData)) {
        await completeProviderOperation(conn,payment,input);return payment;
      }
      if (!sameStatus) d.transition(d.PAYMENT_TRANSITIONS, payment.status, input.status);
      if (input.status === "paid") {
        const [others] = await conn.query(
          `SELECT id FROM payment_payments WHERE tenant_id=? AND store_id=? AND order_id=?
           AND id<>? AND captured_amount>0 LIMIT 1 FOR UPDATE`,
          [payment.tenant_id, payment.store_id, payment.order_id, payment.id]);
        if (others.length && !['provider','reconciliation'].includes(input.source)) d.fail("PAYMENT_ALREADY_PAID");
      }
      await conn.query(
        `UPDATE payment_payments SET status=?, provider_payment_id=?, confirmation_url=?, captured_amount=?,provider_data=?,
         paid_at=IF(?='paid',COALESCE(paid_at,UTC_TIMESTAMP(6)),paid_at), cancelled_at=IF(?='cancelled',COALESCE(cancelled_at,UTC_TIMESTAMP(6)),cancelled_at),
         failed_at=IF(?='failed',COALESCE(failed_at,UTC_TIMESTAMP(6)),failed_at), updated_at=UTC_TIMESTAMP(6),version=version+1,
         reconciliation_state=IF(?=1,'done',IF(?=1,'scheduled',reconciliation_state)),
         next_reconcile_at=IF(?=1,NULL,next_reconcile_at),last_reconcile_error_code=IF(?=1,NULL,last_reconcile_error_code)
         WHERE tenant_id=? AND store_id=? AND id=?`,
        [input.status, externalId, url, captured, typeof snapshot === "string" || snapshot == null ? snapshot : JSON.stringify(snapshot), input.status, input.status, input.status,
          ['paid','cancelled','failed'].includes(input.status)?1:0,clearAttention?1:0,
          ['paid','cancelled','failed'].includes(input.status)?1:0,clearAttention?1:0,
          payment.tenant_id, payment.store_id, payment.id]);
      await event(conn, payment, input.recoveryOperationId && !payment.provider_payment_id?'payment.provider_link_recovered':
        clearAttention && sameStatus?'payment.reconciliation_resumed':`payment.${input.status}`, payment.status, input.status, input);
      await conn.query(`INSERT INTO payment_event_outbox
        (event_id,tenant_id,store_id,order_id,payment_id,payment_version,available_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,
      [randomUUID(),payment.tenant_id,payment.store_id,payment.order_id,payment.id,Number(payment.version)+1]);
      const [rows] = await conn.query("SELECT * FROM payment_payments WHERE tenant_id=? AND store_id=? AND id=?",
        [payment.tenant_id, payment.store_id, payment.id]);
      await completeProviderOperation(conn,rows[0],input);
      return rows[0];
    });
  }
  async function createRefund(input) {
    const value = d.amount(input.amount), curr = d.currency(input.currency), key = d.text(input.idempotencyKey);
    const reason = input.reason == null ? null : d.text(input.reason, 255);
    const orderReturnId=input.orderReturnId==null?null:d.identifier(input.orderReturnId);
    const actorUserId=input.actorUserId==null?null:d.identifier(input.actorUserId);
    return transaction(async conn => {
      const { payment } = await paymentLock(conn, input);
      const [existing] = await conn.query(
        "SELECT * FROM payment_refunds WHERE tenant_id=? AND idempotency_key=? FOR UPDATE", [payment.tenant_id, key]);
      if (existing.length) {
        const row = existing[0];
        if (String(row.payment_id) !== String(payment.id) || row.amount !== value || row.currency !== curr || row.reason !== reason
          || String(row.order_return_id ?? "") !== String(orderReturnId ?? "") || String(row.actor_user_id ?? "") !== String(actorUserId ?? ""))
          d.fail("PAYMENT_IDEMPOTENCY_CONFLICT");
        await linkRefundOperation(conn,payment,row.id,input);
        return row;
      }
      if (!["paid", "partially_refunded"].includes(payment.status)) d.fail("PAYMENT_INVALID_STATE");
      if (curr !== payment.currency) d.fail("PAYMENT_AMOUNT_INVALID");
      if(orderReturnId!==null) {
        const [returns]=await conn.query("SELECT id FROM order_refunds WHERE tenant_id=? AND store_id=? AND order_id=? AND id=?",
          [payment.tenant_id,payment.store_id,payment.order_id,orderReturnId]);
        if(!returns.length)d.fail("PAYMENT_NOT_FOUND");
      }
      const [reserved] = await conn.query(
        "SELECT amount FROM payment_refunds WHERE tenant_id=? AND payment_id=? AND status IN ('created','pending','succeeded') FOR UPDATE",
        [payment.tenant_id, payment.id]);
      const total = reserved.reduce((sum, row) => sum + d.minor(row.amount), d.minor(value));
      if (total > d.minor(payment.captured_amount, true)) d.fail("PAYMENT_REFUND_EXCEEDS_AVAILABLE_AMOUNT");
      const remainder=d.minor(payment.captured_amount,true)-total;
      if(payment.provider==='yookassa' && (d.minor(value)<100n || (remainder>0n && remainder<100n)))d.fail('PAYMENT_AMOUNT_INVALID');
      const [result] = await conn.query(
        `INSERT INTO payment_refunds
         (tenant_id, payment_id, provider_connection_id, amount, currency, status, idempotency_key, reason, order_return_id, actor_user_id, origin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [payment.tenant_id, payment.id, payment.provider_connection_id, value, curr, key, reason, orderReturnId, actorUserId,input.externalRefund?'provider_external':orderReturnId?'order_return':'system']);
      await linkRefundOperation(conn,payment,result.insertId,input);
      await event(conn, payment, "refund.created", payment.status, payment.status,
        { ...input, metadata: { ...input.metadata, refund_id: String(result.insertId) } });
      const [rows] = await conn.query("SELECT * FROM payment_refunds WHERE tenant_id=? AND id=?", [payment.tenant_id, result.insertId]);
      return rows[0];
    });
  }
  async function transitionRefund(input) {
    return transaction(async conn => {
      const { payment } = await paymentLock(conn, input);
      const [rows] = await conn.query(
        "SELECT * FROM payment_refunds WHERE tenant_id=? AND payment_id=? AND id=? FOR UPDATE",
        [payment.tenant_id, payment.id, d.identifier(input.refundId)]);
      if (!rows.length) d.fail("PAYMENT_NOT_FOUND");
      const refund = rows[0];
      const externalId = input.providerRefundId == null ? refund.provider_refund_id : d.text(input.providerRefundId, 128);
      if (refund.provider_refund_id && externalId !== refund.provider_refund_id) d.fail("PAYMENT_INPUT_INVALID");
      if (input.status === "succeeded" && !externalId) d.fail("PAYMENT_INPUT_INVALID");
      const receipt=refund.receipt_registration==='succeeded'?'succeeded':input.receiptRegistration ?? refund.receipt_registration;
      if(receipt!=null && !["pending","succeeded","canceled"].includes(receipt))d.fail("PAYMENT_INPUT_INVALID");
      if (refund.status === input.status && receipt===refund.receipt_registration) {
        if (externalId !== refund.provider_refund_id) d.fail("PAYMENT_INVALID_STATE");
        await completeRefundOperation(conn, payment, refund, input);
        return refund;
      }
      if(refund.status!==input.status)d.transition(d.REFUND_TRANSITIONS, refund.status, input.status);
      await conn.query(
        `UPDATE payment_refunds SET status=?, provider_refund_id=?, receipt_registration=?, provider_reason_code=?,recovery_error_code=?,
         recovery_state=IF(?=1,'done','scheduled'),next_check_at=IF(?=1,NULL,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND)),updated_at=UTC_TIMESTAMP(6),
         completed_at=IF(?='succeeded',COALESCE(completed_at,UTC_TIMESTAMP(6)),completed_at), failed_at=IF(?='failed',COALESCE(failed_at,UTC_TIMESTAMP(6)),failed_at)
         WHERE tenant_id=? AND payment_id=? AND id=?`,
        [input.status, externalId,receipt,input.metadata?.provider_reason_code ?? refund.provider_reason_code ?? null,input.metadata?.error_code || (input.status==='cancelled'?'PAYMENT_REFUND_CANCELLED':null),(["failed","cancelled"].includes(input.status) || (input.status==='succeeded' && receipt!=='pending'))?1:0,(["failed","cancelled"].includes(input.status) || (input.status==='succeeded' && receipt!=='pending'))?1:0,input.status, input.status, payment.tenant_id, payment.id, refund.id]);
      const metadata = { ...input.metadata, refund_id: String(refund.id) };
      await event(conn, payment, `refund.${input.status}`, payment.status, payment.status, { ...input, metadata });
      if (input.status === "succeeded" && refund.status!=="succeeded") {
        const total = d.minor(payment.refunded_amount, true) + d.minor(refund.amount);
        if (total > d.minor(payment.captured_amount, true)) d.fail("PAYMENT_REFUND_EXCEEDS_AVAILABLE_AMOUNT");
        const next = total === d.minor(payment.captured_amount, true) ? "refunded" : "partially_refunded";
        d.transition(d.PAYMENT_TRANSITIONS, payment.status, next);
        await conn.query(
          "UPDATE payment_payments SET status=?, refunded_amount=?, updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND store_id=? AND id=?",
          [next, d.decimal(total), payment.tenant_id, payment.store_id, payment.id]);
        await event(conn, payment, `payment.${next}`, payment.status, next, { ...input, metadata });
      }
      const [updated] = await conn.query("SELECT * FROM payment_refunds WHERE tenant_id=? AND payment_id=? AND id=?",
        [payment.tenant_id, payment.id, refund.id]);
      await conn.query("UPDATE payment_payments SET version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND store_id=? AND id=?",
        [payment.tenant_id,payment.store_id,payment.id]);
      await conn.query(`INSERT INTO payment_event_outbox
        (event_id,tenant_id,store_id,order_id,payment_id,payment_version,available_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,
        [randomUUID(),payment.tenant_id,payment.store_id,payment.order_id,payment.id,Number(payment.version)+1]);
      await completeRefundOperation(conn,payment,updated[0],input);
      return updated[0];
    });
  }
  async function getRefunds(input) {
    await getPayment(input);
    const [rows] = await db.query(`SELECT r.* FROM payment_refunds r
      INNER JOIN payment_payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id
      WHERE p.tenant_id=? AND p.store_id=? AND p.id=? ORDER BY r.id`,
      [...scope(input), d.identifier(input.paymentId)]);
    return rows;
  }
  async function reconciliationAttention(input) {
    return transaction(async conn=>{
      const {payment}=await paymentLock(conn,input);
      if(payment.reconcile_lease_token!==input.leaseToken)d.fail('PAYMENT_OPERATION_IN_PROGRESS');
      if(['paid','cancelled','failed','refunded','partially_refunded'].includes(payment.status))return payment;
      if(payment.reconciliation_state==='manual_review' && payment.last_reconcile_error_code===input.code)return payment;
      await conn.query(`UPDATE payment_payments SET reconciliation_state='manual_review',last_reconcile_error_code=?,
        next_reconcile_at=NULL,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND store_id=? AND id=?`,
        [input.code,payment.tenant_id,payment.store_id,payment.id]);
      await event(conn,payment,'payment.manual_review',payment.status,payment.status,
        {source:'reconciliation',metadata:{error_code:input.code}});
      await conn.query(`INSERT INTO payment_event_outbox
        (event_id,tenant_id,store_id,order_id,payment_id,payment_version,available_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,
        [randomUUID(),payment.tenant_id,payment.store_id,payment.order_id,payment.id,Number(payment.version)+1]);
      const [rows]=await conn.query('SELECT * FROM payment_payments WHERE tenant_id=? AND store_id=? AND id=?',
        [payment.tenant_id,payment.store_id,payment.id]);return rows[0];
    });
  }
  async function completeRefundOperation(conn,payment,refund,input) {
    if(input.providerOperationId===undefined)return;
    await conn.query(`UPDATE payment_provider_operations SET status='succeeded',result=?,error_code=NULL,
      lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND store_id=? AND payment_id=? AND refund_id=? AND id=?
      AND operation='refund' AND status IN ('reserved','uncertain')`,
      [JSON.stringify(refund),payment.tenant_id,payment.store_id,payment.id,refund.id,d.identifier(input.providerOperationId)]);
  }
  async function linkRefundOperation(conn,payment,refundId,input) {
    if(input.providerOperationId===undefined)return;
    const [result]=await conn.query(`UPDATE payment_provider_operations SET refund_id=? WHERE tenant_id=? AND store_id=? AND payment_id=?
      AND operation='refund' AND id=? AND (refund_id IS NULL OR refund_id=?)`,
      [refundId,payment.tenant_id,payment.store_id,payment.id,d.identifier(input.providerOperationId),refundId]);
    if(!result.affectedRows)d.fail('PAYMENT_IDEMPOTENCY_CONFLICT');
  }
  async function completeProviderOperation(conn,payment,input) {
    if(input.providerOperationId===undefined)return;
    await conn.query(`UPDATE payment_provider_operations SET status='succeeded',result=?,error_code=NULL,
      lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND store_id=? AND payment_id=? AND id=?
      AND status IN ('reserved','uncertain')`,[JSON.stringify(payment),payment.tenant_id,payment.store_id,payment.id,d.identifier(input.providerOperationId)]);
  }
  async function prepareAbandon(input) {
    return transaction(async conn=>{
      const args=[...scope(input),d.identifier(input.orderId)];await orderLock(conn,input,input.orderId);
      const [orders]=await conn.query(`SELECT o.id,o.payment_abandoned_at FROM order_orders o
        JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.id=o.status_id WHERE o.tenant_id=? AND o.store_id=? AND o.id=?
        AND o.online_payment_required=1 AND o.is_paid=0
        ${input.changeMethod?"AND s.code NOT IN ('canceled','cancelled')":"AND o.stock_deducted_at IS NULL AND o.payment_satisfied_at IS NULL AND (s.code='new' OR o.payment_abandoned_at IS NOT NULL)"}
        ${input.changeMethod?'':'AND o.created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? HOUR)'} FOR UPDATE`,input.changeMethod?args:[...args,input.horizonHours]);
      if(!orders.length)d.fail('PAYMENT_INVALID_STATE');
      const [payments]=await conn.query('SELECT id,status,captured_amount,reconciliation_state FROM payment_payments WHERE tenant_id=? AND store_id=? AND order_id=? FOR UPDATE',args);
      if(payments.some(p=>!['cancelled','failed'].includes(p.status) || d.minor(p.captured_amount,true)>0n || p.reconciliation_state==='manual_review'))d.fail('PAYMENT_PROVIDER_RECOVERY_REQUIRED');
      if(payments.length) {
        const [ops]=await conn.query("SELECT id FROM payment_provider_operations WHERE tenant_id=? AND store_id=? AND payment_id IN (?) AND status IN ('reserved','uncertain') LIMIT 1 FOR UPDATE",[args[0],args[1],payments.map(p=>p.id)]);
        if(ops.length)d.fail('PAYMENT_PROVIDER_RECOVERY_REQUIRED');
      }
      if(!input.changeMethod)await conn.query('UPDATE payment_order_guards SET closed_at=COALESCE(closed_at,UTC_TIMESTAMP(6)) WHERE tenant_id=? AND store_id=? AND order_id=?',args);
      return {closed:true,orderId:String(input.orderId)};
    });
  }
  async function refundAttention(input) {
    return transaction(async conn=>{
      const {payment}=await paymentLock(conn,input);
      const [rows]=await conn.query('SELECT * FROM payment_refunds WHERE tenant_id=? AND payment_id=? AND id=? FOR UPDATE',[payment.tenant_id,payment.id,d.identifier(input.refundId)]);
      const refund=rows[0];if(!refund)d.fail('PAYMENT_NOT_FOUND');
      if(refund.recovery_state==='done' || (refund.recovery_state==='manual_review' && refund.recovery_error_code===input.code))return;
      await conn.query("UPDATE payment_refunds SET recovery_state='manual_review',recovery_error_code=?,next_check_at=NULL,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND id=?",[input.code,payment.tenant_id,refund.id]);
      await event(conn,payment,'refund.manual_review',payment.status,payment.status,{source:'reconciliation',metadata:{refund_id:String(refund.id),error_code:input.code}});
      await conn.query('UPDATE payment_payments SET version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=? AND id=?',[payment.tenant_id,payment.id]);
      await conn.query(`INSERT INTO payment_event_outbox (event_id,tenant_id,store_id,order_id,payment_id,payment_version,available_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,[randomUUID(),payment.tenant_id,payment.store_id,payment.order_id,payment.id,Number(payment.version)+1]);
    });
  }
  return Object.freeze({ getPayment, getRefunds, createPayment, transitionPayment, createRefund, transitionRefund,reconciliationAttention,prepareAbandon,refundAttention });
}
module.exports = { createPaymentCore };
