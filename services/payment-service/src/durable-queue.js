"use strict";

const {randomUUID} = require("node:crypto");
const TABLES = new Set(["payment_webhook_inbox", "payment_event_outbox"]);
function safeCode(error) {
  return typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : "PAYMENT_WORKER_FAILED";
}
// Conditional UPDATE is the claim: a SELECT candidate alone never owns a job.
function createDurableQueue(db, table, work, config) {
  if (!TABLES.has(table)) throw new Error("INVALID_QUEUE");
  let stopped = true, timer, active = Promise.resolve(),lastCleanup=0,lastSuccessfulTick=null,lastErrorCode=null;
  async function tick() {
    const retention=table==='payment_webhook_inbox'?config.inboxRetentionDays:config.outboxRetentionDays;
    if(retention && Date.now()-lastCleanup>=3600000) {
      const [result]=await db.query(`DELETE FROM ${table} WHERE status='done' AND lease_token IS NULL
        AND processed_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL ? DAY) ORDER BY id LIMIT 100`,[retention]);
      lastCleanup=Date.now();
      console.info(JSON.stringify({operation:'payment.queue.retention',queue:table,deleted:result.affectedRows}));
    }
    const [rows] = await db.query(`SELECT * FROM ${table}
      WHERE (status='pending' AND available_at<=UTC_TIMESTAMP(6))
      OR (status='processing' AND lease_until<UTC_TIMESTAMP(6)) ORDER BY id LIMIT 1`);
    const row = rows[0];
    if (!row || stopped) return;
    const token = randomUUID();
    const [claim] = await db.query(`UPDATE ${table} SET status='processing',lease_token=?,
      lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND),attempts=attempts+1,updated_at=UTC_TIMESTAMP(6)
      WHERE id=? AND ((status='pending' AND available_at<=UTC_TIMESTAMP(6)) OR
      (status='processing' AND lease_until<UTC_TIMESTAMP(6)))`, [token,row.id]);
    if (!claim.affectedRows) return;
    const attempts = Number(row.attempts)+1;
    try {
      if (attempts > config.deliveryMaxAttempts) throw Object.assign(new Error(),{code:"PAYMENT_RETRY_EXHAUSTED",permanent:true});
      await work(row);
      await db.query(`UPDATE ${table} SET status='done',processed_at=UTC_TIMESTAMP(6),error_code=NULL,
        lease_token=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND lease_token=?`,[row.id,token]);
      console.info(JSON.stringify({operation:table,jobId:String(row.id),requestId:row.request_id || row.event_id,
        tenantId:row.tenant_id,paymentId:row.payment_id,orderId:row.order_id,result:"done",attempts}));
    } catch (error) {
      const code=safeCode(error), dead=error.permanent || attempts>=config.deliveryMaxAttempts;
      const delay=Math.min(3600,2**Math.min(attempts,11))+Math.floor(Math.random()*5);
      await db.query(`UPDATE ${table} SET status=?,error_code=?,available_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),
        lease_token=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND lease_token=?`,[dead?"dead":"pending",code,delay,row.id,token]);
      console.warn(JSON.stringify({operation:table,jobId:String(row.id),requestId:row.request_id || row.event_id,
        tenantId:row.tenant_id,paymentId:row.payment_id,orderId:row.order_id,result:dead?"dead":"retry",causeCode:code,attempts}));
    }
  }
  function schedule() {
    if (stopped) return;
    timer=setTimeout(()=>{
      active=tick().then(()=>{lastSuccessfulTick=new Date().toISOString();lastErrorCode=null;}).catch(error=>{lastErrorCode=safeCode(error);console.error(JSON.stringify({operation:table,result:"queue_unavailable",causeCode:lastErrorCode}));}).finally(schedule);
    },config.deliveryPollMs);
    timer.unref();
  }
  return {get runtime(){return {running:!stopped,lastSuccessfulTick,lastErrorCode};},start(){if(stopped){stopped=false;schedule();}},async stop(){stopped=true;clearTimeout(timer);await active;}};
}
module.exports={createDurableQueue,safeCode};
