const express = require('express');
const {
  customerAddressSelectFields,
  ensureCustomerAddressIdentityColumns,
  normalizeCustomerAddressPayload,
  resolveCustomerAddressPayload,
  serializeCustomerAddress,
} = require('../../data/customer-address');

module.exports = function makeAdminClientsRouter({ db, helpers }) {
  const router = express.Router();
  let customerGenderColumnPromise = null;

  function mergeCustomerAddressSource(existing, patch) {
    const source = existing && typeof existing === 'object' ? { ...existing } : {};
    const body = patch && typeof patch === 'object' ? patch : {};
    const fields = [
      'city',
      'street',
      'house',
      'entrance',
      'floor',
      'apartment',
      'comment',
      'address_ref',
      'selected_object_type',
      'resolved_city_source_key',
      'address_context_locality',
      'address_normalized_display',
      'lat',
      'lng',
      'delivery_zone_id',
      'delivery_store_id',
    ];
    fields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        source[field] = body[field];
      }
    });
    if (Object.prototype.hasOwnProperty.call(body, 'context_locality')) {
      source.address_context_locality = body.context_locality;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'selected_source_key')
      && !Object.prototype.hasOwnProperty.call(body, 'address_ref')
    ) {
      source.address_ref = body.selected_source_key;
    }
    return source;
  }

  const FILTER_FIELD_KIND_MAP = new Map([
    ['total_orders', 'number'],
    ['total_spent', 'number'],
    ['last_order_date', 'date'],
    ['registration_date', 'date'],
    ['created_at', 'date'],
    ['is_active', 'number'],
    ['age', 'number'],
    ['gender', 'enum'],
    ['favorite_product', 'entity'],
    ['favorite_category', 'entity'],
  ]);

  function toPositiveInt(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const normalized = Math.trunc(parsed);
    return normalized > 0 ? normalized : null;
  }

  function chunkArray(list, size = 500) {
    const out = [];
    const source = Array.isArray(list) ? list : [];
    for (let i = 0; i < source.length; i += size) {
      out.push(source.slice(i, i + size));
    }
    return out;
  }

  function compareValues(left, operator, right) {
    switch (operator) {
      case '=':
        return left === right;
      case '!=':
        return left !== right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      default:
        return null;
    }
  }

  function getRelativeDateFilterValue(rawValue) {
    if (typeof rawValue !== 'string' || !/^-\d+d$/.test(rawValue)) return null;
    const days = Number.parseInt(rawValue.slice(1, -1), 10);
    if (!Number.isFinite(days) || days < 0) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    now.setDate(now.getDate() - days);
    return now.getTime();
  }

  function getCustomerAgeYears(rawBirthday) {
    if (!rawBirthday) return null;
    const birthday = new Date(rawBirthday);
    if (!Number.isFinite(birthday.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birthday.getFullYear();
    const monthDiff = now.getMonth() - birthday.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthday.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age : null;
  }

  function normalizeCustomerGender(rawValue) {
    const raw = String(rawValue || '').trim().toLowerCase();
    if (!raw) return 'unknown';
    if (['m', 'male', 'man', 'м', 'муж', 'мужской'].includes(raw)) return 'm';
    if (['f', 'female', 'woman', 'ж', 'жен', 'женский'].includes(raw)) return 'f';
    return 'unknown';
  }

  async function hasCustomerGenderColumn() {
    if (!customerGenderColumnPromise) {
      customerGenderColumnPromise = db.query(
        `SELECT 1
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'cust_customers'
            AND COLUMN_NAME = 'gender'
          LIMIT 1`
      )
        .then(([rows]) => rows.length > 0)
        .catch((err) => {
          customerGenderColumnPromise = null;
          throw err;
        });
    }
    return customerGenderColumnPromise;
  }

  function getRuleFieldKind(field, options = {}) {
    if (field === 'gender' && !options.allowGender) return null;
    return FILTER_FIELD_KIND_MAP.get(field) || null;
  }

  function normalizeFilterRule(rawRule, options = {}) {
    if (!rawRule || typeof rawRule !== 'object') return null;
    const field = String(rawRule.field || '').trim();
    const operator = String(rawRule.operator || '').trim();
    const kind = getRuleFieldKind(field, options);
    if (!kind) return null;

    let value = rawRule.value;
    if (kind === 'number') {
      value = Number(value);
      if (!Number.isFinite(value)) return null;
      if (!['=', '!=', '>=', '<=', '>', '<'].includes(operator)) return null;
    } else if (kind === 'date') {
      const relativeValue = getRelativeDateFilterValue(value);
      const absoluteValue = relativeValue == null && value ? new Date(value).getTime() : relativeValue;
      if (!Number.isFinite(absoluteValue)) return null;
      if (!['=', '!=', '>=', '<=', '>', '<'].includes(operator)) return null;
      value = String(value);
    } else if (kind === 'enum') {
      if (!['=', '!='].includes(operator)) return null;
      value = normalizeCustomerGender(value);
    } else if (kind === 'entity') {
      if (!['=', '!='].includes(operator)) return null;
      value = toPositiveInt(value);
      if (!value) return null;
    }

    return { field, operator, value };
  }

  function normalizeFilterConditions(rawConditions, options = {}) {
    try {
      const parsed = typeof rawConditions === 'string'
        ? JSON.parse(rawConditions)
        : rawConditions;
      const logic = String(parsed?.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
      const rawRules = Array.isArray(parsed?.rules) ? parsed.rules : [];
      const rules = rawRules
        .map((rule) => normalizeFilterRule(rule, options))
        .filter(Boolean);
      return { logic, rules };
    } catch {
      return { logic: 'AND', rules: [] };
    }
  }

  function isAdvancedFilterRule(rule) {
    return rule?.field === 'favorite_product' || rule?.field === 'favorite_category';
  }

  function evaluateCustomFilterRule(client, rule, options = {}) {
    if (!rule || typeof rule !== 'object') return null;
    const kind = getRuleFieldKind(rule.field, options);
    if (!kind) return null;

    if (kind === 'number') {
      let left = null;
      if (rule.field === 'age') {
        left = getCustomerAgeYears(client?.birthday);
      } else {
        left = Number(client?.[rule.field] || 0);
      }
      if (!Number.isFinite(left)) return false;
      return compareValues(left, rule.operator, Number(rule.value));
    }

    if (kind === 'date') {
      const leftDate = client?.[rule.field] ? new Date(client[rule.field]) : null;
      const rightRelative = getRelativeDateFilterValue(rule.value);
      const rightDate = rightRelative != null ? new Date(rightRelative) : new Date(rule.value);
      if (!leftDate || !Number.isFinite(leftDate.getTime()) || !Number.isFinite(rightDate.getTime())) return false;
      if (rule.operator === '=' || rule.operator === '!=') {
        leftDate.setHours(0, 0, 0, 0);
        rightDate.setHours(0, 0, 0, 0);
      }
      const left = leftDate.getTime();
      const right = rightDate.getTime();
      return compareValues(left, rule.operator, right);
    }

    if (kind === 'enum') {
      const left = normalizeCustomerGender(client?.gender);
      const right = normalizeCustomerGender(rule.value);
      return compareValues(left, rule.operator, right);
    }

    if (kind === 'entity') {
      const left = toPositiveInt(client?.[rule.field]);
      const right = toPositiveInt(rule.value);
      if (!left || !right) return false;
      return compareValues(left, rule.operator, right);
    }

    return null;
  }

  function doesClientMatchCustomFilter(client, conditions, options = {}) {
    const rules = Array.isArray(conditions?.rules) ? conditions.rules : [];
    const validResults = rules
      .map((rule) => evaluateCustomFilterRule(client, rule, options))
      .filter((result) => result !== null);
    if (!validResults.length) return true;
    if (String(conditions?.logic || '').toUpperCase() === 'OR') {
      return validResults.some(Boolean);
    }
    return validResults.every(Boolean);
  }

  function buildGenderSqlCondition(operator, value) {
    const maleExpr = "LOWER(TRIM(COALESCE(gender, ''))) IN ('m','male','man','м','муж','мужской')";
    const femaleExpr = "LOWER(TRIM(COALESCE(gender, ''))) IN ('f','female','woman','ж','жен','женский')";
    const unknownExpr = "(gender IS NULL OR TRIM(COALESCE(gender, ''))='' OR LOWER(TRIM(COALESCE(gender, ''))) IN ('u','unknown','none','n/a','не указан','не указано'))";
    const expr = value === 'm'
      ? maleExpr
      : value === 'f'
        ? femaleExpr
        : unknownExpr;
    return operator === '!=' ? `NOT (${expr})` : expr;
  }

  function buildFilterWhereClause(conditions, tenantId, options = {}) {
    if (!conditions || !Array.isArray(conditions.rules) || !conditions.rules.length) {
      return { whereClause: '', params: [], advancedRules: [] };
    }

    const logic = conditions.logic === 'OR' ? ' OR ' : ' AND ';
    const clauses = [];
    const params = [];
    const advancedRules = [];

    for (const rule of conditions.rules) {
      if (isAdvancedFilterRule(rule)) {
        advancedRules.push(rule);
        continue;
      }

      const kind = getRuleFieldKind(rule.field, options);
      if (!kind) continue;

      if (kind === 'number' && rule.field === 'age') {
        clauses.push(`birthday IS NOT NULL AND TIMESTAMPDIFF(YEAR, birthday, CURDATE()) ${rule.operator} ?`);
        params.push(Number(rule.value));
        continue;
      }

      if (kind === 'enum' && rule.field === 'gender') {
        clauses.push(buildGenderSqlCondition(rule.operator, normalizeCustomerGender(rule.value)));
        continue;
      }

      if (kind === 'date' && typeof rule.value === 'string' && /^-\d+d$/.test(rule.value)) {
        const days = parseInt(rule.value.slice(1, -1), 10);
        const expr = `DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`;
        if (rule.operator === '=' || rule.operator === '!=') {
          clauses.push(`DATE(${rule.field}) ${rule.operator} ${expr}`);
        } else {
          clauses.push(`${rule.field} ${rule.operator} ${expr}`);
        }
        continue;
      }

      if (kind === 'number' || kind === 'date') {
        clauses.push(`${rule.field} ${rule.operator} ?`);
        params.push(rule.value);
      }
    }

    if (!clauses.length) {
      return { whereClause: '', params: [], advancedRules };
    }

    return {
      whereClause: ` AND (${clauses.join(logic)})`,
      params,
      advancedRules,
    };
  }

  function sortClientsRows(rows, sortRaw) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    const sort = String(sortRaw || 'last_desc');
    if (sort === 'name_asc') {
      return list.sort((a, b) => {
        const nameA = String(a?.name || '').trim();
        const nameB = String(b?.name || '').trim();
        const emptyA = nameA ? 0 : 1;
        const emptyB = nameB ? 0 : 1;
        if (emptyA !== emptyB) return emptyA - emptyB;
        const cmp = nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
        if (cmp !== 0) return cmp;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });
    }
    if (sort === 'orders_desc') {
      return list.sort((a, b) => (
        Number(b?.total_orders || 0) - Number(a?.total_orders || 0) ||
        Number(b?.id || 0) - Number(a?.id || 0)
      ));
    }
    if (sort === 'created_desc') {
      return list.sort((a, b) => (
        new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime() ||
        Number(b?.id || 0) - Number(a?.id || 0)
      ));
    }
    return list.sort((a, b) => {
      const left = a?.last_order_date ? new Date(a.last_order_date).getTime() : new Date(a?.created_at || 0).getTime();
      const right = b?.last_order_date ? new Date(b.last_order_date).getTime() : new Date(b?.created_at || 0).getTime();
      return right - left || Number(b?.id || 0) - Number(a?.id || 0);
    });
  }

  function extractPurchasedProductsFromItems(rawItems) {
    const items = Array.isArray(rawItems) ? rawItems : [];
    const out = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const qtyRaw = Number(item.qty ?? item.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;
      const comboSelections = Array.isArray(item.selections) ? item.selections : [];
      if (comboSelections.length) {
        comboSelections.forEach((selection) => {
          const productId = toPositiveInt(selection?.product_id || selection?.id || selection?.product?.id);
          if (!productId) return;
          out.push({ productId, qty });
        });
        continue;
      }
      const productId = toPositiveInt(item.product_id || item.id || item.product?.id);
      if (!productId) continue;
      out.push({ productId, qty });
    }
    return out;
  }

  async function attachFavoritePurchaseStats(tenantId, clients) {
    const customerIds = [...new Set((Array.isArray(clients) ? clients : [])
      .map((client) => toPositiveInt(client?.id))
      .filter(Boolean))];
    if (!customerIds.length) return;

    const orders = [];
    for (const chunk of chunkArray(customerIds, 500)) {
      const placeholders = chunk.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT customer_id, items
           FROM order_orders
          WHERE tenant_id=?
            AND is_active=1
            AND customer_id IN (${placeholders})`,
        [tenantId, ...chunk]
      );
      orders.push(...rows);
    }

    const productCountsByCustomer = new Map();
    const allProductIds = new Set();

    for (const row of orders) {
      const customerId = toPositiveInt(row?.customer_id);
      if (!customerId) continue;
      let parsedItems = [];
      try {
        const items = row?.items ? JSON.parse(row.items) : [];
        if (Array.isArray(items)) parsedItems = items;
      } catch {}

      const purchases = extractPurchasedProductsFromItems(parsedItems);
      if (!purchases.length) continue;

      let customerProductMap = productCountsByCustomer.get(customerId);
      if (!customerProductMap) {
        customerProductMap = new Map();
        productCountsByCustomer.set(customerId, customerProductMap);
      }

      purchases.forEach(({ productId, qty }) => {
        allProductIds.add(productId);
        customerProductMap.set(productId, Number(customerProductMap.get(productId) || 0) + qty);
      });
    }

    const categoryIdsByProduct = new Map();
    const productIds = [...allProductIds];
    for (const chunk of chunkArray(productIds, 500)) {
      const placeholders = chunk.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT product_id, category_id
           FROM prod_product_categories
          WHERE tenant_id=?
            AND product_id IN (${placeholders})`,
        [tenantId, ...chunk]
      );
      rows.forEach((row) => {
        const productId = toPositiveInt(row?.product_id);
        const categoryId = toPositiveInt(row?.category_id);
        if (!productId || !categoryId) return;
        if (!categoryIdsByProduct.has(productId)) {
          categoryIdsByProduct.set(productId, []);
        }
        categoryIdsByProduct.get(productId).push(categoryId);
      });
    }

    clients.forEach((client) => {
      const customerId = toPositiveInt(client?.id);
      const productMap = customerId ? productCountsByCustomer.get(customerId) : null;
      if (!productMap || !productMap.size) {
        client.favorite_product = null;
        client.favorite_category = null;
        return;
      }

      let favoriteProductId = null;
      let favoriteProductScore = -1;
      const categoryMap = new Map();

      productMap.forEach((score, productId) => {
        if (
          score > favoriteProductScore ||
          (score === favoriteProductScore && (favoriteProductId == null || productId < favoriteProductId))
        ) {
          favoriteProductId = productId;
          favoriteProductScore = score;
        }
        const categoryIds = categoryIdsByProduct.get(productId) || [];
        categoryIds.forEach((categoryId) => {
          categoryMap.set(categoryId, Number(categoryMap.get(categoryId) || 0) + score);
        });
      });

      let favoriteCategoryId = null;
      let favoriteCategoryScore = -1;
      categoryMap.forEach((score, categoryId) => {
        if (
          score > favoriteCategoryScore ||
          (score === favoriteCategoryScore && (favoriteCategoryId == null || categoryId < favoriteCategoryId))
        ) {
          favoriteCategoryId = categoryId;
          favoriteCategoryScore = score;
        }
      });

      client.favorite_product = favoriteProductId;
      client.favorite_category = favoriteCategoryId;
    });
  }

  function getClientsDatasetSql(baseWhereSql, options = {}) {
    const genderSelectSql = options.includeGender ? ', c.gender' : '';
    return `
      SELECT
        c.id, c.tenant_id,
        c.name, c.phone, c.birthday,
        c.photo,
        COALESCE(order_metrics.total_orders, 0) AS total_orders,
        COALESCE(order_metrics.total_spent, 0) AS total_spent,
        order_metrics.last_order_date AS last_order_date,
        c.registration_date,
        c.is_active,
        c.created_at, c.updated_at
        ${genderSelectSql}
      FROM cust_customers c
      LEFT JOIN (
        SELECT
          tenant_id,
          customer_id,
          COUNT(*) AS total_orders,
          COALESCE(SUM(COALESCE(total_price, 0)), 0) AS total_spent,
          MAX(created_at) AS last_order_date
        FROM order_orders
        WHERE tenant_id=? AND is_active=1 AND customer_id IS NOT NULL
        GROUP BY tenant_id, customer_id
      ) order_metrics
        ON order_metrics.tenant_id = c.tenant_id
       AND order_metrics.customer_id = c.id
      WHERE ${baseWhereSql}
    `;
  }

  async function loadClientsForFilterEvaluation(tenantId, baseWhereSql, baseParams, options = {}) {
    const filterSupport = options.filterSupport || {};
    const includeGender = !!filterSupport.gender;
    const clientsDatasetSql = getClientsDatasetSql(baseWhereSql, { includeGender });
    const outerWhereClause = options.postWhereClause || '';
    const outerParams = Array.isArray(options.postWhereParams) ? options.postWhereParams : [];
    const [rows] = await db.query(
      `SELECT
         id, tenant_id,
         name, phone, birthday,
         photo,
         total_orders, total_spent, last_order_date,
         registration_date, is_active,
         created_at, updated_at
         ${includeGender ? ', gender' : ''}
       FROM (${clientsDatasetSql}) clients
       WHERE 1=1${outerWhereClause}`,
      [tenantId, ...baseParams, ...outerParams]
    );

    const clients = rows.map((row) => ({
      ...row,
      favorite_product: null,
      favorite_category: null,
      gender: includeGender ? row.gender : null,
    }));

    if (options.needFavorites) {
      await attachFavoritePurchaseStats(tenantId, clients);
    }

    return clients;
  }

  async function getCustomFilterCount(tenantId, conditions, options = {}) {
    const filterSupport = options.filterSupport || {};
    const normalized = normalizeFilterConditions(conditions, { allowGender: !!filterSupport.gender });
    const { whereClause, params, advancedRules } = buildFilterWhereClause(normalized, tenantId, { allowGender: !!filterSupport.gender });

    if (!advancedRules.length) {
      const clientsDatasetSql = getClientsDatasetSql('c.tenant_id=?', { includeGender: !!filterSupport.gender });
      const [countRows] = await db.query(
        `SELECT COUNT(*) AS c
         FROM (${clientsDatasetSql}) clients
         WHERE 1=1${whereClause}`,
        [tenantId, tenantId, ...params]
      );
      return {
        conditions: normalized,
        count: Number(countRows?.[0]?.c || 0),
      };
    }

    const canNarrowBySimpleRules = normalized.logic !== 'OR' && whereClause;
    const clients = await loadClientsForFilterEvaluation(
      tenantId,
      'c.tenant_id=?',
      [tenantId],
      {
        filterSupport,
        needFavorites: true,
        postWhereClause: canNarrowBySimpleRules ? whereClause : '',
        postWhereParams: canNarrowBySimpleRules ? params : [],
      }
    );

    const count = clients.filter((client) => doesClientMatchCustomFilter(client, normalized, { allowGender: !!filterSupport.gender })).length;
    return {
      conditions: normalized,
      count,
    };
  }

  /**
   * GET /api/admin/clients
   * query:
   *  - q: search by phone/name
   *  - is_active: 1/0 (optional)
   *  - filter_id: ID кастомного фильтра (optional)
   *  - limit (default 50, max 200)
   *  - offset (default 0)
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const filterSupport = { gender: await hasCustomerGenderColumn() };

      const qRaw = helpers.strOrNull(req.query.q);
      const qPhone = qRaw ? helpers.normalizePhone(qRaw) : '';
      const qText = qRaw ? qRaw.trim() : '';

      const isActive =
        req.query.is_active !== undefined
          ? (helpers.toBool(req.query.is_active, true) ? 1 : 0)
          : null;

      const filterId = req.query.filter_id ? Number(req.query.filter_id) : null;
      const sortRaw = helpers.strOrNull(req.query.sort) || 'last_desc';

      let limit = Number(req.query.limit ?? 50);
      let offset = Number(req.query.offset ?? 0);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

      const orderByMap = {
        last_desc: 'COALESCE(last_order_date, created_at) DESC, id DESC',
        name_asc: "CASE WHEN name IS NULL OR name='' THEN 1 ELSE 0 END ASC, name ASC, id DESC",
        orders_desc: 'total_orders DESC, id DESC',
        created_desc: 'created_at DESC, id DESC',
      };
      const orderBy = orderByMap[sortRaw] || orderByMap.last_desc;

      const where = ['c.tenant_id=?'];
      const params = [tenantId];

      if (isActive !== null) {
        where.push('c.is_active=?');
        params.push(isActive);
      }

      if (qText) {
        where.push('(c.name LIKE ? OR c.phone LIKE ?)');
        params.push(`%${qText}%`, `%${qPhone || qText}%`);
      }

      // Применяем кастомный фильтр если указан
      let normalizedFilterConditions = null;
      let customFilterClause = '';
      let customFilterParams = [];
      let customFilterAdvancedRules = [];
      if (filterId && Number.isFinite(filterId) && filterId > 0) {
        const [filterRows] = await db.query(
          `SELECT conditions FROM cust_categories WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1 LIMIT 1`,
          [tenantId, storeId, filterId]
        );
        if (filterRows.length) {
          normalizedFilterConditions = normalizeFilterConditions(filterRows[0].conditions, { allowGender: !!filterSupport.gender });
          const result = buildFilterWhereClause(normalizedFilterConditions, tenantId, { allowGender: !!filterSupport.gender });
          customFilterClause = result.whereClause;
          customFilterParams = result.params;
          customFilterAdvancedRules = result.advancedRules;
        }
      }

      if (normalizedFilterConditions && customFilterAdvancedRules.length) {
        const canNarrowBySimpleRules = normalizedFilterConditions.logic !== 'OR' && customFilterClause;
        const clients = await loadClientsForFilterEvaluation(
          tenantId,
          where.join(' AND '),
          params,
          {
            filterSupport,
            needFavorites: true,
            postWhereClause: canNarrowBySimpleRules ? customFilterClause : '',
            postWhereParams: canNarrowBySimpleRules ? customFilterParams : [],
          }
        );
        const matchedRows = clients.filter((client) => (
          doesClientMatchCustomFilter(client, normalizedFilterConditions, { allowGender: !!filterSupport.gender })
        ));
        const sortedRows = sortClientsRows(matchedRows, sortRaw);
        return res.json({
          ok: true,
          data: sortedRows.slice(offset, offset + limit),
          total: sortedRows.length,
          limit,
          offset,
        });
      }

      const clientsDatasetSql = getClientsDatasetSql(where.join(' AND '), { includeGender: !!filterSupport.gender });
      const clientsDatasetParams = [tenantId, ...params];

      const [rows] = await db.query(
        `SELECT
           id, tenant_id,
           name, phone, birthday,
           photo,
           total_orders, total_spent, last_order_date,
           is_active,
           created_at, updated_at
         FROM (${clientsDatasetSql}) clients
         WHERE 1=1${customFilterClause}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
        [...clientsDatasetParams, ...customFilterParams, limit, offset]
      );

      const [cntRows] = await db.query(
        `SELECT COUNT(*) AS c
         FROM (${clientsDatasetSql}) clients
         WHERE 1=1${customFilterClause}`,
        [...clientsDatasetParams, ...customFilterParams]
      );

      res.json({
        ok: true,
        data: rows,
        total: Number(cntRows?.[0]?.c || 0),
        limit,
        offset,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const clientDatasetSql = getClientsDatasetSql('c.tenant_id=? AND c.id=?');
      const [rows] = await db.query(
        `SELECT
           id, tenant_id,
           name, phone, birthday,
           photo,
           total_orders, total_spent, last_order_date,
           is_active,
           created_at, updated_at
         FROM (${clientDatasetSql}) clients
         LIMIT 1`,
        [tenantId, tenantId, id]
      );

      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/clients
   * body: { name?, phone, birthday? }
   */
  router.post('/', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const phone = helpers.normalizePhone(req.body.phone);
      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const name = helpers.strOrNull(req.body.name) || 'Клиент';
      const birthday = helpers.strOrNull(req.body.birthday); // YYYY-MM-DD | null

      const [exists] = await db.query(
        `SELECT id FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 1`,
        [tenantId, phone]
      );
      if (exists.length) {
        return res.json({ ok: true, id: Number(exists[0].id), existed: true });
      }

      const [r] = await db.query(
        `INSERT INTO cust_customers
          (tenant_id, phone, name, birthday, is_active)
         VALUES (?,?,?,?,1)`,
        [tenantId, phone, name, birthday]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      if (String(e?.code || '').includes('ER_DUP_ENTRY')) {
        return res.status(409).json({ ok: false, error: 'PHONE_EXISTS' });
      }
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id/addresses
   */
  router.get('/:id/addresses', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await ensureCustomerAddressIdentityColumns(db);

      const [rows] = await db.query(
        `SELECT
           ${customerAddressSelectFields}
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1
         ORDER BY is_default DESC, updated_at DESC, id DESC`,
        [tenantId, customerId]
      );

      res.json({
        ok: true,
        data: Array.isArray(rows) ? rows.map((row) => serializeCustomerAddress(helpers, row)) : [],
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/clients/:id/addresses
   * body: { street, house, entrance?, floor?, apartment?, comment?, is_default? }
   */
  router.post('/:id/addresses', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      await ensureCustomerAddressIdentityColumns(db);

      const payloadResult = normalizeCustomerAddressPayload(helpers, req.body);
      if (!payloadResult.ok) {
        return res.status(400).json({ ok: false, error: payloadResult.error });
      }
      let payload = payloadResult.data;
      if (payload.city && (payload.address_ref || payload.address_normalized_display || payload.street || payload.house)) {
        const resolved = await resolveCustomerAddressPayload({
          db,
          helpers,
          tenantId,
          storeId,
          payload: req.body || {},
        });
        if (resolved.ok && resolved.data) {
          payload = {
            ...payload,
            city: resolved.data.city || payload.city,
            street: resolved.data.street || payload.street,
            house: resolved.data.house || payload.house,
            address_ref: resolved.data.address_ref || payload.address_ref,
            selected_object_type: resolved.data.selected_object_type || payload.selected_object_type,
            resolved_city_source_key: resolved.data.resolved_city_source_key || payload.resolved_city_source_key,
            address_context_locality: resolved.data.context_locality || payload.address_context_locality,
            address_normalized_display: resolved.data.address_normalized_display || payload.address_normalized_display,
            lat: resolved.data.lat != null ? resolved.data.lat : payload.lat,
            lng: resolved.data.lng != null ? resolved.data.lng : payload.lng,
            delivery_zone_id: resolved.data.delivery_zone_id != null ? resolved.data.delivery_zone_id : payload.delivery_zone_id,
            delivery_store_id: resolved.data.delivery_store_id != null ? resolved.data.delivery_store_id : payload.delivery_store_id,
          };
        }
      }

      let isDefault = helpers.toBool(req.body.is_default, false) ? 1 : 0;

      await conn.beginTransaction();

      const [cnt] = await conn.query(
        `SELECT COUNT(*) AS c
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1`,
        [tenantId, customerId]
      );
      const hasAny = Number(cnt?.[0]?.c || 0) > 0;
      if (!hasAny) isDefault = 1;

      if (isDefault === 1) {
        await conn.query(
          `UPDATE cust_customer_addresses
           SET is_default=0
           WHERE tenant_id=? AND customer_id=?`,
          [tenantId, customerId]
        );
      }

      const [r] = await conn.query(
        `INSERT INTO cust_customer_addresses
          (tenant_id, customer_id, city, street, house, entrance, floor, apartment, comment, is_default, is_active,
           address_ref, selected_object_type, resolved_city_source_key, address_context_locality, address_normalized_display,
           lat, lng, delivery_zone_id, delivery_store_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          customerId,
          payload.city,
          payload.street,
          payload.house,
          payload.entrance,
          payload.floor,
          payload.apartment,
          payload.comment,
          isDefault,
          payload.address_ref,
          payload.selected_object_type,
          payload.resolved_city_source_key,
          payload.address_context_locality,
          payload.address_normalized_display,
          payload.lat,
          payload.lng,
          payload.delivery_zone_id,
          payload.delivery_store_id,
        ]
      );

      await conn.commit();
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  /**
   * PUT /api/admin/clients/:id/addresses/:addressId/default
   */
  router.put('/:id/addresses/:addressId/default', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      const addressId = Number(req.params.addressId);

      if (!Number.isFinite(customerId) || customerId <= 0 || !Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [a] = await conn.query(
        `SELECT id
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customerId, addressId]
      );
      if (!a.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=0
         WHERE tenant_id=? AND customer_id=?`,
        [tenantId, customerId]
      );

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=1
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customerId, addressId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  /**
   * GET /api/admin/clients/:id/orders/header-candidate
   * Priority:
   *   1) latest active (non-final)
   *   2) latest completed (final, non-cancelled)
   *   3) latest cancelled
   */
  router.get('/:id/orders/header-candidate', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT
           o.id, o.public_id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           o.total_price, o.items, o.status_id,
           s.code AS status_code,
           s.title AS status_title,
           s.color AS status_color,
           COALESCE(s.is_final, 0) AS status_is_final
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1
         ORDER BY
           CASE
             WHEN COALESCE(s.is_final, 0)=0 THEN 0
             WHEN (
               LOWER(COALESCE(s.code, '')) IN ('canceled', 'cancelled')
               OR LOWER(COALESCE(s.title, '')) LIKE 'отмен%%'
               OR LOWER(COALESCE(s.title, '')) LIKE 'cancel%%'
             ) THEN 2
             ELSE 1
           END ASC,
           o.created_at DESC,
           o.id DESC
         LIMIT 1`,
        [tenantId, storeId, customerId]
      );

      const row = rows[0] || null;
      res.json({ ok: true, data: row || null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/clients/:id/addresses/:addressId
   * body: { street, house, entrance?, floor?, apartment?, comment? }
   */
  router.put('/:id/addresses/:addressId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.params.id);
      const addressId = Number(req.params.addressId);
      if (!Number.isFinite(customerId) || customerId <= 0 || !Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      await ensureCustomerAddressIdentityColumns(db);

      const [cur] = await db.query(
        `SELECT ${customerAddressSelectFields}
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customerId, addressId]
      );
      if (!cur.length) {
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      const existing = serializeCustomerAddress(helpers, cur[0]);
      const mergedSource = mergeCustomerAddressSource(existing, req.body);
      const payloadResult = normalizeCustomerAddressPayload(helpers, mergedSource);
      if (!payloadResult.ok) {
        return res.status(400).json({ ok: false, error: payloadResult.error });
      }
      let payload = payloadResult.data;
      if (payload.city && (payload.address_ref || payload.address_normalized_display || payload.street || payload.house)) {
        const resolved = await resolveCustomerAddressPayload({
          db,
          helpers,
          tenantId,
          storeId,
          payload: mergedSource,
        });
        if (resolved.ok && resolved.data) {
          payload = {
            ...payload,
            city: resolved.data.city || payload.city,
            street: resolved.data.street || payload.street,
            house: resolved.data.house || payload.house,
            address_ref: resolved.data.address_ref || payload.address_ref,
            selected_object_type: resolved.data.selected_object_type || payload.selected_object_type,
            resolved_city_source_key: resolved.data.resolved_city_source_key || payload.resolved_city_source_key,
            address_context_locality: resolved.data.context_locality || payload.address_context_locality,
            address_normalized_display: resolved.data.address_normalized_display || payload.address_normalized_display,
            lat: resolved.data.lat != null ? resolved.data.lat : payload.lat,
            lng: resolved.data.lng != null ? resolved.data.lng : payload.lng,
            delivery_zone_id: resolved.data.delivery_zone_id != null ? resolved.data.delivery_zone_id : payload.delivery_zone_id,
            delivery_store_id: resolved.data.delivery_store_id != null ? resolved.data.delivery_store_id : payload.delivery_store_id,
          };
        }
      }

      await db.query(
        `UPDATE cust_customer_addresses
         SET city=?, street=?, house=?, entrance=?, floor=?, apartment=?, comment=?,
             address_ref=?, selected_object_type=?, resolved_city_source_key=?, address_context_locality=?, address_normalized_display=?,
             lat=?, lng=?, delivery_zone_id=?, delivery_store_id=?
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [
          payload.city,
          payload.street,
          payload.house,
          payload.entrance,
          payload.floor,
          payload.apartment,
          payload.comment,
          payload.address_ref,
          payload.selected_object_type,
          payload.resolved_city_source_key,
          payload.address_context_locality,
          payload.address_normalized_display,
          payload.lat,
          payload.lng,
          payload.delivery_zone_id,
          payload.delivery_store_id,
          tenantId,
          customerId,
          addressId,
        ]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id/orders
   */
  router.get('/:id/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT
           o.id, o.public_id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           o.total_price, o.items, o.status_id,
           s.title AS status_title, s.color AS status_color
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 50`,
        [tenantId, storeId, customerId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/clients/:id/addresses/:addressId
   * soft delete (is_active=0). If deleted default -> set another default.
   */
  router.delete('/:id/addresses/:addressId', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      const addressId = Number(req.params.addressId);

      if (!Number.isFinite(customerId) || customerId <= 0 || !Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [cur] = await conn.query(
        `SELECT id, is_default
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customerId, addressId]
      );
      if (!cur.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      const wasDefault = Number(cur[0].is_default || 0) === 1;

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_active=0, is_default=0
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customerId, addressId]
      );

      if (wasDefault) {
        const [any] = await conn.query(
          `SELECT id
           FROM cust_customer_addresses
           WHERE tenant_id=? AND customer_id=? AND is_active=1
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
          [tenantId, customerId]
        );
        if (any.length) {
          await conn.query(
            `UPDATE cust_customer_addresses
             SET is_default=1
             WHERE tenant_id=? AND customer_id=? AND id=?`,
            [tenantId, customerId, Number(any[0].id)]
          );
        }
      }

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // ============================================
  // MARKETING FILTERS
  // ============================================

  /**
   * GET /api/admin/clients/filters
   * Получить все кастомные фильтры
   */
  router.get('/filters/list', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const filterSupport = { gender: await hasCustomerGenderColumn() };

      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, title, icon, color, conditions, sort_order, is_active, created_at, updated_at
         FROM cust_categories
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId, storeId]
      );

      const normalizedFilters = rows.map((filter) => ({
        filter,
        conditions: normalizeFilterConditions(filter.conditions, { allowGender: !!filterSupport.gender }),
      }));
      const hasAdvancedFilters = normalizedFilters.some(({ conditions }) => (
        conditions.rules.some((rule) => isAdvancedFilterRule(rule))
      ));

      let filtersWithCounts = [];
      if (hasAdvancedFilters) {
        const clients = await loadClientsForFilterEvaluation(
          tenantId,
          'c.tenant_id=?',
          [tenantId],
          {
            filterSupport,
            needFavorites: true,
          }
        );
        filtersWithCounts = normalizedFilters.map(({ filter, conditions }) => ({
          ...filter,
          conditions,
          count: clients.filter((client) => doesClientMatchCustomFilter(client, conditions, { allowGender: !!filterSupport.gender })).length,
        }));
      } else {
        filtersWithCounts = await Promise.all(rows.map(async (filter) => {
          const result = await getCustomFilterCount(tenantId, filter.conditions, { filterSupport });
          return {
            ...filter,
            conditions: result.conditions,
            count: result.count,
          };
        }));
      }

      res.json({
        ok: true,
        data: filtersWithCounts,
        meta: {
          filter_capabilities: {
            gender: !!filterSupport.gender,
          },
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/filters/preview-count', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const filterSupport = { gender: await hasCustomerGenderColumn() };
      const result = await getCustomFilterCount(tenantId, req.body?.conditions, { filterSupport });
      res.json({
        ok: true,
        data: {
          count: result.count,
          conditions: result.conditions,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/clients/filters
   * Создать новый фильтр
   * body: { title, icon?, color?, conditions }
   */
  router.post('/filters', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const filterSupport = { gender: await hasCustomerGenderColumn() };

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const icon = helpers.strOrNull(req.body.icon) || 'fa-filter';
      const color = helpers.strOrNull(req.body.color);
      const conditions = normalizeFilterConditions(req.body.conditions, { allowGender: !!filterSupport.gender });

      // Получаем следующий sort_order
      const [maxSort] = await db.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort
         FROM cust_categories
         WHERE tenant_id=? AND store_id=?`,
        [tenantId, storeId]
      );
      const sortOrder = Number(maxSort?.[0]?.next_sort || 1);

      const [r] = await db.query(
        `INSERT INTO cust_categories
          (tenant_id, store_id, title, icon, color, conditions, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [tenantId, storeId, title, icon, color, JSON.stringify(conditions), sortOrder]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/clients/filters/:id
   * Обновить фильтр
   */
  router.put('/filters/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const filterSupport = { gender: await hasCustomerGenderColumn() };
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const updates = [];
      const params = [];

      if (req.body.title !== undefined) {
        updates.push('title=?');
        params.push(helpers.strOrNull(req.body.title) || 'Фильтр');
      }
      if (req.body.icon !== undefined) {
        updates.push('icon=?');
        params.push(helpers.strOrNull(req.body.icon) || 'fa-filter');
      }
      if (req.body.color !== undefined) {
        updates.push('color=?');
        params.push(helpers.strOrNull(req.body.color));
      }
      if (req.body.conditions !== undefined) {
        updates.push('conditions=?');
        params.push(JSON.stringify(normalizeFilterConditions(req.body.conditions, { allowGender: !!filterSupport.gender })));
      }
      if (req.body.sort_order !== undefined) {
        updates.push('sort_order=?');
        params.push(Number(req.body.sort_order) || 0);
      }

      if (!updates.length) {
        return res.status(400).json({ ok: false, error: 'NO_CHANGES' });
      }

      params.push(tenantId, storeId, id);

      await db.query(
        `UPDATE cust_categories
         SET ${updates.join(', ')}
         WHERE tenant_id=? AND store_id=? AND id=?`,
        params
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/clients/filters/:id
   * Удалить фильтр (soft delete)
   */
  router.delete('/filters/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await db.query(
        `UPDATE cust_categories
         SET is_active=0
         WHERE tenant_id=? AND store_id=? AND id=?`,
        [tenantId, storeId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id/discounts
   * Получить скидки, привязанные к клиенту (напрямую или через категории)
   */
  router.get('/:id/discounts', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const clientId = Number(req.params.id);

      if (!Number.isFinite(clientId) || clientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Получаем категории клиента
      const [customerCategories] = await db.query(
        `SELECT cc.id
         FROM cust_categories cc
         WHERE cc.tenant_id = ? AND cc.store_id = ? AND cc.is_active = 1`,
        [tenantId, storeId]
      );

      // Для каждой категории проверяем попадает ли клиент в неё
      // Это упрощённая версия - в реальности нужно проверять условия фильтра
      // Пока берём все скидки привязанные напрямую к клиенту

      // Скидки привязанные напрямую к клиенту
      const [directDiscounts] = await db.query(
        `SELECT DISTINCT d.id, d.title, d.discount_type, d.discount_value,
                d.apply_to, d.is_active, d.starts_at, d.ends_at,
                d.min_order_amount, d.max_discount_amount, d.is_stackable, d.priority,
                d.usage_limit, d.usage_count, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
                'direct' AS link_type
         FROM mkt_discounts d
         JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND d.store_id = ? AND dc.customer_id = ?`,
        [tenantId, storeId, clientId]
      );

      // Скидки по категориям клиента (все категории где target_type='all' или есть customer_category_id)
      const [categoryDiscounts] = await db.query(
        `SELECT DISTINCT d.id, d.title, d.discount_type, d.discount_value,
                d.apply_to, d.is_active, d.starts_at, d.ends_at,
                d.min_order_amount, d.max_discount_amount, d.is_stackable, d.priority,
                d.usage_limit, d.usage_count, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
                'category' AS link_type, cc.title AS category_title
         FROM mkt_discounts d
         JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
         JOIN cust_categories cc ON cc.id = dc.customer_category_id AND cc.tenant_id = dc.tenant_id
         WHERE d.tenant_id = ? AND d.store_id = ? AND dc.customer_category_id IS NOT NULL`,
        [tenantId, storeId]
      );

      // Объединяем и убираем дубликаты
      const allDiscounts = [...directDiscounts];
      const existingIds = new Set(directDiscounts.map(d => d.id));
      
      for (const discount of categoryDiscounts) {
        if (!existingIds.has(discount.id)) {
          allDiscounts.push(discount);
          existingIds.add(discount.id);
        }
      }

      res.json({ ok: true, data: allDiscounts });
    } catch (e) {
      console.error('GET /api/admin/clients/:id/discounts error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
