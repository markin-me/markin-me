require("dotenv").config();
const fs = require("fs");
const path = require("path");
const db = require("../db");

const SOURCE_FILE = path.join(process.cwd(), "tmp", "chat-temp", "threads.json");
const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
const MAX_MESSAGES_PER_THREAD = 1000;

function normalizeTenantId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.trunc(n));
}

function normalizeClientId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.trunc(n));
}

function toIsoOrNow(value) {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function toDbDateOrNull(value, fallbackNow = false) {
  if (!value && !fallbackNow) return null;
  const d = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(d.getTime())) return fallbackNow ? new Date() : null;
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
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) return null;
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return null;

  const mimeRaw = String(raw.mime || "").toLowerCase();
  const mime = /^image\/[a-z0-9.+-]+$/i.test(mimeRaw) ? mimeRaw : "";
  const width = Number(raw.width);
  const height = Number(raw.height);
  const size = Number(raw.size);

  return {
    kind: "image",
    name: String(raw.name || "").slice(0, 160),
    mime,
    dataUrl,
    width: Number.isFinite(width) && width > 0 ? Math.min(10000, Math.round(width)) : 0,
    height: Number.isFinite(height) && height > 0 ? Math.min(10000, Math.round(height)) : 0,
    size: Number.isFinite(size) && size > 0 ? Math.min(50 * 1024 * 1024, Math.round(size)) : 0,
  };
}

function sanitizeMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().slice(0, 120);
  if (!id) return null;

  const direction = String(raw.direction || "").toLowerCase() === "out" ? "out" : "in";
  const deliveryStatusRaw = String(raw.deliveryStatus || "").toLowerCase();
  const deliveryStatus = ["sent", "delivered", "read"].includes(deliveryStatusRaw)
    ? deliveryStatusRaw
    : "";

  const reactions = sanitizeReactions(raw.reactions);
  const legacyReaction = String(raw.reaction || "").slice(0, 20);
  if (!reactions.in && !reactions.out && legacyReaction) reactions[direction] = legacyReaction;

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

  out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return out;
}

function sanitizeMeta(rawMeta) {
  if (!rawMeta || typeof rawMeta !== "object") return {};
  const rawDay = String(rawMeta.last_welcome_day || rawMeta.lastWelcomeDay || "").trim();
  const lastWelcomeDay = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : "";
  return {
    name: String(rawMeta.name || "").slice(0, 160),
    phone: String(rawMeta.phone || "").slice(0, 60),
    last_welcome_day: lastWelcomeDay,
  };
}

async function saveThread(conn, tenantId, clientId, record) {
  const messages = sanitizeThread(record && record.messages);
  const meta = sanitizeMeta(record && record.meta);
  const updatedAt = toDbDateOrNull(record && record.updated_at, true);

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
      String(meta.name || ""),
      String(meta.phone || ""),
      String(meta.last_welcome_day || ""),
    ]
  );

  await conn.query(
    `DELETE FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?`,
    [tenantId, clientId]
  );

  const insertSql = `
    INSERT INTO chat_messages (
      tenant_id, client_id, message_id, direction, text, created_at, edited_at,
      is_read, is_pinned, reaction_legacy, reaction_in, reaction_out,
      reply_to_json, attachment_json, delivery_status, delivered_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const msg of messages) {
    const reactions = sanitizeReactions(msg.reactions);
    const safeReply = sanitizeReply(msg.replyTo);
    const safeAttachment = sanitizeAttachment(msg.attachment);

    await conn.query(insertSql, [
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
    ]);
  }

  return { messageCount: messages.length };
}

async function run() {
  if (!fs.existsSync(SOURCE_FILE)) {
    console.log("[chat-import] Source file not found:", SOURCE_FILE);
    process.exit(0);
  }

  const raw = fs.readFileSync(SOURCE_FILE, "utf8");
  const parsed = raw ? JSON.parse(raw) : {};
  const tenants = parsed && typeof parsed.tenants === "object" ? parsed.tenants : {};

  const tenantIds = Object.keys(tenants)
    .map((id) => normalizeTenantId(id))
    .filter(Boolean);
  if (!tenantIds.length) {
    console.log("[chat-import] No tenant buckets found in source file.");
    process.exit(0);
  }

  let conn;
  let importedThreads = 0;
  let importedMessages = 0;

  try {
    conn = await db.getConnection();

    for (const tenantId of tenantIds) {
      const bucket = tenants[tenantId];
      const threads = bucket && typeof bucket.threads === "object" ? bucket.threads : {};
      const clientIds = Object.keys(threads)
        .map((id) => normalizeClientId(id))
        .filter(Boolean);

      for (const clientId of clientIds) {
        await conn.beginTransaction();
        try {
          const record = threads[clientId] || {};
          const result = await saveThread(conn, tenantId, clientId, record);
          await conn.commit();
          importedThreads += 1;
          importedMessages += Number(result.messageCount || 0);
        } catch (err) {
          await conn.rollback();
          throw err;
        }
      }
    }

    console.log(`[chat-import] Imported threads: ${importedThreads}`);
    console.log(`[chat-import] Imported messages: ${importedMessages}`);
    process.exit(0);
  } catch (err) {
    console.error("[chat-import] Failed:", err);
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
}

run();
