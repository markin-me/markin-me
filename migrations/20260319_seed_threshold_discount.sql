SET @threshold_discount_title := 'Пороговая скидка 1000';
SET @threshold_discount_description := 'Подарок от 1000 ₽';
SET @threshold_discount_mechanic_json := '{"type":"threshold","threshold_basis":"before_discounts","threshold_apply_mode":"best_only","tiers":[{"min_amount":1000,"buy_qty":1,"reward_qty":1,"reward_kind":"product","reward_products_config_mode":"any","reward_products":[{"entity_type":"product","entity_id":80}],"reward_discount_source":{"discount_id":null},"reward_promo_source":{"source_promo_code_id":null,"source_discount_id":null,"source_code":""},"reward_discount":{"discount_type":"percent","discount_value":null}}]}';

INSERT INTO `mkt_discounts` (
  `tenant_id`,
  `store_id`,
  `title`,
  `description`,
  `discount_type`,
  `discount_value`,
  `apply_to`,
  `usage_count`,
  `priority`,
  `is_stackable`,
  `is_active`,
  `activation_mode`,
  `reward_type`,
  `mechanic_type`,
  `mechanic_config_json`
)
SELECT
  1,
  1,
  @threshold_discount_title,
  @threshold_discount_description,
  'percent',
  0.00,
  'order',
  0,
  0,
  0,
  1,
  'auto',
  'gift',
  'threshold',
  @threshold_discount_mechanic_json
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
    FROM `mkt_discounts`
   WHERE `tenant_id` = 1
     AND `store_id` = 1
     AND `title` = @threshold_discount_title
     AND `mechanic_type` = 'threshold'
);
