-- Combo preorder settings (MySQL). Apply manually once after schema review and backup.
-- Requires 2026-11-15_product_preorders.sql for products and order snapshots.
ALTER TABLE prod_combos
  ADD COLUMN sale_mode ENUM('order', 'preorder') NOT NULL DEFAULT 'order',
  ADD COLUMN preorder_settings_json JSON NULL;

-- Same version 1 settings contract as prod_products.preorder_settings_json.
-- Existing combos remain ordinary orders; no rows are converted into preorders.
-- Options inherit the parent sale mode. Shared combo blocks need no new columns.
-- Checkout intersects combo rules with rules of selected products/options only.
-- Order snapshots retain products[] and add combos[] with combo_id, settings,
-- accepted_at. Product and combo IDs belong to separate namespaces.
-- Snapshot entries may also retain scope and quantity for accepted portions;
-- increasing quantities validates the added portion without replacing saved rules.
-- DDL may commit independently. Inspect columns after interruption; do not rerun blindly.
-- No automatic rollback: dropping columns would discard accepted settings.
