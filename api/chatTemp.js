const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const webPush = require("web-push");
const db = require("../db");

const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
const MAX_MESSAGES_PER_THREAD = 1000;
const CHAT_LONG_POLL_MAX_TIMEOUT_MS = 25000;
const CHAT_LONG_POLL_MIN_TIMEOUT_MS = 1000;
const CHAT_TYPING_TTL_MS = 4500;
const CHAT_TYPING_TEXT_MAX_LENGTH = 120;
const CHAT_TYPING_HEARTBEAT_COALESCE_MS = parsePositiveInt(
  process.env.CHAT_TYPING_HEARTBEAT_COALESCE_MS,
  200,
  0,
  5000
);
const CHAT_UPLOAD_MAX_FILE_BYTES = 20 * 1024 * 1024;
const CHAT_SUMMARIES_PAGE_DEFAULT_LIMIT = 50;
const CHAT_SUMMARIES_PAGE_MAX_LIMIT = 200;
const CHAT_THREAD_PAGE_DEFAULT_LIMIT = 60;
const CHAT_THREAD_PAGE_MAX_LIMIT = 200;
const CHAT_GUEST_THREAD_TTL_DAYS_DEFAULT = parsePositiveInt(
  process.env.CHAT_GUEST_THREAD_TTL_DAYS,
  7,
  1,
  365
);
const CHAT_GUEST_THREAD_CLEANUP_MIN_INTERVAL_MS = parsePositiveInt(
  process.env.CHAT_GUEST_THREAD_CLEANUP_MIN_INTERVAL_MS,
  5 * 60 * 1000,
  10000,
  24 * 60 * 60 * 1000
);
const CHAT_ORPHAN_THREAD_CLEANUP_MIN_INTERVAL_MS = parsePositiveInt(
  process.env.CHAT_ORPHAN_THREAD_CLEANUP_MIN_INTERVAL_MS,
  30 * 1000,
  5000,
  24 * 60 * 60 * 1000
);
const CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT = parsePositiveInt(
  process.env.CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT,
  200,
  10,
  2000
);
const CHAT_ORPHAN_THREAD_CLEANUP_BATCH_LIMIT = CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT;
const CHAT_PUSH_ENDPOINT_MAX_LENGTH = 1024;
const CHAT_PUSH_COMPANY_TITLE_CACHE_TTL_MS = 60 * 1000;
const CHAT_ADMIN_PUSH_UNANSWERED_DELAY_MS = parsePositiveInt(
  process.env.CHAT_ADMIN_PUSH_UNANSWERED_DELAY_MS,
  5000,
  0,
  15000
);
const CHAT_UPLOAD_RELATIVE_DIR = path.join("static", "uploads", "chat");
const CHAT_UPLOAD_ABSOLUTE_DIR = path.join(__dirname, "..", CHAT_UPLOAD_RELATIVE_DIR);
const CHAT_ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]);
const WEB_PUSH_VAPID_PUBLIC_KEY = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
const WEB_PUSH_VAPID_PRIVATE_KEY = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
const WEB_PUSH_SUBJECT_LOCAL_DEFAULT = "mailto:push@markin-me.local";
const WEB_PUSH_SUBJECT_PROD_DEFAULT = "mailto:push@markin-me.ru";
const WEB_PUSH_SUBJECT_LOCAL = String(
  process.env.WEB_PUSH_SUBJECT_LOCAL || WEB_PUSH_SUBJECT_LOCAL_DEFAULT
).trim();
const WEB_PUSH_SUBJECT_PROD = String(
  process.env.WEB_PUSH_SUBJECT_PROD || WEB_PUSH_SUBJECT_PROD_DEFAULT
).trim();
const WEB_PUSH_SUBJECT = String(
  String(process.env.NODE_ENV || "").toLowerCase() === "production"
    ? (process.env.WEB_PUSH_SUBJECT || WEB_PUSH_SUBJECT_PROD)
    : (process.env.WEB_PUSH_SUBJECT_LOCAL || process.env.WEB_PUSH_SUBJECT || WEB_PUSH_SUBJECT_LOCAL)
).trim();
let webPushEnabled = false;

if (WEB_PUSH_VAPID_PUBLIC_KEY && WEB_PUSH_VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY);
    webPushEnabled = true;
  } catch (err) {
    webPushEnabled = false;
    console.error("web-push VAPID init failed:", err);
  }
}

try {
  fs.mkdirSync(CHAT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
} catch {}

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_UPLOAD_MAX_FILE_BYTES },
});

const threadWaiters = new Map();
const tenantWaiters = new Map();
const tenantChangeState = new Map();
const tenantUnreadWaiters = new Map();
const tenantUnreadState = new Map();
const threadTypingState = new Map();
const threadTypingExpireTimers = new Map();
const threadTypingCoalesceState = new Map();
const threadSseSubscribers = new Map();
const tenantSseSubscribers = new Map();
const unreadSseSubscribers = new Map();
const clientUnreadRefreshState = new Map();
const guestThreadCleanupState = new Map();
const tenantPushCompanyTitleCache = new Map();
const tenantChatWidgetState = new Map();
const typingDbTtlCleanupState = new Map();
let ensurePushSubscriptionsTablePromise = null;
let ensureHiddenMessagesTablePromise = null;
let ensureChatCoreIndexesPromise = null;
let ensureChatThreadTypingColumnsPromise = null;
const CHAT_PUSH_UNIQUE_INDEX_LEGACY = "ux_chat_push_subscriptions_tenant_endpoint";
const CHAT_PUSH_UNIQUE_INDEX_V2 = "ux_chat_push_subscriptions_tenant_actor_client_endpoint";
const CHAT_HIDDEN_UNIQUE_INDEX = "ux_chat_message_hidden_tenant_client_message_actor";
const CHAT_THREADS_UPDATED_INDEX = "idx_chat_threads_tenant_updated_client";
const CHAT_MESSAGES_TENANT_CLIENT_ID_INDEX = "idx_chat_messages_tenant_client_id";
const CHAT_MESSAGES_UNREAD_INDEX = "idx_chat_messages_tenant_client_unread";
const CHAT_SSE_HEARTBEAT_MS = 20000;
const CHAT_TYPING_DB_TTL_CLEANUP_MIN_INTERVAL_MS = parsePositiveInt(
  process.env.CHAT_TYPING_DB_TTL_CLEANUP_MIN_INTERVAL_MS,
  1500,
  200,
  60000
);
const CHAT_WIDGET_STATE_TTL_MS = parsePositiveInt(
  process.env.CHAT_WIDGET_STATE_TTL_MS,
  10000,
  1000,
  5 * 60 * 1000
);

async function ensurePushSubscriptionsIndexes() {
  const [indexRows] = await db.query("SHOW INDEX FROM chat_push_subscriptions");
  const indexes = Array.isArray(indexRows) ? indexRows : [];
  const hasLegacyUnique = indexes.some((row) => String(row?.Key_name || "") === CHAT_PUSH_UNIQUE_INDEX_LEGACY);
  const hasV2Unique = indexes.some((row) => String(row?.Key_name || "") === CHAT_PUSH_UNIQUE_INDEX_V2);

  if (hasLegacyUnique && !hasV2Unique) {
    await db.query(`
      ALTER TABLE chat_push_subscriptions
      DROP INDEX ${CHAT_PUSH_UNIQUE_INDEX_LEGACY},
      ADD UNIQUE KEY ${CHAT_PUSH_UNIQUE_INDEX_V2} (tenant_id, actor, client_id, endpoint_hash)
    `);
    return;
  }

  if (!hasV2Unique) {
    await db.query(`
      ALTER TABLE chat_push_subscriptions
      ADD UNIQUE KEY ${CHAT_PUSH_UNIQUE_INDEX_V2} (tenant_id, actor, client_id, endpoint_hash)
    `);
  }
}

function ensurePushSubscriptionsTable() {
  if (ensurePushSubscriptionsTablePromise) return ensurePushSubscriptionsTablePromise;
  ensurePushSubscriptionsTablePromise = db.query(`
    CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      client_id BIGINT UNSIGNED NOT NULL,
      actor ENUM('in','out') NOT NULL DEFAULT 'in',
      endpoint_hash CHAR(64) NOT NULL,
      endpoint VARCHAR(1024) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY ${CHAT_PUSH_UNIQUE_INDEX_V2} (tenant_id, actor, client_id, endpoint_hash),
      KEY idx_chat_push_subscriptions_thread (tenant_id, client_id, actor)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
    .then(() => ensurePushSubscriptionsIndexes())
    .then(() => true)
    .catch((err) => {
      ensurePushSubscriptionsTablePromise = null;
      throw err;
    });
  return ensurePushSubscriptionsTablePromise;
}

function ensureHiddenMessagesTable() {
  if (ensureHiddenMessagesTablePromise) return ensureHiddenMessagesTablePromise;
  ensureHiddenMessagesTablePromise = db.query(`
    CREATE TABLE IF NOT EXISTS chat_message_hidden (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      client_id BIGINT UNSIGNED NOT NULL,
      message_id VARCHAR(120) NOT NULL,
      actor ENUM('in','out') NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY ${CHAT_HIDDEN_UNIQUE_INDEX} (tenant_id, client_id, message_id, actor),
      KEY idx_chat_message_hidden_lookup (tenant_id, client_id, actor, message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
    .then(() => true)
    .catch((err) => {
      ensureHiddenMessagesTablePromise = null;
      throw err;
    });
  return ensureHiddenMessagesTablePromise;
}

async function ensureChatCoreIndexes() {
  if (ensureChatCoreIndexesPromise) return ensureChatCoreIndexesPromise;
  ensureChatCoreIndexesPromise = (async () => {
    try {
      const [threadIndexRows] = await db.query("SHOW INDEX FROM chat_threads");
      const threadIndexes = Array.isArray(threadIndexRows) ? threadIndexRows : [];
      const hasThreadsUpdatedIndex = threadIndexes.some(
        (row) => String(row?.Key_name || "") === CHAT_THREADS_UPDATED_INDEX
      );
      if (!hasThreadsUpdatedIndex) {
        await db.query(
          `ALTER TABLE chat_threads
           ADD INDEX ${CHAT_THREADS_UPDATED_INDEX} (tenant_id, updated_at DESC, client_id DESC)`
        );
      }
    } catch (err) {
      if (String(err?.code || "") !== "ER_DUP_KEYNAME") throw err;
    }

    try {
      const [messageIndexRows] = await db.query("SHOW INDEX FROM chat_messages");
      const messageIndexes = Array.isArray(messageIndexRows) ? messageIndexRows : [];
      const hasTenantClientIdIndex = messageIndexes.some(
        (row) => String(row?.Key_name || "") === CHAT_MESSAGES_TENANT_CLIENT_ID_INDEX
      );
      if (!hasTenantClientIdIndex) {
        await db.query(
          `ALTER TABLE chat_messages
           ADD INDEX ${CHAT_MESSAGES_TENANT_CLIENT_ID_INDEX} (tenant_id, client_id, id DESC)`
        );
      }
      const hasUnreadIndex = messageIndexes.some(
        (row) => String(row?.Key_name || "") === CHAT_MESSAGES_UNREAD_INDEX
      );
      if (!hasUnreadIndex) {
        await db.query(
          `ALTER TABLE chat_messages
           ADD INDEX ${CHAT_MESSAGES_UNREAD_INDEX} (tenant_id, client_id, direction, is_read, message_id, id DESC)`
        );
      }
    } catch (err) {
      if (String(err?.code || "") !== "ER_DUP_KEYNAME") throw err;
    }
    return true;
  })().catch((err) => {
    ensureChatCoreIndexesPromise = null;
    throw err;
  });
  return ensureChatCoreIndexesPromise;
}

async function ensureChatThreadTypingColumns() {
  if (ensureChatThreadTypingColumnsPromise) return ensureChatThreadTypingColumnsPromise;
  ensureChatThreadTypingColumnsPromise = (async () => {
    const [columnRows] = await db.query("SHOW COLUMNS FROM chat_threads");
    const existing = new Set(
      (Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || "").toLowerCase())
    );
    const definitions = [
      { name: "typing_in_active", ddl: "TINYINT(1) NOT NULL DEFAULT 0" },
      { name: "typing_in_text", ddl: "VARCHAR(120) NOT NULL DEFAULT ''" },
      { name: "typing_in_updated_at", ddl: "DATETIME(3) NULL DEFAULT NULL" },
      { name: "typing_in_expires_at", ddl: "DATETIME(3) NULL DEFAULT NULL" },
      { name: "typing_out_active", ddl: "TINYINT(1) NOT NULL DEFAULT 0" },
      { name: "typing_out_text", ddl: "VARCHAR(120) NOT NULL DEFAULT ''" },
      { name: "typing_out_updated_at", ddl: "DATETIME(3) NULL DEFAULT NULL" },
      { name: "typing_out_expires_at", ddl: "DATETIME(3) NULL DEFAULT NULL" },
    ];

    for (const column of definitions) {
      if (existing.has(column.name)) continue;
      // eslint-disable-next-line no-await-in-loop
      await db.query(`ALTER TABLE chat_threads ADD COLUMN ${column.name} ${column.ddl}`);
    }
    return true;
  })().catch((err) => {
    ensureChatThreadTypingColumnsPromise = null;
    throw err;
  });
  return ensureChatThreadTypingColumnsPromise;
}

async function cleanupExpiredThreadTypingFlagsForTenant(tenantId) {
  const tenantKey = getTenantKey(tenantId);
  if (!tenantKey) return;
  const nowMs = Date.now();
  const currentState = typingDbTtlCleanupState.get(tenantKey) || {
    running: false,
    pending: false,
    lastRunAt: 0,
  };
  if (currentState.running) {
    currentState.pending = true;
    typingDbTtlCleanupState.set(tenantKey, currentState);
    return;
  }
  if (nowMs - Number(currentState.lastRunAt || 0) < CHAT_TYPING_DB_TTL_CLEANUP_MIN_INTERVAL_MS) {
    return;
  }

  currentState.running = true;
  currentState.pending = false;
  currentState.lastRunAt = nowMs;
  typingDbTtlCleanupState.set(tenantKey, currentState);

  try {
    await db.query(
      `
        UPDATE chat_threads
        SET
          typing_in_active = CASE
            WHEN typing_in_active = 1 AND typing_in_expires_at IS NOT NULL AND typing_in_expires_at <= NOW(3)
              THEN 0
            ELSE typing_in_active
          END,
          typing_in_text = CASE
            WHEN typing_in_active = 1 AND typing_in_expires_at IS NOT NULL AND typing_in_expires_at <= NOW(3)
              THEN ''
            ELSE typing_in_text
          END,
          typing_in_expires_at = CASE
            WHEN typing_in_active = 1 AND typing_in_expires_at IS NOT NULL AND typing_in_expires_at <= NOW(3)
              THEN NULL
            ELSE typing_in_expires_at
          END,
          typing_in_updated_at = CASE
            WHEN typing_in_active = 1 AND typing_in_expires_at IS NOT NULL AND typing_in_expires_at <= NOW(3)
              THEN NULL
            ELSE typing_in_updated_at
          END,
          typing_out_active = CASE
            WHEN typing_out_active = 1 AND typing_out_expires_at IS NOT NULL AND typing_out_expires_at <= NOW(3)
              THEN 0
            ELSE typing_out_active
          END,
          typing_out_text = CASE
            WHEN typing_out_active = 1 AND typing_out_expires_at IS NOT NULL AND typing_out_expires_at <= NOW(3)
              THEN ''
            ELSE typing_out_text
          END,
          typing_out_expires_at = CASE
            WHEN typing_out_active = 1 AND typing_out_expires_at IS NOT NULL AND typing_out_expires_at <= NOW(3)
              THEN NULL
            ELSE typing_out_expires_at
          END,
          typing_out_updated_at = CASE
            WHEN typing_out_active = 1 AND typing_out_expires_at IS NOT NULL AND typing_out_expires_at <= NOW(3)
              THEN NULL
            ELSE typing_out_updated_at
          END
        WHERE tenant_id = ?
          AND (
            (typing_in_active = 1 AND typing_in_expires_at IS NOT NULL AND typing_in_expires_at <= NOW(3))
            OR (typing_out_active = 1 AND typing_out_expires_at IS NOT NULL AND typing_out_expires_at <= NOW(3))
          )
      `,
      [Number(tenantId)]
    );
  } finally {
    currentState.running = false;
    const shouldRepeat = currentState.pending === true;
    currentState.pending = false;
    typingDbTtlCleanupState.set(tenantKey, currentState);
    if (shouldRepeat) {
      setTimeout(() => {
        cleanupExpiredThreadTypingFlagsForTenant(tenantId).catch(() => {});
      }, CHAT_TYPING_DB_TTL_CLEANUP_MIN_INTERVAL_MS);
    }
  }
}

function hashPushEndpoint(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint || "")).digest("hex");
}

function isTransientDbConnectionError(err) {
  const code = String(err?.code || "").toUpperCase();
  if (
    code === "PROTOCOL_CONNECTION_LOST"
    || code === "ECONNRESET"
    || code === "EPIPE"
    || code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR"
    || code === "PROTOCOL_ENQUEUE_AFTER_QUIT"
  ) return true;
  const message = String(err?.message || "").toLowerCase();
  return message.includes("connection lost")
    || message.includes("server closed the connection");
}

async function queryWithTransientRetry(conn, sql, params = [], retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await conn.query(sql, params);
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isTransientDbConnectionError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  throw lastErr;
}

function sanitizePushSubscription(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const endpoint = String(source.endpoint || "").trim().slice(0, CHAT_PUSH_ENDPOINT_MAX_LENGTH);
  if (!endpoint) return null;
  const keys = source.keys && typeof source.keys === "object" ? source.keys : {};
  const p256dh = String(keys.p256dh || "").trim().slice(0, 255);
  const auth = String(keys.auth || "").trim().slice(0, 255);
  if (!p256dh || !auth) return null;
  // Typical Web Push key sizes: p256dh >= ~87 chars, auth >= ~22 chars.
  if (p256dh.length < 80 || auth.length < 16) return null;
  return { endpoint, p256dh, auth };
}

async function upsertPushSubscription(tenantId, clientId, actorKey, subscription, userAgent) {
  await ensurePushSubscriptionsTable();
  const actor = actorKey === "in" ? "in" : "out";
  const endpoint = String(subscription.endpoint || "");
  const endpointHash = hashPushEndpoint(endpoint);
  const normalizedUserAgent = String(userAgent || "").slice(0, 255);

  // For customer chat subscriptions keep one active endpoint per browser profile.
  // This prevents duplicate notifications when stale endpoints remain valid.
  if (actor === "in" && normalizedUserAgent) {
    await db.query(
      `DELETE FROM chat_push_subscriptions
        WHERE tenant_id = ? AND client_id = ? AND actor = 'in'
          AND user_agent = ? AND endpoint_hash <> ?`,
      [Number(tenantId), Number(clientId), normalizedUserAgent, endpointHash]
    );
  }

  await db.query(
    `INSERT INTO chat_push_subscriptions
      (tenant_id, client_id, actor, endpoint_hash, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      client_id = VALUES(client_id),
      actor = VALUES(actor),
      endpoint = VALUES(endpoint),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth),
      user_agent = VALUES(user_agent),
      updated_at = CURRENT_TIMESTAMP(3)`,
    [
      Number(tenantId),
      Number(clientId),
      actor,
      endpointHash,
      endpoint,
      String(subscription.p256dh || ""),
      String(subscription.auth || ""),
      normalizedUserAgent,
    ]
  );
}

