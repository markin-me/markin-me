# Address Service

Self-hosted address search and normalization service for free-form address input.

## Why This Folder Exists

This service isolates address autocomplete and address resolution from the main application:

- the main app keeps using MySQL for business data
- address search runs in a dedicated PostgreSQL database with a separate search index
- the main app talks to this service over internal HTTP endpoints instead of calling public geocoders for every request
- prepared GAR/FIAS and optional OSM imports are stored in a dedicated search index, separate from the main schema

## Stack

- PostgreSQL
- Express

Optional extensions such as `postgis` and `pg_trgm` can improve search quality or geodata tooling, but the current service bootstrap is compatible with plain PostgreSQL 14+.

## Runtime

The service exposes three internal endpoints:

- `GET /internal/address/city-suggest`
- `GET /internal/address/suggest`
- `POST /internal/address/resolve`

All requests must include `x-address-service-token` when `ADDRESS_SERVICE_INTERNAL_TOKEN` is configured.

## Bootstrap

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with PostGIS.

If you use the bundled Compose file:

```bash
docker compose up -d
```

Then keep these values in `.env`:

```bash
ADDRESS_DB_HOST=127.0.0.1
ADDRESS_DB_PORT=54329
```

If you run both PostgreSQL and the service inside one Docker network, use:

```bash
ADDRESS_DB_HOST=address-db
ADDRESS_DB_PORT=5432
```

3. Install dependencies and verify database connectivity:

```bash
npm install
npm run db:check
```

4. Initialize the schema:

```bash
npm run db:init
```

5. Import prepared datasets:

The import scripts are batch-only and expect local prepared datasets:

- `import-gar-fias-jsonl.js`
  - root cities file
  - search entities file derived from GAR/FIAS
- `import-osm-geojson.js`
  - optional coordinate enrichment file derived from OSM

Example:

```bash
npm run import:gar -- --roots=./data/root-cities.jsonl --entries=./data/search-index.jsonl
npm run import:osm -- --file=./data/coordinates.geojson
```

6. Start the service:

```bash
npm run start
```

7. Point the main application to this service. In the repo root `.env`:

```bash
ADDRESS_SERVICE_URL=http://127.0.0.1:3400
ADDRESS_SERVICE_TOKEN=change-me
ADDRESS_SERVICE_TIMEOUT_MS=4500
```

`ADDRESS_SERVICE_TOKEN` in the main app must be equal to `ADDRESS_SERVICE_INTERNAL_TOKEN` in this service.

## Root Scripts

From the repository root you can use:

```bash
npm run address:service:install
npm run address:service:db:check
npm run address:service:db:init
npm run address:service:start
```

The service does not call public geocoders for live suggestions.
