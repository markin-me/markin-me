const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const db = require("../db");

const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
const MAX_MESSAGES_PER_THREAD = 1000;
const CHAT_LONG_POLL_MAX_TIMEOUT_MS = 25000;
const CHAT_LONG_POLL_MIN_TIMEOUT_MS = 1000;
const CHAT_TYPING_TTL_MS = 7000;
const CHAT_TYPING_TEXT_MAX_LENGTH = 120;
const CHAT_UPLOAD_MAX_FILE_BYTES = 20 * 1024 * 1024;
const CHAT_UPLOAD_RELATIVE_DIR = path.join("uploads", "chat");
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

try {
  fs.mkdirSync(CHAT_UPLOAD_ABSOLUTE_DIR, { recursive: true });
} catch {}

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_UPLOAD_MAX_FILE_BYTES },
});

const threadWaiters = new Map();
const tenantWaiters = new Map();
const threadTypingState = new Map();

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
  const hasUrl = /^\/uploads\/chat\//i.test(url) || /^https?:\/\//i.test(url);
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

  const direction = String(raw.direction || "").toLowerCase() === "out" ? "out" : "in";
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
  threadTypingState.delete(key);
}

function notifyTenantChange(tenantId, updatedAt = "") {
  const key = getTenantKey(tenantId);
  if (!key) return;
  const set = tenantWaiters.get(key);
  if (!set || !set.size) return;
  const payload = { updatedAt: String(updatedAt || "") };
  Array.from(set).forEach((resolve) => {
    try { resolve(payload); } catch {}
  });
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
  }
  if (messageChanged) notifyTenantChange(tenantId, updatedAt);
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
      direction: String(row.direction || "").toLowerCase() === "out" ? "out" : "in",
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

    const direction = String(msg.direction || "").toLowerCase() === "out" ? "out" : "in";
    const legacy = String(msg.reaction || "").slice(0, 20);
    msg.reaction = legacy || String(nextReactions[direction] || "");
    return msg;
  });
}

