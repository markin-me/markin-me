"use strict";

const express = require("express");
const mysql = require("mysql2/promise");
const { randomUUID, createHash, timingSafeEqual } = require("node:crypto");
const { loadConfig } = require("./config");
const { createApplication } = require("./application");
const d = require("./payment-domain");
const proxyaddr = require("proxy-addr");

function errorContract(error) {
  const code = error?.code;
  const statuses = {
    PAYMENT_ORDER_CLOSED:409,
    PAYMENT_LIVE_RELEASE_REQUIRED:409,
    PAYMENT_REFUNDS_DISABLED:503,PAYMENT_DUPLICATE_SUCCESS:409,PAYMENT_RECEIPT_CONTACT_REQUIRED:422,PAYMENT_RECEIPT_SNAPSHOT_MISMATCH:409,PAYMENT_SECRET_VIEW_DISABLED:403,PAYMENT_SERVICE_STOPPING:503,PAYMENT_INPUT_INVALID: 400, PAYMENT_AMOUNT_INVALID: 422, PAYMENT_NOT_FOUND: 404,
    PAYMENT_CONNECTION_INVALID: 404, PAYMENT_INVALID_STATE: 409, PAYMENT_ALREADY_PAID: 409,
    PAYMENT_IDEMPOTENCY_CONFLICT: 409, PAYMENT_REFUND_EXCEEDS_AVAILABLE_AMOUNT: 422,
    PAYMENT_METHOD_NOT_SUPPORTED: 422, PAYMENT_PROVIDER_NOT_CONFIGURED: 503,
    PAYMENT_PROVIDER_UNAVAILABLE: 503, PAYMENT_PROVIDER_AUTH_FAILED: 502, PAYMENT_PROVIDER_REQUEST_FAILED: 502,
    PAYMENT_SERVICE_UNAUTHORIZED: 401, PAYMENT_SERVICE_NOT_READY: 503, PAYMENT_ROUTE_NOT_FOUND: 404,
    PAYMENT_CONNECTION_VERSION_CONFLICT: 409, PAYMENT_CONNECTION_HISTORY_LOCKED: 409,
    PAYMENT_CONNECTION_STORE_CONFLICT: 409, PAYMENT_CREDENTIALS_KEY_UNAVAILABLE: 503,
    PAYMENT_CREDENTIALS_ENCRYPTION_FAILED: 500,
    PAYMENT_PROVIDER_TIMEOUT: 504, PAYMENT_PROVIDER_INVALID_RESPONSE: 502, PAYMENT_PROVIDER_REQUEST_INVALID: 422,
    PAYMENT_PROVIDER_IDENTITY_MISMATCH: 409, PAYMENT_PROVIDER_ACCESS_DENIED: 403, PAYMENT_PROVIDER_RATE_LIMITED: 429,
    PAYMENT_CONNECTION_NOT_OPERATIONAL: 409, PAYMENT_OPERATION_IN_PROGRESS: 409, PAYMENT_TEST_OPERATION_NOT_ALLOWED: 403,
    PAYMENT_PROVIDER_RECOVERY_REQUIRED: 409, PAYMENT_RECEIPT_CONFIGURATION_REQUIRED: 409,
    PAYMENT_PROVIDER_RECOVERY_EXPIRED:409,PAYMENT_PROVIDER_NOT_FOUND:502,
    PAYMENT_WEBHOOK_SOURCE_FORBIDDEN:403,PAYMENT_WEBHOOK_EVENT_UNSUPPORTED:422,
  };
  if (Object.hasOwn(statuses, code)) return { code, status: statuses[code] };
  if (error?.type === "entity.parse.failed" || error?.type === "entity.too.large") return { code: "PAYMENT_INPUT_INVALID", status: error.type === "entity.too.large" ? 413 : 400 };
  if (code === "ER_DUP_ENTRY") return { code: "PAYMENT_IDEMPOTENCY_CONFLICT", status: 409 };
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT", "PROTOCOL_CONNECTION_LOST", "ER_CON_COUNT_ERROR", "ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(code))
    return { code: "PAYMENT_SERVICE_NOT_READY", status: 503 };
  return { code: "PAYMENT_INTERNAL_ERROR", status: 500 };
}
function createApp(config, application, connections) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy",proxyaddr.compile(config.webhookTrustedProxies));
  const digest = value => createHash("sha256").update(value).digest();
  const expected = digest(config.token);
  app.use((req, res, next) => {
    const id = req.get("x-request-id");
    req.requestId = typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : randomUUID();
    res.set("x-request-id", req.requestId);
    res.set("cache-control", "no-store");
    res.set("x-content-type-options","nosniff");
    res.set("referrer-policy","no-referrer");
    next();
  });
  app.use((req,res,next)=>application.stopping ? next(new d.PaymentError("PAYMENT_SERVICE_STOPPING")) : next());
  app.get("/health", (req, res) => res.json({ ok: true, status: "ok", requestId: req.requestId }));
  app.post("/webhooks/yookassa",(req,res,next)=>{
    if(!config.webhooksEnabled)return next(new d.PaymentError("PAYMENT_SERVICE_NOT_READY"));
    if(!application.delivery.sourceAllowed(req.ip))return next(new d.PaymentError("PAYMENT_WEBHOOK_SOURCE_FORBIDDEN"));
    if(!req.is("application/json"))return next(new d.PaymentError("PAYMENT_INPUT_INVALID"));
    next();
  },express.json({limit:"32kb",strict:true}),async(req,res,next)=>{
    try{await application.delivery.accept(req.body);res.status(200).json({ok:true});}
    catch(error){
      if(!(error instanceof d.PaymentError))return next(new d.PaymentError("PAYMENT_SERVICE_NOT_READY"));
      next(error);
    }
  });
  function authorize(req, res, next) {
    const token = req.get("x-payment-service-token");
    if (typeof token !== "string" || !timingSafeEqual(digest(token), expected)) return next(new d.PaymentError("PAYMENT_SERVICE_UNAUTHORIZED"));
    next();
  }
  app.get("/ready", authorize, async (req, res) => {
    await application.readiness();
    res.json({ ok: true, status: "ready", requestId: req.requestId });
  });
  app.use("/internal/v1", authorize);
  app.use("/internal/v1/checkout/pay", express.json({ limit: "64kb", strict: true }));
  app.use("/internal/v1", express.json({ limit: "16kb", strict: true }));
  app.get("/internal/v1/delivery/status",async(req,res)=>res.json({ok:true,data:await application.delivery.stats()}));
  app.get('/internal/v1/reconciliation/status',async(req,res)=>res.json({ok:true,data:await application.reconciliation.stats()}));
  app.post("/internal/v1/delivery/:queue/:id/replay",async(req,res)=>{
    if(body(req,['confirmed']).confirmed!==true)d.fail('PAYMENT_INPUT_INVALID');
    const input={...scoped(req),actorId:d.identifier(req.get('x-actor-user-id')),requestId:req.requestId};
    res.json({ok:true,data:await application.delivery.replay(req.params.queue,req.params.id,input)});
    application.operational.invalidate(input);
  });
  function scoped(req) {
    return { tenantId: d.identifier(req.get("x-tenant-id")), storeId: d.identifier(req.get("x-store-id")) };
  }
  function body(req, fields) {
    const value = req.body;
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).some(key => !fields.includes(key))) d.fail("PAYMENT_INPUT_INVALID");
    return value;
  }
  function key(req) { return d.text(req.get("idempotency-key")); }
  function route(method, path, operation, work) {
    app[method](path, async (req, res, next) => {
      const started = Date.now();
      let input, data, causeCode, result = "ok";
      try {
        input = scoped(req);
        if (req.params.id) input.paymentId = d.identifier(req.params.id);
        data = await work(req, input);
        res.json({ ok: true, data, requestId: req.requestId });
      } catch (error) {
        result = errorContract(error).code;
        if (typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)) causeCode = error.code;
        next(error);
      } finally {
        const status = result === "ok" ? 200 : errorContract({ code: result }).status;
        const level = result === "PAYMENT_INTERNAL_ERROR" ? "ERROR" : status >= 400 ? "WARN" : "INFO";
        console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "info"](JSON.stringify({
          level, requestId: req.requestId,
          operation, tenantId: input?.tenantId, paymentId: input?.paymentId || data?.id,
          orderId: data?.orderId, provider: data?.provider, duration: Date.now() - started, result, causeCode,
        }));
      }
    });
  }
  route("get","/internal/v1/operations/status","operations.status",(req,input)=>application.operational.status(input));
  route('post','/internal/v1/operations/refunds/import','refund.verify_external',(req,input)=>{
    const value=body(req,['paymentId','providerRefundId','confirmed']);
    if(value.confirmed!==true || typeof value.providerRefundId!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.providerRefundId))d.fail('PAYMENT_INPUT_INVALID');
    return application.importRefund({...input,paymentId:d.identifier(value.paymentId),providerRefundId:value.providerRefundId,actorId:d.identifier(req.get('x-actor-user-id')),requestId:req.requestId});
  });
  route("post","/internal/v1/order-returns/refund","order_return.refund",(req,input)=>application.orderReturnRefund({...input,...body(req,["orderReturnId"])}));
  route('post','/internal/v1/checkout/close-abandoned','order.close_abandoned',(req,input)=>application.prepareAbandon({...input,...body(req,['orderId'])}));
  route('post','/internal/v1/checkout/close-method-change','order.close_method_change',(req,input)=>application.closeForMethodChange({...input,...body(req,['orderId'])}));
  const prefix = "/internal/v1/payments";
  const connectionPrefix = "/internal/v1/provider-connections";
  route("get", "/internal/v1/checkout/availability", "checkout.availability", (req,input) => application.checkoutAvailability(input));
  route("post", "/internal/v1/checkout/pay", "checkout.pay", (req,input) => {
    const data=body(req,["orderId","amount","currency","returnUrl","receipt"]);
    return application.checkoutPayment({...input,...data,idempotencyKey:key(req),requestId:req.requestId});
  });
  route("post", "/internal/v1/checkout/state", "checkout.state", (req,input) => {
    const data=body(req,["orderId"]);return application.checkoutState({...input,...data});
  });
  route("post", "/internal/v1/checkout/snapshot", "checkout.snapshot", (req,input) => {
    const data=body(req,["orderId"]);return application.checkoutSnapshot({...input,...data});
  });
  route("get", "/internal/v1/payment-providers", "provider.list", () => connections.providers());
  route("get", connectionPrefix, "connection.list", (req,input) => connections.list(input));
  route("get", `${connectionPrefix}/:id`, "connection.get", (req,input) => connections.get({ ...input,connectionId:input.paymentId }));
  route("get", `${connectionPrefix}/:id/webhook`, "connection.webhook", (req,input) => connections.webhookInfo({...input,connectionId:input.paymentId}));
  route("post", `${connectionPrefix}/:id/secret`, "connection.secret.view", (req,input) => {
    body(req,[]); return connections.revealSecret({...input,connectionId:input.paymentId,actorId:d.identifier(req.get("x-actor-user-id")),requestId:req.requestId});
  });
  route("post", `${connectionPrefix}/:id/verify`, "connection.verify", (req,input) => connections.verify({
    ...input,connectionId:input.paymentId,actorId:d.identifier(req.get("x-actor-user-id")),
    requestId:req.requestId,data:body(req,["revision"]) },application.registry));
  route("post", "/internal/v1/provider-test/payments", "payment.test.create", (req,input) => {
    const data=body(req,["orderId","providerConnectionId","amount","currency","method","capture"]);
    return application.createTestPayment({...input,...data,connectionId:data.providerConnectionId,idempotencyKey:key(req),requestId:req.requestId});
  });
  for (const [method,path,archive] of [["post",connectionPrefix,false],["patch",`${connectionPrefix}/:id`,false],["post",`${connectionPrefix}/:id/archive`,true]]) {
    route(method,path,archive ? "connection.archive" : "connection.save",(req,input) => {
      const fields = archive ? ["revision"] : ["provider","name","environment","enabled","configuration","credentials","scope","revision"];
      return connections[archive ? "archive" : "save"]({ ...input,connectionId:input.paymentId,
        actorId:d.identifier(req.get("x-actor-user-id")), requestId:req.requestId, data:body(req,fields) });
    });
  }
  route("post", prefix, "payment.create", (req, scope) => {
    const data = body(req, ["orderId", "providerConnectionId", "amount", "currency", "channel", "method"]);
    return application.createPayment({ ...scope, orderId: data.orderId, connectionId: data.providerConnectionId,
      amount: data.amount, currency: data.currency, channel: data.channel, method: data.method, idempotencyKey: key(req) });
  });
  route("get", `${prefix}/:id`, "payment.get", (req, input) => application.getPayment(input));
  route("post", `${prefix}/:id/refresh`, "payment.refresh", (req,input) => { body(req,[]);return application.refreshPayment({...input,requestId:req.requestId,...(req.get('x-actor-user-id')?{actorId:d.identifier(req.get('x-actor-user-id'))}:{})}); });
  route("get", `${prefix}/:id/refunds`, "refund.list", (req, input) => application.getRefunds(input));
  route("post", `${prefix}/:id/refunds/:refundId/refresh`, "refund.refresh", (req,input) => {
    body(req,[]);return application.refreshRefund({...input,refundId:d.identifier(req.params.refundId),requestId:req.requestId});
  });
  for (const operation of ["capture", "cancel", "refunds"]) {
    route("post", `${prefix}/:id/${operation}`, `payment.${operation}`, (req, input) => {
      const data = body(req, operation === "cancel" ? [] : operation === "capture" ? ["amount", "currency"] : ["amount", "currency", "reason"]);
      if (operation !== "cancel") { d.amount(data.amount); d.currency(data.currency); }
      if (data.reason !== undefined) d.text(data.reason, 255);
      return application.providerOperation({ ...input, ...data, operation, idempotencyKey: key(req),requestId:req.requestId });
    });
  }
  app.use((req, res, next) => next(new d.PaymentError("PAYMENT_ROUTE_NOT_FOUND")));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const normalized = errorContract(error);
    if(req.path==='/webhooks/yookassa'){
      application.delivery.noteRejected(normalized.code);
      console.warn(JSON.stringify({operation:'webhook.accept',requestId:req.requestId,sourceIp:req.ip,result:'rejected',causeCode:normalized.code}));
    }
    res.status(normalized.status).json({ ok: false, error: { code: normalized.code,
      message: normalized.code, requestId: req.requestId } });
  });
  return app;
}
function start() {
  let config;
  try { config = loadConfig(); } catch (error) {
    console.error(error.message); process.exitCode = 1; return;
  }
  const db = mysql.createPool(config.db);
  const application = createApplication(db,config);
  const app = createApp(config, application, application.connections);
  const server = app.listen(config.port, config.host, () => {
    application.delivery.start();
    application.reconciliation.start();
    console.info(JSON.stringify({level:"INFO",operation:"service.start",port:config.port}));
  });
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    application.beginShutdown();
    const workersStopped=Promise.allSettled([application.delivery.stop(),application.reconciliation.stop()]);
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      console.error(JSON.stringify({ level: "ERROR", operation: "service.shutdown", result: "deadline_exceeded" }));
      process.exit(1);
    }, config.shutdownMs);
    server.close(async () => {
      try {
        const workers=await workersStopped;
        await db.end();
        if(workers.some(result=>result.status==="rejected"))throw new Error("WORKER_STOP_FAILED");
        clearTimeout(deadline);
        console.info(JSON.stringify({ level: "INFO", operation: "service.shutdown", result: "completed" }));
      } catch {
        clearTimeout(deadline);
        console.error(JSON.stringify({ level: "ERROR", operation: "service.shutdown", result: "pool_close_failed" }));
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  }
  server.on("error", async () => {
    console.error(JSON.stringify({ level: "ERROR", operation: "service.start", result: "listen_failed" }));
    process.exitCode = 1;
    await application.delivery.stop();
    await application.reconciliation.stop();
    await db.end();
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
if (require.main === module) start();
module.exports = { createApp, start };
