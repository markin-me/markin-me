"use strict";

const {getOrderPaymentSummary}=require('./orderPaymentSummary');
function isOrderEligibleForFulfillment(order) {
  if(order.paymentSummary)return order.paymentSummary.fulfillmentEligible===true;
  if(Number(order.online_payment_required) && order.total_price==null && !order.payment_projection)
    return ['paid','not_required'].includes(order.online_payment_status);
  return getOrderPaymentSummary(order).fulfillmentEligible;
}
module.exports={isOrderEligibleForFulfillment};
