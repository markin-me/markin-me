'use strict';

// Definitions only: run manually. No application server or real database is started.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const browser = require('../api/helpers/browserSession');
const access = require('../api/helpers/adminAccessContext');
const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const claims = { userId: 7, tenantId: 3, activeRoleId: 12, authVersion: 2, authStage: 'active' };
const token = () => jwt.sign(claims, secret, { expiresIn: '1h' });
function request(extra = {}) {
  return { method: 'POST', secure: true, headers: {}, cookies: {}, query: {}, get: () => 'app.test', ...extra };
}
function response() {
  return { locals: {}, statusCode: 200, cookies: [], cleared: [], status(code) { this.statusCode = code; return this; },
    cookie(...args) { this.cookies.push(args); }, clearCookie(...args) { this.cleared.push(args); },
    json(body) { this.body = body; return this; }, type() { return this; }, send(body) { this.body = body; return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
    redirect(status, location) { this.statusCode = status; this.location = location; },
    once() {}, removeListener() {} };
}
function loadMiddleware(db) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/middleware/auth.js'), 'utf8'), {
    module, exports: module.exports, process, console, Map, Set,
    require(name) { return name === '../../db' ? db : name === '../helpers/browserSession' ? browser : require(name); },
  });
  return module.exports;
}
function database(changes = {}) {
  const user = { id: 7, tenant_id: 3, is_active: 1, tenant_active: 1, employee_status: 'active', auth_version: 2, ...changes };
  const queries = [];
  return { queries, async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes('FROM app_users')) return values[1] === 3 ? [[user]] : [[]];
    if (sql.includes('FROM user_roles')) return [[{id:12,name:'Manager',is_owner:0}, {id:13,name:'Owner',is_owner:1}]];
    if (sql.includes('FROM role_permissions')) return [[{permission_key:'orders.access',access_rule:'stores'}]];
    if (sql.includes('FROM user_stores')) return [[{id:9,name:'Allowed unit'}]];
    throw new Error('Unexpected SQL');
  } };
}

test('navigation cookie uses the existing JWT, exact path, host-only and matching logout attributes', () => {
  const req = request(), res = response(), value = token(); browser.issue(req, res, value);
  const [name, saved, opts] = res.cookies[0];
  assert.equal(name, browser.COOKIE_NAME); assert.equal(saved, value);
  assert.equal(opts.httpOnly, true); assert.equal(opts.secure, true); assert.equal(opts.sameSite, 'lax');
  assert.equal(opts.path, '/dashboard'); assert.equal(opts.domain, undefined);
  assert.equal(opts.expires.getTime(), jwt.verify(value, secret).exp * 1000);
  browser.clear(req, res);
  assert.deepEqual(res.cleared[0], [name, {httpOnly:true,secure:true,sameSite:'lax',path:'/dashboard'}]);
});

test('production refuses insecure HTTP, including browser-session endpoints', () => {
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const req = request({secure:false,socket:{remoteAddress:'198.51.100.4'}}), res = response();
    browser.requireTransport(req, res, () => assert.fail('HTTP must not pass'));
    assert.equal(res.statusCode, 426); assert.throws(() => browser.issue(req, response(), token()), /HTTPS_REQUIRED/);
  } finally { if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before; }
});

test('cookie-changing endpoints reject cross-origin requests but read-only HTML may be reached from external links', () => {
  const req = request({headers:{origin:'https://evil.test','sec-fetch-site':'cross-site'}}), res = response();
  browser.sameOrigin(req, res, () => assert.fail('Cross-origin mutation'));
  assert.equal(res.statusCode, 403);
  let passed = false; browser.requireTransport({...req,method:'GET'}, response(), () => { passed = true; });
  assert.equal(passed, true);
});

test('role-selection JWT does not establish a browser navigation session', () => {
  const res = response(); browser.issue(request(), res, jwt.sign({...claims,authStage:'role-selection'}, secret, {expiresIn:'1h'}));
  assert.equal(res.cookies.length, 0); assert.equal(res.cleared.length, 1);
});

for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
  test(method + ' API does not authenticate using either navigation or legacy token cookies', async () => {
    const db = database(), middleware = loadMiddleware(db), value = token();
    const req = request({method,cookies:{[browser.COOKIE_NAME]:value,token:value}}), res = response();
    await middleware.authMiddleware(req, res, () => assert.fail('Cookie-authenticated API'));
    assert.equal(res.statusCode, 401); assert.equal(db.queries.length, 0);
  });
}

