const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer');

test('keeps document drafts on API errors and restores saved values on cancel', { timeout: 30000 }, async (t) => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <!doctype html><html><body data-admin-active-page="team">
      <button id="teamCreateBtn"></button>
      <button data-team-section="users"></button><button data-team-section="roles"></button>
      <div id="teamCenterTitle"></div><i id="teamCenterIcon"></i>
      <div id="teamEntityList"></div><div id="teamTabsHeader"><div id="teamTabs"></div></div>
      <div id="teamEditorBody"></div><div id="appModal"></div>
    </body></html>
  `);
  await page.evaluate(() => {
    Element.prototype.scrollIntoView = function () {};
    const emptySummary = {
      identity: { state: 'review', status: 'Не проверен', lines: ['Паспорт РФ', '•••• · ••••56'] },
      tax: { state: 'empty', status: 'Не заполнено', lines: [] },
      employment: { state: 'empty', status: 'Требуется уточнение', lines: [] },
      military: { state: 'empty', status: 'Статус не определён', lines: [] },
      education: { state: 'optional', status: 'По необходимости', lines: [] },
    };
    const identity = {
      type: 'passport_rf', series: '1234', number: '123456', issue_date: '', issued_by: '',
      department_code: '', verification_status: 'unchecked',
    };
    const tax = { snils: '', inn: '' };
    window.failNextDocumentSave = false;
    window.authFetch = async (url, options = {}) => {
      let payload;
      let status = 200;
      if (url === '/api/admin/team/bootstrap') {
        payload = {
          ok: true,
          users: [{ id: 7, name: 'Сотрудник', login: 'employee', is_active: true, roles: [], stores: [] }],
          roles: [], stores: [], permissions: [], start_routes: [],
          capabilities: { manage_employee_documents: true },
        };
      } else if (url.includes('/documents?section=identity')) {
        payload = { ok: true, section: 'identity', data: identity };
      } else if (url.includes('/documents?section=tax')) {
        payload = { ok: true, section: 'tax', data: tax };
      } else if (url.endsWith('/documents') && options.method === 'PUT') {
        if (window.failNextDocumentSave) {
          window.failNextDocumentSave = false;
          status = 500;
          payload = { ok: false, error: 'DOCUMENTS_UPDATE_FAILED' };
        } else {
          const request = JSON.parse(options.body);
          Object.assign(request.section === 'identity' ? identity : tax, request.data);
          payload = { ok: true, summary: emptySummary };
        }
      } else if (url.endsWith('/documents')) {
        payload = { ok: true, summary: emptySummary };
      } else {
        status = 404;
        payload = { ok: false, error: 'NOT_FOUND' };
      }
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
    };
    window.AppModal = { open(options) { window.lastModalOptions = options; } };
  });
  await page.addScriptTag({ path: path.resolve(__dirname, '../static/js/team.js') });

  await page.waitForSelector('[data-team-open="user"]');
  await page.click('[data-team-open="user"]');
  await page.waitForSelector('[data-team-document-toggle="identity"]');
  await page.click('[data-team-document-toggle="identity"]');
  await page.click('[data-team-document-edit="identity"]');
  await page.waitForSelector('[name="document_identity_number"]');
  await page.$eval('[name="document_identity_number"]', (input) => { input.value = '654321'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-team-document-cancel]');
  await page.click('[data-team-document-edit="identity"]');
  await page.waitForFunction(() => document.querySelector('[name="document_identity_number"]')?.value === '123456');

  await page.click('[data-team-document-cancel]');
  await page.click('[data-team-document-toggle="tax"]');
  await page.click('[data-team-document-edit="tax"]');
  await page.$eval('[name="document_tax_snils"]', (input) => { input.value = '112-233-445 95'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => { window.failNextDocumentSave = true; });
  await page.click('[data-team-document-save="tax"]');
  await page.waitForSelector('.team-document-notice.is-error');
  assert.equal(await page.$eval('[name="document_tax_snils"]', (input) => input.value), '112-233-445 95');

  await page.click('[data-team-document-save="tax"]');
  await page.waitForFunction(() => !document.querySelector('[data-team-document-editor="tax"]'));
});
