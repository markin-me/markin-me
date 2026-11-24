'use strict';

// Explicit additive migration; no startup DDL, no history/order deletion.
module.exports=async function migrateChatGuestSessions(db){
  const [[scope]]=await db.query('SELECT DATABASE() name');
  if(scope.name!=='a1186497_test')throw new Error('CHAT_GUEST_SESSIONS_DB_SCOPE_REFUSED');
  const [columns]=await db.query('SHOW COLUMNS FROM chat_visitor_identities');
  const fields={session_group_key:'VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL',session_number:'INT UNSIGNED NULL',
    dialog_phone:'VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL',session_started_at:'DATETIME(6) NULL',
    session_completed_at:'DATETIME(6) NULL',completion_reason:'VARCHAR(32) NULL',session_deleted_at:'DATETIME(6) NULL'};
  for(const [name,ddl] of Object.entries(fields))if(!columns.some(column=>column.Field===name)){
    await db.query(`ALTER TABLE chat_visitor_identities ADD COLUMN ${name} ${ddl}`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS chat_guest_session_counters (
    tenant_id INT NOT NULL,group_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    last_number INT UNSIGNED NOT NULL DEFAULT 0,PRIMARY KEY(tenant_id,group_key)) ENGINE=InnoDB`);
  await db.query(`INSERT INTO chat_guest_session_counters (tenant_id,group_key,last_number)
    SELECT tenant_id,session_group_key,MAX(session_number) FROM chat_visitor_identities
    WHERE session_group_key IS NOT NULL AND session_number IS NOT NULL GROUP BY tenant_id,session_group_key
    ON DUPLICATE KEY UPDATE last_number=GREATEST(last_number,VALUES(last_number))`);
  const [legacy]=await db.query(`SELECT v.tenant_id,v.client_id,MIN(m.created_at) started_at FROM chat_visitor_identities v
    JOIN chat_threads t ON t.tenant_id=v.tenant_id AND t.client_id=v.client_id
    JOIN chat_messages m ON m.tenant_id=t.tenant_id AND m.client_id=t.client_id
    WHERE v.claimed_at IS NULL AND v.session_started_at IS NULL GROUP BY v.tenant_id,v.client_id
    ORDER BY started_at,v.client_id`);
  const sessions=require('../api/helpers/customerChatSessions');
  for(const row of legacy){
    const conn=typeof db.getConnection==='function'?await db.getConnection():db;
    try{await conn.beginTransaction();await sessions.start(conn,row.tenant_id,row.client_id,{legacyAt:row.started_at});await conn.commit();}
    catch(error){await conn.rollback();throw error;}finally{if(conn!==db)conn.release();}
  }
};
