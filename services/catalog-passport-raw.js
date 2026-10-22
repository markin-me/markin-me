'use strict';

// Raw dependency capture only. No price/availability/default-selection formulas,
// SQL replay adapter, mutable passport cache or client-facing partial passport.
const crypto = require('crypto');
const TABLES = Object.freeze(['prod_products', 'prod_categories', 'prod_product_categories',
  'prod_units', 'prod_unit_conversions', 'prod_product_unit_links', 'prod_product_ingredients',
  'prod_variant_assignments', 'prod_variant_groups', 'prod_variant_value_exclusions', 'prod_variant_discount_tiers',
  'prod_option_assignments', 'prod_option_groups', 'prod_option_items', 'prod_option_item_exclusions',
  'prod_option_item_product_settings', 'prod_product_stocks', 'prod_combo_block_products', 'prod_combo_blocks',
  'prod_combo_set_blocks', 'prod_combos', 'mkt_discounts', 'mkt_discount_products', 'ten_tenants']);
const LARGE = new Set(['prod_products', 'prod_variant_groups', 'mkt_discounts', 'mkt_discount_products']);
const fault = code => Object.assign(new Error(code), { code });
const unique = rows => [...new Set(rows.filter(x => x !== null && x !== undefined && Number(x) !== 0).map(x => {
  const id = Number(x);
  if (!Number.isSafeInteger(id) || id <= 0) throw fault('CAPTURE_DEPENDENCY_ID');
  return id;
}))];
const quote = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw fault('CAPTURE_SCHEMA_UNSUPPORTED');
  return '`' + value + '`';
};

