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
    `SELECT s.id,s.endpoint,s.p256dh,s.auth FROM chat_push_subscriptions s
      WHERE s.tenant_id=? AND s.store_id=? AND s.actor='in' AND s.push_important_enabled=1
        AND (?='all' OR EXISTS (
          SELECT 1 FROM mkt_important_message_recipients recipient
          JOIN cust_customers customer ON customer.tenant_id=recipient.tenant_id AND customer.id=recipient.customer_id
            AND customer.is_active=1
          WHERE recipient.tenant_id=s.tenant_id AND recipient.store_id=s.store_id AND recipient.message_id=?
            AND (recipient.customer_id=s.client_id OR EXISTS (
              SELECT 1 FROM chat_visitor_identities visitor
              JOIN cust_guest_sessions guest ON guest.tenant_id=visitor.tenant_id AND guest.token_hash=visitor.guest_session_hash
              WHERE visitor.tenant_id=s.tenant_id AND visitor.client_id=s.client_id
                AND visitor.claimed_at IS NULL AND visitor.session_deleted_at IS NULL
                AND guest.revoked_at IS NULL AND (guest.expires_at IS NULL OR guest.expires_at>UTC_TIMESTAMP())
                AND guest.phone=customer.phone COLLATE utf8mb4_general_ci
            ))
        ))
      ORDER BY s.updated_at DESC,s.id DESC`,
    [Number(tenantId), Number(storeId), message.recipient_mode || 'all', Number(message.id)]
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
