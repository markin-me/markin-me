"use strict";

const {randomUUID} = require("node:crypto");

function paymentError(code, status=409) { const error=new Error(code);error.code=code;error.status=status;return error; }
function money(value) {
  const raw=String(value ?? "");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) throw paymentError("PAYMENT_AMOUNT_MISMATCH");
  const [whole,fraction=""]=raw.split(".");return `${BigInt(whole)}.${fraction.padEnd(2,"0")}`;
}
function customerPayment(payment) {
  return {id:payment.id || null,status:payment.status,amount:payment.amount,currency:payment.currency,
    source:"gateway",action:!payment.attentionRequired && ["pending","waiting_for_confirmation"].includes(payment.status) && payment.confirmation?.type === "redirect"
      ? {type:"redirect",url:payment.confirmation.url} : null};
}
function createOrderOnlinePayment({db,client}) {
  async function dispatchRefund(id,tenantId,storeId) {
    const token=randomUUID();
    const [claim]=await db.query(`UPDATE order_refunds SET dispatch_lease_token=?,dispatch_lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND)
      WHERE tenant_id=? AND store_id=? AND id=? AND financial_state IN ('queued','processing')
      AND (dispatch_after IS NULL OR dispatch_after<=UTC_TIMESTAMP(6))
      AND (dispatch_lease_until IS NULL OR dispatch_lease_until<UTC_TIMESTAMP(6))`,[token,tenantId,storeId,id]);
    if(!claim.affectedRows)return;
    let state='processing',code=null;
    try {
      const refund=await client.orderReturnRefund({tenantId,storeId,idempotencyKey:`return:${id}`,requestId:randomUUID()},{orderReturnId:String(id)});
      state=refund.status==='succeeded'?'succeeded':['failed','cancelled'].includes(refund.status)?'failed':refund.recoveryState==='manual_review'?'manual_review':'processing';
    }catch(error) {
      code=/^PAYMENT_[A-Z_]+$/.test(error.code || '')?error.code:'PAYMENT_SERVICE_UNAVAILABLE';
      state=['PAYMENT_DUPLICATE_SUCCESS','PAYMENT_PROVIDER_RECOVERY_EXPIRED','PAYMENT_PROVIDER_IDENTITY_MISMATCH'].includes(code)?'manual_review':
        error.uncertain || Number(error.status)>=500 || Number(error.status)===429 || ['PAYMENT_OPERATION_IN_PROGRESS','PAYMENT_PROVIDER_RECOVERY_REQUIRED'].includes(code)?'queued':'failed';
    }finally {
      await db.query(`UPDATE order_refunds SET financial_state=?,financial_error_code=?,dispatch_after=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND),
        dispatch_lease_token=NULL,dispatch_lease_until=NULL WHERE tenant_id=? AND store_id=? AND id=? AND dispatch_lease_token=?
        AND financial_state IN ('queued','processing')`,[state,code,tenantId,storeId,id,token]);
    }
  }
  async function dispatchRefunds() {
    const [rows]=await db.query(`SELECT id,tenant_id,store_id FROM order_refunds WHERE financial_state IN ('queued','processing')
      AND dispatch_after<=UTC_TIMESTAMP(6) AND (dispatch_lease_until IS NULL OR dispatch_lease_until<UTC_TIMESTAMP(6)) ORDER BY dispatch_after,id LIMIT 10`);
    for(const row of rows)await dispatchRefund(row.id,row.tenant_id,row.store_id);
  }
  async function snapshot(order) {
    return client.checkoutSnapshot({tenantId:order.tenant_id,storeId:order.store_id,idempotencyKey:`snapshot:${order.id}`},{orderId:String(order.id)});
  }
  async function claimRefresh(order) {
    const [result]=await db.query(`UPDATE order_orders SET payment_refresh_after=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 SECOND)
      WHERE tenant_id=? AND store_id=? AND id=? AND (payment_refresh_after IS NULL OR payment_refresh_after<=UTC_TIMESTAMP(6))`,
    [order.tenant_id,order.store_id,order.id]);
    if(!result.affectedRows)throw paymentError('PAYMENT_REFRESH_RATE_LIMITED',429);
  }
  async function load(tenantId,publicId) {
    if (!/^[0-9a-f-]{36}$/i.test(String(publicId))) throw paymentError("ORDER_NOT_FOUND",404);
    const [rows]=await db.query(`SELECT o.*,p.code AS payment_code,s.code AS status_code,s.is_final
      FROM order_orders o LEFT JOIN order_payments p ON p.tenant_id=o.tenant_id AND p.id=o.payment_id
      LEFT JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.id=o.status_id
      WHERE o.tenant_id=? AND o.public_id=? AND o.is_active=1 LIMIT 1`,[tenantId,publicId]);
    if (!rows.length) throw paymentError("ORDER_NOT_FOUND",404);return rows[0];
  }
  async function availability(tenantId,storeId) {
    const [stores]=await db.query("SELECT id FROM ten_stores WHERE tenant_id=? AND id=? AND is_active=1",[tenantId,storeId]);
    if (!stores.length) return {available:false,code:"ONLINE_PAYMENT_NOT_AVAILABLE"};
    const [methods]=await db.query("SELECT id FROM order_payments WHERE tenant_id=? AND store_id=1 AND code='online' AND is_active=1 LIMIT 1",[tenantId]);
    if (!methods.length) return {available:false,code:"ONLINE_PAYMENT_NOT_AVAILABLE"};
    return client.checkoutAvailability({tenantId,storeId});
  }
  async function returnUrl(tenantId,publicId) {
    const [rows]=await db.query("SELECT custom_domain_ascii,custom_domain,subdomain FROM ten_tenants WHERE id=?",[tenantId]);
    const tenant=rows[0];
    const baseDomain=process.env.TENANT_BASE_DOMAIN || process.env.PUBLIC_BASE_DOMAIN || process.env.APP_BASE_DOMAIN;
    const domain=tenant?.custom_domain_ascii || tenant?.custom_domain || (tenant?.subdomain && baseDomain ? `${tenant.subdomain}.${baseDomain}` : null);
    let override;
    try {override=process.env.PAYMENT_CHECKOUT_RETURN_ORIGINS_JSON ? JSON.parse(process.env.PAYMENT_CHECKOUT_RETURN_ORIGINS_JSON)[String(tenantId)] : null;}
    catch {throw paymentError("PAYMENT_RETURN_URL_NOT_CONFIGURED",503);}
    let url;
    try { url=new URL(override || `https://${domain}`); } catch { throw paymentError("PAYMENT_RETURN_URL_NOT_CONFIGURED",503); }
    const local=Boolean(override && process.env.PAYMENT_CHECKOUT_ALLOW_LOCAL_RETURN==='1' && url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
    if ((!domain && !override) || (url.protocol!=="https:" && !local) || url.username || url.password || url.search || url.hash || url.pathname!=="/")
      throw paymentError("PAYMENT_RETURN_URL_NOT_CONFIGURED",503);
    url.pathname="/shop";url.searchParams.set("payment_order",publicId);url.searchParams.set("tenant_id",String(tenantId));return url.href;
  }
  async function receipt(order,amount) {
    const [settings]=await db.query("SELECT online_receipt_config FROM ten_tenants WHERE id=?",[order.tenant_id]);
    const raw=settings[0]?.online_receipt_config;
    let cfg;try{cfg=typeof raw==='string'?JSON.parse(raw):raw;}catch{throw paymentError("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED",503);}
    if (!cfg) return undefined; // Test-only non-fiscalized merchants can omit receipt; the Service checks their capabilities.
    if (cfg.provider!=='yookassa' || !Number.isInteger(cfg.vatCode) || cfg.vatCode<1 || cfg.vatCode>12
      || !Number.isInteger(cfg.deliveryVatCode) || cfg.deliveryVatCode<1 || cfg.deliveryVatCode>12
      || !["full_prepayment","full_payment"].includes(cfg.paymentMode)
      || !["commodity","service"].includes(cfg.paymentSubject)) throw paymentError("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED",503);
    const phone=String(order.customer_phone || "").replace(/\D/g,"");
    if (!/^\d{10,15}$/.test(phone)) throw paymentError("PAYMENT_RECEIPT_CONTACT_REQUIRED",422);
    const items=typeof order.items === "string" ? JSON.parse(order.items) : order.items;
    const minor=value=>{const [w,f]=money(value).split(".");return BigInt(w)*100n+BigInt(f);};
    const decimal=value=>`${value/100n}.${String(value%100n).padStart(2,"0")}`;
    const total=minor(amount),delivery=minor(order.delivery_cost || "0.00"),payable=total-delivery;
    if (payable<0n || !Array.isArray(items)) throw paymentError("PAYMENT_AMOUNT_MISMATCH");
    const bases=items.map(item=>minor(Number(item.line_total || 0).toFixed(2))),sum=bases.reduce((a,b)=>a+b,0n);
    if (!sum && payable) throw paymentError("PAYMENT_AMOUNT_MISMATCH");
    const lines=[];let allocated=0n;let cumulative=0n;
    items.forEach((item,index)=>{
      cumulative+=bases[index];const target=sum ? payable*cumulative/sum : 0n;const line=target-allocated;allocated=target;
      if (!line) return;
      const qty=Number(item.qty || 1);if (!Number.isInteger(qty) || qty<1 || qty>10000) throw paymentError("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED");
      const unit=line/BigInt(qty),remainder=Number(line%BigInt(qty));
      if(unit===0n && qty>remainder) throw paymentError("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED");
      const add=(count,value)=>{if(count && value) lines.push({description:String(item.name || item.combo_title || "Item").slice(0,128),quantity:String(count),amount:{value:decimal(value),currency:"RUB"},vat_code:cfg.vatCode,payment_mode:cfg.paymentMode,payment_subject:cfg.paymentSubject});};
      add(qty-remainder,unit);add(remainder,unit+1n);
    });
    if(delivery) lines.push({description:"Delivery",quantity:"1",amount:{value:decimal(delivery),currency:"RUB"},vat_code:cfg.deliveryVatCode,payment_mode:cfg.paymentMode,payment_subject:"service"});
    if (!lines.length || lines.length>100) throw paymentError("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED");
    if (cfg.taxSystemCode!==undefined && (!Number.isInteger(cfg.taxSystemCode) || cfg.taxSystemCode<1 || cfg.taxSystemCode>6)) throw paymentError("PAYMENT_RECEIPT_CONFIGURATION_REQUIRED");
    return {customer:{phone},items:lines,...(cfg.taxSystemCode ? {tax_system_code:cfg.taxSystemCode} : {})};
  }
  async function pay(order,key) {
    if (!order.online_payment_required) throw paymentError("ONLINE_PAYMENT_NOT_AVAILABLE");
    const amount=money(order.total_price);
    if (money(order.online_payment_total)!==amount) throw paymentError("PAYMENT_AMOUNT_MISMATCH");
    if (Number(order.is_paid)===1 && order.online_payment_status!=="paid") throw paymentError("ORDER_ALREADY_PAID");
    if (order.online_payment_status==="paid") return {status:"paid",source:"gateway",amount,currency:"RUB",action:null};
    if (amount==="0.00") return {status:"not_required",source:"gateway",amount,currency:"RUB",action:null};
    if (Number(order.is_final)===1 || ["canceled","cancelled"].includes(order.status_code)) throw paymentError("PAYMENT_INVALID_STATE");
    const [methods]=await db.query("SELECT id FROM order_payments WHERE tenant_id=? AND id=? AND code='online' AND is_active=1",[order.tenant_id,order.payment_id]);
    if(!methods.length) {
      const current=await state(order);
      if(current.status==='paid' || current.action?.type==='redirect')return current;
      throw paymentError("ONLINE_PAYMENT_NOT_AVAILABLE");
    }
    const payment=await client.checkoutPayment({tenantId:order.tenant_id,storeId:order.store_id,idempotencyKey:key,requestId:randomUUID()},
      {orderId:String(order.id),amount,currency:"RUB",returnUrl:await returnUrl(order.tenant_id,order.public_id),receipt:await receipt(order,amount)});
    return customerPayment(payment);
  }
  async function state(order) {
    if (!order.online_payment_required) throw paymentError("ONLINE_PAYMENT_NOT_AVAILABLE");
    if (money(order.total_price)==="0.00") return {status:"not_required",source:"gateway",amount:"0.00",currency:"RUB",action:null};
    const payment=await client.checkoutState({tenantId:order.tenant_id,storeId:order.store_id,idempotencyKey:`state:${order.id}`},{orderId:String(order.id)});
    return customerPayment(payment);
  }
  async function result(tenantId,publicId,key) {
    const order=await load(tenantId,publicId);
    if(!order.online_payment_required) return {};
    try{return {paymentAccessToken:String(order.submission_id),payment:await pay(order,key)};}
    catch(error){
      const code=error.code || "PAYMENT_SERVICE_UNAVAILABLE";
      console.warn(JSON.stringify({operation:"checkout.payment",tenantId,storeId:order.store_id,orderId:order.id,requestId:error.requestId,code}));
      return {paymentAccessToken:String(order.submission_id),payment:{status:"pending",source:"gateway",action:null,error:code}};
    }
  }
  return {load,availability,pay,state,result,returnUrl,receipt,snapshot,claimRefresh,dispatchRefund,dispatchRefunds};
}
module.exports={createOrderOnlinePayment,paymentError,money};
