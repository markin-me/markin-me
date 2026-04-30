ALTER TABLE mkt_bonus_levels
  ADD COLUMN requirement_match_count int UNSIGNED NOT NULL DEFAULT 1
  AFTER requirement_referrals,
  ADD COLUMN retention_match_count int UNSIGNED NOT NULL DEFAULT 1
  AFTER retention_referrals;
