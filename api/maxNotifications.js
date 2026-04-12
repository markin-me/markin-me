const { getEffectiveMaxBotConfig } = require('../data/system-settings');
const { sendMaxMessage } = require('./maxIntegration');
const { formatOrderMessage } = require('./telegramNotifications');

async function sendNewOrderMaxNotification(tenantId, storeId, orderPayload, { db, botToken } = {}) {
  const resolvedToken = String(botToken || getEffectiveMaxBotConfig().max_bot_token || '').trim();
  if (!resolvedToken) return;

  const [storeRows] = await db.query(
    `SELECT max_user_id
     FROM ten_store_max
     WHERE tenant_id = ? AND store_id = ? AND max_user_id IS NOT NULL AND max_user_id <> ''`,
    [tenantId, storeId]
  );

  const [globalRows] = await db.query(
    `SELECT DISTINCT t.max_user_id
     FROM ten_tenant_max t
     INNER JOIN ten_tenant_max_stores ts ON ts.tenant_max_id = t.id AND ts.is_enabled = 1
     WHERE t.tenant_id = ? AND ts.store_id = ? AND t.max_user_id IS NOT NULL AND t.max_user_id <> ''`,
    [tenantId, storeId]
  );

  const userIds = new Set();
  storeRows.forEach((row) => userIds.add(String(row.max_user_id || '').trim()));
  globalRows.forEach((row) => userIds.add(String(row.max_user_id || '').trim()));
  userIds.delete('');

  if (!userIds.size) return;

  const opts = {};
  const adminBase = (process.env.ADMIN_BASE_URL || process.env.ORDER_LINK_BASE || '').trim();
  if (adminBase && orderPayload.id) {
    const path = adminBase.includes('/dashboard') ? '' : '/dashboard/orders';
    opts.orderUrl = `Открыть заказы: ${adminBase.replace(/\/$/, '')}${path}`;
  }
  const text = formatOrderMessage(orderPayload, opts);

  for (const maxUserId of userIds) {
    try {
      await sendMaxMessage({
        botToken: resolvedToken,
        maxUserId,
        text,
      });
    } catch (err) {
      console.error('MAX sendNewOrderNotification:', err.message || err);
    }
  }
}

module.exports = { sendNewOrderMaxNotification };