function mapDbMessageRowToApi(row) {
  const direction = String(row.direction || "").toLowerCase() === "out" ? "out" : "in";
  const reactions = sanitizeReactions({
    in: row.reaction_in,
    out: row.reaction_out,
  });
  const legacyReaction = String(row.reaction_legacy || "").slice(0, 20);

  return {
    id: String(row.message_id || ""),
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

function mapSummaryRow(row) {
  return {
    client_id: Number(row.client_id),
    updated_at: toIsoOrEmpty(row.updated_at),
    message_count: Number(row.message_count || 0),
    unread_count: Number(row.unread_count || 0),
    last_message_at: toIsoOrEmpty(row.last_message_at),
    last_message_text: getSummaryLastPreviewText(row),
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
  const [rows] = await conn.query(
    `SELECT tenant_id, client_id, updated_at, meta_name, meta_phone, meta_last_welcome_day
       FROM chat_threads
      WHERE tenant_id = ? AND client_id = ?
      LIMIT 1`,
    [tenantId, clientId]
  );
  return rows[0] || null;
}

async function readThreadMessages(tenantId, clientId, conn = db) {
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

async function readThreadMessagesSince(tenantId, clientId, sinceDate, conn = db) {
  const since = sinceDate instanceof Date && !Number.isNaN(sinceDate.getTime())
    ? new Date(Math.max(0, sinceDate.getTime() - 1500))
    : null;
  if (!since) return [];

  const [rows] = await conn.query(
    `SELECT message_id, direction, text, created_at, edited_at, is_read, is_pinned,
            reaction_legacy, reaction_in, reaction_out, reply_to_json, attachment_json,
            delivery_status, delivered_at, read_at
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ? AND updated_row_at > ?
      ORDER BY created_at ASC, id ASC`,
    [tenantId, clientId, since]
  );
  return rows || [];
}

async function readThreadMessageCount(tenantId, clientId, conn = db) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS total
       FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?`,
    [tenantId, clientId]
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

async function listSummaries(tenantId, selectedClientIds = []) {
  const ids = (Array.isArray(selectedClientIds) ? selectedClientIds : [])
    .map((id) => normalizeClientId(id))
    .filter(Boolean);
  const idsClause = ids.length ? ` AND t.client_id IN (${ids.map(() => "?").join(",")})` : "";

  const params = [tenantId, tenantId];
  if (ids.length) params.push(...ids);

  const [rows] = await db.query(
    `
      SELECT
        t.client_id,
        t.updated_at,
        t.meta_name,
        t.meta_phone,
        t.meta_last_welcome_day,
        COALESCE(s.message_count, 0) AS message_count,
        COALESCE(s.unread_count, 0) AS unread_count,
        m.created_at AS last_message_at,
        m.text AS last_message_text,
        m.attachment_json AS last_attachment_json
      FROM chat_threads t
      LEFT JOIN (
        SELECT
          tenant_id,
          client_id,
          COUNT(*) AS message_count,
          SUM(CASE WHEN direction = 'in' AND is_read = 0 THEN 1 ELSE 0 END) AS unread_count
        FROM chat_messages
        WHERE tenant_id = ?
        GROUP BY tenant_id, client_id
      ) s
        ON s.tenant_id = t.tenant_id AND s.client_id = t.client_id
      LEFT JOIN chat_messages m
        ON m.id = (
          SELECT mm.id
          FROM chat_messages mm
          WHERE mm.tenant_id = t.tenant_id AND mm.client_id = t.client_id
          ORDER BY mm.created_at DESC, mm.id DESC
          LIMIT 1
        )
      WHERE t.tenant_id = ?${idsClause}
      ORDER BY t.updated_at DESC, t.client_id DESC
    `,
    params
  );

  const parsedRows = (rows || [])
    .map(mapSummaryRow)
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
      meta: {},
    };
  });
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

module.exports = function makeChatTempRouter() {
  const router = express.Router();

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
      const requestedActive = req.body?.typing === true || req.body?.active === true;
      const requestedText = sanitizeTypingText(
        req.body?.text
        || req.body?.phrase
        || req.body?.label
        || ""
      );

      const selfTyping = setThreadTypingForActor(
        tenantId,
        clientId,
        actorKey,
        requestedActive,
        requestedText
      );
      const peerTyping = getPeerTypingForActor(tenantId, clientId, actorKey);
      notifyThreadChange(tenantId, clientId, "", {
        messageChanged: false,
        typingChanged: true,
      });

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
      console.error("chat-temp GET /thread/:clientId/wait error:", err);
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
      setThreadTypingForActor(tenantId, clientId, actorKey, false, "");
      notifyThreadChange(tenantId, clientId, updatedAt.toISOString(), {
        messageChanged: true,
        typingChanged: true,
      });

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt.toISOString(),
          message: row ? mapDbMessageRowToApi(row) : message,
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
      const nextMessage = applyMessagePatch(existingMessage, patch, actorKey);
      if (!nextMessage) {
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
      await upsertSingleThreadMessage(conn, tenantId, clientId, nextMessage);
      await touchThreadUpdatedAt(conn, tenantId, clientId, updatedAt);

      const row = await readSingleMessageRow(tenantId, clientId, messageId, conn);
      await conn.commit();
      conn.release();
      conn = null;
      notifyThreadChange(tenantId, clientId, updatedAt.toISOString());

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt.toISOString(),
          message: row ? mapDbMessageRowToApi(row) : nextMessage,
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
      if (changed) notifyThreadChange(tenantId, clientId, updatedAt.toISOString());

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
      if (changed) notifyThreadChange(tenantId, clientId, updatedAt.toISOString());

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

  router.get("/thread/:clientId/diff", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const sinceRaw = String(req.query.since || "").trim();
      if (!sinceRaw) return res.status(400).json({ ok: false, error: "SINCE_REQUIRED" });
      const since = new Date(sinceRaw);
      if (Number.isNaN(since.getTime())) return res.status(400).json({ ok: false, error: "SINCE_INVALID" });

      const [metaRow, changedRows] = await Promise.all([
        readThreadMeta(tenantId, clientId),
        readThreadMessagesSince(tenantId, clientId, since),
      ]);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: toIsoOrEmpty(metaRow?.updated_at),
          message_count: -1,
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
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const [metaRow, messageRows] = await Promise.all([
        readThreadMeta(tenantId, clientId),
        readThreadMessages(tenantId, clientId),
      ]);

      const messages = sanitizeThread(messageRows.map(mapDbMessageRowToApi));
      const updatedAt = toIsoOrEmpty(metaRow?.updated_at);
      const meta = sanitizeMetaFromDbRow(metaRow);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt,
          meta,
          messages,
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
        clearThreadTypingState(tenantId, clientId);
        notifyThreadChange(tenantId, clientId, new Date().toISOString());
      }

      return res.json({ ok: true, data: { client_id: Number(clientId), deleted } });
    } catch (err) {
      console.error("chat-temp DELETE /thread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/summaries/wait", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const since = String(req.query.since || "").trim();
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);

      const currentUpdatedAt = await readTenantUpdatedAt(tenantId);
      if (!since) {
        if (!currentUpdatedAt) {
          // Nothing to report yet; keep long-poll open until a new thread/message appears.
        } else {
          return res.json({
            ok: true,
            data: {
              changed: true,
              updated_at: currentUpdatedAt,
              timeout: false,
            },
          });
        }
      } else if (String(currentUpdatedAt || "") !== since) {
        return res.json({
          ok: true,
          data: {
            changed: true,
            updated_at: currentUpdatedAt,
            timeout: false,
          },
        });
      }

      const waitResult = await waitForTenantChange(tenantId, timeoutMs);
      const nextUpdatedAt = await readTenantUpdatedAt(tenantId);
      const changed = waitResult?.timeout !== true
        || String(nextUpdatedAt || "") !== String(since || "");

      return res.json({
        ok: true,
        data: {
          changed,
          updated_at: nextUpdatedAt,
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
      const idsRaw = String(req.query.client_ids || "").trim();
      const selectedIds = idsRaw
        ? idsRaw.split(",").map((part) => normalizeClientId(part)).filter(Boolean)
        : [];

      const summaries = await listSummaries(tenantId, selectedIds);
      return res.json({ ok: true, data: summaries });
    } catch (err) {
      console.error("chat-temp GET /summaries error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/clients", async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const rows = await listSummaries(tenantId, []);
      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error("chat-temp GET /clients error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  return router;
};
