-- Persist typing state in DB per tenant/client (multitenant).
ALTER TABLE chat_threads
  ADD COLUMN typing_in_active TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE chat_threads
  ADD COLUMN typing_in_text VARCHAR(120) NOT NULL DEFAULT '';

ALTER TABLE chat_threads
  ADD COLUMN typing_in_updated_at DATETIME(3) NULL DEFAULT NULL;

ALTER TABLE chat_threads
  ADD COLUMN typing_in_expires_at DATETIME(3) NULL DEFAULT NULL;

ALTER TABLE chat_threads
  ADD COLUMN typing_out_active TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE chat_threads
  ADD COLUMN typing_out_text VARCHAR(120) NOT NULL DEFAULT '';

ALTER TABLE chat_threads
  ADD COLUMN typing_out_updated_at DATETIME(3) NULL DEFAULT NULL;

ALTER TABLE chat_threads
  ADD COLUMN typing_out_expires_at DATETIME(3) NULL DEFAULT NULL;
