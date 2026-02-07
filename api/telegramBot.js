/**
 * Telegram-бот: привязка чатов к филиалам.
 * Режим polling (локально) или webhook (прод).
 */
const crypto = require('crypto');
const TELEGRAM_API = 'https://api.telegram.org/bot';

async function processUpdate(db, apiBase, update) {
  const message = update.message;
  if (!message || !message.text) return;

  const text = String(message.text).trim();
  const chatId = message.chat?.id;
  if (chatId == null) return;

  if (!text.startsWith('/start')) return;
  const rawPayload = text.slice(5).trim();
  const payload = (rawPayload.split(/\s/)[0] || rawPayload).replace(/[^a-fA-F0-9]/g, '');

  try {
    if (payload) {
      const [rows] = await db.query(
          `SELECT id, tenant_id, store_id, secret_key FROM ten_store_telegram
           WHERE connect_token = ? AND (connect_token_expires_at IS NULL OR connect_token_expires_at > NOW())
           LIMIT 1`,
        [payload]
      );
      if (!rows.length) {
        await sendMessage(apiBase, chatId, 'Ссылка недействительна или истекла. Получите новую в настройках филиала.');
        return;
      }
      const row = rows[0];
      await db.query(
        `UPDATE ten_store_telegram SET telegram_chat_id = ?, connect_token = NULL, connect_token_expires_at = NULL WHERE id = ?`,
        [chatId, row.id]
      );
      const [storeRows] = await db.query(
        'SELECT name FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [row.tenant_id, row.store_id]
      );
      const storeName = storeRows[0]?.name || `Филиал #${row.store_id}`;
      await sendMessage(apiBase, chatId, `Готово. Вы будете получать уведомления о новых заказах по филиалу «${storeName}».`);
      const secretKey = row.secret_key || '';
      if (secretKey) {
        await sendMessage(
          apiBase,
          chatId,
          `Используйте эти ключи в настройках филиала при необходимости:\n\nAPI key: ${chatId}\nSecret key: ${secretKey}`
        );
      }
      return;
    }

    const secretKey = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.query(
      'INSERT INTO ten_telegram_pending (telegram_chat_id, secret_key, expires_at) VALUES (?, ?, ?)',
      [chatId, secretKey, expiresAt]
    );
    await sendMessage(
      apiBase,
      chatId,
      `Получайте заявки в Telegram. Перейдите в настройки филиала и вставьте эти ключи:\n\nAPI key: ${chatId}\nSecret key: ${secretKey}`
    );
  } catch (err) {
    console.error('Telegram bot processUpdate:', err);
    try {
      await sendMessage(apiBase, chatId, 'Произошла ошибка. Попробуйте позже.');
    } catch (_) {}
  }
}

function startPolling(db, token) {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.log('⏭ Telegram: TELEGRAM_BOT_TOKEN не задан, бот не запущен');
    return;
  }

  let offset = 0;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  const processOne = (update) => processUpdate(db, apiBase, update);

  async function poll() {
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
    setTimeout(poll, 500);
  }

  console.log('📱 Telegram бот: polling запущен');
  poll();
}

async function sendMessage(apiBase, chatId, text) {
  const res = await fetch(`${apiBase}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'sendMessage failed');
  return data;
}

async function handleWebhookUpdate(db, token, update) {
  if (!token || !update) return;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  await processUpdate(db, apiBase, update);
}

async function setWebhook(token, webhookUrl) {
  if (!token || !webhookUrl) return;
  const apiBase = `${TELEGRAM_API}${token.trim()}`;
  const res = await fetch(`${apiBase}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'setWebhook failed');
  return data;
}

module.exports = { startPolling, sendMessage, processUpdate, handleWebhookUpdate, setWebhook };
