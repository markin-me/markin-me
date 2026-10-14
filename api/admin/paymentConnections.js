"use strict";

const express = require("express");
const { paymentPermissions } = require("../middleware/auth");
const { randomUUID } = require("node:crypto");

module.exports = function makePaymentConnectionsRouter({db}) {
  const router = express.Router();
  router.use(async (req,res,next) => {
    try {
      const permissions = await paymentPermissions(req.user);
      const required = ["GET", "HEAD"].includes(req.method) ? "read" : "manage";
      if (!permissions[required]) return res.status(403).json({ok:false,error:"FORBIDDEN"});
      req.paymentPermissions = permissions;
      next();
    } catch(error) {
      const unavailable = ["ETIMEDOUT","ECONNREFUSED","ECONNRESET","PROTOCOL_CONNECTION_LOST","ER_CON_COUNT_ERROR"].includes(error.code);
      console.error(JSON.stringify({operation:"payment.permissions",code:unavailable ? error.code : "PAYMENT_INTERNAL_ERROR"}));
      res.status(unavailable ? 503 : 500).json({ok:false,error:unavailable ? "PAYMENT_DATABASE_UNAVAILABLE" : "PAYMENT_INTERNAL_ERROR"});
    }
  });
  function handle(method,path,operation) {
    router[method](path,async(req,res)=>{
      try {
        if(req.path.startsWith("/operations/") && !req.paymentPermissions.manage)return res.status(403).json({ok:false,error:"FORBIDDEN"});
        const client = req.app.get("paymentServiceClient");
        const context = {tenantId:req.user.tenantId,storeId:1,actorId:req.user.userId,
          connectionId:req.params.id,requestId:randomUUID()};
        if (method!=="get" && (!req.is("application/json") || !req.body || typeof req.body!=="object" || Array.isArray(req.body)))
          return res.status(400).json({ok:false,error:"PAYMENT_INPUT_INVALID"});
        const data = await client[operation](context,req.body);
        res.set("cache-control","no-store").json({ok:true,data,permissions:req.paymentPermissions});
      } catch(error) {
        const code = typeof error.code==="string" && /^PAYMENT_[A-Z_]+$/.test(error.code) ? error.code : "PAYMENT_INTERNAL_ERROR";
        res.status(error.status || 500).json({ok:false,error:code});
      }
    });
  }
  router.post('/operations/payments/:paymentId/refresh',async(req,res)=>{
    if(!req.paymentPermissions.manage)return res.status(403).json({ok:false,error:'FORBIDDEN'});
    const paymentId=String(req.params.paymentId),storeId=String(req.body?.storeId ?? '');
    if(!req.is('application/json') || !/^[1-9][0-9]{0,9}$/.test(paymentId) || !/^[1-9][0-9]{0,9}$/.test(storeId)
      || Object.keys(req.body || {}).some(key=>key!=='storeId'))return res.status(400).json({ok:false,error:'PAYMENT_INPUT_INVALID'});
    const requestId=randomUUID();
    try {
      const data=await req.app.get('paymentServiceClient').refreshPayment({tenantId:req.user.tenantId,storeId,paymentId,
        actorId:req.user.userId,requestId,idempotencyKey:requestId});
      console.info(JSON.stringify({operation:'payment.support.refresh',actorId:req.user.userId,tenantId:req.user.tenantId,storeId,paymentId,requestId,result:'completed'}));
      res.set('cache-control','no-store').json({ok:true,data});
    }catch(error){
      const code=/^PAYMENT_[A-Z_]+$/.test(error.code || '')?error.code:'PAYMENT_INTERNAL_ERROR';
      console.warn(JSON.stringify({operation:'payment.support.refresh',actorId:req.user.userId,tenantId:req.user.tenantId,storeId,paymentId,requestId,result:code}));
      res.status(error.status || 500).json({ok:false,error:code});
    }
  });
  handle("get","/operations/status","getOperationalStatus");
  router.post('/operations/refunds/import',async(req,res)=>{
    const value=req.body;
    if(!req.paymentPermissions.manage)return res.status(403).json({ok:false,error:'FORBIDDEN'});
    if(!req.is('application/json') || !value || value.confirmed!==true || !/^[1-9][0-9]{0,9}$/.test(String(value.storeId))
      || !/^[1-9][0-9]{0,9}$/.test(String(value.paymentId)) || typeof value.providerRefundId!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.providerRefundId)
      || Object.keys(value).some(key=>!['storeId','paymentId','providerRefundId','confirmed'].includes(key)))return res.status(400).json({ok:false,error:'PAYMENT_INPUT_INVALID'});
    try {
      const requestId=randomUUID(),data=await req.app.get('paymentServiceClient').importExternalRefund({tenantId:req.user.tenantId,storeId:value.storeId,actorId:req.user.userId,requestId,idempotencyKey:requestId},
        {paymentId:String(value.paymentId),providerRefundId:value.providerRefundId,confirmed:true});
      res.set('cache-control','no-store').json({ok:true,data});
    }catch(error){res.status(error.status || 500).json({ok:false,error:/^PAYMENT_[A-Z_]+$/.test(error.code || '')?error.code:'PAYMENT_INTERNAL_ERROR'});}
  });
  router.post('/operations/replay',async(req,res)=>{
    const value=req.body;
    if(!req.paymentPermissions.manage)return res.status(403).json({ok:false,error:'FORBIDDEN'});
    if(!req.is('application/json') || !value || value.confirmed!==true || !['inbox','outbox'].includes(value.queue)
      || !/^[1-9][0-9]{0,19}$/.test(String(value.id)) || BigInt(value.id)>18446744073709551615n
      || Object.keys(value).some(key=>!['queue','id','confirmed'].includes(key)))return res.status(400).json({ok:false,error:'PAYMENT_INPUT_INVALID'});
    try {
      const requestId=randomUUID();const data=await req.app.get('paymentServiceClient').replayDelivery({tenantId:req.user.tenantId,storeId:1,actorId:req.user.userId,requestId,idempotencyKey:requestId},value);
      res.set('cache-control','no-store').json({ok:true,data});
    }catch(error){res.status(error.status || 500).json({ok:false,error:/^PAYMENT_[A-Z_]+$/.test(error.code || '')?error.code:'PAYMENT_INTERNAL_ERROR'});}
  });
  handle("get","/providers","getProviders");
  handle("get","/","getConnections");
  handle("get","/:id","getConnection");
  handle("get","/:id/webhook","getConnectionWebhookInfo");
  handle("post","/","createConnection");
  handle("patch","/:id","updateConnection");
  handle("post","/:id/archive","archiveConnection");
  handle("post","/:id/verify","verifyConnection");
  handle("post","/:id/secret","revealConnectionSecret");
  return router;
};
