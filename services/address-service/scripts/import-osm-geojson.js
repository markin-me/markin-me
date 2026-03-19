require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const UPDATE_BATCH_SIZE = 500;

function readArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.find((item) => String(item || '').startsWith(prefix));
  return match ? String(match).slice(prefix.length) : fallback;
}

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(7)) : null;
}

function getFeatureCenter(feature) {
  const geometry = feature && feature.geometry;
  if (!geometry || typeof geometry !== 'object') return { lat: null, lng: null };
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
    return {
      lng: toNumberOrNull(geometry.coordinates[0]),
      lat: toNumberOrNull(geometry.coordinates[1]),
    };
  }
  return {
    lat: toNumberOrNull(feature && feature.properties && feature.properties.lat),
    lng: toNumberOrNull(feature && feature.properties && feature.properties.lng),
  };
}

async function main() {
  const file = readArg('file');
  if (!file) {
    throw new Error('FILE_REQUIRED');
  }
  const payload = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
  const features = Array.isArray(payload && payload.features) ? payload.features : [];
  const rows = [];
  for (const feature of features) {
    const properties = feature && feature.properties && typeof feature.properties === 'object'
      ? feature.properties
      : {};
    const sourceKey = String(properties.source_key || '').trim();
    if (!sourceKey) continue;
    const center = getFeatureCenter(feature);
    if (center.lat === null || center.lng === null) continue;
    rows.push({
      source_key: sourceKey,
      lat: center.lat,
      lng: center.lng,
    });
  }

  for (let offset = 0; offset < rows.length; offset += UPDATE_BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + UPDATE_BATCH_SIZE);
    const params = [];
    const values = chunk.map((row, index) => {
      const base = index * 3;
      params.push(row.source_key, row.lat, row.lng);
      return `($${base + 1}, $${base + 2}::numeric, $${base + 3}::numeric)`;
    });
    await db.query(
      `UPDATE ads_search_index AS idx
          SET lat = data.lat,
              lng = data.lng,
              updated_at = NOW()
         FROM (
           VALUES ${values.join(', ')}
         ) AS data(source_key, lat, lng)
        WHERE idx.source_key = data.source_key`,
      params
    );
  }
  await db.end();
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
