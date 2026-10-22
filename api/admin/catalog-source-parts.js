'use strict';

const crypto = require('crypto');

// Raw, bounded source projections, NOT the computed full-product-passport DTO.
// No full builder, recursive graph walk, price calculation, or mutable snapshot cache.
const sources = Object.freeze({
  units: { table: 'prod_units', fields: ['id', 'code', 'title', 'short_title'], text: ['code', 'title', 'short_title'] },
  conversions: { table: 'prod_unit_conversions', fields: ['id', 'from_unit_id', 'to_unit_id', 'factor', 'is_active'] },
  'unit-links': { table: 'prod_product_unit_links', fields: ['id', 'product_id', 'unit_id', 'base_unit_id', 'factor'] },
  'ingredient-links': { table: 'prod_product_ingredients', fields: ['id', 'product_id', 'ingredient_id', 'quantity',
    'unit_id', 'quantity_min', 'quantity_max', 'quantity_step', 'price_override', 'is_variable', 'sort_order'] },
  'variant-links': { table: 'prod_variant_assignments', fields: ['id', 'product_id', 'variant_group_id',
    'default_value_index', 'sort_order', 'is_active'] },
  'option-links': { table: 'prod_option_assignments', fields: ['id', 'group_id', 'assign_type', 'assign_id',
    'priority', 'sort_order', 'product_display_order', 'is_active', 'selection_type', 'min_select', 'max_select'],
    text: ['assign_type', 'selection_type'] },
  'option-groups': { table: 'prod_option_groups', fields: ['id', 'title', 'selection_type', 'min_select', 'max_select',
    'is_active', 'is_required', 'allow_variants', 'out_of_stock_action', 'sort_order'], text: ['title', 'selection_type'] },
  'option-items': { table: 'prod_option_items', fields: ['id', 'group_id', 'target_type', 'target_product_id',
    'price_mode', 'price_value', 'qty_min', 'qty_max', 'is_active', 'sort_order', 'default_selected',
    'default_variant_group_id', 'default_variant_value_index'], text: ['target_type', 'price_mode'] },
  stock: { table: 'prod_product_stocks', key: 'product_id', store: true, fields: ['product_id', 'store_id', 'qty'] },
});
const MAX_ROWS = 4, MAX_ROW_BYTES = 12 * 1024, MAX_RESPONSE_BYTES = 64 * 1024;

