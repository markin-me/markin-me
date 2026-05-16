ALTER TABLE `mkt_bonus_category_groups`
  ADD COLUMN `month_number` tinyint UNSIGNED NULL AFTER `title`;

CREATE TABLE IF NOT EXISTS `mkt_bonus_category_group_items` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `group_id` int UNSIGNED NOT NULL,
  `category_id` int UNSIGNED NOT NULL,
  `bonus_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_bonus_category_group_items_group_category` (`group_id`,`category_id`),
  KEY `idx_mkt_bonus_category_group_items_tenant_group` (`tenant_id`,`group_id`),
  KEY `idx_mkt_bonus_category_group_items_category` (`tenant_id`,`category_id`),
  CONSTRAINT `fk_mkt_bonus_category_group_items_group`
    FOREIGN KEY (`group_id`) REFERENCES `mkt_bonus_category_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @bonus_category_group_tenant := 0;
SET @bonus_category_group_row := 0;

CREATE TEMPORARY TABLE `tmp_bonus_existing_category_groups` AS
SELECT ranked.`id`,
       ranked.`tenant_id`,
       ranked.`row_number`
  FROM (
    SELECT groups_source.`id`,
           groups_source.`tenant_id`,
           @bonus_category_group_row := IF(@bonus_category_group_tenant = groups_source.`tenant_id`, @bonus_category_group_row + 1, 1) AS `row_number`,
           @bonus_category_group_tenant := groups_source.`tenant_id`
      FROM (
        SELECT `id`, `tenant_id`
          FROM `mkt_bonus_category_groups`
         WHERE `month_number` IS NULL
         ORDER BY `tenant_id`, `id`
      ) groups_source
  ) ranked;

UPDATE `mkt_bonus_category_groups` groups_target
  JOIN `tmp_bonus_existing_category_groups` ranked ON ranked.`id` = groups_target.`id`
   SET groups_target.`month_number` = ((MONTH(CURDATE()) + ranked.`row_number` - 2) % 12) + 1
 WHERE groups_target.`month_number` IS NULL;

DROP TEMPORARY TABLE `tmp_bonus_existing_category_groups`;

CREATE TEMPORARY TABLE `tmp_bonus_month_numbers` (`month_number` tinyint UNSIGNED NOT NULL PRIMARY KEY);
INSERT INTO `tmp_bonus_month_numbers` (`month_number`) VALUES
  (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12);

INSERT INTO `mkt_bonus_category_groups`
  (`tenant_id`, `title`, `month_number`, `bonus_percent`, `categories_limit`, `category_ids`)
SELECT tenants.`tenant_id`,
       CONCAT('month_', months.`month_number`),
       months.`month_number`,
       0,
       0,
       JSON_ARRAY()
  FROM (
    SELECT DISTINCT `tenant_id` FROM `mkt_bonus_category_groups`
    UNION
    SELECT DISTINCT `tenant_id` FROM `mkt_bonus_program_settings`
    UNION
    SELECT DISTINCT `tenant_id` FROM `mkt_bonus_levels`
  ) tenants
 CROSS JOIN `tmp_bonus_month_numbers` months
 WHERE NOT EXISTS (
   SELECT 1
     FROM `mkt_bonus_category_groups` existing
    WHERE existing.`tenant_id` = tenants.`tenant_id`
      AND existing.`month_number` = months.`month_number`
 );

DROP TEMPORARY TABLE `tmp_bonus_month_numbers`;

ALTER TABLE `mkt_bonus_category_groups`
  MODIFY COLUMN `month_number` tinyint UNSIGNED NOT NULL,
  ADD UNIQUE KEY `uq_mkt_bonus_category_groups_tenant_month` (`tenant_id`,`month_number`),
  ADD KEY `idx_mkt_bonus_category_groups_tenant_month` (`tenant_id`,`month_number`);