async function deletePushSubscriptionByEndpoint(tenantId, endpoint, actorKey = "") {
  await ensurePushSubscriptionsTable();
  const endpointHash = hashPushEndpoint(endpoint);
  const actor = actorKey === "in" || actorKey === "out" ? actorKey : "";
  if (actor) {
    await db.query(
      `DELETE FROM chat_push_subscriptions
        WHERE tenant_id = ? AND endpoint_hash = ? AND actor = ?`,
      [Number(tenantId), endpointHash, actor]
    );
    return;
  }
  await db.query(
    `DELETE FROM chat_push_subscriptions
      WHERE tenant_id = ? AND endpoint_hash = ?`,
    [Number(tenantId), endpointHash]
  );
}

async function deletePushSubscriptionsByIds(ids) {
  const list = (Array.isArray(ids) ? ids : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!list.length) return;
  await db.query(
    `DELETE FROM chat_push_subscriptions
      WHERE id IN (${list.map(() => "?").join(",")})`,
    list
  );
}

async function deletePushSubscriptionsForThread(tenantId, clientId) {
  await ensurePushSubscriptionsTable();
  await db.query(
    `DELETE FROM chat_push_subscriptions
      WHERE tenant_id = ? AND client_id = ?`,
    [Number(tenantId), Number(clientId)]
  );
}

async function deletePushSubscriptionsForThreads(tenantId, clientIds) {
  await ensurePushSubscriptionsTable();
  const ids = (Array.isArray(clientIds) ? clientIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return;
  await db.query(
    `DELETE FROM chat_push_subscriptions
      WHERE tenant_id = ? AND client_id IN (${ids.map(() => "?").join(",")})`,
    [Number(tenantId), ...ids]
  );
}

async function deletePushSubscriptionsForTenant(tenantId) {
  await ensurePushSubscriptionsTable();
  await db.query(
    `DELETE FROM chat_push_subscriptions
      WHERE tenant_id = ?`,
    [Number(tenantId)]
  );
}

async function listPushSubscriptionsForThread(tenantId, clientId, actorKey) {
  await ensurePushSubscriptionsTable();
  const actor = actorKey === "in" ? "in" : "out";
  let rows = [];
  if (actor === "out") {
    const [outRows] = await db.query(
      `SELECT id, endpoint, p256dh, auth
         FROM chat_push_subscriptions
        WHERE tenant_id = ? AND actor = 'out' AND (client_id = ? OR client_id = 0)`,
      [Number(tenantId), Number(clientId)]
    );
    rows = outRows;
  } else {
    const [inRows] = await db.query(
      `SELECT id, endpoint, p256dh, auth
         FROM chat_push_subscriptions
        WHERE tenant_id = ? AND client_id = ? AND actor = 'in'`,
      [Number(tenantId), Number(clientId)]
    );
    rows = inRows;
  }
  return Array.isArray(rows) ? rows : [];
}

function getPushPreviewText(message) {
  const msg = message && typeof message === "object" ? message : {};
  const text = String(msg.text || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 200);
  const attachment = msg.attachment && typeof msg.attachment === "object" ? msg.attachment : null;
  if (attachment && String(attachment.kind || "").toLowerCase() === "image") return "\u0424\u043e\u0442\u043e";
  return "\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435";
}

function isAssistantOrSystemMessageId(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  if (id.indexOf("assistant-auto-") === 0) return true;
  if (/^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
  if (/^daily-welcome-options-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
  return false;
}

function normalizeMessageDirection(directionRaw, messageId) {
  if (isAssistantOrSystemMessageId(messageId)) return "out";
  return String(directionRaw || "").toLowerCase() === "out" ? "out" : "in";
}

function shouldNotifyPushForPeer(peerActor, message) {
  const actor = peerActor === "in" ? "in" : "out";
  const source = message && typeof message === "object" ? message : {};
  const direction = normalizeMessageDirection(source.direction, source.id);
  const messageId = String(source.id || "").trim();

  // Admin push notifications must include only real client messages.
  if (actor === "out") {
    if (direction !== "in") return false;
    if (isAssistantOrSystemMessageId(messageId)) return false;
  }
  return true;
}

function resolvePushSenderActor(message, fallbackActor) {
  const source = message && typeof message === "object" ? message : null;
  if (source) {
    const direction = normalizeMessageDirection(source.direction, source.id);
    return direction === "in" ? "in" : "out";
  }
  return fallbackActor === "in" ? "in" : "out";
}

async function isIncomingMessageUnansweredByBot(tenantId, clientId, messageId) {
  const safeMessageId = normalizeMessageId(messageId);
  const safeClientId = normalizeClientId(clientId);
  if (!safeMessageId || !safeClientId) return false;
  const typingEntry = getThreadTypingEntry(tenantId, safeClientId);
  const outTyping = typingEntry && typingEntry.out ? typingEntry.out : null;
  if (outTyping?.active === true && Number(outTyping?.expiresAtMs || 0) > Date.now()) {
    return false;
  }

  const [rows] = await db.query(
    `
      SELECT
        id,
        message_id,
        direction,
        is_read
      FROM chat_messages
      WHERE tenant_id = ?
        AND client_id = ?
        AND (
          direction = 'in'
          OR (
            direction = 'out'
            AND (
              message_id LIKE 'assistant-auto-%'
              OR message_id LIKE 'daily-welcome-%'
            )
          )
        )
      ORDER BY id DESC
    `,
    [Number(tenantId), Number(safeClientId)]
  );
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return false;

  let pendingBotReplies = 0;
  for (const row of list) {
    const direction = String(row?.direction || "").toLowerCase();
    const id = String(row?.message_id || "");
    if (direction === "out") {
      pendingBotReplies += 1;
      continue;
    }
    if (direction !== "in") continue;
    const isTarget = id === safeMessageId;
    if (isTarget && Number(row?.is_read || 0) === 1) return false;
    if (pendingBotReplies > 0) {
      pendingBotReplies -= 1;
      if (isTarget) return false;
      continue;
    }
    if (isTarget) return true;
  }
  return false;
}

function waitMs(timeoutMs) {
  const ms = Math.max(0, Math.trunc(Number(timeoutMs) || 0));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shouldNotifyAdminPushForIncoming(tenantId, clientId, messageId) {
  const waitBudget = Math.max(0, Number(CHAT_ADMIN_PUSH_UNANSWERED_DELAY_MS || 0));
  const pollStepMs = 350;
  const startedAt = Date.now();

  while (true) {
    const stillUnanswered = await isIncomingMessageUnansweredByBot(tenantId, clientId, messageId);
    if (!stillUnanswered) return false;

    const elapsed = Date.now() - startedAt;
    const remaining = waitBudget - elapsed;
    if (remaining <= 0) return true;

    await waitMs(Math.min(pollStepMs, remaining));
  }
}

function normalizeTenantPushCompanyTitle(rawValue) {
  return String(rawValue || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function resolveTenantPushCompanyTitle(tenantId) {
  const key = String(tenantId || "").trim();
  if (!key) return "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f";

  const now = Date.now();
  const cached = tenantPushCompanyTitleCache.get(key);
  if (cached && cached.expiresAt > now && cached.title) return cached.title;

  let title = "";
  try {
    const [rows] = await db.query(
      `SELECT site_name, name
         FROM ten_tenants
        WHERE id = ?
        LIMIT 1`,
      [Number(key)]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    title = normalizeTenantPushCompanyTitle(
      (row && (row.site_name || row.name)) || ""
    );
  } catch (err) {
    const code = String(err && err.code || "");
    if (code !== "ER_BAD_FIELD_ERROR") {
      console.error("resolveTenantPushCompanyTitle failed:", err && err.message ? err.message : err);
    } else {
      try {
        const [rows] = await db.query(
          `SELECT name
             FROM ten_tenants
            WHERE id = ?
            LIMIT 1`,
          [Number(key)]
        );
        const row = Array.isArray(rows) && rows.length ? rows[0] : null;
        title = normalizeTenantPushCompanyTitle(row ? row.name : "");
      } catch (nestedErr) {
        console.error(
          "resolveTenantPushCompanyTitle fallback failed:",
          nestedErr && nestedErr.message ? nestedErr.message : nestedErr
        );
      }
    }
  }

  if (!title) title = "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f";
  tenantPushCompanyTitleCache.set(key, {
    title,
    expiresAt: now + CHAT_PUSH_COMPANY_TITLE_CACHE_TTL_MS,
  });
  return title;
}

async function sendPushToSubscriptions(subscriptions, payload) {
  if (!webPushEnabled) return;
  const rows = Array.isArray(subscriptions) ? subscriptions : [];
  if (!rows.length) return;
  const body = JSON.stringify(payload || {});
  const invalidIds = [];
  const duplicateIds = [];
  const seenEndpointHashes = new Set();
  const uniqueRows = [];

  for (const row of rows) {
    const endpoint = String(row && row.endpoint || "");
    const id = Number(row && row.id || 0);
    if (endpoint) {
      const endpointHash = hashPushEndpoint(endpoint);
      if (seenEndpointHashes.has(endpointHash)) {
        if (id > 0) duplicateIds.push(id);
        continue;
      }
      seenEndpointHashes.add(endpointHash);
    }
    uniqueRows.push(row);
  }

  for (const row of uniqueRows) {
    const endpoint = String(row && row.endpoint || "");
    const p256dh = String(row && row.p256dh || "");
    const auth = String(row && row.auth || "");
    const id = Number(row && row.id || 0);
    if (!endpoint || !p256dh || !auth) {
      if (id > 0) invalidIds.push(id);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await webPush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        body,
        { TTL: 120, urgency: "high" }
      );
    } catch (err) {
      const statusCode = Number(err && (err.statusCode || err.status_code) || 0);
      if ((statusCode === 404 || statusCode === 410) && id > 0) {
        invalidIds.push(id);
      }
      if (statusCode !== 404 && statusCode !== 410) {
        console.error("web-push send failed:", err && err.message ? err.message : err);
      }
    }
  }
  const idsToDelete = Array.from(new Set([...invalidIds, ...duplicateIds]));
  if (idsToDelete.length) {
    await deletePushSubscriptionsByIds(idsToDelete).catch(() => {});
  }
}

async function notifyPushPeerAboutMessage(tenantId, clientId, senderActor, message) {
  if (!webPushEnabled) return;
  const peerActor = senderActor === "in" ? "out" : "in";
  if (peerActor === "in") {
    const chatEnabled = await isTenantChatWidgetEnabled(tenantId);
    if (!chatEnabled) return;
  }
  if (!shouldNotifyPushForPeer(peerActor, message)) return;
  if (peerActor === "out") {
    const incomingMessageId = String(message && message.id || "").trim();
    if (!incomingMessageId) return;
    const shouldNotify = await shouldNotifyAdminPushForIncoming(tenantId, clientId, incomingMessageId);
    if (!shouldNotify) return;
  }
  const subscriptions = await listPushSubscriptionsForThread(tenantId, clientId, peerActor);
  if (!subscriptions.length) return;
  const messageIdRaw = String(message && message.id ? message.id : "").trim();
  const safeMessageId = messageIdRaw.replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 80);
  const tagSuffix = safeMessageId || String(Date.now());
  const preview = getPushPreviewText(message);
  const title = peerActor === "in"
    ? await resolveTenantPushCompanyTitle(tenantId)
    : "\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043e\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u0430";
  const url = peerActor === "in" ? "/shop" : "/dashboard/chat";
  await sendPushToSubscriptions(subscriptions, {
    type: "chat_message",
    tenant_id: Number(tenantId),
    client_id: Number(clientId),
    title,
    body: preview,
    url,
    tag: `chat-${tenantId}-${clientId}-${peerActor}-${tagSuffix}`,
  });
}

function normalizeTenantChatWidgetEnabled(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return true;
  if (rawValue === false || rawValue === 0) return false;
  const normalized = String(rawValue).trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
  if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric !== 0;
  return true;
}

function normalizeTenantGuestThreadTtlDays(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return null;
  const whole = Math.trunc(n);
  if (whole < 1) return null;
  if (whole > 365) return 365;
  return whole;
}

function normalizeTenantThreadTtlDays(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return null;
  const whole = Math.trunc(n);
  if (whole <= 0) return null;
  if (whole > 365) return 365;
  return whole;
}

async function isTenantChatWidgetEnabled(tenantId) {
  const key = String(tenantId || "").trim();
  if (!key) return true;

  const cached = tenantChatWidgetState.get(key);
  const now = Date.now();
  if (
    cached
    && cached.loaded === true
    && cached.fetchedAt > 0
    && (now - cached.fetchedAt) < CHAT_WIDGET_STATE_TTL_MS
  ) {
    return cached.enabled !== false;
  }
  if (cached && cached.loadingPromise) {
    return cached.loadingPromise;
  }

  const entry = cached || {
    loaded: false,
    enabled: true,
    fetchedAt: 0,
    loadingPromise: null,
  };

  entry.loadingPromise = (async () => {
    try {
      const [rows] = await db.query(
        `SELECT chat_widget_enabled
           FROM ten_tenants
          WHERE id = ?
          LIMIT 1`,
        [Number(key)]
      );
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      const enabled = normalizeTenantChatWidgetEnabled(row ? row.chat_widget_enabled : undefined);
      entry.loaded = true;
      entry.enabled = enabled;
      entry.fetchedAt = Date.now();
      return enabled;
    } catch (err) {
      const code = String(err && err.code || "");
      if (code === "ER_BAD_FIELD_ERROR") {
        entry.loaded = true;
        entry.enabled = true;
        entry.fetchedAt = Date.now();
        return true;
      }
      throw err;
    } finally {
      entry.loadingPromise = null;
    }
  })();

  tenantChatWidgetState.set(key, entry);
  return entry.loadingPromise;
}

function setTenantChatWidgetEnabledCache(tenantId, enabled) {
  const key = String(tenantId || "").trim();
  if (!key) return;
  tenantChatWidgetState.set(key, {
    loaded: true,
    enabled: enabled !== false,
    fetchedAt: Date.now(),
    loadingPromise: null,
  });
}

function closeTenantSseSubscriber(subscriber) {
  if (!subscriber) return;
  try {
    writeSseEvent(subscriber.res, "disabled", { disabled: true, error: "CHAT_DISABLED" });
  } catch {}
  stopSseHeartbeat(subscriber);
  try { subscriber.res.end(); } catch {}
}

function disconnectTenantChatRuntime(tenantId) {
  const tenantKey = getTenantKey(tenantId);
  if (!tenantKey) return;

  for (const [key, set] of threadWaiters.entries()) {
    if (!String(key || "").startsWith(`${tenantKey}:`)) continue;
    Array.from(set || []).forEach((resolve) => {
      try {
        resolve({
          timeout: true,
          disabled: true,
          updatedAt: "",
          messageChanged: false,
          typingChanged: false,
        });
      } catch {}
    });
    threadWaiters.delete(key);
  }

  const tenantWaitSet = tenantWaiters.get(tenantKey);
  if (tenantWaitSet && tenantWaitSet.size) {
    Array.from(tenantWaitSet).forEach((resolve) => {
      try {
        resolve({
          timeout: true,
          disabled: true,
          updatedAt: "",
          revision: 0,
        });
      } catch {}
    });
    tenantWaiters.delete(tenantKey);
  }

  const tenantUnreadWaitSet = tenantUnreadWaiters.get(tenantKey);
  if (tenantUnreadWaitSet && tenantUnreadWaitSet.size) {
    Array.from(tenantUnreadWaitSet).forEach((resolve) => {
      try {
        resolve({
          timeout: true,
          disabled: true,
          total: 0,
          updatedAt: "",
          revision: 0,
        });
      } catch {}
    });
    tenantUnreadWaiters.delete(tenantKey);
  }

  for (const [key, set] of threadSseSubscribers.entries()) {
    if (!String(key || "").startsWith(`${tenantKey}:`)) continue;
    Array.from(set || []).forEach((subscriber) => {
      closeTenantSseSubscriber(subscriber);
    });
    threadSseSubscribers.delete(key);
  }

  const tenantSummarySseSet = tenantSseSubscribers.get(tenantKey);
  if (tenantSummarySseSet && tenantSummarySseSet.size) {
    Array.from(tenantSummarySseSet).forEach((subscriber) => {
      closeTenantSseSubscriber(subscriber);
    });
    tenantSseSubscribers.delete(tenantKey);
  }

  for (const [key, set] of unreadSseSubscribers.entries()) {
    if (key !== `out:${tenantKey}` && !String(key || "").startsWith(`in:${tenantKey}:`)) continue;
    Array.from(set || []).forEach((subscriber) => {
      closeTenantSseSubscriber(subscriber);
    });
    unreadSseSubscribers.delete(key);
  }

  for (const [key, timer] of clientUnreadRefreshState.entries()) {
    if (!String(key || "").startsWith(`${tenantKey}:`)) continue;
    clearTimeout(timer);
    clientUnreadRefreshState.delete(key);
  }

  tenantChangeState.delete(tenantKey);
  const tenantUnreadEntry = tenantUnreadState.get(tenantKey);
  if (tenantUnreadEntry && tenantUnreadEntry.refreshTimer) {
    clearTimeout(tenantUnreadEntry.refreshTimer);
  }
  tenantUnreadState.delete(tenantKey);
  tenantPushCompanyTitleCache.delete(tenantKey);
  guestThreadCleanupState.delete(tenantKey);

  for (const key of Array.from(threadTypingState.keys())) {
    if (String(key || "").startsWith(`${tenantKey}:`)) {
      threadTypingState.delete(key);
    }
  }
  for (const [timerKey, timer] of Array.from(threadTypingExpireTimers.entries())) {
    if (!String(timerKey || "").startsWith(`${tenantKey}:`)) continue;
    try { clearTimeout(timer); } catch {}
    threadTypingExpireTimers.delete(timerKey);
  }
  for (const coalesceKey of Array.from(threadTypingCoalesceState.keys())) {
    if (!String(coalesceKey || "").startsWith(`${tenantKey}:`)) continue;
    threadTypingCoalesceState.delete(coalesceKey);
  }
}

async function handleTenantChatWidgetStateChange(tenantId, enabled) {
  setTenantChatWidgetEnabledCache(tenantId, enabled);
  if (enabled !== false) return;
  disconnectTenantChatRuntime(tenantId);
  await deletePushSubscriptionsForTenant(tenantId).catch((err) => {
    console.error("chat-temp tenant push cleanup error:", err);
  });
}

async function resolveGuestThreadTtlDaysForTenant(tenantId) {
  const key = String(tenantId || "").trim();
  if (!key) return CHAT_GUEST_THREAD_TTL_DAYS_DEFAULT;

  try {
    const [rows] = await db.query(
      `SELECT chat_guest_thread_ttl_days
         FROM ten_tenants
        WHERE id = ?
        LIMIT 1`,
      [Number(key)]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    const ttlDays = normalizeTenantGuestThreadTtlDays(row ? row.chat_guest_thread_ttl_days : null);
    return ttlDays || CHAT_GUEST_THREAD_TTL_DAYS_DEFAULT;
  } catch (err) {
    const code = String(err && err.code || "");
    if (code === "ER_BAD_FIELD_ERROR") return CHAT_GUEST_THREAD_TTL_DAYS_DEFAULT;
    throw err;
  }
}

function getTenantId(req) {
  const fromHeader = Number(req.headers["x-tenant-id"]);
  if (Number.isFinite(fromHeader) && fromHeader > 0) return String(Math.trunc(fromHeader));
  const fromQuery = Number(req.query.tenant_id);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return String(Math.trunc(fromQuery));
  return "1";
}

function normalizeClientId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.trunc(n));
}

function normalizePushClientId(value, actorKey) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return actorKey === "out" ? "0" : null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  if (id > 0) return String(id);
  if (id === 0 && actorKey === "out") return "0";
  return null;
}

function parsePositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.trunc(fallback);
  const whole = Math.trunc(n);
  if (whole < min) return Math.trunc(fallback);
  if (whole > max) return Math.trunc(max);
  return whole;
}

function getGuestThreadCleanupBucket(tenantId) {
  const key = String(tenantId || "");
  if (!key) return null;
  let bucket = guestThreadCleanupState.get(key);
  if (!bucket) {
    bucket = {
      lastGuestRunAt: 0,
      lastOrphanRunAt: 0,
      inFlight: null,
    };
    guestThreadCleanupState.set(key, bucket);
  }
  return bucket;
}

async function cleanupExpiredGuestThreadsForTenant(tenantId) {
  const tenant = String(tenantId || "");
  if (!tenant) return 0;

  const ttlDays = await resolveGuestThreadTtlDaysForTenant(tenant);
  if (!ttlDays || ttlDays <= 0) return 0;

  const guestPrefix = "\u0433\u043e\u0441\u0442\u044c";
  const timestamp = new Date().toISOString();
  let totalDeleted = 0;

  for (let pass = 0; pass < 5; pass += 1) {
    const [candidateRows] = await db.query(
      `SELECT client_id
         FROM chat_threads
        WHERE tenant_id = ?
          AND updated_at < (NOW(3) - INTERVAL ? DAY)
          AND LOWER(TRIM(COALESCE(meta_name, ''))) LIKE CONCAT(?, '%')
        ORDER BY updated_at ASC, client_id ASC
        LIMIT ?`,
      [
        Number(tenant),
        ttlDays,
        guestPrefix,
        CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT,
      ]
    );

    const clientIds = (Array.isArray(candidateRows) ? candidateRows : [])
      .map((row) => normalizeClientId(row?.client_id))
      .filter(Boolean);
    if (!clientIds.length) break;

    const [deleteResult] = await db.query(
      `DELETE FROM chat_threads
        WHERE tenant_id = ? AND client_id IN (${clientIds.map(() => "?").join(",")})`,
      [Number(tenant), ...clientIds.map((id) => Number(id))]
    );
    const deletedNow = Number(deleteResult?.affectedRows || 0);
    if (deletedNow <= 0) break;

    totalDeleted += deletedNow;
    await deletePushSubscriptionsForThreads(tenant, clientIds).catch(() => {});
    clientIds.forEach((clientId) => {
      clearThreadTypingState(tenant, clientId);
      notifyThreadChange(tenant, clientId, timestamp);
    });

    if (clientIds.length < CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT) break;
  }

  if (totalDeleted > 0) {
    scheduleTenantUnreadRefresh(tenant);
    console.info(
      `[chat-temp] auto-removed expired guest chats tenant=${tenant} count=${totalDeleted}`
    );
  }

  return totalDeleted;
}

async function cleanupExpiredThreadsForTenant(tenantId) {
  const tenant = String(tenantId || "");
  if (!tenant) return 0;

  const ttlDays = await resolveThreadTtlDaysForTenant(tenant);
  if (!ttlDays || ttlDays <= 0) return 0;

  const timestamp = new Date().toISOString();
  let totalDeleted = 0;

  for (let pass = 0; pass < 5; pass += 1) {
    const [candidateRows] = await db.query(
      `SELECT client_id
         FROM chat_threads
        WHERE tenant_id = ?
          AND updated_at < (NOW(3) - INTERVAL ? DAY)
        ORDER BY updated_at ASC, client_id ASC
        LIMIT ?`,
      [Number(tenant), ttlDays, CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT]
    );

    const clientIds = (Array.isArray(candidateRows) ? candidateRows : [])
      .map((row) => normalizeClientId(row?.client_id))
      .filter(Boolean);
    if (!clientIds.length) break;

    const [deleteResult] = await db.query(
      `DELETE FROM chat_threads
        WHERE tenant_id = ? AND client_id IN (${clientIds.map(() => "?").join(",")})`,
      [Number(tenant), ...clientIds.map((id) => Number(id))]
    );
    const deletedNow = Number(deleteResult?.affectedRows || 0);
    if (deletedNow <= 0) break;

    totalDeleted += deletedNow;
    await deletePushSubscriptionsForThreads(tenant, clientIds).catch(() => {});
    clientIds.forEach((clientId) => {
      clearThreadTypingState(tenant, clientId);
      notifyThreadChange(tenant, clientId, timestamp);
    });

    if (clientIds.length < CHAT_GUEST_THREAD_CLEANUP_BATCH_LIMIT) break;
  }

  if (totalDeleted > 0) {
    scheduleTenantUnreadRefresh(tenant);
    console.info(
      `[chat-temp] auto-removed expired chats (all) tenant=${tenant} ttl_days=${ttlDays} count=${totalDeleted}`
    );
  }

  return totalDeleted;
}

async function cleanupOrphanedClientThreadsForTenant(tenantId) {
  const tenant = String(tenantId || "");
  if (!tenant) return 0;

  const guestPrefix = "\u0433\u043e\u0441\u0442\u044c";
  const timestamp = new Date().toISOString();
  let totalDeleted = 0;

  for (let pass = 0; pass < 5; pass += 1) {
    const [candidateRows] = await db.query(
      `SELECT t.client_id
         FROM chat_threads t
         LEFT JOIN cust_customers c
           ON c.tenant_id = t.tenant_id
          AND c.id = t.client_id
        WHERE t.tenant_id = ?
          AND c.id IS NULL
          AND LOWER(TRIM(COALESCE(t.meta_name, ''))) NOT LIKE CONCAT(?, '%')
        ORDER BY t.updated_at ASC, t.client_id ASC
        LIMIT ?`,
      [
        Number(tenant),
        guestPrefix,
        CHAT_ORPHAN_THREAD_CLEANUP_BATCH_LIMIT,
      ]
    );

    const clientIds = (Array.isArray(candidateRows) ? candidateRows : [])
      .map((row) => normalizeClientId(row?.client_id))
      .filter(Boolean);
    if (!clientIds.length) break;

    const [deleteResult] = await db.query(
      `DELETE FROM chat_threads
        WHERE tenant_id = ? AND client_id IN (${clientIds.map(() => "?").join(",")})`,
      [Number(tenant), ...clientIds.map((id) => Number(id))]
    );
    const deletedNow = Number(deleteResult?.affectedRows || 0);
    if (deletedNow <= 0) break;

    totalDeleted += deletedNow;
    await deletePushSubscriptionsForThreads(tenant, clientIds).catch(() => {});
    clientIds.forEach((clientId) => {
      clearThreadTypingState(tenant, clientId);
      notifyThreadChange(tenant, clientId, timestamp);
    });

    if (clientIds.length < CHAT_ORPHAN_THREAD_CLEANUP_BATCH_LIMIT) break;
  }

  if (totalDeleted > 0) {
    scheduleTenantUnreadRefresh(tenant);
    console.info(
      `[chat-temp] auto-removed orphan client chats tenant=${tenant} count=${totalDeleted}`
    );
  }

  return totalDeleted;
}

function scheduleExpiredGuestThreadsCleanup(tenantId) {
  const tenant = String(tenantId || "");
  if (!tenant) return;
  const bucket = getGuestThreadCleanupBucket(tenant);
  if (!bucket) return;

  const now = Date.now();
  if (bucket.inFlight) return;
  const shouldRunOrphan = !(
    bucket.lastOrphanRunAt > 0
    && (now - bucket.lastOrphanRunAt) < CHAT_ORPHAN_THREAD_CLEANUP_MIN_INTERVAL_MS
  );
  const shouldRunGuest = !(
    bucket.lastGuestRunAt > 0
    && (now - bucket.lastGuestRunAt) < CHAT_GUEST_THREAD_CLEANUP_MIN_INTERVAL_MS
  );
  if (!shouldRunOrphan && !shouldRunGuest) {
    return;
  }

  if (shouldRunOrphan) {
    bucket.lastOrphanRunAt = now;
  }
  if (shouldRunGuest) {
    bucket.lastGuestRunAt = now;
  }

  bucket.inFlight = (async () => {
    if (shouldRunOrphan) {
      await cleanupOrphanedClientThreadsForTenant(tenant);
    }
    if (shouldRunGuest) {
      const removedAll = await cleanupExpiredThreadsForTenant(tenant);
      if (!removedAll) {
        await cleanupExpiredGuestThreadsForTenant(tenant);
      }
    }
  })()
    .catch((err) => {
      console.error("chat-temp guest cleanup error:", err);
    })
    .finally(() => {
      const next = getGuestThreadCleanupBucket(tenant);
      if (!next) return;
      next.inFlight = null;
    });
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toIsoOrNow(value) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function toIsoOrEmpty(value) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function toDbDateOrNull(value, fallbackNow = false) {
  if (!value && !fallbackNow) return null;
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) {
    return fallbackNow ? new Date() : null;
  }
  return d;
}

function sanitizeReply(reply) {
  if (!reply || typeof reply !== "object") return null;
  const id = String(reply.id || "").slice(0, 120);
  if (!id) return null;
  return {
    id,
    sender: String(reply.sender || "").slice(0, 120),
    text: String(reply.text || "").slice(0, 4000),
  };
}

function sanitizeReactions(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    in: String(source.in || "").slice(0, 20),
    out: String(source.out || "").slice(0, 20),
  };
}

function sanitizeAttachment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind || "").toLowerCase();
  if (kind !== "image") return null;

  const dataUrl = String(raw.dataUrl || "");
  const url = String(raw.url || raw.src || "").trim();
  const hasDataUrl = /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl);
  const hasUrl = /^(?:\/uploads\/chat\/|\/static\/uploads\/chat\/)/i.test(url) || /^https?:\/\//i.test(url);
  if (!hasDataUrl && !hasUrl) return null;
  if (hasDataUrl && dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return null;

  const mimeRaw = String(raw.mime || "").toLowerCase();
  const mime = /^image\/[a-z0-9.+-]+$/i.test(mimeRaw) ? mimeRaw : "";

  const width = Number(raw.width);
  const height = Number(raw.height);
  const size = Number(raw.size);

  return {
    kind: "image",
    name: String(raw.name || "").slice(0, 160),
    mime,
    dataUrl: hasDataUrl ? dataUrl : "",
    url: hasUrl ? url : "",
    width: Number.isFinite(width) && width > 0 ? Math.min(10000, Math.round(width)) : 0,
    height: Number.isFinite(height) && height > 0 ? Math.min(10000, Math.round(height)) : 0,
    size: Number.isFinite(size) && size > 0 ? Math.min(50 * 1024 * 1024, Math.round(size)) : 0,
  };
}

function sanitizeMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().slice(0, 120);
  if (!id) return null;

  const direction = normalizeMessageDirection(raw.direction, id);
  const deliveryStatusRaw = String(raw.deliveryStatus || "").toLowerCase();
  const deliveryStatus = ["sent", "delivered", "read"].includes(deliveryStatusRaw)
    ? deliveryStatusRaw
    : "";

  const reactions = sanitizeReactions(raw.reactions);
  const legacyReaction = String(raw.reaction || "").slice(0, 20);
  if (!reactions.in && !reactions.out && legacyReaction) {
    reactions[direction] = legacyReaction;
  }

  return {
    id,
    direction,
    text: String(raw.text || "").slice(0, 5000),
    createdAt: toIsoOrNow(raw.createdAt),
    editedAt: raw.editedAt ? toIsoOrNow(raw.editedAt) : "",
    read: raw.read === true,
    pinned: raw.pinned === true,
    reaction: legacyReaction || reactions[direction] || "",
    reactions,
    replyTo: sanitizeReply(raw.replyTo),
    attachment: sanitizeAttachment(raw.attachment),
    deliveryStatus,
    deliveredAt: raw.deliveredAt ? toIsoOrNow(raw.deliveredAt) : "",
    readAt: raw.readAt ? toIsoOrNow(raw.readAt) : "",
  };
}

function sanitizeThread(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];

  for (const item of input) {
    const msg = sanitizeMessage(item);
    if (!msg) continue;
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    out.push(msg);
    if (out.length >= MAX_MESSAGES_PER_THREAD) break;
  }

  out.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });
  return out;
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object") return {};
  const rawLastWelcomeDay = String(meta.last_welcome_day || meta.lastWelcomeDay || "").trim();
  const lastWelcomeDay = /^\d{4}-\d{2}-\d{2}$/.test(rawLastWelcomeDay) ? rawLastWelcomeDay : "";
  return {
    name: String(meta.name || "").slice(0, 160),
    phone: String(meta.phone || "").slice(0, 60),
    last_welcome_day: lastWelcomeDay,
  };
}

function sanitizeMetaPatch(meta) {
  const source = meta && typeof meta === "object" ? meta : null;
  if (!source) return {};
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(source, "name")) {
    patch.name = String(source.name || "").slice(0, 160);
  }
  if (Object.prototype.hasOwnProperty.call(source, "phone")) {
    patch.phone = String(source.phone || "").slice(0, 60);
  }
  if (
    Object.prototype.hasOwnProperty.call(source, "last_welcome_day")
    || Object.prototype.hasOwnProperty.call(source, "lastWelcomeDay")
  ) {
    const rawLastWelcomeDay = String(source.last_welcome_day || source.lastWelcomeDay || "").trim();
    patch.last_welcome_day = /^\d{4}-\d{2}-\d{2}$/.test(rawLastWelcomeDay) ? rawLastWelcomeDay : "";
  }

  return patch;
}

function sanitizeMetaFromDbRow(row) {
  if (!row) return {};
  return sanitizeMeta({
    name: row.meta_name,
    phone: row.meta_phone,
    last_welcome_day: row.meta_last_welcome_day,
  });
}

function normalizeMessageId(value) {
  const id = String(value || "").trim().slice(0, 120);
  return id || null;
}

function getThreadKey(tenantId, clientId) {
  const tenant = normalizeClientId(tenantId);
  const client = normalizeClientId(clientId);
  if (!tenant || !client) return "";
  return `${tenant}:${client}`;
}

function getTenantKey(tenantId) {
  const tenant = normalizeClientId(tenantId);
  return tenant || "";
}

