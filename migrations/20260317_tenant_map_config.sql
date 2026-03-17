ALTER TABLE `ten_tenants`
  ADD COLUMN `map_provider_name` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Tenant map tile provider name',
  ADD COLUMN `map_tile_url` varchar(2048) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Tenant map tile URL template',
  ADD COLUMN `map_attribution` text COLLATE utf8mb4_general_ci COMMENT 'Tenant map attribution HTML',
  ADD COLUMN `map_max_zoom` tinyint UNSIGNED DEFAULT 22 COMMENT 'Tenant map max zoom',
  ADD COLUMN `map_subdomains` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Tenant map subdomains list',
  ADD COLUMN `map_geocoder_provider_name` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Tenant geocoder provider name',
  ADD COLUMN `map_geocoder_search_url` varchar(2048) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Tenant geocoder search endpoint',
  ADD COLUMN `map_geocoder_country_code` varchar(8) COLLATE utf8mb4_general_ci DEFAULT 'ru' COMMENT 'Tenant geocoder country code',
  ADD COLUMN `map_geocoder_language` varchar(16) COLLATE utf8mb4_general_ci DEFAULT 'ru' COMMENT 'Tenant geocoder language',
  ADD COLUMN `map_geocoder_result_limit` tinyint UNSIGNED NOT NULL DEFAULT 5 COMMENT 'Tenant geocoder result limit',
  ADD COLUMN `store_address_map_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Enable address lookup with map for this tenant',
  ADD COLUMN `delivery_zone_polygon_provider` varchar(64) COLLATE utf8mb4_general_ci DEFAULT 'Leaflet-Geoman' COMMENT 'Tenant delivery zone polygon provider';

UPDATE `ten_tenants`
SET
  `map_provider_name` = 'Thunderforest',
  `map_tile_url` = 'https://api.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=c062dec927e34ab9b90c18fae6cbcb8e',
  `map_attribution` = '<a href="https://www.thunderforest.com/" target="_blank">&copy; Thunderforest</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
  `map_max_zoom` = 22,
  `map_subdomains` = '',
  `map_geocoder_provider_name` = 'Nominatim',
  `map_geocoder_search_url` = 'https://nominatim.openstreetmap.org/search',
  `map_geocoder_country_code` = 'ru',
  `map_geocoder_language` = 'ru',
  `map_geocoder_result_limit` = 5,
  `store_address_map_enabled` = 1,
  `delivery_zone_polygon_provider` = 'Leaflet-Geoman'
WHERE
  COALESCE(`map_provider_name`, '') = ''
  AND COALESCE(`map_tile_url`, '') = ''
  AND COALESCE(`map_geocoder_search_url`, '') = '';
