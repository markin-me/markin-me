"use strict";

const { randomUUID } = require("node:crypto");

class PaymentServiceError extends Error {
  constructor(code, status = 503, requestId, uncertain = false) {
    super(code); this.name = "PaymentServiceError";
    this.code = code; this.status = status; this.requestId = requestId; this.uncertain = uncertain;
  }
}
// Server-only. Construction never opens a connection or blocks Main Backend startup.
function createPaymentServiceClient(env = process.env) {
  async function request(method, route, context = {}, payload) {
    const requestId = typeof context.requestId === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(context.requestId)
      ? context.requestId : randomUUID();
    const token = env.PAYMENT_SERVICE_INTERNAL_TOKEN;
    let base;
    try {
      base = new URL(env.PAYMENT_SERVICE_URL);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
        || (env.NODE_ENV==="production" && base.protocol==="http:" && !["127.0.0.1","[::1]"].includes(base.hostname))
        || base.pathname !== "/" || base.search || base.hash || typeof token !== "string"
        || token.length < 32 || token.length > 256 || !/^[\x21-\x7e]+$/.test(token)) throw new Error();
    } catch { throw new PaymentServiceError("PAYMENT_SERVICE_NOT_CONFIGURED", 503, requestId); }
    const timeout = Number(env.PAYMENT_SERVICE_TIMEOUT_MS || 5000);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new PaymentServiceError("PAYMENT_SERVICE_NOT_CONFIGURED", 503, requestId);
    const headers = { "x-payment-service-token": token, "x-request-id": requestId };
    if (route.startsWith("/internal/")) {
      for (const name of ["tenantId", "storeId"]) {
        const value = String(context[name] ?? "");
        if (!/^[1-9]\d*$/.test(value) || BigInt(value) > 2147483647n) throw new PaymentServiceError("PAYMENT_INPUT_INVALID", 400, requestId);
        headers[name === "tenantId" ? "x-tenant-id" : "x-store-id"] = value;
      }
    }
    if (method !== "GET" && (route.includes("provider-connections") || route.includes('/delivery/') || context.actorId!==undefined)) {
      const actor = String(context.actorId ?? "");
      if (!/^[1-9]\d*$/.test(actor) || BigInt(actor)>2147483647n) throw new PaymentServiceError("PAYMENT_INPUT_INVALID",400,requestId);
      headers["x-actor-user-id"] = actor;
    }
    if (method === "POST" && !route.includes("provider-connections")) {
      if (typeof context.idempotencyKey !== "string" || !context.idempotencyKey.trim()
        || context.idempotencyKey.trim() !== context.idempotencyKey || context.idempotencyKey.length > 64)
        throw new PaymentServiceError("PAYMENT_INPUT_INVALID", 400, requestId);
      headers["idempotency-key"] = context.idempotencyKey;
      headers["content-type"] = "application/json";
    }
    if (method !== "GET") headers["content-type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(new URL(route, base), {
        method, headers, body: method !== "GET" ? JSON.stringify(payload ?? {}) : undefined,
        signal: controller.signal, redirect: "error",
      });
      let result;
      try { result = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw new PaymentServiceError("PAYMENT_SERVICE_INVALID_RESPONSE", 502, requestId, method !== "GET");
      }
      if (!response.ok) {
        const raw = result?.error?.code;
        const code = typeof raw === "string" && /^PAYMENT_[A-Z_]{1,80}$/.test(raw) ? raw : "PAYMENT_SERVICE_INVALID_RESPONSE";
        throw new PaymentServiceError(code, response.status, requestId, method !== "GET" && response.status >= 500);
      }
      if (result?.ok !== true) throw new PaymentServiceError("PAYMENT_SERVICE_INVALID_RESPONSE", 502, requestId, method !== "GET");
      return route.startsWith("/internal/") ? result.data : result;
    } catch (error) {
      if (error instanceof PaymentServiceError) throw error;
      throw new PaymentServiceError(controller.signal.aborted ? "PAYMENT_SERVICE_TIMEOUT" : "PAYMENT_SERVICE_UNAVAILABLE",
        503, requestId, method !== "GET");
    } finally { clearTimeout(timer); }
  }
  function path(context, suffix = "") {
    const id = String(context.paymentId ?? "");
    if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 2147483647n) throw new PaymentServiceError("PAYMENT_INPUT_INVALID", 400);
    return `/internal/v1/payments/${id}${suffix}`;
  }
  function connectionPath(context) {
    const id = String(context.connectionId ?? "");
    if (!/^[1-9]\d*$/.test(id) || BigInt(id)>2147483647n) throw new PaymentServiceError("PAYMENT_INPUT_INVALID",400);
    return `/internal/v1/provider-connections/${id}`;
  }
  return Object.freeze({
    importExternalRefund:(context,input)=>request('POST','/internal/v1/operations/refunds/import',context,input),
    closeAbandoned:(context,input)=>request('POST','/internal/v1/checkout/close-abandoned',context,input),
    closeForMethodChange:(context,input)=>request('POST','/internal/v1/checkout/close-method-change',context,input),
    replayDelivery:(context,input)=>request('POST',`/internal/v1/delivery/${input.queue}/${input.id}/replay`,context,{confirmed:true}),
    orderReturnRefund:(context,input)=>request("POST","/internal/v1/order-returns/refund",context,input),
    getOperationalStatus: context => request("GET","/internal/v1/operations/status",context),
    getProviders: context => request("GET","/internal/v1/payment-providers",context),
    checkoutAvailability: context => request("GET","/internal/v1/checkout/availability",context),
    checkoutPayment: (context,input) => request("POST","/internal/v1/checkout/pay",context,input),
    checkoutState: (context,input) => request("POST","/internal/v1/checkout/state",context,input),
    checkoutSnapshot: (context,input) => request("POST","/internal/v1/checkout/snapshot",context,input),
    getConnections: context => request("GET","/internal/v1/provider-connections",context),
    getConnection: context => request("GET",connectionPath(context),context),
    getConnectionWebhookInfo:context=>request('GET',`${connectionPath(context)}/webhook`,context),
    createConnection: (context,input) => request("POST","/internal/v1/provider-connections",context,input),
    updateConnection: (context,input) => request("PATCH",connectionPath(context),context,input),
    archiveConnection: (context,input) => request("POST",connectionPath(context)+"/archive",context,input),
    revealConnectionSecret: (context,input) => request("POST",connectionPath(context)+"/secret",context,input),
    verifyConnection: (context,input) => request("POST",connectionPath(context)+"/verify",context,input),
    createPayment: (context, input) => request("POST", "/internal/v1/payments", context, input),
    refreshPayment: context => request("POST",path(context,"/refresh"),context,{}),
    getPayment: context => request("GET", path(context), context),
    capturePayment: (context, input) => request("POST", path(context, "/capture"), context, input),
    cancelPayment: context => request("POST", path(context, "/cancel"), context, {}),
    createRefund: (context, input) => request("POST", path(context, "/refunds"), context, input),
    getRefunds: context => request("GET", path(context, "/refunds"), context),
    health: () => request("GET", "/health"),
    readiness: () => request("GET", "/ready"),
  });
}
module.exports = { createPaymentServiceClient, PaymentServiceError };
