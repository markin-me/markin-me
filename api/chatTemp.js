const express = require("express");
const fs = require("fs");
const path = require("path");

module.exports = function makeChatTempRouter() {
  const router = express.Router();
  const storeDir = path.join(process.cwd(), "tmp", "chat-temp");
  const storeFile = path.join(storeDir, "threads.json");

  function ensureStoreFile() {
    fs.mkdirSync(storeDir, { recursive: true });
    if (!fs.existsSync(storeFile)) {
      fs.writeFileSync(storeFile, JSON.stringify({ tenants: {} }, null, 2), "utf8");
    }
  }

  function readStore() {
    ensureStoreFile();
    try {
      const raw = fs.readFileSync(storeFile, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return { tenants: {} };
      if (!parsed.tenants || typeof parsed.tenants !== "object") parsed.tenants = {};
      return parsed;
    } catch {
      return { tenants: {} };
    }
  }

  function writeStore(nextStore) {
    ensureStoreFile();
    fs.writeFileSync(storeFile, JSON.stringify(nextStore || { tenants: {} }, null, 2), "utf8");
  }

  function getTenantId(req) {
    const fromHeader = Number(req.headers["x-tenant-id"]);
    if (Number.isFinite(fromHeader) && fromHeader > 0) return String(fromHeader);
    const fromQuery = Number(req.query.tenant_id);
    if (Number.isFinite(fromQuery) && fromQuery > 0) return String(fromQuery);
    return "1";
  }

  function normalizeClientId(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
    return null;
  }

  function toIsoOrNow(value) {
    const d = new Date(String(value || ""));
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
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

  function sanitizeAttachment(raw) {
    if (!raw || typeof raw !== "object") return null;
    const kind = String(raw.kind || "").toLowerCase();
    if (kind !== "image") return null;

    const dataUrl = String(raw.dataUrl || "");
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) return null;
    if (dataUrl.length > 5 * 1024 * 1024) return null;

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

    return {
      id,
      direction,
      text: String(raw.text || "").slice(0, 5000),
      createdAt: toIsoOrNow(raw.createdAt),
      editedAt: raw.editedAt ? toIsoOrNow(raw.editedAt) : "",
      read: raw.read === true,
      pinned: raw.pinned === true,
      reaction: String(raw.reaction || "").slice(0, 20),
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
      if (out.length >= 1000) break;
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
    return {
      name: String(meta.name || "").slice(0, 160),
      phone: String(meta.phone || "").slice(0, 60),
    };
  }

  function getTenantBucket(store, tenantId) {
    if (!store.tenants || typeof store.tenants !== "object") store.tenants = {};
    if (!store.tenants[tenantId] || typeof store.tenants[tenantId] !== "object") {
      store.tenants[tenantId] = { threads: {} };
    }
    if (!store.tenants[tenantId].threads || typeof store.tenants[tenantId].threads !== "object") {
      store.tenants[tenantId].threads = {};
    }
    return store.tenants[tenantId];
  }

  function getThreadRecord(bucket, clientId) {
    if (!bucket.threads[clientId] || typeof bucket.threads[clientId] !== "object") {
      bucket.threads[clientId] = {
        updated_at: "",
        meta: {},
        messages: [],
      };
    }
    const record = bucket.threads[clientId];
    if (!Array.isArray(record.messages)) record.messages = [];
    if (!record.meta || typeof record.meta !== "object") record.meta = {};
    if (typeof record.updated_at !== "string") record.updated_at = "";
    return record;
  }

  function buildSummary(clientId, record) {
    const messages = Array.isArray(record?.messages) ? record.messages : [];
    const last = messages.length ? messages[messages.length - 1] : null;
    const lastText = String(last?.text || "").trim();
    const lastPreview = lastText || (last?.attachment?.kind === "image" ? "Фото" : "");
    const unreadCount = messages.reduce((sum, msg) => {
      if (!msg || msg.direction !== "in") return sum;
      return sum + (msg.read === true ? 0 : 1);
    }, 0);

    return {
      client_id: Number(clientId),
      updated_at: String(record?.updated_at || ""),
      message_count: messages.length,
      unread_count: unreadCount,
      last_message_at: String(last?.createdAt || ""),
      last_message_text: String(lastPreview || ""),
      meta: sanitizeMeta(record?.meta),
    };
  }

  router.get("/thread/:clientId", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const store = readStore();
      const bucket = getTenantBucket(store, tenantId);
      const record = getThreadRecord(bucket, clientId);
      const messages = sanitizeThread(record.messages);
      const updatedAt = String(record.updated_at || "");

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: updatedAt,
          meta: sanitizeMeta(record.meta),
          messages,
        },
      });
    } catch (err) {
      console.error("chat-temp GET /thread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.put("/thread/:clientId", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const clientId = normalizeClientId(req.params.clientId);
      if (!clientId) return res.status(400).json({ ok: false, error: "CLIENT_ID_REQUIRED" });

      const nextMessages = sanitizeThread(req.body?.messages || req.body?.thread || []);
      const metaPatch = sanitizeMeta(req.body?.meta);
      const now = new Date().toISOString();

      const store = readStore();
      const bucket = getTenantBucket(store, tenantId);
      const record = getThreadRecord(bucket, clientId);
      record.messages = nextMessages;
      record.meta = {
        ...sanitizeMeta(record.meta),
        ...metaPatch,
      };
      record.updated_at = now;

      writeStore(store);

      return res.json({
        ok: true,
        data: {
          client_id: Number(clientId),
          updated_at: now,
          meta: sanitizeMeta(record.meta),
          messages: nextMessages,
        },
      });
    } catch (err) {
      console.error("chat-temp PUT /thread error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/summaries", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const idsRaw = String(req.query.client_ids || "").trim();
      const selectedIds = idsRaw
        ? idsRaw
            .split(",")
            .map((part) => normalizeClientId(part))
            .filter(Boolean)
        : [];

      const store = readStore();
      const bucket = getTenantBucket(store, tenantId);
      const allIds = Object.keys(bucket.threads || {});
      const ids = selectedIds.length ? selectedIds : allIds;
      const summaries = ids
        .map((id) => {
          const record = getThreadRecord(bucket, id);
          return buildSummary(id, record);
        })
        .filter((row) => Number.isFinite(Number(row.client_id)) && Number(row.client_id) > 0);

      return res.json({ ok: true, data: summaries });
    } catch (err) {
      console.error("chat-temp GET /summaries error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  router.get("/clients", (req, res) => {
    try {
      const tenantId = getTenantId(req);
      const store = readStore();
      const bucket = getTenantBucket(store, tenantId);
      const rows = Object.keys(bucket.threads || {})
        .map((id) => buildSummary(id, getThreadRecord(bucket, id)))
        .sort((a, b) => {
          const ta = new Date(a.updated_at || 0).getTime();
          const tb = new Date(b.updated_at || 0).getTime();
          return tb - ta;
        });

      return res.json({ ok: true, data: rows });
    } catch (err) {
      console.error("chat-temp GET /clients error:", err);
      return res.status(500).json({ ok: false, error: "SERVER_ERROR" });
    }
  });

  return router;
};
