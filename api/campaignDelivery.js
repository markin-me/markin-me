'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { sendMaxMessage } = require('./maxIntegration');
const { getTenantBotConfig } = require('./messengerDelivery');
const { fetchBotIdentity } = require('./messengerBotContacts');
const { prepareCampaignAction } = require('./campaignActions');

function normalizeChannels(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter((item) => ['telegram', 'max'].includes(item))));
}

let campaignScheduleSchemaPromise = null;
async function ensureCampaignScheduleSchema(db) {
  if (campaignScheduleSchemaPromise) return campaignScheduleSchemaPromise;
  campaignScheduleSchemaPromise = (async () => {
  const statements = [
    "ALTER TABLE mkt_important_messages ADD COLUMN lifecycle_status ENUM('draft','scheduled','active','paused','completed') NOT NULL DEFAULT 'draft' AFTER is_pinned",
    'ALTER TABLE mkt_important_messages ADD COLUMN manual_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER lifecycle_status',
    'ALTER TABLE mkt_important_messages ADD COLUMN paused_at DATETIME(3) NULL AFTER manual_hidden',
    'ALTER TABLE mkt_important_messages ADD COLUMN completed_at DATETIME(3) NULL AFTER paused_at',
    'ALTER TABLE mkt_important_messages ADD COLUMN storefront_sort_order INT NOT NULL DEFAULT 0 AFTER completed_at',
    "ALTER TABLE mkt_campaign_deliveries MODIFY COLUMN state ENUM('pending','processing','retry','paused','sent','failed','cancelled','unknown') NOT NULL DEFAULT 'pending'",
  ];
  for (const statement of statements) {
    try { await db.query(statement); } catch (error) {
      if (statement.includes('MODIFY COLUMN')) throw error;
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await db.query(`CREATE TABLE IF NOT EXISTS mkt_campaign_channel_schedules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('storefront','telegram','max') NOT NULL,
    start_mode ENUM('immediate','scheduled') NOT NULL DEFAULT 'immediate',
    start_at DATETIME(3) NOT NULL,
    end_mode ENUM('none','scheduled') NOT NULL DEFAULT 'none',
    end_at DATETIME(3) NULL,
    end_action ENUM('keep','delete') NOT NULL DEFAULT 'keep',
    state ENUM('pending','active','paused','completed','skipped','failed') NOT NULL DEFAULT 'pending',
    paused_from_state ENUM('pending','active') NULL,
    launch_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    run_id BIGINT UNSIGNED NULL,
    actual_started_at DATETIME(3) NULL,
    actual_ended_at DATETIME(3) NULL,
    last_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(3) NULL,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_campaign_channel_schedule (tenant_id,store_id,message_id,channel),
    UNIQUE KEY uq_campaign_channel_launch (tenant_id,store_id,launch_key),
    KEY idx_campaign_schedule_start (state,start_at,lease_until,id),
    KEY idx_campaign_schedule_end (state,end_at,lease_until,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  try {
    await db.query("ALTER TABLE mkt_campaign_channel_schedules ADD COLUMN paused_from_state ENUM('pending','active') NULL AFTER state");
  } catch (error) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
  await db.query(`CREATE TABLE IF NOT EXISTS mkt_campaign_lifecycle_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT NOT NULL,
    store_id INT NOT NULL,
    message_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('storefront','telegram','max') NULL,
    action VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    from_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
    to_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
    details_json JSON NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_campaign_lifecycle_audit (tenant_id,store_id,message_id,created_at,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query("UPDATE mkt_important_messages SET manual_hidden=1 WHERE published_at IS NOT NULL AND is_hidden=1 AND manual_hidden=0");
  await db.query(
    `INSERT IGNORE INTO mkt_campaign_channel_schedules
      (tenant_id,store_id,message_id,channel,start_mode,start_at,end_mode,end_action,state,launch_key,actual_started_at)
     SELECT tenant_id,store_id,id,'storefront','immediate',COALESCE(published_at,created_at),'none','keep','active',UUID(),COALESCE(published_at,created_at)
       FROM mkt_important_messages
      WHERE archived_at IS NULL AND FIND_IN_SET('storefront',publication_channels) AND published_at IS NOT NULL`
  );
  for (const channel of ['telegram', 'max']) {
    await db.query(
      `INSERT IGNORE INTO mkt_campaign_channel_schedules
        (tenant_id,store_id,message_id,channel,start_mode,start_at,end_mode,end_action,state,launch_key,run_id,actual_started_at)
       SELECT m.tenant_id,m.store_id,m.id,?,'immediate',COALESCE(r.started_at,r.created_at),'none','keep','active',UUID(),r.id,COALESCE(r.started_at,r.created_at)
         FROM mkt_important_messages m
         JOIN mkt_campaign_runs r ON r.id=(SELECT r2.id FROM mkt_campaign_runs r2 WHERE r2.tenant_id=m.tenant_id AND r2.store_id=m.store_id AND r2.message_id=m.id AND FIND_IN_SET(?,r2.channels) ORDER BY r2.id DESC LIMIT 1)
        WHERE m.archived_at IS NULL`,
      [channel, channel]
    );
  }
  await db.query(
    `UPDATE mkt_important_messages m SET lifecycle_status='active'
      WHERE lifecycle_status='draft' AND EXISTS(SELECT 1 FROM mkt_campaign_channel_schedules s WHERE s.tenant_id=m.tenant_id AND s.store_id=m.store_id AND s.message_id=m.id AND s.state='active')`
  );
  })().catch((error) => {
    campaignScheduleSchemaPromise = null;
    throw error;
  });
  return campaignScheduleSchemaPromise;
}

function safeErrorCode(error) {
  const code = String(error?.code || error?.name || 'DELIVERY_FAILED').toUpperCase();
  return /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'DELIVERY_FAILED';
}

function isPermanentError(error) {
  const status = Number(error?.status || error?.statusCode || error?.httpStatus || 0);
  return [400, 401, 403, 404].includes(status) || /BLOCKED|FORBIDDEN|TOKEN|CHAT_NOT_FOUND|USER_NOT_FOUND|BOT_CHANGED/.test(safeErrorCode(error));
}

function buildMessageText(snapshot) {
  const parts = [String(snapshot.title || '').trim(), String(snapshot.body || '').trim()];
  if (snapshot.promo_code_mode === 'shared' && snapshot.promo_code) parts.push(`Промокод: ${snapshot.promo_code}`);
  if (snapshot.action_type === 'product' && snapshot.product_title) {
    parts.push([snapshot.product_title, snapshot.product_price != null ? `${snapshot.product_price}` : ''].filter(Boolean).join(' — '));
  }
  return parts.filter(Boolean).join('\n\n').slice(0, 4000);
}

function buildActionButtons(snapshot, options = {}) {
  const prepared = Array.isArray(snapshot?.campaign_action?.buttons) ? snapshot.campaign_action.buttons : [];
  const buttons = prepared
    .filter((button) => options.includeProducts === true || button?.type !== 'product')
    .map((button) => ({
      type: String(button?.type || ''),
      productId: Number(button?.product_id || 0),
      text: String(button?.text || '').trim().slice(0, 64),
      url: String(button?.url || '').trim(),
    }))
    .filter((button) => button.text && /^https:\/\//i.test(button.url));
  if (buttons.length) return options.includeProducts === true ? buttons : buttons.slice(0, 30);
  const explicit = String(snapshot.link_url || '').trim();
  return /^https:\/\//i.test(explicit) ? [{ text: 'Открыть', url: explicit }] : [];
}

function getLocalImage(snapshot) {
  const imageUrl = String(snapshot.image_url || '').trim();
  if (!imageUrl.startsWith('/static/')) return null;
  const staticRoot = path.resolve(__dirname, '..', 'static');
  const filePath = path.resolve(staticRoot, imageUrl.slice('/static/'.length));
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${path.sep}`)) return null;
  const extension = path.extname(filePath).toLowerCase();
  const contentType = ({
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic',
  })[extension];
  return contentType ? { filePath, contentType, filename: path.basename(filePath) } : null;
}

function getRemoteImageUrl(snapshot) {
  const imageUrl = String(snapshot.image_url || '').trim();
  return /^https:\/\//i.test(imageUrl) ? imageUrl : '';
}

async function readLocalImage(snapshot) {
  const image = getLocalImage(snapshot);
  if (!image) return null;
  const data = await fs.readFile(image.filePath);
  if (image.contentType !== 'image/webp') return { ...image, data };
  return {
    ...image,
    data: await sharp(data, { failOn: 'error' }).jpeg({ quality: 90 }).toBuffer(),
    contentType: 'image/jpeg',
    filename: `${path.basename(image.filename, path.extname(image.filename))}.jpg`,
  };
}

async function parseTelegramResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const error = new Error('TELEGRAM_DELIVERY_FAILED');
    error.code = ({ 401: 'TELEGRAM_TOKEN_REJECTED', 403: 'TELEGRAM_BOT_BLOCKED', 429: 'TELEGRAM_RATE_LIMITED' })[response.status] || 'TELEGRAM_DELIVERY_FAILED';
    error.status = response.status;
    error.retryAfter = Number(response.headers.get('retry-after') || data?.parameters?.retry_after || 0);
    throw error;
  }
  return data;
}

async function sendTelegramProductCard(token, userId, product, actionButton) {
  const title = String(product?.title || `Товар ${Number(product?.id || '')}`).trim();
  const price = Number(product?.price);
  const caption = `${title}${Number.isFinite(price) ? `\n${price} ₽` : ''}`;
  const localImage = await readLocalImage({ image_url: product?.photo });
  const remoteImageUrl = getRemoteImageUrl({ image_url: product?.photo });
  const replyMarkup = { inline_keyboard: [[{ text: 'Заказать', url: actionButton.url }]] };
  if (localImage || remoteImageUrl) {
    const form = new FormData();
    form.append('chat_id', String(userId));
    if (localImage) form.append('photo', new Blob([localImage.data], { type: localImage.contentType }), localImage.filename);
    else form.append('photo', remoteImageUrl);
    form.append('caption', caption);
    form.append('reply_markup', JSON.stringify(replyMarkup));
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST', signal: AbortSignal.timeout(20000), body: form,
    });
    const data = await parseTelegramResponse(response);
    return String(data.result?.message_id || '');
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ chat_id: userId, text: caption, reply_markup: replyMarkup }),
  });
  const data = await parseTelegramResponse(response);
  return String(data.result?.message_id || '');
}

async function sendTelegram(token, userId, snapshot, progress = {}) {
  if (snapshot.action_type === 'product_collection' && progress.headerId) {
    return sendTelegramCollectionCards(token, userId, snapshot, '', progress);
  }
  const text = buildMessageText(snapshot);
  const actionButtons = buildActionButtons(snapshot);
  const localImage = await readLocalImage(snapshot);
  const remoteImageUrl = getRemoteImageUrl(snapshot);
  if (localImage || remoteImageUrl) {
    const replyMarkup = actionButtons.length ? JSON.stringify({ inline_keyboard: actionButtons.map((button) => [button]) }) : '';
    const form = new FormData();
    form.append('chat_id', String(userId));
    if (localImage) form.append('photo', new Blob([localImage.data], { type: localImage.contentType }), localImage.filename);
    else form.append('photo', remoteImageUrl);
    if (text.length <= 1024) form.append('caption', text);
    if (replyMarkup && text.length <= 1024) form.append('reply_markup', replyMarkup);
    const photoResponse = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST', signal: AbortSignal.timeout(20000), body: form,
    });
    const photoData = await parseTelegramResponse(photoResponse);
    if (text.length <= 1024) {
      const headerId = String(photoData.result?.message_id || '');
      if (snapshot.action_type !== 'product_collection') return { primaryMessageId: headerId, messageIds: [headerId] };
      return sendTelegramCollectionCards(token, userId, snapshot, headerId, progress);
    }
    const messageBody = { chat_id: userId, text };
    if (actionButtons.length) messageBody.reply_markup = { inline_keyboard: actionButtons.map((button) => [button]) };
    const messageResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify(messageBody),
    });
    const messageData = await parseTelegramResponse(messageResponse);
    const headerId = String(messageData.result?.message_id || photoData.result?.message_id || '');
    if (snapshot.action_type !== 'product_collection') return { primaryMessageId: headerId, messageIds: [String(photoData.result?.message_id || ''), headerId].filter(Boolean) };
    return sendTelegramCollectionCards(token, userId, snapshot, headerId, progress);
  }
  const body = { chat_id: userId, text };
  if (actionButtons.length) body.reply_markup = { inline_keyboard: actionButtons.map((button) => [button]) };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify(body),
  });
  const data = await parseTelegramResponse(response);
  const headerId = String(data.result?.message_id || '');
  if (snapshot.action_type !== 'product_collection') return { primaryMessageId: headerId, messageIds: [headerId] };
  return sendTelegramCollectionCards(token, userId, snapshot, headerId, progress);
}

async function sendTelegramCollectionCards(token, userId, snapshot, sentHeaderId, progress) {
  const headerId = String(progress.headerId || sentHeaderId || '');
  const messageIds = Array.from(new Set([...(Array.isArray(progress.messageIds) ? progress.messageIds : []), headerId].filter(Boolean).map(String)));
  let completed = Math.max(0, Number(progress.completedCards || 0));
  if (!progress.headerId && typeof progress.onCheckpoint === 'function') {
    await progress.onCheckpoint(headerId, completed);
  }
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const productButtons = buildActionButtons(snapshot, { includeProducts: true })
    .filter((button) => button.type === 'product' && button.productId > 0);
  for (let index = completed; index < products.length; index += 1) {
    const product = products[index];
    const button = productButtons.find((item) => item.productId === Number(product?.id || 0));
    if (!button) throw Object.assign(new Error('CAMPAIGN_PRODUCT_ACTION_MISSING'), { code: 'CAMPAIGN_PRODUCT_ACTION_MISSING', status: 409 });
    const cardId = await sendTelegramProductCard(token, userId, product, button);
    if (cardId) messageIds.push(String(cardId));
    completed = index + 1;
    if (typeof progress.onCheckpoint === 'function') await progress.onCheckpoint(headerId, completed, messageIds);
  }
  return { primaryMessageId: headerId, messageIds: Array.from(new Set(messageIds)) };
}

async function uploadMaxImage(token, snapshot) {
  const remoteImageUrl = getRemoteImageUrl(snapshot);
  if (remoteImageUrl) return { url: remoteImageUrl };
  const localImage = await readLocalImage(snapshot);
  if (!localImage) return null;
  const apiBase = String(process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').trim().replace(/\/+$/, '');
  const slotResponse = await fetch(`${apiBase}/uploads?type=image`, {
    method: 'POST', headers: { Authorization: token }, signal: AbortSignal.timeout(15000),
  });
  const slot = await slotResponse.json().catch(() => null);
  if (!slotResponse.ok || !slot?.url) throw Object.assign(new Error('MAX_IMAGE_UPLOAD_FAILED'), { code: 'MAX_IMAGE_UPLOAD_FAILED', httpStatus: slotResponse.status });
  const form = new FormData();
  form.append('data', new Blob([localImage.data], { type: localImage.contentType }), localImage.filename);
  const uploadResponse = await fetch(slot.url, {
    method: 'POST', headers: { Authorization: token }, body: form, signal: AbortSignal.timeout(30000),
  });
  const uploaded = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok) throw Object.assign(new Error('MAX_IMAGE_UPLOAD_FAILED'), { code: 'MAX_IMAGE_UPLOAD_FAILED', httpStatus: uploadResponse.status });
  const imageToken = String(uploaded?.token || slot.token || uploaded?.photos?.token || '').trim();
  if (!imageToken) throw Object.assign(new Error('MAX_IMAGE_TOKEN_MISSING'), { code: 'MAX_IMAGE_TOKEN_MISSING' });
  return { token: imageToken };
}

async function sendMax(token, userId, snapshot) {
  const actionButtons = buildActionButtons(snapshot);
  const imagePayload = await uploadMaxImage(token, snapshot);
  const attachments = [];
  if (imagePayload) attachments.push({ type: 'image', payload: imagePayload });
  if (actionButtons.length) attachments.push({
    type: 'inline_keyboard',
    payload: { buttons: actionButtons.map((button) => [{ type: 'link', text: button.text, url: button.url }]) },
  });
  const extraPayload = attachments.length ? { attachments } : undefined;
  const result = await sendMaxMessage({
    botToken: token,
    maxUserId: userId,
    text: buildMessageText(snapshot),
    extraPayload,
    signal: AbortSignal.timeout(15000),
    requireMessageConfirmation: true,
  });
  if (!result?.ok) throw Object.assign(new Error('MAX_DELIVERY_FAILED'), { code: 'MAX_DELIVERY_FAILED' });
  const messageId = String(result.data?.message?.body?.mid || result.data?.message?.message_id || '');
  return { primaryMessageId: messageId, messageIds: messageId ? [messageId] : [] };
}

function parseMessageIds(job) {
  try {
    const parsed = typeof job.provider_message_ids_json === 'string'
      ? JSON.parse(job.provider_message_ids_json)
      : job.provider_message_ids_json;
    if (Array.isArray(parsed)) return Array.from(new Set(parsed.map(String).filter(Boolean)));
  } catch {}
  const legacy = String(job.provider_message_id || '');
  return legacy && !legacy.startsWith('tgcol:') ? [legacy] : [];
}

async function deleteTelegramMessages(token, chatId, messageIds) {
  const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ chat_id: chatId, message_ids: messageIds.map(Number) }),
  });
  await parseTelegramResponse(response);
}

async function deleteMaxMessages(token, messageIds) {
  const base = String(process.env.MAX_API_BASE_URL || 'https://platform-api2.max.ru').trim().replace(/\/+$/, '');
  for (const messageId of messageIds) {
    const response = await fetch(`${base}/messages?message_id=${encodeURIComponent(messageId)}`, {
      method: 'DELETE', headers: { Authorization: token }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = Object.assign(new Error('MAX_MESSAGE_DELETE_FAILED'), { code: 'MAX_MESSAGE_DELETE_FAILED', status: response.status });
      throw error;
    }
  }
}

async function createRun(db, { tenantId, storeId, message, channels, idempotencyKey, userId }) {
  const selectedChannels = normalizeChannels(channels);
  if (!selectedChannels.length) throw Object.assign(new Error('BOT_CHANNEL_REQUIRED'), { status: 400, code: 'BOT_CHANNEL_REQUIRED' });
  if (!/^[0-9a-f-]{36}$/i.test(String(idempotencyKey || ''))) {
    throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
  }
  const allowed = normalizeChannels(message.publication_channels);
  if (selectedChannels.some((channel) => !allowed.includes(channel))) {
    throw Object.assign(new Error('CAMPAIGN_CHANNEL_NOT_SELECTED'), { status: 409, code: 'CAMPAIGN_CHANNEL_NOT_SELECTED' });
  }
  const campaignAction = await prepareCampaignAction(db, { tenantId, storeId, message });
  const fallbackImage = String(
    message.product_photo
    || (Array.isArray(message.products) ? message.products.find((item) => String(item?.photo || '').trim())?.photo : '')
    || ''
  ).trim();
  const contentSnapshot = {
    ...message,
    image_url: String(message.image_url || '').trim() || fallbackImage,
    campaign_action: campaignAction,
  };
  const identities = {};
  for (const channel of selectedChannels) {
    const provider = channel === 'telegram' ? 'tg' : 'max';
    const config = await getTenantBotConfig(db, tenantId, provider, { allowDisabled: true, customer: true });
    identities[provider] = (await fetchBotIdentity(config)).id;
  }
  const selectedRecipientIds = message.recipient_mode === 'selected'
    ? Array.from(new Set((Array.isArray(message.recipient_ids) ? message.recipient_ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)))
    : [];
  if (message.recipient_mode === 'selected' && !selectedRecipientIds.length) {
    throw Object.assign(new Error('RECIPIENTS_REQUIRED'), { status: 400, code: 'RECIPIENTS_REQUIRED' });
  }
  const recipientSql = selectedRecipientIds.length ? ' AND c.id IN (?)' : '';
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [runResult] = await conn.query(
      `INSERT INTO mkt_campaign_runs
         (tenant_id,store_id,message_id,idempotency_key,channels,status,content_snapshot_json,requested_by)
       VALUES (?,?,?,?,?,'queued',?,?)`,
      [tenantId, storeId, message.id, idempotencyKey, selectedChannels.join(','), JSON.stringify(contentSnapshot), userId || null]
    );
    const runId = Number(runResult.insertId);
    const [recipients] = await conn.query(
      `SELECT DISTINCT c.id AS customer_id,mc.provider,mc.provider_user_id,contact.bot_id
         FROM cust_customers c
         JOIN auth_account_links al
           ON al.tenant_id=c.tenant_id AND al.account_type='customer' AND al.account_id=c.id
         JOIN auth_account_messenger_links aml ON aml.account_link_id=al.id
         JOIN auth_messenger_channels mc
           ON mc.id=aml.channel_id AND mc.provider=aml.provider AND mc.revoked_at IS NULL
         JOIN mkt_messenger_marketing_consents consent
           ON consent.tenant_id=c.tenant_id AND consent.store_id=c.store_id
          AND consent.customer_id=c.id AND consent.provider=mc.provider AND consent.consented=1
         JOIN auth_messenger_bot_contacts contact
           ON contact.tenant_id=c.tenant_id AND contact.provider=mc.provider
          AND contact.provider_user_id=mc.provider_user_id AND contact.reachable=1
          AND contact.bot_id=CASE mc.provider WHEN 'tg' THEN ? WHEN 'max' THEN ? END
        WHERE c.tenant_id=? AND c.store_id=? AND COALESCE(c.is_active,1)=1
          AND mc.provider IN (?)${recipientSql}`,
      [identities.tg || '', identities.max || '', tenantId, storeId, selectedChannels.map((channel) => channel === 'telegram' ? 'tg' : channel), ...(selectedRecipientIds.length ? [selectedRecipientIds] : [])]
    );
    if (recipients.length) {
      await conn.query(
        `INSERT INTO mkt_campaign_deliveries
           (run_id,tenant_id,store_id,customer_id,provider,provider_user_id,bot_id)
         VALUES ?`,
        [recipients.map((row) => [runId, tenantId, storeId, row.customer_id, row.provider, row.provider_user_id, row.bot_id])]
      );
    } else {
      await conn.query("UPDATE mkt_campaign_runs SET status='completed',started_at=NOW(3),completed_at=NOW(3) WHERE id=?", [runId]);
    }
    await conn.commit();
    return { runId, recipients: recipients.length };
  } catch (error) {
    await conn.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      const [rows] = await db.query(
        'SELECT id FROM mkt_campaign_runs WHERE tenant_id=? AND store_id=? AND idempotency_key=? LIMIT 1',
        [tenantId, storeId, idempotencyKey]
      );
      return { runId: Number(rows?.[0]?.id || 0), duplicate: true };
    }
    throw error;
  } finally {
    conn.release();
  }
}

async function loadScheduledMessage(db, schedule) {
  const [rows] = await db.query(
    `SELECT m.*,p.name product_title,p.price product_price,p.photos_json product_photos_json
       FROM mkt_important_messages m
       LEFT JOIN prod_products p ON p.tenant_id=m.tenant_id AND p.id=m.product_id
      WHERE m.tenant_id=? AND m.store_id=? AND m.id=? AND m.archived_at IS NULL LIMIT 1`,
    [schedule.tenant_id, schedule.store_id, schedule.message_id]
  );
  const message = rows?.[0];
  if (!message) return null;
  const [products] = await db.query(
    `SELECT p.id,p.name title,p.price,p.photos_json
       FROM mkt_important_message_products mp
       JOIN prod_products p ON p.tenant_id=mp.tenant_id AND p.id=mp.product_id
      WHERE mp.tenant_id=? AND mp.store_id=? AND mp.message_id=?
      ORDER BY mp.sort_order,mp.id`,
    [schedule.tenant_id, schedule.store_id, schedule.message_id]
  );
  message.publication_channels = String(message.publication_channels || '').split(',').filter(Boolean);
  message.products = (products || []).map((product) => ({
    ...product,
    photo: (() => { try { return JSON.parse(product.photos_json || '[]')[0] || ''; } catch { return ''; } })(),
  }));
  const [recipients] = await db.query(
    'SELECT customer_id FROM mkt_important_message_recipients WHERE tenant_id=? AND store_id=? AND message_id=?',
    [schedule.tenant_id, schedule.store_id, schedule.message_id]
  );
  message.recipient_ids = (recipients || []).map((row) => Number(row.customer_id)).filter(Boolean);
  return message;
}

async function refreshCampaignLifecycle(db, tenantId, storeId, messageId) {
  const [rows] = await db.query(
    'SELECT state,end_mode FROM mkt_campaign_channel_schedules WHERE tenant_id=? AND store_id=? AND message_id=?',
    [tenantId, storeId, messageId]
  );
  if (!rows.length) return;
  let status = 'scheduled';
  if (rows.every((row) => ['completed', 'skipped'].includes(row.state))) status = 'completed';
  else if (rows.some((row) => row.state === 'active')) status = 'active';
  else if (rows.every((row) => row.state === 'paused')) status = 'paused';
  await db.query(
    `UPDATE mkt_important_messages SET lifecycle_status=?,completed_at=IF(?='completed',COALESCE(completed_at,NOW(3)),NULL)
      WHERE tenant_id=? AND store_id=? AND id=? AND lifecycle_status<>'paused'`,
    [status, status, tenantId, storeId, messageId]
  );
}

async function tickCampaignSchedules(db, options = {}) {
  await ensureCampaignScheduleSchema(db);
  const lease = crypto.randomUUID();
  await db.query("UPDATE mkt_campaign_channel_schedules SET lease_token=NULL,lease_until=NULL WHERE lease_until<NOW(3) AND state IN ('pending','active') LIMIT 100");
  const [startRows] = await db.query(
    `SELECT s.id FROM mkt_campaign_channel_schedules s
      JOIN mkt_important_messages m ON m.id=s.message_id AND m.tenant_id=s.tenant_id AND m.store_id=s.store_id
     WHERE s.state='pending' AND s.start_at<=NOW(3) AND s.lease_token IS NULL
       AND m.lifecycle_status IN ('scheduled','active')
     ORDER BY s.start_at,s.id LIMIT 1`
  );
  const startId = Number(startRows?.[0]?.id || 0);
  if (startId) {
    const [claim] = await db.query(
      "UPDATE mkt_campaign_channel_schedules SET lease_token=?,lease_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND) WHERE id=? AND state='pending' AND lease_token IS NULL",
      [lease, startId]
    );
    if (claim.affectedRows) {
      const [rows] = await db.query('SELECT * FROM mkt_campaign_channel_schedules WHERE id=? AND lease_token=? LIMIT 1', [startId, lease]);
      const schedule = rows?.[0];
      const missedExpired = Boolean(schedule?.end_at && new Date(schedule.end_at).getTime() <= Date.now());
      try {
        if (missedExpired) {
          await db.query("UPDATE mkt_campaign_channel_schedules SET state='skipped',actual_ended_at=NOW(3),last_error_code='MISSED_EXPIRED',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", [startId, lease]);
        } else if (schedule.channel === 'storefront') {
          await db.query(
            `UPDATE mkt_important_messages SET is_published=1,is_hidden=IF(manual_hidden=1,1,0),published_at=COALESCE(published_at,NOW(3))
              WHERE tenant_id=? AND store_id=? AND id=? AND lifecycle_status<>'completed'`,
            [schedule.tenant_id, schedule.store_id, schedule.message_id]
          );
          await db.query("UPDATE mkt_campaign_channel_schedules SET state='active',actual_started_at=COALESCE(actual_started_at,NOW(3)),lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", [startId, lease]);
          if (typeof options.onStorefrontStarted === 'function') {
            const message = await loadScheduledMessage(db, schedule);
            try {
              await options.onStorefrontStarted({ tenantId: schedule.tenant_id, storeId: schedule.store_id, message });
            } catch (pushError) {
              await db.query('UPDATE mkt_campaign_channel_schedules SET last_error_code=? WHERE id=?', [safeErrorCode(pushError), startId]);
            }
          }
        } else {
          const message = await loadScheduledMessage(db, schedule);
          if (!message) throw Object.assign(new Error('CAMPAIGN_NOT_FOUND'), { code: 'CAMPAIGN_NOT_FOUND' });
          const run = await createRun(db, {
            tenantId: schedule.tenant_id,
            storeId: schedule.store_id,
            message,
            channels: [schedule.channel],
            idempotencyKey: schedule.launch_key,
            userId: schedule.created_by,
          });
          await db.query("UPDATE mkt_campaign_channel_schedules SET state='active',run_id=?,actual_started_at=COALESCE(actual_started_at,NOW(3)),lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", [run.runId, startId, lease]);
        }
        await db.query(
          `INSERT INTO mkt_campaign_lifecycle_audit (tenant_id,store_id,message_id,channel,action,to_status,details_json,actor_user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [schedule.tenant_id, schedule.store_id, schedule.message_id, schedule.channel, missedExpired ? 'channel_skipped' : 'channel_started', missedExpired ? 'skipped' : 'active', JSON.stringify({ schedule_id: startId }), schedule.created_by]
        );
      } catch (error) {
        await db.query("UPDATE mkt_campaign_channel_schedules SET state='failed',last_error_code=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", [safeErrorCode(error), startId, lease]);
        if (schedule) await db.query(
          `INSERT INTO mkt_campaign_lifecycle_audit (tenant_id,store_id,message_id,channel,action,to_status,details_json,actor_user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [schedule.tenant_id, schedule.store_id, schedule.message_id, schedule.channel, 'channel_failed', 'failed', JSON.stringify({ schedule_id: startId, error: safeErrorCode(error) }), schedule.created_by]
        );
      }
      if (schedule) await refreshCampaignLifecycle(db, schedule.tenant_id, schedule.store_id, schedule.message_id);
    }
  }

  const endLease = crypto.randomUUID();
  const [endRows] = await db.query("SELECT id FROM mkt_campaign_channel_schedules WHERE state='active' AND end_mode='scheduled' AND end_at<=NOW(3) AND lease_token IS NULL ORDER BY end_at,id LIMIT 1");
  const endId = Number(endRows?.[0]?.id || 0);
  if (!endId) return;
  const [endClaim] = await db.query("UPDATE mkt_campaign_channel_schedules SET lease_token=?,lease_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND) WHERE id=? AND state='active' AND lease_token IS NULL", [endLease, endId]);
  if (!endClaim.affectedRows) return;
  const [endSchedules] = await db.query('SELECT * FROM mkt_campaign_channel_schedules WHERE id=? AND lease_token=? LIMIT 1', [endId, endLease]);
  const schedule = endSchedules?.[0];
  if (!schedule) return;
  if (schedule.channel === 'storefront') {
    await db.query('UPDATE mkt_important_messages SET is_published=0,is_hidden=1 WHERE tenant_id=? AND store_id=? AND id=?', [schedule.tenant_id, schedule.store_id, schedule.message_id]);
  } else if (schedule.run_id) {
    await db.query("UPDATE mkt_campaign_deliveries SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE run_id=? AND state IN ('pending','retry','paused')", [schedule.run_id]);
    if (schedule.end_action === 'delete') {
      await db.query(
        `UPDATE mkt_campaign_deliveries SET deletion_state=IF(provider_message_ids_json IS NULL AND COALESCE(provider_message_id,'')='','unavailable','pending'),deletion_available_at=NOW(6),deletion_requested_at=NOW(6)
          WHERE run_id=? AND state='sent' AND deletion_state='not_requested'`,
        [schedule.run_id]
      );
    }
  }
  await db.query("UPDATE mkt_campaign_channel_schedules SET state='completed',actual_ended_at=NOW(3),lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?", [endId, endLease]);
  await db.query(
    `INSERT INTO mkt_campaign_lifecycle_audit (tenant_id,store_id,message_id,channel,action,from_status,to_status,details_json)
     VALUES (?,?,?,?,?,'active','completed',?)`,
    [schedule.tenant_id, schedule.store_id, schedule.message_id, schedule.channel, 'channel_ended', JSON.stringify({ schedule_id: endId, end_action: schedule.end_action })]
  );
  await refreshCampaignLifecycle(db, schedule.tenant_id, schedule.store_id, schedule.message_id);
}

function createCampaignDeliveryWorker(db, options = {}) {
  let stopped = true;
  let timer = null;
  let active = Promise.resolve();
  let schemaReady = false;

  async function ensureDeletionSchema() {
    if (schemaReady) return;
    const statements = [
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN provider_message_ids_json JSON NULL AFTER provider_message_id',
      "ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_state ENUM('not_requested','pending','processing','retry','deleted','failed','unavailable') NOT NULL DEFAULT 'not_requested' AFTER sent_at",
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER deletion_state',
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_available_at DATETIME(6) NULL AFTER deletion_attempts',
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER deletion_available_at',
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_lease_until DATETIME(6) NULL AFTER deletion_lease_token',
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER deletion_lease_until',
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deletion_requested_at DATETIME(6) NULL AFTER deletion_error_code',
      'ALTER TABLE mkt_campaign_deliveries ADD COLUMN deleted_at DATETIME(6) NULL AFTER deletion_requested_at',
    ];
    for (const statement of statements) {
      try { await db.query(statement); } catch (error) { if (error?.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
    try {
      await db.query('ALTER TABLE mkt_campaign_deliveries ADD KEY idx_mkt_campaign_deletion_queue (deletion_state,deletion_available_at,deletion_lease_until,id)');
    } catch (error) {
      if (error?.code !== 'ER_DUP_KEYNAME') throw error;
    }
    schemaReady = true;
  }

  async function tick() {
    await ensureDeletionSchema();
    const lease = crypto.randomUUID();
    await db.query(
      `UPDATE mkt_campaign_deliveries
          SET state='retry',lease_token=NULL,lease_until=NULL,available_at=NOW(6)
        WHERE state='processing' AND lease_until<NOW(6) LIMIT 100`
    );
    const [candidates] = await db.query(
      `SELECT id FROM mkt_campaign_deliveries
        WHERE state IN ('pending','retry') AND available_at<=NOW(6)
        ORDER BY id LIMIT 1`
    );
    const id = Number(candidates?.[0]?.id || 0);
    if (!id) return;
    const [claim] = await db.query(
      `UPDATE mkt_campaign_deliveries
          SET state='processing',lease_token=?,lease_until=DATE_ADD(NOW(6),INTERVAL 45 SECOND),attempts=attempts+1
        WHERE id=? AND state IN ('pending','retry') AND available_at<=NOW(6)`,
      [lease, id]
    );
    if (!claim.affectedRows) return;
    const [rows] = await db.query(
      `SELECT d.*,r.content_snapshot_json,t.telegram_bot_token,t.max_bot_token
         FROM mkt_campaign_deliveries d
         JOIN mkt_campaign_runs r ON r.id=d.run_id AND r.tenant_id=d.tenant_id AND r.store_id=d.store_id
         JOIN ten_tenants t ON t.id=d.tenant_id
        WHERE d.id=? AND d.lease_token=? LIMIT 1`,
      [id, lease]
    );
    const job = rows?.[0];
    if (!job) return;
    let snapshot = job.content_snapshot_json;
    if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot);
    try {
      const currentToken = String(job.provider === 'tg' ? job.telegram_bot_token : job.max_bot_token || '');
      const currentIdentity = await fetchBotIdentity({ provider: job.provider, token: currentToken });
      if (!job.bot_id || currentIdentity.id !== String(job.bot_id)) {
        throw Object.assign(new Error('CAMPAIGN_BOT_CHANGED'), { code: 'CAMPAIGN_BOT_CHANGED', status: 409 });
      }
      const deliveryResult = job.provider === 'tg'
        ? await (() => {
          const match = String(job.provider_message_id || '').match(/^tgcol:(\d+):(\d+)$/);
          const progress = match ? { headerId: match[1], completedCards: Number(match[2]), messageIds: parseMessageIds(job) } : {};
          progress.onCheckpoint = async (headerId, completedCards, messageIds = []) => {
            const checkpoint = `tgcol:${headerId}:${completedCards}`;
            const [result] = await db.query(
              'UPDATE mkt_campaign_deliveries SET provider_message_id=?,provider_message_ids_json=? WHERE id=? AND lease_token=?',
              [checkpoint, JSON.stringify(messageIds), id, lease]
            );
            if (!result.affectedRows) throw Object.assign(new Error('CAMPAIGN_DELIVERY_LEASE_LOST'), { code: 'CAMPAIGN_DELIVERY_LEASE_LOST' });
          };
          return sendTelegram(String(job.telegram_bot_token || ''), job.provider_user_id, snapshot, progress);
        })()
        : await sendMax(String(job.max_bot_token || ''), job.provider_user_id, snapshot);
      await db.query(
        `UPDATE mkt_campaign_deliveries
            SET state='sent',provider_message_id=?,provider_message_ids_json=?,sent_at=NOW(6),lease_token=NULL,lease_until=NULL,last_error_code=NULL
          WHERE id=? AND lease_token=?`,
        [deliveryResult.primaryMessageId || null, JSON.stringify(deliveryResult.messageIds || []), id, lease]
      );
      await db.query(
        `UPDATE mkt_campaign_deliveries d
           JOIN mkt_campaign_channel_schedules s ON s.run_id=d.run_id
            SET d.deletion_state='pending',d.deletion_available_at=NOW(6),d.deletion_requested_at=NOW(6)
          WHERE d.id=? AND d.state='sent' AND d.deletion_state='not_requested'
            AND s.state='completed' AND s.end_action='delete'`,
        [id]
      );
    } catch (error) {
      const attempts = Number(job.attempts || 0);
      const uncertain = ['AbortError', 'TimeoutError'].includes(error?.name);
      const permanent = isPermanentError(error) || attempts >= 5;
      const nextState = uncertain ? 'unknown' : permanent ? 'failed' : 'retry';
      const retrySeconds = Math.max(5, Math.min(900, Number(error?.retryAfter || (2 ** attempts) * 5)));
      await db.query(
        `UPDATE mkt_campaign_deliveries
            SET state=?,available_at=DATE_ADD(NOW(6),INTERVAL ? SECOND),lease_token=NULL,lease_until=NULL,last_error_code=?
          WHERE id=? AND lease_token=?`,
        [nextState, retrySeconds, safeErrorCode(error), id, lease]
      );
      if (/_BOT_BLOCKED$/.test(safeErrorCode(error)) && job.bot_id) {
        await db.query(
          `UPDATE auth_messenger_bot_contacts
              SET reachable=0,unavailable_reason='blocked',updated_at=NOW(3)
            WHERE tenant_id=? AND provider=? AND bot_id=? AND provider_user_id=?`,
          [job.tenant_id, job.provider, job.bot_id, job.provider_user_id]
        );
      }
    }
    await db.query(
      `UPDATE mkt_campaign_runs r
          SET r.status=CASE
            WHEN EXISTS(SELECT 1 FROM mkt_campaign_deliveries d WHERE d.run_id=r.id AND d.state IN ('pending','processing','retry')) THEN 'sending'
            WHEN EXISTS(SELECT 1 FROM mkt_campaign_deliveries d WHERE d.run_id=r.id AND d.state IN ('failed','unknown')) THEN 'failed'
            ELSE 'completed' END,
              r.started_at=COALESCE(r.started_at,NOW(3)),
              r.completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM mkt_campaign_deliveries d WHERE d.run_id=r.id AND d.state IN ('pending','processing','retry')) THEN NOW(3) ELSE NULL END
        WHERE r.id=? AND r.status<>'cancelled'`,
      [job.run_id]
    );
  }

  async function tickDeletion() {
    const lease = crypto.randomUUID();
    await db.query(
      `UPDATE mkt_campaign_deliveries SET deletion_state='retry',deletion_lease_token=NULL,deletion_lease_until=NULL,deletion_available_at=NOW(6)
        WHERE deletion_state='processing' AND deletion_lease_until<NOW(6) LIMIT 100`
    );
    const [candidates] = await db.query(
      `SELECT id FROM mkt_campaign_deliveries
        WHERE deletion_state IN ('pending','retry') AND deletion_available_at<=NOW(6) ORDER BY id LIMIT 1`
    );
    const id = Number(candidates?.[0]?.id || 0);
    if (!id) return;
    const [claim] = await db.query(
      `UPDATE mkt_campaign_deliveries
          SET deletion_state='processing',deletion_lease_token=?,deletion_lease_until=DATE_ADD(NOW(6),INTERVAL 45 SECOND),deletion_attempts=deletion_attempts+1
        WHERE id=? AND deletion_state IN ('pending','retry') AND deletion_available_at<=NOW(6)`,
      [lease, id]
    );
    if (!claim.affectedRows) return;
    const [rows] = await db.query(
      `SELECT d.*,t.telegram_bot_token,t.max_bot_token
         FROM mkt_campaign_deliveries d JOIN ten_tenants t ON t.id=d.tenant_id
        WHERE d.id=? AND d.deletion_lease_token=? LIMIT 1`, [id, lease]
    );
    const job = rows?.[0];
    if (!job) return;
    try {
      const token = String(job.provider === 'tg' ? job.telegram_bot_token : job.max_bot_token || '');
      const identity = await fetchBotIdentity({ provider: job.provider, token });
      if (!job.bot_id || identity.id !== String(job.bot_id)) throw Object.assign(new Error('CAMPAIGN_BOT_CHANGED'), { code: 'CAMPAIGN_BOT_CHANGED', status: 409 });
      const messageIds = parseMessageIds(job);
      if (!messageIds.length) {
        await db.query(`UPDATE mkt_campaign_deliveries SET deletion_state='unavailable',deletion_error_code='MESSAGE_IDS_UNAVAILABLE',deletion_lease_token=NULL,deletion_lease_until=NULL WHERE id=? AND deletion_lease_token=?`, [id, lease]);
        return;
      }
      if (job.provider === 'tg') await deleteTelegramMessages(token, job.provider_user_id, messageIds);
      else await deleteMaxMessages(token, messageIds);
      await db.query(`UPDATE mkt_campaign_deliveries SET deletion_state='deleted',deleted_at=NOW(6),deletion_error_code=NULL,deletion_lease_token=NULL,deletion_lease_until=NULL WHERE id=? AND deletion_lease_token=?`, [id, lease]);
    } catch (error) {
      const attempts = Number(job.deletion_attempts || 0);
      const permanent = isPermanentError(error) || attempts >= 5;
      const nextState = permanent ? 'failed' : 'retry';
      const retrySeconds = Math.max(5, Math.min(900, Number(error?.retryAfter || (2 ** attempts) * 5)));
      await db.query(
        `UPDATE mkt_campaign_deliveries SET deletion_state=?,deletion_available_at=DATE_ADD(NOW(6),INTERVAL ? SECOND),deletion_error_code=?,deletion_lease_token=NULL,deletion_lease_until=NULL WHERE id=? AND deletion_lease_token=?`,
        [nextState, retrySeconds, safeErrorCode(error), id, lease]
      );
    }
  }

  function schedule(delay) {
    if (stopped) return;
    timer = setTimeout(() => {
      active = tickCampaignSchedules(db, options).then(tick).then(tickDeletion).catch((error) => console.error('CAMPAIGN_DELIVERY_WORKER_FAILED', safeErrorCode(error))).finally(() => schedule(1000));
    }, delay);
    timer.unref();
  }
  return {
    start() { if (stopped) { stopped = false; schedule(0); } },
    async stop() { stopped = true; clearTimeout(timer); await active; },
  };
}

module.exports = { createCampaignDeliveryWorker, createRun, ensureCampaignScheduleSchema, refreshCampaignLifecycle };
