ALTER TABLE mkt_bonus_levels
ADD COLUMN favorite_category_group_id INT UNSIGNED NULL AFTER favorite_categories_limit,
ADD CONSTRAINT fk_mkt_bonus_levels_category_group
    FOREIGN KEY (favorite_category_group_id)
    REFERENCES mkt_bonus_category_groups(id)
    ON DELETE SET NULL;
