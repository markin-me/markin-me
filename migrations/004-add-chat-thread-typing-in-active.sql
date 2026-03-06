ALTER TABLE chat_threads
  ADD COLUMN typing_in_active TINYINT(1) NOT NULL DEFAULT 0;
