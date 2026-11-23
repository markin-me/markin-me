'use strict';

const {normalizePhone}=require('../helpers');
const fail=code=>{throw Object.assign(new Error(code),{status:409});};

async function read(conn,tenantId,id,lock=false){
  const [[row]]=await conn.query(`SELECT v.*, ((v.expires_at IS NULL OR v.expires_at>UTC_TIMESTAMP(6))
    AND (v.claimed_at IS NOT NULL OR v.guest_session_hash IS NULL OR EXISTS (SELECT 1 FROM cust_guest_sessions g
      WHERE g.tenant_id=v.tenant_id AND g.token_hash=v.guest_session_hash AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at>UTC_TIMESTAMP(6))))) access_valid
    FROM chat_visitor_identities v WHERE v.tenant_id=? AND v.client_id=?${lock?' FOR UPDATE':''}`,[tenantId,id]);
  return row || null;
}

async function start(conn,tenantId,id,{legacyAt=null}={}){
  const session=await read(conn,tenantId,id,true);
  if(!session)return null;
  if(legacyAt && (session.claimed_at || session.session_started_at || session.session_deleted_at))return session;
  if(!legacyAt && (session.claimed_at || session.session_completed_at || session.session_deleted_at || !Number(session.access_valid)))fail('CHAT_SESSION_COMPLETED');
  const [[guest]]=session.guest_session_hash ? await conn.query(
    'SELECT phone FROM cust_guest_sessions WHERE tenant_id=? AND token_hash=?',[tenantId,session.guest_session_hash]) : [[]];
  const phone=normalizePhone(guest?.phone || session.dialog_phone || '');
  const group=phone?`phone:${phone}`:`visitor:${id}`;
  await conn.query(`UPDATE chat_visitor_identities SET session_group_key=?,dialog_phone=?,
    session_started_at=COALESCE(session_started_at,?),expires_at=COALESCE(expires_at,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 400 DAY))
    WHERE tenant_id=? AND client_id=?`,[group,phone || null,legacyAt || new Date(),tenantId,id]);
  return {...session,session_group_key:group,dialog_phone:phone};
}

async function complete(conn,tenantId,id,reason='context_changed'){
  const session=await read(conn,tenantId,id,true);
  if(!session || session.claimed_at || session.session_deleted_at)return false;
  const [updated]=await conn.query(`UPDATE chat_visitor_identities SET session_completed_at=COALESCE(session_completed_at,UTC_TIMESTAMP(6)),
    completion_reason=COALESCE(completion_reason,?),expires_at=UTC_TIMESTAMP(6),active_session_id=NULL
    WHERE tenant_id=? AND client_id=? AND claimed_at IS NULL AND session_deleted_at IS NULL`,[reason,tenantId,id]);
  if(!updated.affectedRows)return false;
  await conn.query("DELETE FROM chat_push_subscriptions WHERE tenant_id=? AND client_id=? AND actor='in'",[tenantId,id]);
  return true;
}