async function resolveThreadTtlDaysForTenant(tenantId) {
  const key = String(tenantId || "").trim();
  if (!key) return null;

  try {
    const [rows] = await db.query(
      `SELECT chat_thread_ttl_days
         FROM ten_tenants
        WHERE id = ?
        LIMIT 1`,
      [Number(key)]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return normalizeTenantThreadTtlDays(row ? row.chat_thread_ttl_days : null);
  } catch (err) {
    const code = String(err && err.code || "");
    if (code === "ER_BAD_FIELD_ERROR") return null;
    throw err;
  }
}

function getUnreadStreamKey(tenantId, actorKey, clientId = "") {
  const tenant = getTenantKey(tenantId);
  if (!tenant) return "";
  if (actorKey === "in") {
    const client = normalizeClientId(clientId);
    if (!client) return "";
    return `in:${tenant}:${client}`;
  }
  return `out:${tenant}`;
}

function writeSseEvent(res, event, payload) {
  if (!res || typeof res.write !== "function") return false;
  try {
    res.write(`event: ${String(event || "message")}\n`);
    res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function writeSseComment(res, comment = "keepalive") {
  if (!res || typeof res.write !== "function") return false;
  try {
    res.write(`: ${String(comment || "keepalive")}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function removeSseSubscriber(store, key, subscriber) {
  if (!store || !key || !subscriber) return;
  const set = store.get(key);
  if (!set || !set.size) return;
  set.delete(subscriber);
  if (!set.size) store.delete(key);
}

function createSseSubscriber(res, eventName, buildPayload) {
  const subscriber = {
    res,
    eventName: String(eventName || "message"),
    buildPayload,
    heartbeatTimer: 0,
  };

  subscriber.send = (payload) => writeSseEvent(
    res,
    subscriber.eventName,
    typeof buildPayload === "function" ? buildPayload(payload) : (payload || {})
  );

  return subscriber;
}

function addSseSubscriber(store, key, subscriber) {
  if (!store || !key || !subscriber) return;
  const set = store.get(key) || new Set();
  set.add(subscriber);
  store.set(key, set);
}

function startSseHeartbeat(subscriber) {
  if (!subscriber || subscriber.heartbeatTimer) return;
  subscriber.heartbeatTimer = setInterval(() => {
    if (!writeSseComment(subscriber.res, "heartbeat")) {
      stopSseHeartbeat(subscriber);
    }
  }, CHAT_SSE_HEARTBEAT_MS);
}

function stopSseHeartbeat(subscriber) {
  if (!subscriber || !subscriber.heartbeatTimer) return;
  clearInterval(subscriber.heartbeatTimer);
  subscriber.heartbeatTimer = 0;
}

function initializeSseResponse(req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  if (req?.socket && typeof req.socket.setTimeout === "function") {
    req.socket.setTimeout(0);
  }
  writeSseComment(res, "connected");
}

function emitThreadSseEvent(tenantId, clientId, payload = {}) {
  const key = getThreadKey(tenantId, clientId);
  if (!key) return;
  const set = threadSseSubscribers.get(key);
  if (!set || !set.size) return;

  Array.from(set).forEach((subscriber) => {
    const sent = subscriber.send(payload);
    if (!sent) {
      stopSseHeartbeat(subscriber);
      removeSseSubscriber(threadSseSubscribers, key, subscriber);
    }
  });
}

function emitTenantSseEvent(tenantId, payload = {}) {
  const key = getTenantKey(tenantId);
  if (!key) return;
  const set = tenantSseSubscribers.get(key);
  if (!set || !set.size) return;

  Array.from(set).forEach((subscriber) => {
    const sent = subscriber.send(payload);
    if (!sent) {
      stopSseHeartbeat(subscriber);
      removeSseSubscriber(tenantSseSubscribers, key, subscriber);
    }
  });
}

function emitUnreadSseEvent(tenantId, actorKey, clientId, payload = {}) {
  const key = getUnreadStreamKey(tenantId, actorKey, clientId);
  if (!key) return;
  const set = unreadSseSubscribers.get(key);
  if (!set || !set.size) return;

  Array.from(set).forEach((subscriber) => {
    const sent = subscriber.send(payload);
    if (!sent) {
      stopSseHeartbeat(subscriber);
      removeSseSubscriber(unreadSseSubscribers, key, subscriber);
    }
  });
}

function getTenantChangeEntry(tenantId, create = false) {
  const key = getTenantKey(tenantId);
  if (!key) return null;
  let entry = tenantChangeState.get(key);
  if ((!entry || typeof entry !== "object") && create === true) {
    entry = {
      loaded: false,
      updatedAt: "",
      revision: 0,
    };
    tenantChangeState.set(key, entry);
  }
  return entry || null;
}

async function ensureTenantChangeEntryLoaded(tenantId) {
  const entry = getTenantChangeEntry(tenantId, true);
  if (!entry) return {
    loaded: true,
    updatedAt: "",
    revision: 0,
  };
  if (entry.loaded) return entry;

  const updatedAt = await readTenantUpdatedAt(tenantId);
  entry.updatedAt = String(updatedAt || "");
  if (entry.updatedAt && Number(entry.revision || 0) <= 0) {
    entry.revision = 1;
  }
  entry.loaded = true;
  return entry;
}

function touchTenantChange(tenantId, updatedAt = "") {
  const entry = getTenantChangeEntry(tenantId, true);
  if (!entry) return {
    updatedAt: String(updatedAt || ""),
    revision: 0,
  };
  const nextUpdatedAt = String(updatedAt || "").trim() || new Date().toISOString();
  entry.updatedAt = nextUpdatedAt;
  entry.revision = Number(entry.revision || 0) + 1;
  entry.loaded = true;
  return {
    updatedAt: entry.updatedAt,
    revision: entry.revision,
  };
}

function getTenantUnreadEntry(tenantId, create = false) {
  const key = getTenantKey(tenantId);
  if (!key) return null;
  let entry = tenantUnreadState.get(key);
  if ((!entry || typeof entry !== "object") && create === true) {
    entry = {
      loaded: false,
      total: 0,
      updatedAt: "",
      revision: 0,
      loadingPromise: null,
      refreshTimer: 0,
    };
    tenantUnreadState.set(key, entry);
  }
  return entry || null;
}

function notifyTenantUnreadChange(tenantId, payload = {}) {
  const key = getTenantKey(tenantId);
  if (!key) return;
  const data = {
    total: Number(payload.total || 0),
    updatedAt: String(payload.updatedAt || ""),
    revision: Number(payload.revision || 0),
  };
  const set = tenantUnreadWaiters.get(key);
  if (set && set.size) {
    Array.from(set).forEach((resolve) => {
      try { resolve(data); } catch {}
    });
  }
  emitUnreadSseEvent(tenantId, "out", "", {
    changed: true,
    unread_total: data.total,
    total: data.total,
    updated_at: data.updatedAt,
    revision: data.revision,
    timeout: false,
  });
}

function waitForTenantUnreadChange(tenantId, timeoutMs) {
  const key = getTenantKey(tenantId);
  if (!key) return Promise.resolve({ timeout: true });
  const timeout = Math.min(
    CHAT_LONG_POLL_MAX_TIMEOUT_MS,
    Math.max(CHAT_LONG_POLL_MIN_TIMEOUT_MS, Number(timeoutMs || 0) || 20000)
  );
  return new Promise((resolve) => {
    const waitSet = tenantUnreadWaiters.get(key) || new Set();
    let done = false;
    const complete = (payload) => {
      if (done) return;
      done = true;
      waitSet.delete(complete);
      if (!waitSet.size) tenantUnreadWaiters.delete(key);
      clearTimeout(timer);
      resolve(payload || { timeout: true });
    };
    waitSet.add(complete);
    tenantUnreadWaiters.set(key, waitSet);
    const timer = setTimeout(() => complete({ timeout: true }), timeout);
  });
}

async function readTenantUnreadTotal(tenantId) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM chat_messages
      WHERE tenant_id = ?
        AND direction = 'in'
        AND is_read = 0
        AND message_id NOT LIKE 'assistant-auto-%'
        AND message_id NOT LIKE 'daily-welcome-%'`,
    [Number(tenantId)]
  );
  const total = Number(rows?.[0]?.total || 0);
  if (!Number.isFinite(total) || total < 0) return 0;
  return Math.trunc(total);
}

async function readTenantUnansweredUnreadTotal(tenantId) {
  const [rows] = await db.query(
    `
      SELECT
        m.client_id AS client_id,
        COUNT(*) AS total
      FROM chat_messages m
      WHERE m.tenant_id = ?
        AND m.direction = 'in'
        AND m.is_read = 0
        AND m.message_id NOT LIKE 'assistant-auto-%'
        AND m.message_id NOT LIKE 'daily-welcome-%'
        AND NOT EXISTS (
          SELECT 1
          FROM chat_messages r
          WHERE r.tenant_id = m.tenant_id
            AND r.client_id = m.client_id
            AND r.id > m.id
            AND r.direction = 'out'
            AND (
              r.message_id LIKE 'assistant-auto-%'
              OR r.message_id LIKE 'daily-welcome-%'
            )
          LIMIT 1
        )
      GROUP BY m.client_id
    `,
    [Number(tenantId)]
  );
  const nowMs = Date.now();
  let total = 0;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const clientId = normalizeClientId(row?.client_id);
    if (!clientId) return;
    const typingEntry = getThreadTypingEntry(tenantId, clientId);
    const outTyping = typingEntry && typingEntry.out ? typingEntry.out : null;
    const botTypingActive = outTyping?.active === true && Number(outTyping?.expiresAtMs || 0) > nowMs;
    if (botTypingActive) return;
    const countRaw = Number(row?.total || 0);
    if (!Number.isFinite(countRaw) || countRaw <= 0) return;
    total += Math.trunc(countRaw);
  });
  return total > 0 ? total : 0;
}

function computeUnansweredCountFromRowsDesc(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 0;
  let pendingBotReplies = 0;
  let unanswered = 0;
  for (const row of list) {
    const direction = String(row?.direction || "").toLowerCase();
    if (direction === "out") {
      pendingBotReplies += 1;
      continue;
    }
    if (direction !== "in") continue;
    if (pendingBotReplies > 0) {
      pendingBotReplies -= 1;
      continue;
    }
    unanswered += 1;
  }
  return unanswered;
}

async function queryUnansweredCountByClient(tenantId, clientIds = []) {
  const safeTenantId = Number(tenantId);
  if (!Number.isFinite(safeTenantId) || safeTenantId <= 0) return new Map();
  const ids = (Array.isArray(clientIds) ? clientIds : [])
    .map((id) => normalizeClientId(id))
    .filter(Boolean);
  const hasClientFilter = ids.length > 0;
  const clientClause = hasClientFilter
    ? ` AND client_id IN (${ids.map(() => "?").join(",")})`
    : "";

  const [rows] = await db.query(
    `
      SELECT
        client_id,
        direction,
        message_id
      FROM chat_messages
      WHERE tenant_id = ?
        AND (
          direction = 'in'
          OR (
            direction = 'out'
            AND (
              message_id LIKE 'assistant-auto-%'
              OR message_id LIKE 'daily-welcome-%'
            )
          )
        )
        ${clientClause}
      ORDER BY client_id ASC, id DESC
    `,
    hasClientFilter
      ? [safeTenantId, ...ids.map((id) => Number(id))]
      : [safeTenantId]
  );

  const byClientRows = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = normalizeClientId(row?.client_id);
    if (!key) return;
    const arr = byClientRows.get(key) || [];
    arr.push(row);
    byClientRows.set(key, arr);
  });

  const counts = new Map();
  byClientRows.forEach((clientRows, clientIdKey) => {
    counts.set(clientIdKey, computeUnansweredCountFromRowsDesc(clientRows));
  });
  if (hasClientFilter) {
    ids.forEach((id) => {
      const key = String(id);
      if (!counts.has(key)) counts.set(key, 0);
    });
  }
  return counts;
}

function toUnreadRevision(updatedAt) {
  const ts = new Date(String(updatedAt || "")).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return Math.trunc(ts);
}

async function readClientUnreadSnapshot(tenantId, clientId) {
  const normalizedClientId = normalizeClientId(clientId);
  if (!normalizedClientId) {
    return {
      total: 0,
      updatedAt: "",
      revision: 0,
    };
  }

  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM chat_messages
      WHERE tenant_id = ?
        AND client_id = ?
        AND direction = 'out'
        AND is_read = 0`,
    [Number(tenantId), Number(normalizedClientId)]
  );
  const totalRaw = Number(countRows?.[0]?.total || 0);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.trunc(totalRaw) : 0;

  const [threadRows] = await db.query(
    `SELECT updated_at
       FROM chat_threads
      WHERE tenant_id = ? AND client_id = ?
      LIMIT 1`,
    [Number(tenantId), Number(normalizedClientId)]
  );
  const updatedAt = toIsoOrEmpty(threadRows?.[0]?.updated_at);
  const revision = toUnreadRevision(updatedAt);

  return {
    total,
    updatedAt,
    revision,
  };
}

function applyTenantUnreadTotal(tenantId, totalRaw, updatedAt = "") {
  const entry = getTenantUnreadEntry(tenantId, true);
  if (!entry) {
    return {
      changed: false,
      total: 0,
      updatedAt: "",
      revision: 0,
    };
  }

  const total = Number(totalRaw);
  const nextTotal = Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
  const prevTotal = Number(entry.total || 0);
  const changed = !entry.loaded || prevTotal !== nextTotal;
  entry.total = nextTotal;
  entry.updatedAt = String(updatedAt || "").trim() || new Date().toISOString();
  entry.loaded = true;

  if (changed) {
    entry.revision = Number(entry.revision || 0) + 1;
    notifyTenantUnreadChange(tenantId, {
      total: entry.total,
      updatedAt: entry.updatedAt,
      revision: entry.revision,
    });
  }

  return {
    changed,
    total: entry.total,
    updatedAt: entry.updatedAt,
    revision: entry.revision,
  };
}

function scheduleClientUnreadSseRefresh(tenantId, clientId, options = {}) {
  const key = getThreadKey(tenantId, clientId);
  const streamKey = getUnreadStreamKey(tenantId, "in", clientId);
  if (!key || !streamKey) return;
  const listeners = unreadSseSubscribers.get(streamKey);
  if (!listeners || !listeners.size) return;

  const currentTimer = clientUnreadRefreshState.get(key);
  if (currentTimer) return;

  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Math.trunc(Number(options.delayMs)))
    : 140;

  const timer = setTimeout(async () => {
    clientUnreadRefreshState.delete(key);
    try {
      const snapshot = await readClientUnreadSnapshot(tenantId, clientId);
      emitUnreadSseEvent(tenantId, "in", clientId, {
        changed: true,
        unread_total: Number(snapshot.total || 0),
        total: Number(snapshot.total || 0),
        updated_at: String(snapshot.updatedAt || ""),
        revision: Number(snapshot.revision || 0),
        timeout: false,
      });
    } catch (err) {
      console.error("chat-temp client unread SSE refresh error:", err);
    }
  }, delayMs);

  clientUnreadRefreshState.set(key, timer);
}

async function ensureTenantUnreadLoaded(tenantId) {
  const entry = getTenantUnreadEntry(tenantId, true);
  if (!entry) return {
    total: 0,
    updatedAt: "",
    revision: 0,
  };
  if (entry.loaded) {
    return {
      total: Number(entry.total || 0),
      updatedAt: String(entry.updatedAt || ""),
      revision: Number(entry.revision || 0),
    };
  }
  if (entry.loadingPromise) {
    await entry.loadingPromise;
    return {
      total: Number(entry.total || 0),
      updatedAt: String(entry.updatedAt || ""),
      revision: Number(entry.revision || 0),
    };
  }

  entry.loadingPromise = readTenantUnreadTotal(tenantId)
    .then((total) => {
      applyTenantUnreadTotal(tenantId, total, new Date().toISOString());
    })
    .catch((err) => {
      console.error("chat-temp unread warmup error:", err);
    })
    .finally(() => {
      const current = getTenantUnreadEntry(tenantId);
      if (current) current.loadingPromise = null;
    });

  await entry.loadingPromise;
  return {
    total: Number(entry.total || 0),
    updatedAt: String(entry.updatedAt || ""),
    revision: Number(entry.revision || 0),
  };
}

function scheduleTenantUnreadRefresh(tenantId, options = {}) {
  const key = getTenantKey(tenantId);
  if (!key) return;
  const entry = getTenantUnreadEntry(tenantId, true);
  if (!entry) return;

  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Math.trunc(Number(options.delayMs)))
    : 180;

  if (entry.refreshTimer) return;
  entry.refreshTimer = setTimeout(async () => {
    const current = getTenantUnreadEntry(tenantId);
    if (current) current.refreshTimer = 0;
    try {
      const total = await readTenantUnreadTotal(tenantId);
      applyTenantUnreadTotal(tenantId, total, new Date().toISOString());
    } catch (err) {
      console.error("chat-temp unread refresh error:", err);
    }
  }, delayMs);
}

function sanitizeTypingText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.slice(0, CHAT_TYPING_TEXT_MAX_LENGTH);
}

function getEmptyTypingActorState(actor) {
  return {
    actor: actor === "in" ? "in" : "out",
    active: false,
    text: "",
    updated_at: "",
    expires_at: "",
  };
}

function getThreadTypingExpireTimerKey(tenantId, clientId, actorKey) {
  const key = getThreadKey(tenantId, clientId);
  if (!key) return "";
  const actor = actorKey === "in" ? "in" : "out";
  return `${key}:${actor}`;
}

function getThreadTypingCoalesceKey(tenantId, clientId, actorKey) {
  return getThreadTypingExpireTimerKey(tenantId, clientId, actorKey);
}

function clearThreadTypingExpireTimer(tenantId, clientId, actorKey) {
  const timerKey = getThreadTypingExpireTimerKey(tenantId, clientId, actorKey);
  if (!timerKey) return;
  const timer = threadTypingExpireTimers.get(timerKey);
  if (timer) {
    try { clearTimeout(timer); } catch {}
    threadTypingExpireTimers.delete(timerKey);
  }
}

function scheduleThreadTypingExpireTimer(tenantId, clientId, actorKey, expiresAtMs) {
  const actor = actorKey === "in" ? "in" : "out";
  const safeTenantId = normalizeClientId(tenantId);
  const safeClientId = normalizeClientId(clientId);
  if (!safeTenantId || !safeClientId) return;
  const until = Number(expiresAtMs || 0);
  if (!Number.isFinite(until) || until <= 0) return;

  clearThreadTypingExpireTimer(safeTenantId, safeClientId, actor);
  const delay = Math.max(0, until - Date.now() + 30);
  const timerKey = getThreadTypingExpireTimerKey(safeTenantId, safeClientId, actor);
  if (!timerKey) return;

  const timer = setTimeout(() => {
    threadTypingExpireTimers.delete(timerKey);
    const entry = getThreadTypingEntry(safeTenantId, safeClientId);
    if (!entry || !entry[actor]) return;
    const current = entry[actor];
    const currentExpiresAtMs = Number(current.expiresAtMs || 0);
    if (current.active !== true) return;
    if (!Number.isFinite(currentExpiresAtMs) || currentExpiresAtMs > Date.now()) return;

    const nowIso = new Date().toISOString();
    entry[actor] = {
      active: false,
      text: "",
      updatedAt: nowIso,
      expiresAtMs: 0,
    };
    threadTypingCoalesceState.delete(getThreadTypingCoalesceKey(safeTenantId, safeClientId, actor));
    persistThreadTypingState(safeTenantId, safeClientId, actor, {
      actor,
      active: false,
      text: "",
      updated_at: nowIso,
      expires_at: "",
    }).catch(() => {});
    notifyThreadChange(safeTenantId, safeClientId, "", {
      messageChanged: false,
      typingChanged: true,
    });
  }, delay);
  if (timer && typeof timer.unref === "function") {
    try { timer.unref(); } catch {}
  }
  threadTypingExpireTimers.set(timerKey, timer);
}

function getThreadTypingEntry(tenantId, clientId, create = false) {
  const key = getThreadKey(tenantId, clientId);
  if (!key) return null;
  let entry = threadTypingState.get(key);
  if ((!entry || typeof entry !== "object") && create === true) {
    entry = {
      in: { active: false, text: "", updatedAt: "", expiresAtMs: 0 },
      out: { active: false, text: "", updatedAt: "", expiresAtMs: 0 },
    };
    threadTypingState.set(key, entry);
  }
  return entry;
}

function getPeerTypingForActor(tenantId, clientId, actorKey) {
  const actor = actorKey === "in" ? "in" : "out";
  const peer = actor === "in" ? "out" : "in";
  const entry = getThreadTypingEntry(tenantId, clientId);
  if (!entry || !entry[peer]) return getEmptyTypingActorState(peer);

  const nowMs = Date.now();
  const source = entry[peer];
  const expiresAtMs = Number(source.expiresAtMs || 0);
  const isActive = source.active === true && expiresAtMs > nowMs;
  const expiresAt = isActive ? new Date(expiresAtMs).toISOString() : "";

  return {
    actor: peer,
    active: isActive,
    text: isActive ? sanitizeTypingText(source.text) : "",
    updated_at: String(source.updatedAt || ""),
    expires_at: expiresAt,
  };
}

function setThreadTypingForActor(tenantId, clientId, actorKey, active, text) {
  const actor = actorKey === "in" ? "in" : "out";
  const entry = getThreadTypingEntry(tenantId, clientId, true);
  if (!entry) return getEmptyTypingActorState(actor);

  const nowIso = new Date().toISOString();
  const isActive = active === true;
  if (isActive) {
    const expiresAtMs = Date.now() + CHAT_TYPING_TTL_MS;
    entry[actor] = {
      active: true,
      text: sanitizeTypingText(text),
      updatedAt: nowIso,
      expiresAtMs,
    };
    scheduleThreadTypingExpireTimer(tenantId, clientId, actor, expiresAtMs);
    return {
      actor,
      active: true,
      text: sanitizeTypingText(text),
      updated_at: nowIso,
      expires_at: new Date(expiresAtMs).toISOString(),
    };
  }

  entry[actor] = {
    active: false,
    text: "",
    updatedAt: nowIso,
    expiresAtMs: 0,
  };
  clearThreadTypingExpireTimer(tenantId, clientId, actor);
  return {
    actor,
    active: false,
    text: "",
    updated_at: nowIso,
    expires_at: "",
  };
}

function clearThreadTypingState(tenantId, clientId) {
  const key = getThreadKey(tenantId, clientId);
  if (!key) return;
  clearThreadTypingExpireTimer(tenantId, clientId, "in");
  clearThreadTypingExpireTimer(tenantId, clientId, "out");
  threadTypingCoalesceState.delete(getThreadTypingCoalesceKey(tenantId, clientId, "in"));
  threadTypingCoalesceState.delete(getThreadTypingCoalesceKey(tenantId, clientId, "out"));
  threadTypingState.delete(key);
}

function notifyTenantChange(tenantId, updatedAt = "", options = {}) {
  const key = getTenantKey(tenantId);
  if (!key) return;
  const changed = touchTenantChange(key, updatedAt);
  const messageChanged = options?.messageChanged === true;
  const typingChanged = options?.typingChanged === true;
  const clientId = normalizeClientId(options?.clientId);
  const set = tenantWaiters.get(key);
  const payload = {
    updatedAt: String(changed.updatedAt || ""),
    revision: Number(changed.revision || 0),
    messageChanged,
    typingChanged,
    clientId: clientId ? Number(clientId) : 0,
  };
  if (set && set.size) {
    Array.from(set).forEach((resolve) => {
      try { resolve(payload); } catch {}
    });
  }
  emitTenantSseEvent(tenantId, {
    changed: true,
    message_changed: messageChanged,
    typing_changed: typingChanged,
    client_id: clientId ? Number(clientId) : 0,
    updated_at: payload.updatedAt,
    revision: payload.revision,
    timeout: false,
  });
}

async function persistThreadTypingState(tenantId, clientId, actorKey, typingState) {
  const safeClientId = normalizeClientId(clientId);
  if (!safeClientId) return;
  await ensureChatThreadTypingColumns();

  const actor = actorKey === "in" ? "in" : "out";
  const colPrefix = actor === "in" ? "typing_in" : "typing_out";
  const state = typingState && typeof typingState === "object" ? typingState : {};
  const active = state.active === true;
  const text = active ? sanitizeTypingText(state.text) : "";
  const updatedAt = active
    ? toDbDateOrNull(state.updated_at || new Date().toISOString(), true)
    : null;
  const expiresAt = active
    ? toDbDateOrNull(state.expires_at || "", false)
    : null;

  await db.query(
    `
      INSERT INTO chat_threads
        (tenant_id, client_id, updated_at, ${colPrefix}_active, ${colPrefix}_text, ${colPrefix}_updated_at, ${colPrefix}_expires_at)
      VALUES (?, ?, NOW(3), ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ${colPrefix}_active = VALUES(${colPrefix}_active),
        ${colPrefix}_text = VALUES(${colPrefix}_text),
        ${colPrefix}_updated_at = VALUES(${colPrefix}_updated_at),
        ${colPrefix}_expires_at = VALUES(${colPrefix}_expires_at)
    `,
    [
      Number(tenantId),
      Number(safeClientId),
      active ? 1 : 0,
      text,
      updatedAt,
      expiresAt,
    ]
  );
}

function notifyThreadChange(tenantId, clientId, updatedAt = "", options = {}) {
  const messageChanged = options?.messageChanged !== false;
  const typingChanged = options?.typingChanged === true;
  const key = getThreadKey(tenantId, clientId);
  if (key) {
    const set = threadWaiters.get(key);
    if (set && set.size) {
      const payload = {
        updatedAt: String(updatedAt || ""),
        messageChanged,
        typingChanged,
      };
      Array.from(set).forEach((resolve) => {
        try { resolve(payload); } catch {}
      });
    }
    emitThreadSseEvent(tenantId, clientId, {
      client_id: Number(clientId),
      changed: messageChanged || typingChanged,
      message_changed: messageChanged,
      typing_changed: typingChanged,
      updated_at: String(updatedAt || ""),
    });
  }
  if (messageChanged || typingChanged) {
    notifyTenantChange(tenantId, updatedAt, {
      messageChanged,
      typingChanged,
      clientId: Number(clientId || 0),
    });
  }
  if (messageChanged) {
    scheduleClientUnreadSseRefresh(tenantId, clientId);
  }
}

function waitForThreadChange(tenantId, clientId, timeoutMs) {
  const key = getThreadKey(tenantId, clientId);
  if (!key) return Promise.resolve({ timeout: true });
  const timeout = Math.min(
    CHAT_LONG_POLL_MAX_TIMEOUT_MS,
    Math.max(CHAT_LONG_POLL_MIN_TIMEOUT_MS, Number(timeoutMs || 0) || 20000)
  );
  return new Promise((resolve) => {
    const waitSet = threadWaiters.get(key) || new Set();
    let done = false;
    const complete = (payload) => {
      if (done) return;
      done = true;
      waitSet.delete(complete);
      if (!waitSet.size) threadWaiters.delete(key);
      clearTimeout(timer);
      resolve(payload || { timeout: true });
    };
    waitSet.add(complete);
    threadWaiters.set(key, waitSet);
    const timer = setTimeout(() => complete({ timeout: true }), timeout);
  });
}

function waitForTenantChange(tenantId, timeoutMs) {
  const key = getTenantKey(tenantId);
  if (!key) return Promise.resolve({ timeout: true });
  const timeout = Math.min(
    CHAT_LONG_POLL_MAX_TIMEOUT_MS,
    Math.max(CHAT_LONG_POLL_MIN_TIMEOUT_MS, Number(timeoutMs || 0) || 20000)
  );
  return new Promise((resolve) => {
    const waitSet = tenantWaiters.get(key) || new Set();
    let done = false;
    const complete = (payload) => {
      if (done) return;
      done = true;
      waitSet.delete(complete);
      if (!waitSet.size) tenantWaiters.delete(key);
      clearTimeout(timer);
      resolve(payload || { timeout: true });
    };
    waitSet.add(complete);
    tenantWaiters.set(key, waitSet);
    const timer = setTimeout(() => complete({ timeout: true }), timeout);
  });
}

function getRequestReactionActor(req) {
  const explicitQueryActor = String(req.query?.chat_actor || req.query?.actor || "")
    .trim()
    .toLowerCase();
  if (explicitQueryActor === "in" || explicitQueryActor === "customer" || explicitQueryActor === "client") return "in";
  if (explicitQueryActor === "out" || explicitQueryActor === "admin" || explicitQueryActor === "operator") return "out";

  const explicitBodyActor = String(req.body?.chat_actor || req.body?.actor || "")
    .trim()
    .toLowerCase();
  if (explicitBodyActor === "in" || explicitBodyActor === "customer" || explicitBodyActor === "client") return "in";
  if (explicitBodyActor === "out" || explicitBodyActor === "admin" || explicitBodyActor === "operator") return "out";

  const explicitActor = String(req.headers["x-chat-actor"] || req.headers["x-chat-role"] || "")
    .trim()
    .toLowerCase();
  if (explicitActor === "in" || explicitActor === "customer" || explicitActor === "client") return "in";
  if (explicitActor === "out" || explicitActor === "admin" || explicitActor === "operator") return "out";

  const customerToken = String(req.headers["x-customer-token"] || "").trim();
  return customerToken ? "in" : "out";
}

function mergeReactionsByActor(existingRows, nextMessages, actorKey) {
  const actor = actorKey === "in" ? "in" : "out";
  const peer = actor === "in" ? "out" : "in";
  const byId = new Map();

  (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
    if (!row) return;
    const id = String(row.message_id || "").trim();
    if (!id) return;
    byId.set(id, {
      direction: normalizeMessageDirection(row.direction, id),
      reaction: String(row.reaction_legacy || "").slice(0, 20),
      reactions: sanitizeReactions({
        in: row.reaction_in,
        out: row.reaction_out,
      }),
    });
  });

  return (Array.isArray(nextMessages) ? nextMessages : []).map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const id = String(msg.id || "").trim();
    if (!id) return msg;

    const prev = byId.get(id);
    if (!prev) return msg;

    const nextReactions = sanitizeReactions(msg.reactions);
    nextReactions[peer] = prev.reactions[peer];
    msg.reactions = nextReactions;

    const direction = normalizeMessageDirection(msg.direction, id);
    const legacy = String(msg.reaction || "").slice(0, 20);
    msg.reaction = legacy || String(nextReactions[direction] || "");
    return msg;
  });
}

function mapDbMessageRowToApi(row) {
  const messageId = String(row.message_id || "");
  const direction = normalizeMessageDirection(row.direction, messageId);
  const reactions = sanitizeReactions({
    in: row.reaction_in,
    out: row.reaction_out,
  });
  const legacyReaction = String(row.reaction_legacy || "").slice(0, 20);

  return {
    id: messageId,
    direction,
    text: String(row.text || "").slice(0, 5000),
    createdAt: toIsoOrNow(row.created_at),
    editedAt: row.edited_at ? toIsoOrNow(row.edited_at) : "",
    read: Number(row.is_read || 0) === 1,
    pinned: Number(row.is_pinned || 0) === 1,
    reaction: legacyReaction || reactions[direction] || "",
    reactions,
    replyTo: sanitizeReply(parseJsonObject(row.reply_to_json)),
    attachment: sanitizeAttachment(parseJsonObject(row.attachment_json)),
    deliveryStatus: String(row.delivery_status || "").toLowerCase().slice(0, 16),
    deliveredAt: row.delivered_at ? toIsoOrNow(row.delivered_at) : "",
    readAt: row.read_at ? toIsoOrNow(row.read_at) : "",
  };
}

function getSummaryLastPreviewText(row) {
  const lastText = String(row.last_message_text || "").trim();
  if (lastText) return lastText;

  const attachment = sanitizeAttachment(parseJsonObject(row.last_attachment_json));
  if (attachment && attachment.kind === "image") return "Фото";
  return "";
}

function mapSummaryRow(row, actorKey = "out") {
  const lastMessageIdRaw = Number(row.last_message_id ?? row.lastMessageId ?? 0);
  const lastMessageId = Number.isFinite(lastMessageIdRaw) && lastMessageIdRaw > 0
    ? Math.trunc(lastMessageIdRaw)
    : 0;
  const peerPrefix = actorKey === "in" ? "typing_out" : "typing_in";
  const typingUpdatedAt = toIsoOrEmpty(row?.[`${peerPrefix}_updated_at`]);
  const typingExpiresAt = toIsoOrEmpty(row?.[`${peerPrefix}_expires_at`]);
  const typingFlag = Number(row?.[`${peerPrefix}_active`] || 0) === 1;
  const typingUntilMs = typingExpiresAt ? new Date(typingExpiresAt).getTime() : 0;
  const typingActiveNow = typingFlag && Number.isFinite(typingUntilMs) && typingUntilMs > Date.now();
  const typingText = typingActiveNow ? sanitizeTypingText(row?.[`${peerPrefix}_text`]) : "";
  return {
    client_id: Number(row.client_id),
    updated_at: toIsoOrEmpty(row.updated_at),
    message_count: Number(row.message_count || 0),
    unread_count: Number(row.unread_count || 0),
    last_message_id: lastMessageId,
    lastMessageId: lastMessageId,
    last_message_message_id: String(row.last_message_message_id ?? row.lastMessageMessageId ?? ""),
    lastMessageMessageId: String(row.last_message_message_id ?? row.lastMessageMessageId ?? ""),
    last_message_at: toIsoOrEmpty(row.last_message_at),
    last_message_text: getSummaryLastPreviewText(row),
    typing_active: typingActiveNow,
    typing_text: typingText,
    typing_updated_at: typingUpdatedAt,
    typing_expires_at: typingExpiresAt,
    typingActive: typingActiveNow,
    typingText: typingText,
    typingUpdatedAt: typingUpdatedAt,
    typingExpiresAt: typingExpiresAt,
    meta: sanitizeMetaFromDbRow(row),
  };
}

function ensureAttachmentDir(tenantId, clientId) {
  const tenant = normalizeClientId(tenantId) || "1";
  const client = normalizeClientId(clientId) || "0";
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(CHAT_UPLOAD_ABSOLUTE_DIR, tenant, client, y, m);
  fs.mkdirSync(dir, { recursive: true });
  return { absDir: dir, relDir: path.join(CHAT_UPLOAD_RELATIVE_DIR, tenant, client, y, m) };
}

function extByMime(mime) {
  const type = String(mime || "").toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/avif") return "avif";
  return "jpg";
}

async function storeChatAttachmentImage({ file, tenantId, clientId }) {
  const sourceBuffer = file && file.buffer;
  if (!sourceBuffer || !Buffer.isBuffer(sourceBuffer) || !sourceBuffer.length) {
    throw new Error("FILE_REQUIRED");
  }
  const sourceMime = String(file.mimetype || "").toLowerCase();
  if (!CHAT_ALLOWED_IMAGE_MIME.has(sourceMime)) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }

  const { absDir, relDir } = ensureAttachmentDir(tenantId, clientId);
  const fileId = `${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;

  if (sourceMime === "image/webp") {
    try {
      const meta = await sharp(sourceBuffer, { failOnError: false }).metadata();
      const width = Number(meta?.width || 0);
      const height = Number(meta?.height || 0);
      const canReuseOriginal = (
        width > 0
        && height > 0
        && width <= 1800
        && height <= 1800
      );

      if (canReuseOriginal) {
        const fileName = `${fileId}.webp`;
        const absPath = path.join(absDir, fileName);
        fs.writeFileSync(absPath, sourceBuffer);
        const relUrlPath = `/${path.join(relDir, fileName).replace(/\\/g, "/")}`;

        return sanitizeAttachment({
          kind: "image",
          name: String(file.originalname || "image"),
          mime: "image/webp",
          url: relUrlPath,
          width,
          height,
          size: Number(sourceBuffer.length || 0),
        });
      }
    } catch {}
  }

  try {
    const pipeline = sharp(sourceBuffer, { failOnError: false }).rotate().resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    }).webp({ quality: 82 });

    const meta = await pipeline.metadata();
    const fileName = `${fileId}.webp`;
    const absPath = path.join(absDir, fileName);
    await pipeline.toFile(absPath);
    const stat = fs.statSync(absPath);
    const relUrlPath = `/${path.join(relDir, fileName).replace(/\\/g, "/")}`;

    return sanitizeAttachment({
      kind: "image",
      name: String(file.originalname || "image"),
      mime: "image/webp",
      url: relUrlPath,
      width: Number(meta?.width || 0),
      height: Number(meta?.height || 0),
      size: Number(stat?.size || 0),
    });
  } catch {
    const ext = extByMime(sourceMime);
    const fileName = `${fileId}.${ext}`;
    const absPath = path.join(absDir, fileName);
    fs.writeFileSync(absPath, sourceBuffer);
    const stat = fs.statSync(absPath);
    const relUrlPath = `/${path.join(relDir, fileName).replace(/\\/g, "/")}`;
    return sanitizeAttachment({
      kind: "image",
      name: String(file.originalname || "image"),
      mime: sourceMime || "image/jpeg",
      url: relUrlPath,
      size: Number(stat?.size || 0),
    });
  }
}

