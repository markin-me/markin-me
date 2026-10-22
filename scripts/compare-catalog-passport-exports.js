'use strict';

// Read-only shadow comparison of two already captured passport JSON files.
// Does not import db.js, call an API, create exports or write business data.
// Usage: node scripts/compare-catalog-passport-exports.js legacy.json candidate.json
const fs = require('fs');
const crypto = require('crypto');
const requiredFields = Object.freeze(['product', 'units', 'unitConversions', 'productUnitLinks',
  'stock', 'availability', 'ingredients', 'nestedIngredients', 'variants', 'options',
  'optionAssignments', 'defaultConfig', 'comboRefs', 'editor', 'benefits', 'texts',
  'visibility', 'nutrition', 'revision']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function load(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('SHADOW_INPUT_LIMIT');
  const bytes = fs.readFileSync(file), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value?.product || !Number.isSafeInteger(value.product.id) || value.product.id <= 0
      || Object.keys(value).length !== requiredFields.length
      || requiredFields.some(key => !Object.prototype.hasOwnProperty.call(value, key))
      || value.revision?.data_version !== 'full-product-passport-v1'
      || value.editor?.schema_version !== 'product-editor-v1') throw new Error('SHADOW_FULL_ADMIN_PASSPORT_REQUIRED');
  const normalized = JSON.stringify(canonical(value));
  return { value, bytes: bytes.length, normalized,
    sha256: crypto.createHash('sha256').update(normalized).digest('hex') };
}
function differences(a, b, path = '$', result = []) {
  if (result.length >= 20 || a === b) return result;
  if (Array.isArray(a) !== Array.isArray(b) || a === null || b === null || typeof a !== typeof b
      || typeof a !== 'object') { result.push(path); return result; }
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (!Object.prototype.hasOwnProperty.call(a, key) || !Object.prototype.hasOwnProperty.call(b, key)) result.push(path + '.' + key);
    else differences(a[key], b[key], path + '.' + key, result);
    if (result.length >= 20) break;
  }
  return result;
}
try {
  if (process.argv.length !== 4) throw new Error('TWO_INPUT_FILES_REQUIRED');
  const before = load(process.argv[2]), after = load(process.argv[3]);
  if (before.value.product.id !== after.value.product.id
      || before.value.product.tenant_id !== after.value.product.tenant_id
      || before.value.stock?.store_id !== after.value.stock?.store_id) throw new Error('SHADOW_SCOPE_MISMATCH');
  const equal = before.normalized === after.normalized;
  // No values, secrets or full DTO in output. No ignored timestamps/business fields.
  console.log(JSON.stringify({ equal, excludedFields: [], before: { bytes: before.bytes, sha256: before.sha256 },
    after: { bytes: after.bytes, sha256: after.sha256 }, differingPaths: differences(before.value, after.value) }));
  if (!equal) process.exitCode = 1;
} catch (error) {
  console.error(['SHADOW_INPUT_LIMIT', 'SHADOW_FULL_ADMIN_PASSPORT_REQUIRED', 'TWO_INPUT_FILES_REQUIRED', 'SHADOW_SCOPE_MISMATCH'].includes(error.message)
    ? error.message : 'SHADOW_COMPARISON_FAILED');
  process.exitCode = 1;
}
