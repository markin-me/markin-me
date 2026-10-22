'use strict';

const crypto = require('crypto');
const exportsService = require('../../services/catalog-passport-exports');
const { loadAccessContext } = require('../helpers/adminAccessContext');

module.exports = function registerCatalogPassportExports(router, { db, helpers, hasCatalogStoreScope, prepareAdminProductPassport }) {
  const service = exportsService.create({ db });
  const transfer = exportsService.createTransfers({ db, prepareAdminProductPassport });
  const prefix = '/admin/catalog/passport-exports';
  async function scope(req) {
    const rawStore = req.headers['x-store-id'], epoch = req.headers['x-offline-epoch'];
    if (typeof rawStore !== 'string' || !/^[1-9][0-9]*$/.test(rawStore) || !Number.isSafeInteger(Number(rawStore))
        || typeof epoch !== 'string' || !/^[a-f0-9]{32}$/.test(epoch)) throw Object.assign(new Error('INVALID_EXPORT_SCOPE'), { status: 400 });
    const tenantId = Number(helpers.getTenantId(req)), storeId = Number(helpers.getStoreId(req));
    if (!req._authVerified || !req._authRecord?.decoded || Number(rawStore) !== storeId
        || req.permission?.key !== 'products.catalog.read' || !['all', 'stores'].includes(req.permission.accessRule)) {
      throw Object.assign(new Error('EXPORT_ACCESS_DENIED'), { status: 403 });
    }
    if (!await hasCatalogStoreScope(tenantId, storeId)) throw Object.assign(new Error('STORE_NOT_FOUND'), { status: 404 });
    // Recompute from verified server identity + current grants; client context is
    // never an authorization proof. Local epoch only narrows cache reuse.
    const context = await loadAccessContext(db, req._authRecord.decoded, req._authRecord);
    const local = context.local_context;
    if (!local || local.tenantId !== tenantId || !context.stores.some(store => Number(store.id) === storeId)
        || req.headers['x-access-view-id'] !== local.accessViewId) throw Object.assign(new Error('EXPORT_ACCESS_CONTEXT_CHANGED'), { status: 403 });
    const tokenBinding = crypto.createHash('sha256').update(String(req.headers.authorization || '')).digest('hex');
    const hash = exportsService.hash(exportsService.encode([1, tenantId, local.principal, local.activeRoleId,
      local.accessViewId, local.authVersion, storeId, epoch, tokenBinding, 'products']));
    const canCaptureCost = context.permissions.some(grant => grant === '*'
      || (grant.key === 'products.cost.read' && ['all', 'stores'].includes(grant.access_rule)));
    return { tenantId, storeId, hash, canCaptureCost };
  }
  const route = handler => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', disconnect); res.once('close', disconnect);
    const timer = setTimeout(() => controller.abort(), 7000);
    // Foreground/export admission is separate from browser idle. Existing CRM
    // APIs never wait for this queue. No retry is launched by the server.
    try {
      const access = await scope(req);
      if (controller.signal.aborted) throw new Error('EXPORT_ABORTED');
      if (Object.keys(req.query).length) throw Object.assign(new Error('INVALID_EXPORT_QUERY'), { status: 400 });
      const result = await handler(req, access, controller.signal);
      if (controller.signal.aborted) return;
      const body = JSON.stringify({ ok: true, ...result });
      if (Buffer.byteLength(body) > 64 * 1024) throw new Error('EXPORT_RESPONSE_LIMIT');
      res.type('application/json').send(body);
    } catch (error) {
      if (controller.signal.aborted) { if (!res.destroyed) res.status(504).json({ ok: false, error: 'EXPORT_DEADLINE' }); return; }
      const code = error.code || error.message;
      const known = /^(EXPORT_|CAPTURE_|WRITER_|NEEDS_|INVALID_|CHUNK_|STORE_|PRODUCT_)/.test(code || '');
      const status = error.status || (/COST_PERMISSION_REQUIRED/.test(code) ? 403 : /^EXPORT_QUEUE_/.test(code) ? 503 : /^INVALID_/.test(code) ? 400 : /NOT_FOUND/.test(code) ? 404 : /EXPIRED/.test(code) ? 410
        : code === 'EXPORT_DEADLINE' ? 504
          : /DISABLED|PRIVATE_FIELD|COVERAGE_INCOMPLETE|REVISION_CHANGED|NOT_INITIALIZED|NEEDS_PARTITIONING|BUSY|BUDGET|INCOMPLETE_DTO|NOT_BUILDABLE|NOT_SEALED|DEPENDENCY|UNSUPPORTED|PRIMARY_KEY_REQUIRED|CURSOR_STALLED/.test(code) ? 409 : 500);
      // No SQL, DTO, IDs, token or query parameters in diagnostics.
      if (status === 500) console.error('CATALOG_EXPORT_FAILED:', error.code || error.name);
      if (status === 503) res.set('Retry-After', String(Math.max(1, Math.ceil((error.retryAfterMs || 1000) / 1000))));
      res.status(status).json({ ok: false, error: known ? code : 'CATALOG_EXPORT_FAILED',
        ...(code === 'NEEDS_PARTITIONING' ? { state: 'NEEDS_PARTITIONING' } : {}),
        ...(code === 'EXPORT_FULL_CAPTURE_BLOCKED' ? { state: 'BLOCKED',
          reason: 'RAW_GRAPH_PARITY_AND_PURE_DERIVATION_REQUIRED', passportComplete: false } : {}) });
    } finally {
      clearTimeout(timer); req.removeListener('aborted', disconnect); res.removeListener('close', disconnect);
    }
  };
  router.post(prefix + '/light/targets', route((req, access, signal) => {
    if (Object.keys(req.body || {}).some(key => key !== 'after')) throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
    return transfer.targets(access, req.body?.after, signal);
  }));
  router.post(prefix + '/light/start', route((req, access, signal) => {
    if (Object.keys(req.body || {}).some(key => !['productId', 'firstStage'].includes(key))
        || (req.body?.firstStage !== undefined && typeof req.body.firstStage !== 'boolean')) throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
    return transfer.start(access, req.body?.productId, signal, req.body?.firstStage === true);
  }));
  router.post(prefix + '/light/:id/chunks', route((req, access, signal) => {
    if (Object.keys(req.body || {}).some(key => key !== 'after')) throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
    return transfer.readBatch(access, req.params.id, req.body?.after, signal);
  }));
  router.post(prefix + '/light/:id/advance', route((req, access, signal) => {
    if (Object.keys(req.body || {}).some(key => key !== 'step')) throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
    return transfer.advance(access, req.params.id, req.body?.step, signal);
  }));
  router.get(prefix + '/light/:id/chunks/:chunk', route((req, access, signal) => {
    if (!/^(0|[1-9][0-9]*)$/.test(req.params.chunk)) throw Object.assign(new Error('INVALID_CHUNK'), { status: 400 });
    return transfer.read(access, req.params.id, Number(req.params.chunk), signal);
  }));
  router.post(prefix + '/light/:id/validate', route((req, access, signal) => transfer.validate(access, req.params.id, signal)));
  router.get(prefix + '/policy', route(async () => ({ policy: exportsService.policy() })));
  router.get(prefix + '/latest', route(async (req, access, signal) => {
    if (!exportsService.policy().clientDownload) throw Object.assign(new Error('EXPORT_DOWNLOAD_DISABLED'), { status: 409 });
    return { snapshot: await service.latest(access, signal) };
  }));
  router.post(prefix, route(async (req, access, signal) => {
    if (req.body?.projection === 'passport-raw-v1') {
      // Raw product/ingredient rows include cost fields. Do not broaden catalog
      // read into cost access just because raw chunks are server-side only.
      if (!access.canCaptureCost) throw Object.assign(new Error('EXPORT_RAW_COST_PERMISSION_REQUIRED'), { status: 403 });
      if (!Number.isSafeInteger(req.body.productId) || req.body.productId <= 0
          || Object.keys(req.body).some(k => !['projection', 'productId'].includes(k))) {
        throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
      }
      return service.createProductRaw(access, req.body.productId, signal);
    }
    if (req.body?.projection === 'full-product-passport-v1') {
      if (!Number.isSafeInteger(req.body.productId) || req.body.productId <= 0
          || Object.keys(req.body).some(k => !['projection', 'productId'].includes(k))) {
        throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
      }
      throw Object.assign(new Error('EXPORT_FULL_CAPTURE_BLOCKED'), { status: 409 });
    }
    if (req.body?.projection !== 'catalog-membership-v1' || Object.keys(req.body).some(k => k !== 'projection')) {
      throw Object.assign(new Error('INVALID_EXPORT_BODY'), { status: 400 });
    }
    return service.createMembership(access, signal);
  }));
  router.post(prefix + '/:id/publish', route((req, access, signal) => service.publishMembership(access, req.params.id, signal)));
  router.get(prefix + '/:id/manifest', route(async (req, access, signal) => {
    if (!exportsService.policy().clientDownload) throw Object.assign(new Error('EXPORT_DOWNLOAD_DISABLED'), { status: 409 });
    return service.manifest(access, req.params.id, undefined, signal);
  }));
  router.get(prefix + '/:id/chunks/:kind/:part/:chunk', route(async (req, access, signal) => {
    if (!exportsService.policy().clientDownload) throw Object.assign(new Error('EXPORT_DOWNLOAD_DISABLED'), { status: 409 });
    if (!/^(0|[1-9][0-9]*)$/.test(req.params.chunk)) throw Object.assign(new Error('INVALID_CHUNK'), { status: 400 });
    return service.readChunk(access, req.params.id, req.params.kind, req.params.part, Number(req.params.chunk), signal);
  }));
  router.post(prefix + '/:id/validate', route((req, access, signal) => service.validate(access, req.params.id, signal)));
  router.post(prefix + '/gc', route((req, access, signal) => {
    if (!exportsService.policy().capture) throw Object.assign(new Error('EXPORT_CAPTURE_DISABLED'), { status: 409 });
    return service.gc(access, signal);
  }));
};
