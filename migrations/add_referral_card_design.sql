ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_main_color varchar(7) NULL DEFAULT '#f3f4f6';

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_base_color varchar(7) NULL DEFAULT '#d1d5db';

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_content_color varchar(7) NULL DEFAULT '#64748b';

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_button_color varchar(7) NULL DEFAULT '#ff6a00';

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_qr_enabled tinyint(1) NOT NULL DEFAULT 1;

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_title_background_enabled tinyint(1) NOT NULL DEFAULT 1;

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_title_background_color varchar(7) NULL DEFAULT '#ffffff';

ALTER TABLE mkt_bonus_program_settings
  ADD COLUMN referral_card_title_background_opacity tinyint UNSIGNED NOT NULL DEFAULT 90;
