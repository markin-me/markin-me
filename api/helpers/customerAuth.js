'use strict';
const crypto=require('crypto');
const {MessengerAuthError}=require('../messengerAuth');
const {normalizePhone,parseTimezoneOffsetToMinutes}=require('../helpers');
const defaults=Object.freeze({birthday:false,tg:true,max:true});
const fail=(code,status=400)=>{throw new MessengerAuthError(code,status);};
async function settings(db,tenantId){
  const [[row]]=await db.query('SELECT customer_auth_config_json FROM ten_tenants WHERE id=? AND is_active=1',[tenantId]);
  if(!row)fail('TENANT_BLOCKED',403);
  const value=typeof row.customer_auth_config_json==='string'?JSON.parse(row.customer_auth_config_json):row.customer_auth_config_json;
  return validateSettings({...defaults,...value});
}
function validateSettings(value){
  if(!value || ['birthday','tg','max'].some(k=>typeof value[k]!=='boolean'))fail('INVALID_CUSTOMER_AUTH_SETTINGS');
  return {birthday:false,tg:value.tg,max:value.max};
}
function phone(value){const result=normalizePhone(value);if(!/^[0-9]{10,15}$/.test(result || ''))fail('PHONE_REQUIRED');return result;}
async function byPhone(db,tenantId,value){
  const [rows]=await db.query('SELECT id,phone,is_active,phone_verified_at FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 2',[tenantId,phone(value)]);
  if(rows.length>1)fail('CUSTOMER_PHONE_CONFLICT',409);
  if(rows[0]&&Number(rows[0].is_active)!==1)fail('ACCOUNT_NOT_AVAILABLE',403);
  return rows[0] || null;
}
const guestHash=token=>crypto.createHash('sha256').update(token).digest();
function guestCustomer(guest){return {id:null,is_guest:true,name:'\u0413\u043e\u0441\u0442\u044c',phone:guest.phone,photo:null};}
async function revokeGuest(db,tenantId,token){
  if(!/^g_[A-Za-z0-9_-]{43}$/.test(String(token)))return;
  const conn=await db.getConnection();
  const hash=guestHash(token);
  try{
    await conn.beginTransaction();
    await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
    await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE tenant_id=? AND account_type='customer' AND guest_session_hash=? AND state IN ('pending','started','confirmed')",[tenantId,hash]);
    await conn.query('UPDATE cust_guest_sessions SET revoked_at=NOW() WHERE tenant_id=? AND token_hash=? AND revoked_at IS NULL',[tenantId,hash]);
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}
  finally{conn.release();}
}
async function guestStoreOffset(db,tenantId,storeId){
  const [[store]]=await db.query(`SELECT s.timezone,t.timezone tenant_timezone FROM ten_stores s
    JOIN ten_tenants t ON t.id=s.tenant_id AND t.is_active=1
    WHERE s.tenant_id=? AND s.id=? AND s.is_active=1`,[tenantId,storeId]);
  if(!store)fail('STORE_NOT_AVAILABLE',403);
  const timezone=store.timezone&&store.timezone!=='+0'?store.timezone:store.tenant_timezone||'+0';
  return parseTimezoneOffsetToMinutes(timezone);
}
async function getGuest(db,tenantId,token,lock=false,storeId=1){
  if(!/^g_[A-Za-z0-9_-]{43}$/.test(String(token)))return null;
  await guestStoreOffset(db,tenantId,storeId);
  const [rows]=await db.query(`SELECT *,(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) valid,
      DATE_FORMAT(expires_at,'%Y-%m-%d %H:%i:%s') session_expires_at
    FROM cust_guest_sessions WHERE tenant_id=? AND token_hash=? AND revoked_at IS NULL${lock?' FOR UPDATE':''}`,[tenantId,guestHash(token)]);
  const row=rows[0];if(!row || !Number(row.valid))return null;
  row.addresses=typeof row.addresses_json==='string'?JSON.parse(row.addresses_json):(row.addresses_json || []);
  return row;
}
async function ensureGuestCustomer(db,tenantId,storeId,value){
  const normalized=phone(value);
  const select='SELECT id,is_active FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 2';
  const [existing]=await db.query(select,[tenantId,normalized]);
  if(existing.length>1)fail('CUSTOMER_PHONE_CONFLICT',409);
  if(existing.length)return Number(existing[0].is_active)===1 ? Number(existing[0].id) : null;
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
    let [rows]=await conn.query(select+' FOR UPDATE',[tenantId,normalized]);
    if(rows.length>1)fail('CUSTOMER_PHONE_CONFLICT',409);
    if(!rows.length){
      await conn.query(`INSERT INTO cust_customers (tenant_id,store_id,phone,guest_bonus_only,is_active)
        VALUES (?,?,?,1,1) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,[tenantId,storeId,normalized]);
      [rows]=await conn.query(select,[tenantId,normalized]);
      if(rows.length!==1)fail('CUSTOMER_PHONE_CONFLICT',409);
    }
    await conn.commit();
    return Number(rows[0].is_active)===1 ? Number(rows[0].id) : null;
  }catch(error){await conn.rollback();throw error;}
  finally{conn.release();}
}
async function marketingCustomerId(db,tenantId,token,storeId=1){
  const guest=await getGuest(db,tenantId,token,false,storeId);
  return guest ? ensureGuestCustomer(db,tenantId,storeId,guest.phone) : null;
}
async function createGuest(db,tenantId,value,existingToken,storeId=1){
  await guestStoreOffset(db,tenantId,storeId);
  const normalized=phone(value),existing=await getGuest(db,tenantId,existingToken,false,storeId);
  await ensureGuestCustomer(db,tenantId,storeId,normalized);
  const reuse=existing?.phone===normalized,token=reuse?existingToken:'g_'+crypto.randomBytes(32).toString('base64url');
  if(!reuse)await db.query(`INSERT INTO cust_guest_sessions (tenant_id,token_hash,phone,created_at,expires_at)
    VALUES (?,?,?,UTC_TIMESTAMP(),NULL)`,[tenantId,guestHash(token),normalized]);
  const guest=reuse?existing:await getGuest(db,tenantId,token,false,storeId);
  if(!guest)fail('GUEST_SESSION_EXPIRED',409);
  return {ok:true,token,customer:guestCustomer(guest),expires_at:guest.session_expires_at?guest.session_expires_at.replace(' ','T')+'Z':null};
}
async function guestAddresses(db,tenantId,token,method,id,body={},storeId=1){
  if(!['GET','POST','PUT','PATCH','DELETE'].includes(method) || (method==='POST'&&id) || (['PUT','PATCH','DELETE'].includes(method)&&!id))fail('INVALID_ADDRESS_OPERATION');
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();const guest=await getGuest(conn,tenantId,token,true,storeId);if(!guest)fail('UNAUTHORIZED',401);
    const addresses=guest.addresses;let result,changedId;
    if(method==='GET')result={ok:true,data:addresses};
    else{
      const index=addresses.findIndex(a=>String(a.id)===String(id));
      if(id && index<0)fail('ADDRESS_NOT_FOUND',404);
      if(method==='DELETE')addresses.splice(index,1);
      else if(body.default_only){addresses.forEach((a,i)=>a.is_default=i===index?1:0);}
      else{
        const address={};
        for(const key of ['city','street','house','entrance','floor','apartment','comment','address_ref','selected_object_type','resolved_city_source_key','address_context_locality','address_normalized_display']){
          const value=String(body[key] || '').trim();if(value.length>255)fail('ADDRESS_TOO_LONG');address[key]=value || null;
        }
        for(const [key,limit]of [['lat',90],['lng',180]]){
          const value=body[key];if(value==null||value==='')address[key]=null;
          else if(!Number.isFinite(Number(value))||Math.abs(Number(value))>limit)fail('INVALID_COORDINATES');else address[key]=Number(value);
        }
        if(!address.street || !address.house)fail('ADDRESS_REQUIRED');
        if(method==='POST'&&addresses.length>=20)fail('GUEST_ADDRESS_LIMIT',409);
        address.id=id?addresses[index].id:crypto.randomInt(1,2**47);changedId=address.id;address.is_default=body.is_default||addresses.length===0?1:0;
        if(address.is_default)addresses.forEach(a=>a.is_default=0);
        if(index>=0)addresses[index]=address;else addresses.push(address);
      }
      await conn.query('UPDATE cust_guest_sessions SET addresses_json=? WHERE tenant_id=? AND token_hash=?',[JSON.stringify(addresses),tenantId,guestHash(token)]);
      result={ok:true,id:changedId,data:addresses};
    }
    await conn.commit();return result;
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
async function transferGuestAddresses(conn,tenantId,token,customerId,{preserveDefault=false,storeId=1}={}){
  const guest=await getGuest(conn,tenantId,token,true,storeId);if(!guest)return;
  for(const a of guest.addresses){
    const [existing]=await conn.query(`SELECT id FROM cust_customer_addresses WHERE tenant_id=? AND customer_id=?
      AND street=? AND house=? AND apartment <=> ? AND city <=> ? AND entrance <=> ? AND floor <=> ?
      AND comment <=> ? AND address_ref <=> ? AND lat <=> ? AND lng <=> ? AND is_active=1 LIMIT 1`,
      [tenantId,customerId,a.street,a.house,a.apartment,a.city,a.entrance,a.floor,a.comment,a.address_ref,a.lat,a.lng].map(v=>v??null));
    if(existing.length)continue;
    await conn.query(`INSERT INTO cust_customer_addresses (tenant_id,customer_id,city,street,house,entrance,floor,apartment,comment,address_ref,selected_object_type,resolved_city_source_key,address_context_locality,address_normalized_display,lat,lng,is_default,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,[tenantId,customerId,a.city,a.street,a.house,a.entrance,a.floor,a.apartment,a.comment,a.address_ref,a.selected_object_type,a.resolved_city_source_key,a.address_context_locality,a.address_normalized_display,a.lat,a.lng,preserveDefault&&a.is_default?1:0].map(v=>v??null));
  }
  await conn.query('UPDATE cust_guest_sessions SET revoked_at=NOW() WHERE tenant_id=? AND token_hash=?',[tenantId,guestHash(token)]);
}
async function promoteGuest(conn,tenantId,token,request,storeId=1){
  const guest=await getGuest(conn,tenantId,token,true,storeId);
  if(!guest || !request.guest_session_hash || !crypto.timingSafeEqual(guest.token_hash,request.guest_session_hash))fail('GUEST_SESSION_MISMATCH',403);
  if(!['profile_link','login'].includes(request.purpose) || request.state!=='confirmed' || !request.contact_verified_at || !/^[0-9]{10,15}$/.test(request.contact_phone || ''))fail('GUEST_CONTACT_MISMATCH',409);
  const [[owner]]=await conn.query('SELECT phone FROM cust_customers WHERE tenant_id=? AND id=? FOR UPDATE',[tenantId,request.account_id]);
  if(!owner || phone(owner.phone)!==phone(request.contact_phone))fail('GUEST_CONTACT_MISMATCH',409);
  await transferGuestAddresses(conn,tenantId,token,request.account_id,{preserveDefault:request.purpose==='profile_link',storeId});
  // Transfer only this session's orders addressed to the confirmed profile phone.
  await conn.query('UPDATE order_orders SET customer_id=? WHERE tenant_id=? AND guest_session_hash=? AND customer_id IS NULL AND customer_phone=?',[request.account_id,tenantId,guest.token_hash,phone(owner.phone)]);
  await conn.query("UPDATE auth_browser_requests SET state='cancelled' WHERE tenant_id=? AND guest_session_hash=? AND public_id<>? AND state IN ('pending','started','confirmed')",[tenantId,guest.token_hash,request.public_id]);
}
module.exports={settings,validateSettings,phone,byPhone,getGuest,createGuest,ensureGuestCustomer,marketingCustomerId,revokeGuest,guestAddresses,transferGuestAddresses,promoteGuest,guestCustomer,guestStoreOffset};
