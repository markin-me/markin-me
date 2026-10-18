UPDATE `prod_products` p
SET p.`blocks_config_json` = JSON_SET(
  CASE
    WHEN p.`blocks_config_json` IS NOT NULL
     AND p.`blocks_config_json` <> ''
     AND JSON_VALID(p.`blocks_config_json`)
      THEN p.`blocks_config_json`
    ELSE JSON_OBJECT()
  END,
  '$.ingredients',
  TRUE
)
WHERE EXISTS (
  SELECT 1
  FROM `prod_product_ingredients` i
  WHERE i.`tenant_id` = p.`tenant_id`
    AND i.`product_id` = p.`id`
    AND (i.`is_variable` = 1 OR i.`is_variable` IS NULL)
)
AND CASE
  WHEN p.`blocks_config_json` IS NOT NULL
   AND p.`blocks_config_json` <> ''
   AND JSON_VALID(p.`blocks_config_json`)
    THEN JSON_EXTRACT(p.`blocks_config_json`, '$.ingredients') IS NULL
  ELSE TRUE
END;

UPDATE `prod_products` p
SET p.`blocks_config_json` = JSON_SET(
  CASE
    WHEN p.`blocks_config_json` IS NOT NULL
     AND p.`blocks_config_json` <> ''
     AND JSON_VALID(p.`blocks_config_json`)
      THEN p.`blocks_config_json`
    ELSE JSON_OBJECT()
  END,
  '$.options',
  TRUE
)
WHERE EXISTS (
  SELECT 1
  FROM `prod_option_assignments` a
  JOIN `prod_option_groups` g
    ON g.`tenant_id` = a.`tenant_id`
   AND g.`id` = a.`group_id`
  WHERE a.`tenant_id` = p.`tenant_id`
    AND a.`assign_type` = 'product'
    AND a.`assign_id` = p.`id`
    AND a.`is_active` = 1
    AND g.`is_active` = 1
)
AND CASE
  WHEN p.`blocks_config_json` IS NOT NULL
   AND p.`blocks_config_json` <> ''
   AND JSON_VALID(p.`blocks_config_json`)
    THEN JSON_EXTRACT(p.`blocks_config_json`, '$.options') IS NULL
  ELSE TRUE
END;

UPDATE `prod_products` p
SET p.`blocks_config_json` = JSON_SET(
  CASE
    WHEN p.`blocks_config_json` IS NOT NULL
     AND p.`blocks_config_json` <> ''
     AND JSON_VALID(p.`blocks_config_json`)
      THEN p.`blocks_config_json`
    ELSE JSON_OBJECT()
  END,
  '$.variants',
  TRUE
)
WHERE EXISTS (
  SELECT 1
  FROM `prod_variant_assignments` va
  JOIN `prod_variant_groups` vg
    ON vg.`id` = va.`variant_group_id`
  WHERE va.`tenant_id` = p.`tenant_id`
    AND va.`product_id` = p.`id`
    AND va.`is_active` = 1
    AND vg.`is_active` = 1
)
AND CASE
  WHEN p.`blocks_config_json` IS NOT NULL
   AND p.`blocks_config_json` <> ''
   AND JSON_VALID(p.`blocks_config_json`)
    THEN JSON_EXTRACT(p.`blocks_config_json`, '$.variants') IS NULL
  ELSE TRUE
END;
