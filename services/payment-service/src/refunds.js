"use strict";

const {randomUUID}=require('node:crypto');
const d=require('./payment-domain');
const {safeCode}=require('./durable-queue');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
// Order Return supplies committed merchandise facts; only Payment Core writes financial state.
function createRefunds(db,config,core,operations) {
  async function request(input) {
    const [returns]=await db.query(`SELECT r.*,o.items AS order_items,o.total_price,o.delivery_cost
      FROM order_refunds r JOIN order_orders o ON o.tenant_id=r.tenant_id AND o.store_id=r.store_id AND o.id=r.order_id
      WHERE r.tenant_id=? AND r.store_id=? AND r.id=? AND o.online_payment_required=1`,
      [d.identifier(input.tenantId),d.identifier(input.storeId),d.identifier(input.orderReturnId)]);
    if(returns.length!==1)d.fail('PAYMENT_NOT_FOUND');
    const business=returns[0];
    const [payments]=await db.query(`SELECT * FROM payment_payments WHERE tenant_id=? AND store_id=? AND order_id=? AND captured_amount>0`,
      [input.tenantId,input.storeId,business.order_id]);
    if(payments.length!==1)d.fail('PAYMENT_DUPLICATE_SUCCESS');
    const payment=payments[0],key=`return:${business.id}:${business.financial_attempt}`;
    const [previous]=await db.query(`SELECT request_snapshot FROM payment_provider_operations
      WHERE tenant_id=? AND operation='refund' AND idempotency_key=?`,[input.tenantId,key]);
    const saved=previous[0]?.request_snapshot?JSON.parse(previous[0].request_snapshot):null;
    const receipt=saved?saved.receipt:await refundReceipt(business,payment);
    return operations.execute({...input,paymentId:String(payment.id),idempotencyKey:key},'refund',{
      amount:d.amount(String(business.total_amount)),currency:payment.currency,reason:business.comment || null,
      orderReturnId:String(business.id),actorUserId:String(business.created_by_user_id),receipt});
  }
  async function refundReceipt(business,payment) {
    const [creates]=await db.query(`SELECT payload FROM payment_provider_operations WHERE tenant_id=? AND payment_id=? AND operation='create' LIMIT 1`,
      [payment.tenant_id,payment.id]);
    const original=parse(creates[0]?.payload)?.receipt;
    if(!original || business.total_amount===payment.amount)return null;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.receipt_email || ''))d.fail('PAYMENT_RECEIPT_CONTACT_REQUIRED');
    const orderItems=parse(business.order_items);
    if(!Array.isArray(orderItems))d.fail('PAYMENT_RECEIPT_CONFIGURATION_REQUIRED');
    const [positions]=await db.query(`SELECT source_item_index,refunded_qty,line_amount FROM order_refund_items WHERE tenant_id=? AND refund_id=? ORDER BY source_item_index`,
      [business.tenant_id,business.id]);
    const [earlier]=await db.query(`SELECT i.source_item_index,SUM(i.refunded_qty) AS qty FROM order_refund_items i
      JOIN order_refunds r ON r.tenant_id=i.tenant_id AND r.id=i.refund_id WHERE r.tenant_id=? AND r.store_id=? AND r.order_id=? AND r.id<?
      GROUP BY i.source_item_index`,[business.tenant_id,business.store_id,business.order_id,business.id]);
    const prior=new Map(earlier.map(row=>[Number(row.source_item_index),Number(row.qty)]));
    const bases=orderItems.map(item=>d.minor(Number(item.line_total || 0).toFixed(2),true));
    const sum=bases.reduce((a,b)=>a+b,0n),payable=d.minor(payment.amount)-d.minor(String(business.delivery_cost),true);
    let cumulative=0n,allocated=0n,cursor=0;
    const groups=new Map();
    orderItems.forEach((item,index)=>{
      cumulative+=bases[index];const target=sum?payable*cumulative/sum:0n,line=target-allocated;allocated=target;
      if(!line)return;
      const qty=Number(item.qty || 1);if(!Number.isInteger(qty) || qty<1)d.fail('PAYMENT_RECEIPT_CONFIGURATION_REQUIRED');
      const unit=line/BigInt(qty),remainder=Number(line%BigInt(qty)),group=[];
      for(const [count,price] of [[qty-remainder,unit],[remainder,unit+1n]])if(count && price) {
        const entry=original.items?.[cursor++];
        if(!entry || entry.description!==String(item.name || item.combo_title || 'Item').slice(0,128)
          || Number(entry.quantity)!==count || d.minor(entry.amount?.value)!==price || entry.amount?.currency!==payment.currency)
          d.fail('PAYMENT_RECEIPT_SNAPSHOT_MISMATCH');
        group.push(entry);
      }
      groups.set(index,group);
    });
    const lines=[];
    for(const position of positions) {
      if(d.minor(String(position.line_amount),true)===0n)continue;
      let skip=prior.get(Number(position.source_item_index)) || 0,left=Number(position.refunded_qty),amount=0n;
      for(const entry of groups.get(Number(position.source_item_index)) || []) {
        const count=Number(entry.quantity),ignored=Math.min(skip,count);skip-=ignored;
        const take=Math.min(left,count-ignored);left-=take;
        if(take){lines.push({...entry,quantity:String(take)});amount+=d.minor(entry.amount.value)*BigInt(take);}
      }
      if(left || amount!==d.minor(String(position.line_amount),true))d.fail('PAYMENT_RECEIPT_SNAPSHOT_MISMATCH');
    }
    if(d.minor(String(business.delivery_cost),true)) {
      const entry=original.items?.[cursor++];
      if(!entry || entry.description!=='Delivery' || entry.amount?.value!==d.amount(String(business.delivery_cost)))d.fail('PAYMENT_RECEIPT_SNAPSHOT_MISMATCH');
      if(d.minor(String(business.delivery_amount),true))lines.push(entry);
    }
    if(cursor!==original.items.length || !lines.length || lines.reduce((sum,line)=>sum+d.minor(line.amount.value)*BigInt(line.quantity),0n)!==d.minor(String(business.total_amount)))
      d.fail('PAYMENT_RECEIPT_SNAPSHOT_MISMATCH');
    return {...original,customer:{email:business.receipt_email},items:lines};
  }
  async function tick(isStopped=()=>false) {
    const [rows]=await db.query(`SELECT r.*,p.store_id,r.created_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? HOUR) AS recovery_expired FROM payment_refunds r JOIN payment_payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id
      WHERE r.recovery_state='scheduled' AND r.next_check_at<=UTC_TIMESTAMP(6)
      AND (r.status IN ('created','pending') OR (r.status='succeeded' AND r.receipt_registration='pending'))
      AND p.provider='yookassa' AND (r.check_lease_until IS NULL OR r.check_lease_until<UTC_TIMESTAMP(6)) ORDER BY r.next_check_at,r.id LIMIT 10`,[config.reconcileHorizonHours]);
    for(const row of rows) {
      if(isStopped())break;
      const token=randomUUID();
      const [claim]=await db.query(`UPDATE payment_refunds SET check_lease_token=?,check_lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND),check_attempts=check_attempts+1
        WHERE tenant_id=? AND id=? AND recovery_state='scheduled' AND (check_lease_until IS NULL OR check_lease_until<UTC_TIMESTAMP(6))`,[token,row.tenant_id,row.id]);
      if(!claim.affectedRows)continue;
      const input={tenantId:String(row.tenant_id),storeId:String(row.store_id),paymentId:String(row.payment_id),refundId:String(row.id),source:'reconciliation'};
      let code=null,review=false;
      try {
        const result=row.provider_refund_id?await operations.refreshRefund(input):await operations.replayRefund(input);
        if((['created','pending'].includes(result.status) || result.receipt_registration==='pending') && (row.recovery_expired || Number(row.check_attempts)+1>=config.reconcileMaxAttempts)) {
          review=true;code=result.status==='succeeded'?'PAYMENT_REFUND_RECEIPT_HORIZON':'PAYMENT_REFUND_RECOVERY_HORIZON';
        }
      }
      catch(error){code=safeCode(error);review=['PAYMENT_PROVIDER_RECOVERY_EXPIRED','PAYMENT_IDEMPOTENCY_CONFLICT','PAYMENT_PROVIDER_IDENTITY_MISMATCH','PAYMENT_PROVIDER_INVALID_RESPONSE'].includes(code) || Number(row.check_attempts)+1>=config.reconcileMaxAttempts;}
      finally {
        if(review)await core.refundAttention({...input,code});
        await db.query(`UPDATE payment_refunds SET check_lease_token=NULL,check_lease_until=NULL,
          recovery_state=IF(status IN ('failed','cancelled') OR (status='succeeded' AND COALESCE(receipt_registration,'')<>'pending'),'done',?),recovery_error_code=?,
          next_check_at=IF(status IN ('failed','cancelled') OR (status='succeeded' AND COALESCE(receipt_registration,'')<>'pending') OR ?=1,NULL,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND))
          WHERE tenant_id=? AND id=? AND check_lease_token=?`,[review?'manual_review':'scheduled',code,review?1:0,
            Math.min(3600,120*2**Math.min(Number(row.check_attempts),5))+Math.floor(Math.random()*20),row.tenant_id,row.id,token]);
      }
    }
  }
  return {request,tick};
}
module.exports={createRefunds};
