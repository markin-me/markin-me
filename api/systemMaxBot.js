const crypto = require('crypto');
const { sendMaxMessage } = require('./maxIntegration');

function normalizeUpdatesPayload(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.updates)) return data.updates;
  return [];
}

function getNextMarker(data) {
  const marker = data?.marker;
  return marker === undefined || marker === null ? null : String(marker);
}

function parseUpdate(update) {
  const message = update?.message || update?.event || update?.data || update || {};
  const body = message?.body || {};
  return {
    updateType: String(update?.update_type || message?.update_type || '').trim().toLowerCase(),
    payload: String(update?.payload || message?.payload || '').trim(),
    text: String(
      body?.text ??
      message?.text ??
      message?.message?.text ??
      ''
    ).trim(),
    userId: String(
      message?.sender?.user_id ??
      message?.sender?.id ??
      message?.from?.user_id ??
      message?.from?.id ??
      message?.user?.user_id ??
      message?.user?.id ??
      ''
    ).trim(),
  };
}

function extractStartPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const cmd = raw.match(/^\/start\s+([A-Za-z0-9_-]+)/i);
  if (cmd && cmd[1]) return String(cmd[1]).trim();
  const query = raw.match(/(?:^|[?&])start=([A-Za-z0-9_-]+)/i);
  if (query && query[1]) return String(query[1]).trim();
  return '';
}

function isPlainStart(text) {
  return /^\/start(?:\s+)?$/i.test(String(text || '').trim());
}

async function sendSystemMaxText(botToken, maxUserId, text) {
  if (!botToken || !maxUserId || !text) return;
  await sendMaxMessage({
    botToken,
    maxUserId,
    text,
  });
}

async function completeStoreConnect(db, botToken, maxUserId, connectToken) {
  const token = String(connectToken || '').trim();
  const userId = String(maxUserId || '').trim();
  if (!token || !userId) return false;

  const [rows] = await db.query(
    `SELECT id, tenant_id, store_id, secret_key
     FROM ten_store_max
     WHERE connect_token=? AND (connect_token_expires_at IS NULL OR connect_token_expires_at > NOW())
     LIMIT 1`,
    [token]
  );
  if (!rows.length) return false;

  const row = rows[0];
  await db.query(
    `UPDATE ten_store_max
     SET max_user_id=?, connect_token=NULL, connect_token_expires_at=NULL
     WHERE id=?`,
    [userId, row.id]
  );

  const [storeRows] = await db.query(
    'SELECT name FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
    [row.tenant_id, row.store_id]
  );
  const storeName = String(storeRows[0]?.name || '').trim() || `Филиал #${row.store_id}`;

  await sendSystemMaxText(
    botToken,
    userId,
    `Готово. Вы будете получать уведомления о новых заказах по филиалу «${storeName}».`
  );

  const secretKey = String(row.secret_key || '').trim();
  if (secretKey) {
    await sendSystemMaxText(
      botToken,
      userId,
      `Используйте эти ключи в настройках филиала при необходимости:\n\nAPI key: ${userId}\nSecret key: ${secretKey}`
    );
  }

  return true;
}

async function issuePendingKeys(db, botToken, maxUserId) {
  const userId = String(maxUserId || '').trim();
  if (!userId) return;

  const secretKey = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO ten_max_pending (max_user_id, secret_key, expires_at) VALUES (?, ?, ?)',
    [userId, secretKey, expiresAt]
  );

  await sendSystemMaxText(
    botToken,
    userId,
    `Используйте эти ключи в настройках MAX-уведомлений:\n\nAPI key: ${userId}\nSecret key: ${secretKey}`
  );
}

async function processUpdate(db, botToken, update) {
  const parsed = parseUpdate(update);
  if (!parsed.userId) return;

  const isStartEvent = parsed.updateType === 'bot_started' || /^\/start(?:\s+.*)?$/i.test(parsed.text);
  const startPayload = isStartEvent ? (parsed.payload || extractStartPayload(parsed.text)) : '';
  try {
    if (startPayload) {
      const connected = await completeStoreConnect(db, botToken, parsed.userId, startPayload);
      if (!connected) {
        await sendSystemMaxText(
          botToken,
          parsed.userId,
          'Ссылка недействительна или истекла. Получите новую в настройках филиала.'
        );
      }
      return;
    }

    if (isStartEvent && isPlainStart(parsed.text || '/start')) {
      await issuePendingKeys(db, botToken, parsed.userId);
    }
  } catch (err) {
    console.error('System MAX bot processUpdate:', err);
    try {
      await sendSystemMaxText(
        botToken,
        parsed.userId,
        'Произошла ошибка. Попробуйте позже.'
      );
    } catch (_) {}
  }
}

function startPolling(db, token) {
  const botToken = String(token || '').trim();
  const apiBase = String(process.env.MAX_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!botToken || !apiBase) return null;

  let marker = null;
  let stopped = false;
  let timer = null;

  async function poll() {
    if (stopped) return;
    try {
      const markerParam = marker ? `&marker=${encodeURIComponent(marker)}` : '';
      const url = `${apiBase}/updates?timeout=25${markerParam}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: botToken,
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const nextMarker = getNextMarker(data);
        if (nextMarker) marker = nextMarker;
        const updates = normalizeUpdatesPayload(data);
        for (const update of updates) {
          await processUpdate(db, botToken, update);
        }
      } else {
        const raw = await res.text().catch(() => '');
        console.error(`System MAX getUpdates failed: HTTP_${res.status}:${raw.slice(0, 300)}`);
      }
    } catch (err) {
      console.error('System MAX getUpdates error:', err.message || err);
    }

    if (!stopped) {
      timer = setTimeout(poll, 500);
    }
  }

  console.log('System MAX bot polling started');
  poll();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

async function handleWebhookUpdate(db, token, update) {
  const botToken = String(token || '').trim();
  if (!botToken || !update) return;
  await processUpdate(db, botToken, update);
}

async function setWebhook(token, webhookUrl, secret = '') {
  const botToken = String(token || '').trim();
  const url = String(webhookUrl || '').trim();
  const apiBase = String(process.env.MAX_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!botToken || !url || !apiBase) return null;

  const payload = {
    url,
    update_types: ['message_created', 'bot_started'],
  };
  const normalizedSecret = String(secret || '').trim();
  if (normalizedSecret) payload.secret = normalizedSecret;

  const res = await fetch(`${apiBase}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: botToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error((data && (data.message || data.error)) || `HTTP_${res.status}`);
  }
  return data;
}

async function deleteWebhook(token) {
  const botToken = String(token || '').trim();
  const apiBase = String(process.env.MAX_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!botToken || !apiBase) return null;

  const res = await fetch(`${apiBase}/subscriptions`, {
    method: 'DELETE',
    headers: {
      Authorization: botToken,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => null);
  const message = (data && (data.message || data.error))
    ? String(data.message || data.error)
    : '';
  if (res.status === 404) return data;
  if (!res.ok || data?.success === false) {
    if (/not\s*found|subscription/i.test(message)) return data;
    throw new Error(message || `HTTP_${res.status}`);
  }
  return data;
}

module.exports = {
  startPolling,
  handleWebhookUpdate,
  setWebhook,
  deleteWebhook,
};
