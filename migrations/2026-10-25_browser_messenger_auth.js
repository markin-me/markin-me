'use strict';
const fs=require('fs');
const path=require('path');
module.exports=async function migrateBrowserMessenger(db){
  const [[scope]]=await db.query('SELECT DATABASE() name');
  if(scope.name!=='a1186497_test')throw new Error('BROWSER_AUTH_DB_SCOPE_REFUSED');
  const [columns]=await db.query('SHOW COLUMNS FROM cust_customer_sessions');
  if(!columns.some(c=>c.Field==='auth_strength'))await db.query("ALTER TABLE cust_customer_sessions ADD COLUMN auth_strength ENUM('weak','strong') NOT NULL DEFAULT 'weak'");
  await db.query(fs.readFileSync(path.join(__dirname,'2026-10-25_browser_messenger_auth.sql'),'utf8'));
  const [requestColumns]=await db.query('SHOW COLUMNS FROM auth_browser_requests');
  if(!requestColumns.some(c=>c.Field==='purpose'))await db.query("ALTER TABLE auth_browser_requests ADD COLUMN purpose ENUM('login','password_reset') NOT NULL DEFAULT 'login'");
};
