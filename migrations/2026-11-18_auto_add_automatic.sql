-- Apply once before using manual auto-add gift claims.
ALTER TABLE prod_auto_add_groups
  ADD COLUMN add_automatically TINYINT(1) NOT NULL DEFAULT 1;
