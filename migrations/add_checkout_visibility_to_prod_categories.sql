ALTER TABLE prod_categories
  ADD COLUMN checkout_visibility TINYINT(1) NOT NULL DEFAULT 1 AFTER cart_visibility;

UPDATE prod_categories
SET checkout_visibility = 1
WHERE checkout_visibility IS NULL OR checkout_visibility <> 1;
