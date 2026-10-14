"use strict";

const mysql=require('mysql2/promise');
const {loadConfig}=require('./config');
const {encrypt,decrypt}=require('./connections');
// CLI only. No HTTP endpoint; never prints decrypted values or envelopes.
async function main() {
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--apply'))throw new Error('ROTATION_INVALID_ARGUMENT');
  const apply=args.includes('--apply'),config=loadConfig(),db=mysql.createPool(config.db);
  let cursor=0,examined=0,rotated=0,conflicts=0;
  try {
    while(true) {
      const [rows]=await db.query(`SELECT id,tenant_id,credentials_encrypted,
        SHA2(CAST(credentials_encrypted AS CHAR),256) AS envelope_hash FROM payment_provider_connections
        WHERE id>? AND credentials_encrypted IS NOT NULL ORDER BY id LIMIT 50`,[cursor]);
      if(!rows.length)break;
      for(const row of rows) {
        cursor=row.id;examined++;
        const envelope=typeof row.credentials_encrypted==='string'?JSON.parse(row.credentials_encrypted):row.credentials_encrypted;
        const secret=decrypt(envelope,config,row.tenant_id,row.id);
        if(envelope.keyVersion===config.credentialsKeyVersion)continue;
        if(!apply)continue;
        const next=encrypt(secret,config,row.tenant_id,row.id);
        if(decrypt(next,config,row.tenant_id,row.id)!==secret)throw new Error('ROTATION_VERIFICATION_FAILED');
        const [result]=await db.query(`UPDATE payment_provider_connections SET credentials_encrypted=?,updated_at=UTC_TIMESTAMP(6)
          WHERE tenant_id=? AND id=? AND SHA2(CAST(credentials_encrypted AS CHAR),256)=?`,[next,row.tenant_id,row.id,row.envelope_hash]);
        if(result.affectedRows)rotated++;else conflicts++;
      }
    }
    const [remaining]=await db.query(`SELECT COUNT(*) AS count FROM payment_provider_connections
      WHERE credentials_encrypted IS NOT NULL AND JSON_EXTRACT(credentials_encrypted,'$.keyVersion')<>?`,[config.credentialsKeyVersion]);
    console.info(JSON.stringify({operation:'credentials.rotate',apply,examined,rotated,conflicts,remaining:Number(remaining[0].count)}));
    if(apply && (conflicts || Number(remaining[0].count)))process.exitCode=1;
  }finally{await db.end();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({operation:'credentials.rotate',result:'failed',code:/^[A-Z][A-Z0-9_:]{0,100}$/.test(error.code || error.message)?error.code || error.message:'ROTATION_FAILED'}));process.exitCode=1;});
module.exports={main};
