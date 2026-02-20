ALTER TABLE `ten_tenants`
  ADD COLUMN `telegram_bot_username` varchar(100) DEFAULT NULL COMMENT 'Telegram bot username (without @)',
  ADD COLUMN `telegram_bot_token` varchar(255) DEFAULT NULL COMMENT 'Telegram bot token from BotFather';
