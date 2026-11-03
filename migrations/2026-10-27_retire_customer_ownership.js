'use strict';
// Run after 2026-10-26_browser_contact_proof and deployment of compatible source.
// Preserve the applied up migration: a fresh replay ends with this compensation.
module.exports=async function retireCustomerOwnership(db){
  const [[scope]]=await db.query('SELECT DATABASE() name');
  if(scope.name!=='a1186497_test')throw new Error('OWNERSHIP_RETIRE_DB_SCOPE_REFUSED');
  const names=['ownership_customer_id','ownership_status','ownership_method','ownership_channel_id','ownership_requested_at','ownership_reviewed_at','ownership_reviewer_id','ownership_note'];
  const [columns]=await db.query('SHOW COLUMNS FROM auth_browser_requests');
  const present=names.filter(name=>columns.some(c=>c.Field===name));
  const [indexes]=await db.query('SHOW INDEX FROM auth_browser_requests');
  if(!present.length&&!indexes.some(i=>i.Key_name==='idx_browser_review'))return {changed:false};
  const conditions=present.map(name=>name==='ownership_status'?"ownership_status<>'none' OR ownership_status IS NULL":`${name} IS NOT NULL`);
  const [[data]]=await db.query(`SELECT COUNT(*) count FROM auth_browser_requests WHERE ${conditions.join(' OR ')||'FALSE'}`);
  if(Number(data.count))throw new Error('OWNERSHIP_RETIRE_AUDIT_DATA_PRESENT');
  const [foreignKeys]=await db.query("SELECT COLUMN_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME='auth_browser_requests' OR REFERENCED_TABLE_NAME='auth_browser_requests') AND REFERENCED_TABLE_NAME IS NOT NULL");
  if(foreignKeys.some(k=>names.includes(k.COLUMN_NAME)||names.includes(k.REFERENCED_COLUMN_NAME)))throw new Error('OWNERSHIP_RETIRE_FOREIGN_KEY_DEPENDENCY');
  const [definitions]=await db.query(`SELECT VIEW_DEFINITION definition FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE()
    UNION ALL SELECT ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
    UNION ALL SELECT ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()
    UNION ALL SELECT EVENT_DEFINITION FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()`);
  if(definitions.some(r=>r.definition==null))throw new Error('OWNERSHIP_RETIRE_DEPENDENCY_VISIBILITY_REQUIRED');
  if(definitions.some(r=>names.some(name=>String(r.definition).toLowerCase().includes(name))))throw new Error('OWNERSHIP_RETIRE_SQL_DEPENDENCY');
  if(indexes.some(i=>names.includes(i.Column_name)&&i.Key_name!=='idx_browser_review'))throw new Error('OWNERSHIP_RETIRE_UNKNOWN_INDEX_DEPENDENCY');
  const changes=[];
  if(indexes.some(i=>i.Key_name==='idx_browser_review'))changes.push('DROP INDEX idx_browser_review');
  for(const name of present)changes.push(`DROP COLUMN ${name}`);
  await db.query(`ALTER TABLE auth_browser_requests ${changes.join(', ')}`);
  return {changed:true,columns:present,index:'idx_browser_review'};
};
