(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ShopBonusAccrual=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function calculate({lines=[],cashbackPercent=0,ranges=[]}={}){
    const eligible=lines.filter(line=>Number(line.is_gift_reward||0)!==1);
    const total=eligible.reduce((sum,line)=>sum+Math.max(0,Number(line.line_total)||0),0);
    const range=ranges.map(row=>({amount:Number(row.amount)||0,percent:Number(row.percent)||0}))
      .filter(row=>row.amount>0&&row.percent>0&&total>=row.amount).sort((a,b)=>b.amount-a.amount)[0];
    const base=Math.max(0,Number(cashbackPercent)||0)+(range?.percent||0);
    return Math.floor(Math.max(0,eligible.reduce((sum,line)=>sum+Math.max(0,Number(line.line_total)||0)
      *(base+Math.max(0,Number(line.favorite_percent)||0))/100,0)));
  }
  return {calculate};
});
