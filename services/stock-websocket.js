"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const catalogSync = require("./catalog-sync");

function positiveId(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function createStockWebSocketHub({ server, db, ordersEvents, authenticateCustomer, submitOrder }) {
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

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
    if (rooms.has(key)) return rooms.get(key);
    const room = { tenantId, storeId, sockets: new Set(), revision, unsubscribe: null, polling: false };
    room.unsubscribe = ordersEvents?.subscribe?.(tenantId, storeId, (event) => {
      if (event?.event === "stock.changed") {
        broadcast(room, { type: "stock.changed", cursor: event.id, ...(event.data || {}) });
      } else if (event?.event === "order.updated") {
        room.sockets.forEach((client) => {
          if (Number(client.customerId) === Number(event.data?.customer_id) && client.customerId) {
            void client.notifyOrder(event);
          }
        });
      }
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
    if (url.pathname === "/api/orders-ws") return;
    if (url.pathname !== "/api/stock-ws") { socket.destroy(); return; }
    if (request.headers.origin) {
      try {
        if (new URL(request.headers.origin).host !== request.headers.host) { socket.destroy(); return; }
      } catch (_) { socket.destroy(); return; }
    }
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
    send(socket, { type: "ready", revision: room.revision, order_commands: Boolean(submitOrder) });
    socket.on("pong", () => { socket.isAlive = true; });
    let authVersion = 0;
    let commandRunning = false;
    socket.customerId = null;
    socket.customerToken = "";
    socket.on("error", () => socket.terminate());
    socket.notifyOrder = async (event) => {
      const version = authVersion;
      try {
        const customer = await authenticateCustomer(room.tenantId, socket.customerToken);
        if (version !== authVersion || socket.readyState !== WebSocket.OPEN) return;
        if (!customer || Number(customer.id) !== socket.customerId) {
          socket.customerId = null;
          send(socket, { type: "customer.expired" });
          return;
        }
        send(socket, { type: "order.updated", order_id: Number(event.data.id), cursor: event.id });
      } catch (error) {
        console.error("Shop WebSocket session validation failed:", error.message);
        socket.close(1011, "Session validation failed");
      }
    };
    socket.on("message", async (raw) => {
      let message;
      try { message = JSON.parse(String(raw || "")); }
      catch (_) { socket.close(1008, "Invalid message"); return; }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        socket.close(1008, "Invalid message"); return;
      }
      try {
        if (message.type === "ping") send(socket, { type: "pong", ts: Date.now() });
        if (message.type === "auth") {
          const version = ++authVersion;
          socket.customerId = null;
          socket.customerToken = String(message.customer_token || "").trim();
          const customer = socket.customerToken && authenticateCustomer
            ? await authenticateCustomer(room.tenantId, socket.customerToken) : null;
          if (version !== authVersion || socket.readyState !== WebSocket.OPEN) return;
          socket.customerId = customer ? Number(customer.id) : null;
          send(socket, { type: customer ? "customer.ready" : "customer.expired" });
        }
        if (message.type !== "order.create" || !submitOrder) return;
        const requestId = String(message.request_id || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
          || !message.body || typeof message.body !== "object" || Array.isArray(message.body)) {
          socket.close(1008, "Invalid order command"); return;
        }
        if (commandRunning) {
          send(socket, { type: "order.result", request_id: requestId, status: 429, payload: { ok: false, error: "ORDER_SUBMISSION_BUSY" } });
          return;
        }
        commandRunning = true;
        let status = 200;
        const response = {
          status(code) { status = code; return this; },
          json(payload) { send(socket, { type: "order.result", request_id: requestId, status, payload }); return this; },
        };
        try {
          const token = String(message.customer_token || "").trim();
          if (token && !(await authenticateCustomer(room.tenantId, token))) {
            response.status(401).json({ ok: false, error: "UNAUTHORIZED" }); return;
          }
          await submitOrder({
            headers: {
              "x-tenant-id": String(room.tenantId), "x-store-id": String(room.storeId),
              "x-customer-token": token, "idempotency-key": requestId,
              "x-referral-code": String(message.referral_code || ""),
            },
            query: {}, body: message.body,
          }, response);
        } finally { commandRunning = false; }
      } catch (error) {
        console.error("Shop WebSocket message failed:", error.message);
        socket.close(1011, "Command failed");
      }
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

// Separate authenticated transport; stock rooms never carry personal order events.
function createOrdersWebSocketHub({ server, db, ordersEvents, authenticateCustomer }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const rooms = new Map();
  const send = (socket, message) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  server.on("upgrade", (request, socket, head) => {
    let url;
    try { url = new URL(request.url, "http://localhost"); } catch (_) { return; }
    if (url.pathname !== "/api/orders-ws") return;
    const tenantId = positiveId(url.searchParams.get("tenant_id"));
    const storeId = positiveId(url.searchParams.get("store_id"));
    if (!tenantId || !storeId) { socket.destroy(); return; }
    if (request.headers.origin) {
      let origin;
      try { origin = new URL(request.headers.origin); } catch (_) { socket.destroy(); return; }
      if (origin.host !== request.headers.host) { socket.destroy(); return; }
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, { tenantId, storeId }));
  });
  wss.on("connection", (socket, scope) => {
    socket.isAlive = true;
    let room = null;
    let authenticating = false;
    let customerToken = "";
    const timeout = setTimeout(() => socket.close(1008, "Authentication required"), 5000);
    socket.on("pong", () => { socket.isAlive = true; });
    socket.on("error", () => socket.terminate());
    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(String(raw));
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          socket.close(1008, "Invalid message"); return;
        }
        if (room) {
          if (message.type === "ping") send(socket, { type: "pong" });
          return;
        }
        if (authenticating) return;
        if (message.type !== "auth" || typeof message.customer_token !== "string") {
          socket.close(1008, "Invalid authentication"); return;
        }
        authenticating = true;
        customerToken = message.customer_token.trim();
        const customer = await authenticateCustomer(scope.tenantId, customerToken);
        const [stores] = await db.query("SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1", [scope.tenantId, scope.storeId]);
        if (!customer || !stores.length) { socket.close(1008, "Unauthorized"); return; }
        if (socket.readyState !== WebSocket.OPEN) return;
        const key = `${scope.tenantId}:${scope.storeId}:${customer.id}`;
        room = rooms.get(key);
        if (!room) {
          room = { key, sockets: new Set(), unsubscribe: null };
          const targetRoom = room;
          targetRoom.unsubscribe = ordersEvents.subscribe(scope.tenantId, scope.storeId, (event) => {
            if (event.event !== "order.updated" || Number(event.data?.customer_id) !== Number(customer.id)) return;
            // Only an invalidation is sent. The owned public HTTP endpoint supplies the snapshot.
            targetRoom.sockets.forEach((client) => client.notifyOrder(event));
          });
          rooms.set(key, room);
        }
        socket.notifyOrder = async (event) => {
          try {
            const current = await authenticateCustomer(scope.tenantId, customerToken);
            if (!current || Number(current.id) !== Number(customer.id)) { socket.close(1008, "Session expired"); return; }
            send(socket, { type: "order.updated", order_id: Number(event.data.id), cursor: event.id });
          } catch (error) {
            console.error("Order WebSocket session validation failed:", error.message);
            socket.close(1011, "Session validation failed");
          }
        };
        room.sockets.add(socket);
        clearTimeout(timeout);
        send(socket, { type: "ready" });
      } catch (error) {
        if (error instanceof SyntaxError) socket.close(1008, "Invalid message");
        else {
          console.error("Order WebSocket authentication failed:", error.message);
          socket.close(1011, "Authentication unavailable");
        }
      }
    });
    socket.on("close", () => {
      clearTimeout(timeout);
      if (!room) return;
      room.sockets.delete(socket);
      if (!room.sockets.size) { room.unsubscribe?.(); rooms.delete(room.key); }
    });
  });
  const heartbeat = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (!socket.isAlive) { socket.terminate(); return; }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));
  return { wss };
}

module.exports = { createStockWebSocketHub, createOrdersWebSocketHub };
