"use strict";

const {createHash,randomUUID} = require("node:crypto");
const proxyaddr = require("proxy-addr");
const d = require("./payment-domain");
const {createDurableQueue} = require("./durable-queue");
const EVENTS = new Set(["payment.succeeded","payment.canceled","payment.waiting_for_capture","refund.succeeded"]);
const REFS = ["internalPaymentId","tenantReference","storeReference","orderReference"];
function references(value) {
  const result={};
  if (value && typeof value === "object" && !Array.isArray(value)) for (const key of REFS)
    if (typeof value[key] === "string" && /^[1-9][0-9]{0,9}$/.test(value[key])) result[key]=value[key];
  return result;
}
function createWebhookDelivery(db,config,operations) {
  let invalidTotal=0;
  const allowSource=proxyaddr.compile(config.webhookSourceCidrs);
  function sourceAllowed(ip) {try{return allowSource(ip);}catch{return false;}}
  async function accept(payload) {
    if (!config.webhooksEnabled) d.fail("PAYMENT_SERVICE_NOT_READY");
    if (!payload || payload.type!=="notification" || typeof payload.event!=="string"
      || !payload.object || typeof payload.object!=="object" || Array.isArray(payload.object)
      || typeof payload.object.id!=="string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.object.id)
      || typeof payload.object.status!=="string") d.fail("PAYMENT_INPUT_INVALID");
    if (!EVENTS.has(payload.event)) d.fail("PAYMENT_WEBHOOK_EVENT_UNSUPPORTED");
    if(payload.object.status!==payload.event.slice(payload.event.indexOf('.')+1))d.fail("PAYMENT_INPUT_INVALID");
    const refs=references(payload.object.metadata);
    if(payload.event==='refund.succeeded' && typeof payload.object.payment_id==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.object.payment_id))refs.providerPaymentId=payload.object.payment_id;
    // Persist only identity hints. Body/card/authorization/credentials never enter the Inbox.
    const sanitized=JSON.stringify({event:payload.event,objectId:payload.object.id,references:refs});
    const hash=createHash("sha256").update(sanitized).digest("hex"),requestId=randomUUID();
    const [insert]=await db.query(`INSERT INTO payment_webhook_inbox
      (provider,event_type,object_id,references_json,payload_hash,request_id,available_at,created_at,updated_at)
      VALUES ('yookassa',?,?,?,?,?,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
      ON DUPLICATE KEY UPDATE duplicate_count=duplicate_count+1`,[payload.event,payload.object.id,JSON.stringify(refs),hash,requestId]);
    console.info(JSON.stringify({operation:"webhook.accept",requestId,event:payload.event,providerObjectId:payload.object.id,
      duplicate:insert.affectedRows!==1,result:"persisted"}));
  }
  async function processInbox(row) {
    if(row.event_type==='refund.succeeded') {
      const [refunds]=await db.query(`SELECT r.id,r.payment_id,r.tenant_id,p.store_id FROM payment_refunds r
        JOIN payment_payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id
        WHERE p.provider='yookassa' AND r.provider_refund_id=? LIMIT 2`,[row.object_id]);
      if(!refunds.length) {
        const refs=typeof row.references_json==='string'?JSON.parse(row.references_json):row.references_json;
        const [parents]=await db.query("SELECT id,tenant_id,store_id FROM payment_payments WHERE provider='yookassa' AND provider_payment_id=? LIMIT 2",[refs?.providerPaymentId || '']);
        if(parents.length!==1)throw Object.assign(new Error(),{code:parents.length?'PAYMENT_WEBHOOK_AMBIGUOUS':'PAYMENT_WEBHOOK_UNMATCHED'});
        const p=parents[0];await operations.importRefund({tenantId:String(p.tenant_id),storeId:String(p.store_id),paymentId:String(p.id),providerRefundId:row.object_id,
          webhookMetadata:{webhook_inbox_id:String(row.id),request_id:row.request_id}});return;
      }
      if(refunds.length!==1)throw Object.assign(new Error(),{code:'PAYMENT_WEBHOOK_AMBIGUOUS'});
      const refund=refunds[0];
      await operations.refreshRefund({tenantId:String(refund.tenant_id),storeId:String(refund.store_id),
        paymentId:String(refund.payment_id),refundId:String(refund.id),source:'provider',
        webhookMetadata:{webhook_inbox_id:String(row.id),webhook_event:row.event_type,request_id:row.request_id}});
      return;
    }
    let [matches]=await db.query("SELECT * FROM payment_payments WHERE provider='yookassa' AND provider_payment_id=? LIMIT 2",[row.object_id]);
    const refs=typeof row.references_json==="string"?JSON.parse(row.references_json):row.references_json;
    let fallback=false;
    if (!matches.length && REFS.every(key=>refs?.[key])) {
      [matches]=await db.query(`SELECT * FROM payment_payments WHERE provider='yookassa' AND id=? AND tenant_id=?
        AND store_id=? AND order_id=? AND provider_payment_id IS NULL`,
      [refs.internalPaymentId,refs.tenantReference,refs.storeReference,refs.orderReference]);
      fallback=true;
    }
    if (matches.length!==1) throw Object.assign(new Error(),{code:matches.length?"PAYMENT_WEBHOOK_AMBIGUOUS":"PAYMENT_WEBHOOK_UNMATCHED"});
    const payment=matches[0];
    console.info(JSON.stringify({operation:"webhook.verify",inboxId:String(row.id),requestId:row.request_id,
      paymentId:String(payment.id),orderId:String(payment.order_id),tenantId:String(payment.tenant_id),providerObjectId:row.object_id}));
    await operations.get({tenantId:String(payment.tenant_id),storeId:String(payment.store_id),paymentId:String(payment.id),
      ...(fallback?{webhookProviderId:row.object_id}:{}),
      webhookMetadata:{webhook_inbox_id:String(row.id),webhook_event:row.event_type,request_id:row.request_id}});
  }
  async function deliver(row) {
    const payload={eventId:row.event_id,type:"payment.changed",tenantId:String(row.tenant_id),storeId:String(row.store_id),
      orderId:String(row.order_id),paymentId:String(row.payment_id),paymentVersion:Number(row.payment_version)};
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config.deliveryTimeoutMs);
    try {
      const response=await fetch(config.mainEventsUrl,{method:"POST",redirect:"error",signal:controller.signal,
        headers:{"content-type":"application/json","x-payment-service-token":config.token,"x-request-id":row.event_id},body:JSON.stringify(payload)});
      // Only this precise ACK means that the Order transaction has committed.
      const reader=response.body?.getReader();let size=0,chunks=[];
      if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();throw Object.assign(new Error(),{code:"PAYMENT_DELIVERY_INVALID_ACK"});}chunks.push(Buffer.from(part.value));}
      let ack;try{ack=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Object.assign(new Error(),{code:"PAYMENT_DELIVERY_INVALID_ACK"});}
      if(response.status!==200 || ack.ok!==true || ack.eventId!==row.event_id)
        throw Object.assign(new Error(),{code:"PAYMENT_DELIVERY_NOT_ACKNOWLEDGED"});
    } catch(error){
      if(!error.code)error.code=controller.signal.aborted?"PAYMENT_DELIVERY_TIMEOUT":"PAYMENT_DELIVERY_UNAVAILABLE";
      throw error;
    } finally {clearTimeout(timer);}
  }
  const inbox=createDurableQueue(db,"payment_webhook_inbox",processInbox,config);
  const outbox=createDurableQueue(db,"payment_event_outbox",deliver,config);
  async function stats() {
    const result={invalidSinceStart:invalidTotal};
    for(const table of ["payment_webhook_inbox","payment_event_outbox"]){
      const [rows]=await db.query(`SELECT status,COUNT(*) AS count,MIN(created_at) AS oldest,MAX(error_code) AS errorCode,
        AVG(TIMESTAMPDIFF(SECOND,created_at,processed_at)) AS averageDeliverySeconds FROM ${table} GROUP BY status`);
      result[table]=rows;
    }
    const [duplicates]=await db.query("SELECT COALESCE(SUM(duplicate_count),0) AS duplicates FROM payment_webhook_inbox");
    result.duplicates=duplicates[0].duplicates;
    return result;
  }
  async function replay(queue,id,input) {
    const table={inbox:"payment_webhook_inbox",outbox:"payment_event_outbox"}[queue];
    if(!table)d.fail("PAYMENT_INPUT_INVALID");
    if(!/^[1-9][0-9]{0,19}$/.test(String(id)) || BigInt(id)>18446744073709551615n)d.fail('PAYMENT_INPUT_INVALID');
    const tenant=d.identifier(input.tenantId),actor=d.identifier(input.actorId),conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      const [users]=await conn.query("SELECT id FROM app_users WHERE tenant_id=? AND id=? AND is_active=1 AND role IN ('owner','admin')",[tenant,actor]);
      if(!users.length)d.fail('PAYMENT_SERVICE_UNAUTHORIZED');
      const scope=queue==='outbox'?"tenant_id=?":`EXISTS(SELECT 1 FROM payment_payments p WHERE p.tenant_id=? AND p.provider='yookassa'
        AND ((payment_webhook_inbox.event_type LIKE 'payment.%' AND p.provider_payment_id=payment_webhook_inbox.object_id)
        OR (payment_webhook_inbox.event_type='refund.succeeded' AND (p.provider_payment_id=JSON_UNQUOTE(JSON_EXTRACT(payment_webhook_inbox.references_json,'$.providerPaymentId'))
        OR EXISTS(SELECT 1 FROM payment_refunds r WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id AND r.provider_refund_id=payment_webhook_inbox.object_id)))))`;
      const [result]=await conn.query(`UPDATE ${table} SET status='pending',attempts=0,error_code=NULL,available_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6)
        WHERE id=? AND status='dead' AND lease_token IS NULL AND ${scope}`,[id,tenant]);
      if(!result.affectedRows)d.fail('PAYMENT_INVALID_STATE');
      await conn.query(`INSERT INTO payment_operational_audit (tenant_id,actor_user_id,request_id,action,entity_id,created_at)
        VALUES (?,?,?,?,?,UTC_TIMESTAMP(6))`,[tenant,actor,input.requestId,`${queue}.replay`,String(id)]);
      await conn.commit();
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    console.warn(JSON.stringify({operation:"payment.queue.replay",tenantId:tenant,queue,jobId:String(id),actorId:actor,requestId:input.requestId,result:"scheduled"}));
    return {scheduled:true};
  }
  return {get runtime(){return {inbox:inbox.runtime,outbox:outbox.runtime};},accept,sourceAllowed,stats,replay,noteRejected(code){
    if(['PAYMENT_INPUT_INVALID','PAYMENT_WEBHOOK_SOURCE_FORBIDDEN','PAYMENT_WEBHOOK_EVENT_UNSUPPORTED'].includes(code))invalidTotal++;
  },start(){if(config.webhooksEnabled)inbox.start();if(config.outboxEnabled)outbox.start();},
    async stop(){await Promise.all([inbox.stop(),outbox.stop()]);}};
}
module.exports={createWebhookDelivery,references};
