'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const orders = fs.readFileSync(path.join(__dirname, '../static/js/orders.js'), 'utf8');
const marker = 'const serviceWorkerScript = `';
const template = server.slice(server.indexOf(marker) + marker.length, server.indexOf("`;\napp.get('/sw.js'") > 0
  ? server.indexOf("`;\napp.get('/sw.js'") : server.indexOf("`;\r\napp.get('/sw.js'"));
const worker = vm.runInNewContext('`' + template
  .replace('${JSON.stringify(SERVICE_WORKER_VERSION)}', '"test-v2"')
  .replace('${JSON.stringify(serviceWorkerPrecacheUrls)}', '["https://app.test/static/app.js"]') + '`');

function response(body, url, headers = {}) {
  const result = new Response(body, { headers });
  Object.defineProperties(result, { url: { value: url }, type: { value: 'basic' } });
  return result;
}
function environment() {
  const listeners = new Map(), records = new Map();
  const env = { failNetwork: false, requests: [], records, navigations: [], clients: [] };
  const caches = {
    async keys() { return [...records.keys()]; },
    async delete(name) { return records.delete(name); },
    async open(name) {
      if (!records.has(name)) records.set(name, new Map());
      const entries = records.get(name);
      const key = request => typeof request === 'string' ? request : request.url;
      return { async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, value) { entries.set(key(request), value); },
        async keys() { return [...entries.keys()]; }, async delete(request) { return entries.delete(key(request)); },
        async add(url) { entries.set(url, await env.fetch(url)); } };
    },
  };
  env.fetch = async (request, options = {}) => {
    const url = typeof request === 'string' ? new URL(request, 'https://app.test').href : request.url;
    env.requests.push({ url, options });
    if (env.failNetwork) throw new TypeError('Failed to fetch');
    if (new URL(url).pathname === '/pwa/neutral/courier') {
      return response('<html data-local-access="pending">Neutral shell</html>', url,
        { 'Content-Type': 'text/html', 'X-PWA-Neutral-Shell': '1' });
    }
    if (new URL(url).pathname.startsWith('/static/')) return response('static', url, { 'Content-Type': 'application/javascript' });
    return response('<html>personalized online</html>', url, { 'Content-Type': 'text/html' });
  };
  const sandbox = vm.createContext({ URL, Response, Promise, caches, fetch: (...args) => env.fetch(...args),
    self: { location: { origin: 'https://app.test' }, addEventListener: (type, handler) => listeners.set(type, handler),
      skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => env.clients } } });
  vm.runInContext(worker, sandbox);
  env.lifecycle = async type => { let pending; listeners.get(type)({ waitUntil: value => { pending = value; } }); await pending; };
  env.request = async (pathname, mode = 'navigate') => {
    let result; listeners.get('fetch')({ request: { url: 'https://app.test' + pathname, method: 'GET', mode },
      respondWith: value => { result = value; } });
    return result === undefined ? null : await result;
  };
  return env;
}

test('static assets remain available offline and private APIs are not intercepted', async () => {
  const env = environment(); await env.lifecycle('install'); env.failNetwork = true;
  assert.equal(await (await env.request('/static/app.js', 'cors')).text(), 'static');
  assert.equal(await env.request('/api/admin/orders', 'cors'), null);
});

test('old personalized pages are ignored for all private navigation URLs', async () => {
  const env = environment(); await env.lifecycle('install');
  env.records.set('admin-pages-old', new Map([['https://app.test/dashboard/orders', new Response('OWNER SECRET')]]));
  env.failNetwork = true;
  for (const url of ['/dashboard/orders', '/dashboard/orders?role=manager', '/dashboard/team', '/login']) {
    const result = await env.request(url); assert.equal(result.status, 503);
    assert.equal((await result.text()).includes('OWNER SECRET'), false);
  }
});

test('courier offline navigation uses only the marked neutral shell', async () => {
  const env = environment(); await env.lifecycle('install'); env.failNetwork = true;
  env.records.set('admin-pages-old', new Map([['/dashboard/courier-screen', new Response('USER A OWNER SECRET')]]));
  const result = await env.request('/dashboard/courier-screen?view=another');
  assert.equal(result.headers.get('X-PWA-Neutral-Shell'), '1');
  assert.match(await result.text(), /data-local-access="pending"/);
});

test('activation removes unsafe HTML caches and preserves unrelated image caches', async () => {
  const env = environment(); await env.lifecycle('install');
  env.clients.push({ url: 'https://app.test/dashboard/orders', navigate: async url => env.navigations.push(url) });
  for (const name of ['admin-pages-old', 'html-courier-screen-v1', 'chat-images-v1', 'markinme-images-v1']) env.records.set(name, new Map());
  await env.lifecycle('activate');
  assert.equal(env.records.has('admin-pages-old'), false); assert.equal(env.records.has('html-courier-screen-v1'), false);
  assert.equal(env.records.has('chat-images-v1'), true); assert.equal(env.records.has('markinme-images-v1'), true);
  assert.equal(worker.includes('deleteDatabase'), false);
  assert.equal(env.navigations[0], 'https://app.test/dashboard/orders');
});

