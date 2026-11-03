'use strict';
const {calculate}=require('../../static/js/shared-bonus-accrual');
const {MessengerAuthError}=require('../messengerAuth');

async function defaultLevel(db,tenantId){
  const [[level]]=await db.query(`SELECT id FROM mkt_bonus_levels WHERE tenant_id=? AND is_active=1 AND access_type<>'paid'
    ORDER BY CASE access_type WHEN 'join' THEN 0 ELSE 1 END,sort_order,id LIMIT 1`,[tenantId]);
  return Number(level?.id)||null;
}
async function phoneContext(db,tenantId,phone){
  const [rows]=await db.query(`SELECT c.id customer_id,c.is_active,a.id account_id,a.level_id,a.balance,a.status
    FROM cust_customers c LEFT JOIN mkt_customer_bonus_accounts a ON a.tenant_id=c.tenant_id AND a.customer_id=c.id
    WHERE c.tenant_id=? AND c.phone=? LIMIT 2`,[tenantId,phone]);
  if(rows.length>1)throw new MessengerAuthError('CUSTOMER_PHONE_CONFLICT',409);
  const row=rows[0];
  if(row&&Number(row.is_active)!==1)throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
  return {customerId:Number(row?.customer_id)||null,accountId:Number(row?.account_id)||null,
    levelId:Number(row?.level_id)||await defaultLevel(db,tenantId),balance:Number(row?.balance)||0,status:row?.status||'active'};
}
// Called only in the transaction creating an order. This does not grant order ownership.
async function ensureRecipient(conn,tenantId,storeId,phone){
  const [[settings]]=await conn.query('SELECT bonus_program_enabled FROM mkt_bonus_program_settings WHERE tenant_id=?',[tenantId]);
  if(Number(settings?.bonus_program_enabled)!==1)return null;
  if(!/^[0-9]{10,15}$/.test(phone||''))throw new MessengerAuthError('PHONE_REQUIRED');
  const context=await phoneContext(conn,tenantId,phone);
  if(context.accountId)return context;
  const levelId=context.levelId;
  if(!levelId)return null;
  await conn.query(`INSERT INTO cust_customers (tenant_id,store_id,phone,guest_bonus_only,is_active)
    VALUES (?,?,?,1,1) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,[tenantId,storeId,phone]);
  const [[customer]]=await conn.query('SELECT id,is_active FROM cust_customers WHERE tenant_id=? AND phone=? FOR UPDATE',[tenantId,phone]);
  if(!customer||Number(customer.is_active)!==1)throw new MessengerAuthError('ACCOUNT_NOT_AVAILABLE',403);
  await conn.query(`INSERT INTO mkt_customer_bonus_accounts (tenant_id,customer_id,level_id,status)
    VALUES (?,?,?,'active') ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,[tenantId,customer.id,levelId]);
  return phoneContext(conn,tenantId,phone);
}
function categories(item,comboCategories){
  const result=new Set([item.category_id,item._category_id,item.combo_category_id,item.product?.category_id,item.product_category_id,
    ...(Array.isArray(item.category_ids)?item.category_ids:[])].map(Number).filter(id=>id>0));
  const comboId=Number(item.combo_id||item.combo?.id||0);
  if(comboCategories.has(comboId))result.add(comboCategories.get(comboId));
  return result;
}
async function calculateAccrual(db,{tenantId,items=[],customerId=null,levelId}={}){
  const [[level]]=await db.query('SELECT id,cashback_percent,favorite_categories_limit FROM mkt_bonus_levels WHERE tenant_id=? AND id=? AND is_active=1',[tenantId,levelId]);
  if(!level)return 0;
  const [ranges]=await db.query('SELECT amount,percent FROM mkt_bonus_level_order_ranges WHERE tenant_id=? AND level_id=?',[tenantId,levelId]);
  let favorites=[];
  if(customerId&&Number(level.favorite_categories_limit)>0){
    [favorites]=await db.query(`SELECT f.category_id,MAX(i.bonus_percent) bonus_percent FROM mkt_customer_bonus_favorite_categories f
      JOIN mkt_bonus_category_groups g ON g.tenant_id=f.tenant_id AND g.month_number=MONTH(CURDATE())
      JOIN mkt_bonus_category_group_items i ON i.tenant_id=g.tenant_id AND i.group_id=g.id AND i.category_id=f.category_id
      JOIN prod_categories c ON c.tenant_id=i.tenant_id AND c.id=i.category_id AND c.is_active=1
      WHERE f.tenant_id=? AND f.customer_id=? AND f.period_key=DATE_FORMAT(CURDATE(),'%Y-%m')
      GROUP BY f.category_id ORDER BY f.category_id LIMIT ?`,[tenantId,customerId,Math.max(0,Number(level.favorite_categories_limit))]);
  }
  const favoriteMap=new Map(favorites.map(row=>[Number(row.category_id),Math.max(0,Number(row.bonus_percent)||0)]));
  const comboIds=[...new Set(items.map(item=>Number(item.combo_id||item.combo?.id||0)).filter(id=>id>0))];
  const [combos]=comboIds.length&&favoriteMap.size?await db.query(`SELECT combo.id,category.id category_id FROM prod_combos combo
    JOIN prod_categories category ON category.tenant_id=combo.tenant_id AND LOWER(TRIM(category.code))=LOWER(TRIM(combo.category_code))
    WHERE combo.tenant_id=? AND combo.id IN (?)`,[tenantId,comboIds]):[[]];
  const comboCategories=new Map(combos.map(row=>[Number(row.id),Number(row.category_id)]));
  const productIds=[...new Set(items.map(item=>Number(item.product_id||item.product?.id||0)).filter(id=>id>0))];
  const [productCategories]=productIds.length&&favoriteMap.size?await db.query(`SELECT product_id,category_id
    FROM prod_product_categories WHERE tenant_id=? AND product_id IN (?)`,[tenantId,productIds]):[[]];
  const productMap=new Map();
  for(const row of productCategories){const id=Number(row.product_id);if(!productMap.has(id))productMap.set(id,[]);productMap.get(id).push(Number(row.category_id));}
  return calculate({cashbackPercent:level.cashback_percent,ranges,lines:items.map(item=>({...item,
    line_total:Math.round(Math.max(0,Number(item.line_total)||0)*100)/100,
    favorite_percent:Math.max(0,...[...categories(item,comboCategories),...(productMap.get(Number(item.product_id||item.product?.id))||[])].map(id=>favoriteMap.get(id)||0))}))});
}
module.exports={defaultLevel,phoneContext,ensureRecipient,calculateAccrual};
