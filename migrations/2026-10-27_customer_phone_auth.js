'use strict';
module.exports=async function migrateCustomerPhoneAuth(db){
  const [[scope]]=await db.query('SELECT DATABASE() name');if(scope.name!=='a1186497_test')throw new Error('CUSTOMER_AUTH_DB_SCOPE_REFUSED');
  for(const [table,name,type]of [['ten_tenants','customer_auth_config_json','JSON NULL'],['auth_browser_requests','requested_phone','VARCHAR(20) NULL'],['auth_browser_requests','code_challenge_id','CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL']]){
    const [columns]=await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[name]);
    if(columns.length){
      const expected=type.split(/\s/)[0].toLowerCase();
      if(String(columns[0].Type).toLowerCase()!==expected||columns[0].Null!=='YES')throw new Error(`CUSTOMER_AUTH_SCHEMA_INCOMPATIBLE:${table}.${name}`);
      if(name==='code_challenge_id'){
        const [[detail]]=await db.query('SELECT COLLATION_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,name]);
        if(detail.name!=='ascii_bin')throw new Error('CUSTOMER_AUTH_CHALLENGE_COLLATION_INCOMPATIBLE');
      }
    }else await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS cust_guest_sessions (
    tenant_id INT NOT NULL,token_hash BINARY(32) NOT NULL,phone VARCHAR(20) NOT NULL,
    addresses_json JSON NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,revoked_at DATETIME NULL,
    PRIMARY KEY (tenant_id,token_hash),KEY idx_guest_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [guest]=await db.query('SHOW COLUMNS FROM cust_guest_sessions');
  for(const [name,type]of [['tenant_id','int'],['token_hash','binary(32)'],['phone','varchar(20)'],['addresses_json','json'],['created_at','datetime'],['expires_at','datetime'],['revoked_at','datetime']]){
    const column=guest.find(c=>c.Field===name);
    if(!column||String(column.Type).toLowerCase().replace(/int\(\d+\)/,'int')!==type)throw new Error(`GUEST_SESSION_SCHEMA_INCOMPATIBLE:${name}`);
  }
  const [indexes]=await db.query('SHOW INDEX FROM cust_guest_sessions');
  if(indexes.filter(i=>i.Key_name==='PRIMARY').sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(i=>i.Column_name).join(',')!=='tenant_id,token_hash')throw new Error('GUEST_SESSION_PRIMARY_KEY_INCOMPATIBLE');
};
