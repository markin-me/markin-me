ALTER TABLE print_api_tokens
  ADD COLUMN notify_new_order_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active,
  ADD COLUMN notify_new_message_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER notify_new_order_enabled,
  ADD COLUMN sound_new_order_url VARCHAR(1024) NULL AFTER notify_new_message_enabled,
  ADD COLUMN sound_new_message_url VARCHAR(1024) NULL AFTER sound_new_order_url;

