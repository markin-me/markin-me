"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const catalogSync = require("./catalog-sync");

function positiveId(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function createStockWebSocketHub({ server, db, ordersEvents }) {
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true });

  function roomKey(tenantId, storeId) { return `${tenantId}:${storeId}`; }
  function send(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(payload)); } catch (_) {}
  }
  function broadcast(room, payload) {
    room.sockets.forEach((socket) => send(socket, payload));
  }
  async function ensureRoom(tenantId, storeId) {
    const key = roomKey(tenantId, storeId);
    if (rooms.has(key)) return rooms.get(key);
    const revision = await catalogSync.getManifest({ db, tenantId, storeId });
    const room = { tenantId, storeId, sockets: new Set(), revision, unsubscribe: null, polling: false };
    room.unsubscribe = ordersEvents?.subscribe?.(tenantId, storeId, (event) => {
      if (String(event?.event || "") !== "stock.changed") return;
      broadcast(room, { type: "stock.changed", cursor: event.id, ...(event.data || {}) });
    }) || null;
    rooms.set(key, room);
    return room;
  }
  function destroyRoom(room) {
    if (room.sockets.size) return;
    try { room.unsubscribe?.(); } catch (_) {}
    rooms.delete(roomKey(room.tenantId, room.storeId));
  }

  server.on("upgrade", async (request, socket, head) => {
    let url;
    try { url = new URL(request.url, "http://localhost"); } catch (_) { socket.destroy(); return; }
    if (url.pathname !== "/api/stock-ws") { socket.destroy(); return; }
    const tenantId = positiveId(url.searchParams.get("tenant_id"));
    const storeId = positiveId(url.searchParams.get("store_id"));
    if (!tenantId || !storeId) { socket.destroy(); return; }
    try {
      const [rows] = await db.query("SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1", [tenantId, storeId]);
      if (!rows?.length) { socket.destroy(); return; }
      const room = await ensureRoom(tenantId, storeId);
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, room));
    } catch (_) { socket.destroy(); }
  });

  wss.on("connection", (socket, room) => {
    socket.isAlive = true;
    room.sockets.add(socket);
    send(socket, { type: "ready", revision: room.revision });
    socket.on("pong", () => { socket.isAlive = true; });
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw || ""));
        if (message?.type === "ping") send(socket, { type: "pong", ts: Date.now() });
      } catch (_) {}
    });
    socket.on("close", () => { room.sockets.delete(socket); destroyRoom(room); });
  });

  const heartbeat = setInterval(() => {
    rooms.forEach((room) => room.sockets.forEach((socket) => {
      if (socket.isAlive === false) { socket.terminate(); return; }
      socket.isAlive = false;
      try { socket.ping(); } catch (_) { socket.terminate(); }
    }));
  }, 30000);
  heartbeat.unref?.();

  const catchup = setInterval(() => {
    rooms.forEach(async (room) => {
      if (room.polling) return;
      room.polling = true;
      try {
        const page = await catalogSync.getChanges({
          db, tenantId: room.tenantId, storeId: room.storeId, since: room.revision, limit: 500,
        });
        if (page.reset_required) {
          room.revision = await catalogSync.getManifest({ db, tenantId: room.tenantId, storeId: room.storeId });
          broadcast(room, { type: "stock.resync", revision: room.revision });
          return;
        }
        const ids = [...new Set((page.changes || [])
          .filter((change) => String(change.operation || "") === "stock")
          .map((change) => positiveId(change.entity_id)).filter(Boolean))];
        room.revision = page.next_revision || room.revision;
        if (ids.length) broadcast(room, {
          type: "stock.changed", revision: room.revision,
          changed_product_ids: ids, affected_product_ids: ids, product_ids: ids,
        });
      } catch (_) {
        broadcast(room, { type: "stock.resync", revision: room.revision });
      } finally { room.polling = false; }
    });
  }, 1000);
  catchup.unref?.();

  return { wss };
}

module.exports = { createStockWebSocketHub };