async function load(view, { tenantId, storeId }, productId) {
  if (!Number.isSafeInteger(productId) || productId <= 0) throw fault('CAPTURE_DEPENDENCY_ID');
  const tables = Object.create(null), maps = new Map(), usedColumns = new Map(), products = new Set(), variantGroups = new Set(), optionGroups = new Set();
  let graphNodes = 0;
  async function read(table, where = '1=1', values = [], selected = null) {
    const columns = view.columns.get(table);
    if (!TABLES.includes(table) || !columns?.length) {
      throw fault('CAPTURE_SCHEMA_UNSUPPORTED');
    }
    const fields = selected ? columns.filter(c => selected.includes(c.COLUMN_NAME)) : columns;
    if (selected && fields.length !== selected.length) throw fault('CAPTURE_SCHEMA_UNSUPPORTED');
    if (fields.some(c => /password|secret|token|credential/i.test(c.COLUMN_NAME))) throw fault('CAPTURE_SCHEMA_UNSUPPORTED');
    usedColumns.set(table, fields);
    const keys = columns.filter(c => c.COLUMN_KEY === 'PRI').map(c => c.COLUMN_NAME);
    if (!keys.length || keys.some(key => !fields.some(c => c.COLUMN_NAME === key))) throw fault('CAPTURE_PRIMARY_KEY_REQUIRED');
    const columnsSql = fields.map(c => 's.' + quote(c.COLUMN_NAME));
    const size = columnsSql.map(c => `COALESCE(OCTET_LENGTH(CAST(${c} AS CHAR CHARACTER SET utf8mb4)),0)`).join('+');
    const rowLimit = LARGE.has(table) ? 128 * 1024 : 8 * 1024;
    const select = fields.map(c => `CASE WHEN (${size})<=${rowLimit} THEN s.${quote(c.COLUMN_NAME)} ELSE NULL END AS ${quote(c.COLUMN_NAME)}`).join(',');
    let after = null; const result = [];
    while (true) {
      const predicate = after ? `AND (${keys.map(key => 's.' + quote(key)).join(',')})>(${keys.map(() => '?').join(',')})` : '';
      const pageSize = LARGE.has(table) ? 1 : 25;
      const page = await view.query(`SELECT /*+ MAX_EXECUTION_TIME(2000) */ (${size}) AS __capture_bytes,${select}
        FROM ${table} s WHERE ${table === 'ten_tenants' ? 's.id' : 's.tenant_id'}=? AND (${where}) ${predicate}
        ORDER BY ${keys.map(key => 's.' + quote(key)).join(',')} LIMIT ${pageSize}`, [tenantId, ...values, ...(after || [])]);
      for (const row of page) {
        if (Number(row.__capture_bytes) > rowLimit) throw fault('NEEDS_PARTITIONING');
        delete row.__capture_bytes;
        if (keys.some(key => typeof row[key] === 'number' && !Number.isSafeInteger(row[key]))) throw fault('CAPTURE_DEPENDENCY_ID');
        for (const column of fields) {
          // CASE can change mysql2's JSON field metadata. Decode only actual JSON columns.
          if (column.DATA_TYPE === 'json' && typeof row[column.COLUMN_NAME] === 'string') row[column.COLUMN_NAME] = JSON.parse(row[column.COLUMN_NAME]);
        }
        const identity = JSON.stringify(keys.map(key => row[key]));
        const map = maps.get(table) || new Map(); maps.set(table, map);
        if (!map.has(identity)) { map.set(identity, row); graphNodes++; }
        if (graphNodes > 4096) throw fault('NEEDS_PARTITIONING');
        result.push(row);
      }
      if (page.length < pageSize) break;
      const next = keys.map(key => page[page.length - 1][key]);
      if (next.some(value => value === null || value === undefined) || JSON.stringify(next) === JSON.stringify(after)) throw fault('CAPTURE_CURSOR_STALLED');
      after = next; view.check();
    }
    return result;
  }
  const byIds = (table, field, ids, extra = '1=1', values = []) => ids.length
    ? read(table, `s.${quote(field)} IN (?) AND (${extra})`, [unique(ids), ...values]) : Promise.resolve([]);

  const rootRows = await byIds('prod_products', 'id', [productId]);
  if (rootRows.length !== 1) throw fault('PRODUCT_NOT_FOUND');
  await read('ten_tenants', '1=1', [], ['id', 'price_rounding_mode', 'price_rounding_precision', 'timezone']);
  // The current full admin DTO exposes these complete bounded reference sets.
  await read('prod_units'); await read('prod_unit_conversions'); await read('prod_categories');
  const discounts = await read('mkt_discounts', 's.store_id=?', [storeId]);
  await byIds('mkt_discount_products', 'discount_id', unique(discounts.map(x => x.id)));

  let frontier = [productId];
  for (let depth = 0; frontier.length; depth++) {
    if (depth >= 16 || products.size + frontier.length > 256) throw fault('NEEDS_PARTITIONING');
    const rows = depth === 0 ? rootRows : await byIds('prod_products', 'id', frontier);
    if (rows.length !== frontier.length) throw fault(products.size ? 'CAPTURE_DEPENDENCY_MISSING' : 'PRODUCT_NOT_FOUND');
    frontier.forEach(id => products.add(id));
    const ingredients = await byIds('prod_product_ingredients', 'product_id', frontier);
    const assignments = await byIds('prod_variant_assignments', 'product_id', frontier);
    const links = await byIds('prod_option_assignments', 'assign_id', frontier, "s.assign_type='product'");
    const settings = await byIds('prod_option_item_product_settings', 'product_id', frontier);
    await byIds('prod_option_item_exclusions', 'product_id', frontier);
    await byIds('prod_variant_value_exclusions', 'product_id', frontier);
    await byIds('prod_product_categories', 'product_id', frontier);
    await byIds('prod_product_unit_links', 'product_id', frontier);
    await byIds('prod_product_stocks', 'product_id', frontier, 's.store_id=?', [storeId]);

    const groups = unique(links.map(x => x.group_id)).filter(id => !optionGroups.has(id));
    const groupRows = await byIds('prod_option_groups', 'id', groups);
    if (groupRows.length !== groups.length) throw fault('CAPTURE_DEPENDENCY_MISSING');
    groups.forEach(id => optionGroups.add(id));
    const items = await byIds('prod_option_items', 'group_id', groups);
    const variants = unique([...assignments.map(x => x.variant_group_id), ...items.map(x => x.default_variant_group_id),
      ...settings.map(x => x.default_variant_group_id)]).filter(id => !variantGroups.has(id));
    const variantRows = await byIds('prod_variant_groups', 'id', variants);
    if (variantRows.length !== variants.length) throw fault('CAPTURE_DEPENDENCY_MISSING');
    variants.forEach(id => variantGroups.add(id));
    await byIds('prod_variant_discount_tiers', 'variant_group_id', variants);

    const blockProducts = await byIds('prod_combo_block_products', 'product_id', frontier);
    const blockIds = unique(blockProducts.map(x => x.block_id));
    await byIds('prod_combo_blocks', 'id', blockIds);
    const sets = await byIds('prod_combo_set_blocks', 'block_id', blockIds);
    await byIds('prod_combos', 'id', unique(sets.map(x => x.combo_id)));

    const targets = [...ingredients.map(x => x.ingredient_id), ...items.map(x => x.target_product_id)];
    const categories = unique(items.map(x => x.target_category_id));
    if (categories.length) {
      const matches = await view.query(`SELECT DISTINCT product_id FROM prod_product_categories
        WHERE tenant_id=? AND category_id IN (?) ORDER BY product_id LIMIT 257`, [tenantId, categories]);
      if (matches.length >= 257) throw fault('NEEDS_PARTITIONING');
      targets.push(...matches.map(x => x.product_id));
    }
    frontier = unique(targets).filter(id => !products.has(id));
    view.check();
  }
  for (const table of TABLES) tables[table] = [...(maps.get(table)?.values() || [])];
  const schema = Object.fromEntries(TABLES.map(table => [table, (usedColumns.get(table) || []).map(c =>
    [c.COLUMN_NAME, c.COLUMN_TYPE, c.DATA_TYPE, c.COLUMN_KEY])]));
  return { projection: 'passport-raw-v1', productId, tenantId, storeId, tables, schema,
    schemaHash: crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex'),
    graph: { products: products.size, rows: graphNodes, planVersion: 1, declaredGraphClosed: true },
    // Closure of this declared raw plan is NOT proof of full builder equivalence.
    fullDtoParityVerified: false, passportComplete: false };
}
module.exports = { TABLES, load };
