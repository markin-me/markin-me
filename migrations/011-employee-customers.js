'use strict';

// PREPARED ONLY. Applying this module requires explicit approval and a verified backup.
module.exports = async function migrateEmployeeCustomers(db) {
  const [[scope]] = await db.query('SELECT DATABASE() AS db');
  if (scope.db !== 'a1186497_test') throw new Error('EMPLOYEE_CUSTOMERS_DB_SCOPE_REFUSED');
  const [columns] = await db.query('SHOW COLUMNS FROM cust_customers');
  const phone = columns.find(column => column.Field === 'phone');
  if (!phone || phone.Type.toLowerCase() !== 'varchar(20)') throw new Error('CUSTOMER_PHONE_SCHEMA_REVIEW_REQUIRED');
  const normalizePhone = require('../api/helpers').normalizePhone;
  const [phones] = await db.query('SELECT tenant_id, phone FROM cust_customers WHERE phone IS NOT NULL');
  const seen = new Set();
  for (const row of phones) {
    const normalized = normalizePhone(row.phone);
    if (!/^\d{10,15}$/.test(normalized) || normalized !== row.phone) throw new Error('CUSTOMER_PHONE_NORMALIZATION_REVIEW_REQUIRED');
    const key = `${row.tenant_id}:${normalized}`;
    if (seen.has(key)) throw new Error('CUSTOMER_PHONE_DUPLICATES_REVIEW_REQUIRED');
    seen.add(key);
  }
  for (const table of ['app_users', 'cust_customers']) {
    const [indexes] = await db.query(`SHOW INDEX FROM ${table}`);
    const hasScopeKey = indexes.some(index => index.Non_unique === 0 && index.Column_name === 'tenant_id'
      && indexes.some(next => next.Key_name === index.Key_name && next.Seq_in_index === 2 && next.Column_name === 'id'));
    if (!hasScopeKey) throw new Error('TENANT_COMPOSITE_KEY_REVIEW_REQUIRED');
  }
  const [indexes] = await db.query('SHOW INDEX FROM cust_customers');
  if (!indexes.some(index => index.Non_unique === 0 && index.Column_name === 'tenant_id'
      && indexes.some(next => next.Key_name === index.Key_name && next.Seq_in_index === 2 && next.Column_name === 'phone'))) {
    throw new Error('TENANT_PHONE_UNIQUE_KEY_REQUIRED');
  }
  // NULL values remain distinct under the existing tenant/phone unique indexes.
  if (phone.Null !== 'YES') await db.query('ALTER TABLE cust_customers MODIFY COLUMN phone VARCHAR(20) NULL DEFAULT NULL');
  const [checks] = await db.query(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='cust_customers' AND CONSTRAINT_NAME='chk_customer_phone_canonical'`);
  if (!checks.length) await db.query(`ALTER TABLE cust_customers ADD CONSTRAINT chk_customer_phone_canonical
    CHECK (phone IS NULL OR (phone REGEXP '^[0-9]{10,15}$' AND NOT (CHAR_LENGTH(phone)=11 AND LEFT(phone,1)='8')))`);
  await db.query(`CREATE TABLE IF NOT EXISTS auth_employee_customer_links (
    tenant_id INT NOT NULL,
    employee_id INT NOT NULL,
    customer_id INT NOT NULL,
    verified_phone VARCHAR(20) NULL,
    phone_verified_at DATETIME NULL,
    conflict_code VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, employee_id),
    UNIQUE KEY uq_employee_customer (tenant_id, customer_id),
    CONSTRAINT fk_employee_customer_employee FOREIGN KEY (tenant_id, employee_id)
      REFERENCES app_users (tenant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_employee_customer_customer FOREIGN KEY (tenant_id, customer_id)
      REFERENCES cust_customers (tenant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};