test('query JWT cannot authorize a mutating API request or substitute for the HTML cookie', async () => {
  const middleware = loadMiddleware(database());
  for (const req of [request({query:{token:token()}}), request({body:{token:token()}}), request({method:'GET',_htmlAuthorization:true,query:{token:token()}})]) {
    const res = response(); await middleware.authMiddleware(req, res, () => assert.fail('Query token accepted'));
    assert.equal(res.statusCode, 401);
  }
});

for (const [name, changes, status] of [['blocked',{employee_status:'blocked'},403], ['archived',{employee_status:'archived'},403],
  ['tenant blocked',{tenant_active:0},403], ['revoked',{auth_version:3},401]]) {
  test('HTML authorization denies ' + name + ' sessions before rendering', async () => {
    const middleware = loadMiddleware(database(changes)), res = response();
    res.locals = {adminHtml:true,adminReturnPath:'/dashboard/orders'};
    await middleware.authMiddleware(request({method:'GET',_htmlAuthorization:true,cookies:{[browser.COOKIE_NAME]:token()}}), res,
      () => assert.fail('Forbidden private HTML'));
    assert.equal(res.statusCode, status === 401 ? 303 : status);
    if (status === 403) { assert.equal(res.view,'pages/auth'); assert.ok(res.body.pageAccessError); }
  });
}

test('a signed token cannot substitute another tenant for the user lookup', async () => {
  const db = database(), middleware = loadMiddleware(db), res = response();
  const value = jwt.sign({...claims,tenantId:4},secret,{expiresIn:'1h'});
  await middleware.authMiddleware(request({headers:{authorization:'Bearer '+value}}),res,() => assert.fail('Cross-tenant user'));
  assert.equal(res.statusCode,401);
  assert.deepEqual(Array.from(db.queries[0].values),[7,4]);
});

test('expired JWT and invalid active role cannot render HTML', async () => {
  const middleware = loadMiddleware(database());
  for (const value of [jwt.sign(claims,secret,{expiresIn:-1}), jwt.sign({...claims,activeRoleId:99},secret,{expiresIn:'1h'})]) {
    const res = response();
    await middleware.authMiddleware(request({method:'GET',_htmlAuthorization:true,cookies:{[browser.COOKIE_NAME]:value}}), res,
      () => assert.fail('Invalid session accepted'));
    assert.ok([401,403].includes(res.statusCode));
  }
});

test('HTML reuses verified user/roles; Manager never inherits assigned Owner permissions', async () => {
  const db = database(), middleware = loadMiddleware(db), req = request({headers:{authorization:'Bearer '+token()}}), res = response();
  let admitted = 0;
  await middleware.authMiddleware(req,res,() => { admitted++; });
  assert.equal(admitted,1); assert.equal(req.user.activeRoleId,12); assert.equal(req.user.fullAccess,false);
  await middleware.authMiddleware(req,res,() => { admitted++; }); assert.equal(db.queries.length,2);
  const context = await access.loadAccessContext(db,req._authRecord.decoded,req._authRecord);
  assert.equal(db.queries.length,4); assert.equal(context.active_role.id,12);
  assert.deepEqual(context.permissions,[{key:'orders.access',access_rule:'stores'}]);
  assert.equal(db.queries.find(item=>item.sql.includes('FROM role_permissions')).values[1],12);
});

test('shared accessViewId is stable for identical grants and changes with scope, role, or access rule', () => {
  const principal = {type:'user',id:'7'}, grants = [{key:'orders.access',access_rule:'stores'}];
  const base = access.localAccessContext({...claims,exp:9999999999},principal,grants,[{id:9}]);
  assert.equal(access.localAccessContext({...claims,exp:9999999999},principal,grants,[{id:9}]).accessViewId,base.accessViewId);
  for (const context of [access.localAccessContext({...claims,exp:9999999999,activeRoleId:13},principal,grants,[{id:9}]),
    access.localAccessContext({...claims,exp:9999999999},principal,grants,[{id:10}]),
    access.localAccessContext({...claims,exp:9999999999},principal,[{key:'orders.access',access_rule:'own'}],[{id:9}])]) {
    assert.notEqual(context.accessViewId,base.accessViewId);
  }
});

