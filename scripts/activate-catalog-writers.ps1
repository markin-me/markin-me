# Manual operator procedure; default mode is read-only. No migration/bootstrap or business DML.
[CmdletBinding()]
param([int]$ExpectedPid = 8184, [switch]$Restart, [switch]$VerifyWriterOnly, [switch]$CourierCanary)
if ($CourierCanary -and $VerifyWriterOnly) { throw 'COURIER_AND_CATALOG_MODES_ARE_EXCLUSIVE' }
$authorizedPid = if ($CourierCanary) { 3980 } else { 8184 }
if ($Restart -and ($ExpectedPid -ne $authorizedPid -or $VerifyWriterOnly)) { throw 'AUTHORIZED_PROCESS_MISMATCH_NO_RESTART' }

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class CrmProcessRead {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h,IntPtr address,byte[] buffer,int size,out IntPtr read);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsWow64Process(IntPtr h,out bool wow);
 [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int kind,IntPtr info,int length,out int returned);
 static byte[] Read(IntPtr h,long address,int size) { var b=new byte[size]; IntPtr n; if(!ReadProcessMemory(h,new IntPtr(address),b,size,out n)||n.ToInt64()!=size)throw new Exception("PROCESS_MEMORY_READ_FAILED");return b; }
 static IntPtr Handle(int pid) { if(IntPtr.Size!=8)throw new Exception("64_BIT_READER_REQUIRED");var h=OpenProcess(0x410,false,pid); if(h==IntPtr.Zero)throw new Exception("PROCESS_READ_ACCESS_DENIED");bool wow; if(!IsWow64Process(h,out wow)||wow){CloseHandle(h);throw new Exception("UNSUPPORTED_PROCESS_ARCHITECTURE");}return h; }
 static long Parameters(IntPtr h){var p=Marshal.AllocHGlobal(48);try{int ret;if(NtQueryInformationProcess(h,0,p,48,out ret)!=0)throw new Exception("PROCESS_QUERY_FAILED");long peb=Marshal.ReadIntPtr(p,8).ToInt64();return BitConverter.ToInt64(Read(h,peb+0x20,8),0);}finally{Marshal.FreeHGlobal(p);} }
 public static string Cwd(int pid){var h=Handle(pid);try{long p=Parameters(h);int len=BitConverter.ToUInt16(Read(h,p+0x38,2),0);long ptr=BitConverter.ToInt64(Read(h,p+0x40,8),0);if(len<2||len>32766)throw new Exception("INVALID_PROCESS_CWD");return Encoding.Unicode.GetString(Read(h,ptr,len));}finally{CloseHandle(h);} }
 public static Dictionary<string,string> Environment(int pid){var h=Handle(pid);try{long ptr=BitConverter.ToInt64(Read(h,Parameters(h)+0x80,8),0);var s=new StringBuilder();bool nul=false,done=false;for(int offset=0;offset<1048576&&!done;offset+=256){byte[] b=new byte[256];IntPtr n;bool ok=ReadProcessMemory(h,new IntPtr(ptr+offset),b,256,out n);int length=(int)n.ToInt64();if(length<2||length%2!=0)throw new Exception("PROCESS_ENVIRONMENT_READ_FAILED");for(int i=0;i<length;i+=2){char c=(char)(b[i]|(b[i+1]<<8));s.Append(c);if(c==0&&nul){done=true;break;}nul=c==0;}if(!ok&&!done)throw new Exception("PROCESS_ENVIRONMENT_READ_FAILED");}if(!done)throw new Exception("PROCESS_ENVIRONMENT_LIMIT");var result=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(string line in s.ToString().Split('\0')){int i=line.IndexOf('=');if(i>0)result[line.Substring(0,i)]=line.Substring(i+1);}return result;}finally{CloseHandle(h);} }
}
'@

