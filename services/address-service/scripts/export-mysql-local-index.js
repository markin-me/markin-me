const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { normalizeText } = require('../src/normalization');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => String(item || '').startsWith(prefix));
  return match ? String(match).slice(prefix.length) : fallback;
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(7)) : null;
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = (Array.isArray(rows) ? rows : [])
    .map((row) => JSON.stringify(row))
    .join('\n');
  fs.writeFileSync(filePath, payload ? `${payload}\n` : '', 'utf8');
}

function buildRootCityCode(localityId) {
  return `locality:${Number(localityId)}`;
}

function buildEntrySourceKey(source, sourceKey) {
  return `mysql:${String(source || 'mysql').trim()}:${String(sourceKey || '').trim()}`;
}

function buildDerivedStreetKey(localityId, streetName) {
  return `derived-street:${Number(localityId)}:${normalizeText(streetName)}`;
}

function buildStreetDisplay(row) {
  return String(row && (row.street_name || row.label) || '').trim();
}

function buildAddressDisplay(row) {
  return String(row && row.label || '').trim();
}

async function loadLocalities(connection) {
  const [rows] = await connection.query(
    `SELECT id,
            source,
            source_key,
            name,
            normalized_name,
            center_lat,
            center_lng
       FROM sys_address_localities
      WHERE is_active = 1
      ORDER BY name ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

async function loadEntries(connection) {
  const [rows] = await connection.query(
    `SELECT id,
            locality_id,
            source,
            source_key,
            object_type,
            label,
            full_address,
            street_name,
            house_number,
            lat,
            lng
       FROM sys_address_index
      ORDER BY locality_id ASC, id ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

function collectDerivedStreetRows(entries) {
  const streetKeysByLocality = new Map();
  const derivedByCompositeKey = new Map();

  for (const row of entries) {
    const localityId = Number(row && row.locality_id);
    const streetName = buildStreetDisplay(row);
    if (!localityId || !streetName) continue;
    const normalizedStreet = normalizeText(streetName);
    if (!normalizedStreet) continue;

    let streetMap = streetKeysByLocality.get(localityId);
    if (!streetMap) {
      streetMap = new Map();
      streetKeysByLocality.set(localityId, streetMap);
    }

    if (String(row && row.object_type || '').trim() === 'street') {
      streetMap.set(normalizedStreet, buildEntrySourceKey(row.source, row.source_key));
    }
  }

  for (const row of entries) {
    const localityId = Number(row && row.locality_id);
    const streetName = buildStreetDisplay(row);
    if (!localityId || !streetName) continue;
    if (String(row && row.object_type || '').trim() === 'street') continue;

    const normalizedStreet = normalizeText(streetName);
    if (!normalizedStreet) continue;

    let streetMap = streetKeysByLocality.get(localityId);
    if (!streetMap) {
      streetMap = new Map();
      streetKeysByLocality.set(localityId, streetMap);
    }
    if (streetMap.has(normalizedStreet)) continue;

    const derivedKey = buildDerivedStreetKey(localityId, streetName);
    const compositeKey = `${localityId}:${normalizedStreet}`;
    if (!derivedByCompositeKey.has(compositeKey)) {
      derivedByCompositeKey.set(compositeKey, {
        locality_id: localityId,
        source: 'derived',
        source_key: derivedKey,
        object_type: 'street',
        label: streetName,
        full_address: '',
        street_name: streetName,
        house_number: null,
        lat: toNumberOrNull(row && row.lat),
        lng: toNumberOrNull(row && row.lng),
      });
      streetMap.set(normalizedStreet, buildEntrySourceKey('derived', derivedKey));
    }
  }

  return {
    derivedRows: Array.from(derivedByCompositeKey.values()),
    streetKeysByLocality,
  };
}

function buildRootCityRows(localities) {
  return (Array.isArray(localities) ? localities : []).map((locality) => ({
    code: buildRootCityCode(locality.id),
    name: String(locality && locality.name || '').trim(),
    normalized_name: String(locality && locality.normalized_name || '').trim() || normalizeText(locality && locality.name),
    region_code: null,
    region_name: null,
    metadata: {
      source: String(locality && locality.source || '').trim() || 'mysql',
      source_key: String(locality && locality.source_key || '').trim(),
      center_lat: toNumberOrNull(locality && locality.center_lat),
      center_lng: toNumberOrNull(locality && locality.center_lng),
      imported_from: 'mysql-local-index',
    },
  }));
}

function buildSearchEntryRows(localities, sourceEntries, streetKeysByLocality) {
  const localitiesById = new Map(
    (Array.isArray(localities) ? localities : []).map((locality) => [Number(locality.id), locality])
  );

  return (Array.isArray(sourceEntries) ? sourceEntries : []).map((row) => {
    const localityId = Number(row && row.locality_id);
    const locality = localitiesById.get(localityId);
    if (!locality) return null;

    const mysqlObjectType = String(row && row.object_type || '').trim().toLowerCase();
    const isStreet = mysqlObjectType === 'street';
    const objectType = isStreet ? 'street' : 'address';
    const display = isStreet ? buildStreetDisplay(row) : buildAddressDisplay(row);
    if (!display) return null;

    const streetName = buildStreetDisplay(row);
    const normalizedStreet = normalizeText(streetName);
    const streetMap = streetKeysByLocality.get(localityId) || new Map();
    const sourceKey = buildEntrySourceKey(row && row.source, row && row.source_key);
    const streetSourceKey = normalizedStreet ? (streetMap.get(normalizedStreet) || null) : null;

    return {
      source_name: String(row && row.source || 'mysql').trim() || 'mysql',
      source_key: sourceKey,
      object_type: objectType,
      root_city_code: buildRootCityCode(localityId),
      locality_name: String(locality && locality.name || '').trim(),
      locality_display: String(locality && locality.name || '').trim(),
      locality_source_key: `root-city:${buildRootCityCode(localityId)}`,
      context_name: null,
      context_display: null,
      context_source_key: null,
      street_name: streetName || null,
      street_display: streetName || null,
      street_source_key: isStreet ? sourceKey : streetSourceKey,
      house_number: isStreet ? null : String(row && row.house_number || '').trim() || null,
      display,
      lat: toNumberOrNull(row && row.lat),
      lng: toNumberOrNull(row && row.lng),
      metadata: {
        imported_from: 'mysql-local-index',
        mysql_object_type: mysqlObjectType,
        mysql_locality_id: localityId,
        full_address: String(row && row.full_address || '').trim(),
        mysql_source: String(row && row.source || '').trim(),
        mysql_source_key: String(row && row.source_key || '').trim(),
      },
    };
  }).filter(Boolean);
}

async function main() {
  const outDir = path.resolve(
    process.cwd(),
    readArg('out-dir', 'data/import/mysql-local')
  );
  const rootsFile = path.join(outDir, 'root-cities.jsonl');
  const entriesFile = path.join(outDir, 'search-index.jsonl');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306) || 3306,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    charset: 'utf8mb4',
    connectTimeout: 20000,
  });

  try {
    const localities = await loadLocalities(connection);
    const rawEntries = await loadEntries(connection);
    const { derivedRows, streetKeysByLocality } = collectDerivedStreetRows(rawEntries);
    const allEntries = rawEntries.concat(derivedRows);

    const rootRows = buildRootCityRows(localities);
    const searchRows = buildSearchEntryRows(localities, allEntries, streetKeysByLocality);

    writeJsonl(rootsFile, rootRows);
    writeJsonl(entriesFile, searchRows);

    console.log(JSON.stringify({
      ok: true,
      outDir,
      rootsFile,
      entriesFile,
      localities: rootRows.length,
      sourceEntries: rawEntries.length,
      derivedStreetEntries: derivedRows.length,
      totalEntries: searchRows.length,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
