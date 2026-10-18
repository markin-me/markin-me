"use strict";

const d = require("./payment-domain");
const API = "https://api.yookassa.ru/v3";
const PAYMENT_STATUS = { pending: "pending", waiting_for_capture: "pending", succeeded: "paid", canceled: "cancelled" };
const REFUND_STATUS = { pending: "pending", succeeded: "succeeded", canceled: "cancelled" };
function providerError(code, retryable = false, uncertain = false) {
  const error = new d.PaymentError(code);
  error.retryable = retryable; error.uncertain = uncertain;
  return error;
}
function invalid() { throw providerError("PAYMENT_PROVIDER_INVALID_RESPONSE"); }
function externalId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) invalid();
  return value;
}
function money(value) {
  try { if (!value || value.currency !== "RUB") invalid(); return { amount: d.amount(value.value), currency: value.currency }; }
  catch { invalid(); }
}
function normalizePayment(raw, context) {
  if (!raw || !Object.hasOwn(PAYMENT_STATUS, raw.status)) {
    const error=providerError("PAYMENT_PROVIDER_INVALID_RESPONSE");
    if (typeof raw?.status === "string" && /^[a-z_]{1,64}$/.test(raw.status)) error.providerStatus=raw.status;
    throw error;
  }
  const id = externalId(raw.id), amount = money(raw.amount);
  if (typeof raw.test !== "boolean" || typeof raw.paid !== "boolean"
    || String(raw.recipient?.account_id) !== context.shopId || raw.test !== (context.environment === "test"))
    throw providerError("PAYMENT_PROVIDER_IDENTITY_MISMATCH");
  if ((raw.status === "succeeded" && !raw.paid) || (raw.status === "canceled" && raw.paid)) invalid();
  let confirmation = null;
  if (raw.confirmation != null) {
    if (!['redirect','embedded'].includes(raw.confirmation.type)) invalid();
    try { confirmation = raw.confirmation.type==='embedded'
      ? raw.confirmation.confirmation_token ? d.confirmation({type:'embedded',token:raw.confirmation.confirmation_token}) : null
      : d.confirmation({type:'redirect',url:raw.confirmation.confirmation_url}); }
    catch { invalid(); }
    if (!confirmation && raw.confirmation.type==='redirect') invalid();
  }
  const rawMetadata = { provider_status: raw.status };
  const reason = raw.cancellation_details?.reason;
  if (typeof reason === "string" && /^[a-z_]{1,64}$/.test(reason)) rawMetadata.provider_reason_code = reason;
  return { providerPaymentId: id, status: PAYMENT_STATUS[raw.status], ...amount,
    references: Object.fromEntries(["internalPaymentId","tenantReference","storeReference","orderReference"]
      .filter(key=>typeof raw.metadata?.[key]==="string" && /^[1-9][0-9]{0,9}$/.test(raw.metadata[key])).map(key=>[key,raw.metadata[key]])),
    capturedAmount: raw.status === "succeeded" ? amount.amount : "0.00", confirmation, refundable:raw.refundable === true, rawMetadata };
}
function normalizeRefund(raw, paymentId) {
  if (!raw || !Object.hasOwn(REFUND_STATUS, raw.status) || raw.payment_id !== paymentId) invalid();
  return { providerRefundId: externalId(raw.id), status: REFUND_STATUS[raw.status], ...money(raw.amount),
    internalRefundId:typeof raw.metadata?.internalRefundId==='string' && /^[1-9][0-9]{0,9}$/.test(raw.metadata.internalRefundId)?raw.metadata.internalRefundId:null,
    receiptRegistration:["pending","succeeded","canceled"].includes(raw.receipt_registration)?raw.receipt_registration:null,
    rawMetadata: { provider_status: raw.status,...(typeof raw.cancellation_details?.reason==="string" && /^[a-z_]{1,64}$/.test(raw.cancellation_details.reason)?{provider_reason_code:raw.cancellation_details.reason}:{}) } };
}
// No credentials are cached. resolveCredentials is a scoped Payment Service callback.
function createYooKassaProvider(config, resolveCredentials) {
  async function request(context, method, path, body, idempotencyKey) {
    const started = Date.now(), controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.providerTimeoutMs);
    let status, result = "ok", headers;
    try {
      const credentials = await resolveCredentials(context);
      headers = { "Authorization": `Basic ${Buffer.from(`${credentials.shopId}:${credentials.secretKey}`).toString("base64")}`,
        "Accept": "application/json", "User-Agent": "markin-me-payment-service/1.0" };
      if (method === "POST") {
        const key = d.text(idempotencyKey);
        if (!/^[\x21-\x7e]+$/.test(key)) d.fail("PAYMENT_INPUT_INVALID");
        headers["Idempotence-Key"] = key; headers["Content-Type"] = "application/json";
      }
      const response = await fetch(`${API}${path}`, { method, headers, redirect: "error", signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body) });
      status = response.status;
      // Do not parse/store provider error descriptions: they can echo request parameters.
      if (!response.ok) {
        await response.body?.cancel();
        if (status === 401) throw providerError("PAYMENT_PROVIDER_AUTH_FAILED");
        if (status === 403) throw providerError("PAYMENT_PROVIDER_ACCESS_DENIED");
        if (status === 404 && method==='GET')throw providerError('PAYMENT_PROVIDER_NOT_FOUND');
        if (status === 429) {
          const error=providerError("PAYMENT_PROVIDER_RATE_LIMITED", true, method === "POST");
          const retry=response.headers.get('retry-after');
          if(retry && /^\d{1,6}$/.test(retry))error.retryAfterSeconds=Math.min(86400,Number(retry));
          throw error;
        }
        if (status >= 500) throw providerError("PAYMENT_PROVIDER_UNAVAILABLE", true, method === "POST");
        throw providerError("PAYMENT_PROVIDER_REQUEST_INVALID");
      }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) invalid();
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 262144) { controller.abort(); invalid(); }
        chunks.push(chunk);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { invalid(); }
    } catch (error) {
      if (!(error instanceof d.PaymentError)) error = providerError(controller.signal.aborted
        ? "PAYMENT_PROVIDER_TIMEOUT" : "PAYMENT_PROVIDER_UNAVAILABLE", true, method === "POST");
      if (method === "POST" && error.code === "PAYMENT_PROVIDER_INVALID_RESPONSE") error.uncertain = true;
      result = error.code; throw error;
    } finally {
      clearTimeout(timer);
      if (headers) delete headers.Authorization;
      console.info(JSON.stringify({ operation: `provider.${context.operation || "request"}`, provider: "yookassa",
        requestId: context.requestId, connectionId: context.connectionId, paymentId: context.paymentId,
        duration: Date.now() - started, httpStatus: status, result }));
    }
  }
  async function paymentResponse(context, method, path, body, key) {
    const raw = await request(context, method, path, body, key);
    try { return normalizePayment(raw, context); }
    catch (error) {
      if (method === "POST") error.uncertain = true;
      console.warn(JSON.stringify({operation:"provider.normalize",connectionId:context.connectionId,
        paymentId:context.paymentId,result:error.code,providerStatus:error.providerStatus}));
      throw error;
    }
  }
  return {
    capabilities: { supportsCapture: true, supportsCancel: true, supportsRefund: true, supportsPartialRefund: true,
      supportedChannels: ["online"], supportedMethods: ["card", "yoo_money"] },
    async verifyConnection(context) {
      const raw = await request({ ...context, operation: "verify" }, "GET", "/me");
      if (!raw || typeof raw.test !== "boolean" || !["enabled", "disabled"].includes(raw.status)
        || typeof raw.account_id !== "string") invalid();
      if (raw.account_id !== context.shopId || raw.test !== (context.environment === "test"))
        throw providerError("PAYMENT_PROVIDER_IDENTITY_MISMATCH");
      if (raw.status !== "enabled") throw providerError("PAYMENT_PROVIDER_ACCESS_DENIED");
      if (!Array.isArray(raw.payment_methods) || raw.payment_methods.length > 64
        || raw.payment_methods.some(method => typeof method !== "string" || !/^[a-z_]{1,64}$/.test(method))) invalid();
      return { test: raw.test, paymentMethods: [...new Set(raw.payment_methods)],
        supportedMethods: raw.payment_methods.filter(method => ["bank_card", "yoo_money"].includes(method)).map(method => method === "bank_card" ? "card" : method),
        supportsCapture: raw.payment_methods.includes("bank_card") || raw.payment_methods.includes("yoo_money"),
        supportsCancel: true, supportsRefund: true, supportsPartialRefund: true,
        fiscalizationEnabled: raw.fiscalization?.enabled === true || raw.fiscalization_enabled === true };
    },
    async createPayment(input) {
      if (input.currency !== "RUB" || !["card", "yoo_money"].includes(input.method) || typeof input.capture !== "boolean")
        d.fail("PAYMENT_INPUT_INVALID");
      const body = { amount: { value: d.amount(input.amount), currency: input.currency }, capture: input.capture,
        ...(input.confirmationType==='embedded' ? {} : {payment_method_data: { type: input.method === "card" ? "bank_card" : "yoo_money" }}),
        confirmation: input.confirmationType==='embedded' ? {type:'embedded'} : { type: "redirect", return_url: d.returnUrl(input.returnUrl,config.checkoutAllowLocalReturn && input.environment==='test') },
        description: input.description || `Payment ${d.identifier(input.paymentId)}`,
        metadata: { internalPaymentId: String(input.paymentId), tenantReference: String(input.tenantId),
          ...(input.orderId ? {orderReference:String(input.orderId)} : {}),...(input.storeId ? {storeReference:String(input.storeId)} : {}) } };
      if (input.confirmationType!==undefined && !['redirect','embedded'].includes(input.confirmationType))d.fail('PAYMENT_INPUT_INVALID');
      if (body.confirmation.type==='redirect' && !body.confirmation.return_url) d.fail("PAYMENT_INPUT_INVALID");
      if (input.receipt) body.receipt = input.receipt;
      const result=await paymentResponse(input, "POST", "/payments", body, input.idempotencyKey);
      if(input.confirmationType==='embedded' && result.status==='pending' && result.confirmation?.type!=='embedded')
        throw providerError('PAYMENT_PROVIDER_INVALID_RESPONSE',false,true);
      return result;
    },
    getPayment: input => paymentResponse(input, "GET", `/payments/${externalId(input.providerPaymentId)}`),
    capturePayment: input => {
      if (input.currency !== "RUB") d.fail("PAYMENT_INPUT_INVALID");
      return paymentResponse(input, "POST", `/payments/${externalId(input.providerPaymentId)}/capture`,
        { amount: { value: d.amount(input.amount), currency: input.currency } }, input.idempotencyKey);
    },
    cancelPayment: input => paymentResponse(input, "POST", `/payments/${externalId(input.providerPaymentId)}/cancel`, {}, input.idempotencyKey),
    async refundPayment(input) {
      if (input.currency !== "RUB") d.fail("PAYMENT_INPUT_INVALID");
      const raw = await request(input, "POST", "/refunds", { payment_id: externalId(input.providerPaymentId),
        amount: { value: d.amount(input.amount), currency: input.currency },
        metadata:{internalRefundId:String(input.refundId),internalPaymentId:String(input.paymentId),tenantReference:String(input.tenantId),storeReference:String(input.storeId),orderReference:String(input.orderId)},
        ...(input.receipt?{receipt:input.receipt}:{}) }, input.idempotencyKey);
      try { return normalizeRefund(raw, input.providerPaymentId); }
      catch (error) { error.uncertain = true; throw error; }
    },
    async getRefund(input) { return normalizeRefund(await request(input, "GET", `/refunds/${externalId(input.providerRefundId)}`), input.providerPaymentId); },
  };
}
module.exports = { createYooKassaProvider, normalizePayment, normalizeRefund };
