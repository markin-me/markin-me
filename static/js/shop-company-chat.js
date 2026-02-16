(function () {
  const openBtn = document.getElementById("shopCompanyChatOpenBtn");
  const unreadBadge = document.getElementById("shopCompanyChatUnreadBadge");
  const overlay = document.getElementById("shopCompanyChatOverlay");
  const closeBtn = document.getElementById("shopCompanyChatCloseBtn");
  const feed = document.getElementById("shopCompanyChatFeed");
  const thread = document.getElementById("shopCompanyChatThread");
  const composer = document.getElementById("shopCompanyChatComposer");
  const attachBtn = document.getElementById("shopCompanyChatAttachBtn");
  const attachInput = document.getElementById("shopCompanyChatAttachmentInput");
  const input = document.getElementById("shopCompanyChatInput");
  const emojiBtn = document.getElementById("shopCompanyChatEmojiBtn");
  const emojiPopover = document.getElementById("shopCompanyChatEmojiPopover");
  const scrollDownBtn = document.getElementById("shopCompanyChatScrollDownBtn");
  const reactionBar = document.getElementById("shopCompanyChatReactionBar");

  if (!openBtn || !overlay || !closeBtn) return;
  if (!feed || !thread || !composer || !attachBtn || !attachInput || !input || !emojiBtn || !emojiPopover || !scrollDownBtn || !reactionBar) return;

  const EMOJI_ASSET_BASE_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-google@15.1.2/img/google/64";
  const EMOJIS = [
    "\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F525}", "\u{1F602}", "\u{1F970}", "\u{1F64F}",
    "\u{1F600}", "\u{1F603}", "\u{1F923}", "\u{1F60A}", "\u{1F60D}", "\u{1F618}",
    "\u{1F917}", "\u{1F914}", "\u{1F61E}", "\u{1F622}", "\u{1F621}", "\u{1F92F}",
    "\u{1F44E}", "\u{1F44F}", "\u{1F91D}", "\u{1FAF6}", "\u{1F44C}", "\u{1F4AA}",
    "\u{2728}", "\u{1F389}", "\u{1F680}", "\u{2705}", "\u{274C}", "\u{1F4AF}",
    "\u{1F4AC}", "\u{1F4E6}", "\u{1F69A}", "\u{1F37D}\u{FE0F}",
    "\u{1FAE8}", "\u{1FAE0}", "\u{1FAE1}", "\u{1FAE2}", "\u{1FAE3}", "\u{1FAE5}",
    "\u{1F979}", "\u{1FA77}", "\u{1FA75}",
  ];
  const QUICK_REACTIONS = [
    "\u{1F44D}",
    "\u{2764}\u{FE0F}",
    "\u{1F525}",
    "\u{1F602}",
    "\u{1F970}",
    "\u{1F64F}",
    "\u{1FAE8}",
  ];
  const EXTRA_REACTIONS = [
    "\u{1F622}",
    "\u{1F615}",
    "\u{1F61E}",
    "\u{1F61F}",
    "\u{1F641}",
    "\u{1F62E}",
  ];
  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const CHAT_THREAD_SAVE_DEBOUNCE_MS = 140;
  const CHAT_THREAD_POLL_MS = 1800;

  let emojiAssetsState = "unknown";

  const QUICK_OPTIONS = [
    "Где мой заказ",
    "Вопрос по качеству товара",
    "Вопрос по комплектации заказа",
    "Другой вопрос",
  ];

  const QUICK_REPLIES = {
    "где мой заказ":
      "Проверяю статус заказа. Если курьер задерживается из-за погоды, мы обязательно обновим время доставки.",
    "вопрос по качеству товара":
      "Извините за ситуацию. Напишите, пожалуйста, какой товар и что именно не так, и я передам обращение в поддержку.",
    "вопрос по комплектации заказа":
      "Поняла. Подскажите, чего не хватает или что было лишним, чтобы мы быстро все исправили.",
    "другой вопрос":
      "Я на связи. Опишите ваш вопрос, и я постараюсь помочь или переключу на оператора.",
  };

  const baseEntries = [
    { id: "h-1", type: "message", role: "user", day: "Вчера", time: "13:18", text: "Вопрос по комплектации заказа", deliveryStatus: "read" },
    {
      id: "h-2",
      type: "message",
      role: "agent",
      day: "Вчера",
      time: "13:18",
      author: "Лия",
      text: "Очень хочу помочь. Подскажите, вам положили лишний товар?",
    },
    { id: "h-3", type: "message", role: "user", day: "Вчера", time: "13:18", text: "Нет", deliveryStatus: "read" },
    {
      id: "h-4",
      type: "message",
      role: "agent",
      day: "Вчера",
      time: "13:18",
      author: "Лия",
      text: "Не вижу заказов. Какой у вас вопрос?",
    },
    {
      id: "t-1",
      type: "message",
      role: "agent",
      day: "Сегодня",
      time: "00:17",
      text:
        "Привет! Я Лия, виртуальный помощник в Самокате.\n" +
        "Если ваш вопрос по заказу, то сегодня сталкиваемся со сложностями из-за погодных условий: можем везти покупку чуть дольше.",
    },
    {
      id: "t-2",
      type: "options",
      role: "agent",
      day: "Сегодня",
      time: "00:17",
      text: "Чтобы я смогла вам помочь, выберите категорию ниже:",
      options: QUICK_OPTIONS,
    },
  ];

  const INITIAL_BATCH = 3;
  const OLDER_BATCH = 4;

  let initialized = false;
  let isLoadingOlder = false;
  let visibleStart = baseEntries.length;
  let liveEntries = [];
  let messageSeq = 0;
  let sharedThreadUpdatedAt = "";
  let sharedThreadPollTimer = 0;
  let sharedThreadSaveTimer = 0;
  let sharedPullInFlight = false;
  let reactionMessageId = "";
  let contextMenuMessageId = "";
  let contextMenuEl = null;
  let contextMenuEditBtn = null;
  let contextMenuDeleteBtn = null;
  let editingMessageId = "";
  let deleteConfirmUi = null;
  let pendingDeleteConfirm = null;
  let deleteConfirmCloseTimer = 0;
  let suppressTapUntil = 0;
  let touchGesture = null;
  let replyDraft = null;
  let replyUi = null;
  const selectedMessageIds = new Set();

  const LONG_PRESS_MS = 430;
  const SWIPE_REPLY_TRIGGER = 72;

  function ensureUnreadBadge() {
    if (unreadBadge && unreadBadge.isConnected) return unreadBadge;
    const existing = openBtn.querySelector("#shopCompanyChatUnreadBadge");
    if (existing) return existing;

    const node = document.createElement("span");
    node.id = "shopCompanyChatUnreadBadge";
    node.className = "shop-company-chat-unread hidden";
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    openBtn.appendChild(node);
    return node;
  }

  function getUnreadAgentCount(entries) {
    const list = Array.isArray(entries) ? entries : [];
    let count = 0;
    list.forEach(function (entry) {
      if (!entry || entry.type !== "message") return;
      if (entry.role !== "agent") return;
      const status = String(entry.deliveryStatus || "").toLowerCase();
      if (entry.read === true || entry.readAt || status === "read") return;
      count += 1;
    });
    return count;
  }

  function renderUnreadBadge(entries) {
    const badge = ensureUnreadBadge();
    if (!badge) return;

    const unreadCount = getUnreadAgentCount(entries);
    if (unreadCount <= 0) {
      badge.textContent = "";
      badge.classList.add("hidden");
      openBtn.removeAttribute("data-unread-count");
      return;
    }

    const value = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.textContent = value;
    badge.classList.remove("hidden");
    openBtn.setAttribute("data-unread-count", value);
  }

  function getTenantId() {
    const meta = document.querySelector('meta[name="tenant_id"]');
    if (meta && meta.content) {
      const n = Number(meta.content);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
  }

  function getActiveStoreId() {
    const n = Number(localStorage.getItem("activeStoreId") || "1");
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  const tenantId = getTenantId();
  const customerTokenKey = "shop_customer_token_t" + tenantId;
  const customerCacheKey = "shop_customer_cache_t" + tenantId;
  const guestChatClientKey = "shop_company_chat_guest_id_t" + tenantId;

  function getCustomerToken() {
    try { return String(localStorage.getItem(customerTokenKey) || ""); } catch { return ""; }
  }

  function getCustomerCache() {
    try {
      const raw = localStorage.getItem(customerCacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function hashToStableInt(value) {
    const str = String(value || "");
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash * 31) + str.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function stableSerialize(value) {
    try {
      return JSON.stringify(value || []);
    } catch {
      return "[]";
    }
  }

  function resolveChatClientProfile() {
    const customer = getCustomerCache();
    const directId = Number(customer && customer.id);
    if (Number.isFinite(directId) && directId > 0) {
      return {
        id: Math.trunc(directId),
        name: String(customer.name || "Клиент"),
        phone: String(customer.phone || ""),
      };
    }

    const token = getCustomerToken();
    if (token) {
      const hashed = 800000000 + (hashToStableInt(token) % 99999999);
      return {
        id: Math.trunc(hashed),
        name: String((customer && customer.name) || "Гость"),
        phone: String((customer && customer.phone) || ""),
      };
    }

    let storedGuestId = Number(localStorage.getItem(guestChatClientKey) || 0);
    if (!Number.isFinite(storedGuestId) || storedGuestId <= 0) {
      storedGuestId = 900000000 + Math.floor(Math.random() * 99999999);
      try { localStorage.setItem(guestChatClientKey, String(storedGuestId)); } catch {}
    }

    return {
      id: Math.trunc(storedGuestId),
      name: String((customer && customer.name) || "Гость"),
      phone: String((customer && customer.phone) || ""),
    };
  }

  const chatClientProfile = resolveChatClientProfile();
  const localHiddenMessagesKey = "shop_company_chat_hidden_messages_t" + tenantId + "_c" + String(chatClientProfile.id || 0);
  let localHiddenMessageIds = loadLocalHiddenMessageIds();

  function loadLocalHiddenMessageIds() {
    try {
      const raw = localStorage.getItem(localHiddenMessagesKey);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map(function (id) { return String(id || ""); }).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function saveLocalHiddenMessageIds() {
    try {
      localStorage.setItem(localHiddenMessagesKey, JSON.stringify(Array.from(localHiddenMessageIds)));
    } catch {}
  }

  function isMessageHiddenLocally(messageId) {
    const id = String(messageId || "");
    if (!id) return false;
    return localHiddenMessageIds.has(id);
  }

  function setMessageHiddenLocally(messageId, hidden, options) {
    const id = String(messageId || "");
    if (!id) return false;
    const opts = options || {};
    const wantHidden = hidden === true;
    const has = localHiddenMessageIds.has(id);
    if (wantHidden === has) return false;

    if (wantHidden) localHiddenMessageIds.add(id);
    else localHiddenMessageIds.delete(id);

    if (opts.persist !== false) saveLocalHiddenMessageIds();
    return true;
  }

  function pruneLocalHiddenMessageIds(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (!localHiddenMessageIds.size) return false;
    const existing = new Set(
      list.map(function (entry) { return String(entry && entry.id || ""); }).filter(Boolean)
    );
    let changed = false;
    Array.from(localHiddenMessageIds).forEach(function (id) {
      if (existing.has(id)) return;
      localHiddenMessageIds.delete(id);
      changed = true;
    });
    if (changed) saveLocalHiddenMessageIds();
    return changed;
  }

  async function chatApiJson(url, opts) {
    const options = opts || {};
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": String(getActiveStoreId()),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const customerToken = getCustomerToken();
    if (customerToken) headers["x-customer-token"] = customerToken;

    const res = await fetch(url, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const json = await res.json().catch(function () { return null; });
    if (!json || json.ok !== true) {
      throw new Error((json && json.error) || ("API_ERROR (" + res.status + ")"));
    }
    return json;
  }

  function formatDayLabelFromIso(isoValue) {
    const date = new Date(String(isoValue || ""));
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

    if (diffDays === 0) return "Сегодня";
    if (diffDays === -1) return "Вчера";

    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return dd + "." + mm + "." + yyyy;
  }

  function formatTimeFromIso(isoValue) {
    const date = new Date(String(isoValue || ""));
    if (Number.isNaN(date.getTime())) return "";
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  function mapSharedMessageToEntry(message) {
    if (!message || typeof message !== "object") return null;
    const direction = String(message.direction || "").toLowerCase() === "out" ? "out" : "in";
    const createdAt = String(message.createdAt || new Date().toISOString());
    const role = direction === "in" ? "user" : "agent";
    const editedAt = String(message.editedAt || "");

    return {
      id: String(message.id || ""),
      type: "message",
      role: role,
      day: formatDayLabelFromIso(createdAt),
      time: formatTimeFromIso(createdAt) + (editedAt ? " • изм." : ""),
      text: String(message.text || ""),
      author: role === "agent" ? "Лия" : "",
      replyTo: message.replyTo && typeof message.replyTo === "object"
        ? {
            id: String(message.replyTo.id || ""),
            sender: String(message.replyTo.sender || ""),
            text: String(message.replyTo.text || ""),
          }
        : null,
      attachment: isImageAttachment(message.attachment)
        ? {
            kind: "image",
            name: String(message.attachment.name || ""),
            mime: String(message.attachment.mime || ""),
            dataUrl: String(message.attachment.dataUrl || ""),
            width: Number(message.attachment.width || 0),
            height: Number(message.attachment.height || 0),
            size: Number(message.attachment.size || 0),
          }
        : null,
      reaction: String(message.reaction || ""),
      deliveryStatus: String(message.deliveryStatus || ""),
      createdAt: createdAt,
      editedAt: editedAt,
      read: message.read === true,
      deliveredAt: String(message.deliveredAt || ""),
      readAt: String(message.readAt || ""),
    };
  }

  function mapEntryToSharedMessage(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = String(entry.id || "").trim();
    if (!id) return null;
    const direction = entry.role === "user" ? "in" : "out";
    const status = direction === "in" ? getOutgoingDeliveryStatus(entry) : "";
    return {
      id: id,
      direction: direction,
      text: String(entry.text || ""),
      attachment: isImageAttachment(entry.attachment)
        ? {
            kind: "image",
            name: String(entry.attachment.name || ""),
            mime: String(entry.attachment.mime || ""),
            dataUrl: String(entry.attachment.dataUrl || ""),
            width: Number(entry.attachment.width || 0),
            height: Number(entry.attachment.height || 0),
            size: Number(entry.attachment.size || 0),
          }
        : null,
      createdAt: String(entry.createdAt || new Date().toISOString()),
      editedAt: String(entry.editedAt || ""),
      read: entry.read === true || status === "read",
      pinned: false,
      reaction: String(entry.reaction || ""),
      replyTo: entry.replyTo && typeof entry.replyTo === "object"
        ? {
            id: String(entry.replyTo.id || ""),
            sender: String(entry.replyTo.sender || ""),
            text: String(entry.replyTo.text || ""),
          }
        : null,
      deliveryStatus: status,
      deliveredAt: String(entry.deliveredAt || ""),
      readAt: String(entry.readAt || ""),
    };
  }

  function buildSharedMessagesPayload() {
    return liveEntries
      .filter(function (entry) { return entry && entry.type === "message"; })
      .map(mapEntryToSharedMessage)
      .filter(Boolean)
      .sort(function (a, b) {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }

  function queueSharedThreadSave() {
    if (sharedThreadSaveTimer) clearTimeout(sharedThreadSaveTimer);
    sharedThreadSaveTimer = window.setTimeout(function () {
      sharedThreadSaveTimer = 0;
      saveSharedThreadToServer().catch(function () {});
    }, CHAT_THREAD_SAVE_DEBOUNCE_MS);
  }

  async function saveSharedThreadToServer() {
    const payload = buildSharedMessagesPayload();
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(String(chatClientProfile.id)),
      {
        method: "PUT",
        body: {
          messages: payload,
          meta: {
            name: String(chatClientProfile.name || "Клиент"),
            phone: String(chatClientProfile.phone || ""),
          },
        },
      }
    );
    const updatedAt = String(json && json.data && json.data.updated_at || "");
    if (updatedAt) sharedThreadUpdatedAt = updatedAt;
  }

  async function pullSharedThreadFromServer(options) {
    if (sharedPullInFlight) return false;
    sharedPullInFlight = true;
    try {
      const opts = options || {};
      const json = await chatApiJson(
        CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(String(chatClientProfile.id))
      );
      const payload = json && json.data ? json.data : {};
      const updatedAt = String(payload.updated_at || "");

      const remoteMessages = Array.isArray(payload.messages) ? payload.messages : [];
      const mappedEntries = remoteMessages
        .map(mapSharedMessageToEntry)
        .filter(Boolean);
      pruneLocalHiddenMessageIds(baseEntries.concat(mappedEntries));
      const shouldMarkRead = overlay.classList.contains("is-open");
      const nowIso = new Date().toISOString();
      let deliveryStateChanged = false;
      mappedEntries.forEach(function (entry) {
        if (!entry || entry.role !== "agent") return;

        const rawStatus = String(entry.deliveryStatus || "").toLowerCase();
        const isRead = entry.read === true || !!entry.readAt || rawStatus === "read";
        const isDelivered = !!entry.deliveredAt || rawStatus === "delivered" || isRead;

        if (!isDelivered) {
          entry.deliveryStatus = "delivered";
          entry.deliveredAt = entry.deliveredAt || nowIso;
          deliveryStateChanged = true;
        }

        if (!shouldMarkRead) return;

        if (!isRead) {
          entry.read = true;
          entry.deliveryStatus = "read";
          entry.deliveredAt = entry.deliveredAt || nowIso;
          entry.readAt = entry.readAt || nowIso;
          deliveryStateChanged = true;
          return;
        }

        if (rawStatus !== "read") {
          entry.deliveryStatus = "read";
          if (!entry.readAt) entry.readAt = nowIso;
          deliveryStateChanged = true;
        }
      });
      renderUnreadBadge(mappedEntries);
      const sameThread = stableSerialize(liveEntries) === stableSerialize(mappedEntries);
      if (!opts.force && sameThread && sharedThreadUpdatedAt === updatedAt) {
        if (deliveryStateChanged) queueSharedThreadSave();
        return false;
      }

      const prevTop = feed.scrollTop;
      const keepBottom = shouldKeepFeedPinnedToBottom();
      liveEntries = mappedEntries;
      sharedThreadUpdatedAt = updatedAt;
      renderThread();

      if (keepBottom) {
        scrollToBottom(false);
      } else {
        feed.scrollTop = prevTop;
        updateScrollDownButton();
      }
      if (deliveryStateChanged) queueSharedThreadSave();
      return true;
    } finally {
      sharedPullInFlight = false;
    }
  }

  function startSharedThreadPolling() {
    if (sharedThreadPollTimer) return;
    sharedThreadPollTimer = window.setInterval(function () {
      pullSharedThreadFromServer({ force: false }).catch(function () {});
    }, CHAT_THREAD_POLL_MS);
  }

  function stopSharedThreadPolling() {
    if (!sharedThreadPollTimer) return;
    clearInterval(sharedThreadPollTimer);
    sharedThreadPollTimer = 0;
  }

  function emojiToAssetCode(emoji) {
    return Array.from(String(emoji || ""))
      .map(function (char) { return char.codePointAt(0); })
      .filter(function (cp) { return Number.isFinite(cp) && cp > 0; })
      .map(function (cp) { return cp.toString(16).toLowerCase(); })
      .join("-");
  }

  function getEmojiAssetUrl(emoji) {
    const code = emojiToAssetCode(emoji);
    return code ? EMOJI_ASSET_BASE_URL + "/" + code + ".png" : "";
  }

  function activateNativeEmojiFallback() {
    if (emojiAssetsState === "fallback") return;
    emojiAssetsState = "fallback";

    renderEmojiPicker();
    normalizeQuickReactionButtons();
    decorateComposerEmojiControls();

    const prevTop = feed ? feed.scrollTop : 0;
    renderThread();
    if (feed) feed.scrollTop = prevTop;
    updateScrollDownButton();
    syncComposerRichPreview({});
  }

  function probeEmojiAssetsAvailability() {
    const src = getEmojiAssetUrl("\u{1F642}");
    if (!src) {
      emojiAssetsState = "fallback";
      return;
    }
    const probe = new Image();
    probe.onload = function () {
      if (emojiAssetsState !== "fallback") emojiAssetsState = "ok";
    };
    probe.onerror = function () {
      activateNativeEmojiFallback();
    };
    probe.src = src;
  }

  function setEmojiGlyph(target, emoji, glyphClassName) {
    if (!target) return;
    const value = String(emoji || "");
    if (emojiAssetsState === "fallback") {
      target.textContent = value;
      return;
    }
    const src = getEmojiAssetUrl(value);
    target.textContent = "";
    if (!src) {
      target.textContent = value;
      return;
    }

    const img = document.createElement("img");
    img.className = glyphClassName;
    img.src = src;
    img.alt = value;
    img.decoding = "async";
    img.loading = "eager";
    img.draggable = false;
    img.setAttribute("aria-hidden", "true");
    img.addEventListener("error", function () {
      target.textContent = value;
      activateNativeEmojiFallback();
    }, { once: true });
    target.appendChild(img);
  }

  const emojiGraphemeSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ru", { granularity: "grapheme" })
    : null;

  function segmentGraphemes(value) {
    const text = String(value || "");
    if (!text) return [];
    if (!emojiGraphemeSegmenter) return Array.from(text);
    return Array.from(emojiGraphemeSegmenter.segment(text), function (part) { return part.segment; });
  }

  function isEmojiGrapheme(segment) {
    const chars = Array.from(String(segment || ""));
    if (!chars.length) return false;
    const codePoints = chars
      .map(function (ch) { return ch.codePointAt(0); })
      .filter(function (cp) { return Number.isFinite(cp) && cp > 0; });
    if (!codePoints.length) return false;

    const hasKeycapMarker = codePoints.includes(0x20e3);
    let hasEmojiBase = false;

    for (const cp of codePoints) {
      const isEmojiBase = (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf);
      const isJoinOrVariation = cp === 0x200d || cp === 0xfe0f || cp === 0x20e3;
      const isKeycapBase = hasKeycapMarker && ((cp >= 0x30 && cp <= 0x39) || cp === 0x23 || cp === 0x2a);

      if (isEmojiBase || isKeycapBase) {
        hasEmojiBase = true;
        continue;
      }
      if (isJoinOrVariation) continue;
      return false;
    }

    return hasEmojiBase;
  }

  function renderEmojiMessageText(target, text, glyphClassName) {
    if (!target) return;
    target.textContent = "";
    const lines = String(text || "").split("\n");

    lines.forEach(function (line, lineIndex) {
      const segments = segmentGraphemes(line);
      segments.forEach(function (segment) {
        if (isEmojiGrapheme(segment)) {
          if (emojiAssetsState === "fallback") {
            target.appendChild(document.createTextNode(segment));
            return;
          }
          const src = getEmojiAssetUrl(segment);
          if (src) {
            const img = document.createElement("img");
            img.className = glyphClassName;
            img.src = src;
            img.alt = segment;
            img.decoding = "async";
            img.loading = "eager";
            img.draggable = false;
            img.setAttribute("aria-hidden", "true");
            img.addEventListener("error", function () {
              img.replaceWith(document.createTextNode(segment));
              activateNativeEmojiFallback();
            }, { once: true });
            target.appendChild(img);
            return;
          }
        }
        target.appendChild(document.createTextNode(segment));
      });
      if (lineIndex < lines.length - 1) target.appendChild(document.createElement("br"));
    });
  }

  function getEmojiOnlyInfo(text) {
    const lines = String(text || "").split("\n");
    let emojiCount = 0;
    let hasVisibleChars = false;

    for (const line of lines) {
      const segments = segmentGraphemes(line);
      for (const segment of segments) {
        if (!String(segment).trim()) continue;
        hasVisibleChars = true;
        if (!isEmojiGrapheme(segment)) return { isEmojiOnly: false, count: 0 };
        emojiCount += 1;
      }
    }

    return hasVisibleChars
      ? { isEmojiOnly: true, count: emojiCount }
      : { isEmojiOnly: false, count: 0 };
  }

  function hasEmojiInText(text) {
    const lines = String(text || "").split("\n");
    for (const line of lines) {
      const segments = segmentGraphemes(line);
      for (const segment of segments) {
        if (isEmojiGrapheme(segment)) return true;
      }
    }
    return false;
  }

  function normalizeReactionValue(value) {
    return String(value || "")
      .trim()
      .normalize("NFC")
      .replace(/\uFE0F/g, "");
  }

  function getReplyPreviewText(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "Сообщение";
    if (normalized.length <= 74) return normalized;
    return normalized.slice(0, 74).trimEnd() + "…";
  }

  function getMessageSenderLabel(entry) {
    if (!entry) return "Сообщение";
    if (entry.role === "user") return "Вы";
    return String(entry.author || "Лия");
  }

  function isImageAttachment(attachment) {
    if (!attachment || typeof attachment !== "object") return false;
    const kind = String(attachment.kind || "").toLowerCase();
    const dataUrl = String(attachment.dataUrl || "");
    if (kind !== "image") return false;
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl);
  }

  function getEntryImageAttachment(entry) {
    if (!entry || typeof entry !== "object") return null;
    return isImageAttachment(entry.attachment) ? entry.attachment : null;
  }

  function getEntryPreviewText(entry) {
    if (!entry || typeof entry !== "object") return "";
    const text = String(entry.text || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    return getEntryImageAttachment(entry) ? "Фото" : "";
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      try {
        const reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(new Error("READ_FILE_FAILED")); };
        reader.readAsDataURL(file);
      } catch (err) {
        reject(err);
      }
    });
  }

  function getImageSizeFromDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        resolve({
          width: Number.isFinite(img.naturalWidth) ? img.naturalWidth : 0,
          height: Number.isFinite(img.naturalHeight) ? img.naturalHeight : 0,
        });
      };
      img.onerror = function () {
        resolve({ width: 0, height: 0 });
      };
      img.src = dataUrl;
    });
  }

  async function buildImageAttachmentFromFile(file) {
    if (!(file instanceof File)) return null;
    const mime = String(file.type || "").toLowerCase();
    if (!mime.startsWith("image/")) return null;

    const dataUrl = await readFileAsDataUrl(file);
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) return null;
    if (dataUrl.length > 5 * 1024 * 1024) return null;

    const dimensions = await getImageSizeFromDataUrl(dataUrl);
    return {
      kind: "image",
      name: String(file.name || "image").slice(0, 160),
      mime: mime || "image/jpeg",
      dataUrl: dataUrl,
      width: Number.isFinite(dimensions.width) && dimensions.width > 0 ? dimensions.width : 0,
      height: Number.isFinite(dimensions.height) && dimensions.height > 0 ? dimensions.height : 0,
      size: Number.isFinite(file.size) && file.size > 0 ? file.size : 0,
    };
  }

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  async function copyToClipboard(value) {
    const text = String(value ?? "");
    if (!text) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "true");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return !!ok;
    } catch {
      return false;
    }
  }

  function getOutgoingDeliveryStatus(entry) {
    if (!entry || entry.role !== "user") return "";
    const status = String(entry.deliveryStatus || "").toLowerCase();
    if (entry.readAt || entry.read === true || status === "read") return "read";
    if (entry.deliveredAt || status === "delivered") return "delivered";
    if (status === "sent") return "sent";
    return "sent";
  }

  function getDeliveryStatusRank(status) {
    if (status === "sent") return 1;
    if (status === "delivered") return 2;
    if (status === "read") return 3;
    return 0;
  }

  function getOutgoingStatusIconMarkup(status) {
    if (status === "sent") {
      return (
        '<svg class="shop-company-chat-status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
          '<path d="M2.8 8.4L5.7 11.3L13.3 3.7"></path>' +
        "</svg>"
      );
    }

    if (status === "delivered" || status === "read") {
      return (
        '<svg class="shop-company-chat-status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
          '<path d="M1.1 8.4L3.9 11.2L9.6 5.5"></path>' +
          '<path d="M6.1 8.4L8.9 11.2L14.6 5.5"></path>' +
        "</svg>"
      );
    }

    return "";
  }

  function openCompanyChat() {
    if (!initialized) {
      resetConversation();
      initialized = true;
    }
    hideEmojiPopover();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("shop-company-chat-open");
    requestAnimationFrame(function () {
      pullSharedThreadFromServer({ force: true }).catch(function () {});
      startSharedThreadPolling();
      scrollToBottom(false);
      syncComposerRichPreview({ stickToBottom: true });
      input.focus();
    });
  }

  function closeCompanyChat() {
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    if (pendingDeleteConfirm) closeDeleteConfirm();
    cancelEditingMessage();
    stopSharedThreadPolling();
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("shop-company-chat-open");
  }

  function resetConversation() {
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    clearReplyDraft();
    selectedMessageIds.clear();
    liveEntries = [];
    visibleStart = baseEntries.length;
    loadOlderMessages(INITIAL_BATCH, false);
    renderThread();
    scrollToBottom(false);
  }

  function nowTime() {
    const date = new Date();
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  function getAllEntries() {
    return baseEntries
      .slice(visibleStart)
      .concat(liveEntries)
      .filter(function (entry) {
        return !isMessageHiddenLocally(entry && entry.id);
      });
  }

  function getMessageEntries() {
    return baseEntries
      .concat(liveEntries)
      .filter(function (entry) {
        if (!entry || entry.type !== "message") return false;
        return !isMessageHiddenLocally(entry.id);
      });
  }

  function findMessageEntry(messageId) {
    const id = String(messageId || "");
    if (!id) return null;
    return getMessageEntries().find(function (entry) {
      return String(entry.id || "") === id;
    }) || null;
  }

  function ensureReplyDraftUi() {
    if (replyUi && replyUi.root && replyUi.root.isConnected) return replyUi;

    const root = document.createElement("div");
    root.className = "shop-company-chat-composer-reply hidden";
    root.innerHTML =
      '<span class="shop-company-chat-composer-reply__bar" aria-hidden="true"></span>' +
      '<div class="shop-company-chat-composer-reply__content">' +
        '<div class="shop-company-chat-composer-reply__name"></div>' +
        '<div class="shop-company-chat-composer-reply__text"></div>' +
      "</div>" +
      '<button class="shop-company-chat-composer-reply__close" type="button" aria-label="Отменить ответ" title="Отменить ответ">' +
        '<i class="fas fa-times"></i>' +
      "</button>";

    composer.insertBefore(root, composer.firstChild);

    replyUi = {
      root: root,
      name: root.querySelector(".shop-company-chat-composer-reply__name"),
      text: root.querySelector(".shop-company-chat-composer-reply__text"),
      closeBtn: root.querySelector(".shop-company-chat-composer-reply__close"),
    };

    if (replyUi.closeBtn) {
      replyUi.closeBtn.addEventListener("click", function () {
        clearReplyDraft();
      });
    }

    return replyUi;
  }

  function renderReplyDraftUi() {
    const ui = ensureReplyDraftUi();
    if (!ui || !ui.root || !ui.name || !ui.text) return;

    if (!replyDraft || !replyDraft.id) {
      ui.root.classList.add("hidden");
      syncComposerRichPreview({});
      return;
    }

    ui.name.textContent = String(replyDraft.sender || "Сообщение");
    renderEmojiMessageText(
      ui.text,
      getReplyPreviewText(replyDraft.text || ""),
      "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--preview"
    );
    ui.root.classList.remove("hidden");
    syncComposerRichPreview({});
  }

  function clearReplyDraft() {
    if (!replyDraft) return;
    replyDraft = null;
    renderReplyDraftUi();
  }

  function setReplyByMessage(messageId) {
    const entry = findMessageEntry(messageId);
    if (!entry) return false;

    cancelEditingMessage();
    replyDraft = {
      id: String(entry.id || ""),
      sender: getMessageSenderLabel(entry),
      text: getEntryPreviewText(entry),
    };
    renderReplyDraftUi();
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    input.focus();
    return true;
  }

  function cancelEditingMessage() {
    if (!editingMessageId) return;
    editingMessageId = "";
  }

  function startEditingMessage(messageId) {
    const entry = findMessageEntry(messageId);
    if (!entry || entry.role !== "user") return false;

    clearReplyDraft();
    editingMessageId = String(entry.id || "");
    input.value = String(entry.text || "");
    input.focus();
    const pos = input.value.length;
    input.setSelectionRange(pos, pos);
    syncComposerRichPreview({ stickToBottom: true });
    return true;
  }

  function updateMessageTextById(messageId, textValue) {
    const id = String(messageId || "");
    if (!id) return false;

    const nextText = String(textValue || "").trim();
    let target = null;
    let inLive = false;

    for (let i = liveEntries.length - 1; i >= 0; i -= 1) {
      const entry = liveEntries[i];
      if (String(entry && entry.id || "") !== id) continue;
      target = entry;
      inLive = true;
      break;
    }
    if (!target) {
      for (let i = baseEntries.length - 1; i >= 0; i -= 1) {
        const entry = baseEntries[i];
        if (String(entry && entry.id || "") !== id) continue;
        target = entry;
        inLive = false;
        break;
      }
    }

    if (!target || target.role !== "user") return false;
    const hasAttachment = !!getEntryImageAttachment(target);
    if (!nextText && !hasAttachment) return false;

    target.text = nextText;
    target.editedAt = new Date().toISOString();
    target.time = formatTimeFromIso(target.createdAt || target.editedAt) + " • изм.";

    const prevTop = feed.scrollTop;
    const keepBottom = shouldKeepFeedPinnedToBottom();
    renderThread();
    if (keepBottom) scrollToBottom(false);
    else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }

    if (inLive) queueSharedThreadSave();
    return true;
  }

  function hideMessageLocallyById(messageId) {
    const id = String(messageId || "");
    if (!id) return false;
    const entry = findMessageEntry(id);
    if (!entry || entry.role !== "user") return false;
    if (!setMessageHiddenLocally(id, true)) return false;

    selectedMessageIds.delete(id);
    if (String(replyDraft && replyDraft.id || "") === id) clearReplyDraft();
    if (String(editingMessageId || "") === id) {
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({ stickToBottom: true });
    }
    if (reactionMessageId === id) hideReactionBar();
    if (contextMenuMessageId === id) hideContextMenu();

    const prevTop = feed.scrollTop;
    const keepBottom = shouldKeepFeedPinnedToBottom();
    renderThread();
    if (keepBottom) scrollToBottom(false);
    else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }
    return true;
  }

  function ensureContextMenu() {
    if (contextMenuEl && contextMenuEl.isConnected) return;

    const menu = document.createElement("div");
    menu.id = "shopCompanyChatContextMenu";
    menu.className = "shop-company-chat-context-menu hidden";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Действия с сообщением");
    menu.innerHTML =
      '<div class="shop-company-chat-context-reactions" role="group" aria-label="Реакции">' +
        '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction="👍" aria-label="👍" title="👍">👍</button>' +
        '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction="❤️" aria-label="❤️" title="❤️">❤️</button>' +
        '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction="🔥" aria-label="🔥" title="🔥">🔥</button>' +
        '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction="😂" aria-label="😂" title="😂">😂</button>' +
        '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction="🥰" aria-label="🥰" title="🥰">🥰</button>' +
        '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction="🙏" aria-label="🙏" title="🙏">🙏</button>' +
      "</div>" +
      '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="reply">' +
        '<i class="fas fa-reply"></i><span>Ответить</span>' +
      "</button>" +
      '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="copy">' +
        '<i class="far fa-copy"></i><span>Скопировать</span>' +
      "</button>" +
      '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="edit">' +
        '<i class="fas fa-pen"></i><span>Изменить</span>' +
      "</button>" +
      '<button type="button" class="shop-company-chat-context-btn is-danger" data-chat-msg-action="delete">' +
        '<i class="far fa-trash-alt"></i><span>Удалить</span>' +
      "</button>" +
      '<div class="shop-company-chat-context-divider"></div>' +
      '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="select">' +
        '<i class="far fa-circle-check"></i><span>Выбрать</span>' +
      "</button>";
    document.body.appendChild(menu);
    contextMenuEl = menu;
    contextMenuEditBtn = menu.querySelector('[data-chat-msg-action="edit"]');
    contextMenuDeleteBtn = menu.querySelector('[data-chat-msg-action="delete"]');

    const reactionButtons = Array.from(menu.querySelectorAll("[data-chat-msg-reaction]"));
    reactionButtons.forEach(function (btn) {
      const raw = String(btn.getAttribute("data-chat-msg-reaction") || "").trim();
      if (!raw) return;
      setEmojiGlyph(btn, raw, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
    });
  }

  function hideContextMenu() {
    if (!contextMenuEl) return;
    contextMenuEl.classList.add("hidden");
    contextMenuEl.style.left = "";
    contextMenuEl.style.top = "";
    contextMenuMessageId = "";
  }

  function ensureDeleteConfirmUi() {
    if (deleteConfirmUi && deleteConfirmUi.overlay && deleteConfirmUi.overlay.isConnected) return deleteConfirmUi;

    const overlay = document.createElement("div");
    overlay.className = "chat-delete-confirm-overlay hidden";
    overlay.innerHTML =
      '<div class="chat-delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="shopCompanyDeleteConfirmTitle">' +
        '<div class="chat-delete-confirm-title" id="shopCompanyDeleteConfirmTitle">Удалить сообщение</div>' +
        '<div class="chat-delete-confirm-text" id="shopCompanyDeleteConfirmText">Вы точно хотите удалить это сообщение?</div>' +
        '<label class="chat-delete-confirm-check" for="shopCompanyDeleteConfirmForPeer">' +
          '<input class="chat-delete-confirm-checkbox" id="shopCompanyDeleteConfirmForPeer" type="checkbox" checked />' +
          '<span class="chat-delete-confirm-check-text" id="shopCompanyDeleteConfirmCheckText">Также удалить у собеседника</span>' +
        "</label>" +
        '<div class="chat-delete-confirm-actions">' +
          '<button type="button" class="chat-delete-confirm-btn chat-delete-confirm-btn--cancel" id="shopCompanyDeleteConfirmCancelBtn">ОТМЕНА</button>' +
          '<button type="button" class="chat-delete-confirm-btn chat-delete-confirm-btn--danger" id="shopCompanyDeleteConfirmDeleteBtn">УДАЛИТЬ</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    const ui = {
      overlay: overlay,
      title: overlay.querySelector("#shopCompanyDeleteConfirmTitle"),
      text: overlay.querySelector("#shopCompanyDeleteConfirmText"),
      check: overlay.querySelector("#shopCompanyDeleteConfirmForPeer"),
      checkText: overlay.querySelector("#shopCompanyDeleteConfirmCheckText"),
      cancelBtn: overlay.querySelector("#shopCompanyDeleteConfirmCancelBtn"),
      deleteBtn: overlay.querySelector("#shopCompanyDeleteConfirmDeleteBtn"),
    };

    overlay.addEventListener("click", function (event) {
      if (event.target !== overlay) return;
      closeDeleteConfirm();
    });
    if (ui.cancelBtn) ui.cancelBtn.addEventListener("click", closeDeleteConfirm);
    if (ui.deleteBtn) {
      ui.deleteBtn.addEventListener("click", function () {
        const pending = pendingDeleteConfirm;
        const deleteForPeer = !!(ui.check && ui.check.checked);
        closeDeleteConfirm();
        if (!pending || typeof pending.onConfirm !== "function") return;
        pending.onConfirm({ deleteForPeer: deleteForPeer });
      });
    }

    deleteConfirmUi = ui;
    return ui;
  }

  function closeDeleteConfirm() {
    const ui = ensureDeleteConfirmUi();
    pendingDeleteConfirm = null;
    if (deleteConfirmCloseTimer) {
      clearTimeout(deleteConfirmCloseTimer);
      deleteConfirmCloseTimer = 0;
    }
    ui.overlay.classList.remove("is-open");
    deleteConfirmCloseTimer = window.setTimeout(function () {
      ui.overlay.classList.add("hidden");
      deleteConfirmCloseTimer = 0;
    }, 140);
  }

  function getMessagesWord(count) {
    const n = Math.abs(Number(count || 0)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return "сообщений";
    if (n1 > 1 && n1 < 5) return "сообщения";
    if (n1 === 1) return "сообщение";
    return "сообщений";
  }

  function openDeleteConfirm(options) {
    const ui = ensureDeleteConfirmUi();
    if (deleteConfirmCloseTimer) {
      clearTimeout(deleteConfirmCloseTimer);
      deleteConfirmCloseTimer = 0;
    }

    const opts = options || {};
    const count = Math.max(1, Number(opts.count || 1));
    if (ui.title) ui.title.textContent = "Удалить " + count + " " + getMessagesWord(count);
    if (ui.text) ui.text.textContent = count === 1
      ? "Вы точно хотите удалить это сообщение?"
      : "Вы точно хотите удалить эти сообщения?";
    if (ui.checkText) ui.checkText.textContent = "Также удалить у собеседника";
    if (ui.check) ui.check.checked = true;

    pendingDeleteConfirm = {
      onConfirm: typeof opts.onConfirm === "function" ? opts.onConfirm : null,
    };

    ui.overlay.classList.remove("hidden");
    requestAnimationFrame(function () {
      ui.overlay.classList.add("is-open");
      if (ui.deleteBtn) ui.deleteBtn.focus();
    });
  }

  function positionFloatingBox(box, x, y, padding) {
    if (!box) return;
    const pad = Number(padding) || 8;
    box.classList.remove("hidden");
    const rect = box.getBoundingClientRect();
    const maxLeft = Math.max(pad, window.innerWidth - rect.width - pad);
    const maxTop = Math.max(pad, window.innerHeight - rect.height - pad);
    const left = Math.min(Math.max(pad, Number(x) || 0), maxLeft);
    const top = Math.min(Math.max(pad, Number(y) || 0), maxTop);
    box.style.left = Math.round(left) + "px";
    box.style.top = Math.round(top) + "px";
  }

  function showMessageContextMenu(x, y, messageId) {
    const id = String(messageId || "");
    const entry = findMessageEntry(id);
    if (!id || !entry) return;

    ensureContextMenu();
    contextMenuMessageId = id;

    const canManageOwnMessage = entry.role === "user";
    if (contextMenuEditBtn) contextMenuEditBtn.classList.toggle("hidden", !canManageOwnMessage);
    if (contextMenuDeleteBtn) contextMenuDeleteBtn.classList.toggle("hidden", !canManageOwnMessage);

    hideEmojiPopover();
    positionFloatingBox(contextMenuEl, x, y, 8);
    hideReactionBar();
  }

  function scrollToMessage(messageId) {
    const id = String(messageId || "");
    if (!id) return;
    const messageNode = thread.querySelector('[data-message-id="' + cssEscape(id) + '"]');
    if (!messageNode) return;
    messageNode.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    messageNode.classList.add("is-reply-highlight");
    window.setTimeout(function () {
      messageNode.classList.remove("is-reply-highlight");
    }, 620);
  }

  function toggleSelectedMessage(messageId) {
    const id = String(messageId || "");
    if (!id) return;
    if (selectedMessageIds.has(id)) selectedMessageIds.delete(id);
    else selectedMessageIds.add(id);

    const prevTop = feed.scrollTop;
    const keepBottom = shouldKeepFeedPinnedToBottom();
    renderThread();
    if (keepBottom) {
      scrollToBottom(false);
    } else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }
  }

  function removeMessageById(messageId) {
    const id = String(messageId || "");
    if (!id) return false;
    const entry = findMessageEntry(id);
    if (!entry || entry.role !== "user") return false;

    let removed = false;
    let removedFromLive = false;
    for (let i = liveEntries.length - 1; i >= 0; i -= 1) {
      if (String(liveEntries[i] && liveEntries[i].id || "") === id) {
        liveEntries.splice(i, 1);
        removed = true;
        removedFromLive = true;
      }
    }

    for (let i = baseEntries.length - 1; i >= 0; i -= 1) {
      if (String(baseEntries[i] && baseEntries[i].id || "") === id) {
        baseEntries.splice(i, 1);
        removed = true;
      }
    }

    if (!removed) return false;

    setMessageHiddenLocally(id, false, { persist: false });
    selectedMessageIds.delete(id);
    if (String(replyDraft && replyDraft.id || "") === id) clearReplyDraft();
    if (String(editingMessageId || "") === id) {
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({ stickToBottom: true });
    }
    if (reactionMessageId === id) hideReactionBar();
    if (contextMenuMessageId === id) hideContextMenu();

    const prevTop = feed.scrollTop;
    const keepBottom = shouldKeepFeedPinnedToBottom();
    renderThread();
    if (keepBottom) {
      scrollToBottom(false);
    } else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }
    if (removedFromLive) queueSharedThreadSave();
    saveLocalHiddenMessageIds();
    return true;
  }

  function createDayNode(dayLabel) {
    const node = document.createElement("div");
    node.className = "shop-company-chat-day";
    node.textContent = dayLabel;
    return node;
  }

  function createWelcomeNode(text) {
    const node = document.createElement("div");
    node.className = "shop-company-chat-welcome";
    node.textContent = text;
    return node;
  }

  function createMessageNode(entry) {
    const row = document.createElement("div");
    row.className = "shop-company-chat-row is-" + (entry.role || "agent");
    if (entry.editedAt) row.classList.add("is-edited");
    row.dataset.messageId = String(entry.id || "");
    if (selectedMessageIds.has(String(entry.id || ""))) {
      row.classList.add("is-selected");
    }

    const selectBadge = document.createElement("span");
    selectBadge.className = "shop-company-chat-select-badge";
    selectBadge.setAttribute("aria-hidden", "true");
    selectBadge.innerHTML = '<i class="fas fa-check"></i>';

    const bubble = document.createElement("div");
    bubble.className = "shop-company-chat-bubble";
    bubble.dataset.messageId = String(entry.id || "");

    if (entry.author) {
      const author = document.createElement("div");
      author.className = "shop-company-chat-author";
      author.textContent = entry.author;
      bubble.appendChild(author);
    }

    const reply = entry.replyTo && typeof entry.replyTo === "object" ? entry.replyTo : null;
    if (reply && reply.text) {
      const snippet = document.createElement("div");
      snippet.className = "shop-company-chat-reply-snippet";
      if (reply.id) {
        snippet.dataset.replyJumpId = String(reply.id);
        snippet.setAttribute("role", "button");
        snippet.tabIndex = 0;
      }

      const snippetName = document.createElement("div");
      snippetName.className = "shop-company-chat-reply-name";
      snippetName.textContent = String(reply.sender || "Сообщение");
      snippet.appendChild(snippetName);

      const snippetLine = document.createElement("div");
      snippetLine.className = "shop-company-chat-reply-line";
      renderEmojiMessageText(
        snippetLine,
        getReplyPreviewText(reply.text || ""),
        "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--preview"
      );
      snippet.appendChild(snippetLine);
      bubble.appendChild(snippet);
    }

    const imageAttachment = getEntryImageAttachment(entry);
    const hasImageAttachment = !!imageAttachment;
    const hasText = String(entry.text || "").trim().length > 0;
    if (hasImageAttachment) {
      const attachmentWrap = document.createElement("div");
      attachmentWrap.className = "shop-company-chat-attachment";
      const img = document.createElement("img");
      img.className = "shop-company-chat-attachment-image";
      img.src = String(imageAttachment.dataUrl || "");
      img.alt = String(imageAttachment.name || "Фото");
      img.loading = "lazy";
      img.decoding = "async";
      attachmentWrap.appendChild(img);
      bubble.appendChild(attachmentWrap);
    }

    const text = document.createElement("div");
    text.className = "shop-company-chat-text";
    renderEmojiMessageText(text, entry.text || "", "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--inline");
    const emojiOnlyInfo = getEmojiOnlyInfo(entry.text || "");
    if (hasText) {
      bubble.appendChild(text);
    }
    if (hasImageAttachment) {
      bubble.classList.add("has-attachment");
      if (!hasText) bubble.classList.add("has-attachment-only");
    }
    if (emojiOnlyInfo.isEmojiOnly && !reply && !hasImageAttachment) {
      bubble.classList.add("is-emoji-only");
      if (emojiOnlyInfo.count <= 1) bubble.classList.add("is-emoji-only-single");
      else if (emojiOnlyInfo.count <= 3) bubble.classList.add("is-emoji-only-few");
      else bubble.classList.add("is-emoji-only-many");
    }

    if (entry.time) {
      const meta = document.createElement("div");
      meta.className = "shop-company-chat-meta";

      const time = document.createElement("span");
      time.className = "shop-company-chat-time";
      time.textContent = entry.time;
      meta.appendChild(time);

      if (entry.role === "user") {
        const status = getOutgoingDeliveryStatus(entry);
        const statusEl = document.createElement("span");
        statusEl.className = "shop-company-chat-status shop-company-chat-status--" + status;
        statusEl.setAttribute("aria-label", status === "read" ? "Прочитано" : status === "delivered" ? "Доставлено" : "Отправлено");
        statusEl.innerHTML = getOutgoingStatusIconMarkup(status);
        meta.appendChild(statusEl);
      }

      bubble.appendChild(meta);
    }

    if (entry.reaction) {
      bubble.classList.add("has-reaction");
      const reaction = document.createElement("button");
      reaction.type = "button";
      reaction.className = "shop-company-chat-reaction-pill";
      reaction.dataset.messageId = String(entry.id || "");
      reaction.title = "Изменить реакцию";
      reaction.dataset.reactionValue = String(entry.reaction);
      reaction.setAttribute("aria-label", String(entry.reaction));
      setEmojiGlyph(reaction, entry.reaction, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--pill");
      bubble.appendChild(reaction);
    }

    row.appendChild(selectBadge);
    row.appendChild(bubble);
    return row;
  }

  function createOptionsNode(entry) {
    const row = document.createElement("div");
    row.className = "shop-company-chat-row is-agent";

    const bubble = document.createElement("div");
    bubble.className = "shop-company-chat-bubble shop-company-chat-bubble--options";

    const text = document.createElement("div");
    text.className = "shop-company-chat-text";
    text.textContent = entry.text || "";
    bubble.appendChild(text);

    const optionsWrap = document.createElement("div");
    optionsWrap.className = "shop-company-chat-quick";

    (entry.options || []).forEach(function (label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-company-chat-quick__btn";
      btn.dataset.quickLabel = label;
      btn.textContent = label;
      optionsWrap.appendChild(btn);
    });

    bubble.appendChild(optionsWrap);

    if (entry.time) {
      const time = document.createElement("div");
      time.className = "shop-company-chat-time";
      time.textContent = entry.time;
      bubble.appendChild(time);
    }

    row.appendChild(bubble);
    return row;
  }

  function renderEntry(entry) {
    if (entry.type === "welcome") {
      return createWelcomeNode(entry.text || "");
    }

    if (entry.type === "options") {
      return createOptionsNode(entry);
    }

    return createMessageNode(entry);
  }

  function renderThread() {
    const entries = getAllEntries();
    thread.innerHTML = "";

    let prevDay = null;
    entries.forEach(function (entry) {
      if (entry.day && entry.day !== prevDay) {
        thread.appendChild(createDayNode(entry.day));
        prevDay = entry.day;
      }
      thread.appendChild(renderEntry(entry));
    });

    if (reactionMessageId) {
      const exists = Array.from(thread.querySelectorAll("[data-message-id]")).some(function (el) {
        return String(el.dataset.messageId || "") === reactionMessageId;
      });
      if (!exists) hideReactionBar();
    }

    if (contextMenuMessageId) {
      const exists = Array.from(thread.querySelectorAll("[data-message-id]")).some(function (el) {
        return String(el.dataset.messageId || "") === contextMenuMessageId;
      });
      if (!exists) {
        hideContextMenu();
        hideReactionBar();
      }
    }

    updateScrollDownButton();
  }

  function hideReactionBar() {
    reactionBar.classList.add("hidden");
    setReactionBarExpanded(false);
    reactionBar.style.left = "";
    reactionBar.style.top = "";
    reactionMessageId = "";
  }

  function hideEmojiPopover() {
    emojiPopover.classList.add("hidden");
  }

  function renderEmojiPicker() {
    emojiPopover.innerHTML = "";
    EMOJIS.forEach(function (emoji) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-company-chat-emoji-btn";
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--picker");
      btn.addEventListener("click", function () {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        input.focus();
        const pos = start + emoji.length;
        input.setSelectionRange(pos, pos);
        syncComposerRichPreview({ stickToBottom: true });
      });
      emojiPopover.appendChild(btn);
    });
  }

  function normalizeQuickReactionButtons() {
    const quickBtns = Array.from(reactionBar.querySelectorAll('[data-reaction-slot="quick"]'));
    quickBtns.forEach(function (btn, index) {
      const emoji = QUICK_REACTIONS[index] || QUICK_REACTIONS[QUICK_REACTIONS.length - 1];
      btn.setAttribute("data-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
    });

    const extraBtns = Array.from(reactionBar.querySelectorAll('[data-reaction-slot="extra"]'));
    extraBtns.forEach(function (btn, index) {
      const emoji = EXTRA_REACTIONS[index] || EXTRA_REACTIONS[EXTRA_REACTIONS.length - 1];
      btn.setAttribute("data-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
    });
  }

  function setReactionBarExpanded(expanded) {
    const isExpanded = !!expanded;
    reactionBar.classList.toggle("is-expanded", isExpanded);
    const toggleBtn = reactionBar.querySelector('[data-reaction="__toggle_more__"]');
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", isExpanded ? "Скрыть дополнительные реакции" : "Показать ещё реакции");
  }

  function decorateComposerEmojiControls() {
    if (emojiBtn) {
      setEmojiGlyph(emojiBtn, "\u{1F642}", "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--composer");
      emojiBtn.setAttribute("aria-label", "Эмодзи");
      emojiBtn.title = "Эмодзи";
    }

    Array.from(composer.querySelectorAll("button")).forEach(function (btn) {
      if (btn === emojiBtn) return;
      const raw = String(btn.getAttribute("data-emoji") || btn.textContent || "").trim();
      if (!raw) return;
      const emojiOnlyInfo = getEmojiOnlyInfo(raw);
      if (!emojiOnlyInfo.isEmojiOnly) return;
      btn.classList.add("has-emoji-content");
      if (emojiOnlyInfo.count === 1) {
        setEmojiGlyph(btn, raw, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--composer");
      } else {
        renderEmojiMessageText(btn, raw, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--composer-inline");
      }
      btn.setAttribute("aria-label", raw);
      if (!btn.title) btn.title = raw;
    });
  }

  function shouldKeepFeedPinnedToBottom() {
    if (!feed) return false;
    return (feed.scrollHeight - feed.scrollTop - feed.clientHeight) <= 28;
  }

  function syncComposerRichPreview(options) {
    if (!input || typeof input.__syncEmojiPreview !== "function") return;
    input.__syncEmojiPreview(options || {});
  }

  function setupComposerRichPreview() {
    if (!input) return;
    if (input.dataset.emojiPreviewReady === "1") return;
    const parent = input.parentElement;
    if (!parent) return;

    const wrap = document.createElement("div");
    wrap.className = "shop-company-chat-input-rich-wrap";
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);

    const preview = document.createElement("div");
    preview.className = "shop-company-chat-input-rich-preview hidden";
    preview.setAttribute("aria-hidden", "true");
    wrap.appendChild(preview);

    const sync = function (options) {
      const opts = options || {};
      const keepPinned = shouldKeepFeedPinnedToBottom();
      const stickToBottom = opts.stickToBottom === true;

      const inputStyles = window.getComputedStyle(input);
      const minHeight = parseFloat(inputStyles.minHeight) || 38;
      const maxHeight = parseFloat(inputStyles.maxHeight) || 160;

      input.style.height = "auto";
      const fullHeight = input.scrollHeight || minHeight;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, fullHeight));
      input.style.height = nextHeight + "px";
      input.style.overflowY = fullHeight > maxHeight + 1 ? "auto" : "hidden";

      const value = String(input.value || "");
      if (!value || !hasEmojiInText(value)) {
        preview.classList.add("hidden");
        preview.textContent = "";
        input.classList.remove("is-rich-emoji-preview");
        if (stickToBottom || keepPinned) scrollToBottom(false);
        return;
      }

      preview.classList.remove("hidden");
      input.classList.add("is-rich-emoji-preview");
      renderEmojiMessageText(preview, value, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--input-inline");
      preview.style.transform = "translate(" + (-Math.max(0, input.scrollLeft)) + "px, " + (-Math.max(0, input.scrollTop)) + "px)";

      if (stickToBottom || keepPinned) scrollToBottom(false);
    };

    input.__syncEmojiPreview = sync;
    input.addEventListener("input", function () {
      sync({ stickToBottom: true });
    });
    ["scroll", "click", "keyup", "focus", "blur"].forEach(function (eventName) {
      input.addEventListener(eventName, function () {
        sync({});
      });
    });
    window.addEventListener("resize", function () { sync({}); });

    input.dataset.emojiPreviewReady = "1";
    sync({ stickToBottom: true });
  }

  function updateReactionBarActiveButton(messageId) {
    const entry = findMessageEntry(messageId);
    const current = entry && entry.reaction ? String(entry.reaction) : "";
    const buttons = Array.from(reactionBar.querySelectorAll("[data-reaction]"));
    buttons.forEach(function (btn) {
      const reaction = btn.getAttribute("data-reaction") || "";
      if (reaction === "__toggle_more__") return;
      btn.classList.toggle("is-active", current === reaction);
    });
  }

  function positionReactionBar(anchorEl) {
    if (!anchorEl) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const barRect = reactionBar.getBoundingClientRect();

    let top = anchorRect.top - barRect.height - 8;
    if (top < 8) top = anchorRect.bottom + 8;

    const minLeft = 8;
    const maxLeft = Math.max(8, window.innerWidth - barRect.width - 8);
    let left = anchorRect.right - barRect.width;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    reactionBar.style.left = Math.round(left) + "px";
    reactionBar.style.top = Math.round(top) + "px";
  }

  function showReactionBar(messageId, anchorEl) {
    const id = String(messageId || "");
    if (!id || !anchorEl) return;
    reactionMessageId = id;
    setReactionBarExpanded(false);
    reactionBar.classList.remove("hidden");
    updateReactionBarActiveButton(id);
    positionReactionBar(anchorEl);
  }

  function toggleReaction(messageId, reaction) {
    const entry = findMessageEntry(messageId);
    if (!entry) return;

    const next = String(reaction || "").trim();
    if (!next) return;
    const currentNormalized = normalizeReactionValue(entry.reaction);
    const nextNormalized = normalizeReactionValue(next);
    entry.reaction = currentNormalized === nextNormalized ? "" : next;

    const prevTop = feed.scrollTop;
    renderThread();
    feed.scrollTop = prevTop;
    updateScrollDownButton();
    if (liveEntries.some(function (item) { return String(item.id || "") === String(messageId || ""); })) {
      queueSharedThreadSave();
    }
  }

  function setMessageDeliveryStatus(messageId, nextStatus) {
    const entry = findMessageEntry(messageId);
    if (!entry || entry.role !== "user") return false;

    const target = String(nextStatus || "").toLowerCase();
    if (!["sent", "delivered", "read"].includes(target)) return false;

    const current = getOutgoingDeliveryStatus(entry);
    if (getDeliveryStatusRank(target) <= getDeliveryStatusRank(current)) return false;

    entry.deliveryStatus = target;
    if (target === "delivered" && !entry.deliveredAt) entry.deliveredAt = new Date().toISOString();
    if (target === "read" && !entry.readAt) entry.readAt = new Date().toISOString();

    const prevTop = feed.scrollTop;
    const wasNearBottom = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 40;
    renderThread();
    if (wasNearBottom) {
      scrollToBottom(false);
    } else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }
    if (liveEntries.some(function (item) { return String(item.id || "") === String(messageId || ""); })) {
      queueSharedThreadSave();
    }
    return true;
  }

  function scheduleOutgoingDeliveryProgress(messageId) {
    const id = String(messageId || "");
    if (!id) return;

    window.setTimeout(function () {
      setMessageDeliveryStatus(id, "delivered");
    }, 700);
  }

  function loadOlderMessages(batchSize, keepScrollPosition) {
    if (isLoadingOlder || visibleStart === 0) return;

    isLoadingOlder = true;
    const prevHeight = feed.scrollHeight;
    const prevTop = feed.scrollTop;

    const nextStart = Math.max(0, visibleStart - batchSize);
    visibleStart = nextStart;
    renderThread();

    if (keepScrollPosition) {
      const nextHeight = feed.scrollHeight;
      feed.scrollTop = prevTop + (nextHeight - prevHeight);
    }

    isLoadingOlder = false;
  }

  function scrollToBottom(smooth) {
    feed.scrollTo({
      top: feed.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    updateScrollDownButton();
  }

  function updateScrollDownButton() {
    const hiddenDistance = feed.scrollHeight - feed.clientHeight - feed.scrollTop;
    scrollDownBtn.classList.toggle("hidden", hiddenDistance < 120);
  }

  function pushLiveMessage(role, text, options) {
    const opts = options || {};
    const trimmed = String(text || "").trim();
    const attachment = isImageAttachment(opts.attachment) ? opts.attachment : null;
    if (!trimmed && !attachment) return;
    const replyTo = opts.replyTo && opts.replyTo.id
      ? {
          id: String(opts.replyTo.id),
          sender: String(opts.replyTo.sender || ""),
          text: String(opts.replyTo.text || ""),
        }
      : null;

    messageSeq += 1;
    const createdAt = new Date().toISOString();
    const direction = role === "user" ? "in" : "out";
    const status = role === "user" ? "sent" : "";
    const message = {
      id: String(opts.messageId || (Date.now() + "-" + messageSeq + "-" + Math.random().toString(36).slice(2, 7))),
      type: "message",
      role: role,
      day: formatDayLabelFromIso(createdAt),
      time: formatTimeFromIso(createdAt),
      text: trimmed,
      attachment: attachment,
      author: role === "agent" ? "Лия" : "",
      replyTo: replyTo,
      deliveryStatus: status,
      createdAt: createdAt,
      read: role === "user" ? false : true,
      deliveredAt: "",
      readAt: "",
      _sharedDirection: direction,
    };

    liveEntries.push(message);

    renderThread();
    scrollToBottom(true);
    queueSharedThreadSave();

    if (role === "user") {
      scheduleOutgoingDeliveryProgress(message.id);
    }
  }

  function sendUserMessage(text, options) {
    const opts = options || {};
    const trimmed = String(text || "").trim();
    const attachment = isImageAttachment(opts.attachment) ? opts.attachment : null;

    if (editingMessageId) {
      const done = updateMessageTextById(editingMessageId, trimmed);
      if (!done) return false;
      cancelEditingMessage();
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      return true;
    }

    if (!trimmed && !attachment) return false;

    const replySnapshot = replyDraft && replyDraft.id
      ? {
          id: String(replyDraft.id),
          sender: String(replyDraft.sender || ""),
          text: String(replyDraft.text || ""),
        }
      : null;

    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    pushLiveMessage("user", trimmed, { replyTo: replySnapshot, attachment: attachment });
    clearReplyDraft();
    return true;
  }

  async function sendImageAttachments(files) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return 0;
    if (editingMessageId) cancelEditingMessage();

    const replySnapshot = replyDraft && replyDraft.id
      ? {
          id: String(replyDraft.id),
          sender: String(replyDraft.sender || ""),
          text: String(replyDraft.text || ""),
        }
      : null;

    let sent = 0;
    for (const file of list) {
      // eslint-disable-next-line no-await-in-loop
      const attachment = await buildImageAttachmentFromFile(file).catch(function () { return null; });
      if (!attachment) continue;
      pushLiveMessage("user", "", {
        replyTo: sent === 0 ? replySnapshot : null,
        attachment: attachment,
      });
      sent += 1;
    }

    if (sent > 0) {
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      clearReplyDraft();
    }
    return sent;
  }

  renderEmojiPicker();
  normalizeQuickReactionButtons();
  decorateComposerEmojiControls();
  setupComposerRichPreview();
  probeEmojiAssetsAvailability();
  renderUnreadBadge(liveEntries);
  pullSharedThreadFromServer({ force: true }).catch(function () {});
  startSharedThreadPolling();

  openBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    openCompanyChat();
  });

  closeBtn.addEventListener("click", function (event) {
    event.preventDefault();
    closeCompanyChat();
  });

  overlay.addEventListener("click", function (event) {
    if (event.target === overlay) {
      closeCompanyChat();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (contextMenuEl && !contextMenuEl.classList.contains("hidden")) {
      hideContextMenu();
      hideReactionBar();
      return;
    }
    if (!reactionBar.classList.contains("hidden")) {
      hideReactionBar();
      return;
    }
    if (!emojiPopover.classList.contains("hidden")) {
      hideEmojiPopover();
      return;
    }
    if (overlay.classList.contains("is-open")) {
      closeCompanyChat();
    }
  });

  function clearTouchGesture() {
    if (!touchGesture) return;
    if (touchGesture.longPressTimer) {
      clearTimeout(touchGesture.longPressTimer);
      touchGesture.longPressTimer = 0;
    }
    if (touchGesture.bubble) {
      touchGesture.bubble.classList.remove("is-swipe-active", "is-swipe-returning");
      touchGesture.bubble.style.transform = "";
    }
    touchGesture = null;
  }

  ensureContextMenu();
  renderReplyDraftUi();

  if (contextMenuEl) {
    contextMenuEl.addEventListener("click", function (event) {
      const reactionBtn = event.target.closest("[data-chat-msg-reaction]");
      if (reactionBtn) {
        const messageId = contextMenuMessageId;
        const reaction = String(reactionBtn.getAttribute("data-chat-msg-reaction") || "").trim();
        if (!messageId || !reaction) return;
        toggleReaction(messageId, reaction);
        hideContextMenu();
        hideReactionBar();
        return;
      }

      const actionBtn = event.target.closest("[data-chat-msg-action]");
      if (!actionBtn) return;
      const action = String(actionBtn.getAttribute("data-chat-msg-action") || "");
      const messageId = contextMenuMessageId;
      hideContextMenu();
      hideReactionBar();
      if (!messageId) return;

      const msg = findMessageEntry(messageId);
      if (!msg) return;

      if (action === "reply") {
        setReplyByMessage(messageId);
        return;
      }
      if (action === "copy") {
        copyToClipboard(msg.text || "").catch(function () {});
        return;
      }
      if (action === "select") {
        toggleSelectedMessage(messageId);
        return;
      }
      if (action === "edit" && msg.role === "user") {
        startEditingMessage(messageId);
        return;
      }
      if (action === "delete" && msg.role === "user") {
        openDeleteConfirm({
          count: 1,
          onConfirm: function (payload) {
            const deleteForPeer = !(payload && payload.deleteForPeer === false);
            if (deleteForPeer) {
              removeMessageById(messageId);
              return;
            }
            hideMessageLocallyById(messageId);
          },
        });
      }
    });
  }

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    const done = sendUserMessage(input.value);
    if (!done) return;
    input.value = "";
    syncComposerRichPreview({ stickToBottom: true });
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const done = sendUserMessage(input.value);
      if (!done) return;
      input.value = "";
      syncComposerRichPreview({ stickToBottom: true });
      return;
    }

    if (event.key === "Escape" && editingMessageId) {
      event.preventDefault();
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({ stickToBottom: true });
      return;
    }

    if (event.key === "Escape" && replyDraft) {
      event.preventDefault();
      clearReplyDraft();
    }
  });

  attachBtn.addEventListener("click", function (event) {
    event.preventDefault();
    attachInput.click();
  });

  attachInput.addEventListener("change", async function () {
    const files = Array.from(attachInput.files || []);
    await sendImageAttachments(files).catch(function () {});
    attachInput.value = "";
    input.focus();
  });

  emojiBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    hideContextMenu();
    hideReactionBar();
    emojiPopover.classList.toggle("hidden");
    if (!emojiPopover.classList.contains("hidden")) {
      input.focus();
    }
  });

  thread.addEventListener("click", function (event) {
    if (Date.now() < suppressTapUntil) return;

    const replyJump = event.target.closest("[data-reply-jump-id]");
    if (replyJump) {
      scrollToMessage(replyJump.getAttribute("data-reply-jump-id") || "");
      return;
    }

    const quickButton = event.target.closest("[data-quick-label]");
    if (quickButton) {
      sendUserMessage(quickButton.dataset.quickLabel || "");
      return;
    }

    const reactionPill = event.target.closest(".shop-company-chat-reaction-pill");
    if (reactionPill) {
      const pillMessageId = reactionPill.dataset ? String(reactionPill.dataset.messageId || "") : "";
      const pillReaction = reactionPill.dataset ? String(reactionPill.dataset.reactionValue || "") : "";
      if (pillMessageId && pillReaction) {
        toggleReaction(pillMessageId, pillReaction);
      }
      hideContextMenu();
      hideReactionBar();
      return;
    }

    const messageBubble = event.target.closest(".shop-company-chat-bubble");
    const anchorEl = reactionPill || messageBubble;
    const messageId = anchorEl && anchorEl.dataset ? anchorEl.dataset.messageId : "";

    if (!anchorEl || !messageId) {
      hideContextMenu();
      hideReactionBar();
      return;
    }

    if (selectedMessageIds.size > 0) {
      toggleSelectedMessage(messageId);
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      return;
    }

    if (reactionMessageId === String(messageId) && !reactionBar.classList.contains("hidden")) {
      hideReactionBar();
      return;
    }

    hideContextMenu();
    hideEmojiPopover();
    showReactionBar(messageId, anchorEl);
  });

  thread.addEventListener("contextmenu", function (event) {
    const messageBubble = event.target.closest(".shop-company-chat-bubble[data-message-id]");
    if (!messageBubble) return;
    const messageId = messageBubble.getAttribute("data-message-id") || "";
    if (!messageId) return;

    event.preventDefault();
    suppressTapUntil = Date.now() + 260;
    showMessageContextMenu(event.clientX, event.clientY, messageId);
  });

  thread.addEventListener("dblclick", function (event) {
    const messageBubble = event.target.closest(".shop-company-chat-bubble[data-message-id]");
    if (!messageBubble) return;
    const messageId = String(messageBubble.getAttribute("data-message-id") || "");
    if (!messageId) return;

    const entry = findMessageEntry(messageId);
    if (!entry) return;

    const heartReaction = "\u{2764}\u{FE0F}";
    if (normalizeReactionValue(entry.reaction) === normalizeReactionValue(heartReaction)) {
      hideContextMenu();
      hideReactionBar();
      return;
    }

    toggleReaction(messageId, heartReaction);
    hideContextMenu();
    hideReactionBar();
  });

  thread.addEventListener("touchstart", function (event) {
    if (event.touches.length !== 1) {
      clearTouchGesture();
      return;
    }

    const bubble = event.target.closest(".shop-company-chat-bubble[data-message-id]");
    if (!bubble) {
      clearTouchGesture();
      return;
    }

    const messageId = String(bubble.getAttribute("data-message-id") || "");
    if (!messageId) {
      clearTouchGesture();
      return;
    }

    const touch = event.touches[0];
    clearTouchGesture();
    touchGesture = {
      messageId: messageId,
      bubble: bubble,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      swipeLocked: false,
      swipeRejected: false,
      swipeShift: 0,
      replyTriggered: false,
      longPressFired: false,
      longPressTimer: 0,
    };

    touchGesture.longPressTimer = window.setTimeout(function () {
      if (!touchGesture || touchGesture.messageId !== messageId) return;
      touchGesture.longPressFired = true;
      suppressTapUntil = Date.now() + 640;
      showMessageContextMenu(touchGesture.lastX, touchGesture.lastY, messageId);
    }, LONG_PRESS_MS);
  }, { passive: true });

  thread.addEventListener("touchmove", function (event) {
    if (!touchGesture || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const dx = touch.clientX - touchGesture.startX;
    const dy = touch.clientY - touchGesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    touchGesture.lastX = touch.clientX;
    touchGesture.lastY = touch.clientY;

    if ((absX > 8 || absY > 8) && touchGesture.longPressTimer) {
      clearTimeout(touchGesture.longPressTimer);
      touchGesture.longPressTimer = 0;
    }

    if (touchGesture.longPressFired) return;
    if (touchGesture.swipeRejected) return;

    if (!touchGesture.swipeLocked) {
      if (absX < 10 && absY < 10) return;
      if (absY > absX || dx <= 0) {
        touchGesture.swipeRejected = true;
        return;
      }
      touchGesture.swipeLocked = true;
    }

    event.preventDefault();
    const shift = Math.max(0, Math.min(96, dx));
    touchGesture.swipeShift = shift;
    touchGesture.bubble.classList.add("is-swipe-active");
    touchGesture.bubble.style.transform = "translateX(" + shift + "px)";

    if (shift >= SWIPE_REPLY_TRIGGER && !touchGesture.replyTriggered) {
      touchGesture.replyTriggered = true;
      suppressTapUntil = Date.now() + 560;
      setReplyByMessage(touchGesture.messageId);
      if (navigator.vibrate && typeof navigator.vibrate === "function") {
        navigator.vibrate(14);
      }
    }
  }, { passive: false });

  thread.addEventListener("touchend", function () {
    if (!touchGesture) return;

    if (touchGesture.longPressTimer) {
      clearTimeout(touchGesture.longPressTimer);
      touchGesture.longPressTimer = 0;
    }

    if (touchGesture.swipeShift > 0 && touchGesture.bubble) {
      const bubble = touchGesture.bubble;
      bubble.classList.add("is-swipe-returning");
      bubble.style.transform = "";
      window.setTimeout(function () {
        bubble.classList.remove("is-swipe-active", "is-swipe-returning");
      }, 170);
    }

    if (touchGesture.longPressFired || touchGesture.replyTriggered) {
      suppressTapUntil = Math.max(suppressTapUntil, Date.now() + 420);
    }

    touchGesture = null;
  }, { passive: true });

  thread.addEventListener("touchcancel", function () {
    clearTouchGesture();
  }, { passive: true });

  reactionBar.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-reaction]");
    if (!btn) return;
    const reaction = String(btn.getAttribute("data-reaction") || "");
    if (!reaction) return;
    if (reaction === "__toggle_more__") {
      const nextExpanded = !reactionBar.classList.contains("is-expanded");
      setReactionBarExpanded(nextExpanded);
      if (reactionMessageId) {
        const anchor = thread.querySelector('[data-message-id="' + cssEscape(reactionMessageId) + '"]');
        if (anchor) positionReactionBar(anchor);
      }
      return;
    }
    if (!reactionMessageId) return;
    toggleReaction(reactionMessageId, reaction);
    hideContextMenu();
    hideReactionBar();
  });

  feed.addEventListener("scroll", function () {
    hideContextMenu();
    if (!reactionBar.classList.contains("hidden")) {
      hideReactionBar();
    }
    if (!emojiPopover.classList.contains("hidden")) {
      hideEmojiPopover();
    }
    updateScrollDownButton();
    if (feed.scrollTop <= 28) {
      loadOlderMessages(OLDER_BATCH, true);
    }
  });

  scrollDownBtn.addEventListener("click", function () {
    scrollToBottom(true);
  });

  document.addEventListener("click", function (event) {
    if (Date.now() < suppressTapUntil) {
      const insideOverlay = overlay.contains(event.target);
      if (insideOverlay) return;
    }

    const insideEmojiPopover = emojiPopover.contains(event.target);
    const insideEmojiBtn = emojiBtn.contains(event.target);
    if (!insideEmojiPopover && !insideEmojiBtn) {
      hideEmojiPopover();
    }

    if (contextMenuEl && !contextMenuEl.classList.contains("hidden")) {
      const insideMenu = contextMenuEl.contains(event.target);
      const insideBar = reactionBar.contains(event.target);
      if (!insideMenu && !insideBar) {
        hideContextMenu();
        hideReactionBar();
      }
      return;
    }

    if (!reactionBar.classList.contains("hidden")) {
      const insideBar = reactionBar.contains(event.target);
      const insideMessage = event.target.closest(".shop-company-chat-bubble") || event.target.closest(".shop-company-chat-reaction-pill");
      if (!insideBar && !insideMessage) {
        hideReactionBar();
      }
    }
  });

  document.addEventListener("contextmenu", function (event) {
    if (!contextMenuEl || contextMenuEl.classList.contains("hidden")) return;
    const insideMenu = contextMenuEl.contains(event.target);
    const insideBar = reactionBar.contains(event.target);
    const insideMessage = event.target.closest(".shop-company-chat-bubble[data-message-id]");
    if (!insideMenu && !insideBar && !insideMessage) {
      hideContextMenu();
      hideReactionBar();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (pendingDeleteConfirm) {
      event.preventDefault();
      closeDeleteConfirm();
      return;
    }
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    if (selectedMessageIds.size > 0) {
      selectedMessageIds.clear();
      renderThread();
      return;
    }
    if (replyDraft) clearReplyDraft();
    if (editingMessageId) {
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({ stickToBottom: true });
    }
  });

  window.addEventListener("resize", function () {
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    clearTouchGesture();
  });
})();