test('all nine dashboard renderers are behind the HTML gate; neutral courier shell is separate', () => {
  const server = fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const gate = server.indexOf("app.use('/dashboard', browserSession.requireTransport");
  for (const page of ['cash','products','orders','courier-screen','new-order','clients','chat','team','settings']) {
    assert.ok(gate > 0 && gate < server.indexOf("app.get('/dashboard/"+page+"'"));
  }
  assert.match(server,/item\.parentId === null && item\.navKey === navKey/);
  assert.match(server,/item\.key === node\.accessKey/);
  assert.match(server,/res\.locals\.serverAccessContext =/);
  const login = fs.readFileSync(path.join(__dirname,'../views/pages/auth.ejs'),'utf8');
  assert.match(login,/if \(pageAccessError\) window\.AdminLocalRepository\.reset\(\{forget:true,reason:'server-refusal'\}\)/);
  assert.match(login,/mode === 'login' && !pageAccessError/);
});

function logoutHandler(db) {
  const routes = new Map();
  const router = { use() {}, get() {}, post(route, ...handlers) { routes.set(route, handlers.at(-1)); } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/auth.js'),'utf8'), {
    module, exports:module.exports, process, console, Map,
    require(name) {
      if (name === 'express') return {Router:() => router};
      if (name === './middleware/auth') return {...loadMiddleware(db),loadLegacyOwner:async () => null};
      if (name === './helpers/adminAccessContext') return access;
      if (name === './helpers/browserSession') return browser;
      if (name === './helpers/employeeIdentity') return {};
      return require(name);
    },
  });
  module.exports({db,helpers:{}});
  return routes.get('/logout');
}

test('logout revokes existing auth_version once; a retry cannot revoke the next generation', async () => {
  let version = 2, updates = 0;
  const db = {async query(sql, values) {
    assert.match(sql,/UPDATE app_users SET auth_version=auth_version\+1/);
    assert.equal(values[0],3); assert.equal(values[1],7);
    const changed = values[2] === version;
    if (changed) { version++; updates++; }
    return [{affectedRows:changed ? 1 : 0}];
  }};
  const handler = logoutHandler(db), value = token();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = response(); await handler(request({headers:{authorization:'Bearer '+value}}),res);
    assert.equal(res.body.ok,true); assert.equal(res.body.revocation,'all-user-sessions');
    assert.equal(res.cleared[0][1].path,'/dashboard');
  }
  assert.equal(version,3); assert.equal(updates,1);
});

test('logout cannot use a cookie as Bearer and acknowledges an already expired token without SQL', async () => {
  const handler = logoutHandler({async query() { assert.fail('Unexpected logout SQL'); }});
  const cookieResponse = response();
  await handler(request({cookies:{[browser.COOKIE_NAME]:token()}}),cookieResponse);
  assert.equal(cookieResponse.statusCode,401);
  const res = response();
  await handler(request({headers:{authorization:'Bearer '+jwt.sign(claims,secret,{expiresIn:-1})}}),res);
  assert.equal(res.body.ok,true); assert.equal(res.body.revocation,'already-invalid');
});

test('legacy tenant without app_users owner reports expiry-only revocation honestly', async () => {
  const handler = logoutHandler({async query(sql) {
    assert.match(sql,/SELECT email FROM ten_tenants/); return [[{email:'legacy@example.invalid'}]];
  }});
  const res = response();
  const value = jwt.sign({tenantId:3,loginType:'tenant',role:'owner'},secret,{expiresIn:'1h'});
  await handler(request({headers:{authorization:'Bearer '+value}}),res);
  assert.equal(res.body.ok,true); assert.equal(res.body.revocation,'legacy-expiry-only');
});

test('late logout closes only older streams, while administrative revocation still closes all', async () => {
  let version = 2;
  const db = {async query(sql) {
    if (sql.includes('FROM app_users')) return [[{id:7,tenant_id:3,is_active:1,tenant_active:1,employee_status:'active',auth_version:version}]];
    return [[{id:12,name:'Manager',is_owner:0}]];
  }};
  const middleware = loadMiddleware(db);
  const stream = () => Object.assign(response(), {ended:false,getHeader:()=>'text/event-stream',end(){this.ended=true;}});
  const older = stream(), newer = stream();
  await middleware.authMiddleware(request({headers:{authorization:'Bearer '+token()}}),older,()=>{});
  version = 3;
  const value = jwt.sign({...claims,authVersion:3},secret,{expiresIn:'1h'});
  await middleware.authMiddleware(request({headers:{authorization:'Bearer '+value}}),newer,()=>{});
  middleware.revokeUserStreams(3,7,2);
  assert.equal(older.ended,true); assert.equal(newer.ended,false);
  middleware.revokeUserStreams(3,7); assert.equal(newer.ended,true);
});
