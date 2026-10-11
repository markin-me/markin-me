const test = require('node:test');
const assert = require('node:assert/strict');

const makeAdminTeamRouter = require('../api/admin/team');
const {
  emptyEmployeeDocuments,
  normalizeDocumentSection,
  mergeEmployeeDocumentSection,
  isValidSnils,
  isValidInn,
  encryptEmployeeDocuments,
  decryptEmployeeDocuments,
  employeeDocumentSummary,
} = makeAdminTeamRouter._test;

test('protects document read and update routes with a dedicated permission', () => {
  const requestedPermissions = [];
  const middleware = (req, res, next) => next();
  const router = makeAdminTeamRouter({
    db: {},
    helpers: {},
    requirePermission(permissionKey) {
      requestedPermissions.push(permissionKey);
      return middleware;
    },
  });
  const documentRoutes = router.stack.filter((layer) => layer.route?.path === '/users/:id/documents');
  assert.equal(documentRoutes.length, 2);
  assert.equal(requestedPermissions.filter((key) => key === 'employee_documents.manage').length, 2);
});

test('validates and normalizes SNILS and INN control digits', () => {
  assert.equal(isValidSnils('112-233-445 95'), true);
  assert.equal(isValidSnils('112-233-445 96'), false);
  assert.equal(isValidInn('7707083893'), true);
  assert.equal(isValidInn('500100732259'), true);
  assert.equal(isValidInn('7707083894'), false);
  assert.deepEqual(normalizeDocumentSection('tax', {
    snils: '112-233-445 95',
    inn: '7707083893',
  }), { snils: '11223344595', inn: '7707083893' });
});

test('applies conditional document requirements without making optional INN mandatory', () => {
  assert.doesNotThrow(() => normalizeDocumentSection('tax', { snils: '11223344595', inn: '' }));
  assert.throws(
    () => normalizeDocumentSection('identity', { type: 'passport_rf', series: '123', number: '123456' }),
    { code: 'INVALID_PASSPORT_SERIES' }
  );
  assert.throws(
    () => normalizeDocumentSection('military', { status: 'subject', document_type: '' }),
    { code: 'MILITARY_DOCUMENT_TYPE_REQUIRED' }
  );
  assert.doesNotThrow(() => normalizeDocumentSection('military', { status: 'not_subject' }));
  assert.throws(
    () => normalizeDocumentSection('education', { required_for_position: true }),
    { code: 'EDUCATION_REQUIRED_FIELDS' }
  );
  assert.doesNotThrow(() => normalizeDocumentSection('education', { required_for_position: false }));
});

test('creates and updates one section without overwriting the others', () => {
  const created = mergeEmployeeDocumentSection(null, 'employment', {
    record_type: 'first_employment',
    is_first_job: true,
  });
  const updated = mergeEmployeeDocumentSection(created, 'tax', {
    snils: '11223344595',
    inn: '',
  });
  assert.equal(updated.employment.record_type, 'first_employment');
  assert.equal(updated.tax.snils, '11223344595');
  assert.equal(updated.identity.number, '');
});

test('supports old employee cards without a documents row', () => {
  const documents = emptyEmployeeDocuments();
  const summary = employeeDocumentSummary(documents);
  assert.equal(summary.identity.state, 'empty');
  assert.equal(summary.tax.state, 'empty');
  assert.equal(summary.education.state, 'optional');
});

test('binds encrypted payload to both tenant and employee', () => {
  const previous = process.env.EMPLOYEE_DOCUMENTS_ENCRYPTION_KEY;
  process.env.EMPLOYEE_DOCUMENTS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  try {
    const source = mergeEmployeeDocumentSection(null, 'tax', { snils: '11223344595', inn: '' });
    const encrypted = encryptEmployeeDocuments(source, 10, 20);
    const row = {
      encrypted_payload: encrypted.payload,
      encryption_iv: encrypted.iv,
      encryption_tag: encrypted.authTag,
    };
    assert.equal(decryptEmployeeDocuments(row, 10, 20).tax.snils, '11223344595');
    assert.throws(() => decryptEmployeeDocuments(row, 11, 20));
    assert.throws(() => decryptEmployeeDocuments(row, 10, 21));
  } finally {
    if (previous === undefined) delete process.env.EMPLOYEE_DOCUMENTS_ENCRYPTION_KEY;
    else process.env.EMPLOYEE_DOCUMENTS_ENCRYPTION_KEY = previous;
  }
});
