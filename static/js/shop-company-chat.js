(function () {
  const openBtn = document.getElementById("shopCompanyChatOpenBtn");
  const unreadBadge = document.getElementById("shopCompanyChatUnreadBadge");
  const overlay = document.getElementById("shopCompanyChatOverlay");
  const modalBody = overlay ? overlay.querySelector(".shop-company-chat-modal__body") : null;
  const closeBtn = document.getElementById("shopCompanyChatCloseBtn");
  const feed = document.getElementById("shopCompanyChatFeed");
  const thread = document.getElementById("shopCompanyChatThread");
  const composer = document.getElementById("shopCompanyChatComposer");
  const selectionToolbar = document.getElementById("shopCompanyChatSelectionToolbar");
  const selectionCloseBtn = document.getElementById("shopCompanyChatSelectionCloseBtn");
  const selectionCountEl = document.getElementById("shopCompanyChatSelectionCount");
  const selectionCopyBtn = document.getElementById("shopCompanyChatSelectionCopyBtn");
  const selectionDeleteBtn = document.getElementById("shopCompanyChatSelectionDeleteBtn");
  const attachBtn = document.getElementById("shopCompanyChatAttachBtn");
  const attachInput = document.getElementById("shopCompanyChatAttachmentInput");
  const attachPreviewOverlay = document.getElementById("shopCompanyChatAttachPreviewOverlay");
  const attachPreviewCloseBtn = document.getElementById("shopCompanyChatAttachPreviewCloseBtn");
  const attachPreviewTitle = document.getElementById("shopCompanyChatAttachPreviewTitle");
  const attachPreviewImage = document.getElementById("shopCompanyChatAttachPreviewImage");
  const attachPreviewThumbs = document.getElementById("shopCompanyChatAttachPreviewThumbs");
  const attachPreviewEmojiBtn = document.getElementById("shopCompanyChatAttachPreviewEmojiBtn");
  const attachPreviewCaption = document.getElementById("shopCompanyChatAttachPreviewCaption");
  const attachPreviewSendBtn = document.getElementById("shopCompanyChatAttachPreviewSendBtn");
  const imageViewerOverlay = document.getElementById("shopCompanyChatImageViewerOverlay");
  const imageViewerCloseBtn = document.getElementById("shopCompanyChatImageViewerCloseBtn");
  const imageViewerImage = document.getElementById("shopCompanyChatImageViewerImage");
  const input = document.getElementById("shopCompanyChatInput");
  const emojiBtn = document.getElementById("shopCompanyChatEmojiBtn");
  const emojiPopover = document.getElementById("shopCompanyChatEmojiPopover");
  const scrollDownBtn = document.getElementById("shopCompanyChatScrollDownBtn");
  const scrollDownBadge = document.getElementById("shopCompanyChatScrollDownBadge");
  const reactionBar = document.getElementById("shopCompanyChatReactionBar");

  if (!openBtn || !overlay || !modalBody || !closeBtn) return;
  if (!feed || !thread || !composer || !selectionToolbar || !selectionCloseBtn || !selectionCountEl || !selectionCopyBtn || !selectionDeleteBtn || !attachBtn || !attachInput || !attachPreviewOverlay || !attachPreviewCloseBtn || !attachPreviewTitle || !attachPreviewImage || !attachPreviewThumbs || !attachPreviewEmojiBtn || !attachPreviewCaption || !attachPreviewSendBtn || !imageViewerOverlay || !imageViewerCloseBtn || !imageViewerImage || !input || !emojiBtn || !emojiPopover || !scrollDownBtn || !reactionBar) return;

  const EMOJI_ASSET_BASE_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-google@15.1.2/img/google/64";
  const EMOJI_DATASET_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-google@15.1.2/emoji.json";
  const EMOJI_RECENT_STORAGE_KEY = "shop-company-chat-recent-emojis:v1";
  const EMOJI_CATEGORY_META = [
    { key: "recent", label: "Недавние", iconClass: "far fa-clock" },
    { key: "people", label: "Смайлы и люди", iconClass: "far fa-smile" },
    { key: "nature", label: "Животные и природа", iconClass: "fas fa-paw" },
    { key: "food", label: "Еда и напитки", iconClass: "fas fa-apple-whole" },
    { key: "activity", label: "Активности", iconClass: "far fa-futbol" },
    { key: "travel", label: "Путешествия", iconClass: "fas fa-car-side" },
    { key: "objects", label: "Объекты", iconClass: "far fa-lightbulb" },
    { key: "symbols", label: "Символы", iconClass: "fas fa-at" },
    { key: "flags", label: "Флаги", iconClass: "far fa-flag" },
  ];
  const EMOJI_FALLBACK_CATEGORIES = {
    people: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","😘","😗","😚","😋","😛","😜","🤪","🤨","🧐","🤓","😎","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫡","🤭","🫢","🤫","🤥","😶","🫠","😐","🫤","😑","😬","🙄","😮‍💨","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","❤️","💔","💯","👍","👎","👏","🙌","🙏","👋","🤝","💪"
    ],
    nature: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪲","🐞","🦋","🐌","🐢","🐍","🦎","🐙","🦑","🦞","🦀","🐬","🐳","🦈","🐊","🌵","🌲","🌳","🌴","🌷","🌸","🌹","🌺","🌻","🌼","🌿","☘️","🍀","🌱","🌈","⭐","🌙","☀️","🌧️","⛈️","❄️","🔥","🌊"],
    food: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🧄","🧅","🥔","🍠","🫚","🥐","🥖","🍞","🥨","🧀","🥚","🍳","🥞","🧇","🥓","🍗","🍖","🌭","🍔","🍟","🍕","🌮","🌯","🥙","🧆","🥪","🍝","🍜","🍣","🍤","🍱","🍛","🍚","🍙","🍘","🍥","🥟","🍦","🍰","🧁","🍪","🍫","🍿","🍩","🍮","☕","🍵","🧃","🥤","🍺","🍷"],
    activity: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","⛳","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎯","🎳","🎮","🕹️","🎲","🧩","♟️","🎨","🎭","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎬","📷","📸","🧘","🤸","⛹️","🏋️","🚴","🏊","🏄","🧗","🤾","🤽"],
    travel: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🚲","🛴","🚨","🚔","🚍","✈️","🛫","🛬","🚁","🚂","🚆","🚇","🚊","🚉","🚢","🛳️","⛵","🚤","🗽","🗼","🏰","🏯","🏟️","🎡","🎢","⛲","⛰️","🏔️","🗻","🏝️","🏜️","🌋","🏙️","🌆","🌃","🌉","🛣️","🛤️","🌁","🗺️","🧭","⛽"],
    objects: ["⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","📷","📹","🎥","📺","📻","🎙️","🎚️","📀","💿","📼","☎️","📞","🕰️","⏰","⏱️","⏲️","🧭","📡","🔋","🔌","💡","🔦","🕯️","🪫","🧯","🧲","🧰","🛠️","🔧","🔨","⚙️","⛓️","🧱","🪜","🧪","🧬","🔬","🔭","📌","✂️","🖊️","🖋️","📎","📁","🗂️","🗃️","🗄️","📦","🧳","🎁","🛒","💳","💵","💰","🔒","🔑"],
    symbols: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🪯","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆘","❌","⭕","🔴","🟠","🟡","🟢","🔵","🟣","⚪","⚫","▪️","▫️","◾","◽","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔳","🔲"],
    flags: ["🏳️","🏴","🏁","🚩","🏳️‍🌈","🏳️‍⚧️","🇷🇺","🇺🇸","🇬🇧","🇩🇪","🇫🇷","🇪🇸","🇮🇹","🇺🇦","🇰🇿","🇧🇾","🇦🇲","🇬🇪","🇦🇿","🇹🇷","🇨🇳","🇯🇵","🇰🇷","🇮🇳","🇧🇷","🇨🇦","🇦🇺","🇲🇽","🇦🇪","🇸🇦","🇮🇱","🇵🇱","🇳🇱","🇸🇪","🇳🇴","🇫🇮","🇨🇭","🇦🇹","🇨🇿","🇸🇰","🇷🇴","🇧🇬","🇷🇸","🇭🇷","🇸🇮","🇪🇪","🇱🇻","🇱🇹","🇵🇹","🇬🇷"]
  };
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
  const CHAT_THREAD_SAVE_DEBOUNCE_MS = 35;
  const CHAT_THREAD_POLL_MS = 250;
  const CHAT_AUTOSCROLL_MS = 170;
  const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
  const IMAGE_OPTIMIZE_SKIP_BELOW_BYTES = 700 * 1024;
  const IMAGE_OPTIMIZE_TARGET_BYTES = 900 * 1024;
  const IMAGE_OPTIMIZE_MAX_SIDE_PX = 1600;
  const IMAGE_OPTIMIZE_MIN_SIDE_PX = 900;
  const IMAGE_OPTIMIZE_INITIAL_QUALITY = 0.86;
  const IMAGE_OPTIMIZE_MIN_QUALITY = 0.58;
  const IMAGE_OPTIMIZE_SCALE_STEP = 0.84;
  const CHAT_REACTION_ACTOR = "in";

  let emojiAssetsState = "unknown";
  let emojiCategories = {};
  let emojiRecentList = [];
  let emojiActiveCategory = "people";
  let emojiDatasetPromise = null;

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

  const VIRTUAL_ASSISTANT_NAME = "Электроник";
  const DAILY_WELCOME_TEXT =
    "Привет! Я виртуальный помощник, Электроник!\n" +
    "Если ваш вопрос по заказу, то сегодня сталкиваемся со сложностями из-за погодных условий: можем везти покупку чуть дольше.";
  const DAILY_OPTIONS_TEXT = "Чтобы я смог вам помочь, выберите категорию ниже:";

  const baseEntries = [];

  const INITIAL_BATCH = 3;
  const OLDER_BATCH = 4;

  let initialized = false;
  let isLoadingOlder = false;
  let visibleStart = baseEntries.length;
  let liveEntries = [];
  let messageSeq = 0;
  let sharedThreadUpdatedAt = "";
  let sharedThreadPollTimer = 0;
  let sharedThreadMetaPollInFlight = false;
  let sharedThreadSaveTimer = 0;
  let sharedThreadSaveInFlight = false;
  let sharedThreadMutationVersion = 0;
  let profileMergeInFlight = false;
  let feedScrollRaf = 0;
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
  let attachPreviewItems = [];
  let attachPreviewActiveIndex = 0;
  let pendingFeedNewCount = 0;
  let pendingFeedMessageIds = new Set();
  let hasLoadedSharedThreadOnce = false;
  let lastFeedScrollTop = null;
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

  function ensureScrollDownBadge() {
    if (scrollDownBadge && scrollDownBadge.isConnected) return scrollDownBadge;
    const existing = scrollDownBtn.querySelector("#shopCompanyChatScrollDownBadge");
    if (existing) return existing;

    const node = document.createElement("span");
    node.id = "shopCompanyChatScrollDownBadge";
    node.className = "shop-company-chat-scroll-down-badge hidden";
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    scrollDownBtn.appendChild(node);
    return node;
  }

  function isFeedPinnedToBottom() {
    return (feed.scrollHeight - feed.clientHeight - feed.scrollTop) <= 28;
  }

  function animateCountBadgeTick(badge) {
    if (!badge) return;
    badge.classList.remove("is-count-tick");
    // Force reflow for repeated animation on each value change.
    // eslint-disable-next-line no-unused-expressions
    badge.offsetWidth;
    badge.classList.add("is-count-tick");
  }

  function addPendingFeedMessageIds(ids) {
    const list = Array.isArray(ids) ? ids : [];
    if (!list.length) return;
    let changed = false;
    list.forEach(function (id) {
      const value = String(id || "");
      if (!value || pendingFeedMessageIds.has(value)) return;
      pendingFeedMessageIds.add(value);
      changed = true;
    });
    if (!changed) return;
    pendingFeedNewCount = pendingFeedMessageIds.size;
    updateScrollDownButton();
  }

  function clearPendingFeedNewCount() {
    if (pendingFeedMessageIds.size <= 0 && pendingFeedNewCount <= 0) return;
    pendingFeedMessageIds.clear();
    pendingFeedNewCount = 0;
    updateScrollDownButton();
  }

  function syncPendingFeedCountByViewport() {
    if (!pendingFeedMessageIds.size) return;
    const topEdge = feed.getBoundingClientRect().top + 6;
    const bottomEdge = feed.getBoundingClientRect().bottom - 6;
    if (bottomEdge <= topEdge) return;

    let changed = false;
    const nodeById = new Map();
    thread.querySelectorAll(".shop-company-chat-row[data-message-id]").forEach(function (row) {
      const id = String(row.getAttribute("data-message-id") || "");
      if (!id) return;
      nodeById.set(id, row);
    });

    Array.from(pendingFeedMessageIds).forEach(function (id) {
      const node = nodeById.get(id);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const isVisible = rect.bottom > topEdge && rect.top < bottomEdge;
      if (!isVisible) return;
      pendingFeedMessageIds.delete(id);
      changed = true;
    });

    if (!changed) return;
    pendingFeedNewCount = pendingFeedMessageIds.size;
    updateScrollDownButton();
  }

  function saveFeedScrollPosition() {
    if (!feed) return;
    lastFeedScrollTop = feed.scrollTop;
  }

  function restoreFeedScrollPosition() {
    if (!Number.isFinite(lastFeedScrollTop)) return false;
    const maxTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    feed.scrollTop = Math.max(0, Math.min(lastFeedScrollTop, maxTop));
    updateScrollDownButton();
    return true;
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

  function isChatTabActiveForRead() {
    if (typeof document === "undefined") return true;
    if (document.visibilityState && document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return true;
  }

  function shouldMarkAgentMessagesRead() {
    return overlay.classList.contains("is-open") && isChatTabActiveForRead();
  }

  function applyReadReceiptsToAgentEntries(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const shouldMarkRead = shouldMarkAgentMessagesRead();
    const nowIso = new Date().toISOString();
    let changed = false;

    list.forEach(function (entry) {
      if (!entry || entry.role !== "agent") return;

      const rawStatus = String(entry.deliveryStatus || "").toLowerCase();
      const isRead = entry.read === true || !!entry.readAt || rawStatus === "read";
      const isDelivered = !!entry.deliveredAt || rawStatus === "delivered" || isRead;

      if (!isDelivered) {
        entry.deliveryStatus = "delivered";
        entry.deliveredAt = entry.deliveredAt || nowIso;
        changed = true;
      }

      if (!shouldMarkRead) return;

      if (!isRead) {
        entry.read = true;
        entry.deliveryStatus = "read";
        entry.deliveredAt = entry.deliveredAt || nowIso;
        entry.readAt = entry.readAt || nowIso;
        changed = true;
        return;
      }

      if (rawStatus !== "read") {
        entry.deliveryStatus = "read";
        if (!entry.readAt) entry.readAt = nowIso;
        changed = true;
      }
    });

    return changed;
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

  function markSharedThreadMutated() {
    sharedThreadMutationVersion += 1;
  }

  function compareIsoDates(a, b) {
    const ta = a ? new Date(String(a)).getTime() : 0;
    const tb = b ? new Date(String(b)).getTime() : 0;
    const safeA = Number.isFinite(ta) ? ta : 0;
    const safeB = Number.isFinite(tb) ? tb : 0;
    if (safeA > safeB) return 1;
    if (safeA < safeB) return -1;
    return 0;
  }

  function ensureGuestChatClientId(forceNew) {
    const rotate = forceNew === true;
    let storedGuestId = rotate ? 0 : Number(localStorage.getItem(guestChatClientKey) || 0);
    if (!Number.isFinite(storedGuestId) || storedGuestId <= 0) {
      storedGuestId = 900000000 + Math.floor(Math.random() * 99999999);
    }
    try { localStorage.setItem(guestChatClientKey, String(storedGuestId)); } catch {}
    return Math.trunc(storedGuestId);
  }

  function resolveChatClientProfile(options) {
    const opts = options || {};
    const customer = getCustomerCache();
    const token = getCustomerToken();
    const directId = Number(customer && customer.id);
    if (token) {
      if (Number.isFinite(directId) && directId > 0) {
        return {
          id: Math.trunc(directId),
          name: String(customer.name || "Клиент"),
          phone: String(customer.phone || ""),
          isGuest: false,
        };
      }

      const hashed = 800000000 + (hashToStableInt(token) % 99999999);
      return {
        id: Math.trunc(hashed),
        name: String((customer && customer.name) || "Клиент"),
        phone: String((customer && customer.phone) || ""),
        isGuest: false,
      };
    }

    const guestId = ensureGuestChatClientId(opts.forceNewGuest === true);
    return {
      id: Math.trunc(guestId),
      name: "Гость",
      phone: "",
      isGuest: true,
    };
  }

  function buildLocalHiddenMessagesKey(clientId) {
    const id = Number(clientId);
    const safeId = Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0;
    return "shop_company_chat_hidden_messages_t" + tenantId + "_c" + String(safeId);
  }

  function normalizeChatClientProfile(profile) {
    const source = profile && typeof profile === "object" ? profile : {};
    const id = Number(source.id);
    return {
      id: Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0,
      name: String(source.name || "Клиент"),
      phone: String(source.phone || ""),
      isGuest: source.isGuest === true,
    };
  }

  function getActiveChatClientId() {
    return String(chatClientProfile && chatClientProfile.id || "");
  }

  function isSameChatClientProfile(left, right) {
    return (
      Number(left && left.id || 0) === Number(right && right.id || 0)
      && !!(left && left.isGuest) === !!(right && right.isGuest)
    );
  }

  let chatClientProfile = normalizeChatClientProfile(resolveChatClientProfile());
  let localHiddenMessagesKey = buildLocalHiddenMessagesKey(chatClientProfile.id);
  let localHiddenMessageIds = loadLocalHiddenMessageIds();
  let sharedThreadMeta = {
    name: String(chatClientProfile.name || "Клиент"),
    phone: String(chatClientProfile.phone || ""),
    lastWelcomeDay: "",
  };

  async function mergeGuestThreadIntoCustomerThread(guestClientId, customerClientId) {
    const fromId = Number(guestClientId || 0);
    const toId = Number(customerClientId || 0);
    if (!Number.isFinite(fromId) || fromId <= 0) return false;
    if (!Number.isFinite(toId) || toId <= 0) return false;
    if (fromId === toId) return false;

    await chatApiJson(CHAT_TEMP_API_BASE + "/thread/merge", {
      method: "POST",
      body: {
        from_client_id: fromId,
        to_client_id: toId,
      },
    });
    return true;
  }

  function refreshChatClientProfileIfNeeded(options) {
    const opts = options || {};
    const currentProfile = normalizeChatClientProfile(chatClientProfile);
    let nextProfile = normalizeChatClientProfile(resolveChatClientProfile());

    // After logout a new guest must start with a fresh chat id.
    if (!currentProfile.isGuest && nextProfile.isGuest) {
      nextProfile = normalizeChatClientProfile(resolveChatClientProfile({ forceNewGuest: true }));
    }

    if (isSameChatClientProfile(currentProfile, nextProfile)) {
      chatClientProfile = nextProfile;
      return false;
    }

    const shouldMergeGuestIntoCustomer = (
      currentProfile.isGuest === true
      && nextProfile.isGuest === false
      && Number(currentProfile.id) > 0
      && Number(nextProfile.id) > 0
      && Number(currentProfile.id) !== Number(nextProfile.id)
    );

    chatClientProfile = nextProfile;
    localHiddenMessagesKey = buildLocalHiddenMessagesKey(chatClientProfile.id);
    localHiddenMessageIds = loadLocalHiddenMessageIds();

    if (sharedThreadSaveTimer) {
      clearTimeout(sharedThreadSaveTimer);
      sharedThreadSaveTimer = 0;
    }

    sharedThreadUpdatedAt = "";
    sharedThreadMutationVersion = 0;
    hasLoadedSharedThreadOnce = false;
    sharedPullInFlight = false;
    sharedThreadMetaPollInFlight = false;
    lastFeedScrollTop = null;
    clearPendingFeedNewCount();

    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    closeAttachPreview({ focusComposer: false, clearItems: true, clearCaption: true });

    if (selectedMessageIds.size > 0) selectedMessageIds.clear();
    cancelEditingMessage();
    if (replyDraft) clearReplyDraft();
    input.value = "";
    syncComposerRichPreview({});

    liveEntries = [];
    visibleStart = baseEntries.length;
    loadOlderMessages(INITIAL_BATCH, false);
    sharedThreadMeta = {
      name: String(chatClientProfile.name || "Клиент"),
      phone: String(chatClientProfile.phone || ""),
      lastWelcomeDay: "",
    };

    renderThread();
    updateScrollDownButton();
    renderUnreadBadge(liveEntries);

    const activeClientIdAfterSwitch = String(chatClientProfile.id || "");
    const continueWithPull = function () {
      if (opts.pull === false) return;
      if (String(chatClientProfile.id || "") !== activeClientIdAfterSwitch) return;
      pullSharedThreadFromServer({ force: true }).catch(function () {});
    };

    if (shouldMergeGuestIntoCustomer) {
      profileMergeInFlight = true;
      mergeGuestThreadIntoCustomerThread(currentProfile.id, nextProfile.id)
        .catch(function () {})
        .finally(function () {
          profileMergeInFlight = false;
          continueWithPull();
        });
    } else {
      continueWithPull();
    }
    return true;
  }

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
    const messageId = String(message.id || "");
    const isDailyWelcome = /^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(messageId);
    const direction = String(message.direction || "").toLowerCase() === "out" ? "out" : "in";
    const createdAt = String(message.createdAt || new Date().toISOString());
    const role = direction === "in" ? "user" : "agent";
    const editedAt = String(message.editedAt || "");
    const reactions = sanitizeReactionsMap(message.reactions);
    const legacyReaction = String(message.reaction || "").trim();
    if (!reactions.in && !reactions.out && legacyReaction) reactions[direction] = legacyReaction;

    return {
      id: messageId,
      type: "message",
      role: role,
      day: formatDayLabelFromIso(createdAt),
      time: formatTimeFromIso(createdAt) + (editedAt ? " • изм." : ""),
      text: isDailyWelcome ? DAILY_WELCOME_TEXT : String(message.text || ""),
      author: role === "agent" ? VIRTUAL_ASSISTANT_NAME : "",
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
      reaction: String(reactions[CHAT_REACTION_ACTOR] || ""),
      reactions: reactions,
      deliveryStatus: String(message.deliveryStatus || ""),
      createdAt: createdAt,
      editedAt: editedAt,
      read: message.read === true,
      deliveredAt: String(message.deliveredAt || ""),
      readAt: String(message.readAt || ""),
    };
  }

  function sanitizeSharedThreadMeta(meta) {
    const source = meta && typeof meta === "object" ? meta : {};
    const rawLastWelcomeDay = String(source.last_welcome_day || source.lastWelcomeDay || "").trim();
    const normalizedLastWelcomeDay = /^\d{4}-\d{2}-\d{2}$/.test(rawLastWelcomeDay) ? rawLastWelcomeDay : "";
    return {
      name: String(source.name || chatClientProfile.name || "Клиент"),
      phone: String(source.phone || chatClientProfile.phone || ""),
      lastWelcomeDay: normalizedLastWelcomeDay,
    };
  }

  function mapEntryToSharedMessage(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = String(entry.id || "").trim();
    if (!id) return null;
    const direction = entry.role === "user" ? "in" : "out";
    const status = (function resolveStatus() {
      if (direction === "in") return getOutgoingDeliveryStatus(entry);
      const raw = String(entry.deliveryStatus || "").toLowerCase();
      if (entry.read === true || entry.readAt || raw === "read") return "read";
      if (entry.deliveredAt || raw === "delivered") return "delivered";
      if (raw === "sent") return "sent";
      return "sent";
    })();
    const reactions = ensureEntryReactions(entry);
    const senderReaction = String(reactions[direction] || "");
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
      reaction: senderReaction,
      reactions: {
        in: String(reactions.in || ""),
        out: String(reactions.out || ""),
      },
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
    const metaState = sanitizeSharedThreadMeta(sharedThreadMeta);
    sharedThreadMeta = metaState;
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return;
    sharedThreadSaveInFlight = true;
    try {
      const json = await chatApiJson(
        CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId),
        {
          method: "PUT",
          body: {
            messages: payload,
            meta: {
              name: String(metaState.name || "Клиент"),
              phone: String(metaState.phone || ""),
              last_welcome_day: String(metaState.lastWelcomeDay || ""),
            },
          },
        }
      );
      if (requestClientId !== getActiveChatClientId()) return;
      const updatedAt = String(json && json.data && json.data.updated_at || "");
      if (updatedAt) sharedThreadUpdatedAt = updatedAt;
    } finally {
      sharedThreadSaveInFlight = false;
    }
  }

  function applySharedRemoteEntries(mappedEntries, updatedAt, options) {
    const opts = options || {};
    const entries = Array.isArray(mappedEntries) ? mappedEntries : [];
    const remoteUpdatedAt = String(updatedAt || "");

    pruneLocalHiddenMessageIds(baseEntries.concat(entries));
    const deliveryStateChanged = applyReadReceiptsToAgentEntries(entries);
    renderUnreadBadge(entries);
    const sameThread = stableSerialize(liveEntries) === stableSerialize(entries);
    const hasPendingLocalSave = !!sharedThreadSaveTimer || sharedThreadSaveInFlight;
    const localChangedDuringRequest = opts.localChangedDuringRequest === true;
    const remoteIsNewer = compareIsoDates(remoteUpdatedAt, sharedThreadUpdatedAt) > 0;

    if (!opts.force && !sameThread) {
      if (hasPendingLocalSave) return false;
      if (localChangedDuringRequest && !remoteIsNewer) return false;
    }

    if (!opts.force && sameThread && sharedThreadUpdatedAt === remoteUpdatedAt) {
      if (deliveryStateChanged) queueSharedThreadSave();
      return false;
    }

    const previousMessageIds = new Set(
      (Array.isArray(liveEntries) ? liveEntries : [])
        .filter(function (entry) { return entry && entry.type === "message"; })
        .map(function (entry) { return String(entry.id || ""); })
        .filter(Boolean)
    );
    const appendedAgentMessageIds = entries
      .filter(function (entry) {
        return entry && entry.type === "message" && entry.role === "agent";
      })
      .map(function (entry) {
        return String(entry.id || "");
      })
      .filter(function (id) {
        return id && !previousMessageIds.has(id);
      });

    const prevTop = feed.scrollTop;
    liveEntries = entries;
    sharedThreadUpdatedAt = remoteUpdatedAt;
    renderThread();
    feed.scrollTop = prevTop;
    updateScrollDownButton();
    if (hasLoadedSharedThreadOnce && appendedAgentMessageIds.length > 0) {
      addPendingFeedMessageIds(appendedAgentMessageIds);
    }
    hasLoadedSharedThreadOnce = true;
    if (deliveryStateChanged) queueSharedThreadSave();
    return true;
  }

  async function pullSharedThreadFromServer(options) {
    if (profileMergeInFlight) return false;
    if (sharedPullInFlight) return false;
    const localMutationVersionBeforePull = sharedThreadMutationVersion;
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return false;
    sharedPullInFlight = true;
    try {
      const opts = options || {};
      const json = await chatApiJson(
        CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "?_ts=" + Date.now()
      );
      if (requestClientId !== getActiveChatClientId()) return false;
      const payload = json && json.data ? json.data : {};
      const updatedAt = String(payload.updated_at || "");
      sharedThreadMeta = sanitizeSharedThreadMeta(payload.meta);

      const remoteMessages = Array.isArray(payload.messages) ? payload.messages : [];
      const mappedEntries = remoteMessages
        .map(mapSharedMessageToEntry)
        .filter(Boolean);
      const localChangedDuringRequest = sharedThreadMutationVersion !== localMutationVersionBeforePull;
      return applySharedRemoteEntries(mappedEntries, updatedAt, { ...opts, localChangedDuringRequest });
    } finally {
      sharedPullInFlight = false;
    }
  }

  async function fetchSharedThreadMetaFromServer() {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return null;
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/meta?_ts=" + Date.now()
    );
    if (requestClientId !== getActiveChatClientId()) return null;
    const payload = json && json.data ? json.data : {};
    return {
      clientId: requestClientId,
      updatedAt: String(payload.updated_at || ""),
    };
  }

  async function fetchSharedThreadDiffFromServer(sinceUpdatedAt) {
    const since = String(sinceUpdatedAt || "").trim();
    if (!since) return null;
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return null;
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE
      + "/thread/" + encodeURIComponent(requestClientId)
      + "/diff?since=" + encodeURIComponent(since)
      + "&_ts=" + Date.now()
    );
    if (requestClientId !== getActiveChatClientId()) return null;
    const payload = json && json.data ? json.data : {};
    return {
      clientId: requestClientId,
      updatedAt: String(payload.updated_at || ""),
      messageCount: Number(payload.message_count || 0),
      messages: Array.isArray(payload.messages) ? payload.messages : [],
    };
  }

  function applySharedThreadDiff(diff, options) {
    const opts = options || {};
    if (!diff || typeof diff !== "object") return null;

    const previousMessages = (Array.isArray(liveEntries) ? liveEntries : [])
      .filter(function (entry) { return entry && entry.type === "message"; });
    const expectedCount = Number(diff.messageCount);
    if (Number.isFinite(expectedCount) && expectedCount >= 0 && expectedCount < previousMessages.length) {
      return null;
    }

    const changedMessages = Array.isArray(diff.messages) ? diff.messages : [];
    if (!changedMessages.length) {
      if (diff.updatedAt) sharedThreadUpdatedAt = String(diff.updatedAt);
      return false;
    }

    const byId = new Map();
    previousMessages.forEach(function (entry) {
      const id = String(entry && entry.id || "");
      if (!id) return;
      byId.set(id, entry);
    });
    changedMessages.forEach(function (rawMessage) {
      const mapped = mapSharedMessageToEntry(rawMessage);
      if (!mapped) return;
      const id = String(mapped.id || "");
      if (!id) return;
      byId.set(id, mapped);
    });

    const mergedEntries = Array.from(byId.values()).sort(function (a, b) {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

    if (Number.isFinite(expectedCount) && expectedCount >= 0 && expectedCount !== mergedEntries.length) {
      return null;
    }

    return applySharedRemoteEntries(mergedEntries, String(diff.updatedAt || ""), opts);
  }

  async function pullSharedThreadFromServerIfChanged(options) {
    const opts = options || {};
    if (profileMergeInFlight) return false;
    if (opts.force === true) {
      return pullSharedThreadFromServer(opts);
    }

    try {
      const meta = await fetchSharedThreadMetaFromServer();
      if (!meta || meta.clientId !== getActiveChatClientId()) return false;
      const remoteUpdatedAt = String(meta && meta.updatedAt || "");
      const knownUpdatedAt = String(sharedThreadUpdatedAt || "");
      if (remoteUpdatedAt && knownUpdatedAt && remoteUpdatedAt === knownUpdatedAt) {
        return false;
      }
      if (!remoteUpdatedAt && !knownUpdatedAt) {
        return false;
      }

      if (knownUpdatedAt) {
        const mutationVersionBefore = sharedThreadMutationVersion;
        try {
          const diff = await fetchSharedThreadDiffFromServer(knownUpdatedAt);
          if (diff) {
            if (diff.clientId !== getActiveChatClientId()) return false;
            const localChangedDuringRequest = sharedThreadMutationVersion !== mutationVersionBefore;
            const applied = applySharedThreadDiff(diff, { ...opts, localChangedDuringRequest });
            if (applied !== null) return applied;
          }
        } catch {}
      }

      return pullSharedThreadFromServer(opts);
    } catch {
      return pullSharedThreadFromServer(opts);
    }
  }

  function startSharedThreadPolling() {
    if (sharedThreadPollTimer) return;
    sharedThreadPollTimer = window.setInterval(function () {
      refreshChatClientProfileIfNeeded({ pull: false });
      if (sharedThreadMetaPollInFlight) return;
      sharedThreadMetaPollInFlight = true;
      pullSharedThreadFromServerIfChanged({ force: false })
        .catch(function () {})
        .finally(function () {
          sharedThreadMetaPollInFlight = false;
        });
    }, CHAT_THREAD_POLL_MS);
  }

  function stopSharedThreadPolling() {
    if (!sharedThreadPollTimer) return;
    clearInterval(sharedThreadPollTimer);
    sharedThreadPollTimer = 0;
  }

  function syncVisibleChatReadState() {
    if (!overlay.classList.contains("is-open")) return false;
    if (!isChatTabActiveForRead()) return false;
    const keepBottom = shouldKeepFeedPinnedToBottom();
    const prevTop = feed.scrollTop;
    const changed = applyReadReceiptsToAgentEntries(liveEntries);
    renderUnreadBadge(liveEntries);
    if (!changed) return false;
    markSharedThreadMutated();
    renderThread();
    if (keepBottom) {
      scrollToBottom(false);
    } else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }
    queueSharedThreadSave();
    return true;
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

  function normalizeComposerText(text) {
    const raw = String(text || "").replace(/\r/g, "");
    if (!raw) return "";
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
    return hasEmojiInText(raw) ? raw : "";
  }

  function normalizeReactionValue(value) {
    return String(value || "")
      .trim()
      .normalize("NFC")
      .replace(/\uFE0F/g, "");
  }

  function sanitizeReactionsMap(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      in: String(source.in || "").trim(),
      out: String(source.out || "").trim(),
    };
  }

  function ensureEntryReactions(entry) {
    if (!entry || typeof entry !== "object") return { in: "", out: "" };
    const reactions = sanitizeReactionsMap(entry.reactions);
    const legacy = String(entry.reaction || "").trim();
    if (!reactions.in && !reactions.out && legacy) {
      const fallbackActor = entry.role === "user" ? "in" : "out";
      reactions[fallbackActor] = legacy;
    }
    entry.reactions = reactions;
    entry.reaction = String(reactions[CHAT_REACTION_ACTOR] || "");
    return reactions;
  }

  function getEntryActorReaction(entry, actor) {
    const reactions = ensureEntryReactions(entry);
    const actorKey = actor === "out" ? "out" : "in";
    return String(reactions[actorKey] || "");
  }

  function setEntryActorReaction(entry, actor, reaction) {
    if (!entry || typeof entry !== "object") return false;
    const actorKey = actor === "out" ? "out" : "in";
    const next = String(reaction || "").trim();
    const reactions = ensureEntryReactions(entry);
    const current = String(reactions[actorKey] || "");
    const toggled = normalizeReactionValue(current) === normalizeReactionValue(next) ? "" : next;
    if (current === toggled) return false;
    reactions[actorKey] = toggled;
    entry.reactions = reactions;
    entry.reaction = String(reactions[CHAT_REACTION_ACTOR] || "");
    return true;
  }

  function getEntryReactionItems(entry) {
    const reactions = ensureEntryReactions(entry);
    const items = [];
    const outReaction = String(reactions.out || "");
    const inReaction = String(reactions.in || "");
    if (outReaction) items.push({ actor: "out", reaction: outReaction });
    if (inReaction) items.push({ actor: "in", reaction: inReaction });
    return items;
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
    return String(entry.author || VIRTUAL_ASSISTANT_NAME);
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

  function estimateDataUrlSizeBytes(dataUrl) {
    const text = String(dataUrl || "");
    const commaIdx = text.indexOf(",");
    if (commaIdx < 0) return text.length;
    const base64 = text.slice(commaIdx + 1);
    return Math.floor((base64.length * 3) / 4);
  }

  function getDataUrlMime(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
    return match ? String(match[1] || "").toLowerCase() : "";
  }

  function shouldSkipImageOptimization(mime, fileSizeBytes) {
    const type = String(mime || "").toLowerCase();
    if (!type.startsWith("image/")) return true;
    if (type === "image/gif" || type === "image/svg+xml") return true;
    const size = Number(fileSizeBytes || 0);
    return Number.isFinite(size) && size > 0 && size <= IMAGE_OPTIMIZE_SKIP_BELOW_BYTES;
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("IMAGE_LOAD_FAILED"));
      };
      img.src = objectUrl;
    });
  }

  function getScaledDimensions(width, height, maxSide) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const limit = Math.max(1, Number(maxSide) || 1);
    const longest = Math.max(w, h);
    if (longest <= limit) return { width: w, height: h };
    const ratio = limit / longest;
    return {
      width: Math.max(1, Math.round(w * ratio)),
      height: Math.max(1, Math.round(h * ratio)),
    };
  }

  function renderImageToDataUrl(image, mime, quality, maxSide) {
    const dims = getScaledDimensions(image.naturalWidth, image.naturalHeight, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("CANVAS_CONTEXT_FAILED");
    ctx.drawImage(image, 0, 0, dims.width, dims.height);
    const dataUrl = canvas.toDataURL(mime, quality);
    return {
      dataUrl: String(dataUrl || ""),
      width: dims.width,
      height: dims.height,
      mime: getDataUrlMime(dataUrl) || String(mime || "").toLowerCase(),
      size: estimateDataUrlSizeBytes(dataUrl),
    };
  }

  async function buildOptimizedImagePayload(file, fallbackMime) {
    const image = await loadImageFromFile(file);
    const preferredMime = (
      String(fallbackMime || "").toLowerCase() === "image/webp"
        ? "image/webp"
        : "image/jpeg"
    );
    let maxSide = IMAGE_OPTIMIZE_MAX_SIDE_PX;
    let quality = IMAGE_OPTIMIZE_INITIAL_QUALITY;
    let best = null;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const current = renderImageToDataUrl(image, preferredMime, quality, maxSide);
      if (!best || current.size < best.size) best = current;

      const fitsTarget = current.size <= IMAGE_OPTIMIZE_TARGET_BYTES;
      const fitsHardLimit = current.dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH;
      if (fitsTarget && fitsHardLimit) return current;

      if (quality > IMAGE_OPTIMIZE_MIN_QUALITY + 0.02) {
        quality = Math.max(IMAGE_OPTIMIZE_MIN_QUALITY, quality - 0.1);
      } else {
        const nextSide = Math.max(IMAGE_OPTIMIZE_MIN_SIDE_PX, Math.round(maxSide * IMAGE_OPTIMIZE_SCALE_STEP));
        if (nextSide === maxSide) break;
        maxSide = nextSide;
      }
    }

    return best;
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

    let dataUrl = "";
    let outputMime = mime || "image/jpeg";
    let dimensions = { width: 0, height: 0 };
    let payloadSize = Number(file.size) || 0;

    const skipOptimization = shouldSkipImageOptimization(mime, file.size);
    if (!skipOptimization) {
      const optimized = await buildOptimizedImagePayload(file, mime).catch(function () { return null; });
      if (optimized && /^data:image\/[a-z0-9.+-]+;base64,/i.test(optimized.dataUrl)) {
        dataUrl = optimized.dataUrl;
        outputMime = String(optimized.mime || outputMime || "image/jpeg");
        dimensions = {
          width: Number(optimized.width) || 0,
          height: Number(optimized.height) || 0,
        };
        payloadSize = Number(optimized.size) || payloadSize;
      }
    }

    if (!dataUrl) {
      dataUrl = await readFileAsDataUrl(file);
      if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) return null;
      outputMime = getDataUrlMime(dataUrl) || outputMime;
      dimensions = await getImageSizeFromDataUrl(dataUrl);
      payloadSize = estimateDataUrlSizeBytes(dataUrl);
    }

    if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return null;
    return {
      kind: "image",
      name: String(file.name || "image").slice(0, 160),
      mime: outputMime || "image/jpeg",
      dataUrl: dataUrl,
      width: Number.isFinite(dimensions.width) && dimensions.width > 0 ? dimensions.width : 0,
      height: Number.isFinite(dimensions.height) && dimensions.height > 0 ? dimensions.height : 0,
      size: Number.isFinite(payloadSize) && payloadSize > 0 ? payloadSize : 0,
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
    refreshChatClientProfileIfNeeded({ pull: false });
    if (!initialized) {
      resetConversation();
      initialized = true;
    }
    closeAttachPreview({ focusComposer: false });
    hideEmojiPopover();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("shop-company-chat-open");
    requestAnimationFrame(function () {
      pullSharedThreadFromServer({ force: true })
        .catch(function () { return false; })
        .finally(function () {
          const welcomeAdded = ensureDailyWelcomeMessage();
          if (welcomeAdded) {
            renderThread();
            queueSharedThreadSave();
          }
          startSharedThreadPolling();
          const restored = restoreFeedScrollPosition();
          if (!restored) {
            scrollToBottom(false, true);
          } else {
            syncPendingFeedCountByViewport();
            updateScrollDownButton();
          }
          syncComposerRichPreview({});
          input.focus();
          syncVisibleChatReadState();
        });
    });
  }

  function closeCompanyChat() {
    saveFeedScrollPosition();
    closeAttachPreview({ focusComposer: false });
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    if (selectedMessageIds.size > 0) clearSelectionMode();
    if (pendingDeleteConfirm) closeDeleteConfirm();
    cancelEditingMessage();
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
    scrollToBottom(false, true);
  }

  function nowTime() {
    const date = new Date();
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  function getLocalDayKey(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
    if (Number.isNaN(date.getTime())) return "";
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }

  function ensureDailyWelcomeMessage() {
    const dayKey = getLocalDayKey(new Date());
    if (!dayKey) return false;

    const metaState = sanitizeSharedThreadMeta(sharedThreadMeta);
    if (metaState.lastWelcomeDay === dayKey) return false;

    const welcomeId = "daily-welcome-" + dayKey;
    const existsInBase = baseEntries.some(function (entry) {
      return String(entry && entry.id || "") === welcomeId;
    });
    const existsInLive = liveEntries.some(function (entry) {
      return String(entry && entry.id || "") === welcomeId;
    });
    if (existsInBase || existsInLive) {
      sharedThreadMeta = {
        name: metaState.name,
        phone: metaState.phone,
        lastWelcomeDay: dayKey,
      };
      return false;
    }

    const nowIso = new Date().toISOString();
    liveEntries.push({
      id: welcomeId,
      type: "message",
      role: "agent",
      day: formatDayLabelFromIso(nowIso),
      time: formatTimeFromIso(nowIso),
      text: DAILY_WELCOME_TEXT,
      author: VIRTUAL_ASSISTANT_NAME,
      createdAt: nowIso,
      editedAt: "",
      read: true,
      deliveryStatus: "read",
      deliveredAt: nowIso,
      readAt: nowIso,
      reaction: "",
      reactions: { in: "", out: "" },
    });
    markSharedThreadMutated();
    sharedThreadMeta = {
      name: metaState.name,
      phone: metaState.phone,
      lastWelcomeDay: dayKey,
    };
    renderUnreadBadge(liveEntries);
    return true;
  }

  function getAllEntries() {
    const rawEntries = baseEntries
      .slice(visibleStart)
      .concat(liveEntries)
      .filter(function (entry) {
        return !isMessageHiddenLocally(entry && entry.id);
      });

    const hasOptionsById = new Set(
      rawEntries
        .filter(function (entry) { return entry && entry.type === "options"; })
        .map(function (entry) { return String(entry && entry.id || ""); })
        .filter(Boolean)
    );

    const withDailyPair = [];
    rawEntries.forEach(function (entry) {
      withDailyPair.push(entry);
      const dayKey = getDailyWelcomeDayKey(entry);
      if (!dayKey) return;

      const optionsId = "daily-welcome-options-" + dayKey;
      if (hasOptionsById.has(optionsId)) return;

      withDailyPair.push({
        id: optionsId,
        type: "options",
        role: "agent",
        day: String(entry.day || ""),
        time: String(entry.time || ""),
        text: DAILY_OPTIONS_TEXT,
        options: QUICK_OPTIONS.slice(),
      });
      hasOptionsById.add(optionsId);
    });

    return withDailyPair;
  }

  function getDailyWelcomeDayKey(entry) {
    if (!entry || entry.type !== "message") return "";
    const id = String(entry.id || "");
    if (!id.startsWith("daily-welcome-")) return "";
    const key = id.slice("daily-welcome-".length);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
  }

  function getMessageEntries() {
    return baseEntries
      .concat(liveEntries)
      .filter(function (entry) {
        if (!entry || entry.type !== "message") return false;
        return !isMessageHiddenLocally(entry.id);
      })
      .map(function (entry) {
        ensureEntryReactions(entry);
        return entry;
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
    syncComposerRichPreview({});
    return true;
  }

  function updateMessageTextById(messageId, textValue) {
    const id = String(messageId || "");
    if (!id) return false;

    const nextText = normalizeComposerText(textValue);
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
    if (inLive) markSharedThreadMutated();

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
    if (!entry) return false;
    if (!setMessageHiddenLocally(id, true)) return false;

    selectedMessageIds.delete(id);
    if (String(replyDraft && replyDraft.id || "") === id) clearReplyDraft();
    if (String(editingMessageId || "") === id) {
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({});
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
    overlay.className = "chat-delete-confirm-overlay shop-company-chat-delete-confirm-overlay hidden";
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
    modalBody.appendChild(overlay);

    const ui = {
      overlay: overlay,
      title: overlay.querySelector("#shopCompanyDeleteConfirmTitle"),
      text: overlay.querySelector("#shopCompanyDeleteConfirmText"),
      checkRow: overlay.querySelector(".chat-delete-confirm-check"),
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

  function getSelectedMessageEntries() {
    if (selectedMessageIds.size === 0) return [];
    const selectedIds = selectedMessageIds;
    return getMessageEntries().filter(function (entry) {
      return selectedIds.has(String(entry && entry.id || ""));
    });
  }

  function syncSelectionUi() {
    const count = selectedMessageIds.size;
    const active = count > 0;
    modalBody.classList.toggle("is-selection-mode", active);
    selectionToolbar.classList.toggle("hidden", !active);
    selectionCountEl.textContent = "Выбрано " + count + " " + getMessagesWord(count);
  }

  function clearSelectionMode() {
    if (selectedMessageIds.size === 0) return;
    selectedMessageIds.clear();
    renderThread();
  }

  function copySelectedMessages() {
    const selectedMessages = getSelectedMessageEntries();
    if (!selectedMessages.length) return;
    const text = selectedMessages
      .map(function (msg) { return String(msg && msg.text || ""); })
      .filter(function (value) { return value.length > 0; })
      .join("\n");
    if (!text) return;
    copyToClipboard(text).catch(function () {});
  }

  function deleteSelectedMessages() {
    const selectedMessages = getSelectedMessageEntries();
    if (!selectedMessages.length) return;

    const selectedIds = selectedMessages
      .map(function (msg) { return String(msg && msg.id || ""); })
      .filter(Boolean);
    if (!selectedIds.length) return;

    const selectedOwnIds = selectedMessages
      .filter(function (msg) { return msg && msg.role === "user"; })
      .map(function (msg) { return String(msg && msg.id || ""); })
      .filter(Boolean);
    const allowDeleteForPeer = selectedOwnIds.length > 0;

    openDeleteConfirm({
      count: selectedIds.length,
      allowDeleteForPeer: allowDeleteForPeer,
      onConfirm: function (payload) {
        const deleteForPeer = allowDeleteForPeer && !(payload && payload.deleteForPeer === false);
        const removedOwnIds = new Set();

        if (deleteForPeer) {
          selectedOwnIds.forEach(function (messageId) {
            if (removeMessageById(messageId)) removedOwnIds.add(messageId);
          });
        }

        selectedIds.forEach(function (messageId) {
          if (removedOwnIds.has(messageId)) return;
          hideMessageLocallyById(messageId);
        });

        if (selectedMessageIds.size > 0) {
          selectedMessageIds.clear();
          renderThread();
        }
      },
    });
  }

  function openDeleteConfirm(options) {
    const ui = ensureDeleteConfirmUi();
    if (deleteConfirmCloseTimer) {
      clearTimeout(deleteConfirmCloseTimer);
      deleteConfirmCloseTimer = 0;
    }

    const opts = options || {};
    const count = Math.max(1, Number(opts.count || 1));
    const allowDeleteForPeer = opts.allowDeleteForPeer !== false;
    if (ui.title) ui.title.textContent = "Удалить " + count + " " + getMessagesWord(count);
    if (ui.text) ui.text.textContent = count === 1
      ? "Вы точно хотите удалить это сообщение?"
      : "Вы точно хотите удалить эти сообщения?";
    if (ui.checkText) ui.checkText.textContent = "Также удалить у собеседника";
    if (ui.checkRow) ui.checkRow.classList.toggle("hidden", !allowDeleteForPeer);
    if (ui.check) {
      ui.check.disabled = !allowDeleteForPeer;
      ui.check.checked = allowDeleteForPeer;
    }

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
    if (contextMenuDeleteBtn) contextMenuDeleteBtn.classList.remove("hidden");

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
    if (removedFromLive) markSharedThreadMutated();

    setMessageHiddenLocally(id, false, { persist: false });
    selectedMessageIds.delete(id);
    if (String(replyDraft && replyDraft.id || "") === id) clearReplyDraft();
    if (String(editingMessageId || "") === id) {
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({});
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
    if (selectedMessageIds.size > 0) row.classList.add("is-selection-mode");
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
      img.loading = "eager";
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

    const reactionItems = getEntryReactionItems(entry);
    if (reactionItems.length) {
      bubble.classList.add("has-reaction");
      const reactionsWrap = document.createElement("div");
      reactionsWrap.className = "shop-company-chat-reactions";

      reactionItems.forEach(function (itemReaction) {
        const reaction = document.createElement("button");
        reaction.type = "button";
        reaction.className = "shop-company-chat-reaction-pill";
        reaction.dataset.messageId = String(entry.id || "");
        reaction.dataset.reactionActor = String(itemReaction.actor || "");
        reaction.title = itemReaction.actor === CHAT_REACTION_ACTOR ? "Изменить реакцию" : "Реакция собеседника";
        reaction.dataset.reactionValue = String(itemReaction.reaction || "");
        reaction.setAttribute("aria-label", String(itemReaction.reaction || ""));
        setEmojiGlyph(reaction, itemReaction.reaction, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--pill");
        reactionsWrap.appendChild(reaction);
      });

      bubble.appendChild(reactionsWrap);
    }

    bubble.appendChild(selectBadge);
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

    syncPendingFeedCountByViewport();
    saveFeedScrollPosition();
    updateScrollDownButton();
    syncSelectionUi();
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
    emojiPopover.classList.remove("is-attach-preview");
  }

  function toggleEmojiPopover(target) {
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    const isPreviewTarget = normalizedTarget === "attach-preview";
    const isOpen = !emojiPopover.classList.contains("hidden");
    const hasSameTarget = emojiPopover.classList.contains("is-attach-preview") === isPreviewTarget;
    const willOpen = !isOpen || !hasSameTarget;

    emojiPopover.classList.toggle("is-attach-preview", isPreviewTarget);
    emojiPopover.classList.toggle("hidden", !willOpen);
    if (willOpen) ensureEmojiDatasetLoaded().catch(function () {});
  }

  function normalizeEmojiCategoryName(rawCategory) {
    const value = String(rawCategory || "").trim().toLowerCase();
    if (!value) return "";

    if (
      value.includes("smileys")
      || value.includes("emotion")
      || value.includes("people")
      || value.includes("body")
    ) return "people";
    if (value.includes("animals") || value.includes("nature")) return "nature";
    if (value.includes("food") || value.includes("drink")) return "food";
    if (value.includes("activities") || value.includes("activity")) return "activity";
    if (value.includes("travel") || value.includes("places")) return "travel";
    if (value.includes("objects")) return "objects";
    if (value.includes("symbols")) return "symbols";
    if (value.includes("flags")) return "flags";
    return "";
  }

  function unifiedToEmoji(unified) {
    const parts = String(unified || "")
      .trim()
      .split("-")
      .filter(Boolean);
    if (!parts.length) return "";
    try {
      return parts
        .map(function (part) { return Number.parseInt(part, 16); })
        .filter(function (cp) { return Number.isFinite(cp) && cp > 0; })
        .map(function (cp) { return String.fromCodePoint(cp); })
        .join("");
    } catch {
      return "";
    }
  }

  function normalizeEmojiList(list) {
    const input = Array.isArray(list) ? list : [];
    const seen = new Set();
    const out = [];
    input.forEach(function (item) {
      const emoji = String(item || "").trim().normalize("NFC");
      if (!emoji || !hasEmojiInText(emoji)) return;
      const key = normalizeReactionValue(emoji);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(emoji);
    });
    return out;
  }

  function normalizeEmojiCategoryMap(input) {
    const base = {};
    EMOJI_CATEGORY_META.forEach(function (meta) {
      if (meta.key !== "recent") base[meta.key] = [];
    });

    const source = input && typeof input === "object" ? input : {};
    Object.entries(source).forEach(function (entry) {
      const rawKey = entry[0];
      const rawList = entry[1];
      const normalizedKey = normalizeEmojiCategoryName(rawKey) || rawKey;
      if (!base[normalizedKey]) return;
      const merged = base[normalizedKey].concat(normalizeEmojiList(rawList));
      base[normalizedKey] = normalizeEmojiList(merged);
    });

    return base;
  }

  function loadRecentEmojis() {
    try {
      const raw = localStorage.getItem(EMOJI_RECENT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return normalizeEmojiList(parsed).slice(0, 42);
    } catch {
      return [];
    }
  }

  function saveRecentEmojis(list) {
    try {
      const next = normalizeEmojiList(list).slice(0, 42);
      localStorage.setItem(EMOJI_RECENT_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  function rememberRecentEmoji(emoji) {
    const value = String(emoji || "").trim();
    if (!value) return;
    const norm = normalizeReactionValue(value);
    emojiRecentList = [value].concat(
      emojiRecentList.filter(function (item) { return normalizeReactionValue(item) !== norm; })
    );
    emojiRecentList = normalizeEmojiList(emojiRecentList).slice(0, 42);
    saveRecentEmojis(emojiRecentList);
  }

  function buildEmojiCategoriesFromDataset(entries) {
    const categories = normalizeEmojiCategoryMap({});
    const list = Array.isArray(entries) ? entries : [];

    const pushUnified = function (target, unified) {
      const emoji = unifiedToEmoji(unified);
      if (emoji) categories[target].push(emoji);
    };

    list.forEach(function (entry) {
      if (!entry || typeof entry !== "object") return;
      if (entry.has_img_google === false) return;
      const category = normalizeEmojiCategoryName(entry.category);
      if (!category || !categories[category]) return;

      pushUnified(category, entry.unified);

      if (entry.skin_variations && typeof entry.skin_variations === "object") {
        Object.values(entry.skin_variations).forEach(function (variant) {
          if (!variant || typeof variant !== "object") return;
          pushUnified(category, variant.unified);
        });
      }
    });

    Object.keys(categories).forEach(function (key) {
      categories[key] = normalizeEmojiList(categories[key]);
    });
    return categories;
  }

  function getFirstAvailableEmojiCategory(preferred) {
    const pref = String(preferred || "people");
    if (pref && pref !== "recent" && (emojiCategories[pref] || []).length) return pref;
    const found = EMOJI_CATEGORY_META
      .map(function (meta) { return meta.key; })
      .find(function (key) { return key !== "recent" && (emojiCategories[key] || []).length; });
    return found || "people";
  }

  function getEmojiCategoriesForRender() {
    const output = {};
    EMOJI_CATEGORY_META.forEach(function (meta) {
      if (meta.key === "recent") {
        output[meta.key] = normalizeEmojiList(emojiRecentList).slice(0, 42);
        return;
      }
      output[meta.key] = Array.isArray(emojiCategories[meta.key]) ? emojiCategories[meta.key] : [];
    });
    return output;
  }

  async function ensureEmojiDatasetLoaded() {
    if (emojiDatasetPromise) return emojiDatasetPromise;

    emojiDatasetPromise = (async function () {
      try {
        const res = await fetch(EMOJI_DATASET_URL, { cache: "force-cache" });
        if (!res.ok) throw new Error("EMOJI_DATASET_HTTP_" + String(res.status));
        const payload = await res.json();
        const next = buildEmojiCategoriesFromDataset(payload);
        const hasAny = Object.values(next).some(function (list) {
          return Array.isArray(list) && list.length;
        });
        if (!hasAny) return;

        emojiCategories = next;
        if (!(getEmojiCategoriesForRender()[emojiActiveCategory] || []).length) {
          emojiActiveCategory = getFirstAvailableEmojiCategory(emojiActiveCategory);
        }

        if (!emojiPopover.classList.contains("hidden")) {
          renderEmojiPicker();
        }
      } catch (err) {
        console.error("emoji dataset load failed", err);
        emojiDatasetPromise = null;
      }
    })();

    return emojiDatasetPromise;
  }

  function insertEmojiIntoInput(emoji) {
    const value = String(emoji || "");
    if (!value) return;

    const useAttachPreviewCaption = (
      emojiPopover.classList.contains("is-attach-preview")
      && !attachPreviewOverlay.classList.contains("hidden")
    );
    if (useAttachPreviewCaption) {
      const startPreview = attachPreviewCaption.selectionStart ?? attachPreviewCaption.value.length;
      const endPreview = attachPreviewCaption.selectionEnd ?? attachPreviewCaption.value.length;
      attachPreviewCaption.value =
        attachPreviewCaption.value.slice(0, startPreview) +
        value +
        attachPreviewCaption.value.slice(endPreview);
      attachPreviewCaption.focus();
      const nextPreviewPos = startPreview + value.length;
      attachPreviewCaption.setSelectionRange(nextPreviewPos, nextPreviewPos);
      return;
    }

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + value + input.value.slice(end);
    input.focus();
    const pos = start + value.length;
    input.setSelectionRange(pos, pos);
    syncComposerRichPreview({});
  }

  function renderEmojiPicker() {
    emojiPopover.innerHTML = "";

    const categories = getEmojiCategoriesForRender();
    const visibleCategories = EMOJI_CATEGORY_META.filter(function (category) {
      const list = Array.isArray(categories[category.key]) ? categories[category.key] : [];
      return list.length > 0;
    });

    if (!visibleCategories.length) {
      const empty = document.createElement("div");
      empty.className = "shop-company-chat-emoji-empty";
      empty.textContent = "Нет эмодзи";
      emojiPopover.appendChild(empty);
      return;
    }

    if (!visibleCategories.some(function (category) { return category.key === emojiActiveCategory; })) {
      emojiActiveCategory = visibleCategories[0].key;
    }

    const tabs = document.createElement("div");
    tabs.className = "shop-company-chat-emoji-categories";
    emojiPopover.appendChild(tabs);

    const body = document.createElement("div");
    body.className = "shop-company-chat-emoji-body";
    emojiPopover.appendChild(body);

    const tabByKey = new Map();
    const sectionByKey = new Map();

    const updateActiveTabUi = function (nextKey) {
      tabByKey.forEach(function (tab, key) {
        tab.classList.toggle("is-active", key === nextKey);
      });
    };

    visibleCategories.forEach(function (category) {
      const list = Array.isArray(categories[category.key]) ? categories[category.key] : [];

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "shop-company-chat-emoji-category-btn"
        + (emojiActiveCategory === category.key ? " is-active" : "");
      tab.setAttribute("aria-label", category.label);
      tab.title = category.label;
      tab.innerHTML = '<i class="' + category.iconClass + '" aria-hidden="true"></i>';
      tab.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        const section = sectionByKey.get(category.key);
        if (!section) return;
        emojiActiveCategory = category.key;
        updateActiveTabUi(emojiActiveCategory);
        body.scrollTo({
          top: Math.max(0, section.offsetTop - 2),
          behavior: "smooth",
        });
      });
      tabByKey.set(category.key, tab);
      tabs.appendChild(tab);

      const section = document.createElement("section");
      section.className = "shop-company-chat-emoji-section";
      section.setAttribute("data-emoji-category", category.key);

      const title = document.createElement("div");
      title.className = "shop-company-chat-emoji-title";
      title.textContent = category.label;
      section.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "shop-company-chat-emoji-grid";
      list.forEach(function (emoji) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shop-company-chat-emoji-btn";
        btn.setAttribute("aria-label", emoji);
        btn.title = emoji;
        setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--picker");
        btn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          insertEmojiIntoInput(emoji);
          rememberRecentEmoji(emoji);
        });
        grid.appendChild(btn);
      });
      section.appendChild(grid);
      sectionByKey.set(category.key, section);
      body.appendChild(section);
    });

    const syncActiveCategoryByScroll = function () {
      const threshold = body.scrollTop + 12;
      let currentKey = emojiActiveCategory;
      visibleCategories.forEach(function (category) {
        const section = sectionByKey.get(category.key);
        if (!section) return;
        if (section.offsetTop <= threshold) currentKey = category.key;
      });
      if (currentKey !== emojiActiveCategory) {
        emojiActiveCategory = currentKey;
        updateActiveTabUi(emojiActiveCategory);
      }
    };

    body.addEventListener("scroll", syncActiveCategoryByScroll, { passive: true });
    updateActiveTabUi(emojiActiveCategory);

    requestAnimationFrame(function () {
      const activeSection = sectionByKey.get(emojiActiveCategory);
      if (!activeSection) return;
      body.scrollTop = Math.max(0, activeSection.offsetTop - 2);
      requestAnimationFrame(syncActiveCategoryByScroll);
    });
  }

  function bindEmojiPopoverGuard() {
    if (!emojiPopover) return;
    if (emojiPopover.dataset.clickGuardBound === "1") return;
    emojiPopover.dataset.clickGuardBound = "1";
    emojiPopover.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    emojiPopover.addEventListener("mousedown", function (event) {
      event.stopPropagation();
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
      emojiBtn.classList.remove("has-emoji-content");
      emojiBtn.textContent = "";
      const smileIcon = document.createElement("i");
      smileIcon.className = "far fa-smile";
      smileIcon.setAttribute("aria-hidden", "true");
      emojiBtn.appendChild(smileIcon);
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
      const stickToBottom = opts.stickToBottom === true;

      const inputStyles = window.getComputedStyle(input);
      const minHeight = parseFloat(inputStyles.minHeight) || 45;
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
        if (stickToBottom) scrollToBottom(true);
        return;
      }

      preview.classList.remove("hidden");
      input.classList.add("is-rich-emoji-preview");
      renderEmojiMessageText(preview, value, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--input-inline");
      preview.style.transform = "translate(" + (-Math.max(0, input.scrollLeft)) + "px, " + (-Math.max(0, input.scrollTop)) + "px)";

      if (stickToBottom) scrollToBottom(true);
    };

    input.__syncEmojiPreview = sync;
    input.addEventListener("input", function () {
      sync({});
    });
    ["scroll", "click", "keyup", "focus", "blur"].forEach(function (eventName) {
      input.addEventListener(eventName, function () {
        sync({});
      });
    });
    window.addEventListener("resize", function () { sync({}); });

    input.dataset.emojiPreviewReady = "1";
    sync({});
  }

  function updateReactionBarActiveButton(messageId) {
    const entry = findMessageEntry(messageId);
    const current = getEntryActorReaction(entry, CHAT_REACTION_ACTOR);
    const buttons = Array.from(reactionBar.querySelectorAll("[data-reaction]"));
    buttons.forEach(function (btn) {
      const reaction = btn.getAttribute("data-reaction") || "";
      if (reaction === "__toggle_more__") return;
      btn.classList.toggle("is-active", normalizeReactionValue(current) === normalizeReactionValue(reaction));
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
    if (!setEntryActorReaction(entry, CHAT_REACTION_ACTOR, next)) return;
    markSharedThreadMutated();

    const prevTop = feed.scrollTop;
    renderThread();
    feed.scrollTop = prevTop;
    updateScrollDownButton();
    if (liveEntries.some(function (item) { return String(item.id || "") === String(messageId || ""); })) {
      queueSharedThreadSave();
    }
  }

  function setMessageDeliveryStatus(messageId, nextStatus, options) {
    const opts = options || {};
    const entry = findMessageEntry(messageId);
    if (!entry || entry.role !== "user") return false;

    const target = String(nextStatus || "").toLowerCase();
    if (!["sent", "delivered", "read"].includes(target)) return false;

    const current = getOutgoingDeliveryStatus(entry);
    if (getDeliveryStatusRank(target) <= getDeliveryStatusRank(current)) return false;

    entry.deliveryStatus = target;
    if (target === "delivered" && !entry.deliveredAt) entry.deliveredAt = new Date().toISOString();
    if (target === "read" && !entry.readAt) entry.readAt = new Date().toISOString();
    markSharedThreadMutated();

    const prevTop = feed.scrollTop;
    const wasNearBottom = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 40;
    renderThread();
    if (wasNearBottom) {
      scrollToBottom(false);
    } else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }
    if (opts.persistRemote !== false && liveEntries.some(function (item) { return String(item.id || "") === String(messageId || ""); })) {
      queueSharedThreadSave();
    }
    return true;
  }

  function scheduleOutgoingDeliveryProgress(messageId) {
    const id = String(messageId || "");
    if (!id) return;

    window.setTimeout(function () {
      setMessageDeliveryStatus(id, "delivered", { persistRemote: false });
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

  function isMobileChatViewport() {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 768px)").matches;
  }

  function ensureTopVisibleEntryNotClipped() {
    if (!feed || !thread || !isMobileChatViewport()) return;
    const feedRect = feed.getBoundingClientRect();
    const topEdge = feedRect.top + 1;
    const children = Array.from(thread.children || []);
    if (!children.length) return;

    const firstVisible = children.find(function (node) {
      const rect = node.getBoundingClientRect();
      return rect.bottom > topEdge + 1;
    });
    if (!firstVisible) return;

    const rect = firstVisible.getBoundingClientRect();
    const clippedBy = topEdge - rect.top;
    if (clippedBy > 1) {
      feed.scrollTop = Math.max(0, feed.scrollTop - Math.ceil(clippedBy));
      updateScrollDownButton();
    }
  }

  function stopFeedSmoothScroll() {
    if (!feedScrollRaf) return;
    cancelAnimationFrame(feedScrollRaf);
    feedScrollRaf = 0;
  }

  function scrollToBottom(smooth, fixTopClip) {
    const target = Math.max(0, feed.scrollHeight - feed.clientHeight);
    const shouldFixTopClip = fixTopClip === true;

    if (!smooth) {
      stopFeedSmoothScroll();
      feed.scrollTop = target;
      clearPendingFeedNewCount();
      saveFeedScrollPosition();
      updateScrollDownButton();
      if (shouldFixTopClip) {
        requestAnimationFrame(function () {
          ensureTopVisibleEntryNotClipped();
        });
      }
      return;
    }

    const startTop = feed.scrollTop;
    const delta = target - startTop;
    if (Math.abs(delta) < 1) {
      if (shouldFixTopClip) {
        requestAnimationFrame(function () {
          ensureTopVisibleEntryNotClipped();
        });
      }
      return;
    }

    stopFeedSmoothScroll();
    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

    const step = function (now) {
      const current = typeof now === "number" ? now : Date.now();
      const progress = Math.min(1, (current - startedAt) / CHAT_AUTOSCROLL_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      feed.scrollTop = startTop + (delta * eased);
      if (progress < 1) {
        feedScrollRaf = requestAnimationFrame(step);
        return;
      }
      feedScrollRaf = 0;
      feed.scrollTop = target;
      clearPendingFeedNewCount();
      saveFeedScrollPosition();
      updateScrollDownButton();
      if (shouldFixTopClip) {
        requestAnimationFrame(function () {
          ensureTopVisibleEntryNotClipped();
        });
      }
    };

    feedScrollRaf = requestAnimationFrame(step);
  }

  function updateScrollDownButton() {
    const hiddenDistance = feed.scrollHeight - feed.clientHeight - feed.scrollTop;
    const hasPending = pendingFeedNewCount > 0;
    const shouldShow = hasPending || hiddenDistance >= 120;
    scrollDownBtn.classList.toggle("hidden", !shouldShow);

    const badge = ensureScrollDownBadge();
    if (!badge) return;
    if (!hasPending) {
      badge.textContent = "";
      badge.classList.add("hidden");
      return;
    }

    const nextText = pendingFeedNewCount > 99 ? "99+" : String(pendingFeedNewCount);
    if (badge.textContent !== nextText) {
      badge.textContent = nextText;
      animateCountBadgeTick(badge);
    }
    badge.classList.remove("hidden");
  }

  function pushLiveMessage(role, text, options) {
    const opts = options || {};
    const trimmed = normalizeComposerText(text);
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
      author: role === "agent" ? VIRTUAL_ASSISTANT_NAME : "",
      replyTo: replyTo,
      reaction: "",
      reactions: { in: "", out: "" },
      deliveryStatus: status,
      createdAt: createdAt,
      read: role === "user" ? false : true,
      deliveredAt: "",
      readAt: "",
      _sharedDirection: direction,
    };

    liveEntries.push(message);
    markSharedThreadMutated();

    renderThread();
    scrollToBottom(true);
    queueSharedThreadSave();

    if (role === "user") {
      scheduleOutgoingDeliveryProgress(message.id);
    }
  }

  function sendUserMessage(text, options) {
    const opts = options || {};
    const trimmed = normalizeComposerText(text);
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

  function getAttachPreviewTitle(count) {
    const total = Number(count) || 0;
    if (total <= 1) return "1 фотография";
    if (total >= 2 && total <= 4) return String(total) + " фотографии";
    return String(total) + " фотографий";
  }

  function closeAttachPreview(options) {
    const opts = options || {};
    const clearItems = opts.clearItems !== false;
    const focusComposer = opts.focusComposer !== false;
    const clearCaption = opts.clearCaption !== false;

    attachPreviewOverlay.classList.add("hidden");
    attachPreviewOverlay.setAttribute("aria-hidden", "true");

    if (clearItems) {
      attachPreviewItems = [];
      attachPreviewActiveIndex = 0;
    }
    if (clearCaption) {
      attachPreviewCaption.value = "";
    }

    attachPreviewThumbs.innerHTML = "";
    attachPreviewThumbs.classList.add("hidden");
    if (emojiPopover.classList.contains("is-attach-preview")) hideEmojiPopover();
    attachInput.value = "";
    if (focusComposer && !input.disabled) input.focus();
  }

  function isMessageImageViewerOpen() {
    return !imageViewerOverlay.classList.contains("hidden");
  }

  function closeMessageImageViewer() {
    imageViewerOverlay.classList.add("hidden");
    imageViewerOverlay.setAttribute("aria-hidden", "true");
    imageViewerImage.removeAttribute("src");
  }

  function openMessageImageViewer(imageSrc, imageAlt) {
    const src = String(imageSrc || "").trim();
    if (!src) return false;
    imageViewerImage.src = src;
    imageViewerImage.alt = String(imageAlt || "Image preview");
    imageViewerOverlay.classList.remove("hidden");
    imageViewerOverlay.setAttribute("aria-hidden", "false");
    return true;
  }

  function initMessageImageViewerModal() {
    if (imageViewerOverlay.dataset.bound === "1") return;
    imageViewerOverlay.dataset.bound = "1";

    imageViewerCloseBtn.addEventListener("click", function () {
      closeMessageImageViewer();
    });

    imageViewerOverlay.addEventListener("click", function (event) {
      if (event.target !== imageViewerOverlay) return;
      closeMessageImageViewer();
    });
  }

  function renderAttachPreview() {
    const list = Array.isArray(attachPreviewItems) ? attachPreviewItems : [];
    const total = list.length;
    if (!total) {
      closeAttachPreview({ focusComposer: false });
      return;
    }

    const index = Math.max(0, Math.min(Number(attachPreviewActiveIndex) || 0, total - 1));
    attachPreviewActiveIndex = index;
    const active = list[index] || null;

    attachPreviewTitle.textContent = getAttachPreviewTitle(total);
    if (active) {
      attachPreviewImage.src = String(active.dataUrl || "");
      attachPreviewImage.alt = String(active.name || "Изображение");
    }

    attachPreviewThumbs.innerHTML = "";
    if (total > 1) {
      attachPreviewThumbs.classList.remove("hidden");
      list.forEach(function (item, idx) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-attach-preview-thumb";
        if (idx === index) btn.classList.add("is-active");
        btn.setAttribute("data-chat-attach-preview-index", String(idx));

        const img = document.createElement("img");
        img.src = String(item.dataUrl || "");
        img.alt = String(item.name || ("Фото " + String(idx + 1)));
        img.loading = "eager";
        img.decoding = "async";
        img.draggable = false;

        btn.appendChild(img);
        attachPreviewThumbs.appendChild(btn);
      });
    } else {
      attachPreviewThumbs.classList.add("hidden");
    }
  }

  function openAttachPreview(attachments, options) {
    const opts = options || {};
    const list = Array.isArray(attachments)
      ? attachments.filter(function (item) { return isImageAttachment(item); })
      : [];
    if (!list.length) return false;

    attachPreviewItems = list;
    attachPreviewActiveIndex = 0;
    attachPreviewCaption.value = String(opts.caption || "");

    renderAttachPreview();
    attachPreviewOverlay.classList.remove("hidden");
    attachPreviewOverlay.setAttribute("aria-hidden", "false");
    attachPreviewCaption.focus();
    return true;
  }

  function sendPreparedImageAttachments(attachments, options) {
    const opts = options || {};
    const list = Array.isArray(attachments)
      ? attachments.filter(function (item) { return isImageAttachment(item); })
      : [];
    if (!list.length) return 0;
    if (editingMessageId) cancelEditingMessage();

    const replySnapshot = replyDraft && replyDraft.id
      ? {
          id: String(replyDraft.id),
          sender: String(replyDraft.sender || ""),
          text: String(replyDraft.text || ""),
        }
      : null;

    const captionText = normalizeComposerText(opts.caption || "");
    let sent = 0;
    list.forEach(function (attachment) {
      pushLiveMessage("user", sent === 0 ? captionText : "", {
        replyTo: sent === 0 ? replySnapshot : null,
        attachment: attachment,
      });
      sent += 1;
    });

    if (sent > 0) {
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      clearReplyDraft();
    }
    return sent;
  }

  async function sendImageAttachments(files, options) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return 0;

    const prepared = await Promise.all(
      list.map(function (file) {
        return buildImageAttachmentFromFile(file).catch(function () { return null; });
      })
    );
    const attachments = prepared.filter(function (item) { return !!item; });

    return sendPreparedImageAttachments(attachments, options);
  }

  async function openAttachPreviewFromFiles(files) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return false;
    if (editingMessageId) cancelEditingMessage();

    const prepared = await Promise.all(
      list.map(function (file) {
        return buildImageAttachmentFromFile(file).catch(function () { return null; });
      })
    );
    const attachments = prepared.filter(function (item) { return !!item; });
    if (!attachments.length) return false;
    return openAttachPreview(attachments);
  }

  function initAttachPreviewModal() {
    if (attachPreviewOverlay.dataset.bound === "1") return;
    attachPreviewOverlay.dataset.bound = "1";

    attachPreviewCloseBtn.addEventListener("click", function () {
      closeAttachPreview();
    });

    attachPreviewThumbs.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-chat-attach-preview-index]");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-chat-attach-preview-index") || 0);
      if (!Number.isFinite(idx)) return;
      attachPreviewActiveIndex = idx;
      renderAttachPreview();
    });

    attachPreviewEmojiBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleEmojiPopover("attach-preview");
      attachPreviewCaption.focus();
    });

    attachPreviewSendBtn.addEventListener("click", function () {
      const caption = String(attachPreviewCaption.value || "");
      const sent = sendPreparedImageAttachments(attachPreviewItems, { caption: caption });
      if (sent > 0) {
        closeAttachPreview({ clearCaption: true });
      }
    });

    attachPreviewCaption.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      attachPreviewSendBtn.click();
    });

    attachPreviewOverlay.addEventListener("click", function (event) {
      if (event.target !== attachPreviewOverlay) return;
      closeAttachPreview();
    });
  }

  if (!Object.keys(emojiCategories).length) {
    emojiCategories = normalizeEmojiCategoryMap(EMOJI_FALLBACK_CATEGORIES);
  }
  if (!emojiRecentList.length) {
    emojiRecentList = loadRecentEmojis();
  }
  if (!(emojiCategories[emojiActiveCategory] || []).length) {
    emojiActiveCategory = getFirstAvailableEmojiCategory(emojiActiveCategory);
  }

  renderEmojiPicker();
  ensureEmojiDatasetLoaded().catch(function () {});
  bindEmojiPopoverGuard();
  normalizeQuickReactionButtons();
  decorateComposerEmojiControls();
  initAttachPreviewModal();
  initMessageImageViewerModal();
  setupComposerRichPreview();
  probeEmojiAssetsAvailability();
  renderUnreadBadge(liveEntries);
  refreshChatClientProfileIfNeeded({ pull: false });
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
    if (isMessageImageViewerOpen()) {
      closeMessageImageViewer();
      return;
    }
    if (!attachPreviewOverlay.classList.contains("hidden")) {
      closeAttachPreview();
      return;
    }
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

  function syncReadOnForeground() {
    if (!overlay.classList.contains("is-open")) return;
    if (!isChatTabActiveForRead()) return;
    pullSharedThreadFromServer({ force: true })
      .catch(function () {
        syncVisibleChatReadState();
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    syncReadOnForeground();
  });

  window.addEventListener("focus", function () {
    refreshChatClientProfileIfNeeded({ pull: false });
    syncReadOnForeground();
  });

  window.addEventListener("storage", function (event) {
    const key = String(event && event.key || "");
    if (key && key !== customerTokenKey && key !== customerCacheKey && key !== guestChatClientKey) return;
    refreshChatClientProfileIfNeeded({ pull: true });
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
      if (action === "delete") {
        const allowDeleteForPeer = msg.role === "user";
        openDeleteConfirm({
          count: 1,
          allowDeleteForPeer: allowDeleteForPeer,
          onConfirm: function (payload) {
            const deleteForPeer = allowDeleteForPeer && !(payload && payload.deleteForPeer === false);
            if (deleteForPeer) {
              if (removeMessageById(messageId)) return;
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
    syncComposerRichPreview({});
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const done = sendUserMessage(input.value);
      if (!done) return;
      input.value = "";
      syncComposerRichPreview({});
      return;
    }

    if (event.key === "Escape" && editingMessageId) {
      event.preventDefault();
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({});
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
    await openAttachPreviewFromFiles(files).catch(function () {});
    attachInput.value = "";
  });

  emojiBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    hideContextMenu();
    hideReactionBar();
    toggleEmojiPopover("composer");
    input.focus();
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
      const pillActor = reactionPill.dataset ? String(reactionPill.dataset.reactionActor || "") : "";
      if (pillActor && pillActor !== CHAT_REACTION_ACTOR) {
        hideContextMenu();
        hideReactionBar();
        return;
      }
      const pillReaction = reactionPill.dataset ? String(reactionPill.dataset.reactionValue || "") : "";
      if (pillMessageId && pillReaction) {
        toggleReaction(pillMessageId, pillReaction);
      }
      hideContextMenu();
      hideReactionBar();
      return;
    }

    if (selectedMessageIds.size > 0) {
      const rowTarget = event.target.closest(".shop-company-chat-row[data-message-id]");
      const selectedId = rowTarget ? String(rowTarget.getAttribute("data-message-id") || "") : "";
      if (!selectedId) {
        hideContextMenu();
        hideReactionBar();
        return;
      }
      toggleSelectedMessage(selectedId);
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      return;
    }

    const attachmentImage = event.target.closest(".shop-company-chat-attachment-image");
    if (attachmentImage) {
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      openMessageImageViewer(
        attachmentImage.getAttribute("src") || "",
        attachmentImage.getAttribute("alt") || "Image preview"
      );
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
    if (normalizeReactionValue(getEntryActorReaction(entry, CHAT_REACTION_ACTOR)) === normalizeReactionValue(heartReaction)) {
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
    saveFeedScrollPosition();
    syncPendingFeedCountByViewport();
    hideContextMenu();
    if (!reactionBar.classList.contains("hidden")) {
      hideReactionBar();
    }
    if (!emojiPopover.classList.contains("hidden")) {
      hideEmojiPopover();
    }
    updateScrollDownButton();
    if (isFeedPinnedToBottom()) {
      clearPendingFeedNewCount();
    }
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
    if (isMessageImageViewerOpen()) {
      event.preventDefault();
      closeMessageImageViewer();
      return;
    }
    if (pendingDeleteConfirm) {
      event.preventDefault();
      closeDeleteConfirm();
      return;
    }
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    if (selectedMessageIds.size > 0) {
      clearSelectionMode();
      return;
    }
    if (replyDraft) clearReplyDraft();
    if (editingMessageId) {
      cancelEditingMessage();
      input.value = "";
      syncComposerRichPreview({});
    }
  });

  window.addEventListener("resize", function () {
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    clearTouchGesture();
  });

  selectionCloseBtn.addEventListener("click", function () {
    clearSelectionMode();
  });

  selectionCopyBtn.addEventListener("click", function () {
    copySelectedMessages();
  });

  selectionDeleteBtn.addEventListener("click", function () {
    deleteSelectedMessages();
  });
})();

