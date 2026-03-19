require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('../src/db');
const { normalizeText, compactText, normalizeHouseToken, buildSearchText } = require('../src/normalization');

const ROOT_CITY_BATCH_SIZE = 100;
const SEARCH_ENTRY_BATCH_SIZE = 250;

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => String(item || '').startsWith(prefix));
  return match ? String(match).slice(prefix.length) : fallback;
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(7)) : null;
}

function normalizeRootCityRecord(record) {
  const code = String(record && (record.code || record.root_city_code) || '').trim();
  const name = String(record && record.name || '').trim();
  if (!code || !name) throw new Error('ROOT_CITY_RECORD_INVALID');
  return {
    code,
    name,
    normalized_name: normalizeText(name),
    region_code: String(record && record.region_code || '').trim() || null,
    region_name: String(record && record.region_name || '').trim() || null,
    metadata: record && record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
  };
}

function normalizeSearchEntry(record, rootCityId) {
  const sourceKey = String(record && record.source_key || '').trim();
  const objectType = String(record && record.object_type || '').trim().toLowerCase();
  const display = String(record && record.display || '').trim();
  if (!sourceKey || !display || !['context', 'street', 'address'].includes(objectType)) {
    throw new Error('SEARCH_ENTRY_INVALID');
  }
  const houseNumber = String(record && record.house_number || '').trim();
  const localityDisplay = String(record && (record.locality_display || record.locality_name) || '').trim();
  return {
    source_name: String(record && record.source_name || 'gar-fias').trim() || 'gar-fias',
    source_key: sourceKey,
    object_type: objectType,
    root_city_id: rootCityId,
    locality_name: String(record && record.locality_name || localityDisplay).trim() || localityDisplay,
    locality_display: localityDisplay,
    locality_source_key: String(record && record.locality_source_key || '').trim() || null,
    context_name: String(record && record.context_name || '').trim() || null,
    context_display: String(record && record.context_display || record.context_name || '').trim() || null,
    context_source_key: String(record && record.context_source_key || '').trim() || null,
    street_name: String(record && record.street_name || '').trim() || null,
    street_display: String(record && record.street_display || record.street_name || '').trim() || null,
    street_source_key: String(record && record.street_source_key || '').trim() || null,
    house_number: houseNumber || null,
    normalized_house: houseNumber ? normalizeHouseToken(houseNumber) : null,
    display,
    normalized_display: normalizeText(display),
    normalized_compact: compactText(display),
    search_text: buildSearchText([
      display,
      record && record.locality_name,
      record && record.locality_display,
      record && record.context_name,
      record && record.context_display,
      record && record.street_name,
      record && record.street_display,
      houseNumber,
      ...(Array.isArray(record && record.aliases) ? record.aliases : []),
    ]),
    lat: toNumberOrNull(record && record.lat),
    lng: toNumberOrNull(record && record.lng),
    metadata: record && record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
  };
}

async function upsertRootCities(records) {
  if (!Array.isArray(records) || !records.length) return [];
  const params = [];
  const values = records.map((record, index) => {
    const base = index * 6;
    params.push(
      record.code,
      record.name,
      record.normalized_name,
      record.region_code,
      record.region_name,
      JSON.stringify(record.metadata || {})
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`;
  });

  const { rows } = await db.query(
    `INSERT INTO ads_root_cities
      (code, name, normalized_name, region_code, region_name, metadata)
     VALUES ${values.join(', ')}
     ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      normalized_name = EXCLUDED.normalized_name,
      region_code = EXCLUDED.region_code,
      region_name = EXCLUDED.region_name,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
     RETURNING id, code`,
    params
  );
  return rows || [];
}

async function upsertSearchEntries(records) {
  if (!Array.isArray(records) || !records.length) return;
  const params = [];
  const values = records.map((record, index) => {
    const base = index * 22;
    params.push(
      record.source_name,
      record.source_key,
      record.object_type,
      record.root_city_id,
      record.locality_name,
      record.locality_display,
      record.locality_source_key,
      record.context_name,
      record.context_display,
      record.context_source_key,
      record.street_name,
      record.street_display,
      record.street_source_key,
      record.house_number,
      record.normalized_house,
      record.display,
      record.normalized_display,
      record.normalized_compact,
      record.search_text,
      record.lat,
      record.lng,
      JSON.stringify(record.metadata || {})
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}, $${base + 22}::jsonb)`;
  });

  await db.query(
    `INSERT INTO ads_search_index
      (source_name, source_key, object_type, root_city_id, locality_name, locality_display, locality_source_key,
       context_name, context_display, context_source_key, street_name, street_display, street_source_key,
       house_number, normalized_house, display, normalized_display, normalized_compact, search_text, lat, lng, metadata)
     VALUES ${values.join(', ')}
     ON CONFLICT (source_key) DO UPDATE SET
      source_name = EXCLUDED.source_name,
      object_type = EXCLUDED.object_type,
      root_city_id = EXCLUDED.root_city_id,
      locality_name = EXCLUDED.locality_name,
      locality_display = EXCLUDED.locality_display,
      locality_source_key = EXCLUDED.locality_source_key,
      context_name = EXCLUDED.context_name,
      context_display = EXCLUDED.context_display,
      context_source_key = EXCLUDED.context_source_key,
      street_name = EXCLUDED.street_name,
      street_display = EXCLUDED.street_display,
      street_source_key = EXCLUDED.street_source_key,
      house_number = EXCLUDED.house_number,
      normalized_house = EXCLUDED.normalized_house,
      display = EXCLUDED.display,
      normalized_display = EXCLUDED.normalized_display,
      normalized_compact = EXCLUDED.normalized_compact,
      search_text = EXCLUDED.search_text,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    params
  );
}

async function importJsonl(filePath, onRecord) {
  const stream = fs.createReadStream(path.resolve(process.cwd(), filePath), { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const raw = String(line || '').trim();
    if (!raw) continue;
    await onRecord(JSON.parse(raw));
  }
}

async function main() {
  const rootsFile = readArg('roots');
  const entriesFile = readArg('entries');
  if (!rootsFile || !entriesFile) {
    throw new Error('ARGS_REQUIRED');
  }
  const rootCityIds = new Map();
  await db.query('BEGIN');
  try {
    const rootBatch = [];
    await importJsonl(rootsFile, async (record) => {
      rootBatch.push(normalizeRootCityRecord(record));
      if (rootBatch.length < ROOT_CITY_BATCH_SIZE) return;
      const rows = await upsertRootCities(rootBatch.splice(0, rootBatch.length));
      rows.forEach((row) => {
        rootCityIds.set(String(row.code || '').trim(), Number(row.id));
      });
    });
    if (rootBatch.length) {
      const rows = await upsertRootCities(rootBatch.splice(0, rootBatch.length));
      rows.forEach((row) => {
        rootCityIds.set(String(row.code || '').trim(), Number(row.id));
      });
    }

    const entryBatch = [];
    await importJsonl(entriesFile, async (record) => {
      const code = String(record && record.root_city_code || '').trim();
      const rootCityId = rootCityIds.get(code);
      if (!rootCityId) return;
      entryBatch.push(normalizeSearchEntry(record, rootCityId));
      if (entryBatch.length < SEARCH_ENTRY_BATCH_SIZE) return;
      await upsertSearchEntries(entryBatch.splice(0, entryBatch.length));
    });
    if (entryBatch.length) {
      await upsertSearchEntries(entryBatch.splice(0, entryBatch.length));
    }

    await db.query('COMMIT');
    await db.end();
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    await db.end();
    throw error;
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
