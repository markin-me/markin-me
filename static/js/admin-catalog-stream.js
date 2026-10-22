(function (window) {
  'use strict';
  if (window.AdminCatalogStream) return;
  const HEARTBEAT_MS = 15000;
  // Hidden Chrome timers may run only once a minute. Visibility is not activity.
  const LEASE_MS = 150000;
  const JOIN_MS = 10000;
  const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
  const validRevision = value => typeof value === 'string' && /^\d{1,64}$/.test(value);

  function open(options) {
    const id = window.crypto?.randomUUID?.();
    let closed = false, channel = null, queue = null, release = null, transport = null;
    let draining = Promise.resolve();
    let mode = 'waiting', lease = null, term = null, sequence = 0, lastHint = null;
    let pulseTimer = null, watchTimer = null;
    let received = 0, sent = 0;
    const retired = new Set();
    const current = () => !closed && !options.signal.aborted && options.isCurrent();
    const clearWatch = () => { window.clearTimeout(watchTimer); watchTimer = null; };
    function stopTransport() {
      const previous = transport;
      transport = null;
      previous?.controller.abort();
      if (previous?.done) draining = previous.done;
      return draining;
    }
    function send(type, hint) {
      if (!channel || !current()) return;
      const message = type === 'hello' ? { v: 1, type, sender: id }
        : { v: 1, type, sender: id, term, sequence: ++sequence, expiresAt: Date.now() + LEASE_MS,
          ...(hint ? { revision: hint.revision, event: hint.event } : {}) };
      channel.postMessage(message);
      if (hint) sent += 1;
    }
    function watch(until) {
      clearWatch();
      watchTimer = window.setTimeout(() => {
        if (!current()) return close();
        // Never steal a live lock: the suspended owner may still have an SSE.
        // No heartbeat means this group cannot currently coordinate safely.
        independent(false);
      }, Math.max(0, until - Date.now()));
    }
    function close() {
      if (closed) return;
      try { if (mode === 'leader') send('bye'); } catch (_) {}
      closed = true; mode = 'stopped';
      window.clearInterval(pulseTimer); clearWatch();
      queue?.abort(); channel?.close(); channel = null;
      options.signal.removeEventListener('abort', close);
      // Retain exclusivity until this owner's fetch/reader has actually settled.
      void stopTransport().finally(() => { release?.(); release = null; });
    }
    function finish(result) {
      if (!current()) return close();
      close();
      options.onEnd(result);
    }
    function connect(shared) {
      if (!current() || transport) return;
      const run = { controller: new AbortController(), done: null };
      transport = run;
      run.done = Promise.resolve().then(() => {
        if (!current() || run !== transport) return;
        return options.connect(run.controller.signal, (revision, event) => {
          if (!current() || run !== transport || run.controller.signal.aborted
              || !validRevision(revision) || !['snapshot', 'change'].includes(event)) return;
          options.onHint(revision, event);
          if (shared && mode === 'leader') {
            lastHint = { revision, event };
            try { send('hint', lastHint); } catch (_) { independent(true); }
          }
        });
      }).then(result => {
        if (current() && run === transport && !run.controller.signal.aborted) finish(result);
      }, () => {
        if (current() && run === transport && !run.controller.signal.aborted) finish({ reconnect: true });
      });
    }
    function independent(permanent) {
      if (!current()) return close();
      if (mode === 'independent') return;
      mode = 'independent'; clearWatch(); window.clearInterval(pulseTimer);
      if (permanent) {
        queue?.abort(); channel?.close(); channel = null;
      }
      void stopTransport().then(() => {
        if (permanent) { release?.(); release = null; }
        if (current() && mode === 'independent') connect(false);
      });
    }
    function pulse() {
      if (!current()) return close();
      try { send('lease'); } catch (_) { independent(true); }
    }
    function message(event) {
      if (!current()) return close();
      const m = event.data;
      if (!m || m.v !== 1 || !uuid(m.sender) || m.sender === id) return;
      if (m.type === 'hello') {
        if (Object.keys(m).some(k => !['v', 'type', 'sender'].includes(k))) return;
        if (mode === 'leader') {
          try { pulse(); if (lastHint) send('hint', { ...lastHint, event: 'snapshot' }); }
          catch (_) { independent(true); }
        }
        return;
      }
      if (!['lease', 'hint', 'bye'].includes(m.type) || !uuid(m.term)
          || !Number.isSafeInteger(m.sequence) || m.sequence <= 0
          || !Number.isFinite(m.expiresAt) || m.expiresAt <= Date.now()
          || m.expiresAt > Date.now() + LEASE_MS + 1000
          || Object.keys(m).some(k => !['v', 'type', 'sender', 'term', 'sequence', 'expiresAt', 'revision', 'event'].includes(k))
          || retired.has(m.term) || mode === 'leader') return;
      if (lease?.term === m.term && (lease.sender !== m.sender || m.sequence <= lease.sequence)) return;
      if (m.type === 'bye') {
        if (lease?.term !== m.term) return;
        retired.add(m.term); lease = null;
        // The existing queued lock request takes over; no election polling.
        watch(Date.now() + JOIN_MS);
        return;
      }
      if (lease?.term !== m.term) {
        if (m.type !== 'lease') return;
        if (lease) retired.add(lease.term);
        if (retired.size > 32) return independent(true);
      }
      lease = { sender: m.sender, term: m.term, sequence: m.sequence };
      if (mode === 'independent') { mode = 'follower'; void stopTransport(); }
      else mode = 'follower';
      watch(m.expiresAt);
      if (m.type === 'hint' && validRevision(m.revision) && ['snapshot', 'change'].includes(m.event)) {
        received += 1; options.onHint(m.revision, m.event);
      }
    }

    options.signal.addEventListener('abort', close, { once: true });
    const supported = uuid(id) && /^[a-f0-9]{64}$/.test(options.key || '') && window.navigator.locks?.request
      && typeof window.BroadcastChannel === 'function';
    if (!supported) independent(true);
    else {
      try {
        channel = new BroadcastChannel('admin:catalog-sse:v1:' + options.key);
        channel.onmessage = message;
        channel.onmessageerror = () => independent(true);
        queue = new AbortController();
        watch(Date.now() + JOIN_MS);
        send('hello');
        void window.navigator.locks.request('admin:catalog-sse:v1:' + options.key,
          { signal: queue.signal }, async () => {
            if (!current() || !channel) return;
            clearWatch(); mode = 'leader'; term = window.crypto.randomUUID(); sequence = 0;
            await stopTransport();
            if (!current() || !channel || mode !== 'leader') return;
            await new Promise(resolve => {
              release = resolve;
              pulse();
              if (mode !== 'leader' || !current()) return;
              pulseTimer = window.setInterval(pulse, HEARTBEAT_MS);
              connect(true);
            });
          }).catch(error => {
            if (current() && error.name !== 'AbortError') independent(true);
          });
      } catch (_) { independent(true); }
    }
    return Object.freeze({ close, getState: () => ({ mode, hintsReceived: received, hintsSent: sent,
      heartbeatMs: HEARTBEAT_MS, leaseMs: LEASE_MS }) });
  }
  window.AdminCatalogStream = Object.freeze({ open });
})(window);
