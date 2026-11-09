/**
 * Telegram-бот: привязка чатов к филиалам.
 * Режим polling (локально) или webhook (прод).
 */
const crypto = require('crypto');
const { requestTelegramApi, telegramErrorReason } = require('./telegramApi');
const TELEGRAM_API = 'https://api.telegram.org/bot';
const TG_LOGIN_START_PAYLOADS = new Set(['login', 'auth', 'link', 'shop']);

async function sendContactRequestMessage(apiBase, chatId, onTelegramApiTiming = null) {
  return sendMessage(
    apiBase,
    chatId,
    '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u043d\u0438\u0436\u0435 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0434\u043b\u044f \u0432\u0445\u043e\u0434\u0430:',
    {
      reply_markup: {
        keyboard: [[{ text: '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    },
    onTelegramApiTiming
  );
}

async function connectStoreChat(db, apiBase, chatId, payload, tenantId = null, onTelegramApiTiming = null) {
  const [rows] = await db.query(
    `SELECT id, tenant_id, store_id, secret_key FROM ten_store_telegram
     WHERE connect_token=? AND (? IS NULL OR tenant_id=?)
       AND (connect_token_expires_at IS NULL OR connect_token_expires_at>NOW())
     LIMIT 1`,
    [payload, tenantId, tenantId]
  );
  if (!rows.length) return false;
  const row = rows[0];
  const [connected] = await db.query(
    `UPDATE ten_store_telegram
     SET telegram_chat_id = ?, connect_token = NULL, connect_token_expires_at = NULL
     WHERE id = ? AND tenant_id=? AND connect_token=?
       AND (connect_token_expires_at IS NULL OR connect_token_expires_at>NOW())`,
    [chatId, row.id, row.tenant_id, payload]
  );
  if (!connected.affectedRows) return true;
  const [storeRows] = await db.query(
    'SELECT name FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
    [row.tenant_id, row.store_id]
  );
  const storeName = storeRows[0]?.name || `\u0424\u0438\u043b\u0438\u0430\u043b #${row.store_id}`;
  await sendMessage(
    apiBase,
    chatId,
    `\u0413\u043e\u0442\u043e\u0432\u043e. \u0412\u044b \u0431\u0443\u0434\u0435\u0442\u0435 \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043e \u043d\u043e\u0432\u044b\u0445 \u0437\u0430\u043a\u0430\u0437\u0430\u0445 \u043f\u043e \u0444\u0438\u043b\u0438\u0430\u043b\u0443 \u00ab${storeName}\u00bb.`,
    null,
    onTelegramApiTiming
  );
  const secretKey = row.secret_key || '';
  if (secretKey) {
    await sendMessage(
      apiBase,
      chatId,
      `\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u044d\u0442\u0438 \u043a\u043b\u044e\u0447\u0438 \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0444\u0438\u043b\u0438\u0430\u043b\u0430 \u043f\u0440\u0438 \u043d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c\u043e\u0441\u0442\u0438:\n\nAPI key: ${chatId}\nSecret key: ${secretKey}`,
      null,
      onTelegramApiTiming
    );
  }
  return true;
}

async function processUpdate(db, apiBase, update, options = {}) {
  const message = update.message;
  if (!message) return;
  const send = (chatId, text, extra = null) => sendMessage(
    apiBase, chatId, text, extra, options.onTelegramApiTiming
  );

  const text = String(message.text || '').trim();
  const chatId = message.chat?.id;
  const tgUserId = message.from?.id;
  if (chatId == null) return;

  const contactPhone = String(
    message?.contact?.phone_number
    || message?.contact?.phone
    || ''
  ).trim();

  try {
    if (contactPhone) {
      await send(
        chatId,
        '\u0421\u043f\u0430\u0441\u0438\u0431\u043e. \u041d\u043e\u043c\u0435\u0440 \u043f\u043e\u043b\u0443\u0447\u0435\u043d. \u0412\u0445\u043e\u0434 \u0431\u0443\u0434\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u043f\u043e\u0441\u043b\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u044f \u043f\u0440\u0438\u0432\u044f\u0437\u043a\u0438.'
      );
      return;
    }

    const start = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
    if (!start) return;
    const rawPayload = String(start[1] || '').trim();
    const payload = (rawPayload.split(/\s/)[0] || rawPayload).replace(/[^a-zA-Z0-9_-]/g, '');

    if (payload) {
      if (payload.startsWith('a_') && typeof options.onAuthLink === 'function') {
        if (message.chat?.type !== 'private' || tgUserId == null || String(chatId) !== String(tgUserId)) return;
        const result = await options.onAuthLink({
          provider: 'tg',
          providerUserId: tgUserId != null ? String(tgUserId) : String(chatId),
          token: payload,
        });
        await send(
          chatId,
          result?.ok
            ? 'Telegram успешно привязан к выбранной учётной записи.'
            : 'Ссылка недействительна или истекла. Получите новую в профиле.'
        );
        return;
      }

      if (TG_LOGIN_START_PAYLOADS.has(String(payload).toLowerCase())) {
        await sendContactRequestMessage(apiBase, chatId, options.onTelegramApiTiming);
        return;
      }

      const [custRows] = await db.query(
        `SELECT id, tenant_id, customer_id
         FROM cust_customer_auth_tokens
         WHERE token=? AND provider='tg' AND purpose='link' AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1`,
        [payload]
      );
      if (custRows.length) {
        const tokenRow = custRows[0];
        const resolvedTgUserId = tgUserId != null ? String(tgUserId) : String(chatId);
        await db.query(
          `UPDATE cust_customers
           SET telegram_user_id=?, updated_at=NOW()
           WHERE tenant_id=? AND id=?`,
          [resolvedTgUserId, Number(tokenRow.tenant_id), Number(tokenRow.customer_id)]
        );
        try {
          await db.query(
            `INSERT INTO cust_customer_auth_identities
             (tenant_id, customer_id, provider, provider_user_id, linked_at)
             VALUES (?, ?, 'tg', ?, NOW())
             ON DUPLICATE KEY UPDATE
               customer_id=VALUES(customer_id),
               linked_at=NOW()`,
            [Number(tokenRow.tenant_id), Number(tokenRow.customer_id), resolvedTgUserId]
          );
          await db.query(
            `UPDATE cust_customer_auth_tokens
             SET used_at=NOW(), provider_user_id=?
             WHERE tenant_id=? AND provider='tg' AND purpose='link' AND token=? AND used_at IS NULL
             LIMIT 1`,
            [resolvedTgUserId, Number(tokenRow.tenant_id), payload]
          );
        } catch (err) {
          console.error('AUTH_DUAL_WRITE_TG_LINK_LEGACY_FAILED:', telegramErrorReason(err));
        }
        await send(chatId, '\u0054\u0065\u006c\u0065\u0067\u0072\u0061\u006d \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d \u043a \u0432\u0430\u0448\u0435\u043c\u0443 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0443.');
        return;
      }

      if (!await connectStoreChat(db, apiBase, chatId, payload, null, options.onTelegramApiTiming)) {
        await send(chatId, 'Ссылка недействительна или истекла. Получите новую в настройках филиала.');
      }
      return;
    }

    const secretKey = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO ten_telegram_pending (telegram_chat_id, secret_key, expires_at) VALUES (?, ?, ?)',
      [chatId, secretKey, expiresAt]
    );

    await sendContactRequestMessage(apiBase, chatId, options.onTelegramApiTiming);
  } catch (err) {
    console.error('Telegram bot processUpdate:', telegramErrorReason(err));
    if (typeof options.onAuthLink === 'function') throw err;
    try {
      await send(chatId, '\u041f\u0440\u043e\u0438\u0437\u043e\u0448\u043b\u0430 \u043e\u0448\u0438\u0431\u043a\u0430. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u043f\u043e\u0437\u0436\u0435.');
    } catch (_) {}
  }
}

function startPolling(db, token) {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.log('⏭ Telegram: TELEGRAM_BOT_TOKEN не задан, бот не запущен');
    return;
  }

  let offset = 0;
  let stopped = false;
  let timer = null;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  const processOne = (update) => processUpdate(db, apiBase, update);

  async function poll() {
    if (stopped) return;
    try {
      const url = `${apiBase}/getUpdates?offset=${offset}&timeout=25`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) return;
      for (const u of data.result) {
        offset = u.update_id + 1;
        await processOne(u);
      }
    } catch (err) {
      console.error('Telegram getUpdates error:', err.message);
    }
    if (!stopped) {
      timer = setTimeout(poll, 500);
    }
  }

  console.log('📱 Telegram бот: polling запущен');
  poll();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

async function sendMessage(apiBase, chatId, text, extra = null, onTelegramApiTiming = null) {
  const body = { chat_id: chatId, text };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  return requestTelegramApi(apiBase, 'sendMessage', body, { onTiming: onTelegramApiTiming });
}

async function handleWebhookUpdate(db, token, update, options = {}) {
  if (!token || !update) return;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  await processUpdate(db, apiBase, update, options);
}

async function setWebhook(token, webhookUrl, secret = '', options = {}) {
  if (!token || !webhookUrl) return;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  const res = await fetch(`${apiBase}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      ...(String(secret || '').trim() ? { secret_token: String(secret).trim() } : {}),
      allowed_updates: options.allowedUpdates || ['message'],
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'setWebhook failed');
  return data;
}

async function deleteWebhook(token) {
  if (!token) return;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  const res = await fetch(`${apiBase}/deleteWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'deleteWebhook failed');
  return data;
}

module.exports = { startPolling, sendMessage, processUpdate, handleWebhookUpdate, setWebhook, deleteWebhook, connectStoreChat };
