ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN bonus_point_rate decimal(12,4) NOT NULL DEFAULT 1.0000 COMMENT 'Сколько рублей стоит 1 бонус при списании',
  ADD COLUMN bonus_point_accrual_base decimal(12,4) NOT NULL DEFAULT 1.0000 COMMENT 'База начисления: сколько рублей = 1 бонус до применения процента';



ALTER TABLE `mkt_bonus_program_settings`
  ADD COLUMN `bonus_point_amount` decimal(12,4) NOT NULL DEFAULT '1.0000'
  AFTER `referral_program_enabled`,
  ADD COLUMN `bonus_ruble_amount` decimal(12,4) NOT NULL DEFAULT '1.0000'
  AFTER `bonus_point_amount`;
