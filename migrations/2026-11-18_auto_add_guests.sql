-- Apply once before configuring guest access to auto-add gifts.
ALTER TABLE prod_auto_add_groups
  ADD COLUMN available_to_guests TINYINT(1) NOT NULL DEFAULT 1;