async function readThreadMeta(tenantId, clientId, conn = db) {
  const [rows] = await queryWithTransientRetry(
    conn,
    `SELECT tenant_id, client_id, updated_at, meta_name, meta_phone, meta_last_welcome_day
       FROM chat_threads
      WHERE tenant_id = ? AND client_id = ?
      LIMIT 1`,
    [tenantId, clientId],
    conn === db ? 1 : 0
  );
  return rows[0] || null;
}

async function readThreadMessages(tenantId, clientId, conn = db) {
  await ensureHiddenMessagesTable();
  const [rows] = await conn.query(
    `SELECT message_id, direction, text, created_at, edited_at, is_read, is_pinned,
            reaction_legacy, reaction_in, reaction_out, reply_to_json, attachment_json,
            delivery_status, delivered_at, read_at
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?
      ORDER BY created_at ASC, id ASC`,
    [tenantId, clientId]
  );
  return rows || [];
}

async function readThreadMessagesPage(
  tenantId,
  clientId,
  { limit = CHAT_THREAD_PAGE_DEFAULT_LIMIT, beforeId = null, actorKey = "" } = {},
  conn = db
) {
  await ensureHiddenMessagesTable();
  const safeLimit = parsePositiveInt(
    limit,
    CHAT_THREAD_PAGE_DEFAULT_LIMIT,
    1,
    CHAT_THREAD_PAGE_MAX_LIMIT
  );
  const safeBeforeId = Number.isFinite(Number(beforeId)) && Number(beforeId) > 0
    ? Math.trunc(Number(beforeId))
    : 0;
  const safeActor = actorKey === "in" ? "in" : "out";

  const whereBefore = safeBeforeId > 0 ? " AND id < ?" : "";
  const whereHidden = ` AND NOT EXISTS (
    SELECT 1
      FROM chat_message_hidden h
     WHERE h.tenant_id = chat_messages.tenant_id
       AND h.client_id = chat_messages.client_id
       AND h.message_id = chat_messages.message_id
       AND h.actor = ?
  )`;
  const params = safeBeforeId > 0
    ? [tenantId, clientId, safeActor, safeBeforeId, safeLimit + 1]
    : [tenantId, clientId, safeActor, safeLimit + 1];

  const [rawRows] = await conn.query(
    `SELECT id AS row_id, message_id, direction, text, created_at, edited_at, is_read, is_pinned,
            reaction_legacy, reaction_in, reaction_out, reply_to_json, attachment_json,
            delivery_status, delivered_at, read_at
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?${whereHidden}${whereBefore}
      ORDER BY id DESC
      LIMIT ?`,
    params
  );

  const rows = Array.isArray(rawRows) ? rawRows : [];
  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextBeforeId = pageRows.length
    ? Math.trunc(Number(pageRows[pageRows.length - 1]?.row_id || 0))
    : 0;

  return {
    messages: sanitizeThread(pageRows.slice().reverse().map(mapDbMessageRowToApi)),
    hasMore,
    nextBeforeId: nextBeforeId > 0 ? nextBeforeId : null,
    limit: safeLimit,
    beforeId: safeBeforeId > 0 ? safeBeforeId : null,
  };
}

async function readThreadMessagesSince(tenantId, clientId, sinceDate, actorKey = "", conn = db) {
  await ensureHiddenMessagesTable();
  const since = sinceDate instanceof Date && !Number.isNaN(sinceDate.getTime())
    ? new Date(Math.max(0, sinceDate.getTime() - 1500))
    : null;
  if (!since) return [];
  const safeActor = actorKey === "in" ? "in" : "out";

  const [rows] = await conn.query(
    `SELECT message_id, direction, text, created_at, edited_at, is_read, is_pinned,
            reaction_legacy, reaction_in, reaction_out, reply_to_json, attachment_json,
            delivery_status, delivered_at, read_at
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ? AND updated_row_at > ?
        AND NOT EXISTS (
          SELECT 1
            FROM chat_message_hidden h
           WHERE h.tenant_id = chat_messages.tenant_id
             AND h.client_id = chat_messages.client_id
             AND h.message_id = chat_messages.message_id
             AND h.actor = ?
        )
      ORDER BY created_at ASC, id ASC`,
    [tenantId, clientId, since, safeActor]
  );
  return rows || [];
}