test('online private HTML and HTTP authorization refusals are never cached or replaced with an offline response', async () => {
  const env = environment(); await env.lifecycle('install');
  assert.match(await (await env.request('/dashboard/orders')).text(), /personalized online/);
  assert.equal(env.requests.at(-1).options.cache, 'no-store');
  for (const status of [401, 403]) {
    env.fetch = async () => new Response('denied', { status });
    assert.equal((await env.request('/dashboard/courier-screen')).status, status);
  }
  for (const entries of env.records.values()) assert.equal(entries.has('https://app.test/dashboard/orders'), false);
});

function functionSource(name) {
  const start = orders.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  const next = /\n  (?:async )?function /g; next.lastIndex = start + 12;
  const end = next.exec(orders)?.index ?? orders.length;
  return orders.slice(start, end);
}
function projection(allowed = true, bases = []) {
  const queue = [{ id: 'unchanged-id', orderId: 7, type: 'status', state: 'pending', sequence: 1,
    request: { method: 'PUT', body: { status_id: 4 } }, optimisticOrder: { id: 7, customer_name: 'OWNER SECRET', customer_phone: 'PRIVATE', status_id: 4 } }];
  const sandbox = vm.createContext({ isCourierWorkspace: true, workspaceAccessIsCurrent: () => allowed,
    state: { orders: bases, activeOrderId: null }, courierOfflineState: { queue, syncing: false, online: false },
    refreshCourierOrderQueueButtons() {}, syncOrderPaymentFooter() {} });
  for (const name of ['overlayCourierShadowOrder', 'applyCourierShadowOrdersToState', 'getCourierStatusQueueState']) vm.runInContext(functionSource(name), sandbox);
  return { sandbox, queue, setAllowed(value) { allowed = value; } };
}

test('queue snapshots cannot manufacture a visible order missing from the authorized view', () => {
  const { sandbox, queue } = projection(true, []); const before = JSON.stringify(queue);
  sandbox.applyCourierShadowOrdersToState(); assert.equal(sandbox.state.orders.length, 0);
  assert.equal(sandbox.getCourierStatusQueueState(7), null); assert.equal(JSON.stringify(queue), before);
});

test('Manager base data is preserved and only a minimal waiting indicator is projected', () => {
  const base = { id: 7, customer_name: 'MANAGER BASE', status_id: 1 };
  const { sandbox, queue } = projection(true, [base]); const before = JSON.stringify(queue);
  assert.equal(sandbox.overlayCourierShadowOrder(base), base);
  assert.equal(sandbox.getCourierStatusQueueState(7).mode, 'queued');
  assert.equal(sandbox.state.orders[0].customer_phone, undefined);
  assert.equal(JSON.stringify(queue), before);
});

test('revoked context exposes neither a queue projection nor a base record', () => {
  const { sandbox } = projection(false, [{ id: 7 }]);
  assert.equal(sandbox.overlayCourierShadowOrder({ id: 7 }), null);
  assert.equal(sandbox.getCourierStatusQueueState(7), null);
});

test('logout/access-view changes hide a previously visible projection until fresh authorization', () => {
  const view = projection(true, [{ id: 7, customer_name: 'permitted' }]);
  assert.equal(view.sandbox.getCourierStatusQueueState(7).mode, 'queued');
  view.setAllowed(false);
  assert.equal(view.sandbox.getCourierStatusQueueState(7), null);
  assert.equal(view.sandbox.overlayCourierShadowOrder({ id: 7 }), null);
  view.setAllowed(true);
  assert.equal(view.sandbox.getCourierStatusQueueState(7).mode, 'queued');
  assert.equal(view.sandbox.state.orders[0].customer_phone, undefined);
});

test('pending payment projects only a waiting state without copying its stored full order', () => {
  const base = { id: 7, is_paid: 0, customer_name: 'permitted' };
  const view = projection(true, [base]); view.queue[0].type = 'payment';
  const before = JSON.stringify(view.queue);
  vm.runInContext(functionSource('hasPendingCourierPayment'), view.sandbox);
  vm.runInContext(functionSource('getOrderPaymentActionLabel'), view.sandbox);
  assert.equal(view.sandbox.hasPendingCourierPayment(base), true);
  assert.equal(view.sandbox.getOrderPaymentActionLabel(base), 'В очереди');
  assert.equal(base.is_paid, 0); assert.equal(base.customer_phone, undefined);
  assert.equal(JSON.stringify(view.queue), before);
});

test('the neutral shell remains gated when there is no admissible local confirmation', () => {
  const layout = fs.readFileSync(path.join(__dirname, '../views/layouts/app.ejs'), 'utf8');
  assert.match(layout, /<html lang="ru" data-local-access="pending">/);
  assert.match(layout, /html:not\(\[data-local-access="active"\]\)/);
  assert.match(layout, /#adminLocalAccessFailure \{ display: none; \}/);
  assert.match(layout, /html\[data-local-access="denied"\] #adminLocalAccessFailure/);
  assert.match(layout, /html\[data-local-access="unavailable"\] #adminLocalAccessFailure/);
  assert.match(layout, /<p id="adminLocalAccessChecking">Загрузка…<\/p>/);
  assert.match(layout, /window\.AdminServerContextPromise = confirmServerAccessContext/);
  assert.match(layout, /window\.AdminAccessContextPromise = loadAccessContext\(true\)/);
  assert.match(layout, /repository\.isActive\(\)/);
  assert.match(server, /res\.render\('pages\/courier-screen', \{ tenant: null, currentPath: '\/dashboard\/courier-screen' \}\)/);
});
