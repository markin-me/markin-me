"use strict";

const DAY=86400000;
function localStamp(value){const stamp=Date.parse(String(value).replace(' ','T')+'Z');if(!Number.isFinite(stamp))throw new Error('INVALID_STORE_PRINT_DATE');return stamp;}
function minutes(value,allow24=false){const match=/^(\d{1,2}):(\d{2})/.exec(String(value||''));if(!match||Number(match[1])>(allow24?24:23)||Number(match[2])>59||(Number(match[1])===24&&Number(match[2])!==0))throw new Error('INVALID_STORE_PRINT_TIME');return Number(match[1])*60+Number(match[2]);}
function shifts(hours){
  if(!Array.isArray(hours)||!hours.length)throw new Error('PRINT_STORE_HOURS_REQUIRED');
  const rows=hours.filter(row=>Number(row.is_closed)!==1).map(row=>({day:Number(row.day_of_week),start:minutes(row.opens_at),end:minutes(row.closes_at,true)}));
  if(!rows.length)throw new Error('PRINT_STORE_HAS_NO_WORKING_DAYS');
  if(rows.some(row=>!Number.isInteger(row.day)||row.day<0||row.day>6))throw new Error('INVALID_STORE_PRINT_DAY');
  return rows;
}
function format(stamp){return new Date(stamp).toISOString().slice(0,19).replace('T',' ');}
function nextRelease(hours,time,after){
  const rows=shifts(hours),minute=minutes(time),stamp=localStamp(after),date=Math.floor(stamp/DAY)*DAY;
  for(let offset=0;offset<=14;offset++){
    const day=date+offset*DAY,candidate=day+minute*60000;
    if(candidate>=stamp&&rows.some(row=>row.day===new Date(day).getUTCDay()))return format(candidate);
  }
  throw new Error('PRINT_STORE_HAS_NO_WORKING_DAYS');
}
function accumulationWindow(hours,time,createdLocal){
  const rows=shifts(hours),created=localStamp(createdLocal),date=Math.floor(created/DAY)*DAY,intervals=[];
  for(let offset=-8;offset<=8;offset++){
    const day=date+offset*DAY;
    for(const row of rows)if(row.day===new Date(day).getUTCDay())intervals.push({start:day+row.start*60000,end:day+(row.end<=row.start?row.end+1440:row.end)*60000});
  }
  intervals.sort((a,b)=>a.start-b.start);const merged=[];
  for(const interval of intervals){const last=merged[merged.length-1];if(last&&interval.start<=last.end)last.end=Math.max(last.end,interval.end);else merged.push({...interval});}
  const closed=merged.filter(interval=>interval.end<=created).pop();
  // Continuous 24/7 operation has no closing boundary and no overnight accumulation.
  if(!closed)return null;
  const release=nextRelease(hours,time,format(closed.end+1000));
  return created<localStamp(release)?{closedAt:format(closed.end),releaseAt:release,dueDate:release.slice(0,10)}:null;
}
async function loadStorePrintHours(db,tenantId,storeId){const [rows]=await db.query('SELECT day_of_week,opens_at,closes_at,is_closed FROM ten_store_hours WHERE tenant_id=? AND store_id=? ORDER BY day_of_week',[tenantId,storeId]);shifts(rows);return rows;}
module.exports={accumulationWindow,nextRelease,loadStorePrintHours};