async function readThreadMessageCount(tenantId, clientId, actorKey = "", conn = db) {
  await ensureHiddenMessagesTable();
  const safeActor = actorKey === "in" ? "in" : "out";
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?
        AND NOT EXISTS (
          SELECT 1
            FROM chat_message_hidden h
           WHERE h.tenant_id = chat_messages.tenant_id
             AND h.client_id = chat_messages.client_id
             AND h.message_id = chat_messages.message_id
             AND h.actor = ?
        )`,
    [tenantId, clientId, safeActor]
  );
  return Number(rows?.[0]?.total || 0);
}

async function readMessageReactionRows(tenantId, clientId, conn = db) {
  const [rows] = await conn.query(
    `SELECT message_id, direction, reaction_legacy, reaction_in, reaction_out
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?`,
    [tenantId, clientId]
  );
  return rows || [];
}

async function upsertThreadMeta(conn, tenantId, clientId, meta, updatedAt) {
  const safeMeta = sanitizeMeta(meta);
  await conn.query(
    `INSERT INTO chat_threads
      (tenant_id, client_id, updated_at, meta_name, meta_phone, meta_last_welcome_day)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      updated_at = VALUES(updated_at),
      meta_name = VALUES(meta_name),
      meta_phone = VALUES(meta_phone),
      meta_last_welcome_day = VALUES(meta_last_welcome_day)`,
    [
      tenantId,
      clientId,
      updatedAt,
      String(safeMeta.name || ""),
      String(safeMeta.phone || ""),
      String(safeMeta.last_welcome_day || ""),
    ]
  );
}

async function touchThreadUpdatedAt(conn, tenantId, clientId, updatedAt) {
  await conn.query(
    `UPDATE chat_threads
        SET updated_at = ?
      WHERE tenant_id = ? AND client_id = ?`,
    [updatedAt, tenantId, clientId]
  );
}

async function ensureThreadRow(conn, tenantId, clientId, options = {}) {
  const currentMeta = await readThreadMeta(tenantId, clientId, conn);
  const metaPatch = sanitizeMeta(options.meta || {});
  const nextMeta = {
    ...sanitizeMetaFromDbRow(currentMeta),
    ...metaPatch,
  };
  const updatedAt = options.updatedAt || new Date();
  await upsertThreadMeta(conn, tenantId, clientId, nextMeta, updatedAt);
  return { meta: nextMeta, updatedAt };
}

function mapApiMessageToDbRow(tenantId, clientId, msg) {
  const message = sanitizeMessage(msg);
  if (!message) return null;
  const reactions = sanitizeReactions(message.reactions);
  const safeReply = sanitizeReply(message.replyTo);
  const safeAttachment = sanitizeAttachment(message.attachment);

  return {
    messageId: String(message.id || "").slice(0, 120),
    direction: String(message.direction || "").toLowerCase() === "out" ? "out" : "in",
    text: String(message.text || "").slice(0, 5000),
    createdAt: toDbDateOrNull(message.createdAt, true),
    editedAt: toDbDateOrNull(message.editedAt, false),
    isRead: message.read === true ? 1 : 0,
    isPinned: message.pinned === true ? 1 : 0,
    reactionLegacy: String(message.reaction || "").slice(0, 20),
    reactionIn: String(reactions.in || "").slice(0, 20),
    reactionOut: String(reactions.out || "").slice(0, 20),
    replyToJson: safeReply ? JSON.stringify(safeReply) : null,
    attachmentJson: safeAttachment ? JSON.stringify(safeAttachment) : null,
    deliveryStatus: String(message.deliveryStatus || "").toLowerCase().slice(0, 16),
    deliveredAt: toDbDateOrNull(message.deliveredAt, false),
    readAt: toDbDateOrNull(message.readAt, false),
    tenantId,
    clientId,
  };
}

async function upsertSingleThreadMessage(conn, tenantId, clientId, msg) {
  const row = mapApiMessageToDbRow(tenantId, clientId, msg);
  if (!row) throw new Error("MESSAGE_INVALID");

  await conn.query(
    `INSERT INTO chat_messages (
      tenant_id, client_id, message_id, direction, text, created_at, edited_at,
      is_read, is_pinned, reaction_legacy, reaction_in, reaction_out,
      reply_to_json, attachment_json, delivery_status, delivered_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      direction = VALUES(direction),
      text = VALUES(text),
      created_at = VALUES(created_at),
      edited_at = VALUES(edited_at),
      is_read = VALUES(is_read),
      is_pinned = VALUES(is_pinned),
      reaction_legacy = VALUES(reaction_legacy),
      reaction_in = VALUES(reaction_in),
      reaction_out = VALUES(reaction_out),
      reply_to_json = VALUES(reply_to_json),
      attachment_json = VALUES(attachment_json),
      delivery_status = VALUES(delivery_status),
      delivered_at = VALUES(delivered_at),
      read_at = VALUES(read_at)`,
    [
      row.tenantId,
      row.clientId,
      row.messageId,
      row.direction,
      row.text,
      row.createdAt,
      row.editedAt,
      row.isRead,
      row.isPinned,
      row.reactionLegacy,
      row.reactionIn,
      row.reactionOut,
      row.replyToJson,
      row.attachmentJson,
      row.deliveryStatus,
      row.deliveredAt,
      row.readAt,
    ]
  );

  return row;
}

async function setMessageHiddenForActor(conn, tenantId, clientId, messageId, actorKey, hidden) {
  await ensureHiddenMessagesTable();
  const actor = actorKey === "in" ? "in" : "out";
  if (hidden === true) {
    await conn.query(
      `INSERT INTO chat_message_hidden (tenant_id, client_id, message_id, actor)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE actor = VALUES(actor)`,
      [tenantId, clientId, String(messageId || ""), actor]
    );
    return;
  }
  await conn.query(
    `DELETE FROM chat_message_hidden
      WHERE tenant_id = ? AND client_id = ? AND message_id = ? AND actor = ?`,
    [tenantId, clientId, String(messageId || ""), actor]
  );
}

async function readSingleMessageRow(tenantId, clientId, messageId, conn = db) {
  const [rows] = await conn.query(
    `SELECT message_id, direction, text, created_at, edited_at, is_read, is_pinned,
            reaction_legacy, reaction_in, reaction_out, reply_to_json, attachment_json,
            delivery_status, delivered_at, read_at
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ? AND message_id = ?
      LIMIT 1`,
    [tenantId, clientId, messageId]
  );
  return rows[0] || null;
}

function applyMessagePatch(existingMessage, patchInput, actorKey = "out") {
  const base = sanitizeMessage(existingMessage);
  if (!base) return null;
  const patch = patchInput && typeof patchInput === "object" ? patchInput : {};
  const next = { ...base };

  if (Object.prototype.hasOwnProperty.call(patch, "text")) {
    next.text = String(patch.text || "").slice(0, 5000);
    next.editedAt = toIsoOrNow(patch.editedAt || new Date().toISOString());
  } else if (patch.editedAt) {
    next.editedAt = toIsoOrNow(patch.editedAt);
  }

  if (Object.prototype.hasOwnProperty.call(patch, "read")) {
    next.read = patch.read === true;
    if (next.read) {
      next.deliveryStatus = "read";
      next.readAt = toIsoOrNow(patch.readAt || next.readAt || new Date().toISOString());
      next.deliveredAt = toIsoOrNow(patch.deliveredAt || next.deliveredAt || next.readAt);
    } else {
      next.readAt = "";
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "pinned")) {
    next.pinned = patch.pinned === true;
  }

  const deliveryPatch = String(patch.deliveryStatus || "").toLowerCase();
  if (deliveryPatch === "sent" || deliveryPatch === "delivered" || deliveryPatch === "read") {
    next.deliveryStatus = deliveryPatch;
    if (deliveryPatch === "delivered") {
      next.deliveredAt = toIsoOrNow(patch.deliveredAt || next.deliveredAt || new Date().toISOString());
    }
    if (deliveryPatch === "read") {
      next.read = true;
      next.readAt = toIsoOrNow(patch.readAt || next.readAt || new Date().toISOString());
      next.deliveredAt = toIsoOrNow(patch.deliveredAt || next.deliveredAt || next.readAt);
    }
  }

  const existingReactions = sanitizeReactions(next.reactions);
  const peerKey = actorKey === "in" ? "out" : "in";
  if (patch.reactions && typeof patch.reactions === "object") {
    const raw = sanitizeReactions(patch.reactions);
    existingReactions[actorKey] = String(raw[actorKey] || "").slice(0, 20);
  } else if (Object.prototype.hasOwnProperty.call(patch, "reaction")) {
    existingReactions[actorKey] = String(patch.reaction || "").slice(0, 20);
  }
  existingReactions[peerKey] = String(existingReactions[peerKey] || "").slice(0, 20);
  next.reactions = existingReactions;
  next.reaction = String(existingReactions[next.direction] || "");

  if (Object.prototype.hasOwnProperty.call(patch, "replyTo")) {
    next.replyTo = sanitizeReply(patch.replyTo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "attachment")) {
    next.attachment = sanitizeAttachment(patch.attachment);
  }

  return sanitizeMessage(next);
}

async function replaceThreadMessages(conn, tenantId, clientId, messages) {
  await conn.query(
    `DELETE FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?`,
    [tenantId, clientId]
  );

  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return;

  const insertSqlHead = `
    INSERT INTO chat_messages (
      tenant_id, client_id, message_id, direction, text, created_at, edited_at,
      is_read, is_pinned, reaction_legacy, reaction_in, reaction_out,
      reply_to_json, attachment_json, delivery_status, delivered_at, read_at
    ) VALUES
  `;
  const rowPlaceholder = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  const MAX_BATCH_ROWS = 120;
  const MAX_BATCH_BYTES = 2 * 1024 * 1024;

  const estimateValueBytes = (value) => {
    if (value === null || typeof value === "undefined") return 4;
    if (value instanceof Date) return 28;
    if (typeof value === "number") return 16;
    if (typeof value === "boolean") return 5;
    return Buffer.byteLength(String(value), "utf8") + 4;
  };

  const estimateRowBytes = (rowValues) => rowValues.reduce((sum, val) => sum + estimateValueBytes(val), 0) + 64;

  const flushBatch = async (batchRows) => {
    if (!batchRows.length) return;
    const placeholders = batchRows.map(() => rowPlaceholder).join(", ");
    const params = [];
    batchRows.forEach((row) => params.push(...row));
    await conn.query(`${insertSqlHead} ${placeholders}`, params);
  };

  let batch = [];
  let batchBytes = 0;

  for (const msg of list) {
    const reactions = sanitizeReactions(msg.reactions);
    const safeReply = sanitizeReply(msg.replyTo);
    const safeAttachment = sanitizeAttachment(msg.attachment);

    const row = [
      tenantId,
      clientId,
      String(msg.id || "").slice(0, 120),
      String(msg.direction || "").toLowerCase() === "out" ? "out" : "in",
      String(msg.text || "").slice(0, 5000),
      toDbDateOrNull(msg.createdAt, true),
      toDbDateOrNull(msg.editedAt, false),
      msg.read === true ? 1 : 0,
      msg.pinned === true ? 1 : 0,
      String(msg.reaction || "").slice(0, 20),
      String(reactions.in || "").slice(0, 20),
      String(reactions.out || "").slice(0, 20),
      safeReply ? JSON.stringify(safeReply) : null,
      safeAttachment ? JSON.stringify(safeAttachment) : null,
      String(msg.deliveryStatus || "").toLowerCase().slice(0, 16),
      toDbDateOrNull(msg.deliveredAt, false),
      toDbDateOrNull(msg.readAt, false),
    ];

    const rowBytes = estimateRowBytes(row);
    const needFlush = batch.length > 0 && (
      batch.length >= MAX_BATCH_ROWS
      || (batchBytes + rowBytes) > MAX_BATCH_BYTES
    );

    if (needFlush) {
      // eslint-disable-next-line no-await-in-loop
      await flushBatch(batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(row);
    batchBytes += rowBytes;
  }

  if (batch.length) {
    await flushBatch(batch);
  }
}

function pickLastWelcomeDay(a, b) {
  const da = /^\d{4}-\d{2}-\d{2}$/.test(String(a || "")) ? String(a) : "";
  const dbv = /^\d{4}-\d{2}-\d{2}$/.test(String(b || "")) ? String(b) : "";
  if (!da) return dbv;
  if (!dbv) return da;
  return da >= dbv ? da : dbv;
}

function mergeThreadMetaValues(targetMeta, sourceMeta) {
  const target = sanitizeMeta(targetMeta || {});
  const source = sanitizeMeta(sourceMeta || {});
  return sanitizeMeta({
    name: String(target.name || source.name || ""),
    phone: String(target.phone || source.phone || ""),
    last_welcome_day: pickLastWelcomeDay(target.last_welcome_day, source.last_welcome_day),
  });
}

function mergeThreadMessageLists(targetMessages, sourceMessages) {
  const targetList = sanitizeThread(Array.isArray(targetMessages) ? targetMessages : []);
  const sourceList = sanitizeThread(Array.isArray(sourceMessages) ? sourceMessages : []);
  const byId = new Map();

  targetList.forEach((msg) => {
    const id = String(msg?.id || "").trim();
    if (!id) return;
    byId.set(id, msg);
  });
  sourceList.forEach((msg) => {
    const id = String(msg?.id || "").trim();
    if (!id || byId.has(id)) return;
    byId.set(id, msg);
  });

  return sanitizeThread(Array.from(byId.values()));
}

async function mergeThreadIntoClient(conn, tenantId, fromClientId, toClientId) {
  const fromId = normalizeClientId(fromClientId);
  const toId = normalizeClientId(toClientId);
  if (!fromId || !toId || fromId === toId) {
    return {
      merged: false,
      from_client_id: Number(fromId || 0),
      to_client_id: Number(toId || 0),
      updated_at: "",
      message_count: 0,
      meta: {},
    };
  }

  const [fromMetaRow, toMetaRow, fromMessageRows, toMessageRows] = await Promise.all([
    readThreadMeta(tenantId, fromId, conn),
    readThreadMeta(tenantId, toId, conn),
    readThreadMessages(tenantId, fromId, conn),
    readThreadMessages(tenantId, toId, conn),
  ]);

  const sourceMessages = sanitizeThread((fromMessageRows || []).map(mapDbMessageRowToApi));
  const targetMessages = sanitizeThread((toMessageRows || []).map(mapDbMessageRowToApi));
  const hasSource = !!fromMetaRow || sourceMessages.length > 0;

  if (!hasSource) {
    return {
      merged: false,
      from_client_id: Number(fromId),
      to_client_id: Number(toId),
      updated_at: toIsoOrEmpty(toMetaRow?.updated_at),
      message_count: targetMessages.length,
      meta: sanitizeMetaFromDbRow(toMetaRow),
    };
  }

  const mergedMeta = mergeThreadMetaValues(
    sanitizeMetaFromDbRow(toMetaRow),
    sanitizeMetaFromDbRow(fromMetaRow)
  );
  const mergedMessages = mergeThreadMessageLists(targetMessages, sourceMessages);
  const updatedAt = new Date();

  await upsertThreadMeta(conn, tenantId, toId, mergedMeta, updatedAt);
  await replaceThreadMessages(conn, tenantId, toId, mergedMessages);
  await conn.query(
    `DELETE FROM chat_threads
      WHERE tenant_id = ? AND client_id = ?`,
    [tenantId, fromId]
  );

  return {
    merged: true,
    from_client_id: Number(fromId),
    to_client_id: Number(toId),
    updated_at: updatedAt.toISOString(),
    message_count: mergedMessages.length,
    meta: sanitizeMeta(mergedMeta),
  };
}

async function querySummaryRows(
  tenantId,
  selectedClientIds = [],
  { limit = null, offset = null } = {}
) {
  await ensureChatCoreIndexes().catch(() => {});
  await ensureChatThreadTypingColumns().catch(() => {});
  await cleanupExpiredThreadTypingFlagsForTenant(tenantId).catch(() => {});
  const ids = (Array.isArray(selectedClientIds) ? selectedClientIds : [])
    .map((id) => normalizeClientId(id))
    .filter(Boolean);
  const idsClause = ids.length ? ` AND t.client_id IN (${ids.map(() => "?").join(",")})` : "";
  const messageIdsClause = ids.length ? ` AND client_id IN (${ids.map(() => "?").join(",")})` : "";
  const hasPagination = !ids.length
    && Number.isFinite(Number(limit))
    && Number.isFinite(Number(offset));
  const paginationClause = hasPagination ? " LIMIT ? OFFSET ?" : "";

  const params = [tenantId];
  if (ids.length) params.push(...ids);
  params.push(tenantId);
  if (ids.length) params.push(...ids);
  if (hasPagination) {
    params.push(
      parsePositiveInt(limit, CHAT_SUMMARIES_PAGE_DEFAULT_LIMIT, 1, CHAT_SUMMARIES_PAGE_MAX_LIMIT),
      Math.max(0, Math.trunc(Number(offset) || 0))
    );
  }

  const [rows] = await db.query(
    `
      SELECT
        t.client_id,
        t.updated_at,
        COALESCE(NULLIF(TRIM(t.meta_name), ''), NULLIF(TRIM(c.name), '')) AS meta_name,
        COALESCE(NULLIF(TRIM(t.meta_phone), ''), NULLIF(TRIM(c.phone), '')) AS meta_phone,
        t.meta_last_welcome_day,
        t.typing_in_active,
        t.typing_in_text,
        t.typing_in_updated_at,
        t.typing_in_expires_at,
        t.typing_out_active,
        t.typing_out_text,
        t.typing_out_updated_at,
        t.typing_out_expires_at,
        COALESCE(s.last_message_id, 0) AS last_message_id,
        COALESCE(s.message_count, 0) AS message_count,
        COALESCE(s.unread_count, 0) AS unread_count,
        m.message_id AS last_message_message_id,
        m.created_at AS last_message_at,
        m.text AS last_message_text,
        m.attachment_json AS last_attachment_json
      FROM chat_threads t
      LEFT JOIN cust_customers c
        ON c.tenant_id = t.tenant_id
       AND c.id = t.client_id
      LEFT JOIN (
        SELECT
          tenant_id,
          client_id,
          MAX(id) AS last_message_id,
          COUNT(*) AS message_count,
          SUM(
            CASE
              WHEN direction = 'in'
                AND is_read = 0
                AND message_id NOT LIKE 'assistant-auto-%'
                AND message_id NOT LIKE 'daily-welcome-%'
              THEN 1
              ELSE 0
            END
          ) AS unread_count
        FROM chat_messages
        WHERE tenant_id = ?${messageIdsClause}
        GROUP BY tenant_id, client_id
      ) s
        ON s.tenant_id = t.tenant_id AND s.client_id = t.client_id
      LEFT JOIN chat_messages m
        ON m.tenant_id = t.tenant_id
       AND m.client_id = t.client_id
       AND m.id = s.last_message_id
      WHERE t.tenant_id = ?${idsClause}
      ORDER BY t.updated_at DESC, t.client_id DESC
      ${paginationClause}
    `,
    params
  );
  return rows || [];
}

async function querySummaryRowsForPage(tenantId, { limit, offset } = {}) {
  await ensureChatCoreIndexes().catch(() => {});
  await ensureChatThreadTypingColumns().catch(() => {});
  await cleanupExpiredThreadTypingFlagsForTenant(tenantId).catch(() => {});
  const safeLimit = parsePositiveInt(
    limit,
    CHAT_SUMMARIES_PAGE_DEFAULT_LIMIT,
    1,
    CHAT_SUMMARIES_PAGE_MAX_LIMIT
  );
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));

  const [threadRows] = await db.query(
    `
      SELECT
        chat_threads.client_id,
        chat_threads.updated_at,
        COALESCE(NULLIF(TRIM(chat_threads.meta_name), ''), NULLIF(TRIM(cust.name), '')) AS meta_name,
        COALESCE(NULLIF(TRIM(chat_threads.meta_phone), ''), NULLIF(TRIM(cust.phone), '')) AS meta_phone,
        chat_threads.meta_last_welcome_day,
        chat_threads.typing_in_active,
        chat_threads.typing_in_text,
        chat_threads.typing_in_updated_at,
        chat_threads.typing_in_expires_at,
        chat_threads.typing_out_active,
        chat_threads.typing_out_text,
        chat_threads.typing_out_updated_at,
        chat_threads.typing_out_expires_at
      FROM chat_threads
      LEFT JOIN cust_customers cust
        ON cust.tenant_id = chat_threads.tenant_id
       AND cust.id = chat_threads.client_id
      WHERE chat_threads.tenant_id = ?
      ORDER BY chat_threads.updated_at DESC, chat_threads.client_id DESC
      LIMIT ? OFFSET ?
    `,
    [tenantId, safeLimit, safeOffset]
  );

  const rows = Array.isArray(threadRows) ? threadRows : [];
  const clientIds = rows
    .map((row) => normalizeClientId(row?.client_id))
    .filter(Boolean);
  if (!clientIds.length) return [];

  const clientPlaceholders = clientIds.map(() => "?").join(",");
  const [aggregateRows] = await db.query(
    `
      SELECT
        client_id,
        MAX(id) AS last_message_id,
        COUNT(*) AS message_count,
        SUM(
          CASE
            WHEN direction = 'in'
              AND is_read = 0
              AND message_id NOT LIKE 'assistant-auto-%'
              AND message_id NOT LIKE 'daily-welcome-%'
            THEN 1
            ELSE 0
          END
        ) AS unread_count
      FROM chat_messages
      WHERE tenant_id = ? AND client_id IN (${clientPlaceholders})
      GROUP BY client_id
    `,
    [tenantId, ...clientIds]
  );

  const aggregateByClient = new Map();
  const lastMessageIds = [];
  (Array.isArray(aggregateRows) ? aggregateRows : []).forEach((row) => {
    const clientIdKey = normalizeClientId(row?.client_id);
    if (!clientIdKey) return;
    const messageCount = Number(row?.message_count || 0);
    const unreadCount = Number(row?.unread_count || 0);
    const lastMessageId = Number(row?.last_message_id || 0);
    aggregateByClient.set(clientIdKey, {
      message_count: Number.isFinite(messageCount) && messageCount > 0 ? Math.trunc(messageCount) : 0,
      unread_count: Number.isFinite(unreadCount) && unreadCount > 0 ? Math.trunc(unreadCount) : 0,
      last_message_id: Number.isFinite(lastMessageId) && lastMessageId > 0 ? Math.trunc(lastMessageId) : 0,
    });
    if (lastMessageId > 0) lastMessageIds.push(lastMessageId);
  });

  const lastMessageByClient = new Map();
  if (lastMessageIds.length) {
    const messagePlaceholders = lastMessageIds.map(() => "?").join(",");
    const [lastMessageRows] = await db.query(
      `
        SELECT
          id,
          message_id,
          client_id,
          created_at,
          text,
          attachment_json
        FROM chat_messages
        WHERE tenant_id = ? AND id IN (${messagePlaceholders})
      `,
      [tenantId, ...lastMessageIds]
    );
    (Array.isArray(lastMessageRows) ? lastMessageRows : []).forEach((row) => {
      const clientIdKey = normalizeClientId(row?.client_id);
      if (!clientIdKey) return;
      lastMessageByClient.set(clientIdKey, row);
    });
  }

  return rows.map((row) => {
    const clientIdKey = normalizeClientId(row?.client_id);
    const aggregate = clientIdKey ? aggregateByClient.get(clientIdKey) : null;
    const lastMessage = clientIdKey ? lastMessageByClient.get(clientIdKey) : null;
    const lastMessageId = Number(aggregate?.last_message_id || 0);
    return {
      ...row,
      last_message_id: Number.isFinite(lastMessageId) && lastMessageId > 0 ? Math.trunc(lastMessageId) : 0,
      message_count: Number(aggregate?.message_count || 0),
      unread_count: Number(aggregate?.unread_count || 0),
      last_message_message_id: String(lastMessage?.message_id || ""),
      last_message_at: lastMessage?.created_at || null,
      last_message_text: lastMessage?.text || "",
      last_attachment_json: lastMessage?.attachment_json || "",
    };
  });
}

async function listSummaries(tenantId, selectedClientIds = [], actorKey = "out") {
  const ids = (Array.isArray(selectedClientIds) ? selectedClientIds : [])
    .map((id) => normalizeClientId(id))
    .filter(Boolean);
  const rows = await querySummaryRows(tenantId, ids);

  const parsedRows = rows
    .map((row) => mapSummaryRow(row, actorKey))
    .filter((row) => Number.isFinite(Number(row.client_id)) && Number(row.client_id) > 0);

  if (!ids.length) return parsedRows;

  const byId = new Map(parsedRows.map((row) => [String(row.client_id), row]));
  return ids.map((id) => {
    const existing = byId.get(String(id));
    if (existing) return existing;
    return {
      client_id: Number(id),
      updated_at: "",
      message_count: 0,
      unread_count: 0,
      last_message_at: "",
      last_message_text: "",
      typing_active: false,
      typing_text: "",
      typing_updated_at: "",
      typing_expires_at: "",
      typingActive: false,
      typingText: "",
      typingUpdatedAt: "",
      typingExpiresAt: "",
      meta: {},
    };
  });
}

async function listSummariesPage(tenantId, { limit, offset, actorKey = "out" } = {}) {
  const safeLimit = parsePositiveInt(
    limit,
    CHAT_SUMMARIES_PAGE_DEFAULT_LIMIT,
    1,
    CHAT_SUMMARIES_PAGE_MAX_LIMIT
  );
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));

  const [rows, countRows] = await Promise.all([
    querySummaryRowsForPage(tenantId, { limit: safeLimit, offset: safeOffset }),
    db.query(
      `SELECT COUNT(*) AS total
         FROM chat_threads
        WHERE tenant_id = ?`,
      [tenantId]
    ),
  ]);

  const total = Number(countRows?.[0]?.[0]?.total || countRows?.[0]?.total || 0);
  const mappedRows = (Array.isArray(rows) ? rows : [])
    .map((row) => mapSummaryRow(row, actorKey))
    .filter((row) => Number.isFinite(Number(row.client_id)) && Number(row.client_id) > 0);

  return {
    rows: mappedRows,
    total,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + mappedRows.length < total,
  };
}

async function readTenantUpdatedAt(tenantId) {
  const [rows] = await db.query(
    `SELECT MAX(updated_at) AS updated_at
       FROM chat_threads
      WHERE tenant_id = ?`,
    [tenantId]
  );
  return toIsoOrEmpty(rows?.[0]?.updated_at);
}

function makeChatTempRouter() {
  const router = express.Router();

  router.use(async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const chatEnabled = await isTenantChatWidgetEnabled(tenantId);
      if (!chatEnabled) {
        return res.status(403).json({ ok: false, error: "CHAT_DISABLED" });
      }
      scheduleExpiredGuestThreadsCleanup(tenantId);
      return next();
    } catch (err) {
      console.error("chat-temp feature gate error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.post("/thread/merge", async (req, res) => {
    const tenantId = getTenantId(req);
    const fromClientId = normalizeClientId(req.body?.from_client_id || req.body?.fromClientId);
    const toClientId = normalizeClientId(req.body?.to_client_id || req.body?.toClientId);

    if (!fromClientId) return res.status(400).json({ ok: false, error: "FROM_CLIENT_ID_REQUIRED" });
    if (!toClientId) return res.status(400).json({ ok: false, error: "TO_CLIENT_ID_REQUIRED" });
    if (fromClientId === toClientId) {
      return res.json({
        ok: true,
        data: {
          merged: false,
          from_client_id: Number(fromClientId),
          to_client_id: Number(toClientId),
          updated_at: "",
          message_count: 0,
          meta: {},
        },
      });
    }

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const merged = await mergeThreadIntoClient(conn, tenantId, fromClientId, toClientId);
      await conn.commit();
      conn.release();
      conn = null;
      clearThreadTypingState(tenantId, toClientId);
      clearThreadTypingState(tenantId, fromClientId);
      notifyThreadChange(tenantId, toClientId, merged?.updated_at || "");
      notifyThreadChange(tenantId, fromClientId, merged?.updated_at || "");
      scheduleTenantUnreadRefresh(tenantId);
      return res.json({ ok: true, data: merged });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp POST /thread/merge error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.post("/attachment", attachmentUpload.single("file"), async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.body?.client_id || req.query?.client_id || 0) || "0";
      if (!req.file) return res.status(400).json({ ok: false, error: "FILE_REQUIRED" });
      const attachment = await storeChatAttachmentImage({
        file: req.file,
        tenantId,
        clientId,
      });
      if (!attachment) return res.status(400).json({ ok: false, error: "ATTACHMENT_INVALID" });
      return res.json({ ok: true, data: { attachment } });
    } catch (err) {
      console.error("chat-temp POST /attachment error:", err);
      const msg = String(err?.message || "");
      if (msg === "UNSUPPORTED_FILE_TYPE") return res.status(415).json({ ok: false, error: msg });
      if (msg === "FILE_REQUIRED") return res.status(400).json({ ok: false, error: msg });
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.post("/thread/:clientId/typing", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const actorKey = getRequestReactionActor(req);
      const actor = actorKey === "in" ? "in" : "out";
      const requestedActive = req.body?.typing === true || req.body?.active === true;
      const requestedText = sanitizeTypingText(
        req.body?.text
        || req.body?.phrase
        || req.body?.label
        || ""
      );

      const previousEntry = getThreadTypingEntry(tenantId, clientId);
      const previousActorState = previousEntry && previousEntry[actor]
        ? { ...previousEntry[actor] }
        : { active: false, text: "", expiresAtMs: 0 };
      const previousActiveNow = previousActorState.active === true
        && Number(previousActorState.expiresAtMs || 0) > Date.now();
      const previousText = sanitizeTypingText(previousActorState.text || "");

      const selfTyping = setThreadTypingForActor(
        tenantId,
        clientId,
        actorKey,
        requestedActive,
        requestedText
      );
      const nowMs = Date.now();
      const coalesceKey = getThreadTypingCoalesceKey(tenantId, clientId, actor);
      const coalesceState = threadTypingCoalesceState.get(coalesceKey) || {
        lastPersistAt: 0,
        lastNotifyAt: 0,
      };
      const nextActive = selfTyping?.active === true;
      const nextText = sanitizeTypingText(selfTyping?.text || "");
      const isHeartbeat = nextActive && previousActiveNow && previousText === nextText;

      let shouldPersist = true;
      let shouldNotify = true;
      if (isHeartbeat) {
        shouldPersist = (nowMs - Number(coalesceState.lastPersistAt || 0)) >= CHAT_TYPING_HEARTBEAT_COALESCE_MS;
        shouldNotify = (nowMs - Number(coalesceState.lastNotifyAt || 0)) >= CHAT_TYPING_HEARTBEAT_COALESCE_MS;
      }

      if (shouldPersist) {
        await persistThreadTypingState(tenantId, clientId, actorKey, selfTyping);
        coalesceState.lastPersistAt = nowMs;
      }

      const peerTyping = getPeerTypingForActor(tenantId, clientId, actorKey);
      if (shouldNotify) {
        notifyThreadChange(tenantId, clientId, "", {
          messageChanged: false,
          typingChanged: true,
        });
        coalesceState.lastNotifyAt = nowMs;
      }

      if (nextActive) {
        threadTypingCoalesceState.set(coalesceKey, coalesceState);
      } else {
        threadTypingCoalesceState.delete(coalesceKey);
      }

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          self_typing: selfTyping,
          peer_typing: peerTyping,
        },
      });
    } catch (err) {
      console.error("chat-temp POST /thread/:clientId/typing error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/thread/:clientId/stream", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

    const actorKey = getRequestReactionActor(req);

    try {
      const currentMeta = await readThreadMeta(tenantId, clientId);
      const currentUpdatedAt = toIsoOrEmpty(currentMeta?.updated_at);
      const currentTyping = getPeerTypingForActor(tenantId, clientId, actorKey);
      const threadKey = getThreadKey(tenantId, clientId);

      initializeSseResponse(req, res);

      const subscriber = createSseSubscriber(res, "thread", (payload = {}) => ({
        client_id: Number(clientId),
        changed: payload.changed === true,
        message_changed: payload.message_changed === true,
        typing_changed: payload.typing_changed === true,
        updated_at: String(payload.updated_at || ""),
        typing: getPeerTypingForActor(tenantId, clientId, actorKey),
        timeout: false,
      }));

      addSseSubscriber(threadSseSubscribers, threadKey, subscriber);
      startSseHeartbeat(subscriber);

      subscriber.send({
        changed: false,
        message_changed: false,
        typing_changed: Boolean(currentTyping?.updated_at),
        updated_at: currentUpdatedAt,
      });

      const cleanup = () => {
        stopSseHeartbeat(subscriber);
        removeSseSubscriber(threadSseSubscribers, threadKey, subscriber);
      };

      req.on("close", cleanup);
      res.on("close", cleanup);
    } catch (err) {
      console.error("chat-temp GET /thread/:clientId/stream error:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
      try { res.end(); } catch {}
    }
  });

  router.get("/thread/:clientId/wait", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const since = String(req.query.since || "").trim();
      const actorKey = getRequestReactionActor(req);
      const typingSince = String(req.query.typing_since || "").trim();
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);

      const currentMeta = await readThreadMeta(tenantId, clientId);
      const currentUpdatedAt = toIsoOrEmpty(currentMeta?.updated_at);
      const currentTyping = getPeerTypingForActor(tenantId, clientId, actorKey);
      const currentTypingUpdatedAt = String(currentTyping?.updated_at || "");

      const messageChangedNow = (!since && !!currentUpdatedAt)
        || (!!since && String(currentUpdatedAt || "") !== since);
      const typingChangedNow = !!currentTypingUpdatedAt
        && String(currentTypingUpdatedAt || "") !== String(typingSince || "");

      if (messageChangedNow || typingChangedNow) {
        return res.json({
          ok: true,
          data: {
            client_id: Number(clientId),
            changed: true,
            message_changed: messageChangedNow,
            typing_changed: typingChangedNow,
            updated_at: currentUpdatedAt,
            typing: currentTyping,
            timeout: false,
          },
        });
      }

      const waitResult = await waitForThreadChange(tenantId, clientId, timeoutMs);
      const nextMeta = await readThreadMeta(tenantId, clientId);
      const nextUpdatedAt = toIsoOrEmpty(nextMeta?.updated_at);
      const nextTyping = getPeerTypingForActor(tenantId, clientId, actorKey);
      const nextTypingUpdatedAt = String(nextTyping?.updated_at || "");

      const messageChanged = waitResult?.messageChanged === true
        || String(nextUpdatedAt || "") !== String(since || "");
      const typingChanged = waitResult?.typingChanged === true
        || String(nextTypingUpdatedAt || "") !== String(typingSince || "");
      const changed = messageChanged || typingChanged;

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          changed,
          message_changed: messageChanged,
          typing_changed: typingChanged,
          updated_at: nextUpdatedAt,
          typing: nextTyping,
          timeout: waitResult?.timeout === true,
        },
      });
    } catch (err) {
      if (isTransientDbConnectionError(err)) {
        console.warn("chat-temp wait transient DB disconnect:", err?.code || err?.message || err);
        return res.json({
          ok: true,
          data: {
            client_id: Number(normalizeClientId(req.params.clientId) || 0),
            changed: false,
            message_changed: false,
            typing_changed: false,
            updated_at: "",
            typing: null,
            timeout: true,
          },
        });
      }
      console.error("chat-temp GET /thread/:clientId/wait error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/push/public-key", async (req, res) => {
    return res.json({
      ok: true,
      data: {
        enabled: webPushEnabled,
        public_key: webPushEnabled ? WEB_PUSH_VAPID_PUBLIC_KEY : "",
      },
    });
  });

  router.post("/push/subscribe", async (req, res) => {
    try {
      if (!webPushEnabled) {
        return res.status(503).json({ ok: false, error: "PUSH_DISABLED" });
      }
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const clientIdRaw = req.body?.client_id ?? req.body?.clientId ?? req.query?.client_id ?? "";
      const clientId = normalizePushClientId(
        clientIdRaw,
        actorKey
      );
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });
      const subscription = sanitizePushSubscription(req.body?.subscription || req.body || {});
      if (!subscription) return res.status(400).json({ ok: false, error: "SUBSCRIPTION_INVALID" });
      await upsertPushSubscription(
        tenantId,
        clientId,
        actorKey,
        subscription,
        String(req.headers["user-agent"] || "")
      );
      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          actor: actorKey === "in" ? "in" : "out",
          enabled: webPushEnabled,
        },
      });
    } catch (err) {
      console.error("chat-temp POST /push/subscribe error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.post("/push/unsubscribe", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const subscription = sanitizePushSubscription(req.body?.subscription || req.body || {});
      const endpoint = subscription ? subscription.endpoint : String(req.body?.endpoint || "").trim();
      if (!endpoint) return res.status(400).json({ ok: false, error: "ENDPOINT_REQUIRED" });
      await deletePushSubscriptionByEndpoint(tenantId, endpoint, actorKey);
      return res.json({ ok: true, data: { unsubscribed: true } });
    } catch (err) {
      console.error("chat-temp POST /push/unsubscribe error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.post("/thread/:clientId/messages", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });
    const actorKey = getRequestReactionActor(req);

    const message = sanitizeMessage(req.body?.message || req.body || {});
    if (!message || !normalizeMessageId(message.id)) {
      return res.status(400).json({ ok: false, error: "MESSAGE_INVALID" });
    }

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const updatedAt = new Date();

      await ensureThreadRow(conn, tenantId, clientId, {
        meta: sanitizeMeta(req.body?.meta || {}),
        updatedAt,
      });
      await upsertSingleThreadMessage(conn, tenantId, clientId, message);
      await touchThreadUpdatedAt(conn, tenantId, clientId, updatedAt);

      const row = await readSingleMessageRow(tenantId, clientId, message.id, conn);
      await conn.commit();
      conn.release();
      conn = null;
      const stoppedTypingState = setThreadTypingForActor(tenantId, clientId, actorKey, false, "");
      await persistThreadTypingState(tenantId, clientId, actorKey, stoppedTypingState);
      notifyThreadChange(tenantId, clientId, updatedAt.toISOString(), {
        messageChanged: true,
        typingChanged: true,
      });
      scheduleTenantUnreadRefresh(tenantId);
      const responseMessage = row ? mapDbMessageRowToApi(row) : message;
      const senderActorForPush = resolvePushSenderActor(responseMessage, actorKey);
      notifyPushPeerAboutMessage(tenantId, clientId, senderActorForPush, responseMessage).catch((err) => {
        console.error("chat-temp push notify error:", err && err.message ? err.message : err);
      });

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt.toISOString(),
          message: responseMessage,
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp POST /thread/:clientId/messages error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.patch("/thread/:clientId/messages/:messageId", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    const messageId = normalizeMessageId(req.params.messageId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });
    if (!messageId) return res.status(400).json({ ok: false, error: "MESSAGE_ID_REQUIRED" });

    const actorKey = getRequestReactionActor(req);
    const patch = req.body?.patch && typeof req.body.patch === "object"
      ? req.body.patch
      : (req.body && typeof req.body === "object" ? req.body : {});

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      const existingRow = await readSingleMessageRow(tenantId, clientId, messageId, conn);
      if (!existingRow) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(404).json({ ok: false, error: "MESSAGE_NOT_FOUND" });
      }

      const existingMessage = mapDbMessageRowToApi(existingRow);
      const hiddenPatchRequested = Object.prototype.hasOwnProperty.call(patch, "hidden");
      const hiddenPatchValue = patch.hidden === true;
      const nextMessage = applyMessagePatch(existingMessage, patch, actorKey);
      if (!nextMessage && !hiddenPatchRequested) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({ ok: false, error: "PATCH_INVALID" });
      }

      const updatedAt = new Date();
      await ensureThreadRow(conn, tenantId, clientId, {
        meta: sanitizeMeta(req.body?.meta || {}),
        updatedAt,
      });
      if (nextMessage) {
        await upsertSingleThreadMessage(conn, tenantId, clientId, nextMessage);
      }
      if (hiddenPatchRequested) {
        await setMessageHiddenForActor(
          conn,
          tenantId,
          clientId,
          messageId,
          actorKey,
          hiddenPatchValue
        );
      }
      await touchThreadUpdatedAt(conn, tenantId, clientId, updatedAt);

      const row = await readSingleMessageRow(tenantId, clientId, messageId, conn);
      await conn.commit();
      conn.release();
      conn = null;
      notifyThreadChange(tenantId, clientId, updatedAt.toISOString());
      scheduleTenantUnreadRefresh(tenantId);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt.toISOString(),
          message: row ? mapDbMessageRowToApi(row) : (nextMessage || existingMessage),
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp PATCH /thread/:clientId/messages/:messageId error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.post("/thread/:clientId/messages/read", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

    const ids = (Array.isArray(req.body?.message_ids) ? req.body.message_ids : [])
      .map((id) => normalizeMessageId(id))
      .filter(Boolean);
    const hasFilterIds = ids.length > 0;

    const actorKey = getRequestReactionActor(req);
    const unreadDirection = actorKey === "in" ? "out" : "in";

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      const updatedAt = new Date();
      const readAt = new Date();

      let query = `
        UPDATE chat_messages
           SET is_read = 1,
               delivery_status = 'read',
               delivered_at = COALESCE(delivered_at, ?),
               read_at = COALESCE(read_at, ?)
         WHERE tenant_id = ? AND client_id = ? AND direction = ? AND is_read = 0
      `;
      const params = [readAt, readAt, tenantId, clientId, unreadDirection];
      if (hasFilterIds) {
        query += ` AND message_id IN (${ids.map(() => "?").join(",")})`;
        params.push(...ids);
      }
      const [result] = await conn.query(query, params);
      const changed = Number(result?.affectedRows || 0) > 0;

      if (changed) {
        await ensureThreadRow(conn, tenantId, clientId, {
          meta: sanitizeMeta(req.body?.meta || {}),
          updatedAt,
        });
        await touchThreadUpdatedAt(conn, tenantId, clientId, updatedAt);
      }

      await conn.commit();
      conn.release();
      conn = null;
      if (changed) {
        notifyThreadChange(tenantId, clientId, updatedAt.toISOString());
        scheduleTenantUnreadRefresh(tenantId);
      }

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          changed,
          updated_at: changed ? updatedAt.toISOString() : "",
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp POST /thread/:clientId/messages/read error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.delete("/thread/:clientId/messages/:messageId", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    const messageId = normalizeMessageId(req.params.messageId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });
    if (!messageId) return res.status(400).json({ ok: false, error: "MESSAGE_ID_REQUIRED" });

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const updatedAt = new Date();

      const [result] = await conn.query(
        `DELETE FROM chat_messages
          WHERE tenant_id = ? AND client_id = ? AND message_id = ?`,
        [tenantId, clientId, messageId]
      );
      const changed = Number(result?.affectedRows || 0) > 0;
      if (changed) {
        await ensureThreadRow(conn, tenantId, clientId, {
          meta: sanitizeMeta(req.body?.meta || {}),
          updatedAt,
        });
        await touchThreadUpdatedAt(conn, tenantId, clientId, updatedAt);
      }

      await conn.commit();
      conn.release();
      conn = null;
      if (changed) {
        notifyThreadChange(tenantId, clientId, updatedAt.toISOString());
        scheduleTenantUnreadRefresh(tenantId);
      }

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          message_id: messageId,
          deleted: changed,
          updated_at: changed ? updatedAt.toISOString() : "",
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp DELETE /thread/:clientId/messages/:messageId error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/thread/:clientId/meta", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const metaRow = await readThreadMeta(tenantId, clientId);
      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: toIsoOrEmpty(metaRow?.updated_at),
        },
      });
    } catch (err) {
      console.error("chat-temp GET /thread/:clientId/meta error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.patch("/thread/:clientId/meta", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

    const sourceMeta = req.body && typeof req.body === "object"
      ? (req.body.meta && typeof req.body.meta === "object" ? req.body.meta : req.body)
      : {};
    const metaPatch = sanitizeMetaPatch(sourceMeta);
    const patchKeys = Object.keys(metaPatch);

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      const existingMetaRow = await readThreadMeta(tenantId, clientId, conn);
      const existingMeta = sanitizeMetaFromDbRow(existingMetaRow);
      const mergedMeta = sanitizeMeta({
        ...existingMeta,
        ...metaPatch,
      });

      const changed = (
        patchKeys.length > 0
        && (
          String(existingMeta.name || "") !== String(mergedMeta.name || "")
          || String(existingMeta.phone || "") !== String(mergedMeta.phone || "")
          || String(existingMeta.last_welcome_day || "") !== String(mergedMeta.last_welcome_day || "")
        )
      );

      let updatedAtIso = "";
      if (patchKeys.length > 0 && (changed || !existingMetaRow)) {
        const updatedAt = new Date();
        await upsertThreadMeta(conn, tenantId, clientId, mergedMeta, updatedAt);
        updatedAtIso = updatedAt.toISOString();
      }

      await conn.commit();
      conn.release();
      conn = null;

      if (updatedAtIso) notifyThreadChange(tenantId, clientId, updatedAtIso);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          changed: !!updatedAtIso,
          updated_at: updatedAtIso,
          meta: sanitizeMeta(mergedMeta),
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp PATCH /thread/:clientId/meta error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/thread/:clientId/diff", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      const actorKey = getRequestReactionActor(req);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const sinceRaw = String(req.query.since || "").trim();
      if (!sinceRaw) return res.status(400).json({ ok: false, error: "SINCE_REQUIRED" });
      const since = new Date(sinceRaw);
      if (Number.isNaN(since.getTime())) return res.status(400).json({ ok: false, error: "SINCE_INVALID" });

      const [metaRow, changedRows, totalCount] = await Promise.all([
        readThreadMeta(tenantId, clientId),
        readThreadMessagesSince(tenantId, clientId, since, actorKey),
        readThreadMessageCount(tenantId, clientId, actorKey),
      ]);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: toIsoOrEmpty(metaRow?.updated_at),
          message_count: Number(totalCount || 0),
          messages: sanitizeThread(changedRows.map(mapDbMessageRowToApi)),
        },
      });
    } catch (err) {
      console.error("chat-temp GET /thread/:clientId/diff error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/thread/:clientId", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      const actorKey = getRequestReactionActor(req);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const pageLimit = parsePositiveInt(
        req.query.limit,
        CHAT_THREAD_PAGE_DEFAULT_LIMIT,
        1,
        CHAT_THREAD_PAGE_MAX_LIMIT
      );
      const pageBeforeId = Number.isFinite(Number(req.query.before_id)) && Number(req.query.before_id) > 0
        ? Math.trunc(Number(req.query.before_id))
        : null;

      const [metaRow, page] = await Promise.all([
        readThreadMeta(tenantId, clientId),
        readThreadMessagesPage(tenantId, clientId, {
          limit: pageLimit,
          beforeId: pageBeforeId,
          actorKey,
        }),
      ]);

      const updatedAt = toIsoOrEmpty(metaRow?.updated_at);
      const meta = sanitizeMetaFromDbRow(metaRow);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt,
          meta,
          messages: Array.isArray(page?.messages) ? page.messages : [],
          page: {
            limit: Number(page?.limit || pageLimit),
            before_id: page?.beforeId ? Number(page.beforeId) : null,
            next_before_id: page?.nextBeforeId ? Number(page.nextBeforeId) : null,
            has_more: page?.hasMore === true,
          },
        },
      });
    } catch (err) {
      console.error("chat-temp GET /thread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.put("/thread/:clientId", async (req, res) => {
    const tenantId = getTenantId(req);
    const clientId = normalizeClientId(req.params.clientId);
    if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

    const actor = getRequestReactionActor(req);
    const inputMessages = sanitizeThread(req.body?.messages || req.body?.thread || []);
    const metaPatch = sanitizeMeta(req.body?.meta);

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      const [existingMetaRow, existingReactionRows] = await Promise.all([
        readThreadMeta(tenantId, clientId, conn),
        readMessageReactionRows(tenantId, clientId, conn),
      ]);

      const mergedMessages = mergeReactionsByActor(existingReactionRows, inputMessages, actor);
      const mergedMeta = {
        ...sanitizeMetaFromDbRow(existingMetaRow),
        ...metaPatch,
      };
      const updatedAt = new Date();

      await upsertThreadMeta(conn, tenantId, clientId, mergedMeta, updatedAt);
      await replaceThreadMessages(conn, tenantId, clientId, mergedMessages);
      await conn.commit();
      conn.release();
      conn = null;
      notifyThreadChange(tenantId, clientId, updatedAt.toISOString());
      scheduleTenantUnreadRefresh(tenantId);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt.toISOString(),
          meta: sanitizeMeta(mergedMeta),
          messages: mergedMessages,
        },
      });
    } catch (err) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        conn.release();
      }
      console.error("chat-temp PUT /thread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.delete("/thread/:clientId", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const [result] = await db.query(
        `DELETE FROM chat_threads
          WHERE tenant_id = ? AND client_id = ?`,
        [tenantId, clientId]
      );
      const deleted = Number(result?.affectedRows || 0) > 0;
      if (deleted) {
        await deletePushSubscriptionsForThread(tenantId, clientId).catch(() => {});
        clearThreadTypingState(tenantId, clientId);
        notifyThreadChange(tenantId, clientId, new Date().toISOString());
        scheduleTenantUnreadRefresh(tenantId);
      }

      return res.json({ ok: true, data: { client_id: Number(clientId), deleted } });
    } catch (err) {
      console.error("chat-temp DELETE /thread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/unread", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      if (actorKey === "in") {
        const clientId = normalizeClientId(req.query.client_id ?? req.query.clientId ?? "");
        const snapshot = await readClientUnreadSnapshot(tenantId, clientId);
        return res.json({
          ok: true,
          data: {
            unread_total: Number(snapshot.total || 0),
            total: Number(snapshot.total || 0),
            updated_at: String(snapshot.updatedAt || ""),
            revision: Number(snapshot.revision || 0),
          },
        });
      }

      const snapshot = await ensureTenantUnreadLoaded(tenantId);
      const unansweredTotal = await readTenantUnansweredUnreadTotal(tenantId);
      return res.json({
        ok: true,
        data: {
          unread_total: Number(snapshot.total || 0),
          total: Number(snapshot.total || 0),
          unanswered_total: Number(unansweredTotal || 0),
          updated_at: String(snapshot.updatedAt || ""),
          revision: Number(snapshot.revision || 0),
        },
      });
    } catch (err) {
      console.error("chat-temp GET /unread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/unread/stream", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const clientId = actorKey === "in"
        ? normalizeClientId(req.query.client_id ?? req.query.clientId ?? "")
        : "";

      if (actorKey === "in" && !clientId) {
        return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });
      }

      const snapshot = actorKey === "in"
        ? await readClientUnreadSnapshot(tenantId, clientId)
        : await ensureTenantUnreadLoaded(tenantId);
      const unansweredTotal = actorKey === "out"
        ? await readTenantUnansweredUnreadTotal(tenantId)
        : 0;
      const unreadKey = getUnreadStreamKey(tenantId, actorKey, clientId);

      initializeSseResponse(req, res);

      const subscriber = createSseSubscriber(res, "unread", (payload = {}) => ({
        changed: payload.changed === true,
        unread_total: Number(payload.unread_total ?? payload.total ?? 0),
        total: Number(payload.total ?? payload.unread_total ?? 0),
        unanswered_total: payload.unanswered_total != null
          ? Number(payload.unanswered_total)
          : undefined,
        updated_at: String(payload.updated_at || ""),
        revision: Number(payload.revision || 0),
        timeout: false,
      }));

      addSseSubscriber(unreadSseSubscribers, unreadKey, subscriber);
      startSseHeartbeat(subscriber);

      subscriber.send({
        changed: false,
        unread_total: Number(snapshot.total || 0),
        total: Number(snapshot.total || 0),
        unanswered_total: Number(unansweredTotal || 0),
        updated_at: String(snapshot.updatedAt || ""),
        revision: Number(snapshot.revision || 0),
      });

      const cleanup = () => {
        stopSseHeartbeat(subscriber);
        removeSseSubscriber(unreadSseSubscribers, unreadKey, subscriber);
      };

      req.on("close", cleanup);
      res.on("close", cleanup);
    } catch (err) {
      console.error("chat-temp GET /unread/stream error:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
      try { res.end(); } catch {}
    }
  });

  router.get("/unread/wait", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);

      const sinceTotalRaw = Number(req.query.since_total ?? req.query.sinceTotal);
      const hasSinceTotal = Number.isFinite(sinceTotalRaw) && sinceTotalRaw >= 0;
      const sinceTotal = hasSinceTotal ? Math.trunc(sinceTotalRaw) : -1;

      const sinceRevisionRaw = Number(req.query.since_revision ?? req.query.sinceRevision);
      const hasSinceRevision = Number.isFinite(sinceRevisionRaw) && sinceRevisionRaw >= 0;
      const sinceRevision = hasSinceRevision ? Math.trunc(sinceRevisionRaw) : -1;

      if (actorKey === "in") {
        const clientId = normalizeClientId(req.query.client_id ?? req.query.clientId ?? "");
        const currentSnapshot = await readClientUnreadSnapshot(tenantId, clientId);
        const currentTotal = Number(currentSnapshot.total || 0);
        const currentRevision = Number(currentSnapshot.revision || 0);
        const changedNow = hasSinceRevision
          ? (currentRevision > sinceRevision || (hasSinceTotal && currentTotal !== sinceTotal))
          : (hasSinceTotal ? currentTotal !== sinceTotal : currentTotal > 0);
        if (changedNow) {
          return res.json({
            ok: true,
            data: {
              changed: true,
              unread_total: currentTotal,
              total: currentTotal,
              updated_at: String(currentSnapshot.updatedAt || ""),
              revision: currentRevision,
              timeout: false,
            },
          });
        }

        const waitResult = clientId
          ? await waitForThreadChange(tenantId, clientId, timeoutMs)
          : { timeout: true };
        const nextSnapshot = await readClientUnreadSnapshot(tenantId, clientId);
        const nextTotal = Number(nextSnapshot.total || 0);
        const nextRevision = Number(nextSnapshot.revision || 0);
        const changed = hasSinceRevision
          ? (nextRevision > sinceRevision || (hasSinceTotal && nextTotal !== sinceTotal))
          : (hasSinceTotal ? nextTotal !== sinceTotal : nextTotal > 0);

        return res.json({
          ok: true,
          data: {
            changed,
            unread_total: nextTotal,
            total: nextTotal,
            updated_at: String(nextSnapshot.updatedAt || ""),
            revision: nextRevision,
            timeout: waitResult?.timeout === true,
          },
        });
      }

      const currentSnapshot = await ensureTenantUnreadLoaded(tenantId);
      const currentTotal = Number(currentSnapshot.total || 0);
      const currentRevision = Number(currentSnapshot.revision || 0);
      const currentUnansweredTotal = await readTenantUnansweredUnreadTotal(tenantId);

      const changedNow = hasSinceRevision
        ? currentRevision > sinceRevision
        : (hasSinceTotal ? currentTotal !== sinceTotal : currentTotal > 0);
      if (changedNow) {
        return res.json({
          ok: true,
          data: {
            changed: true,
            unread_total: currentTotal,
            total: currentTotal,
            unanswered_total: currentUnansweredTotal,
            updated_at: String(currentSnapshot.updatedAt || ""),
            revision: currentRevision,
            timeout: false,
          },
        });
      }

      const waitResult = await waitForTenantUnreadChange(tenantId, timeoutMs);
      const nextEntry = getTenantUnreadEntry(tenantId, true) || {};
      const nextTotal = Number.isFinite(Number(waitResult?.total))
        ? Math.max(0, Math.trunc(Number(waitResult.total)))
        : Math.max(0, Math.trunc(Number(nextEntry.total || 0)));
      const nextRevision = Number.isFinite(Number(waitResult?.revision))
        ? Math.max(0, Math.trunc(Number(waitResult.revision)))
        : Math.max(0, Math.trunc(Number(nextEntry.revision || 0)));
      const nextUpdatedAt = String(waitResult?.updatedAt || nextEntry.updatedAt || "");
      const nextUnansweredTotal = await readTenantUnansweredUnreadTotal(tenantId);

      const changed = hasSinceRevision
        ? nextRevision > sinceRevision
        : (hasSinceTotal ? nextTotal !== sinceTotal : nextTotal > 0);

      return res.json({
        ok: true,
        data: {
          changed,
          unread_total: nextTotal,
          total: nextTotal,
          unanswered_total: nextUnansweredTotal,
          updated_at: nextUpdatedAt,
          revision: nextRevision,
          timeout: waitResult?.timeout === true,
        },
      });
    } catch (err) {
      console.error("chat-temp GET /unread/wait error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/summaries/stream", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const currentState = await ensureTenantChangeEntryLoaded(tenantId);
      const tenantKey = getTenantKey(tenantId);

      initializeSseResponse(req, res);

      const subscriber = createSseSubscriber(res, "summaries", (payload = {}) => ({
        changed: payload.changed === true,
        message_changed: payload.message_changed === true,
        typing_changed: payload.typing_changed === true,
        client_id: Number(payload.client_id || 0),
        updated_at: String(payload.updated_at || ""),
        revision: Number(payload.revision || 0),
        typing: Number(payload.client_id || 0) > 0
          ? getPeerTypingForActor(tenantId, Number(payload.client_id || 0), actorKey)
          : null,
        timeout: false,
      }));

      addSseSubscriber(tenantSseSubscribers, tenantKey, subscriber);
      startSseHeartbeat(subscriber);

      subscriber.send({
        changed: false,
        message_changed: false,
        typing_changed: false,
        client_id: 0,
        updated_at: String(currentState?.updatedAt || ""),
        revision: Number(currentState?.revision || 0),
        typing: null,
      });

      const cleanup = () => {
        stopSseHeartbeat(subscriber);
        removeSseSubscriber(tenantSseSubscribers, tenantKey, subscriber);
      };

      req.on("close", cleanup);
      res.on("close", cleanup);
    } catch (err) {
      console.error("chat-temp GET /summaries/stream error:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
      }
      try { res.end(); } catch {}
    }
  });

  router.get("/summaries/wait", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const since = String(req.query.since || "").trim();
      const sinceRevisionRaw = Number(req.query.since_revision ?? req.query.sinceRevision);
      const hasSinceRevision = Number.isFinite(sinceRevisionRaw) && sinceRevisionRaw >= 0;
      const sinceRevision = hasSinceRevision ? Math.trunc(sinceRevisionRaw) : -1;
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);

      const currentState = await ensureTenantChangeEntryLoaded(tenantId);
      const currentUpdatedAt = String(currentState?.updatedAt || "");
      const currentRevision = Number(currentState?.revision || 0);
      const changedNow = hasSinceRevision
        ? currentRevision > sinceRevision
        : (!since ? !!currentUpdatedAt : String(currentUpdatedAt || "") !== String(since || ""));

      if (changedNow) {
        return res.json({
          ok: true,
          data: {
            changed: true,
            message_changed: false,
            typing_changed: false,
            client_id: 0,
            updated_at: currentUpdatedAt,
            revision: currentRevision,
            typing: null,
            timeout: false,
          },
        });
      }

      const waitResult = await waitForTenantChange(tenantId, timeoutMs);
      const nextState = getTenantChangeEntry(tenantId, true) || currentState || {};
      const nextUpdatedAt = String(waitResult?.updatedAt || nextState.updatedAt || "");
      const nextRevision = Number.isFinite(Number(waitResult?.revision))
        ? Math.max(0, Math.trunc(Number(waitResult.revision)))
        : Math.max(0, Math.trunc(Number(nextState.revision || 0)));
      const changed = hasSinceRevision
        ? nextRevision > sinceRevision
        : (!since ? !!nextUpdatedAt : String(nextUpdatedAt || "") !== String(since || ""));

      return res.json({
        ok: true,
        data: {
          changed,
          message_changed: waitResult?.messageChanged === true,
          typing_changed: waitResult?.typingChanged === true,
          client_id: Number(waitResult?.clientId || 0),
          updated_at: nextUpdatedAt,
          revision: nextRevision,
          typing: Number(waitResult?.clientId || 0) > 0
            ? getPeerTypingForActor(tenantId, Number(waitResult?.clientId || 0), actorKey)
            : null,
          timeout: waitResult?.timeout === true,
        },
      });
    } catch (err) {
      console.error("chat-temp GET /summaries/wait error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/summaries", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const idsRaw = String(req.query.client_ids || "").trim();
      const selectedIds = idsRaw
        ? idsRaw.split(",").map((part) => normalizeClientId(part)).filter(Boolean)
        : [];

      if (!selectedIds.length && (req.query.limit !== undefined || req.query.offset !== undefined)) {
        const page = await listSummariesPage(tenantId, {
          limit: req.query.limit,
          offset: req.query.offset,
          actorKey,
        });
        return res.json({
          ok: true,
          data: page.rows,
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          has_more: page.hasMore,
        });
      }

      const summaries = await listSummaries(tenantId, selectedIds, actorKey);
      return res.json({ ok: true, data: summaries });
    } catch (err) {
      console.error("chat-temp GET /summaries error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/clients", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const actorKey = getRequestReactionActor(req);
      const page = await listSummariesPage(tenantId, {
        limit: req.query.limit,
        offset: req.query.offset,
        actorKey,
      });
      return res.json({
        ok: true,
        data: page.rows,
        total: page.total,
        limit: page.limit,
        offset: page.offset,
        has_more: page.hasMore,
      });
    } catch (err) {
      console.error("chat-temp GET /clients error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  return router;
}

makeChatTempRouter.handleTenantChatWidgetStateChange = handleTenantChatWidgetStateChange;
makeChatTempRouter.disconnectTenantChatRuntime = disconnectTenantChatRuntime;
makeChatTempRouter.setTenantChatWidgetEnabledCache = setTenantChatWidgetEnabledCache;

module.exports = makeChatTempRouter;
