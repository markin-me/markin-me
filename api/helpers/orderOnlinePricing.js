"use strict";

// Resolve selectable catalog configuration on the server, then let the existing Order calculator apply benefits/delivery.
async function buildOnlineItemPrices({db,tenantId,storeId,customerId,items,roundPrice,variantPrice,conversion,availability}) {
  const prices=new Map(),products=new Map(),giftQuantities=new Map();
  const fail=()=>{const error=new Error("BAD_ITEMS");error.code="BAD_ITEMS";error.status=422;throw error;};
  const quantity=value=>{const n=Number(value ?? 1);if(!Number.isInteger(n)||n<1||n>10000)fail();return n;};
  async function product(id) {
    id=Number(id);if(!Number.isInteger(id)||id<1)fail();
    if(products.has(id))return products.get(id);
    const [rows]=await db.query("SELECT * FROM prod_products WHERE tenant_id=? AND id=? AND is_active=1 AND site_visibility=1",[tenantId,id]);
    if(!rows.length)fail();products.set(id,rows[0]);return rows[0];
  }
  async function configuredPrice(id,selection,depth=0) {
    if(depth>1)fail();const p=await product(id);
    let price=Number(p.price || 0);
    if(selection.variant_group_id!=null && Number(selection.variant_group_id)>0) {
      const [groups]=await db.query(`SELECT vg.*,va.default_value_index FROM prod_variant_assignments va
        JOIN prod_variant_groups vg ON vg.tenant_id=va.tenant_id AND vg.id=va.variant_group_id
        WHERE va.tenant_id=? AND va.product_id=? AND va.variant_group_id=? AND va.is_active=1 AND vg.is_active=1`,[tenantId,id,selection.variant_group_id]);
      if(!groups.length)fail();const group=groups[0],values=typeof group.values==="string"?JSON.parse(group.values):group.values;
      const index=Number(selection.variant_value_index);
      if(!Number.isInteger(index)||index<0||index>=values.length)fail();
      const [excluded]=await db.query("SELECT value_index FROM prod_variant_value_exclusions WHERE tenant_id=? AND product_id=? AND variant_group_id=? AND value_index=?",[tenantId,id,group.id,index]);
      if(excluded.length)fail();
      const [tiers]=await db.query("SELECT * FROM prod_variant_discount_tiers WHERE tenant_id=? AND variant_group_id=? ORDER BY sort_order",[tenantId,group.id]);
      price=await variantPrice(p,{...group,values,default_value_index:index,discount_tiers:tiers},conversion,roundPrice);
    }
    const requested=selection.ingredients_display || selection.ingredients;
    if(Array.isArray(requested) && requested.length) {
      const [rows]=await db.query(`SELECT i.*,p.price AS ingredient_price,p.base_qty AS ingredient_base_qty,p.base_unit_id AS ingredient_base_unit_id
        FROM prod_product_ingredients i JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
        WHERE i.tenant_id=? AND i.product_id=?`,[tenantId,id]);
      const selected=new Map();for(const entry of requested){const key=Number(entry.ingredient_id || entry.product_id);if(selected.has(key))fail();selected.set(key,Number(entry.qty ?? entry.quantity));}
      if([...selected.keys()].some(key=>!rows.some(row=>Number(row.ingredient_id)===key)))fail();
      for(const row of rows){
        const base=Number(row.quantity || 0),qty=selected.has(Number(row.ingredient_id))?selected.get(Number(row.ingredient_id)):base;
        if(!Number.isFinite(qty)||qty<0|| (Number(row.is_variable)!==1 && qty!==base)
          || (row.quantity_min!=null && qty<Number(row.quantity_min)) || (row.quantity_max!=null && qty>Number(row.quantity_max)))fail();
        const factor=await conversion(row.unit_id,row.ingredient_base_unit_id);if(factor==null && qty!==base)fail();
        const perUnit=row.price_override!=null?Number(row.price_override):Number(row.ingredient_price || 0)/Number(row.ingredient_base_qty || 1);
        price+=perUnit*(qty-base)*(factor ?? 1);
      }
    }
    const optionSelections=Array.isArray(selection.option_items)?selection.option_items:[];
    const options=new Map();for(const value of optionSelections){const key=Number(value.id);if(options.has(key))fail();options.set(key,value);}
    for(const id of selection.option_item_ids || [])if(!options.has(Number(id)))options.set(Number(id),{id:Number(id)});
    const groupCounts=new Map();
    for(const [optionId,value] of options){
      const [rows]=await db.query(`SELECT oi.* FROM prod_option_items oi
        JOIN prod_option_groups og ON og.tenant_id=oi.tenant_id AND og.id=oi.group_id AND og.is_active=1
        JOIN prod_option_assignments oa ON oa.tenant_id=og.tenant_id AND oa.group_id=og.id AND oa.is_active=1
        WHERE oi.tenant_id=? AND oi.id=? AND oi.is_active=1 AND oa.assign_type='product' AND oa.assign_id=?`,[tenantId,optionId,id]);
      if(!rows.length)fail();const option=rows[0];let optionPrice=Number(option.price_value || 0);
      groupCounts.set(Number(option.group_id),(groupCounts.get(Number(option.group_id)) || 0)+1);
      const [excluded]=await db.query("SELECT id FROM prod_option_item_exclusions WHERE tenant_id=? AND product_id=? AND group_id=? AND option_item_id=? LIMIT 1",[tenantId,id,option.group_id,optionId]);
      if(excluded.length)fail();
      const optionQty=quantity(value.qty ?? value.quantity);
      if(optionQty<Number(option.qty_min || 0) || optionQty>Number(option.qty_max))fail();
      let targetId=option.target_product_id;
      if(option.target_type==='category_pick'){
        targetId=Number(value.target_product_id || value.product_id);
        const [assigned]=await db.query("SELECT product_id FROM prod_product_categories WHERE tenant_id=? AND category_id=? AND product_id=?",[tenantId,option.target_category_id,targetId]);
        if(!assigned.length)fail();
      }
      if(targetId){
        const target=await product(targetId),selectedPrice=await configuredPrice(target.id,value,depth+1);
        if(option.price_mode==='from_target')optionPrice=selectedPrice;
        else if(option.price_mode==='delta')optionPrice=selectedPrice+Number(option.price_value || 0);
        else if(option.price_mode==='fixed')optionPrice+=selectedPrice-Number(target.price || 0);
        else fail();
      } else if(option.price_mode!=='fixed')fail();
      price+=optionPrice*optionQty;
    }
    const blocks=typeof p.blocks_config_json==='string'?JSON.parse(p.blocks_config_json):p.blocks_config_json;
    if(blocks?.options || options.size) {
      const [groups]=await db.query(`SELECT g.id,g.is_required,COALESCE(a.min_select,g.min_select) AS minimum,
        COALESCE(a.max_select,g.max_select) AS maximum,COALESCE(a.selection_type,g.selection_type) AS selection_type
        FROM prod_option_assignments a JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id AND g.is_active=1
        WHERE a.tenant_id=? AND a.assign_type='product' AND a.assign_id=? AND a.is_active=1`,[tenantId,id]);
      for(const group of groups){const count=groupCounts.get(Number(group.id)) || 0;
        const minimum=Math.max(Number(group.minimum || 0),Number(group.is_required)===1?1:0);
        if(count<minimum || (group.selection_type==='single' && count>1) || (group.maximum!=null && count>Number(group.maximum)))fail();}
    }
    if(!Number.isFinite(price)||price<0)fail();return roundPrice(price);
  }
  for(const item of items){
    const qty=quantity(item.qty ?? item.quantity);
    if(item.type==='combo') {
      const [combos]=await db.query("SELECT * FROM prod_combos WHERE tenant_id=? AND id=? AND is_active=1",[tenantId,item.combo_id]);if(!combos.length)fail();
      const [blocks]=await db.query(`SELECT b.*,sb.block_id FROM prod_combo_set_blocks sb JOIN prod_combo_blocks b ON b.tenant_id=sb.tenant_id AND b.id=sb.block_id
        WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order,sb.id`,[tenantId,item.combo_id]);
      const selections=Array.isArray(item.selections)?item.selections:[];if(selections.length!==blocks.length || !blocks.length)fail();
      let sum=0;
      for(let i=0;i<blocks.length;i++){
        const selected=selections[i];const [allowed]=await db.query("SELECT product_id FROM prod_combo_block_products WHERE tenant_id=? AND block_id=? AND product_id=?",[tenantId,blocks[i].block_id,selected.product_id]);
        if(!allowed.length)fail();sum+=await configuredPrice(selected.product_id,selected);
      }
      const discount=Number(combos[0].discount_percent || 0);if(discount<0||discount>100)fail();
      const [categories]=await db.query("SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1",[tenantId,combos[0].category_code]);
      prices.set(item,{name:combos[0].title,categoryId:categories[0]?.id || null,unitPrice:roundPrice(sum*(1-discount/100)),lineTotal:roundPrice(roundPrice(sum*(1-discount/100))*qty)});
    } else {
      let unitPrice=await configuredPrice(item.product_id,item),gift=false;
      if(Number(item.is_gift_reward)===1){
        const [rows]=await db.query("SELECT reward_payload_json FROM mkt_discount_rewards WHERE tenant_id=? AND customer_id=? AND id=? AND reward_type='gift' AND status='available'",[tenantId,customerId,item.gift_reward_id]);
        if(!rows.length)fail();const payload=typeof rows[0].reward_payload_json==='string'?JSON.parse(rows[0].reward_payload_json || '{}'):rows[0].reward_payload_json || {};
        const reward=(payload.products || []).find(p=>Number(p.id || p.product_id)===Number(item.product_id));
        const giftKey=`${item.gift_reward_id}:${item.product_id}`,giftQty=(giftQuantities.get(giftKey) || 0)+qty;
        if(!reward || giftQty>Number(reward.qty || reward.quantity || 1) || (item.option_items || []).length || (item.option_item_ids || []).length || Number(item.variant_group_id)>0 || (item.ingredients_display || item.ingredients || []).length)fail();
        giftQuantities.set(giftKey,giftQty);
        gift=true;unitPrice=0;
      }
      prices.set(item,{unitPrice,lineTotal:roundPrice(unitPrice*qty),gift});
    }
  }
  const available=await availability(tenantId,storeId,[...products.keys()]);
  if([...products.keys()].some(id=>available.get(id)!==true)){const error=new Error("OUT_OF_STOCK");error.code="OUT_OF_STOCK";error.status=409;throw error;}
  return prices;
}
module.exports={buildOnlineItemPrices};