$ErrorActionPreference = 'Stop'
$crmPid = $ExpectedPid
$crmRoot = 'C:\Users\Admin\Desktop\markin-me'
$crmProc = Get-CimInstance Win32_Process -Filter "ProcessId=$crmPid"
$crmListen = @(Get-NetTCPConnection -State Listen -LocalPort 3000)
if (!$crmProc -or $crmProc.Name -ne 'node.exe' -or $crmProc.CommandLine -notmatch 'node\.exe"?\s+server\.js\s*$' -or !$crmListen.Count -or @($crmListen | Where-Object OwningProcess -ne $crmPid).Count) { throw 'CRM_PROCESS_IDENTITY_MISMATCH' }
$crmCwd = [CrmProcessRead]::Cwd($crmPid)
if ($crmCwd.TrimEnd('\') -cne $crmRoot) { throw 'CRM_CWD_MISMATCH' }
$crmEnv = [CrmProcessRead]::Environment($crmPid)
if ($crmEnv['DB_NAME'] -cne 'a1186497_test' -or $crmEnv['DB_HOST'] -cne '141.8.192.15' -or $crmEnv['DB_PORT'] -ne '3306' -or $crmEnv['PORT'] -ne '3000') { throw 'CRM_DATABASE_CONFIG_MISMATCH' }
function Invoke-CrmReadOnlyNode([string]$source, $environment) {
 $info = New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName = $crmProc.ExecutablePath
 $info.Arguments = '-'
 $info.WorkingDirectory = $crmRoot
 $info.UseShellExecute = $false
 $info.CreateNoWindow = $true
 $info.RedirectStandardInput = $true
 $info.RedirectStandardOutput = $true
 $info.RedirectStandardError = $true
 $info.EnvironmentVariables.Clear()
 foreach ($entry in $environment.GetEnumerator()) { $info.EnvironmentVariables[$entry.Key] = $entry.Value }
 $child = New-Object System.Diagnostics.Process
 $child.StartInfo = $info
 [void]$child.Start()
 $child.StandardInput.Write($source)
 $child.StandardInput.Close()
 $result = $child.StandardOutput.ReadToEnd()
 $diagnosticErrors = $child.StandardError.ReadToEnd()
 $child.WaitForExit()
 if ($child.ExitCode -ne 0) { Write-Output $result; throw 'CRM_READ_ONLY_PREFLIGHT_FAILED' }
 Write-Output $result
}
$crmDiagnostic = @'
'use strict';
(async()=>{
 let conn;
 try {
  const mysql=require('mysql2/promise');
  conn=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:5000});
  const [[identity]]=await conn.query({sql:'SELECT DATABASE() AS db, @@server_uuid AS serverUuid, VERSION() AS version',timeout:5000});
  if(identity.db!=='a1186497_test'||identity.serverUuid!=='9a353ba8-b023-11f0-ba2d-ac1f6bc2ceee')throw Object.assign(new Error(),{code:'DB_IDENTITY_MISMATCH'});
  const [clocks]=await conn.query({sql:'SELECT tenant_id,scope_store_id,CAST(revision AS CHAR) AS revision,writer_coverage_version AS coverage FROM prod_catalog_snapshot_revisions ORDER BY tenant_id,scope_store_id',timeout:5000});
  if(clocks.length!==3||clocks.some(r=>r.tenant_id!==1||r.coverage!==0)||![0,1,2].every(id=>clocks.some(r=>r.scope_store_id===id)))throw Object.assign(new Error(),{code:'REVISION_BASELINE_MISMATCH'});
  const [heavy]=await conn.query({sql:"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('prod_catalog_export_budgets','prod_product_passport_exports','prod_product_passport_export_chunks')",timeout:5000});
  if(heavy.length)throw Object.assign(new Error(),{code:'UNEXPECTED_HEAVY_TABLES'});
  await conn.end();conn=null;
  const capture=require('./services/catalog-snapshot-capture');
  const exports=require('./services/catalog-passport-exports');
  const policy=exports.policy();
  const gated=process.env.CATALOG_EXPORT_WRITER_HOOKS==='1';
  if(REQUIRE_WRITERS && !gated)throw Object.assign(new Error(),{code:'WRITER_ONLY_NOT_ACTIVE'});
  if(capture.writerEnabled(1)!==gated||capture.writerEnabled(2)||policy.light.clientDownload||policy.light.activation||policy.capture||policy.publishing||policy.clientDownload||policy.requestedActivation)throw Object.assign(new Error(),{code:'GATE_POLICY_MISMATCH'});
  const http=[];
  for(const path of ['/login','/shop?tenant_id=1','/sw.js']){
   const response=await fetch('http://127.0.0.1:3000'+path,{signal:AbortSignal.timeout(10000),redirect:'manual'});
   const body=await response.text();
   http.push({path,status:response.status,bytes:Buffer.byteLength(body),...(path==='/sw.js'?{resourcePlan:body.includes('OFFLINE_RESOURCE_PLAN'),prepareResource:body.includes('PREPARE_OFFLINE_RESOURCE')}:{})});
   if(response.status!==200)throw Object.assign(new Error(),{code:'HTTP_SMOKE_FAILED'});
  }
  console.log(JSON.stringify({identity,clocks,heavyTables:heavy.length,writerTenant1:capture.writerEnabled(1),writerTenant2:capture.writerEnabled(2),download:policy.light.clientDownload,activation:policy.light.activation,http}));
 }catch(e){console.log(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'DIAGNOSTIC_FAILURE'}));process.exitCode=1}
 finally{if(conn)await conn.end().catch(()=>{})}
})();
'@
$crmDiagnostic = $crmDiagnostic.Replace('REQUIRE_WRITERS', ([bool]$VerifyWriterOnly).ToString().ToLowerInvariant())
if ($CourierCanary) {
 $crmDiagnostic = @'
'use strict';
(async()=>{
 let conn;
 try {
  const requireCourierOn = false;
  if(process.env.DB_NAME!=='a1186497_test'||process.env.DB_HOST!=='141.8.192.15')throw Object.assign(new Error(),{code:'DB_CONFIG_MISMATCH'});
  conn=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:5000});
  const [[identity]]=await conn.query({sql:'SELECT DATABASE() AS db,@@server_uuid AS uuid',timeout:5000});
  if(identity.db!=='a1186497_test'||identity.uuid!=='9a353ba8-b023-11f0-ba2d-ac1f6bc2ceee')throw Object.assign(new Error(),{code:'DB_IDENTITY_MISMATCH'});
  const [columns]=await conn.query({sql:"SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_orders' AND COLUMN_NAME='courier_revision'",timeout:5000});
  const [triggers]=await conn.query({sql:"SELECT TRIGGER_NAME,ACTION_STATEMENT,ACTION_TIMING,EVENT_MANIPULATION FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='order_orders'",timeout:5000});
  if(columns.length!==1||columns[0].COLUMN_TYPE!=='bigint unsigned'||columns[0].IS_NULLABLE!=='NO'||String(columns[0].COLUMN_DEFAULT)!=='1'
    ||triggers.length!==1||triggers[0].TRIGGER_NAME!=='order_orders_courier_revision_bu'||triggers[0].ACTION_TIMING!=='BEFORE'||triggers[0].EVENT_MANIPULATION!=='UPDATE'
    ||triggers[0].ACTION_STATEMENT.replace(/[\s`;]/g,'').toLowerCase()!=='setnew.courier_revision=old.courier_revision+1')throw Object.assign(new Error(),{code:'COURIER_SCHEMA_MISMATCH'});
  const [clocks]=await conn.query({sql:'SELECT tenant_id,scope_store_id,writer_coverage_version AS coverage FROM prod_catalog_snapshot_revisions WHERE tenant_id=1 ORDER BY scope_store_id',timeout:5000});
  if(clocks.length!==3||clocks.some(r=>r.coverage!==0)||![0,1,2].every(id=>clocks.some(r=>r.scope_store_id===id)))throw Object.assign(new Error(),{code:'COVERAGE_MISMATCH'});
  if(!requireCourierOn){
   const [[active]]=await conn.query({sql:"SELECT COUNT(*) AS active_dml FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID() AND COMMAND<>'Sleep' AND INFO REGEXP '^[[:space:]]*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)[[:space:]]'",timeout:5000});
   if(Number(active.active_dml)!==0)throw Object.assign(new Error(),{code:'VISIBLE_ACTIVE_WRITES_NO_STOP'});
  }
  await conn.end();conn=null;
  const forbidden=['CATALOG_EXPORT_WRITER_HOOKS','CATALOG_EXPORT_LIGHT','CATALOG_EXPORT_CAPTURE','CATALOG_EXPORT_PUBLISHING','CATALOG_EXPORT_CLIENT_DOWNLOAD','CATALOG_EXPORT_ACTIVATION','CATALOG_EXPORT_LIGHT_DOWNLOAD','CATALOG_EXPORT_LIGHT_ACTIVATION'];
  if(forbidden.some(key=>process.env[key]==='1'))throw Object.assign(new Error(),{code:'UNEXPECTED_CATALOG_GATE'});
  const courierOn=process.env.COURIER_OFFLINE_V2==='1';
  if(courierOn!==requireCourierOn||(requireCourierOn&&process.env.COURIER_OFFLINE_V2_TENANT_ID!=='1'))throw Object.assign(new Error(),{code:'COURIER_GATE_MISMATCH'});
  const http=[];
  for(const path of ['/login','/shop?tenant_id=1','/sw.js']){
   const started=performance.now(),response=await fetch('http://127.0.0.1:3000'+path,{redirect:'manual',signal:AbortSignal.timeout(8000)});
   const body=await response.text();
   const record={path,status:response.status,ms:Math.round(performance.now()-started),bytes:Buffer.byteLength(body)};
   if(path==='/sw.js')Object.assign(record,{resourcePlan:body.includes('OFFLINE_RESOURCE_PLAN'),prepareResource:body.includes('PREPARE_OFFLINE_RESOURCE'),version:body.match(/var SW_VERSION = ([^;]+);/)?.[1]});
   http.push(record);if(response.status!==200)throw Object.assign(new Error(),{code:'HTTP_SMOKE_FAILED'});
  }
  console.log(JSON.stringify({identity,courierOn,tenant:requireCourierOn?1:null,clocks,catalogGates:'OFF',http,businessDml:0,ddl:0}));
 }catch(e){console.log(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'DIAGNOSTIC_FAILURE'}));process.exitCode=1}
 finally{if(conn)await conn.end().catch(()=>{})}
})();
'@
}
[pscustomobject]@{event='confirmed';pid=$crmPid;commandLine=$crmProc.CommandLine;cwd=$crmCwd;db=$crmEnv['DB_NAME'];port=3000} | ConvertTo-Json -Compress
Invoke-CrmReadOnlyNode $crmDiagnostic $crmEnv
if (!$Restart) { Write-Output 'READ_ONLY: no process/configuration/SQL changes performed.'; return }
$confirmation = if ($CourierCanary) { 'RESTART 3980 COURIER TENANT 1' } else { 'RESTART 8184' }
if ((Read-Host "Type $confirmation to restart ONLY the confirmed process ONCE") -cne $confirmation) { throw 'OPERATOR_CANCELLED_NO_CHANGES' }
$crmGates = @{
 CATALOG_EXPORT_STRATEGY='hybrid-transfer-v1'
 CATALOG_EXPORT_CRM_LIGHT='1'
 CATALOG_EXPORT_CRM_TENANT_ID='1'
 CATALOG_EXPORT_WRITER_HOOKS='1'
 CATALOG_EXPORT_WRITERS_READY='1'
 CATALOG_EXPORT_LIGHT_DOWNLOAD='0'
 CATALOG_EXPORT_LIGHT_ACTIVATION='0'
 CATALOG_EXPORT_LIGHT='0'
 CATALOG_EXPORT_CAPTURE='0'
 CATALOG_EXPORT_PUBLISHING='0'
 CATALOG_EXPORT_CLIENT_DOWNLOAD='0'
 CATALOG_EXPORT_ACTIVATION='0'
}
if ($CourierCanary) { $crmGates = @{ COURIER_OFFLINE_V2='1'; COURIER_OFFLINE_V2_TENANT_ID='1' } }
$crmLogPrefix = if ($CourierCanary) { 'crm-courier-v2-canary-' } else { 'crm-a425-writer-only-' }
$crmLogDir = Join-Path ([IO.Path]::GetTempPath()) ($crmLogPrefix + [guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $crmLogDir)
$crmOut = Join-Path $crmLogDir 'stdout.log'
$crmErr = Join-Path $crmLogDir 'stderr.log'
$crmStopTarget = Get-Process -Id $crmPid -ErrorAction Stop
try {
 # Pin the kernel object BEFORE the final identity check; never terminate a
 # newly reused PID or equate an enumerated Process object with a live server.
 $null = $crmStopTarget.Handle
 if ($crmStopTarget.HasExited -or [Math]::Abs(($crmStopTarget.StartTime.ToUniversalTime() - $crmProc.CreationDate.ToUniversalTime()).TotalMilliseconds) -gt 1) { throw 'PROCESS_HANDLE_IDENTITY_MISMATCH' }
 $crmCheck = Get-CimInstance Win32_Process -Filter "ProcessId=$crmPid"
 $crmListen = @(Get-NetTCPConnection -State Listen -LocalPort 3000)
 if (!$crmCheck -or $crmCheck.CreationDate -ne $crmProc.CreationDate -or $crmCheck.CommandLine -cne $crmProc.CommandLine -or [CrmProcessRead]::Cwd($crmPid) -cne $crmCwd -or !$crmListen.Count -or @($crmListen | Where-Object OwningProcess -ne $crmPid).Count) { throw 'FINAL_PROCESS_IDENTITY_MISMATCH' }
 [pscustomobject]@{event='confirmed_before_stop';pid=$crmPid;commandLine=$crmProc.CommandLine;cwd=$crmCwd;db=$crmEnv['DB_NAME'];port=3000} | ConvertTo-Json -Compress
 # Windows targeted termination; server.js has no graceful shutdown handler.
 # Only the captured object is stopped, ONCE. No timeout suppression or retry.
 $crmStopClock = [Diagnostics.Stopwatch]::StartNew()
 Stop-Process -InputObject $crmStopTarget -ErrorAction Stop
 $crmExited = $crmStopTarget.WaitForExit(10000)
 $crmStopClock.Stop()
 [pscustomobject]@{event='termination_wait';pid=$crmPid;exited=$crmExited;waitMs=$crmStopClock.ElapsedMilliseconds} | ConvertTo-Json -Compress
 if (!$crmExited -or !$crmStopTarget.HasExited) { throw 'OLD_PROCESS_EXIT_TIMEOUT_NO_RETRY' }
 [pscustomobject]@{event='terminated';pid=$crmPid;exitCode=$crmStopTarget.ExitCode} | ConvertTo-Json -Compress
} finally { $crmStopTarget.Dispose() }
$crmResidual = Get-CimInstance Win32_Process -Filter "ProcessId=$crmPid"
if ($crmResidual -and $crmResidual.CreationDate -ne $crmProc.CreationDate) { throw 'PID_REUSED_AFTER_EXIT_NO_RETRY' }
# An automatic/manual replacement on the port is NEVER stopped or adopted.
if (@(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue).Count) { throw 'PORT_NOT_FREE_AFTER_CONFIRMED_STOP_NO_RETRY' }
$crmCurrentKeys = @([Environment]::GetEnvironmentVariables('Process').Keys)
foreach ($key in $crmCurrentKeys) { if (!$crmEnv.ContainsKey([string]$key)) { [Environment]::SetEnvironmentVariable([string]$key,$null,'Process') } }
foreach ($entry in $crmEnv.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process') }
foreach ($entry in $crmGates.GetEnumerator()) { [Environment]::SetEnvironmentVariable($entry.Key,$entry.Value,'Process') }
$crmNew = Start-Process -FilePath $crmProc.ExecutablePath -ArgumentList 'server.js' -WorkingDirectory $crmRoot -WindowStyle Hidden -RedirectStandardOutput $crmOut -RedirectStandardError $crmErr -PassThru
[pscustomobject]@{event='started_once';oldPid=$crmPid;newPid=$crmNew.Id;stdout=$crmOut;stderr=$crmErr} | ConvertTo-Json -Compress
$crmReady=$false
for ($crmAttempt=0;$crmAttempt -lt 20;$crmAttempt++) {
 if ($crmNew.HasExited) { throw 'CRM_NEW_PROCESS_EXITED_NO_RETRY' }
 try {
  $crmResponse=Invoke-WebRequest -Uri 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 2
  if ($crmResponse.StatusCode -eq 200) { $crmReady=$true;break }
 } catch {}
 Start-Sleep -Milliseconds 500
}
if (!$crmReady) { throw 'CRM_NOT_READY_NO_SECOND_RESTART' }
$crmNewEnv = [CrmProcessRead]::Environment($crmNew.Id)
$crmPreserved=$true
foreach ($entry in $crmEnv.GetEnumerator()) {
 if (!$crmGates.ContainsKey($entry.Key) -and (!$crmNewEnv.ContainsKey($entry.Key) -or $crmNewEnv[$entry.Key] -cne $entry.Value)) { $crmPreserved=$false }
}
foreach ($entry in $crmGates.GetEnumerator()) { if ($crmNewEnv[$entry.Key] -cne $entry.Value) { throw 'NEW_PROCESS_GATE_MISMATCH' } }
$crmNewListen = @(Get-NetTCPConnection -State Listen -LocalPort 3000)
if (!$crmPreserved -or [CrmProcessRead]::Cwd($crmNew.Id).TrimEnd('\') -cne $crmRoot -or !$crmNewListen.Count -or @($crmNewListen | Where-Object OwningProcess -ne $crmNew.Id).Count) { throw 'NEW_PROCESS_IDENTITY_OR_ENVIRONMENT_MISMATCH' }
[pscustomobject]@{event='new_process_verified';pid=$crmNew.Id;configurationPreserved=$crmPreserved;cwd=$crmRoot;gates=$crmGates} | ConvertTo-Json -Compress
Write-Output 'AFTER_RESTART'
if ($CourierCanary) { $crmDiagnostic = $crmDiagnostic.Replace('const requireCourierOn = false;', 'const requireCourierOn = true;') }
Invoke-CrmReadOnlyNode $crmDiagnostic $crmNewEnv

if ($CourierCanary) {
 Write-Output 'Process-only Courier V2 tenant 1 gates active; .env and other gates unchanged. Browser/idempotency/conflicts/finance/stock NOT TESTED by this script.'
} else { Write-Output 'Process-only writer gates active; .env unchanged. Authenticated session and business transaction regressions are NOT TESTED by HTTP smoke.' }
Write-Output 'On FAIL do not repeat restart/migration/bootstrap or replay business operations. Any further restart requires separate authorization.'
