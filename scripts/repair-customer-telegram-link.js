'use strict';
// One-off, owner-approved repair of an empty employee placeholder. No schema changes.
// Preview creates a private row backup; --apply --plan=<backup> rechecks that exact scope.
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const crypto=require('crypto');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const mysql=require('mysql2/promise');
const root=path.resolve(__dirname,'..');
const backupRoot=path.join(root,'tmp/telegram-launch-backup');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const refuse=code=>{throw new Error(code);};
async function main(){
  if(process.env.DB_NAME!=='a1186497_test')refuse('REPAIR_DB_SCOPE_REFUSED');
  const tenantId=Number(process.argv.find(a=>a.startsWith('--tenant='))?.slice(9));
  if(tenantId!==1)refuse('EXPLICIT_APPROVED_TENANT_REQUIRED');
  const apply=process.argv.includes('--apply'),planArg=process.argv.find(a=>a.startsWith('--plan='))?.slice(7);
  let plan;
  if(apply){
    if(!planArg)refuse('PRIVATE_PREVIEW_PLAN_REQUIRED');
    const file=path.resolve(root,planArg);
    if(path.dirname(file)!==backupRoot)refuse('PRIVATE_PLAN_PATH_REQUIRED');
    plan=JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).plan;
    if(plan.database!=='a1186497_test'||plan.tenantId!==tenantId)refuse('PLAN_SCOPE_REFUSED');
  }
  const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,dateStrings:true});
  try{
    const [[scope]]=await db.query('SELECT DATABASE() name');if(scope.name!=='a1186497_test')refuse('REPAIR_DB_SCOPE_REFUSED');
    await db.beginTransaction();
    const [requests]=await db.query(`SELECT * FROM auth_browser_requests WHERE tenant_id=? AND account_type='customer' AND provider='tg'
      ${plan?'AND public_id=?':''} ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,plan?[tenantId,plan.requestId]:[tenantId]);
    const r=requests[0];if(!r?.requested_phone||!r.provider_user_id)refuse('CUSTOMER_REQUEST_REQUIRED');
    await db.query('SELECT id FROM ten_tenants WHERE id=? FOR UPDATE',[tenantId]);
    const [sources]=await db.query('SELECT * FROM cust_customers WHERE tenant_id=? AND telegram_user_id=? LIMIT 2 FOR UPDATE',[tenantId,r.provider_user_id]);
    if(sources.length!==1)refuse('SOURCE_IDENTITY_AMBIGUOUS');
    const source=sources[0];
    if(source.phone===r.requested_phone){await db.rollback();console.log('REPAIR_ALREADY_APPLIED');return;}
    if(source.phone!==null||source.phone_verified_at||source.max_user_id||Number(source.is_active)!==1)refuse('SOURCE_NOT_EMPTY_UNVERIFIED_PLACEHOLDER');
    const [targets]=await db.query('SELECT * FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 2 FOR UPDATE',[tenantId,r.requested_phone]);
    if(targets.length!==1)refuse('TARGET_PHONE_AMBIGUOUS');
    const target=targets[0];
    if(target.id===source.id||Number(target.is_active)!==1||target.phone_verified_at||target.telegram_user_id||target.max_user_id)refuse('TARGET_HAS_CONFIRMED_OR_CONFLICTING_IDENTITY');
    const [relations]=await db.query('SELECT * FROM auth_employee_customer_links WHERE tenant_id=? AND customer_id IN (?,?) FOR UPDATE',[tenantId,source.id,target.id]);
    if(relations.length!==1||Number(relations[0].customer_id)!==Number(source.id))refuse('EMPLOYEE_CUSTOMER_RELATION_CONFLICT');
    const relation=relations[0];
    if(relation.conflict_code&&!['UNVERIFIED_PHONE_MATCH','PHONE_OWNERSHIP_REVIEW_REQUIRED'].includes(relation.conflict_code))refuse('UNRELATED_EMPLOYEE_CONFLICT');
    const [accounts]=await db.query("SELECT * FROM auth_account_links WHERE tenant_id=? AND account_type='customer' AND account_id IN (?,?) FOR UPDATE",[tenantId,source.id,target.id]);
    if(accounts.length!==1||Number(accounts[0].account_id)!==Number(source.id))refuse('CUSTOMER_PERSON_CONFLICT');
    const account=accounts[0];
    const [messengers]=await db.query('SELECT * FROM auth_account_messenger_links WHERE account_link_id=? FOR UPDATE',[account.id]);
    if(messengers.length!==1||messengers[0].provider!=='tg')refuse('PLACEHOLDER_HAS_OTHER_CHANNELS');
    const [channels]=await db.query('SELECT * FROM auth_messenger_channels WHERE id=? FOR UPDATE',[messengers[0].channel_id]);
    if(channels.length!==1||channels[0].revoked_at||String(channels[0].provider_user_id)!==r.provider_user_id||String(channels[0].person_id)!==String(account.person_id))refuse('CHANNEL_PROOF_CONFLICT');
    const [employeeProof]=await db.query(`SELECT a.id FROM auth_account_links a JOIN auth_account_messenger_links m ON m.account_link_id=a.id
      WHERE a.tenant_id=? AND a.account_type='employee' AND a.account_id=? AND a.person_id=? AND m.channel_id=? LIMIT 2 FOR UPDATE`,[tenantId,relation.employee_id,account.person_id,channels[0].id]);
    if(employeeProof.length!==1)refuse('EMPLOYEE_PERSON_PROOF_REQUIRED');
    const [identities]=await db.query('SELECT * FROM cust_customer_auth_identities WHERE tenant_id=? AND customer_id IN (?,?) FOR UPDATE',[tenantId,source.id,target.id]);
    if(identities.length!==1||Number(identities[0].customer_id)!==Number(source.id)||identities[0].provider!=='tg'||String(identities[0].provider_user_id)!==r.provider_user_id)refuse('LEGACY_IDENTITY_CONFLICT');
    const [references]=await db.query("SELECT c.TABLE_NAME name FROM information_schema.COLUMNS c JOIN information_schema.COLUMNS t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME AND t.COLUMN_NAME='tenant_id' WHERE c.TABLE_SCHEMA=DATABASE() AND c.COLUMN_NAME='customer_id'");
    for(const table of references){
      if(['auth_employee_customer_links','cust_customer_auth_identities','cust_customer_sessions'].includes(table.name))continue;
      if(!/^[a-zA-Z0-9_]+$/.test(table.name))refuse('REFERENCE_NAME_INVALID');
      const [[count]]=await db.query(`SELECT COUNT(*) n FROM \`${table.name}\` WHERE tenant_id=? AND customer_id=?`,[tenantId,source.id]);
      if(Number(count.n))refuse('PLACEHOLDER_HAS_BUSINESS_DATA');
    }
    const [employees]=await db.query('SELECT * FROM app_users WHERE tenant_id=? AND id=? FOR UPDATE',[tenantId,relation.employee_id]);
    const [roles]=await db.query('SELECT * FROM user_roles WHERE tenant_id=? AND user_id=? ORDER BY role_id FOR UPDATE',[tenantId,relation.employee_id]);
    const currentPlan={database:'a1186497_test',tenantId,requestId:r.public_id,uid:r.provider_user_id,phone:r.requested_phone,sourceId:source.id,targetId:target.id,employeeId:relation.employee_id,accountId:account.id};
    if(plan&&digest(plan)!==digest(currentPlan))refuse('PREVIEW_SCOPE_CHANGED');
    const snapshot={createdAt:new Date().toISOString(),plan:currentPlan,tables:{}};
    const capture=async(name,rows)=>{const [[ddl]]=await db.query(`SHOW CREATE TABLE \`${name}\``);snapshot.tables[name]={ddl,rows};};
    await capture('cust_customers',[source,target]);await capture('auth_employee_customer_links',relations);
    await capture('auth_account_links',accounts);await capture('auth_account_messenger_links',messengers);
    await capture('auth_messenger_channels',channels);await capture('cust_customer_auth_identities',identities);
    const [sessions]=await db.query('SELECT * FROM cust_customer_sessions WHERE tenant_id=? AND customer_id IN (?,?) FOR UPDATE',[tenantId,source.id,target.id]);
    await capture('cust_customer_sessions',sessions);await capture('app_users',employees);await capture('user_roles',roles);
    const original=Buffer.from(JSON.stringify(snapshot)),packed=zlib.gzipSync(original);
    const file=path.join(backupRoot,`customer-link-${apply?'before-apply':'preview'}-${Date.now()}.json.gz`);
    fs.writeFileSync(file,packed,{flag:'wx'});
    if(!zlib.gunzipSync(fs.readFileSync(file)).equals(original))refuse('BACKUP_VERIFY_FAILED');
    console.log(JSON.stringify({mode:apply?'apply':'preview',backup:path.relative(root,file),tables:Object.keys(snapshot.tables).length,sourceBusinessData:0,staffRolesUnchanged:true}));
    if(!apply){await db.rollback();return;}
    await db.query('UPDATE cust_customers SET telegram_user_id=NULL,updated_at=NOW() WHERE tenant_id=? AND id=?',[tenantId,source.id]);
    await db.query('UPDATE cust_customers SET telegram_user_id=?,updated_at=NOW() WHERE tenant_id=? AND id=?',[r.provider_user_id,tenantId,target.id]);
    await db.query('UPDATE cust_customer_auth_identities SET customer_id=? WHERE tenant_id=? AND id=?',[target.id,tenantId,identities[0].id]);
    await db.query("UPDATE auth_account_links SET account_id=? WHERE tenant_id=? AND id=? AND account_type='customer'",[target.id,tenantId,account.id]);
    await db.query('UPDATE auth_employee_customer_links SET customer_id=?,conflict_code=NULL,updated_at=NOW() WHERE tenant_id=? AND employee_id=?',[target.id,tenantId,relation.employee_id]);
    await db.query('UPDATE cust_customer_sessions SET is_active=0,revoked_at=NOW() WHERE tenant_id=? AND customer_id IN (?,?)',[tenantId,source.id,target.id]);
    const [afterEmployees]=await db.query('SELECT * FROM app_users WHERE tenant_id=? AND id=?',[tenantId,relation.employee_id]);
    const [afterRoles]=await db.query('SELECT * FROM user_roles WHERE tenant_id=? AND user_id=? ORDER BY role_id',[tenantId,relation.employee_id]);
    if(digest(employees)!==digest(afterEmployees)||digest(roles)!==digest(afterRoles))refuse('STAFF_STATE_CHANGED');
    const [[verified]]=await db.query(`SELECT COUNT(*) n FROM auth_employee_customer_links ec JOIN auth_account_links a ON a.tenant_id=ec.tenant_id AND a.account_type='customer' AND a.account_id=ec.customer_id
      JOIN cust_customer_auth_identities i ON i.tenant_id=ec.tenant_id AND i.customer_id=ec.customer_id AND i.provider='tg'
      WHERE ec.tenant_id=? AND ec.employee_id=? AND ec.customer_id=? AND a.id=?`,[tenantId,relation.employee_id,target.id,account.id]);
    if(Number(verified.n)!==1)refuse('REPAIR_POSTCONDITION_FAILED');
    await db.commit();console.log('REPAIR_COMPLETE_NO_PHONE_VERIFICATION_GRANTED');
  }catch(error){await db.rollback();throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
