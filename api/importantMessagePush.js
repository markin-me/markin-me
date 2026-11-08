'use strict';

async function sendImportantMessagePush({
  db,
  ensurePushSubscriptionsTable,
  sendPushToSubscriptions,
  tenantId,
  storeId,
  message,
}) {
  if (!message?.web_push_enabled) return false;
  if (typeof ensurePushSubscriptionsTable !== 'function' || typeof sendPushToSubscriptions !== 'function') {
    throw new Error('IMPORTANT_PUSH_RUNTIME_UNAVAILABLE');
  }
  await ensurePushSubscriptionsTable();
  const [subscriptionRows] = await db.query(
    `SELECT id,endpoint,p256dh,auth FROM chat_push_subscriptions
      WHERE tenant_id=? AND store_id=? AND actor='in' AND push_important_enabled=1
      ORDER BY updated_at DESC,id DESC`,
    [Number(tenantId), Number(storeId)]
  );
  const seen = new Set();
  const subscriptions = (subscriptionRows || []).filter((row) => {
    const endpoint = String(row?.endpoint || '').trim();
    if (!endpoint || seen.has(endpoint)) return false;
    seen.add(endpoint);
    return true;
  });
  await sendPushToSubscriptions(subscriptions, {
    type: 'important_message',
    important_message_id: Number(message.id || 0),
    tenant_id: Number(tenantId),
    store_id: Number(storeId),
    open_important_messages: true,
    title: String(message.title || 'PROMO сообщение').trim().slice(0, 180),
    body: String(message.body || message.title || '').trim().slice(0, 180),
    tag: `important-message-${Number(message.id || 0)}`,
    url: '/shop',
  });
  return true;
}

module.exports = { sendImportantMessagePush };
