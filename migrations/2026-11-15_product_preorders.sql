-- Product preorder settings and order snapshots (MySQL).
-- Apply manually once, after checking the actual schema and taking a backup.
-- This migration only adds storage; application integration is separate.
-- Existing products and orders retain ordinary ordering via DEFAULT 'order'.
-- fulfillment_mode (stock / made_to_order) remains unchanged.

ALTER TABLE prod_products
  ADD COLUMN sale_mode ENUM('order', 'preorder') NOT NULL DEFAULT 'order',
  ADD COLUMN preorder_settings_json JSON NULL;

ALTER TABLE order_orders
  ADD COLUMN sale_mode ENUM('order', 'preorder') NOT NULL DEFAULT 'order',
  ADD COLUMN preorder_snapshot_json JSON NULL;

-- Reuse the existing order_orders.scheduled_at for receipt date/time.
-- Do not infer sale_mode from scheduled_at: ordinary orders may be scheduled.
-- preorder_snapshot_json records the accepted product rules at checkout;
-- subsequent product edits must not rewrite existing order snapshots.
-- Suggested snapshot shape:
-- {"version":1,"products":[{"product_id":123,"settings":{...}}]}

-- preorder_settings_json contract (validated by the application):
-- {
--   "version": 1,
--   "lead_hours": 48,
--   "acceptance": {
--     "mode": "period",
--     "start": "2026-11-15",
--     "end": "2026-12-25"
--   },
--   "receipt": {
--     "mode": "dates",
--     "start": null,
--     "end": null,
--     "dates": ["2026-12-30", "2026-12-31"],
--     "weekdays": [0, 1, 2, 3, 4]
--   }
-- }
-- acceptance.mode: any | period. Checks the date of order placement.
-- receipt.mode: any | period | dates. Checks the receipt date.
-- Periods include both endpoints; start must not be after end.
-- Dates use YYYY-MM-DD in the fulfillment store's timezone.
-- weekdays: unique integers 0 (Monday) through 6 (Sunday).
-- Empty weekdays means no weekday restriction.
-- Receipt dates/period INTERSECT weekdays, never combine by union.
-- Reject an empty intersection for a finite period or explicit date list.
-- Also check lead_hours and store/delivery time slots at checkout.
-- lead_hours is a positive integer, including manually entered intervals.
-- For sale_mode='preorder', valid settings are required by the application.
-- NULL settings must not silently mean unrestricted preordering.
-- JSON types ensure JSON syntax only, not this business-rule contract.

-- No existing records are converted into preorders by this migration.
-- MySQL DDL may commit independently: if application is interrupted, inspect
-- both tables before continuing; do not blindly rerun these ALTER statements.
-- No automatic rollback: removing these columns would discard saved settings
-- and order snapshots. Column removal requires a separate reviewed operation.
