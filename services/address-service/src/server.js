const express = require('express');
const config = require('./config');
const db = require('./db');
const { suggestCities, suggestAddresses, resolveAddress } = require('./search');

const app = express();

app.use(express.json({ limit: '5mb' }));

app.use((req, res, next) => {
  if (!config.internalToken) return next();
  const token = String(req.headers['x-address-service-token'] || '').trim();
  if (token && token === config.internalToken) return next();
  return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
});

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ ok: true });
  } catch (error) {
    return res.status(503).json({ ok: false, error: 'DB_UNAVAILABLE' });
  }
});

app.get('/internal/address/city-suggest', async (req, res) => {
  try {
    const result = await suggestCities(db, req.query && req.query.q, {
      limit: req.query && req.query.limit,
    });
    if (!result.ok) {
      return res.status(result.error === 'QUERY_REQUIRED' ? 400 : 502).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('address city suggest error:', error && error.message ? error.message : error);
    return res.status(500).json({ ok: false, error: 'ADDRESS_SERVICE_FAILED' });
  }
});

app.get('/internal/address/suggest', async (req, res) => {
  try {
    const result = await suggestAddresses(db, {
      stage: req.query && req.query.stage,
      city: req.query && req.query.city,
      cityId: req.query && req.query.city_id,
      cityCode: req.query && req.query.city_code,
      query: req.query && req.query.q,
      selectedSourceKey: req.query && req.query.selected_source_key,
      limit: req.query && req.query.limit,
    });
    if (!result.ok) {
      const error = result.error;
      const status = error === 'QUERY_REQUIRED' || error === 'CITY_REQUIRED' ? 400 : 502;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('address suggest error:', error && error.message ? error.message : error);
    return res.status(500).json({ ok: false, error: 'ADDRESS_SERVICE_FAILED' });
  }
});

app.post('/internal/address/resolve', async (req, res) => {
  try {
    const result = await resolveAddress(db, req.body || {});
    if (!result.ok) {
      const error = result.error;
      const status = (
        error === 'ADDRESS_REQUIRED'
        || error === 'CITY_REQUIRED'
        || error === 'CITY_SELECTION_REQUIRED'
        || error === 'HOUSE_REQUIRED'
        || error === 'ADDRESS_NOT_FOUND'
      ) ? 400 : 502;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (error) {
    console.error('address resolve error:', error && error.message ? error.message : error);
    return res.status(500).json({ ok: false, error: 'ADDRESS_SERVICE_FAILED' });
  }
});

app.listen(config.port, () => {
  console.log(`Address service listening on ${config.port}`);
});
