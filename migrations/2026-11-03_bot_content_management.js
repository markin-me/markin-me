'use strict';

// Explicit invocation only. The migration is additive and keeps every existing
// important message storefront-only until an administrator chooses bot channels.
module.exports = async function migrateBotContentManagement(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('BOT_CONTENT_DB_SCOPE_REFUSED');

  const fs = require('fs');
  const path = require('path');
  const mysql = require('mysql2');
  const tables = [
    'mkt_important_messages',
    'mkt_important_message_products',
    'mkt_important_message_promo_claims',
    'mkt_customer_notification_consents',
  ];
  const statements = ['-- Snapshot before bot content management migration', 'USE `a1186497_test`;'];
  const counts = {};
  const conn = await db.getConnection();
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    for (const table of tables) {
      const [[ddl]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      statements.push(`${ddl['Create Table']};`);
      const [rows] = await conn.query({ sql: `SELECT * FROM \`${table}\``, dateStrings: true });
      counts[table] = rows.length;
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((key) => mysql.escape(
          row[key] && typeof row[key] === 'object' && !Buffer.isBuffer(row[key])
            ? JSON.stringify(row[key])
            : row[key]
        ));
        statements.push(`INSERT INTO \`${table}\` (${columns.map((key) => mysql.escapeId(key)).join(',')}) VALUES (${values.join(',')});`);
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const directory = path.resolve(__dirname, '../tmp/backups');
  fs.mkdirSync(directory, { recursive: true });
  const backup = path.join(directory, `a1186497_test_bot_content_${Date.now()}.sql`);
  fs.writeFileSync(backup, `${statements.join('\n')}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (!fs.statSync(backup).size) throw new Error('BOT_CONTENT_BACKUP_FAILED');

  try {
    await db.query("ALTER TABLE mkt_important_messages ADD COLUMN publication_channels SET('storefront','telegram','max') NOT NULL DEFAULT 'storefront' AFTER promo_code_id");
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  for (const statement of [
    "ALTER TABLE mkt_important_messages ADD COLUMN web_push_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER recipient_mode",
    "ALTER TABLE mkt_important_messages ADD COLUMN archived_at DATETIME(3) NULL AFTER published_at",
    "ALTER TABLE mkt_important_messages ADD COLUMN archived_by BIGINT UNSIGNED NULL AFTER archived_at",
    "ALTER TABLE mkt_important_messages ADD COLUMN lifecycle_status ENUM('draft','scheduled','active','paused','completed') NOT NULL DEFAULT 'draft' AFTER is_pinned",
    'ALTER TABLE mkt_important_messages ADD COLUMN manual_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER lifecycle_status',
    'ALTER TABLE mkt_important_messages ADD COLUMN paused_at DATETIME(3) NULL AFTER manual_hidden',
    'ALTER TABLE mkt_important_messages ADD COLUMN completed_at DATETIME(3) NULL AFTER paused_at',
    'ALTER TABLE mkt_important_messages ADD COLUMN storefront_sort_order INT NOT NULL DEFAULT 0 AFTER completed_at',
  ]) {
    try { await db.query(statement); } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }

  await db.query("ALTER TABLE mkt_campaign_deliveries MODIFY COLUMN state ENUM('pending','processing','retry','paused','sent','failed','cancelled','unknown') NOT NULL DEFAULT 'pending'");
  await db.query(`CREATE TABLE IF NOT EXISTS mkt_campaign_channel_schedules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('storefront','telegram','max') NOT NULL,
    start_mode ENUM('immediate','scheduled') NOT NULL DEFAULT 'immediate',
    start_at DATETIME(3) NOT NULL,
    end_mode ENUM('none','scheduled') NOT NULL DEFAULT 'none',
    end_at DATETIME(3) NULL,
    end_action ENUM('keep','delete') NOT NULL DEFAULT 'keep',
    state ENUM('pending','active','paused','completed','skipped','failed') NOT NULL DEFAULT 'pending',
    paused_from_state ENUM('pending','active') NULL,
    launch_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    run_id BIGINT UNSIGNED NULL,
    actual_started_at DATETIME(3) NULL,
    actual_ended_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(3) NULL,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_campaign_channel_schedule (tenant_id,store_id,message_id,channel),
    UNIQUE KEY uq_campaign_channel_launch (tenant_id,store_id,launch_key),
    KEY idx_campaign_schedule_start (state,start_at,lease_until,id),
    KEY idx_campaign_schedule_end (state,end_at,lease_until,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS mkt_campaign_lifecycle_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,store_id INT NOT NULL,message_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('storefront','telegram','max') NULL,
    action VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    from_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
    to_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
    details_json JSON NULL,actor_user_id BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),KEY idx_campaign_lifecycle_audit (tenant_id,store_id,message_id,created_at,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS bot_content_templates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL DEFAULT 1,
    provider ENUM('tg','max') NOT NULL,
    template_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    text_template TEXT NOT NULL,
    buttons_json JSON NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_bot_content_template (tenant_id,store_id,provider,template_key),
    KEY idx_bot_content_template_scope (tenant_id,store_id,provider)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS mkt_messenger_marketing_consents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL,
    customer_id INT NOT NULL,
    provider ENUM('tg','max') NOT NULL,
    consented TINYINT(1) NOT NULL DEFAULT 0,
    consented_at DATETIME(3) NULL,
    revoked_at DATETIME(3) NULL,
    source ENUM('bot','storefront','admin_import') NOT NULL DEFAULT 'bot',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_messenger_marketing_consent (tenant_id,store_id,customer_id,provider),
    KEY idx_messenger_marketing_audience (tenant_id,store_id,provider,consented,customer_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS mkt_campaign_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    idempotency_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    channels SET('telegram','max') NOT NULL,
    status ENUM('queued','sending','completed','cancelled','failed') NOT NULL DEFAULT 'queued',
    content_snapshot_json JSON NOT NULL,
    requested_by BIGINT UNSIGNED NULL,
    started_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    cancelled_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_mkt_campaign_run_key (tenant_id,store_id,idempotency_key),
    KEY idx_mkt_campaign_run_message (tenant_id,store_id,message_id,created_at),
    KEY idx_mkt_campaign_run_status (status,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS mkt_campaign_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    run_id BIGINT UNSIGNED NOT NULL,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL,
    customer_id INT NOT NULL,
    provider ENUM('tg','max') NOT NULL,
    provider_user_id VARCHAR(128) NOT NULL,
    state ENUM('pending','processing','retry','sent','failed','cancelled','unknown') NOT NULL DEFAULT 'pending',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(6) NULL,
    provider_message_id VARCHAR(191) NULL,
    provider_message_ids_json JSON NULL,
    last_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    sent_at DATETIME(6) NULL,
    deletion_state ENUM('not_requested','pending','processing','retry','deleted','failed','unavailable') NOT NULL DEFAULT 'not_requested',
    deletion_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    deletion_available_at DATETIME(6) NULL,
    deletion_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    deletion_lease_until DATETIME(6) NULL,
    deletion_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    deletion_requested_at DATETIME(6) NULL,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_mkt_campaign_delivery (run_id,provider,customer_id),
    KEY idx_mkt_campaign_delivery_queue (state,available_at,lease_until,id),
    KEY idx_mkt_campaign_deletion_queue (deletion_state,deletion_available_at,deletion_lease_until,id),
    KEY idx_mkt_campaign_delivery_scope (tenant_id,store_id,provider,customer_id),
    CONSTRAINT fk_mkt_campaign_delivery_run FOREIGN KEY (run_id)
      REFERENCES mkt_campaign_runs (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  for (const statement of [
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN provider_message_ids_json JSON NULL AFTER provider_message_id',
    "ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_state ENUM('not_requested','pending','processing','retry','deleted','failed','unavailable') NOT NULL DEFAULT 'not_requested' AFTER sent_at",
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER deletion_state',
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_available_at DATETIME(6) NULL AFTER deletion_attempts',
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER deletion_available_at',
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_lease_until DATETIME(6) NULL AFTER deletion_lease_token',
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER deletion_lease_until',
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_requested_at DATETIME(6) NULL AFTER deletion_error_code',
    'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deleted_at DATETIME(6) NULL AFTER deletion_requested_at',
    'ALTER TABLE mkt_campaign_deliveries ADD KEY idx_mkt_campaign_deletion_queue (deletion_state,deletion_available_at,deletion_lease_until,id)',
  ]) {
    try { await db.query(statement); } catch (error) {
      if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'].includes(error?.code)) throw error;
    }
  }

  await db.query(`INSERT INTO system_permissions
      (permission_key,group_key,label,description,allowed_access_rules,sort_order)
    VALUES ('marketing.broadcasts.send','marketing','Запуск: Promo рассылки','Массовая отправка в Telegram и MAX','all,stores',1193)
    ON DUPLICATE KEY UPDATE label=VALUES(label),description=VALUES(description),allowed_access_rules=VALUES(allowed_access_rules),sort_order=VALUES(sort_order)`);
  await db.query(`INSERT INTO role_permissions (tenant_id,role_id,permission_id,access_rule)
    SELECT role.tenant_id,role.id,permission.id,'all'
      FROM tenant_roles role
      JOIN system_permissions permission ON permission.permission_key='marketing.broadcasts.send'
     WHERE role.is_owner=1
    ON DUPLICATE KEY UPDATE access_rule='all'`);

  return { backup, counts };
};
