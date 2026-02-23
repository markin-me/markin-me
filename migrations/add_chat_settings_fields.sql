ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_welcome_message` text DEFAULT NULL COMMENT 'Welcome text shown in customer chat';

ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_assistant_name` varchar(160) DEFAULT NULL COMMENT 'Virtual assistant display name';

ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_operator_name` varchar(160) DEFAULT NULL COMMENT 'Operator display name';

ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_quick_questions_json` text DEFAULT NULL COMMENT 'JSON array of chat quick questions';

ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_widget_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Show customer chat button in storefront';

ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_assistant_gender` char(1) DEFAULT NULL COMMENT 'Virtual assistant gender: m/f';
