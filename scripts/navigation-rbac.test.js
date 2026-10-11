const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('permission editor reuses the rendered sidebar and left column', () => {
  const team = read('static/js/team.js');
  const layout = read('views/layouts/app.ejs');
  assert.match(team, /document\.getElementById\('app-sidebar'\)/);
  assert.match(team, /document\.querySelector\('\.page-col-left'\)/);
  assert.match(team, /page\.querySelector\('\.page-col-left'\)/);
  assert.match(layout, /include\('\.\.\/partials\/sidebar'/);
  assert.doesNotMatch(team, /class=["']app-sidebar/);
});

test('sidebar parents expose real permission keys and safe toggle keys', () => {
  const layout = read('views/layouts/app.ejs');
  const sidebar = read('views/partials/sidebar.ejs');
  for (const key of ['finance.view', 'products.view', 'orders.view', 'clients.view', 'users.view', 'chat.view', 'settings.view']) {
    assert.match(layout, new RegExp(key.replace('.', '\\.')));
  }
  assert.match(sidebar, /data-permission-keys/);
  assert.match(sidebar, /data-permission-toggle-keys/);
});

test('new chat and finance permissions are registered and checked by the server', () => {
  const migration = read('migrations/007-add-navigation-permissions.sql');
  const server = read('server.js');
  for (const key of ['finance.manage', 'chat.view', 'chat.manage']) {
    assert.match(migration, new RegExp(key.replace('.', '\\.')));
    assert.match(server, new RegExp(key.replace('.', '\\.')));
  }
  assert.match(server, /req\.headers\['x-tenant-id'\] = String\(currentTenantId\)/);
});

test('role updates preserve grants above the actor and reject escalation', () => {
  const teamApi = read('api/admin/team.js');
  assert.match(teamApi, /loadManageablePermissionIds/);
  assert.match(teamApi, /PERMISSION_ESCALATION_FORBIDDEN/);
  assert.match(teamApi, /permission_id IN/);
  assert.match(teamApi, /WHERE rp\.tenant_id=\? AND rp\.role_id=\?/);
});

test('unsaved role changes keep browser and internal navigation protection', () => {
  const team = read('static/js/team.js');
  assert.match(team, /beforeunload/);
  assert.match(team, /openUnsavedDialog/);
  assert.match(team, /state\.tabs\.some\(tabHasUnsaved\)/);
});
