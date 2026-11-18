"use strict";
const { checkStockAvailabilityForOrderItems } = require('./orderStock');

function applyProductPromoPricing(product, current, original, roundPrice = value => Math.round(value * 100) / 100) {
  const amount = Math.max(0, Number(current || 0));
  const ordinary = Math.max(amount, Number(original || 0));
  const percent = Math.min(100, Math.max(0, Number(product?.promo_discount_percent || 0)));
  return Number(product?.promo_enabled) === 1 && percent > 0
    ? roundPrice(Math.min(amount, ordinary * (1 - percent / 100))) : roundPrice(amount);
}

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
    if(depth>4)fail();const p=await product(id);
    let price=Number(p.price || 0), originalPrice=Math.max(Number(p.price || 0), Number(p.old_price || 0));
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
      originalPrice=await variantPrice({...p,price:originalPrice},{...group,values,default_value_index:index,discount_tiers:[]},conversion,roundPrice);
    }
    const requested=selection.ingredients_display || selection.ingredients;
    if(Array.isArray(requested) && requested.length) {
      const [rows]=await db.query(`SELECT i.*,p.price AS ingredient_price,p.old_price AS ingredient_old_price,p.base_qty AS ingredient_base_qty,p.base_unit_id AS ingredient_base_unit_id
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
        const originalPerUnit=row.price_override!=null?Number(row.price_override):Math.max(Number(row.ingredient_price || 0),Number(row.ingredient_old_price || 0))/Number(row.ingredient_base_qty || 1);
        originalPrice+=originalPerUnit*(qty-base)*(factor ?? 1);
      }
    }
    const optionSelections=Array.isArray(selection.option_items)?selection.option_items:[];
    const options=new Map();for(const value of optionSelections){const key=Number(value.id);if(options.has(key))fail();options.set(key,value);}
    for(const id of selection.option_item_ids || [])if(!options.has(Number(id)))options.set(Number(id),{id:Number(id)});
    const blocks=typeof p.blocks_config_json==='string'?JSON.parse(p.blocks_config_json):p.blocks_config_json;
    const [lockedRows] = blocks?.options === false || blocks?.options === 0 ? [[]] : await db.query(`SELECT s.group_id,s.option_item_id FROM prod_option_item_product_settings s
      JOIN prod_option_assignments a ON a.tenant_id=s.tenant_id AND a.group_id=s.group_id
        AND a.assign_type='product' AND a.assign_id=s.product_id AND a.is_active=1
      JOIN prod_option_groups g ON g.tenant_id=s.tenant_id AND g.id=s.group_id AND g.is_active=1
      WHERE s.tenant_id=? AND s.product_id=? AND s.is_locked=1`, [tenantId,id]);
    const lockedByGroup = new Map(lockedRows.map(row => [Number(row.group_id), Number(row.option_item_id)]));
    if (lockedRows.some(row => !options.has(Number(row.option_item_id)))) fail();
    const groupCounts=new Map();
    for(const [optionId,value] of options){
      const [rows]=await db.query(`SELECT oi.*, COALESCE(s.configuration_json, oi.configuration_json) AS configuration_json FROM prod_option_items oi
        JOIN prod_option_groups og ON og.tenant_id=oi.tenant_id AND og.id=oi.group_id AND og.is_active=1
        JOIN prod_option_assignments oa ON oa.tenant_id=og.tenant_id AND oa.group_id=og.id AND oa.is_active=1
        LEFT JOIN prod_option_item_product_settings s ON s.tenant_id=oi.tenant_id AND s.option_item_id=oi.id AND s.product_id=oa.assign_id AND s.group_id=oi.group_id
        WHERE oi.tenant_id=? AND oi.id=? AND oi.is_active=1 AND oa.assign_type='product' AND oa.assign_id=?`,[tenantId,optionId,id]);
      if(!rows.length)fail();const option=rows[0];let optionPrice=Number(option.price_value || 0), originalOptionPrice=optionPrice;
      if (lockedByGroup.has(Number(option.group_id)) && lockedByGroup.get(Number(option.group_id)) !== optionId) fail();
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
        const target=await product(targetId);
        const configuration = typeof option.configuration_json === 'string' ? JSON.parse(option.configuration_json) : option.configuration_json;
        const selectedPricing=await configuredPrice(target.id, configuration ? { ...value,
          variant_group_id: value.variant_group_id ?? configuration.variant_group_id,
          variant_value_index: value.variant_value_index ?? configuration.variant_value_index,
          ingredients: configuration.ingredients, ingredients_display: configuration.ingredients,
          option_items: configuration.option_items || value.option_items,
          option_item_ids: configuration.option_item_ids || value.option_item_ids } : value,depth+1);
        const selectedPrice=selectedPricing.price;
        if(option.price_mode==='from_target')optionPrice=selectedPrice;
        else if(option.price_mode==='delta')optionPrice=selectedPrice+Number(option.price_value || 0);
        else if(option.price_mode==='fixed')optionPrice+=selectedPrice-Number(target.price || 0);
        else fail();
        originalOptionPrice=option.price_mode==='fixed'?Math.max(optionPrice,Number(option.price_value || 0)):selectedPricing.originalPrice+(option.price_mode==='delta'?Number(option.price_value || 0):0);
      } else if(option.price_mode!=='fixed')fail();
      price+=optionPrice*optionQty;
      originalPrice+=Math.max(optionPrice,originalOptionPrice)*optionQty;
    }
    if(blocks?.options || options.size) {
      const [groups]=await db.query(`SELECT g.id,g.is_required,COALESCE(a.min_select,g.min_select) AS minimum,
        COALESCE(a.max_select,g.max_select) AS maximum,COALESCE(a.selection_type,g.selection_type) AS selection_type
        FROM prod_option_assignments a JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id AND g.is_active=1
        WHERE a.tenant_id=? AND a.assign_type='product' AND a.assign_id=? AND a.is_active=1`,[tenantId,id]);
      for(const group of groups){const count=groupCounts.get(Number(group.id)) || 0;
        if (lockedByGroup.has(Number(group.id))) { if (count !== 1) fail(); continue; }
        const minimum=Math.max(Number(group.minimum || 0),Number(group.is_required)===1?1:0);
        if(count<minimum || (group.selection_type==='single' && count>1) || (group.maximum!=null && count>Number(group.maximum)))fail();}
    }
    if(!Number.isFinite(price)||price<0||!Number.isFinite(originalPrice))fail();return {price:applyProductPromoPricing(p,price,originalPrice,roundPrice),originalPrice:roundPrice(Math.max(price,originalPrice))};
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
        if(!allowed.length)fail();sum+=(await configuredPrice(selected.product_id,selected)).price;
      }
      const discount=Number(combos[0].discount_percent || 0);if(discount<0||discount>100)fail();
      const [categories]=await db.query("SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1",[tenantId,combos[0].category_code]);
      prices.set(item,{name:combos[0].title,categoryId:categories[0]?.id || null,unitPrice:roundPrice(sum*(1-discount/100)),lineTotal:roundPrice(roundPrice(sum*(1-discount/100))*qty),baseLineTotal:roundPrice(sum*qty)});
    } else {
      const autoGift = Number(item.auto_add) === 1 && Number(item.auto_add_rule_version) === 1;
      if (autoGift) await product(item.product_id);
      let unitPrice=autoGift ? 0 : (await configuredPrice(item.product_id,item)).price,gift=false;
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
  const configuredGiftOnly = new Set(items.filter(item => Number(item.auto_add) === 1 && Number(item.auto_add_rule_version) === 1)
    .map(item => Number(item.product_id)).filter(id => !items.some(item => Number(item.product_id) === id && Number(item.auto_add) !== 1)));
  if([...products.keys()].some(id=>!configuredGiftOnly.has(id) && available.get(id)!==true)){const error=new Error("OUT_OF_STOCK");error.code="OUT_OF_STOCK";error.status=409;throw error;}
  return prices;
}
function autoAddDate(group, { timezone = 0, scheduledAt = null, createdAt = null } = {}) {
  const schedule = typeof group.schedule_json === 'string' ? JSON.parse(group.schedule_json) : group.schedule_json;
  const today = new Date(Date.now() + Number(timezone) * 3600000).toISOString().slice(0, 10);
  const date = String(schedule?.basis === 'receipt' ? scheduledAt || createdAt || today : createdAt || today).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('AUTO_ADD_BAD_DATE'), { code: 'AUTO_ADD_BAD_DATE', status: 422 });
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const receipt = schedule?.settings?.receipt;
  const eligible = !schedule || schedule.mode === 'always' || (receipt
    && (!receipt.weekdays.length || receipt.weekdays.includes(weekday))
    && (receipt.mode === 'any' || (receipt.mode === 'dates' && receipt.dates.includes(date))
      || (receipt.mode === 'period' && receipt.start <= date && receipt.end >= date)));
  const slot = !schedule || schedule.mode === 'always' || schedule.assignment === 'shared' ? 'shared'
    : receipt.mode === 'any' ? `weekday:${weekday}` : date;
  return { eligible: Boolean(eligible), slot };
}

function autoAddFreeQty(rule, group, baseTotal, hasBaseItems = true) {
  if (!hasBaseItems || (group.min_cart_amount != null && baseTotal < Number(group.min_cart_amount))
    || (group.max_cart_amount != null && baseTotal > Number(group.max_cart_amount))) return 0;
  let qty = Number(group.first_free) === 1 ? 1 : 0;
  if (Number(rule.free_per_amount) > 0) qty += Math.floor(Math.round(baseTotal * 100) / Math.round(Number(rule.free_per_amount) * 100));
  if (rule.max_free_qty != null) qty = Math.min(qty, Number(rule.max_free_qty));
  return Math.max(0, qty);
}

async function loadAutoAddRuleConfig(conn, tenantId, context = {}) {
  const [groups] = await conn.query('SELECT * FROM prod_auto_add_groups WHERE tenant_id=? AND is_active=1 ORDER BY sort_order,id', [tenantId]);
  const [items] = await conn.query(`SELECT i.* FROM prod_auto_add_items i JOIN prod_auto_add_groups g
    ON g.tenant_id=i.tenant_id AND g.id=i.group_id WHERE i.tenant_id=? AND g.is_active=1
    AND (g.rule_version=1 OR i.is_active=1) ORDER BY g.sort_order,g.id,i.sort_order,i.id`, [tenantId]);
  const byGroup = new Map(groups.map(group => [Number(group.id), group]));
  return { groups, items: items.filter(item => {
    const group = byGroup.get(Number(item.group_id));
    if (context.authenticated === false && Number(group.available_to_guests) === 0) return false;
    if (Number(group.rule_version) !== 1) return true;
    const match = autoAddDate(group, context);
    return match.eligible && item.schedule_slot === match.slot;
  }) };
}

// Caller owns the order transaction. Lock group counters in ID order to prevent
// concurrent checkouts from spending the same free units.
async function syncAutoAddOrderUsage(conn, { tenantId, orderId, items, release = false }) {
  const quantities = new Map();
  if (!release) for (const item of items) {
    if (Number(item.auto_add_rule_version) !== 1) continue;
    const qty = Number(item.auto_add_free_qty || 0), groupId = Number(item.auto_add_group_id);
    if (!Number.isSafeInteger(qty) || qty < 0 || !Number.isSafeInteger(groupId) || groupId <= 0) throw Object.assign(new Error('AUTO_ADD_INVALID'), { code: 'AUTO_ADD_INVALID', status: 422 });
    quantities.set(groupId, (quantities.get(groupId) || 0) + qty);
  }
  const [previous] = await conn.query('SELECT group_id,qty FROM prod_auto_add_order_usage WHERE tenant_id=? AND order_id=?', [tenantId, orderId]);
  const old = new Map(previous.map(row => [Number(row.group_id), Number(row.qty)]));
  const ids = [...new Set([...quantities.keys(), ...old.keys()])].sort((a, b) => a - b);
  if (!ids.length) return;
  const [groups] = await conn.query('SELECT id,total_issue_limit,issued_qty FROM prod_auto_add_groups WHERE tenant_id=? AND id IN (?) ORDER BY id FOR UPDATE', [tenantId, ids]);
  const byId = new Map(groups.map(group => [Number(group.id), group]));
  for (const id of ids) {
    const group = byId.get(id), qty = quantities.get(id) || 0, delta = qty - (old.get(id) || 0);
    if (!group) { if (delta > 0) throw Object.assign(new Error('AUTO_ADD_RULE_CHANGED'), { code: 'AUTO_ADD_RULE_CHANGED', status: 409 }); continue; }
    const next = Number(group.issued_qty) + delta;
    if (next < 0 || (delta > 0 && group.total_issue_limit != null && next > Number(group.total_issue_limit))) throw Object.assign(new Error('AUTO_ADD_LIMIT_EXCEEDED'), { code: 'AUTO_ADD_LIMIT_EXCEEDED', status: 409 });
    await conn.query('UPDATE prod_auto_add_groups SET issued_qty=? WHERE tenant_id=? AND id=?', [next, tenantId, id]);
  }
  await conn.query('DELETE FROM prod_auto_add_order_usage WHERE tenant_id=? AND order_id=?', [tenantId, orderId]);
  for (const [groupId, qty] of quantities) if (qty) await conn.query('INSERT INTO prod_auto_add_order_usage (tenant_id,order_id,group_id,qty) VALUES (?,?,?,?)', [tenantId, orderId, groupId, qty]);
}

async function validateAutoAddOrder(conn, { tenantId, storeId, orderId = null, items, timezone, scheduledAt, createdAt, availability, authenticated = true }) {
  const candidateGroups = [...new Set(items.filter(item => Number(item.auto_add) === 1).map(item => Number(item.auto_add_group_id)).filter(id => id > 0))].sort((a, b) => a - b);
  const [lockedGroups] = candidateGroups.length
    ? await conn.query('SELECT id,rule_version FROM prod_auto_add_groups WHERE tenant_id=? AND id IN (?) ORDER BY id FOR UPDATE', [tenantId, candidateGroups]) : [[]];
  const lockedVersions = new Map(lockedGroups.map(group => [Number(group.id), Number(group.rule_version)]));
  const { groups, items: rules } = await loadAutoAddRuleConfig(conn, tenantId, { timezone, scheduledAt, createdAt, authenticated });
  const byGroup = new Map(groups.map(group => [Number(group.id), group]));
  const rulesByKey = new Map(rules.map(rule => [`${rule.group_id}:${rule.product_id}`, rule]));
  const giftProducts = new Set(rules.filter(rule => Number(byGroup.get(Number(rule.group_id))?.rule_version) === 1).map(rule => Number(rule.product_id)));
  const baseItems = items.filter(item => Number(item.auto_add) !== 1 && !Number(item.gift_reward_id)
    && (item.type === 'combo' || !giftProducts.has(Number(item.product_id))));
  const baseTotal = baseItems.reduce((sum, item) => sum + Math.max(Number(item.old_line_total || 0), Number(item.original_line_total || 0), Number(item.line_total || 0)), 0);
  const used = new Map();
  const autoItems = items.filter(item => Number(item.auto_add_rule_version) === 1 || (Number(item.auto_add) === 1 && lockedVersions.get(Number(item.auto_add_group_id)) === 1));
  const ids = [...new Set(autoItems.map(item => Number(item.product_id)))];
  const available = ids.length ? await availability(tenantId, ids) : new Map();
  const [previousUsage] = orderId
    ? await conn.query('SELECT group_id,qty FROM prod_auto_add_order_usage WHERE tenant_id=? AND order_id=?', [tenantId, orderId]) : [[]];
  const credits = new Map(previousUsage.map(row => [Number(row.group_id), Number(row.qty)]));
  const remaining = new Map(groups.map(group => [Number(group.id), group.total_issue_limit == null ? Infinity
    : Math.max(0, Number(group.total_issue_limit) - Number(group.issued_qty) + (credits.get(Number(group.id)) || 0))]));
  const expectedFree = new Map();
  const selectedProducts = new Set();
  for (const rule of rules) {
    const group = byGroup.get(Number(rule.group_id)), pid = Number(rule.product_id);
    if (selectedProducts.has(pid)) continue;
    selectedProducts.add(pid);
    if (Number(group.rule_version) !== 1) continue;
    let entitlement = autoAddFreeQty(rule, group, baseTotal, baseItems.length > 0);
    for (const item of autoItems) {
      if (Number(item.product_id) !== pid || Number(item.auto_add_group_id) !== Number(group.id)) continue;
      const free = Math.min(Number(item.qty), entitlement, remaining.get(Number(group.id)));
      expectedFree.set(item, free);
      entitlement -= free;
      remaining.set(Number(group.id), remaining.get(Number(group.id)) - free);
    }
  }
  for (const item of autoItems) {
    const gid = Number(item.auto_add_group_id), group = byGroup.get(gid);
    const rule = rulesByKey.get(`${gid}:${item.product_id}`);
    if (!group || Number(group.rule_version) !== 1 || !rule) throw Object.assign(new Error('AUTO_ADD_RULE_CHANGED'), { code: 'AUTO_ADD_RULE_CHANGED', status: 409 });
    const configuration = typeof rule.configuration_json === 'string' ? JSON.parse(rule.configuration_json) : rule.configuration_json;
    if (configuration) {
      const variant = item.variants?.[0];
      let actual;
      try { actual = await normalizeProductConfiguration(conn, tenantId, Number(item.product_id), {
        variant_group_id: item.variant_group_id ?? variant?.variant_group_id ?? null,
        variant_value_index: item.variant_value_index ?? variant?.value_index ?? null,
        ingredients: item.ingredients || item.ingredients_display || [],
        option_items: configuration.option_items != null ? (item.option_items || item.options || []) : undefined,
      }); } catch (error) {
        if (error.status !== 400) throw error;
        throw Object.assign(new Error('AUTO_ADD_RULE_CHANGED'), { code: 'AUTO_ADD_RULE_CHANGED', status: 409 });
      }
      const signature = value => JSON.stringify([value.variant_group_id, value.variant_value_index,
        (value.ingredients || []).map(row => [Number(row.ingredient_id), Number(row.quantity)]).sort((a, b) => a[0] - b[0]),
        (value.option_items || []).map(option => [Number(option.id), Number(option.qty ?? option.quantity), option.variant_group_id,
          option.variant_value_index, (option.ingredients || []).map(row => [Number(row.ingredient_id), Number(row.quantity ?? row.qty)]).sort((a, b) => a[0] - b[0])]).sort((a, b) => a[0] - b[0])]);
      if (signature(actual) !== signature(configuration)) throw Object.assign(new Error('AUTO_ADD_RULE_CHANGED'), { code: 'AUTO_ADD_RULE_CHANGED', status: 409 });
      const [products] = await conn.query('SELECT id FROM prod_products WHERE tenant_id=? AND id=? AND is_active=1', [tenantId, item.product_id]);
      const check = await checkStockAvailabilityForOrderItems({ db: conn, tenantId, storeId,
        items: [{ product_id: item.product_id, qty: item.qty, ingredients: actual.ingredients, variants: actual.variants || [], options: actual.option_items || [] }] });
      if (!products.length || !check.available) throw Object.assign(new Error('AUTO_ADD_RULE_CHANGED'), { code: 'AUTO_ADD_RULE_CHANGED', status: 409 });
    } else if (available.get(Number(item.product_id)) !== true) throw Object.assign(new Error('AUTO_ADD_RULE_CHANGED'), { code: 'AUTO_ADD_RULE_CHANGED', status: 409 });
    const qty = Number(item.qty);
    if (Number(item.auto_add) !== 1 || !Number.isSafeInteger(qty) || qty < 1
      || ((item.option_item_ids || []).length && !configuration?.option_items?.length)) throw Object.assign(new Error('AUTO_ADD_INVALID'), { code: 'AUTO_ADD_INVALID', status: 422 });
    const allowed = autoAddFreeQty(rule, group, baseTotal, baseItems.length > 0);
    const key = `${gid}:${item.product_id}`, previous = used.get(key) || 0;
    const free = Number(item.auto_add_free_qty);
    if (!Number.isInteger(free) || free < 0 || free > qty || previous + free > allowed || free !== expectedFree.get(item)) throw Object.assign(new Error('AUTO_ADD_PRICING_CHANGED'), { code: 'AUTO_ADD_PRICING_CHANGED', status: 409 });
    if (qty !== free) throw Object.assign(new Error('AUTO_ADD_INVALID'), { code: 'AUTO_ADD_INVALID', status: 422 });
    used.set(key, previous + free);
    item.auto_add_rule_version = 1;
  }
}

async function normalizeProductConfiguration(conn, tenantId, productId, configuration, depth = 0) {
  if (configuration == null) return null;
  const fail = () => { throw Object.assign(new Error('INVALID_PRODUCT_CONFIGURATION'), { status: 400 }); };
  if (depth > 4) fail();
  if (typeof configuration !== 'object' || Array.isArray(configuration)) fail();
  const result = { variant_group_id: null, variant_value_index: null, variant_label: '', ingredients: [] };
  if (configuration.variant_group_id != null) {
    const [groups] = await conn.query(`SELECT vg.*, u.short_title AS unit_label FROM prod_variant_assignments va
      JOIN prod_variant_groups vg ON vg.tenant_id=va.tenant_id AND vg.id=va.variant_group_id
      LEFT JOIN prod_units u ON u.tenant_id=vg.tenant_id AND u.id=vg.unit_id
      WHERE va.tenant_id=? AND va.product_id=? AND va.variant_group_id=? AND va.is_active=1 AND vg.is_active=1`, [tenantId, productId, configuration.variant_group_id]);
    if (!groups.length) fail();
    const values = typeof groups[0].values === 'string' ? JSON.parse(groups[0].values) : groups[0].values;
    const index = configuration.variant_value_index;
    if (!Number.isInteger(index) || index < 0 || index >= values.length) fail();
    const [excluded] = await conn.query('SELECT value_index FROM prod_variant_value_exclusions WHERE tenant_id=? AND product_id=? AND variant_group_id=? AND value_index=?', [tenantId, productId, groups[0].id, index]);
    if (excluded.length) fail();
    result.variant_group_id = Number(groups[0].id);
    result.variant_value_index = index;
    result.variant_label = `${values[index]} ${groups[0].unit_label || ''}`.trim();
    result.variant_group = { id: result.variant_group_id, unit_id: Number(groups[0].unit_id),
      values, title: groups[0].title, default_value_index: index };
    result.variants = [{ variant_group_id: result.variant_group_id, value_index: index,
      value: values[index], label: values[index], unit_id: Number(groups[0].unit_id) }];
  }
  if (!Array.isArray(configuration.ingredients) || configuration.ingredients.length > 1000) fail();
  const [rows] = await conn.query(`SELECT i.*,p.name AS ingredient_name,p.price AS ingredient_price,
    p.base_qty AS ingredient_base_qty,p.base_unit_id AS ingredient_base_unit_id,u.short_title AS unit_label
    FROM prod_product_ingredients i JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
    LEFT JOIN prod_units u ON u.tenant_id=i.tenant_id AND u.id=i.unit_id WHERE i.tenant_id=? AND i.product_id=?`, [tenantId, productId]);
  const requested = new Map();
  for (const entry of configuration.ingredients) {
    const id = Number(entry?.ingredient_id), qty = Number(entry?.quantity ?? entry?.qty);
    const row = rows.find(value => Number(value.ingredient_id) === id);
    if (!row || requested.has(id) || !Number.isFinite(qty) || qty < 0) fail();
    const base = Number(row.quantity || 0), step = Number(row.quantity_step || 1);
    if ((row.is_variable != null && Number(row.is_variable) !== 1 && qty !== base) || (row.quantity_min != null && qty < Number(row.quantity_min))
      || (row.quantity_max != null && qty > Number(row.quantity_max))
      || (step > 0 && Math.abs((qty - base) / step - Math.round((qty - base) / step)) > 0.000001)) fail();
    requested.set(id, qty);
  }
  result.ingredients = rows.map(row => ({ ingredient_id: Number(row.ingredient_id),
    quantity: requested.has(Number(row.ingredient_id)) ? requested.get(Number(row.ingredient_id)) : Number(row.quantity || 0),
    ingredient_name: row.ingredient_name, unit_id: Number(row.unit_id), unit_label: row.unit_label || '' }));
  result.ingredient_price_diff = 0;
  for (const row of rows) {
    const delta = (requested.get(Number(row.ingredient_id)) ?? Number(row.quantity || 0)) - Number(row.quantity || 0);
    if (!delta) continue;
    let factor = 1;
    if (row.unit_id && row.ingredient_base_unit_id && Number(row.unit_id) !== Number(row.ingredient_base_unit_id)) {
      const [conversions] = await conn.query(`SELECT from_unit_id,to_unit_id,factor FROM prod_unit_conversions
        WHERE tenant_id=? AND is_active=1 AND ((from_unit_id=? AND to_unit_id=?) OR (from_unit_id=? AND to_unit_id=?))`,
      [tenantId, row.unit_id, row.ingredient_base_unit_id, row.ingredient_base_unit_id, row.unit_id]);
      const direct = conversions.find(value => Number(value.from_unit_id) === Number(row.unit_id));
      const inverse = conversions.find(value => Number(value.to_unit_id) === Number(row.unit_id));
      if (!direct && !inverse) fail();
      factor = direct ? Number(direct.factor) : 1 / Number(inverse.factor);
      if (!Number.isFinite(factor) || factor <= 0) fail();
    }
    const price = row.price_override != null ? Number(row.price_override) : Number(row.ingredient_price || 0) / Number(row.ingredient_base_qty || 1);
    result.ingredient_price_diff += price * delta * factor;
  }
  if (configuration.option_items != null) {
    if (!Array.isArray(configuration.option_items) || configuration.option_items.length > 100) fail();
    result.option_items = [];
    const [lockedRows] = await conn.query(`SELECT s.group_id,s.option_item_id FROM prod_option_item_product_settings s
      JOIN prod_option_assignments a ON a.tenant_id=s.tenant_id AND a.group_id=s.group_id
        AND a.assign_type='product' AND a.assign_id=s.product_id AND a.is_active=1
      JOIN prod_option_groups g ON g.tenant_id=s.tenant_id AND g.id=s.group_id AND g.is_active=1
      WHERE s.tenant_id=? AND s.product_id=? AND s.is_locked=1`, [tenantId,productId]);
    const lockedByGroup = new Map(lockedRows.map(row => [Number(row.group_id), Number(row.option_item_id)]));
    const selectedIds = new Set(), counts = new Map();
    for (const value of configuration.option_items) {
      const id = Number(value.id), qty = Number(value.qty ?? value.quantity ?? 1);
      if (!Number.isSafeInteger(id) || selectedIds.has(id) || !Number.isSafeInteger(qty) || qty < 1) fail();
      selectedIds.add(id);
      const [options] = await conn.query(`SELECT oi.*,COALESCE(s.configuration_json,oi.configuration_json) AS configuration_json,p.name AS product_name FROM prod_option_items oi
        JOIN prod_option_groups g ON g.tenant_id=oi.tenant_id AND g.id=oi.group_id AND g.is_active=1
        JOIN prod_option_assignments a ON a.tenant_id=g.tenant_id AND a.group_id=g.id AND a.is_active=1
        JOIN prod_products p ON p.tenant_id=oi.tenant_id AND p.id=oi.target_product_id AND p.is_active=1
        LEFT JOIN prod_option_item_product_settings s ON s.tenant_id=oi.tenant_id AND s.option_item_id=oi.id AND s.product_id=a.assign_id AND s.group_id=oi.group_id
        WHERE oi.tenant_id=? AND oi.id=? AND oi.is_active=1 AND oi.target_type='product'
          AND a.assign_type='product' AND a.assign_id=?
          AND NOT EXISTS (SELECT 1 FROM prod_option_item_exclusions e WHERE e.tenant_id=oi.tenant_id
            AND e.product_id=? AND e.group_id=oi.group_id AND e.option_item_id=oi.id)`, [tenantId, id, productId, productId]);
      const option = options[0];
      if (option && lockedByGroup.has(Number(option.group_id)) && lockedByGroup.get(Number(option.group_id)) !== id) fail();
      if (!option || qty < Number(option.qty_min ?? 1) || qty > Number(option.qty_max ?? 1)) fail();
      const fixed = typeof option.configuration_json === 'string' ? JSON.parse(option.configuration_json) : option.configuration_json;
      const selected = await normalizeProductConfiguration(conn, tenantId, Number(option.target_product_id), {
        variant_group_id: value.variant_group_id ?? fixed?.variant_group_id ?? option.default_variant_group_id ?? null,
        variant_value_index: value.variant_value_index ?? fixed?.variant_value_index ?? option.default_variant_value_index ?? null,
        ingredients: fixed?.ingredients || value.ingredients || [],
      }, depth + 1);
      result.option_items.push({ id, group_id: Number(option.group_id), qty, quantity: qty,
        title: option.product_name, name: option.product_name, target_product_id: Number(option.target_product_id),
        product_id: Number(option.target_product_id), ...selected,
        unit_id: selected.variant_group?.unit_id ?? null });
      counts.set(Number(option.group_id), (counts.get(Number(option.group_id)) || 0) + 1);
    }
    const [groups] = await conn.query(`SELECT g.id,g.is_required,COALESCE(a.min_select,g.min_select) AS minimum,
      COALESCE(a.max_select,g.max_select) AS maximum,COALESCE(a.selection_type,g.selection_type) AS selection_type
      FROM prod_option_assignments a JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id AND g.is_active=1
      WHERE a.tenant_id=? AND a.assign_type='product' AND a.assign_id=? AND a.is_active=1`, [tenantId, productId]);
    if (lockedRows.some(row => !selectedIds.has(Number(row.option_item_id)))) fail();
    for (const group of groups) {
      if (lockedByGroup.has(Number(group.id))) { if (counts.get(Number(group.id)) !== 1) fail(); continue; }
      const count = counts.get(Number(group.id)) || 0;
      if (count < Math.max(Number(group.minimum || 0), Number(group.is_required) === 1 ? 1 : 0)
        || (group.selection_type === 'single' && count > 1) || (group.maximum != null && count > Number(group.maximum))) fail();
    }
    result.option_item_ids = result.option_items.map(value => value.id);
  }
  return result;
}

module.exports={applyProductPromoPricing,buildOnlineItemPrices, autoAddDate, autoAddFreeQty, loadAutoAddRuleConfig, validateAutoAddOrder, syncAutoAddOrderUsage, normalizeProductConfiguration};
