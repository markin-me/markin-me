-- MySQL. Apply manually once, before deploying the updated auto-add settings API.
-- Additive migration: legacy rules and order snapshots are not rewritten.
-- rule_version=0: legacy cart rules; rule_version=1: the new free-gift settings.
-- total_issue_limit counts free units across all customers, not orders.
-- No historical usage is inferred from orders.

ALTER TABLE prod_auto_add_groups
  ADD COLUMN rule_version TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN first_free TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN total_issue_limit BIGINT UNSIGNED NULL,
  ADD COLUMN issued_qty BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN schedule_json JSON NULL;

ALTER TABLE prod_auto_add_items
  ADD COLUMN schedule_slot VARCHAR(20) NOT NULL DEFAULT 'shared',
  ADD INDEX idx_auto_add_item_scope (tenant_id, group_id, schedule_slot, product_id);

CREATE TABLE prod_auto_add_order_usage (
  tenant_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  qty BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (tenant_id, order_id, group_id),
  KEY idx_auto_add_usage_group (tenant_id, group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- schedule_slot: 'shared', 'weekday:0' .. 'weekday:6' (Monday=0), or YYYY-MM-DD.
-- Duplicate product IDs are allowed on different days; the API validates
-- uniqueness of (schedule_slot, product_id) inside one rule.
-- schedule_json:
-- {"mode":"schedule","assignment":"individual","basis":"receipt",
--  "settings":{"receipt":{"mode":"period","start":"2026-11-01",
--    "end":"2026-11-30","dates":[],"weekdays":[0,3]}}}
-- mode: always|schedule; assignment: shared|individual; basis: created|receipt.
-- Receipt mode: any|period|dates. Empty weekdays means every day.
-- UI-only state (selected slot, open month, open calendar) is not persisted.
