'use strict';

const express=require('express');
const {createHash,timingSafeEqual}=require('node:crypto');

// This endpoint is private service-to-service traffic, never a browser/JWT API.
module.exports=function makePaymentEventsRouter(){
  const router=express.Router();
  router.post('/',(req,res,next)=>{
    const expected=process.env.PAYMENT_SERVICE_INTERNAL_TOKEN,supplied=req.get('x-payment-service-token');
    const hash=value=>createHash('sha256').update(value).digest();
    if(typeof expected!=='string' || expected.length<32)return res.status(503).json({ok:false,error:'PAYMENT_CONSUMER_NOT_CONFIGURED'});
    if(typeof supplied!=='string' || !timingSafeEqual(hash(expected),hash(supplied)))return res.status(401).json({ok:false,error:'PAYMENT_SERVICE_UNAUTHORIZED'});
    if(!req.is('application/json'))return res.status(415).json({ok:false,error:'PAYMENT_INPUT_INVALID'});
    next();
  },express.json({limit:'4kb',strict:true}),async(req,res)=>{
    const event=req.body,keys=['eventId','type','tenantId','storeId','orderId','paymentId','paymentVersion'];
    if(!event || typeof event!=='object' || Array.isArray(event) || Object.keys(event).some(key=>!keys.includes(key))
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(event.eventId || '')
      || event.type!=='payment.changed' || !['tenantId','storeId','orderId','paymentId'].every(key=>typeof event[key]==='string' && /^[1-9][0-9]{0,9}$/.test(event[key]) && Number(event[key])<=2147483647)
      || !Number.isSafeInteger(event.paymentVersion) || event.paymentVersion<1)
      return res.status(400).json({ok:false,error:'PAYMENT_INPUT_INVALID'});
    try{
      const synchronize=req.app.get('synchronizeOrderOnlinePayment');
      if(typeof synchronize!=='function')return res.status(503).json({ok:false,error:'PAYMENT_CONSUMER_NOT_READY'});
      await synchronize({tenant_id:event.tenantId,store_id:event.storeId,id:event.orderId},null,event);
      res.set('cache-control','no-store').json({ok:true,eventId:event.eventId});
    }catch(error){
      console.warn(JSON.stringify({operation:'payment.event.consume',eventId:event.eventId,orderId:event.orderId,
        result:'retry',causeCode:/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code || '')?error.code:'PAYMENT_CONSUMER_FAILED'}));
      res.status(503).json({ok:false,error:'PAYMENT_CONSUMER_NOT_READY'});
    }
  });
  router.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    res.status(error.type==='entity.too.large'?413:400).json({ok:false,error:'PAYMENT_INPUT_INVALID'});
  });
  return router;
};