async function refreshExpired(db,tenantId){
  const [rows]=await db.query(`SELECT v.client_id FROM chat_visitor_identities v
    LEFT JOIN cust_guest_sessions g ON g.tenant_id=v.tenant_id AND g.token_hash=v.guest_session_hash
    WHERE v.tenant_id=? AND v.claimed_at IS NULL AND v.session_started_at IS NOT NULL
      AND v.session_completed_at IS NULL AND v.session_deleted_at IS NULL
      AND (v.expires_at<=UTC_TIMESTAMP(6) OR g.expires_at<=UTC_TIMESTAMP(6) OR g.revoked_at IS NOT NULL) LIMIT 200`,[tenantId]);
  const changed=[];
  for(const row of rows){
    const conn=await db.getConnection();
    try{
      await conn.beginTransaction();
      const current=await read(conn,tenantId,row.client_id,true);
      const [[due]]=await conn.query(`SELECT 1 FROM chat_visitor_identities v
        LEFT JOIN cust_guest_sessions g ON g.tenant_id=v.tenant_id AND g.token_hash=v.guest_session_hash
        WHERE v.tenant_id=? AND v.client_id=? AND v.claimed_at IS NULL AND v.session_completed_at IS NULL
          AND (v.expires_at<=UTC_TIMESTAMP(6) OR g.expires_at<=UTC_TIMESTAMP(6) OR g.revoked_at IS NOT NULL)`,[tenantId,row.client_id]);
      if(current && due && await complete(conn,tenantId,row.client_id,'access_expired'))changed.push(row.client_id);
      await conn.commit();
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
  return changed;
}

async function assertWritable(conn,tenantId,id){
  const session=await read(conn,tenantId,id,true);
  if(!session){
    const [[customer]]=await conn.query('SELECT id FROM cust_customers WHERE tenant_id=? AND id=?',[tenantId,id]);
    if(!customer)fail('CHAT_SESSION_UNRESOLVED');
  }
  if(session && !session.claimed_at && (session.session_completed_at || session.session_deleted_at || !Number(session.access_valid)))fail('CHAT_SESSION_COMPLETED');
  return session;
}

async function assertDeletable(conn,tenantId,id,automatic=false){
  const [[policy]]=await conn.query('SELECT chat_guest_thread_ttl_days days FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
  const session=await read(conn,tenantId,id,true);
  if(!session || session.claimed_at || !session.session_completed_at || session.session_deleted_at)fail('CHAT_SESSION_DELETE_FORBIDDEN');
  const days=Math.max(0,Number(policy?.days)||0);
  if(automatic && !days)fail('CHAT_SESSION_RETENTION_UNLIMITED');
  if(days){
    const [[due]]=await conn.query(`SELECT 1 FROM chat_visitor_identities WHERE tenant_id=? AND client_id=?
      AND session_completed_at<=UTC_TIMESTAMP(6)-INTERVAL ? DAY`,[tenantId,id,days]);
    if(!due)fail('CHAT_SESSION_RETENTION_PENDING');
  }
  return session;
}

async function decorate(db,tenantId,rows){
  if(!rows.length)return rows;
  const ids=rows.map(row=>row.client_id);
  const [sessions]=await db.query(`SELECT v.*,tenant.chat_guest_thread_ttl_days retention_days,
    (v.session_completed_at IS NOT NULL AND (COALESCE(tenant.chat_guest_thread_ttl_days,0)=0
      OR v.session_completed_at<=UTC_TIMESTAMP(6)-INTERVAL tenant.chat_guest_thread_ttl_days DAY)) can_delete,
    (SELECT c.id FROM cust_customers c WHERE c.tenant_id=v.tenant_id AND c.phone=v.dialog_phone COLLATE utf8mb4_general_ci
      AND c.is_active=1 ORDER BY c.id LIMIT 1) profile_customer_id
    FROM chat_visitor_identities v JOIN ten_tenants tenant ON tenant.id=v.tenant_id
    WHERE v.tenant_id=? AND v.client_id IN (${ids.map(()=>'?').join(',')})`,[tenantId,...ids]);
  const byId=new Map(sessions.map(session=>[String(session.client_id),session]));
  for(const row of rows){
    const session=byId.get(String(row.client_id));
    const phone=normalizePhone(session?.dialog_phone || row.meta?.phone || '');
    row.group_key=session?(session.session_group_key || `visitor:${row.client_id}`)
      :phone?`phone:${phone}`:`customer:${row.client_id}`;
    row.session_state=session?(session.session_completed_at?'completed':'active'):row.client_state==='authorized'?'main':'legacy';
    if(row.session_state==='legacy')row.group_key=`legacy:${row.client_id}`;
    row.session_can_delete=Boolean(session && !session.claimed_at && !session.session_deleted_at && Number(session.can_delete));
    row.profile_customer_id=session?Number(session.profile_customer_id)||null:row.client_state==='authorized'?Number(row.client_id):null;
  }
  return rows;
}

async function groupPage(db,tenantId,{limit=50,offset=0,cursor=null,query=''}={}){
  // Catch legacy rows written by an older process between migration and restart.
  const [legacy]=await db.query(`SELECT v.client_id,MIN(m.created_at) started_at FROM chat_visitor_identities v
    JOIN chat_threads t ON t.tenant_id=v.tenant_id AND t.client_id=v.client_id
    JOIN chat_messages m ON m.tenant_id=t.tenant_id AND m.client_id=t.client_id
    WHERE v.tenant_id=? AND v.claimed_at IS NULL AND v.session_started_at IS NULL AND v.session_deleted_at IS NULL
    GROUP BY v.client_id ORDER BY started_at,v.client_id`,[tenantId]);
  for(const row of legacy){
    const conn=await db.getConnection();
    try{await conn.beginTransaction();await start(conn,tenantId,row.client_id,{legacyAt:row.started_at});await conn.commit();}
    catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
  const key=`COALESCE(CONVERT(v.session_group_key USING utf8mb4) COLLATE utf8mb4_unicode_ci,IF(NULLIF(c.phone,'') IS NOT NULL,CONCAT('phone:',c.phone COLLATE utf8mb4_unicode_ci),
    CONCAT(IF(v.client_id IS NULL,IF(c.id IS NULL,'legacy:','customer:'),'visitor:'),t.client_id)))`;
  const from=`FROM chat_threads t LEFT JOIN chat_visitor_identities v ON v.tenant_id=t.tenant_id AND v.client_id=t.client_id
    LEFT JOIN cust_customers c ON c.tenant_id=t.tenant_id AND c.id=t.client_id
    LEFT JOIN cust_guest_sessions g ON g.tenant_id=v.tenant_id AND g.token_hash=v.guest_session_hash
    LEFT JOIN cust_customers pc ON pc.tenant_id=t.tenant_id AND pc.phone=COALESCE(v.dialog_phone,g.phone) COLLATE utf8mb4_general_ci
    WHERE t.tenant_id=? AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.tenant_id=t.tenant_id AND m.client_id=t.client_id)
      AND (v.client_id IS NULL OR (v.claimed_at IS NULL AND v.session_deleted_at IS NULL AND v.session_started_at IS NOT NULL))`;
  const search=String(query || '').trim().slice(0,120);
  const params=[tenantId];
  const searchClause=search?` AND (COALESCE(c.name COLLATE utf8mb4_unicode_ci,pc.name COLLATE utf8mb4_unicode_ci,t.meta_name,'') LIKE ?
    OR COALESCE(c.phone COLLATE utf8mb4_unicode_ci,v.dialog_phone,g.phone,t.meta_phone,'') LIKE ?)` : '';
  if(search)params.push(`%${search}%`,`%${search}%`);
  const cursorClause=cursor?'WHERE (updated_at<? OR (updated_at=? AND client_id<?))':'';
  if(cursor)params.push(cursor.updatedAt,cursor.updatedAt,cursor.clientId);
  params.push(limit+1,offset);
  const [groups]=await db.query(`SELECT * FROM (SELECT ${key} group_key,MAX(t.updated_at) updated_at,MAX(t.client_id) client_id
    ${from}${searchClause} GROUP BY group_key) grouped ${cursorClause} ORDER BY updated_at DESC,client_id DESC LIMIT ? OFFSET ?`,params);
  const page=groups.slice(0,limit);
  if(!page.length)return {ids:[],groups:[],hasMore:false};
  const [members]=await db.query(`SELECT DISTINCT t.client_id ${from} AND ${key} IN (${page.map(()=>'?').join(',')})`,[tenantId,...page.map(group=>group.group_key)]);
  return {ids:members.map(row=>String(row.client_id)),groups:page,hasMore:groups.length>limit};
}

module.exports={read,start,complete,refreshExpired,assertWritable,assertDeletable,decorate,groupPage};
