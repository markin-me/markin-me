ALTER TABLE mkt_bonus_levels
  ADD COLUMN reward_bonus_amount decimal(14,2) NOT NULL DEFAULT 0.00
  AFTER access_type;