module.exports = function registerCatalogSourceParts(router, { db, helpers, hasCatalogStoreScope }) {
  router.get('/admin/catalog/product-passport-source/:part', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const part = req.params.part, source = Object.prototype.hasOwnProperty.call(sources, part) && sources[part];
      if (!source) return res.status(404).json({ ok: false, error: 'UNKNOWN_CATALOG_SOURCE_PART' });
      const rawStore = req.headers['x-store-id'];
      if (typeof rawStore !== 'string' || !/^[1-9][0-9]*$/.test(rawStore) || !Number.isSafeInteger(Number(rawStore))) {
        return res.status(400).json({ ok: false, error: 'INVALID_CATALOG_PART_STORE' });
      }
      const tenantId = Number(helpers.getTenantId(req)), storeId = Number(helpers.getStoreId(req));
      if (Number(rawStore) !== storeId) return res.status(400).json({ ok: false, error: 'CATALOG_PART_STORE_CONFLICT' });
      if (!Number.isSafeInteger(tenantId) || tenantId <= 0
          || req.permission?.key !== 'products.catalog.read'
          || !['all', 'stores'].includes(req.permission?.accessRule)) {
        return res.status(403).json({ ok: false, error: 'CATALOG_PART_SCOPE_REQUIRED' });
      }
      const retry = req.query.retry_id;
      if (Object.keys(req.query).some(key => !['cursor', 'retry_id'].includes(key))
          || (retry !== undefined && (req.query.cursor !== undefined || typeof retry !== 'string'
            || !/^[1-9][0-9]*$/.test(retry) || !Number.isSafeInteger(Number(retry))))) {
        return res.status(400).json({ ok: false, error: 'INVALID_CATALOG_PART_QUERY' });
      }
      let afterId = 0;
      if (req.query.cursor !== undefined) {
        const cursor = req.query.cursor;
        if (typeof cursor !== 'string' || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
          return res.status(400).json({ ok: false, error: 'INVALID_CATALOG_PART_CURSOR' });
        }
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!Array.isArray(decoded) || decoded.length !== 6 || decoded[0] !== 1 || decoded[1] !== 'live-source'
            || decoded[2] !== part || decoded[3] !== tenantId || decoded[4] !== storeId
            || !Number.isSafeInteger(decoded[5]) || decoded[5] <= 0
            || Buffer.from(JSON.stringify(decoded)).toString('base64url') !== cursor) {
          return res.status(400).json({ ok: false, error: 'INVALID_CATALOG_PART_CURSOR' });
        }
        afterId = decoded[5];
      }
      const started = process.hrtime.bigint();
      if (!await hasCatalogStoreScope(tenantId, storeId)) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });
      const text = source.text || [], key = source.key || 'id';
      const textBytes = text.length ? text.map(field => `OCTET_LENGTH(COALESCE(s.${field}, ''))`).join('+') : '0';
      // SQL identifiers come exclusively from the private whitelist above.
      const columns = source.fields.map(field => text.includes(field)
        ? `CASE WHEN (${textBytes})<=2048 THEN s.${field} ELSE NULL END AS ${field}` : `s.${field}`).join(', ');
      const parameters = [tenantId, ...(source.store ? [storeId] : []), retry ? Number(retry) : afterId];
      const [rows] = await db.query(`SELECT /*+ MAX_EXECUTION_TIME(2000) */ s.${key} AS row_id,
        (${textBytes}) AS text_bytes, ${columns} FROM ${source.table} s
        WHERE s.tenant_id=? ${source.store ? 'AND s.store_id=?' : ''} AND s.${key}${retry ? '=' : '>'}?
        ORDER BY s.${key} ASC LIMIT ${retry ? 1 : MAX_ROWS}`, parameters);
      let previous = afterId;
      const records = rows.map(row => {
        const id = Number(row.row_id);
        if (!Number.isSafeInteger(id) || id <= previous) throw new Error('INVALID_SOURCE_KEYSET');
        previous = id;
        const data = Object.fromEntries(source.fields.map(field => [field, row[field]]));
        const serialized = JSON.stringify(data), oversized = Number(row.text_bytes) > 2048
          || Buffer.byteLength(serialized) > MAX_ROW_BYTES;
        return oversized ? { id, data: null, sourceVersion: null, issue: {
          reason: 'CATALOG_SOURCE_ROW_TOO_LARGE', textBytes: Number(row.text_bytes),
        } } : { id, data, sourceVersion: crypto.createHash('sha256')
          .update(JSON.stringify([1, 'live-source', part, tenantId, storeId, data])).digest('hex'), issue: null };
      });
      const cursor = records.length ? Buffer.from(JSON.stringify([1, 'live-source', part, tenantId, storeId, previous])).toString('base64url') : null;
      const payload = { ok: true, formatVersion: 1, projection: 'live-source', part, tenantId, storeId, records, cursor,
        scanExhausted: !records.length, snapshotId: null, snapshotConsistent: false, sealed: false, passportComplete: false };
      const body = JSON.stringify(payload), bytes = Buffer.byteLength(body);
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('SOURCE_RESPONSE_LIMIT');
      res.set('X-Catalog-Part-Queries', '2');
      res.set('X-Catalog-Part-Ms', (Number(process.hrtime.bigint() - started) / 1e6).toFixed(1));
      res.set('X-Catalog-Part-Bytes', String(bytes));
      return res.type('application/json').send(body);
    } catch (error) {
      if (error instanceof SyntaxError) return res.status(400).json({ ok: false, error: 'INVALID_CATALOG_PART_CURSOR' });
      console.error('CATALOG_SOURCE_PART_FAILED:', error.code || error.name);
      return res.status(500).json({ ok: false, error: 'CATALOG_SOURCE_PART_FAILED' });
    }
  });
};
