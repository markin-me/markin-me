const express = require("express");
const db = require("../db");

const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
const MAX_MESSAGES_PER_THREAD = 1000;

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

function getRequestReactionActor(req) {
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

async function replaceThreadMessages(conn, tenantId, clientId, messages) {
  await conn.query(
    `DELETE FROM chat_messages
      WHERE tenant_id = ? AND client_id = ?`,
    [tenantId, clientId]
  );

  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) return;

  const insertSql = `
    INSERT INTO chat_messages (
      tenant_id, client_id, message_id, direction, text, created_at, edited_at,
      is_read, is_pinned, reaction_legacy, reaction_in, reaction_out,
      reply_to_json, attachment_json, delivery_status, delivered_at, read_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const msg of list) {
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

module.exports = function makeChatTempRouter() {
  const router = express.Router();

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

      return res.json({ ok: true, data: { client_id: Number(clientId), deleted } });
    } catch (err) {
      console.error("chat-temp DELETE /thread error:", err);
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
