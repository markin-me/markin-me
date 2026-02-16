
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const CHAT_STORAGE_KEY = "dashboard:client-chat:v1";
  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const THREAD_SYNC_SAVE_DEBOUNCE_MS = 140;
  const THREAD_SYNC_ACTIVE_POLL_MS = 1800;
  const THREAD_SYNC_SUMMARY_POLL_MS = 5200;
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

  const dom = {
    left: {
      search: $("#chatClientsSearch"),
      list: $("#chatClientsList"),
      empty: $("#chatClientsEmpty"),
    },
    center: {
      stack: $(".chat-center-stack"),
      headerName: $("#chatHeaderName"),
      headerPhone: $("#chatHeaderPhone"),
      orderTitle: $("#chatOrderTitle"),
      orderStatus: $("#chatOrderStatus"),
      messagesWrap: $("#chatMessagesWrap"),
      messages: $("#chatMessages"),
      empty: $("#chatEmptyState"),
      attachInput: $("#chatAttachmentInput"),
      attachBtn: $("#chatAttachBtn"),
      emojiBtn: $("#chatEmojiBtn"),
      emojiPopover: $("#chatEmojiPopover"),
      input: $("#chatMessageInput"),
      sendBtn: $("#chatSendBtn"),
      replyBox: $("#chatComposerReply"),
      replyName: $("#chatComposerReplyName"),
      replyText: $("#chatComposerReplyText"),
      replyCloseBtn: $("#chatComposerReplyClose"),
      contextMenu: $("#chatMessageContextMenu"),
      reactionBar: $("#chatMessageReactionBar"),
      menuPinLabel: $("[data-chat-pin-label]"),
      menuEditAction: $("#chatMenuEditAction"),
      menuDeleteAction: $('[data-chat-msg-action="delete"]'),
      selectionBar: $("#chatSelectionToolbar"),
      selectionCount: $("#chatSelectionCount"),
      selectionCloseBtn: $("#chatSelectionCloseBtn"),
      selectionForwardBtn: $("#chatSelectionForwardBtn"),
      selectionDownloadBtn: $("#chatSelectionDownloadBtn"),
      selectionCopyBtn: $("#chatSelectionCopyBtn"),
      selectionDeleteBtn: $("#chatSelectionDeleteBtn"),
    },
  };

  const state = {
    clients: [],
    filteredClients: [],
    activeClientId: null,
    activeClient: null,
    activeOrders: [],
    q: "",
    requestToken: 0,
    editingMessageId: null,
    contextMessageId: null,
    replyDraft: null,
    deleteConfirmUi: null,
    pendingDeleteConfirm: null,
    deleteConfirmCloseTimer: 0,
    selectionMode: false,
    selectedMessageIds: new Set(),
    store: loadStore(),
    remoteThreadUpdatedAt: {},
    remoteSaveTimers: {},
    activeThreadPollTimer: 0,
    summariesPollTimer: 0,
  };

  function getClientsRightApi() {
    const api = window.__clientsDashboardApi;
    if (!api || typeof api.selectClientById !== "function") return null;
    return api;
  }

  function getTenantId() {
    const meta = document.querySelector('meta[name="tenant_id"]');
    if (meta && meta.content) {
      const n = Number(meta.content);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 1;
  }

  async function apiJson(url, opts = {}) {
    const tenantId = getTenantId();
    const token = localStorage.getItem("authToken");
    const storeId = localStorage.getItem("activeStoreId") || "1";
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": storeId,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("user");
      localStorage.removeItem("tenant");
      window.location.href = "/login";
      throw new Error("UNAUTHORIZED");
    }

    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) throw new Error(json?.error || `API_ERROR (${res.status})`);
    return json;
  }

  function normalizeClientIdKey(clientId) {
    const n = Number(clientId);
    if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
    return "";
  }

  function stableSerialize(value) {
    try {
      return JSON.stringify(value || []);
    } catch {
      return "[]";
    }
  }

  function getClientMetaForSync(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return {};
    const fromList = state.clients.find((client) => Number(client.id) === Number(key));
    if (fromList) {
      return {
        name: String(fromList.name || ""),
        phone: String(fromList.phone || ""),
      };
    }
    if (state.activeClient && Number(state.activeClient.id) === Number(key)) {
      return {
        name: String(state.activeClient.name || ""),
        phone: String(state.activeClient.phone || ""),
      };
    }
    return {};
  }

  async function fetchRemoteThreadSnapshot(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}`);
    const payload = json?.data || {};
    return {
      clientId: Number(key),
      updatedAt: String(payload.updated_at || ""),
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
    };
  }

  function applyRemoteThreadSnapshot(snapshot, options = {}) {
    if (!snapshot || !Number.isFinite(Number(snapshot.clientId))) return false;
    const key = normalizeClientIdKey(snapshot.clientId);
    if (!key) return false;
    const next = Array.isArray(snapshot.messages) ? snapshot.messages : [];
    const prev = Array.isArray(state.store.threads[key]) ? state.store.threads[key] : [];
    const same = stableSerialize(prev) === stableSerialize(next);

    state.remoteThreadUpdatedAt[key] = String(snapshot.updatedAt || "");
    let hiddenChanged = pruneHiddenMessageIds(key);
    if (same) {
      let changed = markThreadDelivered(key);
      if (Number(state.activeClientId) === Number(key) && !options.skipReadMark) {
        const readChanged = markThreadRead(key);
        changed = readChanged || changed;
        if (readChanged) renderMessages();
      }
      const finalChanged = changed || hiddenChanged;
      if (finalChanged) applyClientFilter();
      return finalChanged;
    }

    state.store.threads[key] = next;
    saveStore();
    pruneHiddenMessageIds(key);
    markThreadDelivered(key);

    if (Number(state.activeClientId) === Number(key)) {
      if (!options.skipReadMark) markThreadRead(key);
      renderMessages();
    }
    applyClientFilter();
    return true;
  }

  async function pushThreadToRemote(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const thread = getThread(key);
    const meta = getClientMetaForSync(key);
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { messages: thread, meta },
    });
    const updatedAt = String(json?.data?.updated_at || "");
    if (updatedAt) state.remoteThreadUpdatedAt[key] = updatedAt;
  }

  function queueThreadSaveToRemote(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const prev = state.remoteSaveTimers[key];
    if (prev) clearTimeout(prev);
    state.remoteSaveTimers[key] = window.setTimeout(() => {
      delete state.remoteSaveTimers[key];
      pushThreadToRemote(key).catch(console.error);
    }, THREAD_SYNC_SAVE_DEBOUNCE_MS);
  }

  async function pullThreadFromRemote(clientId, options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const snapshot = await fetchRemoteThreadSnapshot(key);
    if (!snapshot) return false;
    return applyRemoteThreadSnapshot(snapshot, options);
  }

  async function loadRemoteChatClients() {
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/clients`);
    return Array.isArray(json?.data) ? json.data : [];
  }

  function mergeRemoteClients(localRows, remoteRows) {
    const merged = new Map();
    (Array.isArray(localRows) ? localRows : []).forEach((row) => {
      const key = normalizeClientIdKey(row?.id);
      if (!key) return;
      merged.set(key, { ...row });
    });

    (Array.isArray(remoteRows) ? remoteRows : []).forEach((remote) => {
      const key = normalizeClientIdKey(remote?.client_id);
      if (!key) return;
      const existing = merged.get(key);
      if (existing) return;

      const meta = remote?.meta && typeof remote.meta === "object" ? remote.meta : {};
      const updatedAt = String(remote?.updated_at || remote?.last_message_at || "");
      merged.set(key, {
        id: Number(key),
        name: String(meta.name || `Клиент #${key}`),
        phone: String(meta.phone || ""),
        total_orders: 0,
        created_at: updatedAt || new Date().toISOString(),
        updated_at: updatedAt || new Date().toISOString(),
        last_order_date: updatedAt || null,
        _isVirtualChatClient: true,
      });
    });

    return Array.from(merged.values());
  }

  async function pullRemoteSummaries(clientIds) {
    const ids = (Array.isArray(clientIds) ? clientIds : [])
      .map((id) => normalizeClientIdKey(id))
      .filter(Boolean);
    if (!ids.length) return false;

    const qs = new URLSearchParams();
    qs.set("client_ids", ids.join(","));
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/summaries?${qs.toString()}`);
    const rows = Array.isArray(json?.data) ? json.data : [];
    const changedIds = rows
      .map((row) => ({
        key: normalizeClientIdKey(row?.client_id),
        updatedAt: String(row?.updated_at || ""),
      }))
      .filter((row) => row.key)
      .filter((row) => state.remoteThreadUpdatedAt[row.key] !== row.updatedAt)
      .map((row) => row.key);

    if (!changedIds.length) return false;
    let changed = false;
    for (const id of changedIds) {
      // eslint-disable-next-line no-await-in-loop
      const pulled = await pullThreadFromRemote(id, { skipReadMark: Number(state.activeClientId) === Number(id) });
      if (pulled) changed = true;
    }
    return changed;
  }

  function startRemoteSyncLoops() {
    if (!state.activeThreadPollTimer) {
      state.activeThreadPollTimer = window.setInterval(() => {
        if (!state.activeClientId) return;
        pullThreadFromRemote(state.activeClientId, { skipReadMark: false }).catch(console.error);
      }, THREAD_SYNC_ACTIVE_POLL_MS);
    }

    if (!state.summariesPollTimer) {
      state.summariesPollTimer = window.setInterval(async () => {
        try {
          const remoteClients = await loadRemoteChatClients().catch(() => []);
          if (Array.isArray(remoteClients) && remoteClients.length) {
            const merged = mergeRemoteClients(state.clients, remoteClients);
            const prevFingerprint = stableSerialize(
              (state.clients || []).map((client) => [Number(client.id), String(client.name || ""), String(client.phone || "")])
            );
            const nextFingerprint = stableSerialize(
              (merged || []).map((client) => [Number(client.id), String(client.name || ""), String(client.phone || "")])
            );
            if (prevFingerprint !== nextFingerprint) {
              state.clients = merged;
              applyClientFilter();
            }
          }
          const ids = (state.clients || []).map((client) => client.id);
          await pullRemoteSummaries(ids).catch(console.error);
        } catch (err) {
          console.error(err);
        }
      }, THREAD_SYNC_SUMMARY_POLL_MS);
    }
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return { threads: {}, hiddenMessageIds: {}, lastOpenClientId: null };
      const parsed = JSON.parse(raw);
      return {
        threads: parsed && typeof parsed.threads === "object" ? parsed.threads : {},
        hiddenMessageIds: parsed && typeof parsed.hiddenMessageIds === "object" ? parsed.hiddenMessageIds : {},
        lastOpenClientId: Number(parsed?.lastOpenClientId || 0) || null,
      };
    } catch {
      return { threads: {}, hiddenMessageIds: {}, lastOpenClientId: null };
    }
  }

  function saveStore() {
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state.store)); } catch {}
  }

  function ensureThread(clientId) {
    const key = String(clientId);
    if (!Array.isArray(state.store.threads[key])) state.store.threads[key] = [];
    return state.store.threads[key];
  }

  function getThread(clientId) { return clientId ? ensureThread(clientId) : []; }

  function ensureHiddenMessageMap() {
    if (!state.store.hiddenMessageIds || typeof state.store.hiddenMessageIds !== "object") {
      state.store.hiddenMessageIds = {};
    }
    return state.store.hiddenMessageIds;
  }

  function ensureHiddenMessageList(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return [];
    const map = ensureHiddenMessageMap();
    if (!Array.isArray(map[key])) map[key] = [];
    return map[key];
  }

  function isMessageHiddenLocally(clientId, messageId) {
    const id = String(messageId || "");
    if (!id) return false;
    return ensureHiddenMessageList(clientId).includes(id);
  }

  function setMessageHiddenLocally(clientId, messageId, hidden, options = {}) {
    const id = String(messageId || "");
    if (!id) return false;
    const list = ensureHiddenMessageList(clientId);
    const idx = list.indexOf(id);
    const wantHidden = hidden === true;
    let changed = false;

    if (wantHidden && idx < 0) {
      list.push(id);
      changed = true;
    } else if (!wantHidden && idx >= 0) {
      list.splice(idx, 1);
      changed = true;
    }

    if (changed && options.persist !== false) saveStore();
    return changed;
  }

  function pruneHiddenMessageIds(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const map = ensureHiddenMessageMap();
    const list = Array.isArray(map[key]) ? map[key] : [];
    if (!list.length) return false;

    const existing = new Set(getThread(clientId).map((msg) => String(msg?.id || "")));
    const next = list.filter((id) => existing.has(String(id || "")));
    if (next.length === list.length) return false;
    map[key] = next;
    saveStore();
    return true;
  }

  function getVisibleThread(clientId) {
    const hidden = new Set(ensureHiddenMessageList(clientId).map(String));
    if (!hidden.size) return getThread(clientId);
    return getThread(clientId).filter((msg) => !hidden.has(String(msg?.id || "")));
  }

  function getLastMessage(clientId) {
    const thread = getVisibleThread(clientId);
    return thread.length ? thread[thread.length - 1] : null;
  }

  function getUnreadCount(clientId) {
    return getVisibleThread(clientId).filter((msg) => msg.direction === "in" && !isMessageRead(msg)).length;
  }

  function isMessageRead(message) {
    if (!message || typeof message !== "object") return false;
    const status = String(message.deliveryStatus || "").toLowerCase();
    return message.read === true || !!message.readAt || status === "read";
  }

  function isMessageDelivered(message) {
    if (!message || typeof message !== "object") return false;
    const status = String(message.deliveryStatus || "").toLowerCase();
    return !!message.deliveredAt || status === "delivered" || isMessageRead(message);
  }

  function markThreadDelivered(clientId) {
    const thread = getThread(clientId);
    let changed = false;
    const nowIso = new Date().toISOString();
    thread.forEach((msg) => {
      if (!msg || msg.direction !== "in") return;
      if (isMessageDelivered(msg)) return;
      msg.deliveryStatus = "delivered";
      msg.deliveredAt = msg.deliveredAt || nowIso;
      changed = true;
    });
    if (changed) {
      saveStore();
      queueThreadSaveToRemote(clientId);
    }
    return changed;
  }

  function markThreadRead(clientId) {
    const thread = getThread(clientId);
    let changed = false;
    const nowIso = new Date().toISOString();
    thread.forEach((msg) => {
      if (!msg || msg.direction !== "in") return;
      if (isMessageRead(msg)) return;
      msg.read = true;
      msg.deliveryStatus = "read";
      msg.deliveredAt = msg.deliveredAt || nowIso;
      msg.readAt = msg.readAt || nowIso;
      changed = true;
    });
    if (changed) {
      saveStore();
      queueThreadSaveToRemote(clientId);
    }
    return changed;
  }

  function pushMessage(clientId, message) {
    const thread = getThread(clientId);
    thread.push(message);
    if (thread.length > 250) thread.splice(0, thread.length - 250);
    saveStore();
    queueThreadSaveToRemote(clientId);
  }

  function getMessageAuthorName(message) {
    if (!message) return "";
    if (message.direction === "out") return "Вы";
    return String(state.activeClient?.name || "Клиент");
  }

  function isImageAttachment(attachment) {
    if (!attachment || typeof attachment !== "object") return false;
    const kind = String(attachment.kind || "").toLowerCase();
    const dataUrl = String(attachment.dataUrl || "");
    if (kind !== "image") return false;
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl);
  }

  function getMessageImageAttachment(message) {
    if (!message || typeof message !== "object") return null;
    const attachment = message.attachment;
    return isImageAttachment(attachment) ? attachment : null;
  }

  function getMessagePreviewText(message) {
    if (!message || typeof message !== "object") return "";
    const text = String(message.text || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    return getMessageImageAttachment(message) ? "Фото" : "";
  }

  function getReplyPreviewText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "Сообщение";
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
  }

  function ensureComposerReplyElements() {
    const root = dom.center.stack || document;
    const composer = $(".chat-main-composer", root);
    if (!composer) return;

    let replyBox = $("#chatComposerReply", composer);
    if (!replyBox) {
      replyBox = document.createElement("div");
      replyBox.id = "chatComposerReply";
      replyBox.className = "chat-composer-reply hidden";
      replyBox.innerHTML = `
        <span class="chat-composer-reply-bar" aria-hidden="true"></span>
        <div class="chat-composer-reply-content">
          <div class="chat-composer-reply-name" id="chatComposerReplyName"></div>
          <div class="chat-composer-reply-text" id="chatComposerReplyText"></div>
        </div>
        <button type="button" class="chat-composer-reply-close" id="chatComposerReplyClose" aria-label="Отменить ответ" title="Отменить ответ">
          <i class="fas fa-times"></i>
        </button>
      `;
      composer.insertBefore(replyBox, composer.firstChild);
    }

    dom.center.replyBox = replyBox;
    dom.center.replyName = $("#chatComposerReplyName", replyBox);
    dom.center.replyText = $("#chatComposerReplyText", replyBox);
    dom.center.replyCloseBtn = $("#chatComposerReplyClose", replyBox);
  }

  function renderComposerReply() {
    ensureComposerReplyElements();
    if (!dom.center.replyBox || !dom.center.replyName || !dom.center.replyText) return;

    const reply = state.replyDraft;
    if (!reply || !reply.id) {
      dom.center.replyBox.classList.add("hidden");
      return;
    }

    dom.center.replyName.textContent = String(reply.sender || "Сообщение");
    renderEmojiMessageText(
      dom.center.replyText,
      getReplyPreviewText(reply.text || ""),
      "chat-emoji-glyph chat-emoji-glyph--preview"
    );
    dom.center.replyBox.classList.remove("hidden");
  }

  function clearComposerReply() {
    if (!state.replyDraft) return;
    state.replyDraft = null;
    renderComposerReply();
  }

  function setComposerReplyByMessage(messageId) {
    if (!state.activeClientId) return;
    const msg = findThreadMessage(state.activeClientId, messageId);
    if (!msg) return;

    state.replyDraft = {
      id: String(msg.id || ""),
      sender: getMessageAuthorName(msg),
      text: getMessagePreviewText(msg),
    };
    renderComposerReply();

    if (dom.center.input) {
      dom.center.input.focus();
      const pos = dom.center.input.value.length;
      dom.center.input.setSelectionRange(pos, pos);
    }
    syncComposerRichPreview({ stickToBottom: true });
  }

  function scrollToMessageInThread(messageId) {
    if (!dom.center.messages || !dom.center.messagesWrap) return;
    const key = String(messageId || "");
    if (!key) return;

    const wrap = dom.center.messagesWrap;
    const target = $$(".chat-message", dom.center.messages)
      .find((node) => String(node.getAttribute("data-message-id") || "") === key);
    if (!target) return;

    const wrapRect = wrap.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offsetTop = targetRect.top - wrapRect.top;
    const centeredTop = wrap.scrollTop + offsetTop - ((wrap.clientHeight - targetRect.height) / 2);
    const nextTop = Math.max(0, centeredTop);

    wrap.scrollTo({ top: nextTop, behavior: "smooth" });
    target.classList.add("is-jump-highlight");
    if (target.__jumpTimer) clearTimeout(target.__jumpTimer);
    target.__jumpTimer = window.setTimeout(() => {
      target.classList.remove("is-jump-highlight");
    }, 1200);
  }

  function ensureDeleteConfirmUi() {
    if (state.deleteConfirmUi && state.deleteConfirmUi.overlay) return state.deleteConfirmUi;

    const overlay = document.createElement("div");
    overlay.className = "chat-delete-confirm-overlay hidden";
    overlay.innerHTML = `
      <div class="chat-delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="chatDeleteConfirmTitle">
        <div class="chat-delete-confirm-title" id="chatDeleteConfirmTitle">Удалить сообщение</div>
        <div class="chat-delete-confirm-text" id="chatDeleteConfirmText">Вы точно хотите удалить это сообщение?</div>
        <label class="chat-delete-confirm-check" for="chatDeleteConfirmForClient">
          <input class="chat-delete-confirm-checkbox" id="chatDeleteConfirmForClient" type="checkbox" checked />
          <span class="chat-delete-confirm-check-text" id="chatDeleteConfirmCheckText">Также удалить для клиента</span>
        </label>
        <div class="chat-delete-confirm-actions">
          <button type="button" class="chat-delete-confirm-btn chat-delete-confirm-btn--cancel" id="chatDeleteConfirmCancelBtn">ОТМЕНА</button>
          <button type="button" class="chat-delete-confirm-btn chat-delete-confirm-btn--danger" id="chatDeleteConfirmDeleteBtn">УДАЛИТЬ</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const ui = {
      overlay,
      card: $(".chat-delete-confirm-card", overlay),
      title: $("#chatDeleteConfirmTitle", overlay),
      text: $("#chatDeleteConfirmText", overlay),
      check: $("#chatDeleteConfirmForClient", overlay),
      checkText: $("#chatDeleteConfirmCheckText", overlay),
      cancelBtn: $("#chatDeleteConfirmCancelBtn", overlay),
      deleteBtn: $("#chatDeleteConfirmDeleteBtn", overlay),
    };

    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      closeDeleteConfirm();
    });

    if (ui.cancelBtn) ui.cancelBtn.addEventListener("click", () => closeDeleteConfirm());

    if (ui.deleteBtn) {
      ui.deleteBtn.addEventListener("click", () => {
        const pending = state.pendingDeleteConfirm;
        const deleteForClient = !!ui.check?.checked;
        closeDeleteConfirm();
        if (!pending || typeof pending.onConfirm !== "function") return;
        pending.onConfirm({ deleteForClient });
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!state.pendingDeleteConfirm) return;
      event.preventDefault();
      closeDeleteConfirm();
    });

    state.deleteConfirmUi = ui;
    return ui;
  }

  function closeDeleteConfirm() {
    const ui = ensureDeleteConfirmUi();
    state.pendingDeleteConfirm = null;
    if (state.deleteConfirmCloseTimer) {
      clearTimeout(state.deleteConfirmCloseTimer);
      state.deleteConfirmCloseTimer = 0;
    }
    ui.overlay.classList.remove("is-open");
    state.deleteConfirmCloseTimer = window.setTimeout(() => {
      ui.overlay.classList.add("hidden");
      state.deleteConfirmCloseTimer = 0;
    }, 140);
  }

  function openDeleteConfirm(options = {}) {
    const ui = ensureDeleteConfirmUi();
    if (state.deleteConfirmCloseTimer) {
      clearTimeout(state.deleteConfirmCloseTimer);
      state.deleteConfirmCloseTimer = 0;
    }

    const count = Math.max(1, Number(options.count || 1));
    const clientName = String(state.activeClient?.name || "клиента").trim();

    if (ui.title) ui.title.textContent = `Удалить ${count} ${getMessagesWord(count)}`;
    if (ui.text) ui.text.textContent = count === 1
      ? "Вы точно хотите удалить это сообщение?"
      : "Вы точно хотите удалить эти сообщения?";
    if (ui.checkText) ui.checkText.textContent = `Также удалить для ${clientName}`;
    if (ui.check) ui.check.checked = true;

    state.pendingDeleteConfirm = {
      onConfirm: typeof options.onConfirm === "function" ? options.onConfirm : null,
    };

    ui.overlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      ui.overlay.classList.add("is-open");
      if (ui.deleteBtn) ui.deleteBtn.focus();
    });
  }

  function seedThread(client) {
    if (!client || !client.id) return;
    const thread = getThread(client.id);
    if (thread.length || Number(client.total_orders || 0) <= 0) return;
    thread.push({
      id: `seed-${client.id}`,
      direction: "in",
      text: "Здравствуйте, подскажите статус моего заказа?",
      createdAt: client.last_order_date || client.created_at || new Date().toISOString(),
      read: false,
      pinned: false,
      reaction: "",
    });
    saveStore();
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function emojiToAssetCode(emoji) {
    return Array.from(String(emoji || ""))
      .map((char) => char.codePointAt(0))
      .filter((cp) => Number.isFinite(cp) && cp > 0)
      .map((cp) => cp.toString(16).toLowerCase())
      .join("-");
  }

  function getEmojiAssetUrl(emoji) {
    const code = emojiToAssetCode(emoji);
    return code ? `${EMOJI_ASSET_BASE_URL}/${code}.png` : "";
  }

  function setEmojiGlyph(target, emoji, glyphClassName) {
    if (!target) return;
    const value = String(emoji || "");
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
    img.loading = "lazy";
    img.draggable = false;
    img.setAttribute("aria-hidden", "true");
    img.addEventListener("error", () => {
      target.textContent = value;
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
    return Array.from(emojiGraphemeSegmenter.segment(text), (part) => part.segment);
  }

  function isEmojiGrapheme(segment) {
    const chars = Array.from(String(segment || ""));
    if (!chars.length) return false;
    const codePoints = chars
      .map((ch) => ch.codePointAt(0))
      .filter((cp) => Number.isFinite(cp) && cp > 0);
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

    lines.forEach((line, lineIndex) => {
      const segments = segmentGraphemes(line);
      segments.forEach((segment) => {
        if (isEmojiGrapheme(segment)) {
          const src = getEmojiAssetUrl(segment);
          if (src) {
            const img = document.createElement("img");
            img.className = glyphClassName;
            img.src = src;
            img.alt = segment;
            img.decoding = "async";
            img.loading = "lazy";
            img.draggable = false;
            img.setAttribute("aria-hidden", "true");
            img.addEventListener("error", () => {
              img.replaceWith(document.createTextNode(segment));
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

  function normalizePhoneDigits(value) { return String(value || "").replace(/\D+/g, ""); }

  function formatPhoneDigitsToRU(phone) {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return "—";
    let d = digits;
    if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
    if (d.length === 10) d = `7${d}`;
    if (d.length !== 11) return `+${d}`;
    return `+${d[0]} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }

  function parseDateValue(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getDayKey(value) {
    const date = parseDateValue(value);
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getDayDiffFromToday(value) {
    const date = parseDateValue(value);
    if (!date) return null;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return Math.round((from - to) / dayMs);
  }

  function fmtDayLabel(value) {
    const date = parseDateValue(value);
    if (!date) return "";
    const diff = getDayDiffFromToday(value);
    if (diff === 0) return "Сегодня";
    if (diff === 1) return "Вчера";
    const hasSameYear = date.getFullYear() === new Date().getFullYear();
    const options = hasSameYear
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" };
    return date.toLocaleDateString("ru-RU", options).replace(/\.$/, "");
  }

  function fmtClientRowTime(value) {
    const date = parseDateValue(value);
    if (!date) return "";
    const diff = getDayDiffFromToday(value);
    if (diff === 0) return "Сегодня";
    if (diff === 1) return "Вчера";
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  }

  function fmtTime(value) {
    const date = parseDateValue(value);
    if (!date) return "";
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function isFinalStatus(statusTitle) {
    const title = String(statusTitle || "").toLowerCase();
    return title.includes("выполн") || title.includes("заверш") || title.includes("достав") || title.includes("отмен") || title.includes("cancel") || title.includes("done");
  }

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string") return "";
    const clean = hex.trim().replace("#", "");
    if (!(clean.length === 3 || clean.length === 6)) return "";
    const full = clean.length === 3 ? clean.split("").map((ch) => ch + ch).join("") : clean;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return "";
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getClientSortTimestamp(client) {
    const fromThread = getLastMessage(client.id)?.createdAt;
    const src = fromThread || client.last_order_date || client.updated_at || client.created_at;
    if (!src) return 0;
    const date = new Date(String(src).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function applyClientFilter() {
    const q = String(state.q || "").trim().toLowerCase();
    const bySearch = !q ? state.clients.slice() : state.clients.filter((client) => {
      const name = String(client.name || "").toLowerCase();
      const phone = normalizePhoneDigits(client.phone);
      const qDigits = normalizePhoneDigits(q);
      return name.includes(q) || (qDigits && phone.includes(qDigits));
    });
    bySearch.sort((a, b) => getClientSortTimestamp(b) - getClientSortTimestamp(a));
    state.filteredClients = bySearch;
    renderClientsList();
  }

  function buildChatClientRow(client) {
    const active = Number(state.activeClientId) === Number(client.id);
    const unread = getUnreadCount(client.id);
    const lastMsg = getLastMessage(client.id);
    const preview = getMessagePreviewText(lastMsg) || "Нет сообщений";
    const timeText = lastMsg?.createdAt ? fmtClientRowTime(lastMsg.createdAt) : "";
    const status = lastMsg?.direction === "out" ? getOutgoingDeliveryStatus(lastMsg) : "";
    const statusTitle = status === "read"
      ? "Прочитано"
      : status === "delivered"
        ? "Доставлено"
        : status === "sent"
          ? "Отправлено"
          : "";
    const unreadText = unread > 99 ? "99+" : String(unread);

    const row = document.createElement("button");
    row.type = "button";
    row.className = `chat-client-row${active ? " is-active" : ""}`;
    row.setAttribute("data-client-id", String(client.id));
    row.innerHTML = `
      <span class="chat-client-main">
        <span class="chat-client-top">
          <span class="chat-client-name">${escapeHtml(client.name || `Клиент #${client.id}`)}</span>
          ${status || timeText
            ? `<span class="chat-client-time-wrap">
                ${status
                  ? `<span class="chat-client-status chat-client-status--${escapeHtml(status)}" title="${escapeHtml(statusTitle)}" aria-label="${escapeHtml(statusTitle)}">${getOutgoingStatusIconMarkup(status)}</span>`
                  : ""}
                ${timeText ? `<span class="chat-client-time">${escapeHtml(timeText)}</span>` : ""}
              </span>`
            : ""}
        </span>
        <span class="chat-client-bottom">
          <span class="chat-client-preview">${escapeHtml(preview)}</span>
          ${unread > 0 ? `<span class="chat-client-unread">${escapeHtml(unreadText)}</span>` : ""}
        </span>
      </span>
    `;

    const previewEl = $(".chat-client-preview", row);
    if (previewEl && hasEmojiInText(preview)) {
      renderEmojiMessageText(previewEl, preview, "chat-emoji-glyph chat-emoji-glyph--preview");
    }

    row.addEventListener("click", () => selectClient(client.id));
    return row;
  }

  function renderClientsList() {
    if (!dom.left.list) return;
    dom.left.list.innerHTML = "";
    const items = state.filteredClients || [];
    if (!items.length) {
      if (dom.left.empty) dom.left.empty.classList.remove("hidden");
      return;
    }
    if (dom.left.empty) dom.left.empty.classList.add("hidden");
    items.forEach((client) => dom.left.list.appendChild(buildChatClientRow(client)));
  }
  function renderEmojiPicker() {
    if (!dom.center.emojiPopover) return;
    dom.center.emojiPopover.innerHTML = "";
    EMOJIS.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-emoji-btn";
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--picker");
      btn.addEventListener("click", () => {
        if (!dom.center.input) return;
        const input = dom.center.input;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
        input.focus();
        const pos = start + emoji.length;
        input.setSelectionRange(pos, pos);
        syncComposerRichPreview({ stickToBottom: true });
      });
      dom.center.emojiPopover.appendChild(btn);
    });
  }

  function normalizeQuickReactionButtons() {
    if (!dom.center.reactionBar) return;
    const quickBtns = $$('[data-chat-reaction-slot="quick"]', dom.center.reactionBar);
    quickBtns.forEach((btn, index) => {
      const emoji = QUICK_REACTIONS[index] || QUICK_REACTIONS[QUICK_REACTIONS.length - 1];
      btn.setAttribute("data-chat-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--reaction");
    });

    const extraBtns = $$('[data-chat-reaction-slot="extra"]', dom.center.reactionBar);
    extraBtns.forEach((btn, index) => {
      const emoji = EXTRA_REACTIONS[index] || EXTRA_REACTIONS[EXTRA_REACTIONS.length - 1];
      btn.setAttribute("data-chat-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--reaction");
    });
  }

  function setReactionBarExpanded(expanded) {
    if (!dom.center.reactionBar) return;
    const isExpanded = !!expanded;
    dom.center.reactionBar.classList.toggle("is-expanded", isExpanded);
    const toggleBtn = $('[data-chat-reaction="__toggle_more__"]', dom.center.reactionBar);
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", isExpanded ? "Скрыть дополнительные реакции" : "Показать ещё реакции");
  }

  function decorateComposerEmojiControls() {
    if (dom.center.emojiBtn) {
      setEmojiGlyph(dom.center.emojiBtn, "\u{1F642}", "chat-emoji-glyph chat-emoji-glyph--composer");
      dom.center.emojiBtn.setAttribute("aria-label", "Эмодзи");
      dom.center.emojiBtn.title = "Эмодзи";
    }

    const composerRoot = dom.center.stack || document;
    $$("button", composerRoot)
      .filter((btn) => btn.closest(".chat-main-composer"))
      .forEach((btn) => {
        if (btn === dom.center.emojiBtn) return;
        const raw = String(btn.getAttribute("data-emoji") || btn.textContent || "").trim();
        if (!raw) return;
        const emojiOnlyInfo = getEmojiOnlyInfo(raw);
        if (!emojiOnlyInfo.isEmojiOnly) return;
        btn.classList.add("has-emoji-content");
        if (emojiOnlyInfo.count === 1) {
          setEmojiGlyph(btn, raw, "chat-emoji-glyph chat-emoji-glyph--composer");
        } else {
          renderEmojiMessageText(btn, raw, "chat-emoji-glyph chat-emoji-glyph--composer-inline");
        }
        btn.setAttribute("aria-label", raw);
        if (!btn.title) btn.title = raw;
      });
  }

  function shouldKeepMessagesPinnedToBottom() {
    if (!dom.center.messagesWrap) return false;
    const wrap = dom.center.messagesWrap;
    return (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight) <= 28;
  }

  function scrollMessagesToBottom() {
    if (!dom.center.messagesWrap) return;
    requestAnimationFrame(() => {
      if (!dom.center.messagesWrap) return;
      dom.center.messagesWrap.scrollTop = dom.center.messagesWrap.scrollHeight;
    });
  }

  function syncComposerRichPreview(options = {}) {
    const input = dom.center.input;
    if (!input || typeof input.__syncEmojiPreview !== "function") return;
    input.__syncEmojiPreview(options);
  }

  function setupComposerRichPreview() {
    if (!dom.center.input) return;
    const input = dom.center.input;
    if (input.dataset.emojiPreviewReady === "1") return;
    const parent = input.parentElement;
    if (!parent) return;

    const wrap = document.createElement("div");
    wrap.className = "chat-input-rich-wrap";
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);

    const preview = document.createElement("div");
    preview.className = "chat-input-rich-preview hidden";
    preview.setAttribute("aria-hidden", "true");
    wrap.appendChild(preview);

    const sync = (options = {}) => {
      const keepPinned = shouldKeepMessagesPinnedToBottom();
      const stickToBottom = options && options.stickToBottom === true;

      const inputStyles = window.getComputedStyle(input);
      const minHeight = parseFloat(inputStyles.minHeight) || 38;
      const maxHeight = parseFloat(inputStyles.maxHeight) || 160;

      input.style.height = "auto";
      const fullHeight = input.scrollHeight || minHeight;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, fullHeight));
      input.style.height = `${nextHeight}px`;
      input.style.overflowY = fullHeight > maxHeight + 1 ? "auto" : "hidden";

      const value = String(input.value || "");
      if (!value || !hasEmojiInText(value)) {
        preview.classList.add("hidden");
        preview.textContent = "";
        input.classList.remove("is-rich-emoji-preview");
        if (stickToBottom || keepPinned) scrollMessagesToBottom();
        return;
      }

      preview.classList.remove("hidden");
      input.classList.add("is-rich-emoji-preview");
      renderEmojiMessageText(preview, value, "chat-emoji-glyph chat-emoji-glyph--input-inline");
      preview.style.transform = `translate(${-Math.max(0, input.scrollLeft)}px, ${-Math.max(0, input.scrollTop)}px)`;

      if (stickToBottom || keepPinned) scrollMessagesToBottom();
    };

    input.__syncEmojiPreview = sync;
    input.addEventListener("input", () => sync({ stickToBottom: true }));
    ["scroll", "click", "keyup", "focus", "blur"].forEach((eventName) => {
      input.addEventListener(eventName, () => sync());
    });
    window.addEventListener("resize", () => sync());

    input.dataset.emojiPreviewReady = "1";
    sync({ stickToBottom: true });
  }

  function setComposerEnabled(enabled) {
    [dom.center.input, dom.center.attachBtn, dom.center.emojiBtn, dom.center.sendBtn].forEach((el) => {
      if (!el) return;
      el.disabled = !enabled;
    });
  }

  function syncComposerMode() {
    if (!dom.center.sendBtn || !dom.center.input) return;
    const isEditing = !!state.editingMessageId;
    dom.center.sendBtn.classList.toggle("is-editing", isEditing);
    dom.center.sendBtn.title = isEditing ? "Сохранить изменения" : "Отправить";
    dom.center.sendBtn.setAttribute("aria-label", isEditing ? "Сохранить изменения" : "Отправить");
    dom.center.sendBtn.innerHTML = isEditing ? '<i class="fas fa-check"></i>' : '<i class="fas fa-paper-plane"></i>';
    dom.center.input.placeholder = isEditing ? "Измените сообщение" : "Введите сообщение";
  }

  function cancelEditingMessage() {
    state.editingMessageId = null;
    syncComposerMode();
  }

  function getMessagesWord(count) {
    const n = Math.abs(Number(count || 0)) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return "сообщений";
    if (n1 > 1 && n1 < 5) return "сообщения";
    if (n1 === 1) return "сообщение";
    return "сообщений";
  }

  function getSelectedMessages() {
    if (!state.activeClientId) return [];
    const selected = state.selectedMessageIds;
    return getVisibleThread(state.activeClientId).filter((msg) => selected.has(String(msg.id)));
  }

  function syncSelectionUi() {
    const count = state.selectedMessageIds.size;
    const active = state.selectionMode && count > 0;

    if (dom.center.stack) dom.center.stack.classList.toggle("is-selection-mode", active);
    if (dom.center.messagesWrap) dom.center.messagesWrap.classList.toggle("is-selection-mode", active);
    if (dom.center.selectionBar) dom.center.selectionBar.classList.toggle("hidden", !active);

    if (dom.center.selectionCount) {
      dom.center.selectionCount.textContent = `Выбрано ${count} ${getMessagesWord(count)}`;
    }
  }

  function setSelectionMode(enabled) {
    const on = !!enabled;
    state.selectionMode = on;
    if (!on) state.selectedMessageIds.clear();
    if (on) hideMessageContextMenu();
    syncSelectionUi();
  }

  function toggleMessageSelection(messageId) {
    const key = String(messageId || "");
    if (!key) return;
    if (!state.selectionMode) setSelectionMode(true);
    if (state.selectedMessageIds.has(key)) {
      state.selectedMessageIds.delete(key);
    } else {
      state.selectedMessageIds.add(key);
    }
    if (state.selectedMessageIds.size === 0) setSelectionMode(false);
  }

  function findThreadMessage(clientId, messageId) {
    const thread = getThread(clientId);
    return thread.find((msg) => String(msg.id) === String(messageId)) || null;
  }

  function updateThreadMessage(clientId, messageId, newText) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg || msg.direction !== "out") return false;
    msg.text = String(newText || "");
    msg.editedAt = new Date().toISOString();
    saveStore();
    queueThreadSaveToRemote(clientId);
    return true;
  }

  function removeThreadMessage(clientId, messageId) {
    const thread = getThread(clientId);
    const idx = thread.findIndex((msg) => String(msg.id) === String(messageId));
    if (idx < 0) return false;
    const msg = thread[idx];
    if (!msg || msg.direction !== "out") return false;
    thread.splice(idx, 1);
    setMessageHiddenLocally(clientId, messageId, false, { persist: false });
    pruneHiddenMessageIds(clientId);
    state.selectedMessageIds.delete(String(messageId));
    if (state.selectedMessageIds.size === 0) setSelectionMode(false);
    saveStore();
    queueThreadSaveToRemote(clientId);
    return true;
  }

  function hideThreadMessagesLocally(clientId, messageIds) {
    const ids = new Set((Array.isArray(messageIds) ? messageIds : []).map((id) => String(id || "")).filter(Boolean));
    if (!ids.size) return false;

    const thread = getThread(clientId);
    let changed = false;
    thread.forEach((msg) => {
      const id = String(msg?.id || "");
      if (!id || msg.direction !== "out") return;
      if (!ids.has(id)) return;
      if (setMessageHiddenLocally(clientId, id, true, { persist: false })) changed = true;
    });

    ids.forEach((id) => state.selectedMessageIds.delete(id));
    if (state.selectedMessageIds.size === 0) setSelectionMode(false);
    if (changed) saveStore();
    return changed;
  }

  function toggleThreadMessagePinned(clientId, messageId) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg) return false;
    msg.pinned = !msg.pinned;
    saveStore();
    queueThreadSaveToRemote(clientId);
    return true;
  }

  function setThreadMessageReaction(clientId, messageId, reaction) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg) return false;
    const next = String(reaction || "").trim();
    msg.reaction = msg.reaction === next ? "" : next;
    saveStore();
    queueThreadSaveToRemote(clientId);
    return true;
  }

  function getOutgoingDeliveryStatus(message) {
    if (!message || message.direction !== "out") return "";
    const status = String(message.deliveryStatus || "").toLowerCase();
    if (message.readAt || message.readByClient === true || message.read === true || status === "read") return "read";
    if (message.deliveredAt || status === "delivered") return "delivered";
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
      return `
        <svg class="chat-message-status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2.8 8.4L5.7 11.3L13.3 3.7"></path>
        </svg>
      `;
    }
    if (status === "delivered" || status === "read") {
      return `
        <svg class="chat-message-status-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M1.1 8.4L3.9 11.2L9.6 5.5"></path>
          <path d="M6.1 8.4L8.9 11.2L14.6 5.5"></path>
        </svg>
      `;
    }
    return "";
  }

  function setOutgoingDeliveryStatus(clientId, messageId, nextStatus) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg || msg.direction !== "out") return false;

    const target = String(nextStatus || "").toLowerCase();
    if (!["sent", "delivered", "read"].includes(target)) return false;

    const current = getOutgoingDeliveryStatus(msg);
    if (getDeliveryStatusRank(target) <= getDeliveryStatusRank(current)) return false;

    msg.deliveryStatus = target;
    if (target === "delivered" && !msg.deliveredAt) msg.deliveredAt = new Date().toISOString();
    if (target === "read" && !msg.readAt) msg.readAt = new Date().toISOString();
    saveStore();
    queueThreadSaveToRemote(clientId);

    if (Number(state.activeClientId) === Number(clientId)) renderMessages();
    applyClientFilter();
    return true;
  }

  function scheduleOutgoingDeliveryProgress(clientId, messageId) {
    const id = String(messageId || "");
    if (!id) return;

    window.setTimeout(() => {
      setOutgoingDeliveryStatus(clientId, id, "delivered");
    }, 700);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("READ_FILE_FAILED"));
        reader.readAsDataURL(file);
      } catch (err) {
        reject(err);
      }
    });
  }

  function getImageSizeFromDataUrl(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: Number.isFinite(img.naturalWidth) ? img.naturalWidth : 0,
          height: Number.isFinite(img.naturalHeight) ? img.naturalHeight : 0,
        });
      };
      img.onerror = () => resolve({ width: 0, height: 0 });
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
      dataUrl,
      width: Number.isFinite(dimensions.width) && dimensions.width > 0 ? dimensions.width : 0,
      height: Number.isFinite(dimensions.height) && dimensions.height > 0 ? dimensions.height : 0,
      size: Number.isFinite(file.size) && file.size > 0 ? file.size : 0,
    };
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

  function focusComposer(text) {
    if (!dom.center.input) return;
    dom.center.input.value = String(text || "");
    dom.center.input.focus();
    const pos = dom.center.input.value.length;
    dom.center.input.setSelectionRange(pos, pos);
    syncComposerRichPreview({ stickToBottom: true });
  }

  function hideMessageContextMenu() {
    if (dom.center.contextMenu) dom.center.contextMenu.classList.add("hidden");
    if (dom.center.reactionBar) {
      dom.center.reactionBar.classList.add("hidden");
      setReactionBarExpanded(false);
    }
    state.contextMessageId = null;
  }

  function positionFloatingBox(box, x, y, padding = 8) {
    box.classList.remove("hidden");
    const rect = box.getBoundingClientRect();
    const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
    const maxTop = Math.max(padding, window.innerHeight - rect.height - padding);
    const left = Math.min(Math.max(padding, x), maxLeft);
    const top = Math.min(Math.max(padding, y), maxTop);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function positionReactionBar(menuRect) {
    if (!dom.center.reactionBar || !menuRect) return;
    const barRect = dom.center.reactionBar.getBoundingClientRect();
    const padding = 8;
    const left = Math.min(Math.max(padding, menuRect.left), Math.max(padding, window.innerWidth - barRect.width - padding));
    const preferTop = menuRect.top - barRect.height - 8;
    const top = preferTop >= padding
      ? preferTop
      : Math.min(Math.max(padding, menuRect.bottom + 8), Math.max(padding, window.innerHeight - barRect.height - padding));

    dom.center.reactionBar.style.left = `${left}px`;
    dom.center.reactionBar.style.top = `${top}px`;
  }

  function showReactionBarForMessage(message, menuRect) {
    if (!dom.center.reactionBar) return;
    setReactionBarExpanded(false);
    $$('[data-chat-reaction]', dom.center.reactionBar).forEach((btn) => {
      const value = btn.getAttribute("data-chat-reaction");
      const isAction = value === "__toggle_more__";
      const isActive = value && !isAction && value === String(message?.reaction || "");
      btn.classList.toggle("is-active", isActive);
    });

    dom.center.reactionBar.classList.remove("hidden");
    positionReactionBar(menuRect);
  }

  function showMessageContextMenu(x, y, messageId) {
    if (!state.activeClientId || !dom.center.contextMenu) return;
    const message = findThreadMessage(state.activeClientId, messageId);
    if (!message) return;

    state.contextMessageId = String(messageId || "");
    if (dom.center.menuPinLabel) dom.center.menuPinLabel.textContent = message.pinned ? "Открепить" : "Закрепить";
    const canManageOwnMessage = message.direction === "out";
    if (dom.center.menuEditAction) dom.center.menuEditAction.classList.toggle("hidden", !canManageOwnMessage);
    if (dom.center.menuDeleteAction) dom.center.menuDeleteAction.classList.toggle("hidden", !canManageOwnMessage);

    positionFloatingBox(dom.center.contextMenu, x, y, 8);
    showReactionBarForMessage(message, dom.center.contextMenu.getBoundingClientRect());
  }

  function startEditingMessage(messageId) {
    if (!state.activeClientId || !dom.center.input) return;
    const msg = findThreadMessage(state.activeClientId, messageId);
    if (!msg || msg.direction !== "out") return;
    clearComposerReply();
    state.editingMessageId = String(messageId);
    focusComposer(msg.text || "");
    syncComposerMode();
  }

  function deleteMessageFromContext(messageId) {
    if (!state.activeClientId) return;
    const message = findThreadMessage(state.activeClientId, messageId);
    if (!message || message.direction !== "out") return;

    openDeleteConfirm({
      count: 1,
      onConfirm: ({ deleteForClient } = {}) => {
        const removeForBoth = deleteForClient !== false;
        const changed = removeForBoth
          ? removeThreadMessage(state.activeClientId, messageId)
          : hideThreadMessagesLocally(state.activeClientId, [messageId]);
        if (!changed) return;

        if (String(state.editingMessageId || "") === String(messageId)) {
          cancelEditingMessage();
          if (dom.center.input) dom.center.input.value = "";
          syncComposerRichPreview({ stickToBottom: true });
        }

        if (String(state.replyDraft?.id || "") === String(messageId)) {
          clearComposerReply();
        }

        renderMessages();
        applyClientFilter();
      },
    });
  }

  function replyToMessageFromContext(messageId) {
    if (!state.activeClientId || !dom.center.input) return;
    setComposerReplyByMessage(messageId);
  }

  async function copyMessageFromContext(messageId) {
    if (!state.activeClientId) return;
    const msg = findThreadMessage(state.activeClientId, messageId);
    if (!msg) return;
    await copyToClipboard(msg.text || "");
  }

  function selectMessageFromContext(messageId) {
    toggleMessageSelection(messageId);
    renderMessages();
  }

  function reactMessageFromContext(messageId, reaction) {
    if (!state.activeClientId) return;
    if (!setThreadMessageReaction(state.activeClientId, messageId, reaction)) return;
    renderMessages();
  }

  function closeSelectionMode() {
    if (!state.selectionMode && state.selectedMessageIds.size === 0) return;
    setSelectionMode(false);
    renderMessages();
  }

  async function copySelectedMessages() {
    const selectedMessages = getSelectedMessages();
    if (!selectedMessages.length) return;
    const text = selectedMessages.map((msg) => String(msg.text || "")).join("\n");
    await copyToClipboard(text);
  }

  function forwardSelectedMessages() {
    const selectedMessages = getSelectedMessages();
    if (!selectedMessages.length) return;
    const text = selectedMessages.map((msg) => String(msg.text || "")).join("\n");
    closeSelectionMode();
    focusComposer(`Переслано:\n${text}`);
  }

  function downloadSelectedMessages() {
    const selectedMessages = getSelectedMessages();
    if (!selectedMessages.length) return;

    const lines = selectedMessages.map((msg) => {
      const who = msg.direction === "out" ? "Вы" : "Клиент";
      return `[${fmtTime(msg.createdAt)}] ${who}: ${String(msg.text || "")}`;
    });

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-selected-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function deleteSelectedMessages() {
    if (!state.activeClientId || state.selectedMessageIds.size === 0) return;
    const selectedOwnMessages = getSelectedMessages().filter((msg) => msg.direction === "out");
    if (!selectedOwnMessages.length) return;
    const selectedOwnIds = new Set(selectedOwnMessages.map((msg) => String(msg.id || "")));
    const count = selectedOwnIds.size;

    openDeleteConfirm({
      count,
      onConfirm: ({ deleteForClient } = {}) => {
        const removeForBoth = deleteForClient !== false;
        const key = String(state.activeClientId);
        const thread = getThread(state.activeClientId);
        if (removeForBoth) {
          state.store.threads[key] = thread.filter((msg) => !selectedOwnIds.has(String(msg.id)));
          selectedOwnIds.forEach((id) => setMessageHiddenLocally(state.activeClientId, id, false, { persist: false }));
          pruneHiddenMessageIds(state.activeClientId);
        } else {
          hideThreadMessagesLocally(state.activeClientId, Array.from(selectedOwnIds));
        }

        if (state.editingMessageId && selectedOwnIds.has(String(state.editingMessageId))) {
          cancelEditingMessage();
          if (dom.center.input) dom.center.input.value = "";
          syncComposerRichPreview({ stickToBottom: true });
        }

        if (state.replyDraft?.id && selectedOwnIds.has(String(state.replyDraft.id))) {
          clearComposerReply();
        }

        setSelectionMode(false);
        saveStore();
        if (removeForBoth) queueThreadSaveToRemote(state.activeClientId);
        renderMessages();
        applyClientFilter();
      },
    });
  }

  function renderChatHeader() {
    if (!state.activeClient) {
      if (dom.center.headerName) dom.center.headerName.textContent = "Выберите клиента";
      if (dom.center.headerPhone) dom.center.headerPhone.textContent = "Нажмите на чат в левом списке";
      if (dom.center.orderTitle) dom.center.orderTitle.textContent = "Последний заказ: —";
      if (dom.center.orderStatus) {
        dom.center.orderStatus.textContent = "—";
        dom.center.orderStatus.style.background = "";
        dom.center.orderStatus.style.borderColor = "";
        dom.center.orderStatus.style.color = "";
      }
      cancelEditingMessage();
      clearComposerReply();
      if (state.pendingDeleteConfirm) closeDeleteConfirm();
      hideMessageContextMenu();
      setComposerEnabled(false);
      return;
    }

    if (dom.center.headerName) dom.center.headerName.textContent = state.activeClient.name || `Клиент #${state.activeClient.id}`;
    if (dom.center.headerPhone) dom.center.headerPhone.textContent = formatPhoneDigitsToRU(state.activeClient.phone);

    const currentOrder = (state.activeOrders || []).find((o) => !isFinalStatus(o.status_title));
    const latestOrder = (state.activeOrders || [])[0] || null;
    const headerOrder = currentOrder || latestOrder;

    if (!headerOrder) {
      if (dom.center.orderTitle) dom.center.orderTitle.textContent = "Последний заказ: —";
      if (dom.center.orderStatus) {
        dom.center.orderStatus.textContent = "Без заказа";
        dom.center.orderStatus.style.background = "";
        dom.center.orderStatus.style.borderColor = "";
        dom.center.orderStatus.style.color = "";
      }
    } else {
      if (dom.center.orderTitle) dom.center.orderTitle.textContent = `${currentOrder ? "Текущий" : "Последний"} заказ #${headerOrder.id}`;
      if (dom.center.orderStatus) {
        const statusColor = headerOrder.status_color || "#64748b";
        dom.center.orderStatus.textContent = headerOrder.status_title || "Без статуса";
        dom.center.orderStatus.style.borderColor = statusColor;
        dom.center.orderStatus.style.background = hexToRgba(statusColor, 0.14) || "";
        dom.center.orderStatus.style.color = statusColor;
      }
    }

    syncComposerMode();
    setComposerEnabled(true);
  }

  function renderMessages() {
    if (!dom.center.messages || !dom.center.empty) return;

    if (!state.activeClientId) {
      setSelectionMode(false);
      dom.center.empty.classList.remove("hidden");
      dom.center.messages.innerHTML = "";
      hideMessageContextMenu();
      return;
    }

    const thread = getVisibleThread(state.activeClientId);
    const validIds = new Set(thread.map((msg) => String(msg.id)));
    Array.from(state.selectedMessageIds).forEach((id) => {
      if (!validIds.has(id)) state.selectedMessageIds.delete(id);
    });
    if (state.replyDraft && state.replyDraft.id && !validIds.has(String(state.replyDraft.id))) {
      clearComposerReply();
    }
    if (state.selectedMessageIds.size === 0) state.selectionMode = false;

    dom.center.empty.classList.add("hidden");
    dom.center.messages.innerHTML = "";

    if (!thread.length) {
      setSelectionMode(false);
      dom.center.messages.innerHTML = `
        <div class="chat-local-empty">
          <i class="fas fa-comment-dots"></i>
          <span>История переписки пока пустая. Напишите первое сообщение.</span>
        </div>
      `;
      hideMessageContextMenu();
      return;
    }

    let prevDayKey = "";
    thread.forEach((msg) => {
      const dayKey = getDayKey(msg.createdAt);
      if (dayKey && dayKey !== prevDayKey) {
        const dayNode = document.createElement("div");
        dayNode.className = "chat-day-separator";
        dayNode.textContent = fmtDayLabel(msg.createdAt);
        dom.center.messages.appendChild(dayNode);
        prevDayKey = dayKey;
      }

      const messageId = String(msg.id || "");
      const time = `${fmtTime(msg.createdAt) || ""}${msg.editedAt ? " • изм." : ""}`;
      const outgoingStatus = msg.direction === "out" ? getOutgoingDeliveryStatus(msg) : "";
      const outgoingStatusTitle = outgoingStatus === "read"
        ? "Прочитано"
        : outgoingStatus === "delivered"
          ? "Доставлено"
          : outgoingStatus === "sent"
            ? "Отправлено"
            : "";
      const classes = [
        "chat-message",
        `chat-message--${msg.direction === "out" ? "out" : "in"}`,
        msg.editedAt ? "is-edited" : "",
        state.selectionMode ? "is-selection-mode" : "",
        state.selectedMessageIds.has(messageId) ? "is-selected" : "",
      ].filter(Boolean).join(" ");

      const item = document.createElement("div");
      item.className = classes;
      item.setAttribute("data-message-id", messageId);
      const emojiOnlyInfo = getEmojiOnlyInfo(msg.text || "");
      const imageAttachment = getMessageImageAttachment(msg);
      const hasImageAttachment = !!imageAttachment;
      const hasText = String(msg.text || "").trim().length > 0;
      const reply = msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null;
      const replyMarkup = reply
        ? `
          <div class="chat-message-reply-snippet"${reply.id ? ` data-chat-scroll-to-message="${escapeHtml(reply.id)}"` : ""}>
            <div class="chat-message-reply-name">${escapeHtml(reply.sender || "Сообщение")}</div>
            <div class="chat-message-reply-line">${escapeHtml(getReplyPreviewText(reply.text || ""))}</div>
          </div>
        `
        : "";
      const attachmentMarkup = hasImageAttachment
        ? `
          <div class="chat-message-attachment">
            <img
              class="chat-message-attachment-image"
              src="${escapeHtml(String(imageAttachment.dataUrl || ""))}"
              alt="${escapeHtml(String(imageAttachment.name || "Фото"))}"
              loading="lazy"
              decoding="async"
            />
          </div>
        `
        : "";
      const textMarkup = hasText
        ? `<div class="chat-message-text">${escapeHtml(msg.text || "").replace(/\n/g, "<br>")}</div>`
        : "";
      item.innerHTML = `
        <span class="chat-message-select-badge" aria-hidden="true"><i class="fas fa-check"></i></span>
        <div class="chat-message-bubble">
          ${replyMarkup}
          ${attachmentMarkup}
          ${textMarkup}
          <div class="chat-message-meta">
            <span class="chat-message-time">${escapeHtml(time)}</span>
            ${outgoingStatus
              ? `<span class="chat-message-status chat-message-status--${escapeHtml(outgoingStatus)}" title="${escapeHtml(outgoingStatusTitle)}" aria-label="${escapeHtml(outgoingStatusTitle)}">${getOutgoingStatusIconMarkup(outgoingStatus)}</span>`
              : ""}
            ${msg.pinned ? '<span class="chat-message-pin" title="Закреплено"><i class="fas fa-thumbtack"></i></span>' : ""}
          </div>
        </div>
      `;

      const bubble = $(".chat-message-bubble", item);
      const messageTextNode = $(".chat-message-text", item);
      if (messageTextNode) {
        renderEmojiMessageText(messageTextNode, msg.text || "", "chat-emoji-glyph chat-emoji-glyph--inline");
      }
      if (bubble && hasImageAttachment) {
        bubble.classList.add("has-attachment");
        if (!hasText) bubble.classList.add("has-attachment-only");
      }
      if (reply) {
        const replyLineNode = $(".chat-message-reply-line", item);
        if (replyLineNode) {
          renderEmojiMessageText(
            replyLineNode,
            getReplyPreviewText(reply.text || ""),
            "chat-emoji-glyph chat-emoji-glyph--preview"
          );
        }
      }
      if (bubble && emojiOnlyInfo.isEmojiOnly && !reply && !hasImageAttachment) {
        bubble.classList.add("is-emoji-only");
        if (emojiOnlyInfo.count <= 1) bubble.classList.add("is-emoji-only-single");
        else if (emojiOnlyInfo.count <= 3) bubble.classList.add("is-emoji-only-few");
        else bubble.classList.add("is-emoji-only-many");
      }

      if (msg.reaction) {
        if (bubble) {
          const reactionBtn = document.createElement("button");
          reactionBtn.type = "button";
          reactionBtn.className = "chat-message-reaction-pill";
          reactionBtn.setAttribute("data-chat-msg-reaction-toggle", messageId);
          reactionBtn.setAttribute("data-chat-reaction-value", String(msg.reaction));
          reactionBtn.title = "Изменить реакцию";
          reactionBtn.setAttribute("aria-label", String(msg.reaction));
          setEmojiGlyph(reactionBtn, msg.reaction, "chat-emoji-glyph chat-emoji-glyph--pill");
          bubble.appendChild(reactionBtn);
        }
      }

      dom.center.messages.appendChild(item);
    });

    if (state.contextMessageId) {
      const exists = thread.some((msg) => String(msg.id) === String(state.contextMessageId));
      if (!exists) hideMessageContextMenu();
    }

    syncSelectionUi();

    if (dom.center.messagesWrap) {
      if (!state.selectionMode) {
        requestAnimationFrame(() => {
          dom.center.messagesWrap.scrollTop = dom.center.messagesWrap.scrollHeight;
        });
      }
    }
  }

  function sendMessage(text, options = {}) {
    if (!state.activeClientId) return false;
    const clean = String(text || "").trim();
    const attachment = isImageAttachment(options.attachment) ? options.attachment : null;
    if (!clean && !attachment) return false;

    if (state.editingMessageId) {
      const ok = updateThreadMessage(state.activeClientId, state.editingMessageId, clean);
      cancelEditingMessage();
      if (!ok) return false;
      renderMessages();
      applyClientFilter();
      return true;
    }

    const newMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const replySnapshot = state.replyDraft && state.replyDraft.id
      ? {
          id: String(state.replyDraft.id),
          sender: String(state.replyDraft.sender || ""),
          text: String(state.replyDraft.text || ""),
        }
      : null;

    pushMessage(state.activeClientId, {
      id: newMessageId,
      direction: "out",
      text: clean,
      attachment,
      createdAt: new Date().toISOString(),
      read: false,
      pinned: false,
      reaction: "",
      replyTo: replySnapshot,
      deliveryStatus: "sent",
      deliveredAt: "",
      readAt: "",
    });

    scheduleOutgoingDeliveryProgress(state.activeClientId, newMessageId);
    clearComposerReply();
    hideMessageContextMenu();
    renderMessages();
    applyClientFilter();
    return true;
  }

  async function sendImageAttachments(files) {
    if (!state.activeClientId) return 0;
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return 0;

    const replySnapshot = state.replyDraft && state.replyDraft.id
      ? {
          id: String(state.replyDraft.id),
          sender: String(state.replyDraft.sender || ""),
          text: String(state.replyDraft.text || ""),
        }
      : null;

    let sent = 0;
    for (const file of list) {
      // eslint-disable-next-line no-await-in-loop
      const attachment = await buildImageAttachmentFromFile(file).catch(() => null);
      if (!attachment) continue;

      const newMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pushMessage(state.activeClientId, {
        id: newMessageId,
        direction: "out",
        text: "",
        attachment,
        createdAt: new Date().toISOString(),
        read: false,
        pinned: false,
        reaction: "",
        replyTo: sent === 0 ? replySnapshot : null,
        deliveryStatus: "sent",
        deliveredAt: "",
        readAt: "",
      });
      scheduleOutgoingDeliveryProgress(state.activeClientId, newMessageId);
      sent += 1;
    }

    if (sent > 0) {
      clearComposerReply();
      hideMessageContextMenu();
      renderMessages();
      applyClientFilter();
    }
    return sent;
  }

  function initMessageContextMenu() {
    if (!dom.center.messages || !dom.center.contextMenu) return;

    dom.center.messages.addEventListener("click", (event) => {
      const replyJump = event.target.closest("[data-chat-scroll-to-message]");
      if (replyJump) {
        const targetId = replyJump.getAttribute("data-chat-scroll-to-message");
        if (targetId) scrollToMessageInThread(targetId);
        return;
      }

      const reactionPill = event.target.closest("[data-chat-msg-reaction-toggle]");
      if (reactionPill && state.activeClientId) {
        const messageId = reactionPill.getAttribute("data-chat-msg-reaction-toggle");
        const reactionValue = reactionPill.getAttribute("data-chat-reaction-value") || reactionPill.textContent || "";
        if (messageId) reactMessageFromContext(messageId, reactionValue);
        return;
      }

      if (!state.selectionMode) return;
      const messageEl = event.target.closest(".chat-message");
      if (!messageEl) return;
      const messageId = messageEl.getAttribute("data-message-id");
      if (!messageId) return;
      toggleMessageSelection(messageId);
      renderMessages();
    });

    dom.center.messages.addEventListener("contextmenu", (event) => {
      const messageEl = event.target.closest(".chat-message");
      if (!messageEl || !state.activeClientId) return;
      const messageId = messageEl.getAttribute("data-message-id");
      if (!messageId) return;
      if (state.selectionMode) {
        event.preventDefault();
        toggleMessageSelection(messageId);
        renderMessages();
        return;
      }
      event.preventDefault();
      showMessageContextMenu(event.clientX, event.clientY, messageId);
    });

    dom.center.messages.addEventListener("dblclick", (event) => {
      const messageEl = event.target.closest(".chat-message");
      if (!messageEl || !state.activeClientId) return;
      const messageId = messageEl.getAttribute("data-message-id");
      if (!messageId) return;

      const message = findThreadMessage(state.activeClientId, messageId);
      if (!message) return;

      const heartReaction = "\u{2764}\u{FE0F}";
      if (String(message.reaction || "") === heartReaction) {
        hideMessageContextMenu();
        return;
      }

      if (!setThreadMessageReaction(state.activeClientId, messageId, heartReaction)) return;
      hideMessageContextMenu();
      renderMessages();
    });

    dom.center.contextMenu.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-chat-msg-action]");
      if (!actionBtn) return;
      const action = actionBtn.getAttribute("data-chat-msg-action");
      const messageId = state.contextMessageId;
      hideMessageContextMenu();
      if (!messageId) return;

      if (action === "reply") return replyToMessageFromContext(messageId);
      if (action === "copy") return copyMessageFromContext(messageId).catch(console.error);
      if (action === "select") return selectMessageFromContext(messageId);
      if (action === "edit") return startEditingMessage(messageId);
      if (action === "delete") deleteMessageFromContext(messageId);
    });

    if (dom.center.reactionBar) {
      dom.center.reactionBar.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-chat-reaction]");
        if (!btn) return;
        const reaction = btn.getAttribute("data-chat-reaction");
        const messageId = state.contextMessageId;
        if (!reaction) return;
        if (reaction === "__toggle_more__") {
          const nextExpanded = !dom.center.reactionBar.classList.contains("is-expanded");
          setReactionBarExpanded(nextExpanded);
          if (dom.center.contextMenu && !dom.center.contextMenu.classList.contains("hidden")) {
            positionReactionBar(dom.center.contextMenu.getBoundingClientRect());
          }
          return;
        }
        if (!messageId) return hideMessageContextMenu();
        reactMessageFromContext(messageId, reaction);
        hideMessageContextMenu();
      });
    }

    document.addEventListener("click", (event) => {
      if (!dom.center.contextMenu) return;
      const insideMenu = dom.center.contextMenu.contains(event.target);
      const insideReactions = dom.center.reactionBar && dom.center.reactionBar.contains(event.target);
      if (!insideMenu && !insideReactions) hideMessageContextMenu();
    });

    document.addEventListener("contextmenu", (event) => {
      if (!dom.center.contextMenu) return;
      const insideMenu = dom.center.contextMenu.contains(event.target);
      const insideReactions = dom.center.reactionBar && dom.center.reactionBar.contains(event.target);
      const insideMessage = event.target.closest && event.target.closest(".chat-message");
      if (!insideMenu && !insideReactions && !insideMessage) hideMessageContextMenu();
    });

    window.addEventListener("resize", hideMessageContextMenu);
    window.addEventListener("scroll", hideMessageContextMenu, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (state.pendingDeleteConfirm) return;
      hideMessageContextMenu();
      if (state.selectionMode) {
        setSelectionMode(false);
        renderMessages();
      }
    });
  }

  function initSelectionToolbar() {
    if (dom.center.selectionCloseBtn) {
      dom.center.selectionCloseBtn.addEventListener("click", closeSelectionMode);
    }

    if (dom.center.selectionForwardBtn) {
      dom.center.selectionForwardBtn.addEventListener("click", forwardSelectedMessages);
    }

    if (dom.center.selectionDownloadBtn) {
      dom.center.selectionDownloadBtn.addEventListener("click", downloadSelectedMessages);
    }

    if (dom.center.selectionCopyBtn) {
      dom.center.selectionCopyBtn.addEventListener("click", () => {
        copySelectedMessages().catch(console.error);
      });
    }

    if (dom.center.selectionDeleteBtn) {
      dom.center.selectionDeleteBtn.addEventListener("click", deleteSelectedMessages);
    }
  }
  async function loadActiveClientData(clientId, selectedFromList = null) {
    const requestId = ++state.requestToken;
    try {
      const [clientJson, ordersJson] = await Promise.all([
        apiJson(`/api/admin/clients/${clientId}`),
        apiJson(`/api/admin/clients/${clientId}/orders`),
      ]);
      if (requestId !== state.requestToken) return;

      state.activeClient = clientJson?.data || selectedFromList;
      state.activeOrders = Array.isArray(ordersJson?.data) ? ordersJson.data : [];
      renderChatHeader();
      renderMessages();
    } catch (err) {
      if (requestId !== state.requestToken) return;
      console.error(err);
      state.activeClient = selectedFromList;
      state.activeOrders = [];
      renderChatHeader();
      renderMessages();
    }
  }

  async function selectClient(clientId) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return;

    cancelEditingMessage();
    clearComposerReply();
    if (state.pendingDeleteConfirm) closeDeleteConfirm();
    setSelectionMode(false);
    hideMessageContextMenu();
    if (dom.center.input) dom.center.input.value = "";
    syncComposerRichPreview({ stickToBottom: true });

    state.activeClientId = id;
    state.store.lastOpenClientId = id;
    saveStore();

    await pullThreadFromRemote(id, { skipReadMark: true }).catch(console.error);
    markThreadRead(id);
    applyClientFilter();
    renderMessages();

    const selectedFromList = state.clients.find((c) => Number(c.id) === id) || null;
    const clientsRightApi = getClientsRightApi();
    if (clientsRightApi) clientsRightApi.selectClientById(id, selectedFromList?.name || "").catch(console.error);

    state.activeClient = selectedFromList;
    state.activeOrders = [];
    renderChatHeader();

    await loadActiveClientData(id, selectedFromList);
  }

  async function loadClients() {
    if (!dom.left.list) return;
    dom.left.list.innerHTML = '<div class="muted" style="padding:8px;">Загрузка чатов…</div>';

    try {
      const qs = new URLSearchParams();
      qs.set("limit", "250");
      qs.set("offset", "0");
      qs.set("sort", "last_desc");

      const [json, remoteClients] = await Promise.all([
        apiJson(`/api/admin/clients?${qs.toString()}`),
        loadRemoteChatClients().catch(() => []),
      ]);
      const rows = mergeRemoteClients(Array.isArray(json?.data) ? json.data : [], remoteClients);

      const existingThreadIds = new Set(Object.keys(state.store.threads).map((k) => Number(k)));
      const openChatClients = rows.filter(
        (c) =>
          existingThreadIds.has(Number(c.id)) ||
          Number(c.total_orders || 0) > 0 ||
          c._isVirtualChatClient === true
      );
      const prepared = openChatClients.length ? openChatClients : rows;

      prepared.slice(0, 40).forEach((client) => seedThread(client));

      state.clients = prepared;
      applyClientFilter();
      await pullRemoteSummaries(state.clients.map((client) => client.id)).catch(console.error);
      applyClientFilter();

      const persisted = Number(state.store.lastOpenClientId || 0);
      const target = state.filteredClients.find((c) => Number(c.id) === persisted) || state.filteredClients[0];
      if (target) {
        await selectClient(target.id);
      } else {
        state.activeClientId = null;
        state.activeClient = null;
        state.activeOrders = [];
        renderChatHeader();
        renderMessages();
      }
    } catch (err) {
      console.error(err);
      dom.left.list.innerHTML = "";
      if (dom.left.empty) {
        dom.left.empty.textContent = "Не удалось загрузить чаты";
        dom.left.empty.classList.remove("hidden");
      }
    }
  }

  function initComposer() {
    renderEmojiPicker();
    normalizeQuickReactionButtons();
    decorateComposerEmojiControls();
    ensureComposerReplyElements();
    renderComposerReply();
    setupComposerRichPreview();
    setComposerEnabled(false);
    syncComposerMode();

    if (dom.center.replyCloseBtn && dom.center.replyCloseBtn.dataset.bound !== "1") {
      dom.center.replyCloseBtn.dataset.bound = "1";
      dom.center.replyCloseBtn.addEventListener("click", () => {
        clearComposerReply();
        if (dom.center.input) dom.center.input.focus();
      });
    }

    if (dom.center.sendBtn) {
      dom.center.sendBtn.addEventListener("click", () => {
        if (!dom.center.input) return;
        const done = sendMessage(dom.center.input.value);
        if (!done) return;
        dom.center.input.value = "";
        dom.center.input.focus();
        syncComposerRichPreview({ stickToBottom: true });
      });
    }

    if (dom.center.input) {
      dom.center.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const done = sendMessage(dom.center.input.value);
          if (done) dom.center.input.value = "";
          if (done) syncComposerRichPreview({ stickToBottom: true });
          return;
        }

        if (event.key === "Escape" && state.editingMessageId) {
          cancelEditingMessage();
          dom.center.input.value = "";
          syncComposerRichPreview({ stickToBottom: true });
          return;
        }

        if (event.key === "Escape" && state.replyDraft) {
          clearComposerReply();
        }
      });
    }

    if (dom.center.attachBtn && dom.center.attachInput) {
      dom.center.attachBtn.addEventListener("click", () => dom.center.attachInput.click());
      dom.center.attachInput.addEventListener("change", async () => {
        const files = Array.from(dom.center.attachInput.files || []);
        await sendImageAttachments(files).catch(console.error);
        dom.center.attachInput.value = "";
        if (dom.center.input) dom.center.input.focus();
      });
    }

    if (dom.center.emojiBtn && dom.center.emojiPopover) {
      dom.center.emojiBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        dom.center.emojiPopover.classList.toggle("hidden");
      });

      document.addEventListener("click", (event) => {
        if (!dom.center.emojiPopover) return;
        const insidePopover = dom.center.emojiPopover.contains(event.target);
        const insideBtn = dom.center.emojiBtn && dom.center.emojiBtn.contains(event.target);
        if (!insidePopover && !insideBtn) dom.center.emojiPopover.classList.add("hidden");
      });
    }

    initMessageContextMenu();
  }

  function bindSearch() {
    if (!dom.left.search) return;
    dom.left.search.addEventListener("input", () => {
      state.q = dom.left.search.value || "";
      applyClientFilter();
    });
  }

  function init() {
    initComposer();
    initSelectionToolbar();
    bindSearch();
    renderChatHeader();
    syncSelectionUi();
    renderMessages();
    startRemoteSyncLoops();
    loadClients().catch(console.error);

    document.addEventListener("tenantStoreChanged", () => {
      loadClients().catch(console.error);
    });
  }

  init();
})();
