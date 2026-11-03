'use strict';

// Explicit invocation only. No startup migration and no production database access.
module.exports=async function migrateGuestOrderBonusScope(db){
  const [[scope]]=await db.query('SELECT DATABASE() name');
  if(scope.name!=='a1186497_test')throw Error('GUEST_ORDER_BONUS_DB_SCOPE_REFUSED');
  const fs=require('fs'),path=require('path'),mysql=require('mysql2');
  const tables=['cust_guest_sessions','cust_customers','order_orders','auth_browser_requests','mkt_customer_bonus_accounts','mkt_customer_bonus_transactions'];
  const conn=await db.getConnection(),statements=['-- Snapshot before indefinite guest/order bonus scope','USE `a1186497_test`;'],counts={};
  try{
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    for(const table of tables){
      const [[ddl]]=await conn.query(`SHOW CREATE TABLE \`${table}\``);
      statements.push(ddl['Create Table']+';');
      const [rows]=await conn.query({sql:`SELECT * FROM \`${table}\``,dateStrings:true});counts[table]=rows.length;
      for(const row of rows){
        const columns=Object.keys(row),values=columns.map(key=>mysql.escape(row[key]&&typeof row[key]==='object'&&!Buffer.isBuffer(row[key])?JSON.stringify(row[key]):row[key]));
        statements.push(`INSERT INTO \`${table}\` (${columns.map(key=>mysql.escapeId(key)).join(',')}) VALUES (${values.join(',')});`);
      }
    }
    await conn.commit();
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  const directory=path.resolve(__dirname,'../tmp/backups');fs.mkdirSync(directory,{recursive:true});
  const backup=path.join(directory,`a1186497_test_guest_order_bonus_${Date.now()}.sql`);
  fs.writeFileSync(backup,statements.join('\n')+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  if(!fs.statSync(backup).size)throw Error('GUEST_ORDER_BONUS_BACKUP_FAILED');
  const [[expiry]]=await db.query("SHOW COLUMNS FROM cust_guest_sessions LIKE 'expires_at'");
  if(expiry.Type!=='datetime')throw Error('GUEST_EXPIRY_SCHEMA_INCOMPATIBLE');
  if(expiry.Null==='NO')await db.query('ALTER TABLE cust_guest_sessions MODIFY expires_at DATETIME NULL DEFAULT NULL');
  for(const [table,name,definition]of[
    ['cust_customers','guest_bonus_only','TINYINT NOT NULL DEFAULT 0'],
    ['order_orders','bonus_customer_id','INT NULL'],
    ['order_orders','auth_status_at_creation',"ENUM('unverified','verified') NULL"],
  ]){
    const [columns]=await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`,[name]);
    if(!columns.length)await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
    else if((name==='guest_bonus_only'&&!columns[0].Type.startsWith('tinyint'))||(name==='bonus_customer_id'&&columns[0].Type!=='int')||(name==='auth_status_at_creation'&&columns[0].Type!=="enum('unverified','verified')"))throw Error('GUEST_ORDER_BONUS_SCHEMA_INCOMPATIBLE');
  }
  const [keys]=await db.query("SHOW INDEX FROM order_orders WHERE Key_name='idx_order_bonus_customer'");
  if(!keys.length)await db.query('ALTER TABLE order_orders ADD INDEX idx_order_bonus_customer (tenant_id,bonus_customer_id)');
  const [fks]=await db.query("SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='order_orders' AND CONSTRAINT_NAME='fk_order_bonus_customer'");
  if(!fks.length)await db.query('ALTER TABLE order_orders ADD CONSTRAINT fk_order_bonus_customer FOREIGN KEY (tenant_id,bonus_customer_id) REFERENCES cust_customers (tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT');
  // Do not revive expired/revoked credentials and do not backfill ownership by phone.
  const [updated]=await db.query('UPDATE cust_guest_sessions SET expires_at=NULL WHERE revoked_at IS NULL AND expires_at>UTC_TIMESTAMP()');
  return {backup,counts,activeGuestSessionsMadeIndefinite:updated.affectedRows};
};
