"use strict";

function minor(value) {
  const raw=String(value ?? '0');
  if(!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) throw new Error('PAYMENT_AMOUNT_MISMATCH');
  const [whole,fraction='']=raw.split('.');
  return Number(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
}
function storedProjection(order) {
  const raw=order.payment_projection;
  return typeof raw==='string' ? JSON.parse(raw) : raw || null;
}
function getOrderPaymentSummary(order, projection=storedProjection(order)) {
  const required=Number(order.online_payment_required)===1;
  const amount=minor(order.total_price);
  const cancelled=['cancelled','canceled'].includes(order.status_code || order.statusCode);
  if(!required) {
    const paid=Number(order.is_paid)===1;
    return {required:false,method:order.payment_code || order.paymentCode || null,state:paid?'paid':'unpaid',
      source:paid?'manual':'none',amount,currency:'RUB',paidAmount:paid?amount:0,refundedAmount:0,
      paymentSatisfied:paid || amount===0,canPay:false,fulfillmentEligible:!cancelled,
      paidAt:order.manual_paid_at || null,currentPaymentId:null,successfulPaymentId:null,anomalies:[]};
  }
  const state=projection?.state || (order.online_payment_status==='paid'?'paid':amount===0?'not_required':'unpaid');
  const paidAmount=projection?.paidAmount ?? (order.online_payment_status==='paid'?minor(order.online_payment_total ?? order.total_price):0);
  const refundedAmount=projection?.refundedAmount || 0;
  const anomalies=projection?.anomalies || [];
  const mismatch=Boolean(paidAmount && paidAmount!==amount);
  const satisfied=amount===0 || (paidAmount-refundedAmount>=amount && !mismatch && !anomalies.length);
  const active=projection?.activePayment ?? !['failed','cancelled','refunded','not_required'].includes(state);
  return {required:true,method:'online',state,source:'gateway',amount,currency:'RUB',paidAmount,refundedAmount,
    refunds:(projection?.refunds || []).map(r=>({id:r.id,orderReturnId:r.orderReturnId,origin:r.origin,amount:r.amount,currency:r.currency,state:r.status,attentionRequired:r.recoveryState==='manual_review',receiptRegistration:r.receiptRegistration})),
    pendingRefundAmount:(projection?.refunds || []).filter(r=>['created','pending'].includes(r.status)).reduce((sum,r)=>sum+minor(r.amount),0),
    currentPaymentId:projection?.currentPaymentId || null,successfulPaymentId:projection?.successfulPaymentId || null,
    paidAt:projection?.paidAt || null,updatedAt:projection?.updatedAt || null,
    paymentSatisfied:satisfied,amountMismatch:mismatch,anomalies,activePayment:active,attentionRequired:Boolean(projection?.attentionRequired),
    canPay:!projection?.attentionRequired && !cancelled && !Number(order.is_final || order.status_is_final || order.statusIsFinal) && !paidAmount && amount>0 &&
      (!projection || ['unpaid','failed','cancelled'].includes(state) || Boolean(projection.canContinue)),
    fulfillmentEligible:!cancelled && satisfied};
}
function clientPaymentSummary(order) { return getOrderPaymentSummary(order); }
module.exports={minor,storedProjection,getOrderPaymentSummary,clientPaymentSummary};
