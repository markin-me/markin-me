'use strict';

// Process-wide admission for explicit immutable-export requests, not a worker per
// tenant. No import-time timers, startup scans, autonomous retries or SQL writes.
const { performance } = require('perf_hooks');
const LIMITS = Object.freeze({ parallel: 1, queued: 64, perTenant: 4, waitMs: 250,
  pauseMs: 250, eventLoopMs: 50, retryBaseMs: 1000 });
const jobs = new Map(), tenants = new Map();
let running = 0, ingress = 0, foreground = 0, paused = false, timer = null, notBefore = 0, draining = false;
const busy = (code = 'EXPORT_QUEUE_BUSY') => Object.assign(new Error(code), { code,
  retryAfterMs: LIMITS.retryBaseMs + Math.floor(Math.random() * LIMITS.retryBaseMs) });

function drop(job) {
  jobs.delete(job.key);
  const group = tenants.get(job.tenant);
  if (group) {
    const index = group.indexOf(job);
    if (index >= 0) group.splice(index, 1);
    if (!group.length) tenants.delete(job.tenant);
  }
  clearTimeout(job.timeout);
  job.signal?.removeEventListener('abort', job.cancel);
}
function wake() {
  if (timer || draining || running >= LIMITS.parallel || !tenants.size || paused || foreground) return;
  timer = setTimeout(() => { timer = null; void drain(); }, Math.max(0, notBefore - performance.now()));
  timer.unref?.();
}
async function drain() {
  if (draining || running >= LIMITS.parallel || paused || foreground || !tenants.size) return;
  if (performance.now() < notBefore) { wake(); return; }
  draining = true;
  const entered = performance.now();
  // Yield to normal CRM work and refuse admission after an overloaded loop turn.
  await new Promise(resolve => setImmediate(resolve));
  draining = false;
  if (paused || foreground || running || !tenants.size) return;
  if (performance.now() - entered > LIMITS.eventLoopMs) {
    notBefore = performance.now() + LIMITS.pauseMs; wake(); return;
  }
  const [tenant, group] = tenants.entries().next().value;
  const job = group.shift();
  tenants.delete(tenant);
  // Round-robin tenant order; within a tenant rotate stores before serving a
  // second job from the previous store. Auth scope remains part of the job key.
  if (group.length) {
    const nextStore = group.findIndex(next => next.store !== job.store);
    if (nextStore > 0) group.unshift(...group.splice(nextStore, 1));
    tenants.set(tenant, group);
  }
  clearTimeout(job.timeout);
  job.started = true;
  running++;
  try {
    if (job.signal?.aborted) throw busy('EXPORT_ABORTED');
    job.resolve(await job.work(job.signal));
  } catch (error) { job.reject(error); }
  finally {
    drop(job); running--;
    notBefore = performance.now() + LIMITS.pauseMs;
    wake();
  }
}

function run({ tenantId, storeId, scopeHash, resource, signal }, work) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || !Number.isSafeInteger(storeId) || storeId <= 0
      || !/^[a-f0-9]{64}$/.test(scopeHash || '') || !/^[a-z0-9:-]{1,128}$/.test(resource || '')
      || typeof work !== 'function') return Promise.reject(busy('INVALID_EXPORT_JOB'));
  if (signal?.aborted) return Promise.reject(busy('EXPORT_ABORTED'));
  const tenant = String(tenantId), key = [tenant, storeId, scopeHash, resource].join(':');
  // Do not join promises with independently revocable authorization/signals.
  // An identical request retries/discovers the same durable generation instead.
  if (jobs.has(key)) return Promise.reject(busy('EXPORT_QUEUE_DUPLICATE'));
  if (jobs.size >= LIMITS.queued + LIMITS.parallel || (tenants.get(tenant)?.length || 0) >= LIMITS.perTenant
      || paused || foreground) return Promise.reject(busy());
  return new Promise((resolve, reject) => {
    const job = { key, tenant, store: storeId, signal, work, resolve, reject, started: false };
    job.cancel = () => {
      if (!job.started) { drop(job); reject(busy('EXPORT_ABORTED')); wake(); }
      // Running work retains the slot until it settles, even after HTTP abort.
      // It receives the original signal; cancellation cannot create two builds.
    };
    job.timeout = setTimeout(() => {
      if (!job.started) { drop(job); reject(busy()); wake(); }
    }, LIMITS.waitMs);
    signal?.addEventListener('abort', job.cancel, { once: true });
    jobs.set(key, job);
    const group = tenants.get(tenant) || []; group.push(job); tenants.set(tenant, group);
    wake();
  });
}
function beginForeground() {
  foreground++;
  let ended = false;
  return () => { if (!ended) { ended = true; foreground--; wake(); } };
}
module.exports = { run, beginForeground, limits: LIMITS,
  trackForeground(req, res, next) {
    if (process.env.CATALOG_EXPORT_CAPTURE !== '1' && process.env.CATALOG_EXPORT_PUBLISHING !== '1'
        && process.env.CATALOG_EXPORT_LIGHT !== '1' && process.env.CATALOG_EXPORT_CRM_LIGHT !== '1') return next();
    // This middleware only counts demand; it never delays/aborts a working API.
    // SSE/long polling must not permanently hold the foreground counter.
    if (req.path === '/admin/catalog/passport-exports' || req.path.startsWith('/admin/catalog/passport-exports/')) {
      // Bound even the verified-scope/auth work preceding queue admission. This
      // is admission control, not authorization; admitted requests still pass
      // the original auth + granular RBAC + scope checks on every page.
      if (ingress >= LIMITS.parallel || running >= LIMITS.parallel || paused || foreground) {
        res.set('Cache-Control', 'private, no-store');
        res.set('Retry-After', String(Math.ceil(busy().retryAfterMs / 1000)));
        return res.status(503).json({ ok: false, error: 'EXPORT_QUEUE_BUSY' });
      }
      ingress++;
      const done = () => { ingress--; res.removeListener('finish', done); res.removeListener('close', done); };
      res.once('finish', done); res.once('close', done);
      return next();
    }
    if (String(req.headers.accept || '').includes('text/event-stream')
        || /\/(stream|events|wait)$/.test(req.path)) return next();
    const end = beginForeground();
    const finish = () => { end(); res.removeListener('finish', finish); res.removeListener('close', finish); };
    res.once('finish', finish); res.once('close', finish);
    next();
  },
  pause(value = true) { paused = Boolean(value); if (!paused) wake(); },
  allowsPreparation() { return !paused && foreground === 0; },
  state() { return { running, ingress, queued: jobs.size - running, tenants: tenants.size, foreground, paused }; } };
