
const express = require("express");
const { sendOrderToPrintBot } = require("../printPush");
const {
  applyStockDeductionForOrderItems,
  checkStockAvailabilityForOrderItems,
} = require("../helpers/orderStock");
const discountHelpers = require("../helpers/discounts");
const {
  roundMoney,
  buildOrderRefundState,
  buildRefundPlan,
} = require("../helpers/orderRefunds");
const {
  buildDefaultQuote,
  buildDeliveryQuote,
  loadDefaultDeliverySettings,
} = require("../../data/delivery-quote");
const { getTenantMapConfig } = require("../../data/tenant-map-config");
const {
  loadCustomerAddressById,
  normalizeCustomerAddressPayload,
} = require("../../data/customer-address");
const {
  getCheckoutBenefitsPreviewProvider,
} = require("../../services/checkout-benefits-preview-provider");
const {
  getOrderBenefitsAccrualProvider,
} = require("../../services/order-benefits-accrual-provider");
const makePrintApiRouter = require("../print");

module.exports = function makeAdminOrdersRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();
  const orderPrintTemplateBuilder = typeof makePrintApiRouter.createOrderPrintTemplateBuilder === "function"
    ? makePrintApiRouter.createOrderPrintTemplateBuilder({ db, helpers })
    : null;
  let orderDeliveryTypeColumnsReady = false;
  let ensureOrderDeliveryTypeColumnsPromise = null;
  let orderBenefitsMetaColumnReady = false;
  let ensureOrderBenefitsMetaColumnPromise = null;
  let refundTablesReady = false;
  let ensureRefundTablesPromise = null;

  async function syncCustomerOrderMetrics(queryable, tenantId, customerIds) {
    const ids = [...new Set((Array.isArray(customerIds) ? customerIds : [customerIds])
      .map((value) => Number(value || 0))
      .filter((value) => Number.isFinite(value) && value > 0))];
    if (!ids.length) return;

    const placeholders = ids.map(() => '?').join(',');
    await queryable.query(
      `UPDATE cust_customers c
       LEFT JOIN (
         SELECT
           tenant_id,
           customer_id,
           COUNT(*) AS total_orders,
           COALESCE(SUM(COALESCE(total_price, 0)), 0) AS total_spent,
           MAX(created_at) AS last_order_date
         FROM order_orders
         WHERE tenant_id=? AND is_active=1 AND customer_id IN (${placeholders})
         GROUP BY tenant_id, customer_id
       ) order_metrics
         ON order_metrics.tenant_id = c.tenant_id
        AND order_metrics.customer_id = c.id
       SET
         c.total_orders = COALESCE(order_metrics.total_orders, 0),
         c.total_spent = COALESCE(order_metrics.total_spent, 0),
         c.last_order_date = order_metrics.last_order_date
       WHERE c.tenant_id=? AND c.id IN (${placeholders})`,
      [tenantId, ...ids, tenantId, ...ids]
    );
  }

  async function ensureOrderDeliveryTypeColumns() {
    if (orderDeliveryTypeColumnsReady) return true;
    if (ensureOrderDeliveryTypeColumnsPromise) return ensureOrderDeliveryTypeColumnsPromise;

    ensureOrderDeliveryTypeColumnsPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM order_delivery_types');
      const existing = new Set((columnRows || []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      const requiredColumns = [
        {
          name: 'require_client_data',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Обязательны ли данные клиента (имя/телефон)'",
        },
        {
          name: 'show_on_site',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Показывать способ на сайте'",
        },
      ];

      for (const column of requiredColumns) {
        if (existing.has(column.name)) continue;
        try {
          await db.query(`ALTER TABLE order_delivery_types ADD COLUMN \`${column.name}\` ${column.sql}`);
          existing.add(column.name);
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add(column.name);
            continue;
          }
          throw err;
        }
      }

      orderDeliveryTypeColumnsReady = requiredColumns.every((column) => existing.has(column.name));
      return orderDeliveryTypeColumnsReady;
    })()
      .catch((err) => {
        ensureOrderDeliveryTypeColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (orderDeliveryTypeColumnsReady) {
          ensureOrderDeliveryTypeColumnsPromise = null;
        }
      });

    return ensureOrderDeliveryTypeColumnsPromise;
  }

  async function ensureRefundTables() {
    if (refundTablesReady) return true;
    if (ensureRefundTablesPromise) return ensureRefundTablesPromise;

    ensureRefundTablesPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS order_refunds (
          id INT NOT NULL AUTO_INCREMENT,
          tenant_id INT NOT NULL,
          store_id INT NOT NULL,
          order_id INT NOT NULL,
          payment_id INT DEFAULT NULL,
          payment_code VARCHAR(50) NOT NULL,
          payment_title VARCHAR(100) DEFAULT NULL,
          payment_icon VARCHAR(255) DEFAULT NULL,
          items_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          delivery_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          comment TEXT DEFAULT NULL,
          is_full TINYINT(1) NOT NULL DEFAULT 0,
          created_by_user_id INT DEFAULT NULL,
          created_by_name VARCHAR(150) DEFAULT NULL,
          created_by_email VARCHAR(150) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_order_refunds_order (tenant_id, store_id, order_id),
          KEY idx_order_refunds_created (tenant_id, store_id, created_at)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS order_refund_items (
          id INT NOT NULL AUTO_INCREMENT,
          tenant_id INT NOT NULL,
          store_id INT NOT NULL,
          order_id INT NOT NULL,
          refund_id INT NOT NULL,
          source_item_index INT NOT NULL,
          item_snapshot LONGTEXT NOT NULL,
          refunded_qty DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          line_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_order_refund_items_refund (tenant_id, store_id, refund_id),
          KEY idx_order_refund_items_order (tenant_id, store_id, order_id, source_item_index)
        )
      `);
      refundTablesReady = true;
      return true;
    })()
      .catch((err) => {
        ensureRefundTablesPromise = null;
        throw err;
      })
      .finally(() => {
        if (refundTablesReady) ensureRefundTablesPromise = null;
      });

    return ensureRefundTablesPromise;
  }

  async function ensureOrderBenefitsMetaColumn() {
    if (orderBenefitsMetaColumnReady) return true;
    if (ensureOrderBenefitsMetaColumnPromise) return ensureOrderBenefitsMetaColumnPromise;

    ensureOrderBenefitsMetaColumnPromise = (async () => {
      const [columnRows] = await db.query("SHOW COLUMNS FROM order_orders");
      const existing = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || "").trim()).filter(Boolean));
      orderBenefitsMetaColumnReady = existing.has("benefits_meta_json");
      return orderBenefitsMetaColumnReady;
    })()
      .catch((err) => {
        ensureOrderBenefitsMetaColumnPromise = null;
        throw err;
      })
      .finally(() => {
        ensureOrderBenefitsMetaColumnPromise = null;
      });

    return ensureOrderBenefitsMetaColumnPromise;
  }

  function normalizeOrderBenefitsPreviewMode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "all") return "all";
    if (raw === "customer") return "customer";
    return null;
  }

  function normalizeOrderBenefitsSelectedId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function normalizeOrderBenefitsDiscountSource(value) {
    const raw = String(value || "").trim().toLowerCase();
    return ["discount", "reward_discount"].includes(raw) ? raw : null;
  }

  function normalizeOrderBenefitsPromoSource(value) {
    const raw = String(value || "").trim().toLowerCase();
    return ["promo_code", "reward_promo"].includes(raw) ? raw : null;
  }

  function parseOrderBenefitsMetaJson(rawValue) {
    if (!rawValue) return null;
    let parsed = rawValue;
    try {
      if (typeof rawValue === "string") {
        parsed = JSON.parse(rawValue);
      }
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const meta = {
      selected_discount_id: normalizeOrderBenefitsSelectedId(parsed?.selected_discount_id),
      selected_discount_source: normalizeOrderBenefitsDiscountSource(parsed?.selected_discount_source),
      selected_promo_source: normalizeOrderBenefitsPromoSource(parsed?.selected_promo_source),
      selected_promo_reward_id: normalizeOrderBenefitsSelectedId(parsed?.selected_promo_reward_id),
      benefits_preview_mode: normalizeOrderBenefitsPreviewMode(parsed?.benefits_preview_mode),
      bonus_redeem_enabled: parsed?.bonus_redeem_enabled === true || parsed?.bonus_redeem_enabled === "true" || Number(parsed?.bonus_redeem_enabled || 0) === 1,
      bonus_redeem_amount: Number.isFinite(Number(parsed?.bonus_redeem_amount)) && Number(parsed?.bonus_redeem_amount) > 0
        ? Number(parsed.bonus_redeem_amount)
        : null,
      bonus_accrual_amount: Number.isFinite(Number(parsed?.bonus_accrual_amount)) && Number(parsed?.bonus_accrual_amount) > 0
        ? Number(parsed.bonus_accrual_amount)
        : null,
      bonus_accrual_blocked_by_redeem: parsed?.bonus_accrual_blocked_by_redeem === true || parsed?.bonus_accrual_blocked_by_redeem === "true" || Number(parsed?.bonus_accrual_blocked_by_redeem || 0) === 1,
      bonus_account_id: Number.isFinite(Number(parsed?.bonus_account_id)) && Number(parsed?.bonus_account_id) > 0
        ? Number(parsed.bonus_account_id)
        : null,
      bonus_level_id: Number.isFinite(Number(parsed?.bonus_level_id)) && Number(parsed?.bonus_level_id) > 0
        ? Number(parsed.bonus_level_id)
        : null,
    };
    if (!meta.selected_discount_id) meta.selected_discount_source = null;
    if (meta.selected_promo_source === "reward_promo" && !meta.selected_promo_reward_id) {
      meta.selected_promo_source = null;
    }
    if (!meta.bonus_redeem_amount) meta.bonus_redeem_enabled = null;
    if (!meta.bonus_accrual_blocked_by_redeem) meta.bonus_accrual_blocked_by_redeem = null;
    const hasValues = Object.values(meta).some((value) => value !== null);
    return hasValues ? meta : null;
  }

  function parseOrderDiscountsJson(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) return rawValue;
    let parsed = rawValue;
    try {
      if (typeof rawValue === "string") {
        parsed = JSON.parse(rawValue);
      }
    } catch {
      return [];
    }
    return Array.isArray(parsed) ? parsed : [];
  }

  function getOrderBonusRedeemAmount(rawDiscounts, benefitsMetaRaw = null) {
    const benefitsMeta = benefitsMetaRaw && typeof benefitsMetaRaw === "object" && !Array.isArray(benefitsMetaRaw)
      ? benefitsMetaRaw
      : parseOrderBenefitsMetaJson(benefitsMetaRaw);
    let amount = 0;
    for (const entry of parseOrderDiscountsJson(rawDiscounts)) {
      const key = String(entry?.key || "").trim().toLowerCase();
      const sourceKind = String(entry?.source_kind || entry?.sourceKind || "").trim().toLowerCase();
      const title = String(entry?.title || entry?.name || "").trim().toLowerCase();
      if (key !== "bonus_redeem" && sourceKind !== "bonus" && title !== "бонусы") continue;
      amount = roundMoney(amount + Math.max(0, Number(entry?.discount_amount ?? entry?.amount ?? 0)));
    }
    if (!(amount > 0)) {
      amount = roundMoney(Math.max(0, Number(benefitsMeta?.bonus_redeem_amount || 0)));
    }
    return amount;
  }

  async function loadBonusProgramSettings(queryable, tenantId) {
    const [rows] = await queryable.query(
      `SELECT bonus_program_enabled, allow_redeem_and_accrue
         FROM mkt_bonus_program_settings
        WHERE tenant_id=?
        LIMIT 1`,
      [tenantId]
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    return {
      enabled: Number(row?.bonus_program_enabled || 0) === 1,
      allowRedeemAndAccrue: Number(row?.allow_redeem_and_accrue || 0) === 1,
    };
  }

  function toMysqlDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function getBonusLevelRequirementProgressRows(progress) {
    if (!progress || typeof progress !== "object") return [];
    return [
      [progress.amountCurrent, progress.amountTarget],
      [progress.ordersCurrent, progress.ordersTarget],
      [progress.referralsCurrent, progress.referralsTarget],
      [progress.bonusAccruedCurrent, progress.bonusAccruedTarget],
      [progress.bonusRedeemedCurrent, progress.bonusRedeemedTarget],
    ].filter(([, target]) => Number(target || 0) > 0);
  }

  function isBonusLevelRequirementComplete(progress) {
    const rows = getBonusLevelRequirementProgressRows(progress);
    if (!rows.length) return false;
    const required = Math.min(rows.length, Math.max(1, Math.floor(Number(progress.matchCount || 1))));
    const matched = rows.filter(([current, target]) => Number(current || 0) >= Number(target || 0)).length;
    return matched >= required;
  }

  async function loadBonusLevelRequirementProgress(queryable, tenantId, customerId, account, level) {
    const amountTarget = Math.max(0, Number(level?.requirement_amount || 0));
    const ordersTarget = Math.max(0, Math.floor(Number(level?.requirement_orders || 0)));
    const referralsTarget = Math.max(0, Math.floor(Number(level?.requirement_referrals || 0)));
    const bonusAccruedTarget = Math.max(0, Number(level?.requirement_bonus_accrued || 0));
    const bonusRedeemedTarget = Math.max(0, Number(level?.requirement_bonus_redeemed || 0));
    const baseStart = account?.level_assigned_at || account?.joined_at;
    let sinceAt = toMysqlDateTime(baseStart);
    if (!sinceAt) return null;
    const periodDays = Math.max(0, Math.floor(Number(level?.requirement_period_days || 0)));
    if (periodDays > 0) {
      const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      const baseDate = new Date(baseStart);
      sinceAt = toMysqlDateTime(baseDate > periodStart ? baseDate : periodStart);
    }

    const [[orderStats]] = await queryable.query(
      `SELECT COUNT(*) AS orders_count,
              COALESCE(SUM(COALESCE(o.total_price, 0)), 0) AS orders_amount
         FROM order_orders o
         LEFT JOIN order_statuses os
           ON os.tenant_id = o.tenant_id
          AND os.store_id = o.store_id
          AND os.id = o.status_id
        WHERE o.tenant_id = ?
          AND o.customer_id = ?
          AND o.is_active = 1
          AND o.created_at >= ?
          AND LOWER(COALESCE(os.code, '')) NOT IN ('canceled', 'cancelled')
          AND (o.is_paid = 1 OR COALESCE(os.is_final, 0) = 1)`,
      [tenantId, customerId, sinceAt]
    );
    const [[referralStats]] = await queryable.query(
      `SELECT COUNT(*) AS referrals_count
         FROM mkt_customer_referrals
        WHERE tenant_id = ?
          AND inviter_customer_id = ?
          AND status IN ('registered', 'first_purchase_paid')
          AND registered_at >= ?`,
      [tenantId, customerId, sinceAt]
    );
    const useCumulativeBonusAccrued = bonusAccruedTarget > 0 && !(periodDays > 0);
    const bonusAccruedSinceAt = useCumulativeBonusAccrued ? toMysqlDateTime(account?.joined_at) : sinceAt;
    const bonusStatsSinceAt = bonusAccruedSinceAt && bonusAccruedSinceAt < sinceAt ? bonusAccruedSinceAt : sinceAt;
    const bonusAccruedConsumed = useCumulativeBonusAccrued
      ? getBonusAccruedConsumedBeforeLevel(level?._allLevels, Number(level?.id || 0))
      : 0;
    const [[bonusStats]] = await queryable.query(
      `SELECT
          COALESCE(SUM(CASE WHEN type IN ('join', 'accrual', 'referral_accrual', 'level_up') AND created_at >= ? THEN amount ELSE 0 END), 0) AS bonus_accrued,
          COALESCE(SUM(CASE WHEN type = 'redeem' AND created_at >= ? THEN amount ELSE 0 END), 0) AS bonus_redeemed
         FROM mkt_customer_bonus_transactions
        WHERE tenant_id = ?
          AND customer_id = ?
          AND created_at >= ?`,
      [bonusAccruedSinceAt || sinceAt, sinceAt, tenantId, customerId, bonusStatsSinceAt]
    );
    return {
      amountCurrent: Number(orderStats?.orders_amount || 0),
      amountTarget,
      ordersCurrent: Number(orderStats?.orders_count || 0),
      ordersTarget,
      referralsCurrent: Number(referralStats?.referrals_count || 0),
      referralsTarget,
      bonusAccruedCurrent: Math.max(0, Number(bonusStats?.bonus_accrued || 0) - bonusAccruedConsumed),
      bonusAccruedTarget,
      bonusRedeemedCurrent: Number(bonusStats?.bonus_redeemed || 0),
      bonusRedeemedTarget,
      matchCount: Math.max(1, Number(level?.requirement_match_count || 1)),
    };
  }

  function getBonusAccruedTarget(level) {
    if (!level || String(level?.access_type || "").trim() !== "conditions") return 0;
    return Math.max(0, Number(level.requirement_bonus_accrued || 0));
  }

  function getBonusAccruedConsumedBeforeLevel(levels, targetLevelId) {
    const rows = Array.isArray(levels) ? levels : [];
    const targetId = Number(targetLevelId || 0);
    let consumed = 0;
    for (const row of rows) {
      if (Number(row?.id || 0) === targetId) break;
      consumed += getBonusAccruedTarget(row);
    }
    return consumed;
  }

  async function promoteOrderBonusAccountIfEligible(queryable, tenantId, customerId) {
    const [accountRows] = await queryable.query(
      `SELECT id, customer_id, level_id, balance, joined_at, level_assigned_at
         FROM mkt_customer_bonus_accounts
        WHERE tenant_id = ? AND customer_id = ?
        LIMIT 1
        FOR UPDATE`,
      [tenantId, customerId]
    );
    const account = Array.isArray(accountRows) && accountRows.length ? accountRows[0] : null;
    if (!account?.joined_at || !(Number(account?.id || 0) > 0)) return null;

    const [levels] = await queryable.query(
      `SELECT id, sort_order, access_type, reward_bonus_amount,
              requirement_amount, requirement_orders, requirement_referrals,
              requirement_bonus_accrued, requirement_bonus_redeemed,
              requirement_match_count, requirement_period_days
         FROM mkt_bonus_levels
        WHERE tenant_id = ? AND is_active = 1
        ORDER BY sort_order ASC, id ASC`,
      [tenantId]
    );
    const rows = Array.isArray(levels) ? levels : [];
    let currentAccount = { ...account };
    for (let guard = 0; guard < rows.length; guard += 1) {
      const currentLevelId = Number(currentAccount.level_id || 0);
      const currentIndex = rows.findIndex((row) => Number(row?.id || 0) === currentLevelId);
      if (currentIndex < 0) break;
      const nextLevel = rows.slice(currentIndex + 1).find((row) => String(row?.access_type || "").trim() === "conditions");
      if (!nextLevel) break;

      const progress = await loadBonusLevelRequirementProgress(
        queryable,
        tenantId,
        customerId,
        currentAccount,
        { ...nextLevel, _allLevels: rows }
      );
      if (!isBonusLevelRequirementComplete(progress)) break;

      const rewardAmount = roundMoney(Math.max(0, Number(nextLevel.reward_bonus_amount || 0)));
      const nextBalance = roundMoney(Number(currentAccount.balance || 0) + rewardAmount);
      const [updateResult] = await queryable.query(
        `UPDATE mkt_customer_bonus_accounts
            SET level_id = ?,
                balance = COALESCE(balance, 0) + ?,
                total_accrued = COALESCE(total_accrued, 0) + ?,
                level_assigned_at = NOW()
          WHERE tenant_id = ? AND id = ? AND customer_id = ? AND level_id = ?`,
        [Number(nextLevel.id), rewardAmount, rewardAmount, tenantId, Number(account.id), customerId, currentLevelId]
      );
      if (!(Number(updateResult?.affectedRows || 0) > 0)) break;

      await queryable.query(
        `INSERT INTO mkt_customer_bonus_transactions
           (tenant_id, account_id, customer_id, level_id, type, amount, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, 'level_up', ?, ?, ?, NOW())`,
        [tenantId, Number(account.id), customerId, Number(nextLevel.id), rewardAmount, nextBalance, "level_up"]
      );
      await queryable.query(
        `INSERT INTO mkt_customer_bonus_modal_events
           (tenant_id, customer_id, event_type, from_level_id, to_level_id, created_at)
         VALUES (?, ?, 'level_up', ?, ?, NOW())`,
        [tenantId, customerId, currentLevelId || null, Number(nextLevel.id)]
      );
      currentAccount = {
        ...currentAccount,
        level_id: Number(nextLevel.id),
        balance: nextBalance,
        level_assigned_at: new Date(),
      };
    }
    return currentAccount;
  }

  function parseOrderItemsJson(rawValue) {
    if (Array.isArray(rawValue)) return rawValue;
    if (!rawValue) return [];
    try {
      const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function parseBonusCategoryGroupIds(rawValue) {
    const values = parseOrderItemsJson(rawValue);
    return values
      .map((id) => Number(id || 0))
      .filter((id, index, list) => id > 0 && list.indexOf(id) === index);
  }

  function getOrderBonusItemCategoryIds(item) {
    const ids = new Set();
    [
      item?.category_id,
      item?._category_id,
      item?.combo_category_id,
      item?.product?.category_id,
      item?.product_category_id,
    ].forEach((id) => {
      const numericId = Number(id || 0);
      if (numericId > 0) ids.add(numericId);
    });
    if (Array.isArray(item?.category_ids)) {
      item.category_ids.forEach((id) => {
        const numericId = Number(id || 0);
        if (numericId > 0) ids.add(numericId);
      });
    }
    return ids;
  }

  function orderBonusItemMatchesFavoriteCategory(item, selectedCategoryIds, comboCategoryIdsById = new Map()) {
    if (!(selectedCategoryIds instanceof Set) || !selectedCategoryIds.size) return false;
    const ids = getOrderBonusItemCategoryIds(item);
    const comboId = Number(item?.combo_id || item?.combo?.id || 0);
    if (comboId > 0 && comboCategoryIdsById instanceof Map) {
      const comboCategoryId = Number(comboCategoryIdsById.get(comboId) || 0);
      if (comboCategoryId > 0) ids.add(comboCategoryId);
    }
    if (!ids.size) return false;
    return Array.from(ids).some((id) => selectedCategoryIds.has(id));
  }

  function getOrderBonusItemFavoritePercent(item, selectedCategoryPercents, comboCategoryIdsById = new Map()) {
    if (!(selectedCategoryPercents instanceof Map) || !selectedCategoryPercents.size) return 0;
    const comboId = Number(item?.combo_id || item?.combo?.id || 0);
    const isCombo = String(item?.type || '').trim().toLowerCase() === 'combo' || comboId > 0;
    if (isCombo) {
      const comboCategoryId = Number(item?.combo_category_id || comboCategoryIdsById.get(comboId) || 0);
      if (comboCategoryId > 0) return Math.max(0, Number(selectedCategoryPercents.get(comboCategoryId) || 0));
      const ids = getOrderBonusItemCategoryIds(item);
      const categoryId = Array.from(ids)[0] || 0;
      return categoryId > 0 ? Math.max(0, Number(selectedCategoryPercents.get(categoryId) || 0)) : 0;
    }
    const ids = getOrderBonusItemCategoryIds(item);
    let percent = 0;
    ids.forEach((id) => {
      percent = Math.max(percent, Number(selectedCategoryPercents.get(id) || 0));
    });
    return Math.max(0, percent);
  }

  async function calculateStoredOrderBonusAccrual(queryable, tenantId, orderId, customerId, levelId) {
    if (!(tenantId > 0) || !(orderId > 0) || !(customerId > 0) || !(levelId > 0)) return null;
    const [[orderRow]] = await queryable.query(
      `SELECT items
         FROM order_orders
        WHERE tenant_id = ? AND id = ?
        LIMIT 1`,
      [tenantId, orderId]
    );
    const items = parseOrderItemsJson(orderRow?.items).filter((item) => Number(item?.is_gift_reward || 0) !== 1);
    if (!items.length) return null;

    const [[levelRow]] = await queryable.query(
      `SELECT id, cashback_percent, favorite_categories_limit
         FROM mkt_bonus_levels
        WHERE tenant_id = ? AND id = ? AND is_active = 1
        LIMIT 1`,
      [tenantId, levelId]
    );
    if (!(Number(levelRow?.id || 0) > 0)) return null;

    const [rangeRows] = await queryable.query(
      `SELECT amount, percent
         FROM mkt_bonus_level_order_ranges
        WHERE tenant_id = ? AND level_id = ?
        ORDER BY amount DESC, sort_order DESC, id DESC`,
      [tenantId, levelId]
    );
    const orderTotal = roundMoney(items.reduce((sum, item) => (
      sum + Math.max(0, Number(item?.line_total || 0))
    ), 0));
    const orderRangePercent = (Array.isArray(rangeRows) ? rangeRows : [])
      .map((row) => ({
        amount: Math.max(0, Number(row?.amount || 0)),
        percent: Math.max(0, Number(row?.percent || 0)),
      }))
      .find((row) => row.amount > 0 && row.percent > 0 && orderTotal >= row.amount)?.percent || 0;

    let selectedCategoryPercents = new Map();
    let comboCategoryIdsById = new Map();
    const favoriteLimit = Math.max(0, Math.floor(Number(levelRow.favorite_categories_limit || 0)));
    if (favoriteLimit > 0) {
      const [groupItemRows] = await queryable.query(
        `SELECT i.category_id, i.bonus_percent
           FROM mkt_bonus_category_groups g
           JOIN mkt_bonus_category_group_items i
             ON i.tenant_id = g.tenant_id AND i.group_id = g.id
           JOIN prod_categories pc
             ON pc.tenant_id = i.tenant_id AND pc.id = i.category_id
          WHERE g.tenant_id = ? AND g.month_number = MONTH(CURDATE()) AND pc.is_active = 1`,
        [tenantId]
      );
      const activeCategoryPercents = new Map(
        (Array.isArray(groupItemRows) ? groupItemRows : [])
          .map((row) => [Number(row?.category_id || 0), Math.max(0, Number(row?.bonus_percent || 0))])
          .filter(([categoryId]) => categoryId > 0)
      );
      const [categoryRows] = activeCategoryPercents.size ? await queryable.query(
        `SELECT category_id
           FROM mkt_customer_bonus_favorite_categories
          WHERE tenant_id = ? AND customer_id = ? AND period_key = DATE_FORMAT(CURDATE(), '%Y-%m')`,
        [tenantId, customerId]
      ) : [[]];
      const selectedIds = (Array.isArray(categoryRows) ? categoryRows : [])
        .map((row) => Number(row?.category_id || 0))
        .filter((id, index, list) => id > 0 && activeCategoryPercents.has(id) && list.indexOf(id) === index)
        .slice(0, favoriteLimit);
      selectedCategoryPercents = new Map(
        selectedIds.map((id) => [id, activeCategoryPercents.get(id) || 0])
      );
      const unresolvedComboIds = [...new Set(items
        .filter((item) => String(item?.type || '').trim().toLowerCase() === 'combo' || Number(item?.combo_id || item?.combo?.id || 0) > 0)
        .filter((item) => !(Number(item?.combo_category_id || item?.combo?.combo_category_id || item?.combo?.category_id || 0) > 0))
        .map((item) => Number(item?.combo_id || item?.combo?.id || 0))
        .filter((id) => id > 0))];
      if (selectedCategoryPercents.size && unresolvedComboIds.length) {
        const [comboRows] = await queryable.query(
          `SELECT combo.id AS combo_id, category.id AS category_id
             FROM prod_combos combo
             JOIN prod_categories category
               ON category.tenant_id = combo.tenant_id
              AND LOWER(TRIM(category.code)) = LOWER(TRIM(combo.category_code))
            WHERE combo.tenant_id = ? AND combo.id IN (?)`,
          [tenantId, unresolvedComboIds]
        );
        comboCategoryIdsById = new Map(
          (Array.isArray(comboRows) ? comboRows : [])
            .map((row) => [Number(row?.combo_id || 0), Number(row?.category_id || 0)])
            .filter(([comboId, categoryId]) => comboId > 0 && categoryId > 0)
        );
      }
    }

    const cashbackPercent = Math.max(0, Number(levelRow.cashback_percent || 0)) + orderRangePercent;
    let rawBonus = 0;
    items.forEach((item) => {
      const lineTotal = roundMoney(Math.max(0, Number(item?.line_total || 0)));
      if (!(lineTotal > 0)) return;
      const favoritePercent = getOrderBonusItemFavoritePercent(item, selectedCategoryPercents, comboCategoryIdsById);
      const percent = cashbackPercent + favoritePercent;
      if (!(percent > 0)) return;
      rawBonus += lineTotal * percent / 100;
    });
    return Math.floor(Math.max(0, rawBonus));
  }

  async function getBonusTransactionAmount(queryable, tenantId, orderId, type, reason) {
    const [rows] = await queryable.query(
      `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM mkt_customer_bonus_transactions
        WHERE tenant_id=? AND type=? AND (order_id=? OR reason=?)`,
      [tenantId, type, orderId, reason]
    );
    return roundMoney(Math.max(0, Number(rows?.[0]?.amount || 0)));
  }

  async function reserveOrderBonusRedeem(queryable, {
    tenantId,
    orderId,
    customerId,
    discountsJson = null,
    benefitsMetaRaw = null,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedOrderId = Number(orderId || 0);
    const normalizedCustomerId = Number(customerId || 0);
    if (!(normalizedTenantId > 0) || !(normalizedOrderId > 0) || !(normalizedCustomerId > 0)) return { reserved: 0 };

    const targetAmount = getOrderBonusRedeemAmount(discountsJson, benefitsMetaRaw);
    const reserveReason = `order:${normalizedOrderId}:bonus_reserve`;
    const releaseReason = `order:${normalizedOrderId}:bonus_release`;
    const redeemReason = `order:${normalizedOrderId}:bonus_redeem`;
    const alreadyRedeemed = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "redeem", redeemReason);
    if (alreadyRedeemed > 0) return { reserved: alreadyRedeemed };

    const reservedAmount = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "adjustment", reserveReason);
    const releasedAmount = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "refund", releaseReason);
    const activeReserved = roundMoney(Math.max(0, reservedAmount - releasedAmount));
    if (!(targetAmount > 0)) {
      if (activeReserved > 0) {
        await releaseOrderBonusReserve(queryable, { tenantId, orderId, customerId });
      }
      return { reserved: 0 };
    }

    const [accountRows] = await queryable.query(
      `SELECT id, customer_id, level_id, balance, status, joined_at
         FROM mkt_customer_bonus_accounts
        WHERE tenant_id=? AND customer_id=?
        LIMIT 1
        FOR UPDATE`,
      [normalizedTenantId, normalizedCustomerId]
    );
    const account = Array.isArray(accountRows) && accountRows.length ? accountRows[0] : null;
    if (!account?.joined_at || Number(account?.id || 0) <= 0) {
      const err = new Error("BONUS_ACCOUNT_NOT_FOUND");
      err.code = "BONUS_ACCOUNT_NOT_FOUND";
      throw err;
    }

    if (activeReserved > targetAmount) {
      const diff = roundMoney(activeReserved - targetAmount);
      const nextBalance = roundMoney(Number(account.balance || 0) + diff);
      await queryable.query(
        `UPDATE mkt_customer_bonus_accounts
            SET balance=?
          WHERE tenant_id=? AND id=?`,
        [nextBalance, normalizedTenantId, Number(account.id)]
      );
      await queryable.query(
        `INSERT INTO mkt_customer_bonus_transactions
           (tenant_id, account_id, customer_id, level_id, order_id, type, amount, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'refund', ?, ?, ?, NOW())`,
        [normalizedTenantId, Number(account.id), normalizedCustomerId, account.level_id || null, normalizedOrderId, diff, nextBalance, releaseReason]
      );
      return { reserved: targetAmount };
    }

    const diff = roundMoney(targetAmount - activeReserved);
    if (!(diff > 0)) return { reserved: targetAmount };
    const currentBalance = roundMoney(Number(account.balance || 0));
    if (currentBalance < diff) {
      const err = new Error("BONUS_BALANCE_NOT_ENOUGH");
      err.code = "BONUS_BALANCE_NOT_ENOUGH";
      throw err;
    }
    const nextBalance = roundMoney(currentBalance - diff);
    await queryable.query(
      `UPDATE mkt_customer_bonus_accounts
          SET balance=?
        WHERE tenant_id=? AND id=?`,
      [nextBalance, normalizedTenantId, Number(account.id)]
    );
      await queryable.query(
        `INSERT INTO mkt_customer_bonus_transactions
           (tenant_id, account_id, customer_id, level_id, order_id, type, amount, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'adjustment', ?, ?, ?, NOW())`,
        [normalizedTenantId, Number(account.id), normalizedCustomerId, account.level_id || null, normalizedOrderId, diff, nextBalance, reserveReason]
      );
    return { reserved: targetAmount };
  }

  async function releaseOrderBonusReserve(queryable, {
    tenantId,
    orderId,
    customerId,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedOrderId = Number(orderId || 0);
    const normalizedCustomerId = Number(customerId || 0);
    if (!(normalizedTenantId > 0) || !(normalizedOrderId > 0) || !(normalizedCustomerId > 0)) return { released: 0 };
    const reserveReason = `order:${normalizedOrderId}:bonus_reserve`;
    const releaseReason = `order:${normalizedOrderId}:bonus_release`;
    const redeemReason = `order:${normalizedOrderId}:bonus_redeem`;
    const redeemedAmount = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "redeem", redeemReason);
    if (redeemedAmount > 0) return { released: 0 };
    const reservedAmount = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "adjustment", reserveReason);
    const releasedAmount = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "refund", releaseReason);
    const activeReserved = roundMoney(Math.max(0, reservedAmount - releasedAmount));
    if (!(activeReserved > 0)) return { released: 0 };
    const [accountRows] = await queryable.query(
      `SELECT id, customer_id, level_id, balance
         FROM mkt_customer_bonus_accounts
        WHERE tenant_id=? AND customer_id=?
        LIMIT 1
        FOR UPDATE`,
      [normalizedTenantId, normalizedCustomerId]
    );
    const account = Array.isArray(accountRows) && accountRows.length ? accountRows[0] : null;
    if (!(Number(account?.id || 0) > 0)) return { released: 0 };
    const nextBalance = roundMoney(Number(account.balance || 0) + activeReserved);
    await queryable.query(
      `UPDATE mkt_customer_bonus_accounts
          SET balance=?
        WHERE tenant_id=? AND id=?`,
      [nextBalance, normalizedTenantId, Number(account.id)]
    );
    await queryable.query(
      `INSERT INTO mkt_customer_bonus_transactions
         (tenant_id, account_id, customer_id, level_id, order_id, type, amount, balance_after, reason, created_at)
       VALUES (?, ?, ?, ?, ?, 'refund', ?, ?, ?, NOW())`,
      [normalizedTenantId, Number(account.id), normalizedCustomerId, account.level_id || null, normalizedOrderId, activeReserved, nextBalance, releaseReason]
    );
    return { released: activeReserved };
  }

  async function settleOrderBonus(queryable, {
    tenantId,
    orderId,
    customerId,
    discountsJson = null,
    benefitsMetaRaw = null,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedOrderId = Number(orderId || 0);
    const normalizedCustomerId = Number(customerId || 0);
    if (!(normalizedTenantId > 0) || !(normalizedOrderId > 0) || !(normalizedCustomerId > 0)) return { redeemed: 0, accrued: 0 };
    const settleReferralRewards = async () => {
      const provider = getOrderBenefitsAccrualProvider();
      if (!provider || typeof provider.settleReferralRewards !== "function") return null;
      return provider.settleReferralRewards({
        queryable,
        tenantId: normalizedTenantId,
        orderId: normalizedOrderId,
        customerId: normalizedCustomerId,
      });
    };
    const benefitsMeta = parseOrderBenefitsMetaJson(benefitsMetaRaw);
    const redeemAmount = getOrderBonusRedeemAmount(discountsJson, benefitsMeta);
    if (redeemAmount > 0) {
      await reserveOrderBonusRedeem(queryable, {
        tenantId: normalizedTenantId,
        orderId: normalizedOrderId,
        customerId: normalizedCustomerId,
        discountsJson,
        benefitsMetaRaw: benefitsMeta,
      });
    }
    const [accountRows] = await queryable.query(
      `SELECT id, customer_id, level_id, balance
         FROM mkt_customer_bonus_accounts
        WHERE tenant_id=? AND customer_id=?
        LIMIT 1
        FOR UPDATE`,
      [normalizedTenantId, normalizedCustomerId]
    );
    const account = Array.isArray(accountRows) && accountRows.length ? accountRows[0] : null;
    if (!(Number(account?.id || 0) > 0)) {
      await settleReferralRewards();
      return { redeemed: 0, accrued: 0 };
    }

    const redeemReason = `order:${normalizedOrderId}:bonus_redeem`;
    const existingRedeem = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "redeem", redeemReason);
    let redeemed = 0;
    if (redeemAmount > 0 && !(existingRedeem > 0)) {
      await queryable.query(
        `UPDATE mkt_customer_bonus_accounts
            SET total_redeemed=COALESCE(total_redeemed,0)+?
          WHERE tenant_id=? AND id=?`,
        [redeemAmount, normalizedTenantId, Number(account.id)]
      );
      await queryable.query(
        `INSERT INTO mkt_customer_bonus_transactions
           (tenant_id, account_id, customer_id, level_id, order_id, type, amount, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'redeem', ?, ?, ?, NOW())`,
        [normalizedTenantId, Number(account.id), normalizedCustomerId, account.level_id || null, normalizedOrderId, redeemAmount, Number(account.balance || 0), redeemReason]
      );
      redeemed = redeemAmount;
    }

    const settings = await loadBonusProgramSettings(queryable, normalizedTenantId);
    const blockedByRedeem = Boolean(benefitsMeta?.bonus_accrual_blocked_by_redeem)
      || (redeemAmount > 0 && !settings.allowRedeemAndAccrue);
    const storedAccrualAmount = Number.isFinite(Number(benefitsMeta?.bonus_accrual_amount))
      ? Number(benefitsMeta.bonus_accrual_amount)
      : null;
    const recalculatedAccrualAmount = blockedByRedeem || storedAccrualAmount != null
      ? null
      : await calculateStoredOrderBonusAccrual(
        queryable,
        normalizedTenantId,
        normalizedOrderId,
        normalizedCustomerId,
        Number(benefitsMeta?.bonus_level_id || account.level_id || 0)
      );
    const accrualAmount = blockedByRedeem ? 0 : roundMoney(Math.max(
      0,
      storedAccrualAmount != null
        ? storedAccrualAmount
        : recalculatedAccrualAmount == null
          ? 0
        : Number(recalculatedAccrualAmount || 0)
    ));
    const accrualReason = `order:${normalizedOrderId}:bonus_accrual`;
    const existingAccrual = await getBonusTransactionAmount(queryable, normalizedTenantId, normalizedOrderId, "accrual", accrualReason);
    let accrued = 0;
    if (settings.enabled && accrualAmount > 0 && !(existingAccrual > 0)) {
      const currentBalance = roundMoney(Number(account.balance || 0));
      const nextBalance = roundMoney(currentBalance + accrualAmount);
      await queryable.query(
        `UPDATE mkt_customer_bonus_accounts
            SET balance=?,
                total_accrued=COALESCE(total_accrued,0)+?
          WHERE tenant_id=? AND id=?`,
        [nextBalance, accrualAmount, normalizedTenantId, Number(account.id)]
      );
      await queryable.query(
        `INSERT INTO mkt_customer_bonus_transactions
           (tenant_id, account_id, customer_id, level_id, order_id, type, amount, balance_after, reason, created_at)
         VALUES (?, ?, ?, ?, ?, 'accrual', ?, ?, ?, NOW())`,
        [normalizedTenantId, Number(account.id), normalizedCustomerId, account.level_id || null, normalizedOrderId, accrualAmount, nextBalance, accrualReason]
      );
      accrued = accrualAmount;
    }
    if (settings.enabled) {
      await promoteOrderBonusAccountIfEligible(queryable, normalizedTenantId, normalizedCustomerId);
    }
    await settleReferralRewards();
    return { redeemed, accrued };
  }

  function parseOrderJsonObject(rawValue, fallback = {}) {
    if (!rawValue) return fallback;
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue === "string") {
      try {
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  function formatOrderBuyXGetYBadge(mechanic) {
    const buyQty = Math.max(1, Number(mechanic?.buy_qty || 0) || 1);
    const rewardQty = Math.max(1, Number(mechanic?.reward_qty || 0) || 1);
    return `${buyQty + rewardQty}=${buyQty}`;
  }

  function getOrderDiscountTargetEntityType(row) {
    const explicitType = String(row?.entity_type || row?.target_type || row?.type || "").trim().toLowerCase();
    if (["product", "category"].includes(explicitType)) return explicitType;
    if (Number(row?.product_id || 0) > 0) return "product";
    if (Number(row?.category_id || 0) > 0) return "category";
    return "";
  }

  function buildOrderBuyXGetYTargetSets(rows) {
    const sets = { productIds: new Set(), categoryIds: new Set() };
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || typeof row !== "object") return;
      const type = getOrderDiscountTargetEntityType(row);
      const productId = Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0);
      const categoryId = Number(row?.category_id ?? row?.entity_id ?? row?.id ?? 0);
      if (type === "product" && productId > 0) sets.productIds.add(productId);
      if (type === "category" && categoryId > 0) sets.categoryIds.add(categoryId);
    });
    return sets;
  }

  function orderBuyXGetYBadgeMatchesProduct(badge, productId, productCategoriesMap) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return false;
    if (badge?.targetSets?.productIds?.has(pid)) return true;
    const categories = productCategoriesMap.get(pid) || [];
    return categories.some((categoryId) => badge?.targetSets?.categoryIds?.has(Number(categoryId)));
  }

  async function enrichOrderItemsWithBuyXGetYBadges(tenantId, storeId, items) {
    const source = Array.isArray(items) ? items : [];
    const productIds = [...new Set(
      source
        .map((item) => Number(item?.product_id || 0))
        .filter((id) => id > 0)
    )];
    if (!productIds.length) return source;

    const placeholders = productIds.map(() => "?").join(",");
    const [categoryRows] = await db.query(
      `SELECT product_id, category_id
         FROM prod_product_categories
        WHERE tenant_id=? AND product_id IN (${placeholders})`,
      [tenantId, ...productIds]
    );
    const productCategoriesMap = new Map();
    (Array.isArray(categoryRows) ? categoryRows : []).forEach((row) => {
      const productId = Number(row?.product_id || 0);
      const categoryId = Number(row?.category_id || 0);
      if (!(productId > 0) || !(categoryId > 0)) return;
      if (!productCategoriesMap.has(productId)) productCategoriesMap.set(productId, []);
      productCategoriesMap.get(productId).push(categoryId);
    });

    const [discountRows] = await db.query(
      `SELECT id, title, priority, mechanic_config_json, is_active, is_deleted, is_stackable, starts_at, ends_at,
              schedule_days, schedule_time_start, schedule_time_end, usage_limit, usage_count
         FROM mkt_discounts
        WHERE tenant_id=? AND store_id=? AND mechanic_type='buy_x_get_y'
          AND is_active=1 AND is_deleted=0`,
      [tenantId, storeId]
    );
    const badges = (Array.isArray(discountRows) ? discountRows : [])
      .filter((row) => discountHelpers.isDiscountActive(row))
      .map((row) => {
        const mechanic = parseOrderJsonObject(row?.mechanic_config_json, {});
        const targetSets = buildOrderBuyXGetYTargetSets(mechanic?.qualifying_items || []);
        if (!targetSets.productIds.size && !targetSets.categoryIds.size) return null;
        const badgeText = formatOrderBuyXGetYBadge(mechanic);
        return {
          id: Number(row?.id || 0),
          priority: Number(row?.priority || 0),
          badge_text: badgeText,
          title: String(row?.title || badgeText).trim() || badgeText,
          buy_qty: Math.max(1, Number(mechanic?.buy_qty || 0) || 1),
          reward_qty: Math.max(1, Number(mechanic?.reward_qty || 0) || 1),
          repeat_mode: String(mechanic?.repeat_mode || "").trim().toLowerCase() === "repeat" ? "repeat" : "single",
          is_stackable: Number(row?.is_stackable || 0) === 1,
          targetSets,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));
    if (!badges.length) return source;

    source.forEach((item) => {
      if (!item || typeof item !== "object") return;
      if (item.buy_x_get_y_badge && typeof item.buy_x_get_y_badge === "object") return;
      const productId = Number(item?.product_id || 0);
      const badge = badges.find((row) => orderBuyXGetYBadgeMatchesProduct(row, productId, productCategoriesMap));
      if (!badge) return;
      item.buy_x_get_y_badge = {
        id: badge.id,
        badge_text: badge.badge_text,
        title: badge.title,
        buy_qty: badge.buy_qty,
        reward_qty: badge.reward_qty,
        repeat_mode: badge.repeat_mode,
        is_stackable: badge.is_stackable,
      };
    });
    return source;
  }

  async function enrichOrdersWithBuyXGetYBadges(tenantId, storeId, orders) {
    const list = Array.isArray(orders) ? orders : [];
    const allItems = list.flatMap((order) => Array.isArray(order?.items) ? order.items : []);
    await enrichOrderItemsWithBuyXGetYBadges(tenantId, storeId, allItems);
    return list;
  }

  function normalizeOrderPromoCode(value) {
    return String(value || "").replace(/\s+/g, "").toUpperCase();
  }

  function parseOrderRewardPayload(rawValue) {
    if (!rawValue) return null;
    let parsed = rawValue;
    try {
      if (typeof rawValue === "string") {
        parsed = JSON.parse(rawValue);
      }
    } catch {
      return null;
    }
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  }

  function buildOrderBenefitsMetaJson(source, fallbackRaw = null) {
    const input = source && typeof source === "object" ? source : {};
    const fallback = parseOrderBenefitsMetaJson(fallbackRaw);
    const readValue = (field, normalize) => {
      if (Object.prototype.hasOwnProperty.call(input, field)) {
        return normalize(input[field]);
      }
      return fallback ? fallback[field] ?? null : null;
    };
    const meta = {
      selected_discount_id: readValue("selected_discount_id", normalizeOrderBenefitsSelectedId),
      selected_discount_source: readValue("selected_discount_source", normalizeOrderBenefitsDiscountSource),
      selected_promo_source: readValue("selected_promo_source", normalizeOrderBenefitsPromoSource),
      selected_promo_reward_id: readValue("selected_promo_reward_id", normalizeOrderBenefitsSelectedId),
      benefits_preview_mode: readValue("benefits_preview_mode", normalizeOrderBenefitsPreviewMode),
      bonus_redeem_enabled: readValue("bonus_redeem_enabled", (value) => (
        value === true || value === "true" || Number(value || 0) === 1
      )),
      bonus_redeem_amount: readValue("bonus_redeem_amount", (value) => {
        const amount = Number(value || 0);
        return Number.isFinite(amount) && amount > 0 ? amount : null;
      }),
      bonus_accrual_amount: readValue("bonus_accrual_amount", (value) => {
        const amount = Number(value || 0);
        return Number.isFinite(amount) && amount > 0 ? amount : null;
      }),
      bonus_accrual_blocked_by_redeem: readValue("bonus_accrual_blocked_by_redeem", (value) => (
        value === true || value === "true" || Number(value || 0) === 1
      )),
      bonus_account_id: readValue("bonus_account_id", (value) => {
        const id = Number(value || 0);
        return Number.isFinite(id) && id > 0 ? id : null;
      }),
      bonus_level_id: readValue("bonus_level_id", (value) => {
        const id = Number(value || 0);
        return Number.isFinite(id) && id > 0 ? id : null;
      }),
    };
    if (!meta.selected_discount_id) meta.selected_discount_source = null;
    if (meta.selected_promo_source === "reward_promo" && !meta.selected_promo_reward_id) {
      meta.selected_promo_source = null;
    }
    if (!meta.bonus_redeem_amount) meta.bonus_redeem_enabled = null;
    if (!meta.bonus_accrual_blocked_by_redeem) meta.bonus_accrual_blocked_by_redeem = null;
    const hasValues = Object.values(meta).some((value) => value !== null);
    return hasValues ? JSON.stringify(meta) : null;
  }

  async function resolveDeliveredOrderStatusId(queryable, tenantId, storeId) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedStoreId = Number(storeId || 0);
    if (!(normalizedTenantId > 0) || !(normalizedStoreId > 0)) return null;

    const [deliveredRows] = await queryable.query(
      `SELECT id
         FROM order_statuses
        WHERE tenant_id = ?
          AND store_id = ?
          AND is_active = 1
          AND code = 'delivered'
        ORDER BY sort ASC, id ASC
        LIMIT 1`,
      [normalizedTenantId, normalizedStoreId]
    );
    if (Array.isArray(deliveredRows) && deliveredRows.length) {
      return Number(deliveredRows[0]?.id || 0) || null;
    }

    const [finalRows] = await queryable.query(
      `SELECT id
         FROM order_statuses
        WHERE tenant_id = ?
          AND store_id = ?
          AND is_active = 1
          AND is_final = 1
          AND LOWER(COALESCE(code, '')) NOT IN ('canceled', 'cancelled')
        ORDER BY sort ASC, id ASC
        LIMIT 1`,
      [normalizedTenantId, normalizedStoreId]
    );
    if (Array.isArray(finalRows) && finalRows.length) {
      return Number(finalRows[0]?.id || 0) || null;
    }

    return null;
  }

  async function resolveOrderPromoUsageLink(queryable, {
    tenantId,
    storeId,
    promoCode = "",
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedStoreId = Number(storeId || 0);
    const normalizedPromoCode = normalizeOrderPromoCode(promoCode);
    if (!(normalizedTenantId > 0) || !(normalizedStoreId > 0) || !normalizedPromoCode) return null;

    const [rows] = await queryable.query(
      `SELECT id AS promo_code_id, discount_id
         FROM mkt_discount_promo_codes
        WHERE tenant_id = ?
          AND (store_id = ? OR store_id = 0 OR store_id IS NULL)
          AND UPPER(REPLACE(COALESCE(code, ''), ' ', '')) = ?
        ORDER BY (store_id = ?) DESC, id DESC
        LIMIT 1`,
      [normalizedTenantId, normalizedStoreId, normalizedPromoCode, normalizedStoreId]
    );
    if (!Array.isArray(rows) || !rows.length) return null;
    return {
      discount_id: Number(rows[0]?.discount_id || 0) || null,
      promo_code_id: Number(rows[0]?.promo_code_id || 0) || null,
    };
  }

  async function resolveOrderRewardPromoUsageLink(queryable, {
    tenantId,
    customerId,
    rewardId = null,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedCustomerId = Number(customerId || 0) || null;
    const normalizedRewardId = Number(rewardId || 0) || null;
    if (!(normalizedTenantId > 0) || !(normalizedCustomerId > 0) || !(normalizedRewardId > 0)) return null;

    const [rows] = await queryable.query(
      `SELECT reward_payload_json
         FROM mkt_discount_rewards
        WHERE tenant_id = ?
          AND customer_id = ?
          AND id = ?
          AND reward_type = 'promo_code'
        LIMIT 1`,
      [normalizedTenantId, normalizedCustomerId, normalizedRewardId]
    );
    if (!Array.isArray(rows) || !rows.length) return null;
    const payload = parseOrderRewardPayload(rows[0]?.reward_payload_json);
    return {
      discount_id: Number(payload?.source_discount_id || 0) || null,
      promo_code_id: Number(payload?.source_promo_code_id || 0) || null,
    };
  }

  async function buildOrderDiscountUsageMap(queryable, {
    tenantId,
    storeId,
    customerId = null,
    rawDiscounts = null,
    orderPromoCode = null,
    benefitsMetaRaw = null,
  } = {}) {
    const usageMap = new Map();
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedStoreId = Number(storeId || 0);
    const normalizedCustomerId = Number(customerId || 0) || null;
    const normalizedOrderPromo = normalizeOrderPromoCode(orderPromoCode);
    const benefitsMeta = parseOrderBenefitsMetaJson(benefitsMetaRaw);

    for (const entry of parseOrderDiscountsJson(rawDiscounts)) {
      let discountId = Number(entry?.discount_id || 0) || null;
      let promoCodeId = Number(entry?.promo_code_id || 0) || null;
      const discountAmount = roundMoney(Number(entry?.discount_amount ?? entry?.amount ?? 0));
      if (!(discountAmount > 0)) continue;

      const sourceKind = String(entry?.source_kind || entry?.sourceKind || "").trim().toLowerCase();
      const entryPromoCode = normalizeOrderPromoCode(entry?.promo_code ?? entry?.promoCode ?? entry?.code ?? normalizedOrderPromo);
      if (!(discountId > 0) && entryPromoCode) {
        const promoLink = await resolveOrderPromoUsageLink(queryable, {
          tenantId: normalizedTenantId,
          storeId: normalizedStoreId,
          promoCode: entryPromoCode,
        });
        if (promoLink?.discount_id) discountId = Number(promoLink.discount_id || 0) || null;
        if (!promoCodeId && promoLink?.promo_code_id) promoCodeId = Number(promoLink.promo_code_id || 0) || null;
      }

      if (!(discountId > 0) && (sourceKind === "reward_promo" || benefitsMeta?.selected_promo_source === "reward_promo")) {
        const rewardId = Number(entry?.reward_id || entry?.rewardId || benefitsMeta?.selected_promo_reward_id || 0) || null;
        const rewardLink = await resolveOrderRewardPromoUsageLink(queryable, {
          tenantId: normalizedTenantId,
          customerId: normalizedCustomerId,
          rewardId,
        });
        if (rewardLink?.discount_id) discountId = Number(rewardLink.discount_id || 0) || null;
        if (!promoCodeId && rewardLink?.promo_code_id) promoCodeId = Number(rewardLink.promo_code_id || 0) || null;
      }

      if (!(discountId > 0)) continue;
      const key = `${discountId}:${promoCodeId || 0}`;
      const current = usageMap.get(key) || {
        discount_id: discountId,
        promo_code_id: promoCodeId,
        discount_amount: 0,
      };
      current.discount_amount = roundMoney(Number(current.discount_amount || 0) + discountAmount);
      usageMap.set(key, current);
    }
    return usageMap;
  }

  async function syncDeliveredOrderDiscountUsage(queryable, {
    tenantId,
    storeId,
    orderId,
    statusId,
    customerId = null,
    discountsJson = null,
    orderPromoCode = null,
    benefitsMetaRaw = null,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedStoreId = Number(storeId || 0);
    const normalizedOrderId = Number(orderId || 0);
    const normalizedStatusId = Number(statusId || 0);
    const normalizedCustomerId = Number(customerId || 0) || null;
    if (!(normalizedTenantId > 0) || !(normalizedStoreId > 0) || !(normalizedOrderId > 0) || !(normalizedStatusId > 0)) {
      return { applied: [] };
    }

    const deliveredStatusId = await resolveDeliveredOrderStatusId(queryable, normalizedTenantId, normalizedStoreId);
    if (!(deliveredStatusId > 0) || deliveredStatusId !== normalizedStatusId) {
      return { applied: [] };
    }

    const usageMap = await buildOrderDiscountUsageMap(queryable, {
      tenantId: normalizedTenantId,
      storeId: normalizedStoreId,
      customerId: normalizedCustomerId,
      rawDiscounts: discountsJson,
      orderPromoCode,
      benefitsMetaRaw,
    });
    if (!usageMap.size) return { applied: [] };

    const applied = [];
    for (const usageRecord of usageMap.values()) {
      const result = await discountHelpers.recordDiscountUsage(
        queryable,
        normalizedTenantId,
        usageRecord.discount_id,
        normalizedOrderId,
        normalizedCustomerId,
        usageRecord.discount_amount,
        usageRecord.promo_code_id || null
      );
      if (result?.recorded) {
        applied.push(usageRecord);
      }
    }

    return { applied };
  }

  async function syncDeliveredOrderRewardPromoUsage(queryable, {
    tenantId,
    storeId,
    statusId,
    customerId = null,
    benefitsMetaRaw = null,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedStoreId = Number(storeId || 0);
    const normalizedStatusId = Number(statusId || 0);
    const normalizedCustomerId = Number(customerId || 0) || null;
    if (!(normalizedTenantId > 0) || !(normalizedStoreId > 0) || !(normalizedStatusId > 0) || !(normalizedCustomerId > 0)) {
      return { applied: false, rewardId: null };
    }

    const deliveredStatusId = await resolveDeliveredOrderStatusId(queryable, normalizedTenantId, normalizedStoreId);
    if (!(deliveredStatusId > 0) || deliveredStatusId !== normalizedStatusId) {
      return { applied: false, rewardId: null };
    }

    const benefitsMeta = parseOrderBenefitsMetaJson(benefitsMetaRaw);
    if (!benefitsMeta || benefitsMeta.selected_promo_source !== "reward_promo") {
      return { applied: false, rewardId: null };
    }

    const rewardId = Number(benefitsMeta?.selected_promo_reward_id || 0) || null;
    if (!(rewardId > 0)) {
      return { applied: false, rewardId: null };
    }

    const [result] = await queryable.query(
      `UPDATE mkt_discount_rewards
          SET status = 'used',
              used_at = COALESCE(used_at, NOW()),
              updated_at = NOW()
        WHERE tenant_id = ?
          AND customer_id = ?
          AND id = ?
          AND reward_type = 'promo_code'
          AND status IN ('available', 'used')`,
      [normalizedTenantId, normalizedCustomerId, rewardId]
    );
    return {
      applied: Number(result?.affectedRows || 0) > 0,
      rewardId,
    };
  }

  async function findActiveGiftRewardOrderConflicts(queryable, {
    tenantId,
    customerId,
    giftRewardIds,
    excludeOrderId = null,
  } = {}) {
    const normalizedTenantId = Number(tenantId || 0);
    const normalizedCustomerId = Number(customerId || 0);
    const normalizedExcludeOrderId = Number(excludeOrderId || 0);
    const normalizedRewardIds = Array.from(
      new Set(
        (Array.isArray(giftRewardIds) ? giftRewardIds : [])
          .map((rewardId) => Number(rewardId || 0))
          .filter((rewardId) => Number.isInteger(rewardId) && rewardId > 0)
      )
    );
    if (!(normalizedTenantId > 0) || !(normalizedCustomerId > 0) || !normalizedRewardIds.length) {
      return [];
    }

    const whereClauses = [
      "oo.tenant_id = ?",
      "oo.customer_id = ?",
      "oo.is_active = 1",
      "LOWER(COALESCE(os.code, '')) NOT IN ('canceled', 'cancelled')",
    ];
    const queryParams = [normalizedTenantId, normalizedCustomerId];
    if (normalizedExcludeOrderId > 0) {
      whereClauses.push("oo.id <> ?");
      queryParams.push(normalizedExcludeOrderId);
    }

    const [orderRows] = await queryable.query(
      `SELECT oo.id, oo.items
         FROM order_orders oo
         LEFT JOIN order_statuses os
           ON os.tenant_id = oo.tenant_id
          AND os.store_id = oo.store_id
          AND os.id = oo.status_id
        WHERE ${whereClauses.join(" AND ")}`,
      queryParams
    );

    const requestedRewardIds = new Set(normalizedRewardIds);
    const conflictingRewardIds = new Set();
    (Array.isArray(orderRows) ? orderRows : []).forEach((orderRow) => {
      let orderItems = [];
      try {
        const rawItems = Array.isArray(orderRow?.items)
          ? orderRow.items
          : (orderRow?.items ? JSON.parse(orderRow.items) : []);
        if (Array.isArray(rawItems)) orderItems = rawItems;
      } catch {}
      orderItems.forEach((item) => {
        const rewardId = Number(item?.gift_reward_id || 0);
        if (requestedRewardIds.has(rewardId)) {
          conflictingRewardIds.add(rewardId);
        }
      });
    });

    return normalizedRewardIds.filter((rewardId) => conflictingRewardIds.has(rewardId));
  }

  async function accrueOrderBenefitsIfAvailable(params = {}) {
    const provider = getOrderBenefitsAccrualProvider();
    if (!provider || typeof provider.accrueOrderBenefits !== "function") return null;
    return provider.accrueOrderBenefits(params);
  }

  router.post("/benefits/preview", async (req, res) => {
    try {
      const previewProvider = getCheckoutBenefitsPreviewProvider();
      if (!previewProvider || typeof previewProvider.buildPreview !== "function") {
        return res.status(503).json({ ok: false, error: "BENEFITS_PREVIEW_UNAVAILABLE" });
      }

      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.body?.customer_id || 0);
      const requestedMode = String(req.body?.mode || "").trim().toLowerCase() === "all"
        ? "all"
        : "customer";
      let customer = null;
      if (customerId > 0) {
        const [rows] = await db.query(
          `SELECT *
             FROM cust_customers
            WHERE tenant_id = ?
              AND store_id = ?
              AND id = ?
              AND is_active = 1
            LIMIT 1`,
          [tenantId, storeId, customerId]
        );
        customer = Array.isArray(rows) && rows.length ? rows[0] : null;
      }
      const mode = customer ? requestedMode : "all";

      const data = await previewProvider.buildPreview({
        tenantId,
        storeId,
        customer,
        draft: req.body,
        mode,
      });

      return res.json({
        ok: true,
        data: data && typeof data === "object"
          ? { ...data, mode }
          : data,
      });
    } catch (e) {
      console.error("POST /api/admin/orders/benefits/preview error:", e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  async function fetchRefundRecordsMap(executor, tenantId, storeId, orderIds, opts = {}) {
    await ensureRefundTables();
    const ids = [...new Set(
      (Array.isArray(orderIds) ? orderIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )];
    const refundMap = new Map();
    if (!ids.length) return refundMap;

    const storeTimezone = opts.storeTimezone ?? null;
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await executor.query(
      `
      SELECT
        r.id AS refund_id,
        r.order_id,
        r.payment_id,
        r.payment_code,
        r.payment_title,
        r.payment_icon,
        r.items_total,
        r.delivery_amount,
        r.total_amount,
        r.comment,
        r.is_full,
        r.created_by_user_id,
        r.created_by_name,
        r.created_by_email,
        DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        ri.id AS refund_item_id,
        ri.source_item_index,
        ri.refunded_qty,
        ri.unit_price,
        ri.line_amount,
        ri.item_snapshot
      FROM order_refunds r
      LEFT JOIN order_refund_items ri
        ON ri.tenant_id=r.tenant_id
       AND ri.store_id=r.store_id
       AND ri.refund_id=r.id
      WHERE r.tenant_id=? AND r.store_id=? AND r.order_id IN (${placeholders})
      ORDER BY r.created_at DESC, r.id DESC, ri.id ASC
      `,
      [tenantId, storeId, ...ids]
    );

    for (const row of rows) {
      const orderId = Number(row?.order_id || 0);
      if (!(orderId > 0)) continue;
      if (!refundMap.has(orderId)) refundMap.set(orderId, []);
      const list = refundMap.get(orderId);
      const refundId = Number(row?.refund_id || 0);
      let refund = list.find((item) => Number(item?.id || 0) === refundId) || null;
      if (!refund) {
        refund = {
          id: refundId,
          order_id: orderId,
          payment_id: Number(row?.payment_id || 0) || null,
          payment_code: row?.payment_code || null,
          payment_title: row?.payment_title || null,
          payment_icon: row?.payment_icon || null,
          items_total: roundMoney(row?.items_total || 0),
          delivery_amount: roundMoney(row?.delivery_amount || 0),
          total_amount: roundMoney(row?.total_amount || 0),
          comment: row?.comment || null,
          is_full: Number(row?.is_full || 0) === 1 ? 1 : 0,
          created_by_user_id: Number(row?.created_by_user_id || 0) || null,
          created_by_name: row?.created_by_name || null,
          created_by_email: row?.created_by_email || null,
          created_at: storeTimezone
            ? helpers.utcToStoreDateTime(row?.created_at, storeTimezone)
            : row?.created_at,
          items: [],
        };
        list.push(refund);
      }

      const refundItemId = Number(row?.refund_item_id || 0);
      if (!(refundItemId > 0)) continue;
      let itemSnapshot = {};
      try {
        const parsed = row?.item_snapshot ? JSON.parse(row.item_snapshot) : {};
        if (parsed && typeof parsed === "object") itemSnapshot = parsed;
      } catch {}
      refund.items.push({
        id: refundItemId,
        source_item_index: Number(row?.source_item_index || 0),
        refunded_qty: Number(row?.refunded_qty || 0),
        unit_price: roundMoney(row?.unit_price || 0),
        line_amount: roundMoney(row?.line_amount || 0),
        item_snapshot: itemSnapshot,
      });
    }

    return refundMap;
  }

  async function attachRefundDataToOrders(executor, tenantId, storeId, orders, opts = {}) {
    await ensureRefundTables();
    const list = Array.isArray(orders) ? orders : [];
    if (!list.length) return list;
    const refundMap = await fetchRefundRecordsMap(executor, tenantId, storeId, list.map((order) => order?.id), opts);
    return list.map((order) => ({
      ...order,
      ...buildOrderRefundState(order, refundMap.get(Number(order?.id || 0)) || []),
    }));
  }

  async function resolveRefundActorSnapshot(conn, tenantId, req) {
    const userId = Number(req.user?.userId || 0) || null;
    const fallbackEmail = String(req.user?.email || "").trim() || null;
    if (!(userId > 0)) {
      return {
        createdByUserId: null,
        createdByName: fallbackEmail || "Оператор",
        createdByEmail: fallbackEmail,
      };
    }

    const [rows] = await conn.query(
      `SELECT name, email
         FROM app_users
        WHERE tenant_id=? AND id=?
        LIMIT 1`,
      [tenantId, userId]
    );
    const row = rows[0] || null;
    return {
      createdByUserId: userId,
      createdByName: String(row?.name || "").trim() || fallbackEmail || "Оператор",
      createdByEmail: String(row?.email || fallbackEmail || "").trim() || null,
    };
  }

  function publishStockChanged(tenantId, storeId, payload = {}) {
    try {
      if (!ordersEvents || typeof ordersEvents.publish !== "function") return;
      ordersEvents.publish(tenantId, storeId, "stock.changed", {
        tenant_id: Number(tenantId),
        store_id: Number(storeId),
        ...payload,
      });
    } catch (err) {
      console.error("publishStockChanged error:", err);
    }
  }

  function parseDateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return null;
    return s;
  }

  function normalizeDateRange(startRaw, endRaw) {
    const start = parseDateParam(startRaw);
    const end = parseDateParam(endRaw);
    if (!start && !end) return null;
    if (start && !end) return { start, end: start };
    if (!start && end) return { start: end, end };
    return start <= end ? { start, end } : { start: end, end: start };
  }

  async function getStoreTimezone(tenantId, storeId) {
    let storeTimezone = '+0';
    if (storeId) {
      const [rows] = await db.query(
        'SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (rows[0]?.timezone) {
        storeTimezone = rows[0].timezone;
      }
    }
    if (!storeTimezone || storeTimezone === '+0') {
      const [tenantRows] = await db.query(
        'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (tenantRows[0]?.timezone) {
        storeTimezone = tenantRows[0].timezone;
      }
    }
    return storeTimezone || '+0';
  }

  function setOrdersNoStore(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }

  function pad2(value) {
    return String(Number(value) || 0).padStart(2, '0');
  }

  function addDaysToDateKey(dateKey, days) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const next = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
    next.setUTCDate(next.getUTCDate() + Number(days || 0));
    return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  }

  function formatUtcDateTime(ms) {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
  }

  function localDateKeyToUtcDateTime(dateKey, offsetMinutes) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const utcMs = Date.UTC(year || 0, (month || 1) - 1, day || 1, 0, 0, 0) - (Number(offsetMinutes || 0) * 60 * 1000);
    return formatUtcDateTime(utcMs);
  }

  function buildOrderDateBounds(range, storeTimezone) {
    if (!range) return null;
    const offsetMinutes = helpers.parseTimezoneOffsetToMinutes(storeTimezone);
    const nextDayKey = addDaysToDateKey(range.end, 1);
    return {
      scheduledStart: `${range.start} 00:00:00`,
      scheduledEndExclusive: `${nextDayKey} 00:00:00`,
      createdStartUtc: localDateKeyToUtcDateTime(range.start, offsetMinutes),
      createdEndUtcExclusive: localDateKeyToUtcDateTime(nextDayKey, offsetMinutes),
    };
  }

  async function fetchOrderPayload(tenantId, storeId, id, opts = {}) {
    const storeTimezone = opts.storeTimezone ?? await getStoreTimezone(tenantId, storeId);
    const hasBenefitsMetaColumn = await ensureOrderBenefitsMetaColumn();
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.store_id,
        o.public_id,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        o.customer_id,
        o.customer_name,
        o.customer_phone,
        o.promo_code,
        o.address,
        o.comment,
        o.address_comment,
        o.cutlery_qty,
        o.change_from,
        o.total_price,
        o.delivery_cost,
        o.discount_amount,
        o.discounts_json,
        ${hasBenefitsMetaColumn ? "o.benefits_meta_json" : "NULL AS benefits_meta_json"},
        o.items,
        DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
        o.delivery_type_id,
        o.payment_id,
        o.is_paid,
        o.time_option_id,
        o.status_id,
        o.pickup_store_id,
        o.delivery_address_id,

        s.code AS statusCode,
        s.title AS statusTitle,
        s.color AS statusColor,

        p.code AS paymentCode,
        p.title AS paymentTitle,
        p.icon AS paymentIcon,

        m.code AS methodCode,
        m.title AS methodTitle,

        t.code AS timeOptionCode,
        t.title AS timeOptionTitle,
        t.icon AS timeOptionIcon,

        c.telegram_user_id AS customerTelegramId,

        ps.name AS pickupStoreName,
        ps.address AS pickupStoreAddress,

        ca.comment AS address_comment_from_cust,
        ca.city AS deliveryAddressCity,
        ca.street AS deliveryAddressStreet,
        ca.house AS deliveryAddressHouse,
        ca.entrance AS deliveryAddressEntrance,
        ca.floor AS deliveryAddressFloor,
        ca.apartment AS deliveryAddressApartment,
        ca.address_ref AS deliveryAddressRef,
        ca.selected_object_type AS deliverySelectedObjectType,
        ca.resolved_city_source_key AS deliveryResolvedCitySourceKey,
        ca.address_context_locality AS deliveryAddressContextLocality,
        ca.address_normalized_display AS deliveryAddressNormalizedDisplay,
        ca.lat AS deliveryAddressLat,
        ca.lng AS deliveryAddressLng,
        ca.delivery_store_id AS deliveryStoreId,
        ca.delivery_zone_id AS deliveryZoneId,
        dz.name AS deliveryZoneName
      FROM order_orders o
      LEFT JOIN order_statuses s
        ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
      LEFT JOIN order_payments p
        ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
      LEFT JOIN order_delivery_types m
        ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
      LEFT JOIN order_time_options t
        ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
      LEFT JOIN cust_customers c
        ON c.tenant_id=o.tenant_id AND c.store_id=o.store_id AND c.id=o.customer_id
      LEFT JOIN ten_stores ps
        ON ps.tenant_id=o.tenant_id AND ps.id=o.pickup_store_id
      LEFT JOIN cust_customer_addresses ca
        ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
      LEFT JOIN ten_delivery_zones dz
        ON dz.tenant_id=o.tenant_id AND dz.id=ca.delivery_zone_id
      WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
      LIMIT 1
      `,
      [tenantId, storeId, id]
    );

    if (!rows.length) return null;
    const r = rows[0];

    let items = [];
    try {
      const parsed = r.items ? JSON.parse(r.items) : [];
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
    await enrichOrderItemsWithBuyXGetYBadges(tenantId, storeId, items);
    const discountsJson = parseOrderDiscountsJson(r.discounts_json);
    const benefitsMeta = parseOrderBenefitsMetaJson(r.benefits_meta_json);
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalPrice = Number(r.total_price || 0);
    let deliveryCost = 0;
    if ((r.methodCode ?? null) === 'delivery') {
      const diff = totalPrice - itemsTotal;
      const computed = diff > 0 ? diff : 0;
      const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
      deliveryCost = stored && stored > 0 ? stored : computed;
    }

    const basePayload = {
      id: r.id,
      store_id: r.store_id,
      public_id: r.public_id || null,
      created_at: helpers.utcToStoreDateTime(r.created_at, storeTimezone),
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      promo_code: r.promo_code ?? null,
      address: r.address,
      comment: r.comment,
      address_comment: (r.address_comment && String(r.address_comment).trim()) ? r.address_comment : (r.address_comment_from_cust && String(r.address_comment_from_cust).trim()) ? r.address_comment_from_cust : null,
      cutlery_qty: r.cutlery_qty,
      change_from: r.change_from,
      total_price: totalPrice,
      items_total: itemsTotal,
      delivery_cost: deliveryCost,
      discount_amount: Number(r.discount_amount || 0),
      discounts_json: discountsJson,
      benefits_meta: benefitsMeta,
      items,
      scheduled_at: r.scheduled_at,
      delivery_type_id: r.delivery_type_id,
      payment_id: r.payment_id,
      is_paid: Number(r.is_paid || 0) === 1 ? 1 : 0,
      time_option_id: r.time_option_id,
      status_id: r.status_id,
      delivery_address_id: r.delivery_address_id ?? null,

      status_code: r.statusCode ?? null,
      status_title: r.statusTitle ?? null,
      status_color: r.statusColor ?? null,

      payment_code: r.paymentCode ?? null,
      payment_title: r.paymentTitle ?? null,
      payment_icon: r.paymentIcon ?? null,

      method_code: r.methodCode ?? null,
      method_title: r.methodTitle ?? null,

      time_option_code: r.timeOptionCode ?? null,
      time_option_title: r.timeOptionTitle ?? null,
      time_option_icon: r.timeOptionIcon ?? null,

      telegram_user_id: r.customerTelegramId ?? null,

      pickup_store_id: r.pickup_store_id ?? null,
      pickup_store_name: r.pickupStoreName ?? null,
      pickup_store_address: r.pickupStoreAddress ?? null,
      delivery_address_city: helpers.strOrNull(r.deliveryAddressCity),
      delivery_address_street: helpers.strOrNull(r.deliveryAddressStreet),
      delivery_address_house: helpers.strOrNull(r.deliveryAddressHouse),
      delivery_address_entrance: helpers.strOrNull(r.deliveryAddressEntrance),
      delivery_address_floor: helpers.strOrNull(r.deliveryAddressFloor),
      delivery_address_apartment: helpers.strOrNull(r.deliveryAddressApartment),
      delivery_address_ref: helpers.strOrNull(r.deliveryAddressRef),
      delivery_selected_object_type: helpers.strOrNull(r.deliverySelectedObjectType),
      delivery_resolved_city_source_key: helpers.strOrNull(r.deliveryResolvedCitySourceKey),
      delivery_address_context_locality: helpers.strOrNull(r.deliveryAddressContextLocality),
      delivery_address_normalized_display: helpers.strOrNull(r.deliveryAddressNormalizedDisplay),
      delivery_address_lat: r.deliveryAddressLat != null ? Number(r.deliveryAddressLat) : null,
      delivery_address_lng: r.deliveryAddressLng != null ? Number(r.deliveryAddressLng) : null,
      delivery_store_id: Number.isFinite(Number(r.deliveryStoreId)) && Number(r.deliveryStoreId) > 0 ? Number(r.deliveryStoreId) : null,
      delivery_zone_id: Number.isFinite(Number(r.deliveryZoneId)) && Number(r.deliveryZoneId) > 0 ? Number(r.deliveryZoneId) : null,
      delivery_zone_name: helpers.strOrNull(r.deliveryZoneName),
    };
    const [payload] = await attachRefundDataToOrders(db, tenantId, storeId, [basePayload], { storeTimezone });
    return payload || basePayload;
  }

  // ---------------------------
  // statuses summary (counts)
  // ---------------------------
  // GET /api/admin/orders/statuses
  router.get("/statuses", async (req, res) => {
    try {
      setOrdersNoStore(res);
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const range = normalizeDateRange(req.query.start_date, req.query.end_date);
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const bounds = buildOrderDateBounds(range, storeTimezone);

      const joinDate = bounds
        ? `AND (
             (o.scheduled_at IS NOT NULL AND o.scheduled_at >= ? AND o.scheduled_at < ?)
             OR
             (o.scheduled_at IS NULL AND o.created_at >= ? AND o.created_at < ?)
           )`
        : "";

      const params = [];
      if (bounds) {
        params.push(
          bounds.scheduledStart,
          bounds.scheduledEndExclusive,
          bounds.createdStartUtc,
          bounds.createdEndUtcExclusive
        );
      }
      params.push(tenantId, storeId);

      const [rows] = await db.query(
        `
        SELECT
          s.id,
          s.code,
          s.title,
          s.subtitle,
          s.icon,
          s.color,
          s.sort,
          COUNT(o.id) AS cnt
        FROM order_statuses s
        LEFT JOIN order_orders o
          ON o.tenant_id = s.tenant_id
          AND o.store_id = s.store_id
          AND o.status_id = s.id
          AND o.is_active = 1
          ${joinDate}
        WHERE s.tenant_id = ? AND s.store_id = ? AND s.is_active = 1
        GROUP BY s.id
        ORDER BY s.sort ASC, s.id ASC
        `,
        params
      );

      const data = rows.map((r) => ({
        ...r,
        count: Number(r.cnt || 0),
        cnt: Number(r.cnt || 0),
      }));

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // orders list
  // ---------------------------
  // GET /api/admin/orders
  router.get("/", async (req, res) => {
    try {
      setOrdersNoStore(res);
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const statusId = Number(req.query.status_id || 0);
      const limit = Math.min(500, Math.max(10, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const range = normalizeDateRange(req.query.start_date, req.query.end_date);
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const bounds = buildOrderDateBounds(range, storeTimezone);

      let where = `o.tenant_id=? AND o.store_id=? AND o.is_active=1`;
      const params = [tenantId, storeId];

      if (Number.isFinite(statusId) && statusId > 0) {
        where += ` AND o.status_id=?`;
        params.push(statusId);
      }

      if (bounds) {
        where += ` AND (
          (o.scheduled_at IS NOT NULL AND o.scheduled_at >= ? AND o.scheduled_at < ?)
          OR
          (o.scheduled_at IS NULL AND o.created_at >= ? AND o.created_at < ?)
        )`;
        params.push(
          bounds.scheduledStart,
          bounds.scheduledEndExclusive,
          bounds.createdStartUtc,
          bounds.createdEndUtcExclusive
        );
      }

      const orderBy = (Number.isFinite(statusId) && statusId > 0)
        ? `o.status_sort DESC, o.created_at DESC, o.id DESC`
        : `o.created_at DESC, o.id DESC`;
      const hasBenefitsMetaColumn = await ensureOrderBenefitsMetaColumn();

      const [rows] = await db.query(
        `
        SELECT
          o.id,
          o.public_id,
          DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          o.customer_id,
          o.customer_name,
          o.customer_phone,
          o.promo_code,
          o.address,
          o.comment,
          o.address_comment,
          o.cutlery_qty,
          o.change_from,
          o.total_price,
          o.delivery_cost,
          o.discount_amount,
          o.discounts_json,
          ${hasBenefitsMetaColumn ? "o.benefits_meta_json" : "NULL AS benefits_meta_json"},
          o.items,
          DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
          o.delivery_type_id,
          o.payment_id,
          o.is_paid,
          o.time_option_id,
          o.status_id,
          o.delivery_address_id,

          s.code AS statusCode,
          s.title AS statusTitle,
          s.color AS statusColor,

          p.code AS paymentCode,
          p.title AS paymentTitle,
          p.icon AS paymentIcon,

          m.code AS methodCode,
          m.title AS methodTitle,

          t.code AS timeOptionCode,
          t.title AS timeOptionTitle,
          t.icon AS timeOptionIcon,

          c.telegram_user_id AS customerTelegramId,

          o.pickup_store_id,
          ps.name AS pickupStoreName,
          ps.address AS pickupStoreAddress,

          ca.comment AS address_comment_from_cust,
          ca.city AS deliveryAddressCity,
          ca.street AS deliveryAddressStreet,
          ca.house AS deliveryAddressHouse,
          ca.entrance AS deliveryAddressEntrance,
          ca.floor AS deliveryAddressFloor,
          ca.apartment AS deliveryAddressApartment,
          ca.address_ref AS deliveryAddressRef,
          ca.selected_object_type AS deliverySelectedObjectType,
          ca.resolved_city_source_key AS deliveryResolvedCitySourceKey,
          ca.address_context_locality AS deliveryAddressContextLocality,
          ca.address_normalized_display AS deliveryAddressNormalizedDisplay,
          ca.lat AS deliveryAddressLat,
          ca.lng AS deliveryAddressLng,
          ca.delivery_store_id AS deliveryStoreId,
          ca.delivery_zone_id AS deliveryZoneId,
          dz.name AS deliveryZoneName
        FROM order_orders o
        LEFT JOIN order_statuses s
          ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
        LEFT JOIN order_payments p
          ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
        LEFT JOIN order_delivery_types m
          ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
        LEFT JOIN order_time_options t
          ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
        LEFT JOIN cust_customers c
          ON c.tenant_id=o.tenant_id AND c.store_id=o.store_id AND c.id=o.customer_id
        LEFT JOIN ten_stores ps
          ON ps.tenant_id=o.tenant_id AND ps.id=o.pickup_store_id
        LEFT JOIN cust_customer_addresses ca
          ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
        LEFT JOIN ten_delivery_zones dz
          ON dz.tenant_id=o.tenant_id AND dz.id=ca.delivery_zone_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
        `,
        [...params, limit, offset]
      );

      const baseData = rows.map((r) => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}
        const discountsJson = parseOrderDiscountsJson(r.discounts_json);
        const benefitsMeta = parseOrderBenefitsMetaJson(r.benefits_meta_json);
        const itemsTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
        const totalPrice = Number(r.total_price || 0);
        let deliveryCost = 0;
        if ((r.methodCode ?? null) === 'delivery') {
          const diff = totalPrice - itemsTotal;
          const computed = diff > 0 ? diff : 0;
          const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
          deliveryCost = stored && stored > 0 ? stored : computed;
        }

        const effectiveAddressComment = (r.address_comment && String(r.address_comment).trim())
          ? r.address_comment
          : (r.address_comment_from_cust && String(r.address_comment_from_cust).trim())
            ? r.address_comment_from_cust
            : null;

        return {
          ...r,
          address_comment: effectiveAddressComment,
          created_at: helpers.utcToStoreDateTime(r.created_at, storeTimezone),
          items,
          total_price: totalPrice,
          items_total: itemsTotal,
          delivery_cost: deliveryCost,
          discount_amount: Number(r.discount_amount || 0),
          discounts_json: discountsJson,
          benefits_meta: benefitsMeta,
          is_paid: Number(r.is_paid || 0) === 1 ? 1 : 0,
          delivery_address_id: r.delivery_address_id ?? null,

          status_code: r.statusCode ?? null,
          status_title: r.statusTitle ?? null,
          status_color: r.statusColor ?? null,

          payment_code: r.paymentCode ?? null,
          payment_title: r.paymentTitle ?? null,
          payment_icon: r.paymentIcon ?? null,

          method_code: r.methodCode ?? null,
          method_title: r.methodTitle ?? null,

          time_option_code: r.timeOptionCode ?? null,
          time_option_title: r.timeOptionTitle ?? null,
          time_option_icon: r.timeOptionIcon ?? null,

          telegram_user_id: r.customerTelegramId ?? null,

          pickup_store_id: r.pickup_store_id ?? null,
          pickup_store_name: r.pickupStoreName ?? null,
          pickup_store_address: r.pickupStoreAddress ?? null,
          delivery_address_city: helpers.strOrNull(r.deliveryAddressCity),
          delivery_address_street: helpers.strOrNull(r.deliveryAddressStreet),
          delivery_address_house: helpers.strOrNull(r.deliveryAddressHouse),
          delivery_address_entrance: helpers.strOrNull(r.deliveryAddressEntrance),
          delivery_address_floor: helpers.strOrNull(r.deliveryAddressFloor),
          delivery_address_apartment: helpers.strOrNull(r.deliveryAddressApartment),
          delivery_address_ref: helpers.strOrNull(r.deliveryAddressRef),
          delivery_selected_object_type: helpers.strOrNull(r.deliverySelectedObjectType),
          delivery_resolved_city_source_key: helpers.strOrNull(r.deliveryResolvedCitySourceKey),
          delivery_address_context_locality: helpers.strOrNull(r.deliveryAddressContextLocality),
          delivery_address_normalized_display: helpers.strOrNull(r.deliveryAddressNormalizedDisplay),
          delivery_address_lat: r.deliveryAddressLat != null ? Number(r.deliveryAddressLat) : null,
          delivery_address_lng: r.deliveryAddressLng != null ? Number(r.deliveryAddressLng) : null,
          delivery_store_id: Number.isFinite(Number(r.deliveryStoreId)) && Number(r.deliveryStoreId) > 0 ? Number(r.deliveryStoreId) : null,
          delivery_zone_id: Number.isFinite(Number(r.deliveryZoneId)) && Number(r.deliveryZoneId) > 0 ? Number(r.deliveryZoneId) : null,
          delivery_zone_name: helpers.strOrNull(r.deliveryZoneName),
        };
      });
      await enrichOrdersWithBuyXGetYBadges(tenantId, storeId, baseData);
      const data = await attachRefundDataToOrders(db, tenantId, storeId, baseData, { storeTimezone });

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/admin/orders/changes?since=cursor
  router.get("/changes", (req, res) => {
    try {
      setOrdersNoStore(res);
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = Number(req.query.since || 0);
      const cursorState = ordersEvents.inspectCursor(tenantId, storeId, since);
      const cursor = Number(cursorState.currentCursor || 0);
      if (cursorState.resetRequired) {
        return res.json({
          ok: true,
          data: [],
          cursor,
          reset_required: true,
          reason: cursorState.reason || null,
        });
      }
      const data = ordersEvents.getChanges(tenantId, storeId, since);
      res.json({
        ok: true,
        data,
        cursor,
        reset_required: false,
        reason: null,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/admin/orders/changes/wait?since=cursor&timeout_ms=20000
  router.get("/changes/wait", async (req, res) => {
    try {
      setOrdersNoStore(res);
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = Number(req.query.since || 0);
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);
      const cursorState = ordersEvents.inspectCursor(tenantId, storeId, since);
      const cursorNow = Number(cursorState.currentCursor || 0);

      if (cursorState.resetRequired) {
        return res.json({
          ok: true,
          data: {
            changed: false,
            timeout: false,
            cursor: cursorNow,
            reset_required: true,
            reason: cursorState.reason || null,
          },
        });
      }

      if (Number.isFinite(since) && since > 0 && cursorNow > since) {
        return res.json({
          ok: true,
          data: {
            changed: true,
            timeout: false,
            cursor: cursorNow,
            reset_required: false,
            reason: null,
          },
        });
      }
      if ((!Number.isFinite(since) || since <= 0) && cursorNow > 0) {
        return res.json({
          ok: true,
          data: {
            changed: true,
            timeout: false,
            cursor: cursorNow,
            reset_required: false,
            reason: null,
          },
        });
      }

      const waitResult = await ordersEvents.waitForChanges(tenantId, storeId, timeoutMs);
      const cursor = Number(waitResult?.cursor || ordersEvents.getCurrentCursor(tenantId, storeId) || 0);
      const changed = Number.isFinite(cursor) && cursor > (Number.isFinite(since) ? since : 0);

      return res.json({
        ok: true,
        data: {
          changed,
          timeout: waitResult?.timeout === true,
          cursor,
          reset_required: false,
          reason: null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/admin/orders/new-count
  router.get("/new-count", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.is_active=1
           AND COALESCE(s.is_final, 0)=0
           AND (
             LOWER(COALESCE(s.code, ''))='new'
             OR LOWER(COALESCE(s.title, '')) LIKE 'нов%'
           )`,
        [tenantId, storeId]
      );
      const total = Math.max(0, Number(rows?.[0]?.cnt || 0));
      res.json({ ok: true, data: { total } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });
  // ---------------------------
  // print template
  // ---------------------------
  // GET /api/admin/orders/:id/print-template
  router.get("/:id/print-template", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      if (!orderPrintTemplateBuilder || typeof orderPrintTemplateBuilder.buildOrderTemplateHtml !== "function") {
        return res.status(503).json({ ok: false, error: "PRINT_TEMPLATE_UNAVAILABLE" });
      }
      const html = await orderPrintTemplateBuilder.buildOrderTemplateHtml(tenantId, storeId, id);
      if (!html) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      res.json({ ok: true, data: { html } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // order details
  // ---------------------------
  // GET /api/admin/orders/:id
  router.get("/:id", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (!payload) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      res.json({ ok: true, data: payload });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // change paid flag
  // ---------------------------
  // PUT /api/admin/orders/:id/paid
  router.put("/:id/paid", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      const isPaidRaw = Number(req.body?.is_paid);
      const hasPaymentCode = Object.prototype.hasOwnProperty.call(req.body || {}, "payment_code");
      const hasChangeFrom = Object.prototype.hasOwnProperty.call(req.body || {}, "change_from");
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!(isPaidRaw === 0 || isPaidRaw === 1)) {
        return res.status(400).json({ ok: false, error: "BAD_IS_PAID" });
      }

      const [existingRows] = await db.query(
        `SELECT o.id,
                o.total_price,
                o.change_from,
                o.payment_id,
                p.code AS payment_code
           FROM order_orders o
      LEFT JOIN order_payments p
             ON p.tenant_id=o.tenant_id
            AND p.store_id=o.store_id
            AND p.id=o.payment_id
          WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
          LIMIT 1`,
        [tenantId, storeId, id]
      );
      if (!existingRows.length) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const existing = existingRows[0] || {};
      let nextPaymentId = Number(existing.payment_id || 0) > 0 ? Number(existing.payment_id) : null;
      let effectivePaymentCode = String(existing.payment_code || "").trim().toLowerCase();

      if (hasPaymentCode) {
        const paymentCode = String(req.body?.payment_code || "").trim();
        if (!paymentCode) {
          return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
        }
        const [paymentRows] = await db.query(
          `SELECT id, code
             FROM order_payments
            WHERE tenant_id=? AND store_id=? AND code=? AND is_active=1
            LIMIT 1`,
          [tenantId, storeId, paymentCode]
        );
        if (!paymentRows.length) {
          return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
        }
        nextPaymentId = Number(paymentRows[0]?.id || 0) > 0 ? Number(paymentRows[0].id) : null;
        effectivePaymentCode = String(paymentRows[0]?.code || paymentCode).trim().toLowerCase();
      }

      const totalPrice = Number(existing.total_price || 0);
      const isCashPayment = effectivePaymentCode.includes("cash") || effectivePaymentCode.includes("нал");
      let nextChangeFrom = Number(existing.change_from || 0) > 0 ? Number(existing.change_from) : null;

      if (!isCashPayment) {
        nextChangeFrom = null;
      } else if (hasChangeFrom) {
        const rawChangeFrom = req.body?.change_from;
        if (rawChangeFrom == null || rawChangeFrom === "") {
          nextChangeFrom = null;
        } else {
          const numericChangeFrom = Number(rawChangeFrom);
          if (!Number.isFinite(numericChangeFrom) || numericChangeFrom <= 0) {
            nextChangeFrom = null;
          } else if (numericChangeFrom <= totalPrice) {
            return res.status(400).json({ ok: false, error: "BAD_CHANGE_FROM" });
          } else {
            nextChangeFrom = numericChangeFrom;
          }
        }
      }

      const [result] = await db.query(
        `UPDATE order_orders
         SET is_paid=?,
             payment_id=?,
             change_from=?
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1`,
        [isPaidRaw, nextPaymentId, nextChangeFrom, tenantId, storeId, id]
      );
      if (!Number(result?.affectedRows || 0)) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (!payload) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }
      if (ordersEvents && typeof ordersEvents.publish === "function") {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
      }

      res.json({ ok: true, data: payload });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // create refund
  // ---------------------------
  // POST /api/admin/orders/:id/refunds
  router.post("/:id/refunds", async (req, res) => {
    const conn = await db.getConnection();
    let transactionStarted = false;
    let connectionReleased = false;
    const safeRelease = () => {
      if (!connectionReleased) {
        conn.release();
        connectionReleased = true;
      }
    };

    try {
      await ensureRefundTables();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      const paymentCode = String(req.body?.payment_code || "").trim();
      const comment = helpers.strOrNull(req.body?.comment);
      const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!Number.isFinite(id) || id <= 0) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!paymentCode) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      }

      await conn.beginTransaction();
      transactionStarted = true;

      const [orderRows] = await conn.query(
        `
        SELECT
          o.id,
          o.items,
          o.total_price,
          o.delivery_cost,
          o.is_paid
        FROM order_orders o
        WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
        LIMIT 1
        FOR UPDATE
        `,
        [tenantId, storeId, id]
      );
      if (!orderRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const orderRow = orderRows[0] || {};
      let items = [];
      try {
        const parsed = orderRow.items ? JSON.parse(orderRow.items) : [];
        if (Array.isArray(parsed)) items = parsed;
      } catch {}

      const [paymentRows] = await conn.query(
        `
        SELECT id, code, title, icon
        FROM order_payments
        WHERE tenant_id=? AND store_id=? AND code=? AND is_active=1
        LIMIT 1
        `,
        [tenantId, storeId, paymentCode]
      );
      if (!paymentRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      }

      const refundMap = await fetchRefundRecordsMap(conn, tenantId, storeId, [id]);
      const orderForRefund = {
        id,
        items,
        total_price: roundMoney(orderRow.total_price || 0),
        delivery_cost: roundMoney(orderRow.delivery_cost || 0),
        is_paid: Number(orderRow.is_paid || 0) === 1 ? 1 : 0,
      };
      const refundPlan = buildOrderRefundState(orderForRefund, refundMap.get(id) || []);
      const plannedRefund = buildRefundPlan(orderForRefund, refundMap.get(id) || [], itemsInput);

      if (!plannedRefund.ok) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        const errorCode = String(plannedRefund.error || "BAD_REFUND_ITEMS");
        const statusCode = errorCode === "ORDER_NOT_PAID" || errorCode === "NOT_REFUNDABLE"
          ? 409
          : 400;
        return res.status(statusCode).json({ ok: false, error: errorCode, data: refundPlan });
      }

      const payment = paymentRows[0] || {};
      const actor = await resolveRefundActorSnapshot(conn, tenantId, req);
      const [refundResult] = await conn.query(
        `
        INSERT INTO order_refunds (
          tenant_id,
          store_id,
          order_id,
          payment_id,
          payment_code,
          payment_title,
          payment_icon,
          items_total,
          delivery_amount,
          total_amount,
          comment,
          is_full,
          created_by_user_id,
          created_by_name,
          created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          tenantId,
          storeId,
          id,
          Number(payment.id || 0) || null,
          String(payment.code || paymentCode).trim(),
          String(payment.title || paymentCode).trim() || null,
          String(payment.icon || "").trim() || null,
          roundMoney(plannedRefund.items_total || 0),
          roundMoney(plannedRefund.delivery_amount || 0),
          roundMoney(plannedRefund.total_amount || 0),
          comment,
          Number(plannedRefund.is_full || 0) === 1 ? 1 : 0,
          actor.createdByUserId,
          actor.createdByName,
          actor.createdByEmail,
        ]
      );

      const refundId = Number(refundResult?.insertId || 0);
      if (!(refundId > 0)) {
        throw new Error("REFUND_INSERT_FAILED");
      }

      if (Array.isArray(plannedRefund.items) && plannedRefund.items.length) {
        const placeholders = plannedRefund.items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params = [];
        plannedRefund.items.forEach((item) => {
          params.push(
            tenantId,
            storeId,
            id,
            refundId,
            Number(item.source_item_index || 0),
            JSON.stringify(item.item_snapshot || {}),
            Number(item.refunded_qty || 0),
            roundMoney(item.unit_price || 0),
            roundMoney(item.line_amount || 0)
          );
        });
        await conn.query(
          `
          INSERT INTO order_refund_items (
            tenant_id,
            store_id,
            order_id,
            refund_id,
            source_item_index,
            item_snapshot,
            refunded_qty,
            unit_price,
            line_amount
          ) VALUES ${placeholders}
          `,
          params
        );
      }

      await conn.commit();
      transactionStarted = false;
      safeRelease();

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (!payload) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }
      if (ordersEvents && typeof ordersEvents.publish === "function") {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
      }

      res.status(201).json({ ok: true, data: payload });
    } catch (e) {
      if (transactionStarted) {
        try {
          await conn.rollback();
        } catch {}
      }
      safeRelease();
      console.error(e);
      if (e && (e.code === "BONUS_ACCOUNT_NOT_FOUND" || e.code === "BONUS_BALANCE_NOT_ENOUGH")) {
        return res.status(409).json({ ok: false, error: e.code });
      }
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // change status
  // ---------------------------
  // PUT /api/admin/orders/:id/status
  router.put("/:id/status", async (req, res) => {
    const conn = await db.getConnection();
    let transactionStarted = false;
    let connectionReleased = false;
    const safeRelease = () => {
      if (!connectionReleased) {
        conn.release();
        connectionReleased = true;
      }
    };
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      const statusId = Number(req.body.status_id);
      const hasBenefitsMetaColumn = await ensureOrderBenefitsMetaColumn();

      if (!Number.isFinite(id) || id <= 0) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!Number.isFinite(statusId) || statusId <= 0) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      await conn.beginTransaction();
      transactionStarted = true;

      const [statusRows] = await conn.query(
        `SELECT id, code, is_final
         FROM order_statuses
         WHERE tenant_id=? AND store_id=? AND id=?
         LIMIT 1`,
        [tenantId, storeId, statusId]
      );
      if (!statusRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      const [orderRows] = await conn.query(
        `SELECT id, public_id, customer_id, promo_code, items, discounts_json, ${hasBenefitsMetaColumn ? "benefits_meta_json," : "NULL AS benefits_meta_json,"} status_id, stock_deducted_at, stock_document_id
         FROM order_orders
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1
         LIMIT 1
         FOR UPDATE`,
        [tenantId, storeId, id]
      );
      if (!orderRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const orderRow = orderRows[0];
      const currentStatusId = Number(orderRow?.status_id || 0);
      let currentStatusCode = "";
      let currentStatusIsFinal = false;
      if (currentStatusId > 0) {
        const [currentStatusRows] = await conn.query(
          `SELECT code, is_final
           FROM order_statuses
           WHERE tenant_id=? AND store_id=? AND id=?
           LIMIT 1`,
          [tenantId, storeId, currentStatusId]
        );
        currentStatusCode = String(currentStatusRows[0]?.code || "").trim().toLowerCase();
        currentStatusIsFinal = Number(currentStatusRows[0]?.is_final || 0) === 1;
      }
      const targetStatusCode = String(statusRows[0]?.code || "").trim().toLowerCase();
      const isCanceledTarget = targetStatusCode === "canceled" || targetStatusCode === "cancelled";
      const isSuccessfulFinalTarget = Number(statusRows[0]?.is_final || 0) === 1 && !isCanceledTarget;
      const isCurrentSuccessfulFinal = currentStatusIsFinal && currentStatusCode !== "canceled" && currentStatusCode !== "cancelled";
      if (isCurrentSuccessfulFinal && isCanceledTarget) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(409).json({ ok: false, error: "INVALID_STATUS_TRANSITION" });
      }

      const [tenantRows] = await conn.query(
        `SELECT order_stock_deduct_mode, order_stock_deduct_status_id
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const deductMode = String(tenantRows[0]?.order_stock_deduct_mode || "on_create").trim();
      let deductStatusId = Number(tenantRows[0]?.order_stock_deduct_status_id || 0) || null;

      if (deductMode === "on_status" && !deductStatusId) {
        const [fallbackRows] = await conn.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=? AND is_active=1
             AND (code='delivered' OR (is_final=1 AND code<>'canceled'))
           ORDER BY (code='delivered') DESC, sort ASC, id ASC
           LIMIT 1`,
          [tenantId, storeId]
        );
        if (fallbackRows.length) {
          deductStatusId = Number(fallbackRows[0].id);
        }
      }

      let stockDeductedAt = orderRow.stock_deducted_at || null;
      let stockDocumentId = orderRow.stock_document_id != null ? Number(orderRow.stock_document_id) : null;
      let stockChangedProductIds = [];
      const shouldDeductNow =
        deductMode === "on_status" &&
        !stockDeductedAt &&
        deductStatusId != null &&
        Number(statusId) === Number(deductStatusId);

      if (shouldDeductNow) {
        let orderItems = [];
        try {
          const parsed = orderRow.items ? JSON.parse(orderRow.items) : [];
          if (Array.isArray(parsed)) orderItems = parsed;
        } catch {
          orderItems = [];
        }

        try {
          const deductionResult = await applyStockDeductionForOrderItems({
            db: conn,
            tenantId,
            storeId,
            items: orderItems,
            orderId: Number(orderRow.id),
            publicId: orderRow.public_id || null,
            createdBy: req.user?.userId || null,
          });
          stockDeductedAt = deductionResult?.stockDeductedAt || helpers.formatUtcDateTime(Date.now());
          stockDocumentId = deductionResult?.stockDocumentId || null;
          stockChangedProductIds = Array.from(
            new Set(
              (Array.isArray(deductionResult?.deductions) ? deductionResult.deductions : [])
                .map((d) => Number(d?.productId))
                .filter((pid) => Number.isFinite(pid) && pid > 0)
            )
          );
        } catch (stockErr) {
          if (stockErr && stockErr.code === "OUT_OF_STOCK") {
            await conn.rollback();
            transactionStarted = false;
            safeRelease();
            return res.status(409).json({ ok: false, error: "OUT_OF_STOCK" });
          }
          throw stockErr;
        }
      }

      await conn.query(
        `UPDATE order_orders
         SET status_id=?,
             stock_deducted_at=COALESCE(?, stock_deducted_at),
             stock_document_id=COALESCE(?, stock_document_id)
         WHERE tenant_id=? AND store_id=? AND id=?`,
        [statusId, stockDeductedAt, stockDocumentId, tenantId, storeId, id]
      );

      if (isCanceledTarget) {
        await releaseOrderBonusReserve(conn, {
          tenantId,
          orderId: id,
          customerId: Number(orderRow?.customer_id || 0) || null,
        });
      } else if (isSuccessfulFinalTarget) {
        await settleOrderBonus(conn, {
          tenantId,
          orderId: id,
          customerId: Number(orderRow?.customer_id || 0) || null,
          discountsJson: orderRow?.discounts_json || null,
          benefitsMetaRaw: orderRow?.benefits_meta_json || null,
        });
      } else {
        await reserveOrderBonusRedeem(conn, {
          tenantId,
          orderId: id,
          customerId: Number(orderRow?.customer_id || 0) || null,
          discountsJson: orderRow?.discounts_json || null,
          benefitsMetaRaw: orderRow?.benefits_meta_json || null,
        });
      }

      if (isCanceledTarget) {
        let orderItems = [];
        try {
          const parsed = orderRow.items ? JSON.parse(orderRow.items) : [];
          if (Array.isArray(parsed)) orderItems = parsed;
        } catch {
          orderItems = [];
        }
        const rewardCustomerId = Number(orderRow?.customer_id || 0);
        const giftRewardIds = Array.from(
          new Set(
            orderItems
              .map((item) => Number(item?.gift_reward_id || 0))
              .filter((rewardId) => Number.isInteger(rewardId) && rewardId > 0)
          )
        );
        if (rewardCustomerId > 0 && giftRewardIds.length) {
          await conn.query(
            `UPDATE mkt_discount_rewards
                SET status='available', used_at=NULL, updated_at=NOW()
              WHERE tenant_id=?
                AND customer_id=?
                AND reward_type='gift'
                AND status='used'
                AND id IN (?)`,
            [tenantId, rewardCustomerId, giftRewardIds]
          );
        }
        const canceledBenefitsMeta = parseOrderBenefitsMetaJson(orderRow?.benefits_meta_json);
        const canceledRewardPromoId = canceledBenefitsMeta?.selected_promo_source === "reward_promo"
          ? (Number(canceledBenefitsMeta?.selected_promo_reward_id || 0) || null)
          : null;
        if (rewardCustomerId > 0 && canceledRewardPromoId) {
          await conn.query(
            `UPDATE mkt_discount_rewards
                SET status='available', used_at=NULL, updated_at=NOW()
              WHERE tenant_id=?
                AND customer_id=?
                AND reward_type='promo_code'
                AND status='used'
                AND id=?`,
            [tenantId, rewardCustomerId, canceledRewardPromoId]
          );
        }
      }

      await accrueOrderBenefitsIfAvailable({
        conn,
        tenantId,
        storeId,
        orderId: id,
      });

      await syncDeliveredOrderDiscountUsage(conn, {
        tenantId,
        storeId,
        orderId: id,
        statusId,
        customerId: Number(orderRow?.customer_id || 0) || null,
        discountsJson: orderRow?.discounts_json || null,
        orderPromoCode: orderRow?.promo_code || null,
        benefitsMetaRaw: orderRow?.benefits_meta_json || null,
      });
      await syncDeliveredOrderRewardPromoUsage(conn, {
        tenantId,
        storeId,
        statusId,
        customerId: Number(orderRow?.customer_id || 0) || null,
        benefitsMetaRaw: orderRow?.benefits_meta_json || null,
      });

      await conn.commit();
      transactionStarted = false;
      safeRelease();

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (payload) {
        if (ordersEvents && typeof ordersEvents.publish === "function") {
          ordersEvents.publish(tenantId, storeId, "order.updated", payload);
        }
        const payloadStatusCode = String(payload?.status_code || "").trim().toLowerCase();
        const payloadStatusTitle = String(payload?.status_title || "").trim().toLowerCase();
        const shouldTryPrintEnqueue = payloadStatusCode === "new" || payloadStatusTitle.startsWith("нов");
        try {
          if (shouldTryPrintEnqueue) {
            const pushed = await sendOrderToPrintBot({
              db,
              order: payload,
              tenantId,
              storeId,
              silentSkipReasons: ["ORDER_STATUS_NOT_NEW"],
            });
            if (!pushed) {
              console.warn("Print enqueue returned false (admin/orders status update)", {
                orderId: Number(payload?.id || id),
                tenantId: Number(tenantId),
                storeId: Number(storeId),
              });
            }
          }
        } catch (err) {
          console.error("Print enqueue failed (admin/orders status update):", {
            orderId: Number(payload?.id || id),
            tenantId: Number(tenantId),
            storeId: Number(storeId),
            error: String(err?.message || err || "unknown_error"),
          });
        }
      }
      if (stockChangedProductIds.length) {
        publishStockChanged(tenantId, storeId, {
          source: "order.status_update",
          order_id: Number(id),
          product_ids: stockChangedProductIds,
        });
      }

      res.json({ ok: true });
    } catch (e) {
      if (transactionStarted) {
        try {
          await conn.rollback();
        } catch {}
      }
      safeRelease();
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // reorder orders in status
  // ---------------------------
  // PUT /api/admin/orders/reorder
  router.put("/reorder", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const statusId = Number(req.body.status_id);
      const orderedIdsRaw = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];

      if (!Number.isFinite(statusId) || statusId <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      const orderedIds = orderedIdsRaw
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0);

      if (orderedIds.length > 1000) {
        return res.status(400).json({ ok: false, error: "TOO_MANY_IDS" });
      }

      if (!orderedIds.length) {
        return res.json({ ok: true });
      }

      const seen = new Set();
      const uniqIds = [];
      for (const id of orderedIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniqIds.push(id);
      }

      const n = uniqIds.length;
      const caseSql = uniqIds.map(() => "WHEN ? THEN ?").join(" ");
      const inSql = uniqIds.map(() => "?").join(",");
      const params = [];

      uniqIds.forEach((id, idx) => {
        params.push(id, (n - idx) * 10);
      });

      await db.query(
        `
        UPDATE order_orders
        SET status_sort = CASE id ${caseSql} ELSE status_sort END
        WHERE tenant_id=? AND store_id=? AND status_id=? AND is_active=1 AND id IN (${inSql})
        `,
        [...params, tenantId, storeId, statusId, ...uniqIds]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // deactivate order
  // ---------------------------
  // PUT /api/admin/orders/:id
  router.put("/:id", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      const hasBenefitsMetaColumn = await ensureOrderBenefitsMetaColumn();

      const [existingRows] = await db.query(
        `SELECT id, public_id, customer_id, promo_code, address_comment, cutlery_qty, discounts_json, status_id,
                ${hasBenefitsMetaColumn ? "benefits_meta_json," : ""}
                items,
                stock_deducted_at
         FROM order_orders
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, storeId, id]
      );
      if (!existingRows.length) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }
      const existing = existingRows[0] || {};
      let previousItems = [];
      try {
        const parsedExistingItems = existing?.items ? JSON.parse(existing.items) : [];
        if (Array.isArray(parsedExistingItems)) previousItems = parsedExistingItems;
      } catch {}

      const methodCode = String(req.body?.method_code || "").trim();
      const paymentCode = String(req.body?.payment_code || "").trim();
      const timeOptionCode = String(req.body?.time_option_code || "").trim();
      if (!methodCode) return res.status(400).json({ ok: false, error: "BAD_METHOD_CODE" });
      if (!paymentCode) return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      if (!timeOptionCode) return res.status(400).json({ ok: false, error: "BAD_TIME_OPTION_CODE" });
      await ensureOrderDeliveryTypeColumns();

      const [[deliveryTypeRows], [paymentRows], [timeOptionRows]] = await Promise.all([
        db.query(
          `SELECT id, require_client_data FROM order_delivery_types
           WHERE tenant_id=? AND code=? AND is_active=1
           LIMIT 1`,
          [tenantId, methodCode]
        ),
        db.query(
          `SELECT id FROM order_payments
           WHERE tenant_id=? AND code=? AND is_active=1
           LIMIT 1`,
          [tenantId, paymentCode]
        ),
        db.query(
          `SELECT id FROM order_time_options
           WHERE tenant_id=? AND code=? AND is_active=1
           LIMIT 1`,
          [tenantId, timeOptionCode]
        ),
      ]);
      const deliveryTypeRow = Array.isArray(deliveryTypeRows) ? deliveryTypeRows[0] : null;
      const paymentRow = Array.isArray(paymentRows) ? paymentRows[0] : null;
      const timeOptionRow = Array.isArray(timeOptionRows) ? timeOptionRows[0] : null;

      const deliveryTypeId = Number(deliveryTypeRow?.id || 0);
      const requireClientData = Number(deliveryTypeRow?.require_client_data ?? 1) !== 0;
      const paymentId = Number(paymentRow?.id || 0);
      const timeOptionId = Number(timeOptionRow?.id || 0);
      if (!(deliveryTypeId > 0)) return res.status(400).json({ ok: false, error: "BAD_METHOD_CODE" });
      if (!(paymentId > 0)) return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      if (!(timeOptionId > 0)) return res.status(400).json({ ok: false, error: "BAD_TIME_OPTION_CODE" });

      const customerNameRaw = helpers.strOrNull(req.body?.customer_name);
      const customerName = customerNameRaw || (requireClientData ? "Клиент" : null);
      const phoneDigits = String(req.body?.customer_phone || "").replace(/\D/g, "");
      const hasPhone = phoneDigits.length > 0;
      if (requireClientData && phoneDigits.length !== 11) {
        return res.status(400).json({ ok: false, error: "BAD_CUSTOMER_PHONE" });
      }
      if (!requireClientData && hasPhone && phoneDigits.length !== 11) {
        return res.status(400).json({ ok: false, error: "BAD_CUSTOMER_PHONE" });
      }
      const customerPhone = hasPhone && phoneDigits.length === 11 ? `+${phoneDigits}` : null;
      const customerIdRaw = Number(req.body?.customer_id || 0);
      const existingCustomerId = Number(existing?.customer_id || 0);
      const customerId = customerIdRaw > 0
        ? customerIdRaw
        : (existingCustomerId > 0 ? existingCustomerId : null);

      const isDeliveryMethod = String(methodCode).trim().toLowerCase() === "delivery";
      const deliveryAddress = helpers.strOrNull(req.body?.delivery_address);
      if (isDeliveryMethod && !deliveryAddress) {
        return res.status(400).json({ ok: false, error: "BAD_DELIVERY_ADDRESS" });
      }
      const deliveryAddressIdRaw = Number(req.body?.delivery_address_id || 0);
      const deliveryAddressId = isDeliveryMethod && deliveryAddressIdRaw > 0 ? deliveryAddressIdRaw : null;
      const pickupStoreIdRaw = Number(req.body?.pickup_store_id || 0);
      const pickupStoreId = !isDeliveryMethod && pickupStoreIdRaw > 0 ? pickupStoreIdRaw : null;

      const comment = helpers.strOrNull(req.body?.comment);
      const addressComment = Object.prototype.hasOwnProperty.call(req.body || {}, "address_comment")
        ? helpers.strOrNull(req.body?.address_comment)
        : helpers.strOrNull(existing?.address_comment);
      const promoCode = Object.prototype.hasOwnProperty.call(req.body || {}, "promo_code")
        ? helpers.strOrNull(req.body?.promo_code)
        : helpers.strOrNull(existing?.promo_code);
      const benefitsMetaJson = hasBenefitsMetaColumn
        ? buildOrderBenefitsMetaJson(req.body, existing?.benefits_meta_json)
        : null;
      const hasExplicitBonusRedeemDisabled = (
        Object.prototype.hasOwnProperty.call(req.body || {}, "bonus_redeem_enabled")
        && !(req.body.bonus_redeem_enabled === true || req.body.bonus_redeem_enabled === "true" || Number(req.body.bonus_redeem_enabled || 0) === 1)
      ) || (
        Object.prototype.hasOwnProperty.call(req.body || {}, "bonus_redeem_amount")
        && !(Number(req.body.bonus_redeem_amount || 0) > 0)
      );
      const cutleryQty = Object.prototype.hasOwnProperty.call(req.body || {}, "cutlery_qty")
        ? Math.max(0, Number(req.body?.cutlery_qty || 0))
        : Math.max(0, Number(existing?.cutlery_qty || 0));
      const changeFromRaw = Number(req.body?.change_from);
      const changeFrom = Number.isFinite(changeFromRaw) && changeFromRaw > 0 ? changeFromRaw : null;
      const scheduledAt = helpers.strOrNull(req.body?.scheduled_at) || null;

      const [tenantRows] = await db.query(
        `SELECT price_rounding_mode, price_rounding_precision
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const roundingModeRaw = String(tenantRows?.[0]?.price_rounding_mode || "none").trim();
      const roundingPrecisionRaw = Number(tenantRows?.[0]?.price_rounding_precision);
      const allowedRounding = new Set(["none", "down", "up", "nearest"]);
      const roundingMode = allowedRounding.has(roundingModeRaw) ? roundingModeRaw : "none";
      const roundingPrecision = roundingPrecisionRaw === 0 ? 0 : 2;
      const roundMoney = (value) => {
        const n = Number(value || 0);
        if (!Number.isFinite(n)) return 0;
        if (roundingMode === "none") return n;
        const factor = roundingPrecision > 0 ? Math.pow(10, roundingPrecision) : 1;
        if (roundingMode === "up") return Math.ceil((n + Number.EPSILON) * factor) / factor;
        if (roundingMode === "down") return Math.floor((n + Number.EPSILON) * factor) / factor;
        return Math.round((n + Number.EPSILON) * factor) / factor;
      };
      const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!itemsRaw.length) {
        return res.status(400).json({ ok: false, error: "EMPTY_ITEMS" });
      }

      const items = [];
      for (const rawItem of itemsRaw) {
        const qty = Math.max(1, Number(rawItem?.qty || rawItem?.quantity || 1));
        const lineTotal = roundMoney(Number(rawItem?.line_total ?? rawItem?.sum ?? rawItem?.total ?? 0));
        const originalLineTotal = roundMoney(Number(rawItem?.original_line_total ?? rawItem?.old_line_total ?? lineTotal));
        const benefitsExcludedLineTotal = roundMoney(Math.min(
          lineTotal,
          Math.max(0, Number(rawItem?.benefits_excluded_line_total ?? rawItem?.discount_excluded_line_total ?? 0) || 0)
        ));
        const bonusRedeemLineAmount = roundMoney(Math.min(
          Math.max(0, originalLineTotal - lineTotal),
          Math.max(0, Number(rawItem?.bonus_redeem_line_amount ?? rawItem?.bonusRedeemLineAmount ?? 0) || 0)
        ));

        if (String(rawItem?.type || "").toLowerCase() === "combo" || Number(rawItem?.combo_id || 0) > 0) {
          const comboId = Number(rawItem?.combo_id || 0);
          const comboCategoryIds = [
            Number(rawItem?.combo_category_id || 0),
            ...(Array.isArray(rawItem?.category_ids) ? rawItem.category_ids.map((categoryId) => Number(categoryId || 0)) : []),
            ...(Array.isArray(rawItem?.checkout_category_ids) ? rawItem.checkout_category_ids.map((categoryId) => Number(categoryId || 0)) : []),
            ...(Array.isArray(rawItem?.sections) ? rawItem.sections.map((section) => Number(section?.category_id || 0)) : []),
          ].filter((categoryId, index, list) => categoryId > 0 && list.indexOf(categoryId) === index);
          items.push({
            type: "combo",
            combo_id: comboId > 0 ? comboId : null,
            combo_category_id: Number(rawItem?.combo_category_id || comboCategoryIds[0] || 0) || null,
            category_ids: comboCategoryIds,
            name: String(rawItem?.name || rawItem?.combo_title || "Комбо").trim() || "Комбо",
            qty,
            line_total: lineTotal,
            old_line_total: originalLineTotal,
            bonus_redeem_line_amount: bonusRedeemLineAmount,
            benefits_excluded_line_total: benefitsExcludedLineTotal,
            sections: Array.isArray(rawItem?.sections) ? rawItem.sections : [],
            selections: Array.isArray(rawItem?.selections) ? rawItem.selections : [],
          });
          continue;
        }

        const productId = Number(rawItem?.product_id || 0);
        if (!(productId > 0)) continue;

        const optionItems = Array.isArray(rawItem?.option_items)
          ? rawItem.option_items
            .map((opt) => {
              const optionId = Number(opt?.id || 0);
              const optionQty = Math.max(0, Number(opt?.qty || 0));
              if (!(optionId > 0) || !(optionQty > 0)) return null;
              const groupId = Number(opt?.group_id || 0);
              const variantGroupId = Number(opt?.variant_group_id || 0);
              const variantValueIndex = Number(opt?.variant_value_index);
              return {
                id: optionId,
                group_id: groupId > 0 ? groupId : null,
                qty: optionQty,
                variant_group_id: variantGroupId > 0 ? variantGroupId : null,
                variant_value_index: Number.isFinite(variantValueIndex) ? variantValueIndex : null,
              };
            })
            .filter(Boolean)
          : [];
        const optionItemIdsFromBody = Array.isArray(rawItem?.option_item_ids)
          ? rawItem.option_item_ids.map((x) => Number(x)).filter((x) => x > 0)
          : [];
        const optionItemIds = optionItemIdsFromBody.length
          ? optionItemIdsFromBody
          : optionItems.map((opt) => Number(opt.id)).filter((x) => x > 0);

        items.push({
          product_id: productId,
          category_id: Number(rawItem?.category_id || rawItem?._category_id || rawItem?.product_category_id || 0) || null,
          category_ids: Array.isArray(rawItem?.category_ids)
            ? rawItem.category_ids.map((categoryId) => Number(categoryId || 0)).filter((categoryId, index, list) => categoryId > 0 && list.indexOf(categoryId) === index)
            : [],
          qty,
          option_item_ids: optionItemIds,
          option_items: optionItems,
          ingredients: Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : [],
          variant_group_id: Number(rawItem?.variant_group_id || 0) || null,
          variant_value_index: Number.isFinite(Number(rawItem?.variant_value_index)) ? Number(rawItem.variant_value_index) : null,
          variant_label: helpers.strOrNull(rawItem?.variant_label),
          is_gift_reward: Number(rawItem?.is_gift_reward || 0) === 1 ? 1 : 0,
          gift_reward_id: Number(rawItem?.gift_reward_id || 0) > 0 ? Number(rawItem.gift_reward_id) : null,
          line_total: lineTotal,
          old_line_total: originalLineTotal,
          bonus_redeem_line_amount: bonusRedeemLineAmount,
          benefits_excluded_line_total: benefitsExcludedLineTotal,
        });
      }

      const toText = (value) => String(value == null ? "" : value).trim();
      const productIds = [...new Set(
        items
          .map((item) => Number(item?.product_id || 0))
          .filter((id) => id > 0)
      )];
      const comboIds = [...new Set(
        items
          .map((item) => Number(item?.combo_id || 0))
          .filter((id) => id > 0)
      )];
      const optionIds = [...new Set(
        items
          .flatMap((item) => Array.isArray(item?.option_item_ids) ? item.option_item_ids : [])
          .map((id) => Number(id))
          .filter((id) => id > 0)
      )];
      const ingredientPairs = [];
      items.forEach((item) => {
        const productId = Number(item?.product_id || 0);
        if (!(productId > 0)) return;
        const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
        ingredients.forEach((ing) => {
          const ingredientId = Number(ing?.ingredient_id || ing?.product_id || 0);
          if (ingredientId > 0) ingredientPairs.push({ productId, ingredientId });
        });
      });
      const ingredientProductIds = [...new Set(ingredientPairs.map((pair) => pair.productId))];
      const ingredientIds = [...new Set(ingredientPairs.map((pair) => pair.ingredientId))];
      const variantGroupIds = [...new Set(
        items
          .map((item) => Number(item?.variant_group_id || 0))
          .filter((id) => id > 0)
      )];

      const productMetaById = new Map();
      const productCategoryIdsById = new Map();
      if (productIds.length) {
        const [productRows] = await db.query(
          `SELECT id, name, price, old_price, photos_json
           FROM prod_products
           WHERE tenant_id=? AND id IN (${productIds.map(() => "?").join(",")})`,
          [tenantId, ...productIds]
        );
        productRows.forEach((row) => {
          let photos = [];
          try {
            const parsed = row?.photos_json ? JSON.parse(row.photos_json) : [];
            if (Array.isArray(parsed)) photos = parsed.map((x) => toText(x)).filter(Boolean);
          } catch {}
          productMetaById.set(Number(row.id), {
            name: toText(row?.name),
            price: Number(row?.price || 0),
            old_price: Number(row?.old_price || 0),
            photos,
          });
        });
        const [productCategoryRows] = await db.query(
          `SELECT product_id, category_id
           FROM prod_product_categories
           WHERE tenant_id=? AND product_id IN (${productIds.map(() => "?").join(",")})`,
          [tenantId, ...productIds]
        );
        productCategoryRows.forEach((row) => {
          const productId = Number(row?.product_id || 0);
          const categoryId = Number(row?.category_id || 0);
          if (!(productId > 0) || !(categoryId > 0)) return;
          if (!productCategoryIdsById.has(productId)) productCategoryIdsById.set(productId, []);
          const ids = productCategoryIdsById.get(productId);
          if (!ids.includes(categoryId)) ids.push(categoryId);
        });
      }

      const comboCategoryIdsById = new Map();
      if (comboIds.length) {
        const [comboCategoryRows] = await db.query(
          `SELECT combo.id AS combo_id, category.id AS category_id
             FROM prod_combos combo
             JOIN prod_categories category
               ON category.tenant_id = combo.tenant_id
              AND LOWER(TRIM(category.code)) = LOWER(TRIM(combo.category_code))
            WHERE combo.tenant_id = ? AND combo.id IN (${comboIds.map(() => "?").join(",")})`,
          [tenantId, ...comboIds]
        );
        comboCategoryRows.forEach((row) => {
          const comboId = Number(row?.combo_id || 0);
          const categoryId = Number(row?.category_id || 0);
          if (comboId > 0 && categoryId > 0) comboCategoryIdsById.set(comboId, categoryId);
        });
      }

      const optionMetaById = new Map();
      if (optionIds.length) {
        const [optionRows] = await db.query(
          `SELECT oi.id,
                  oi.target_product_id,
                  oi.price_mode,
                  oi.price_value,
                  p.name AS product_name,
                  p.price AS product_price
           FROM prod_option_items oi
           LEFT JOIN prod_products p
             ON p.tenant_id=oi.tenant_id AND p.id=oi.target_product_id
           WHERE oi.tenant_id=? AND oi.id IN (${optionIds.map(() => "?").join(",")})`,
          [tenantId, ...optionIds]
        );
        optionRows.forEach((row) => {
          let optionPrice = 0;
          const mode = String(row?.price_mode || "").trim().toLowerCase();
          if (mode === "fixed") {
            optionPrice = Number(row?.price_value || 0);
          } else if (mode === "delta") {
            optionPrice = Number(row?.product_price || 0) + Number(row?.price_value || 0);
          } else {
            optionPrice = Number(row?.product_price || 0);
          }
          optionMetaById.set(Number(row.id), {
            title: toText(row?.product_name),
            price: roundMoney(optionPrice),
            target_product_id: Number(row?.target_product_id || 0) || null,
          });
        });
      }

      const ingredientMetaByKey = new Map();
      if (ingredientProductIds.length && ingredientIds.length) {
        const [ingredientRows] = await db.query(
          `SELECT i.product_id,
                  i.ingredient_id,
                  i.unit_id,
                  p.name AS ingredient_name,
                  u.short_title AS unit_short_title,
                  u.title AS unit_title,
                  u.code AS unit_code
           FROM prod_product_ingredients i
           LEFT JOIN prod_products p
             ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
           LEFT JOIN prod_units u
             ON u.tenant_id=i.tenant_id AND u.id=i.unit_id
           WHERE i.tenant_id=?
             AND i.product_id IN (${ingredientProductIds.map(() => "?").join(",")})
             AND i.ingredient_id IN (${ingredientIds.map(() => "?").join(",")})`,
          [tenantId, ...ingredientProductIds, ...ingredientIds]
        );
        ingredientRows.forEach((row) => {
          const key = `${Number(row?.product_id || 0)}:${Number(row?.ingredient_id || 0)}`;
          ingredientMetaByKey.set(key, {
            unit_id: Number(row?.unit_id || 0) || null,
            ingredient_name: toText(row?.ingredient_name),
            unit_short_title: toText(row?.unit_short_title),
            unit_title: toText(row?.unit_title),
            unit_code: toText(row?.unit_code),
          });
        });
      }

      const variantMetaById = new Map();
      if (variantGroupIds.length) {
        const [variantRows] = await db.query(
          `SELECT id, title, \`values\`
           FROM prod_variant_groups
           WHERE tenant_id=? AND id IN (${variantGroupIds.map(() => "?").join(",")})`,
          [tenantId, ...variantGroupIds]
        );
        variantRows.forEach((row) => {
          let values = [];
          try {
            const parsed = row?.values ? JSON.parse(row.values) : [];
            if (Array.isArray(parsed)) values = parsed;
          } catch {}
          variantMetaById.set(Number(row.id), {
            title: toText(row?.title),
            values,
          });
        });
      }

      for (const item of items) {
        const lineTotal = roundMoney(Number(item?.line_total || 0));
        const oldLineTotal = roundMoney(Number(item?.old_line_total ?? lineTotal));
        const qty = Math.max(1, Number(item?.qty || item?.quantity || 1));
        item.qty = qty;
        item.line_total = lineTotal;
        item.old_line_total = oldLineTotal;
        item.bonus_redeem_line_amount = roundMoney(Math.min(
          Math.max(0, oldLineTotal - lineTotal),
          Math.max(0, Number(item?.bonus_redeem_line_amount ?? item?.bonusRedeemLineAmount ?? 0) || 0)
        ));
        item.benefits_excluded_line_total = roundMoney(Math.min(
          lineTotal,
          Math.max(0, Number(item?.benefits_excluded_line_total ?? item?.discount_excluded_line_total ?? 0) || 0)
        ));

        if (String(item?.type || "").toLowerCase() === "combo" || Number(item?.combo_id || 0) > 0) {
          const comboTitle = toText(item?.combo_title || item?.name) || "\u041a\u043e\u043c\u0431\u043e";
          const comboSelections = Array.isArray(item?.selections) ? item.selections : [];
          const normalizedSelections = comboSelections.map((sel) => {
            const out = sel && typeof sel === "object" ? { ...sel } : {};
            out.product_id = Number(sel?.product_id || 0) || null;
            out.product_name = toText(sel?.product_name);
            out.product_photo = toText(sel?.product_photo);
            out.variant_label = toText(sel?.variant_label);
            out.variant_group_title = toText(sel?.variant_group_title);
            out.variant_unit = toText(sel?.variant_unit);
            out.variant_value_index = Number.isFinite(Number(sel?.variant_value_index)) ? Number(sel.variant_value_index) : null;
            out.variant_group_id = Number(sel?.variant_group_id || 0) || null;
            const unitPriceOverride = Number(sel?.unit_price_override);
            if (Number.isFinite(unitPriceOverride)) {
              out.unit_price_override = unitPriceOverride;
            }
            const unitPriceBeforeDiscount = Number(sel?.unit_price_before_discount);
            if (Number.isFinite(unitPriceBeforeDiscount)) {
              out.unit_price_before_discount = unitPriceBeforeDiscount;
            }
            out.ingredients_display = Array.isArray(sel?.ingredients_display)
              ? sel.ingredients_display.map((ing) => {
                const next = ing && typeof ing === "object" ? { ...ing } : {};
                next.ingredient_id = Number(ing?.ingredient_id || ing?.product_id || 0) || null;
                next.product_id = Number(ing?.product_id || ing?.ingredient_id || 0) || null;
                next.quantity = Number(ing?.quantity ?? ing?.qty ?? 0);
                next.qty = Number(ing?.qty ?? ing?.quantity ?? 0);
                next.unit = toText(ing?.unit);
                next.unit_id = Number(ing?.unit_id || 0) || null;
                next.name = toText(ing?.name);
                return next;
              })
              : [];
            return out;
          });
          const comboRawPhotos = Array.isArray(item?.photos)
            ? item.photos.map((x) => toText(x)).filter(Boolean)
            : [];
          const comboDerivedPhotos = normalizedSelections.map((sel) => toText(sel?.product_photo)).filter(Boolean);
          item.type = "combo";
          item.combo_title = comboTitle;
          item.name = comboTitle;
          item.selections = normalizedSelections;
          item.photos = comboRawPhotos.length ? comboRawPhotos : comboDerivedPhotos;
          item.price = qty > 0 ? roundMoney(lineTotal / qty) : 0;
          item.old_price = qty > 0 ? roundMoney(oldLineTotal / qty) : 0;
          const comboId = Number(item?.combo_id || 0);
          const comboCategoryId = Number(
            (comboId > 0 ? comboCategoryIdsById.get(comboId) : 0)
            || item?.combo_category_id
            || 0
          );
          const sectionCategoryIds = (Array.isArray(item?.sections) ? item.sections : [])
            .map((section) => Number(section?.category_id || 0))
            .filter((categoryId, index, list) => categoryId > 0 && list.indexOf(categoryId) === index);
          const comboCategoryIds = [
            comboCategoryId,
            ...(Array.isArray(item?.category_ids) ? item.category_ids.map((categoryId) => Number(categoryId || 0)) : []),
            ...sectionCategoryIds,
          ].filter((categoryId, index, list) => categoryId > 0 && list.indexOf(categoryId) === index);
          item.combo_category_id = comboCategoryId > 0 ? comboCategoryId : (comboCategoryIds[0] || null);
          item.category_ids = comboCategoryIds;
          continue;
        }

        const productId = Number(item?.product_id || 0);
        if (!(productId > 0)) continue;
        const productMeta = productMetaById.get(productId) || null;
        const rawPhotos = Array.isArray(item?.photos) ? item.photos.map((x) => toText(x)).filter(Boolean) : [];
        const optionIdsForItem = Array.isArray(item?.option_item_ids)
          ? item.option_item_ids.map((id) => Number(id)).filter((id) => id > 0)
          : [];
        const optionRowsSource = Array.isArray(item?.option_items) && item.option_items.length
          ? item.option_items
          : optionIdsForItem.map((id) => ({ id, qty: 1 }));
        const optionRows = optionRowsSource
          .map((opt) => {
            const optionId = Number(opt?.id || 0);
            if (!(optionId > 0)) return null;
            const optionMeta = optionMetaById.get(optionId) || null;
            const optionQty = Math.max(1, Number(opt?.qty || opt?.quantity || 1));
            const groupId = Number(opt?.group_id || 0);
            const optionVariantGroupId = Number(opt?.variant_group_id || 0);
            const optionVariantValueIndex = Number(opt?.variant_value_index);
            const optionPriceRaw = Number(opt?.price);
            const optionPrice = Number.isFinite(optionPriceRaw) ? optionPriceRaw : Number(optionMeta?.price || 0);
            const optionTitle = toText(opt?.title || optionMeta?.title);
            const optionVariantLabel = toText(opt?.variant_label);
            const out = {
              id: optionId,
              title: optionTitle,
              price: roundMoney(optionPrice),
              qty: optionQty,
            };
            const targetProductId = Number(optionMeta?.target_product_id || 0);
            if (targetProductId > 0) out.target_product_id = targetProductId;
            if (groupId > 0) out.group_id = groupId;
            if (optionVariantGroupId > 0) out.variant_group_id = optionVariantGroupId;
            if (Number.isFinite(optionVariantValueIndex)) out.variant_value_index = optionVariantValueIndex;
            if (optionVariantLabel) out.variant_label = optionVariantLabel;
            return out;
          })
          .filter(Boolean);

        const ingredients = (Array.isArray(item?.ingredients) ? item.ingredients : [])
          .map((ing) => {
            const ingredientId = Number(ing?.ingredient_id || ing?.product_id || 0);
            if (!(ingredientId > 0)) return null;
            const ingredientQty = Number(ing?.qty ?? ing?.quantity ?? 0);
            if (!Number.isFinite(ingredientQty) || ingredientQty < 0) return null;
            const meta = ingredientMetaByKey.get(`${productId}:${ingredientId}`) || null;
            const unitId = Number(ing?.unit_id || meta?.unit_id || 0);
            const unitLabel = toText(
              ing?.unit_label
              || ing?.unit
              || meta?.unit_short_title
              || meta?.unit_title
              || meta?.unit_code
            );
            const row = {
              ingredient_id: ingredientId,
              quantity: ingredientQty,
              qty: ingredientQty,
            };
            const ingName = toText(ing?.name || meta?.ingredient_name);
            if (ingName) row.name = ingName;
            if (unitId > 0) row.unit_id = unitId;
            if (unitLabel) row.unit_label = unitLabel;
            const ingPrice = Number(ing?.price);
            if (Number.isFinite(ingPrice)) row.price = roundMoney(ingPrice);
            const ingTotal = Number(ing?.total);
            if (Number.isFinite(ingTotal)) row.total = roundMoney(ingTotal);
            return row;
          })
          .filter(Boolean);

        const variantGroupId = Number(item?.variant_group_id || 0);
        const variantValueIndexRaw = Number(item?.variant_value_index);
        const variantValueIndex = Number.isFinite(variantValueIndexRaw) ? variantValueIndexRaw : null;
        const variantLabel = toText(item?.variant_label);
        const variants = [];
        if (variantGroupId > 0 && Number.isFinite(variantValueIndex) && variantValueIndex >= 0) {
          const variantMeta = variantMetaById.get(variantGroupId) || null;
          let value = "";
          if (variantMeta && Array.isArray(variantMeta.values) && variantMeta.values[variantValueIndex] != null) {
            value = toText(variantMeta.values[variantValueIndex]);
          }
          const label = variantLabel || value;
          variants.push({
            variant_group_id: variantGroupId,
            variant_value_index: variantValueIndex,
            group_title: toText(variantMeta?.title),
            value: value || label,
            label: label || value,
            price_diff: 0,
          });
        }

        const unitPriceRaw = Number(item?.price);
        const fallbackUnitPrice = qty > 0 ? lineTotal / qty : Number(productMeta?.price || 0);
        const oldPriceRaw = Number(item?.old_price);
        const fallbackOldPrice = qty > 0 ? oldLineTotal / qty : Number(productMeta?.old_price || 0);
        item.type = "product";
        item.name = toText(item?.name || productMeta?.name) || "\u0422\u043e\u0432\u0430\u0440";
        item.photos = rawPhotos.length ? rawPhotos : (Array.isArray(productMeta?.photos) ? productMeta.photos : []);
        item.price = roundMoney(Number.isFinite(unitPriceRaw) ? unitPriceRaw : fallbackUnitPrice);
        item.old_price = roundMoney(Math.max(0, Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? oldPriceRaw : fallbackOldPrice));
        item.option_item_ids = optionIdsForItem.length
          ? [...new Set(optionIdsForItem)]
          : optionRows.map((opt) => Number(opt.id)).filter((id) => id > 0);
        item.option_items = optionRows;
        item.options = optionRows;
        item.ingredients = ingredients;
        item.variant_group_id = variantGroupId > 0 ? variantGroupId : null;
        item.variant_value_index = Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null;
        item.variant_label = variantLabel || null;
        item.variants = variants;
        const categoryIds = [
          Number(item?.category_id || item?._category_id || item?.product_category_id || 0),
          ...(Array.isArray(item?.category_ids) ? item.category_ids.map((categoryId) => Number(categoryId || 0)) : []),
          ...(productCategoryIdsById.get(productId) || []),
        ].filter((categoryId, index, list) => categoryId > 0 && list.indexOf(categoryId) === index);
        item.category_id = categoryIds[0] || null;
        item.category_ids = categoryIds;
        if (oldLineTotal > lineTotal) {
          item.discount = { original_line_total: oldLineTotal };
        } else if (item.discount && typeof item.discount === "object") {
          delete item.discount;
        }
      }

      if (!items.length) {
        return res.status(400).json({ ok: false, error: "EMPTY_ITEMS" });
      }

      if (!existing?.stock_deducted_at) {
        const stockCheck = await checkStockAvailabilityForOrderItems({
          db,
          tenantId,
          storeId,
          items,
        });
        if (!stockCheck.available) {
          return res.status(409).json({
            ok: false,
            error: "OUT_OF_STOCK",
            data: { shortages: Array.isArray(stockCheck.shortages) ? stockCheck.shortages : [] },
          });
        }
      }

      const itemsTotal = roundMoney(items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0));
      const itemsDiscountEligibleTotal = roundMoney(items.reduce((sum, item) => {
        const lineTotal = Number(item?.line_total || 0);
        const excludedTotal = Math.min(
          lineTotal,
          Math.max(0, Number(item?.benefits_excluded_line_total ?? item?.discount_excluded_line_total ?? 0) || 0)
        );
        return sum + Math.max(0, lineTotal - excludedTotal);
      }, 0));
      const oldItemsTotal = roundMoney(items.reduce((sum, item) => {
        const line = Number(item?.line_total || 0);
        const old = Number(item?.old_line_total || line);
        const bonusLineAmount = Math.max(0, Number(item?.bonus_redeem_line_amount || 0));
        const itemDiscountBase = old > line ? Math.max(line, old - bonusLineAmount) : line;
        return sum + itemDiscountBase;
      }, 0));
      const itemLevelDiscountAmount = roundMoney(Math.max(0, oldItemsTotal - itemsTotal));
      const itemsTotalOverrideRaw = Number(req.body?.benefits_items_total_override);
      const hasItemsTotalOverride = Number.isFinite(itemsTotalOverrideRaw) && itemsTotalOverrideRaw >= 0;
      const discountAmountOverrideRaw = Number(req.body?.discount_amount_override);
      const hasDiscountAmountOverride = Number.isFinite(discountAmountOverrideRaw) && discountAmountOverrideRaw >= 0;
      const hasProvidedDiscountsJson = Array.isArray(req.body?.discounts_json);
      const hasProvidedDiscountSnapshot = (
        hasItemsTotalOverride
        || hasDiscountAmountOverride
        || hasProvidedDiscountsJson
      );
      const providedDiscountsJsonTotal = hasProvidedDiscountsJson
        ? roundMoney(
            req.body.discounts_json.reduce((sum, row) => (
              sum + Number(row?.discount_amount ?? row?.amount ?? 0)
            ), 0)
          )
        : 0;

      let customerOrderDiscountAmount = 0;
      let appliedOrderDiscounts = [];
      if (!hasProvidedDiscountSnapshot && Number(customerId || 0) > 0 && itemsDiscountEligibleTotal > 0) {
        const orderDiscountsForCustomer = await discountHelpers.getOrderDiscounts(
          db,
          tenantId,
          storeId,
          customerId,
          itemsDiscountEligibleTotal,
          null,
          { excludeOrderId: id }
        );
        if (Array.isArray(orderDiscountsForCustomer) && orderDiscountsForCustomer.length) {
          const applied = discountHelpers.applyBestDiscounts(orderDiscountsForCustomer, itemsDiscountEligibleTotal);
          customerOrderDiscountAmount = roundMoney(Math.max(0, Number(applied?.totalDiscount || 0)));
          appliedOrderDiscounts = Array.isArray(applied?.appliedDiscounts) ? applied.appliedDiscounts : [];
        }
      }
      const itemsTotalAfterDiscounts = hasItemsTotalOverride
        ? roundMoney(Math.max(0, itemsTotalOverrideRaw))
        : roundMoney(Math.max(0, itemsTotal - customerOrderDiscountAmount));
      const discountAmount = hasDiscountAmountOverride
        ? roundMoney(Math.max(0, discountAmountOverrideRaw))
        : hasProvidedDiscountsJson
          ? roundMoney(Math.max(0, providedDiscountsJsonTotal))
          : roundMoney(itemLevelDiscountAmount + customerOrderDiscountAmount);

      let deliveryCost = 0;
      if (isDeliveryMethod) {
        let resolvedDeliveryAddress = null;
        if (deliveryAddressId && customerId) {
          resolvedDeliveryAddress = await loadCustomerAddressById({
            db,
            helpers,
            tenantId,
            customerId,
            addressId: deliveryAddressId,
          });
          if (!resolvedDeliveryAddress) {
            return res.status(404).json({ ok: false, error: "ADDRESS_NOT_FOUND" });
          }
        }

        const hasInlineDeliveryAddressInput = [
          "delivery_address_city",
          "delivery_address_street",
          "delivery_address_house",
          "delivery_address_entrance",
          "delivery_address_floor",
          "delivery_address_apartment",
          "address_comment",
          "delivery_address_ref",
          "delivery_selected_object_type",
          "delivery_resolved_city_source_key",
          "delivery_address_context_locality",
          "delivery_address_normalized_display",
          "delivery_address_lat",
          "delivery_address_lng",
          "delivery_zone_id",
          "delivery_store_id",
        ].some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));

        let inlineDeliveryAddress = null;
        if (!resolvedDeliveryAddress || hasInlineDeliveryAddressInput) {
          const inlineAddressResult = normalizeCustomerAddressPayload(helpers, {
            city: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_city")
              ? req.body.delivery_address_city
              : existing?.delivery_address_city,
            street: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_street")
              ? req.body.delivery_address_street
              : existing?.delivery_address_street,
            house: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_house")
              ? req.body.delivery_address_house
              : existing?.delivery_address_house,
            entrance: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_entrance")
              ? req.body.delivery_address_entrance
              : existing?.delivery_address_entrance,
            floor: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_floor")
              ? req.body.delivery_address_floor
              : existing?.delivery_address_floor,
            apartment: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_apartment")
              ? req.body.delivery_address_apartment
              : existing?.delivery_address_apartment,
            comment: Object.prototype.hasOwnProperty.call(req.body || {}, "address_comment")
              ? req.body.address_comment
              : existing?.address_comment,
            address_ref: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_ref")
              ? req.body.delivery_address_ref
              : existing?.delivery_address_ref,
            selected_object_type: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_selected_object_type")
              ? req.body.delivery_selected_object_type
              : existing?.delivery_selected_object_type,
            resolved_city_source_key: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_resolved_city_source_key")
              ? req.body.delivery_resolved_city_source_key
              : existing?.delivery_resolved_city_source_key,
            address_context_locality: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_context_locality")
              ? req.body.delivery_address_context_locality
              : existing?.delivery_address_context_locality,
            address_normalized_display: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_normalized_display")
              ? req.body.delivery_address_normalized_display
              : (existing?.delivery_address_normalized_display || deliveryAddress),
            lat: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_lat")
              ? req.body.delivery_address_lat
              : existing?.delivery_address_lat,
            lng: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_address_lng")
              ? req.body.delivery_address_lng
              : existing?.delivery_address_lng,
            delivery_zone_id: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_zone_id")
              ? req.body.delivery_zone_id
              : existing?.delivery_zone_id,
            delivery_store_id: Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_store_id")
              ? req.body.delivery_store_id
              : existing?.delivery_store_id,
          });

          if (inlineAddressResult.ok) {
            inlineDeliveryAddress = inlineAddressResult.data;
          } else if (
            !resolvedDeliveryAddress
            && (inlineAddressResult.error === "STREET_REQUIRED" || inlineAddressResult.error === "HOUSE_REQUIRED")
          ) {
            const defaultSettings = await loadDefaultDeliverySettings(db, tenantId, storeId);
            const fallbackQuote = buildDefaultQuote(defaultSettings, itemsTotalAfterDiscounts);
            const minOrderAmount = Number(fallbackQuote.min_order_amount || 0);
            if (minOrderAmount > 0 && itemsTotalAfterDiscounts < minOrderAmount) {
              return res.status(409).json({ ok: false, error: "MIN_ORDER", min_order_amount: minOrderAmount });
            }
            deliveryCost = roundMoney(Number(fallbackQuote.delivery_cost || 0));
          } else {
            return res.status(400).json({ ok: false, error: inlineAddressResult.error });
          }
        }

        if (resolvedDeliveryAddress || inlineDeliveryAddress) {
          const tenantMapConfig = await getTenantMapConfig(db, tenantId);
          const storeAddressMapEnabled = Boolean(tenantMapConfig?.store_address_map_enabled);
          const deliveryQuote = await buildDeliveryQuote({
            db,
            tenantId,
            storeId,
            subtotal: itemsTotalAfterDiscounts,
            address: resolvedDeliveryAddress || inlineDeliveryAddress,
            storeAddressMapEnabled,
          });
          const minOrderAmount = Number(deliveryQuote.min_order_amount || 0);
          if (minOrderAmount > 0 && itemsTotalAfterDiscounts < minOrderAmount) {
            return res.status(409).json({ ok: false, error: "MIN_ORDER", min_order_amount: minOrderAmount });
          }
          deliveryCost = roundMoney(Number(deliveryQuote.delivery_cost || 0));
        }
      }
      const totalPrice = roundMoney(itemsTotalAfterDiscounts + deliveryCost);

      let discountsJson = [];
      if (Array.isArray(req.body?.discounts_json)) {
        discountsJson = req.body.discounts_json;
      } else {
        discountsJson = parseOrderDiscountsJson(existing?.discounts_json);
      }
      discountsJson = Array.isArray(discountsJson) ? discountsJson : [];
      if (hasExplicitBonusRedeemDisabled) {
        discountsJson = discountsJson.filter((row) => {
          const key = String(row?.key || "").trim().toLowerCase();
          const sourceKind = String(row?.source_kind || row?.sourceKind || "").trim().toLowerCase();
          return key !== "bonus_redeem" && sourceKind !== "bonus";
        });
      }
      if (!hasProvidedDiscountSnapshot && !hasItemsTotalOverride) {
        discountsJson = discountsJson
          .filter((row) => String(row?.apply_to || "").trim().toLowerCase() !== "order");
      }
      if (!hasProvidedDiscountSnapshot && !hasItemsTotalOverride && customerOrderDiscountAmount > 0 && appliedOrderDiscounts.length) {
        discountsJson.push(
          ...appliedOrderDiscounts.map((row) => ({
            discount_id: Number(row?.id || 0),
            title: toText(row?.title),
            discount_type: toText(row?.discount_type),
            discount_value: Number(row?.discount_value || 0),
            discount_amount: roundMoney(Number(row?.discountAmount || 0)),
            apply_to: "order",
          }))
        );
      }

      const previousGiftRewardIds = new Set(
        previousItems
          .map((item) => Number(item?.gift_reward_id || 0))
          .filter((rewardId, index, source) => rewardId > 0 && source.indexOf(rewardId) === index)
      );
      const nextGiftRewardIds = new Set(
        items
          .map((item) => Number(item?.gift_reward_id || 0))
          .filter((rewardId, index, source) => rewardId > 0 && source.indexOf(rewardId) === index)
      );
      const removedGiftRewardIds = [...previousGiftRewardIds].filter((rewardId) => !nextGiftRewardIds.has(rewardId));
      const previousRewardCustomerId = Number(existing?.customer_id || 0);
      const nextRewardCustomerId = Number(customerId || 0);

      if (nextGiftRewardIds.size && !(nextRewardCustomerId > 0)) {
        return res.status(409).json({ ok: false, error: "REWARD_INVALID" });
      }
      if (nextGiftRewardIds.size && nextRewardCustomerId > 0) {
        const nextGiftRewardIdList = [...nextGiftRewardIds];
        const [rewardRows] = await db.query(
          `SELECT id
             FROM mkt_discount_rewards
            WHERE tenant_id=?
              AND customer_id=?
              AND reward_type='gift'
              AND id IN (?)`,
          [tenantId, nextRewardCustomerId, nextGiftRewardIdList]
        );
        if (!Array.isArray(rewardRows) || rewardRows.length !== nextGiftRewardIdList.length) {
          return res.status(409).json({ ok: false, error: "REWARD_INVALID" });
        }
        const conflictingGiftRewardIds = await findActiveGiftRewardOrderConflicts(db, {
          tenantId,
          customerId: nextRewardCustomerId,
          giftRewardIds: nextGiftRewardIdList,
          excludeOrderId: id,
        });
        if (conflictingGiftRewardIds.length) {
          return res.status(409).json({ ok: false, error: "REWARD_INVALID" });
        }
      }

      const [savedStatusRows] = await db.query(
        `SELECT code, is_final
           FROM order_statuses
          WHERE tenant_id=? AND store_id=? AND id=?
          LIMIT 1`,
        [tenantId, storeId, Number(existing?.status_id || 0) || null]
      );
      const savedStatusCode = String(savedStatusRows?.[0]?.code || "").trim().toLowerCase();
      const isSavedCanceled = savedStatusCode === "canceled" || savedStatusCode === "cancelled";
      const isSavedSuccessfulFinal = Number(savedStatusRows?.[0]?.is_final || 0) === 1 && !isSavedCanceled;
      const previousBonusCustomerId = Number(existing?.customer_id || 0) || null;
      const nextBonusCustomerId = Number(customerId || 0) || null;
      if (isSavedCanceled) {
        await releaseOrderBonusReserve(db, {
          tenantId,
          orderId: id,
          customerId: previousBonusCustomerId || nextBonusCustomerId,
        });
      } else if (isSavedSuccessfulFinal) {
        await settleOrderBonus(db, {
          tenantId,
          orderId: id,
          customerId: nextBonusCustomerId,
          discountsJson,
          benefitsMetaRaw: benefitsMetaJson,
        });
      } else {
        await releaseOrderBonusReserve(db, {
          tenantId,
          orderId: id,
          customerId: previousBonusCustomerId || nextBonusCustomerId,
        });
        await reserveOrderBonusRedeem(db, {
          tenantId,
          orderId: id,
          customerId: nextBonusCustomerId,
          discountsJson,
          benefitsMetaRaw: benefitsMetaJson,
        });
      }

      const updateFields = [
        "customer_id=?",
        "customer_name=?",
        "customer_phone=?",
        "promo_code=?",
        "address=?",
        "delivery_address_id=?",
        "pickup_store_id=?",
        "comment=?",
        "address_comment=?",
        "cutlery_qty=?",
        "change_from=?",
        "items=?",
        "total_price=?",
        "delivery_cost=?",
        "discount_amount=?",
        "discounts_json=?",
      ];
      const updateParams = [
        customerId,
        customerName,
        customerPhone,
        promoCode,
        isDeliveryMethod ? deliveryAddress : null,
        deliveryAddressId,
        pickupStoreId,
        comment,
        addressComment,
        cutleryQty,
        changeFrom,
        JSON.stringify(items),
        totalPrice,
        deliveryCost,
        discountAmount,
        JSON.stringify(discountsJson),
      ];
      if (hasBenefitsMetaColumn) {
        updateFields.push("benefits_meta_json=?");
        updateParams.push(benefitsMetaJson);
      }
      updateFields.push(
        "delivery_type_id=?",
        "payment_id=?",
        "time_option_id=?",
        "scheduled_at=?"
      );
      updateParams.push(
        deliveryTypeId,
        paymentId,
        timeOptionId,
        scheduledAt,
        tenantId,
        storeId,
        id
      );
      await db.query(
        `UPDATE order_orders
         SET ${updateFields.join(",\n             ")}
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1`,
        updateParams
      );

      if (removedGiftRewardIds.length && previousRewardCustomerId > 0) {
        await db.query(
          `UPDATE mkt_discount_rewards
              SET status='available', used_at=NULL, updated_at=NOW()
            WHERE tenant_id=?
              AND customer_id=?
              AND reward_type='gift'
              AND status='used'
              AND id IN (?)`,
          [tenantId, previousRewardCustomerId, removedGiftRewardIds]
        );
      }
      if (nextGiftRewardIds.size && nextRewardCustomerId > 0) {
        await db.query(
          `UPDATE mkt_discount_rewards
              SET status='used',
                  used_at=COALESCE(used_at, NOW()),
                  updated_at=NOW()
            WHERE tenant_id=?
              AND customer_id=?
              AND reward_type='gift'
              AND status IN ('available', 'used')
              AND id IN (?)`,
          [tenantId, nextRewardCustomerId, [...nextGiftRewardIds]]
        );
      }

      await syncCustomerOrderMetrics(db, tenantId, [existingCustomerId, customerId]);
      try {
        await accrueOrderBenefitsIfAvailable({
          tenantId,
          storeId,
          orderId: id,
        });
      } catch (accrualErr) {
        console.error("Failed to accrue order benefits after admin order save:", accrualErr);
      }

      try {
        await syncDeliveredOrderDiscountUsage(db, {
          tenantId,
          storeId,
          orderId: id,
          statusId: Number(existing?.status_id || 0) || null,
          customerId: Number(customerId || 0) || null,
          discountsJson,
          orderPromoCode: existing?.promo_code || null,
          benefitsMetaRaw: benefitsMetaJson,
        });
        await syncDeliveredOrderRewardPromoUsage(db, {
          tenantId,
          storeId,
          statusId: Number(existing?.status_id || 0) || null,
          customerId: Number(customerId || 0) || null,
          benefitsMetaRaw: benefitsMetaJson,
        });
      } catch (usageErr) {
        console.error("Failed to sync delivered discount usage after admin order save:", usageErr);
      }

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (payload && ordersEvents && typeof ordersEvents.publish === "function") {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
      }

      res.json({
        ok: true,
        data: {
          id,
          public_id: payload?.public_id || existing?.public_id || null,
        },
      });
    } catch (e) {
      console.error(e);
      if (e && (e.code === "BONUS_ACCOUNT_NOT_FOUND" || e.code === "BONUS_BALANCE_NOT_ENOUGH")) {
        return res.status(409).json({ ok: false, error: e.code });
      }
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // deactivate order
  // ---------------------------
  // DELETE /api/admin/orders/:id
  router.delete("/:id", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      const [rows] = await db.query(
        `SELECT customer_id
         FROM order_orders
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, storeId, id]
      );
      const customerId = Number(rows?.[0]?.customer_id || 0);

      await db.query(
        `UPDATE order_orders SET is_active=0 WHERE tenant_id=? AND store_id=? AND id=?`,
        [tenantId, storeId, id]
      );

      await syncCustomerOrderMetrics(db, tenantId, customerId);

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });


  return router;
};
