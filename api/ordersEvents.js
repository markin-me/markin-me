function createOrdersEventsHub() {
  const channels = new Map();
  const MAX_EVENTS = 500;
  const HEARTBEAT_MS = 20000;

  function log(level, msg, meta = {}) {
    const ts = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[SSE ${ts}] [${level}] ${msg}${metaStr}`);
  }

  function getKey(tenantId, storeId) {
    return `${tenantId}:${storeId}`;
  }

  function getChannel(tenantId, storeId) {
    const key = getKey(tenantId, storeId);
    if (!channels.has(key)) {
      channels.set(key, { clients: new Set(), log: [], seq: 0 });
    }
    return channels.get(key);
  }

  function sendEvent(res, evt) {
    try {
      res.write(`id: ${evt.id}\n`);
      res.write(`event: ${evt.event}\n`);
      res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
    } catch (err) {
      log("ERROR", "sendEvent failed", { error: err.message });
      throw err;
    }
  }

  function publish(tenantId, storeId, event, data) {
    const channel = getChannel(tenantId, storeId);
    channel.seq += 1;
    const payload = {
      id: channel.seq,
      event,
      data,
      ts: Date.now(),
    };

    channel.log.push(payload);
    if (channel.log.length > MAX_EVENTS) channel.log.shift();

    let sendErrors = 0;
    channel.clients.forEach((res) => {
      try {
        sendEvent(res, payload);
      } catch (err) {
        sendErrors += 1;
      }
    });
    if (sendErrors > 0) {
      log("WARN", "publish: failed to send to some clients", {
        tenantId,
        storeId,
        event,
        sendErrors,
        totalClients: channel.clients.size,
      });
    }
  }

  function getChanges(tenantId, storeId, since) {
    const channel = getChannel(tenantId, storeId);
    const lastId = Number(since || 0);
    if (!Number.isFinite(lastId) || lastId <= 0) return [];
    return channel.log.filter((evt) => evt.id > lastId);
  }

  function attach(req, res, tenantId, storeId) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const channel = getChannel(tenantId, storeId);

    const lastEventId = req.headers["last-event-id"];
    if (lastEventId) {
      const missed = getChanges(tenantId, storeId, lastEventId);
      missed.forEach((evt) => sendEvent(res, evt));
    }

    channel.clients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (err) {
        log("WARN", "heartbeat write failed", { tenantId, storeId, error: err.message });
      }
    }, HEARTBEAT_MS);

    res.on("close", () => {
      clearInterval(heartbeat);
      channel.clients.delete(res);
      log("INFO", "SSE client disconnected", {
        tenantId,
        storeId,
        clientCount: channel.clients.size,
      });
    });
  }

  return { publish, getChanges, attach };
}

module.exports = { createOrdersEventsHub };
