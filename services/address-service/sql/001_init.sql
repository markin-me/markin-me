CREATE TABLE IF NOT EXISTS ads_root_cities (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  region_code VARCHAR(32),
  region_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_search_index (
  id BIGSERIAL PRIMARY KEY,
  source_name VARCHAR(32) NOT NULL DEFAULT 'import',
  source_key VARCHAR(255) NOT NULL UNIQUE,
  object_type VARCHAR(24) NOT NULL CHECK (object_type IN ('context', 'street', 'address')),
  root_city_id BIGINT NOT NULL REFERENCES ads_root_cities(id) ON DELETE CASCADE,
  locality_name VARCHAR(255) NOT NULL,
  locality_display VARCHAR(255) NOT NULL,
  locality_source_key VARCHAR(255),
  context_name VARCHAR(255),
  context_display VARCHAR(255),
  context_source_key VARCHAR(255),
  street_name VARCHAR(255),
  street_display VARCHAR(255),
  street_source_key VARCHAR(255),
  house_number VARCHAR(64),
  normalized_house VARCHAR(64),
  display VARCHAR(512) NOT NULL,
  normalized_display VARCHAR(512) NOT NULL,
  normalized_compact VARCHAR(512) NOT NULL,
  search_text TEXT NOT NULL,
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_root_cities_active ON ads_root_cities(is_active, name);
CREATE INDEX IF NOT EXISTS idx_ads_root_cities_normalized_name ON ads_root_cities(normalized_name);

CREATE INDEX IF NOT EXISTS idx_ads_search_root_type ON ads_search_index(root_city_id, object_type);
CREATE INDEX IF NOT EXISTS idx_ads_search_context_key ON ads_search_index(root_city_id, context_source_key);
CREATE INDEX IF NOT EXISTS idx_ads_search_street_key ON ads_search_index(root_city_id, street_source_key);
CREATE INDEX IF NOT EXISTS idx_ads_search_house ON ads_search_index(root_city_id, normalized_house);
CREATE INDEX IF NOT EXISTS idx_ads_search_display ON ads_search_index(root_city_id, normalized_display);
CREATE INDEX IF NOT EXISTS idx_ads_search_compact ON ads_search_index(root_city_id, normalized_compact);
