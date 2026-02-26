function createOrdersEventsHub() {
  const channels = new Map();
  const waiters = new Map();
  const MAX_EVENTS = 500;
  const LONG_POLL_MIN_TIMEOUT_MS = 1000;
  const LONG_POLL_MAX_TIMEOUT_MS = 25000;

  function getKey(tenantId, storeId) {
    return `${tenantId}:${storeId}`;
  }

  function getChannel(tenantId, storeId) {
    const key = getKey(tenantId, storeId);
    if (!channels.has(key)) {
      channels.set(key, { log: [], seq: 0 });
    }
    return channels.get(key);
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

    const key = getKey(tenantId, storeId);
    const set = waiters.get(key);
    if (set && set.size) {
      Array.from(set).forEach((resolveWaiter) => {
        try { resolveWaiter({ timeout: false, cursor: payload.id }); } catch {}
      });
    }
  }

  function getChanges(tenantId, storeId, since) {
    const channel = getChannel(tenantId, storeId);
    const lastId = Number(since || 0);
    if (!Number.isFinite(lastId) || lastId <= 0) return channel.log.slice();
    return channel.log.filter((evt) => evt.id > lastId);
  }

  function getCurrentCursor(tenantId, storeId) {
    const channel = getChannel(tenantId, storeId);
    return Number(channel.seq || 0);
  }

  function waitForChanges(tenantId, storeId, timeoutMs) {
    const key = getKey(tenantId, storeId);
    const timeout = Math.min(
      LONG_POLL_MAX_TIMEOUT_MS,
      Math.max(LONG_POLL_MIN_TIMEOUT_MS, Number(timeoutMs || 0) || 20000)
    );

    return new Promise((resolve) => {
      const set = waiters.get(key) || new Set();
      let done = false;

      const complete = (payload) => {
        if (done) return;
        done = true;
        set.delete(complete);
        if (!set.size) waiters.delete(key);
        clearTimeout(timer);
        resolve(payload || { timeout: true, cursor: getCurrentCursor(tenantId, storeId) });
      };

      set.add(complete);
      waiters.set(key, set);
      const timer = setTimeout(() => complete({ timeout: true, cursor: getCurrentCursor(tenantId, storeId) }), timeout);
    });
  }

  return { publish, getChanges, getCurrentCursor, waitForChanges };
}

module.exports = { createOrdersEventsHub };
