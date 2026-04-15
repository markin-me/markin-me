
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sharedOrderPanel = window.SharedOrderPanel || null;

  const CHAT_STORAGE_KEY = "dashboard:client-chat:v1";
  const CHAT_MOBILE_VIEW_STORAGE_KEY = `dashboard:chat:mobile:view:v1:${getTenantId()}`;
  const CHAT_ATTACHMENT_DRAFT_DB_NAME = "markin-me-chat-attachment-drafts";
  const CHAT_ATTACHMENT_DRAFT_DB_VERSION = 1;
  const CHAT_ATTACHMENT_DRAFT_STORE = "attachmentDrafts";
  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const ORDER_UPDATED_EVENT = "dashboard:order-updated";
  const CHAT_UNREAD_EVENT = "dashboard:chat-unread-changed";
  const TENANT_DATA_CHANGED_EVENT = "tenantDataChanged";
  const THREAD_SYNC_SAVE_DEBOUNCE_MS = 220;
  const THREAD_SYNC_SUMMARY_POLL_MS = 15000;
  const THREAD_SYNC_SUMMARY_WAIT_TIMEOUT_MS = 25000;
  const THREAD_SYNC_WAIT_TIMEOUT_MS = 20000;
  const THREAD_SYNC_WAIT_RETRY_MS = 250;
  const THREAD_SYNC_LOOP_MIN_INTERVAL_MS = 120;
  const THREAD_SSE_PULL_DEBOUNCE_MS = 100;
  const SUMMARIES_SSE_PULL_DEBOUNCE_MS = 450;
  const CHAT_SSE_ENABLED = typeof window.EventSource === "function";
  const ENABLE_ACTIVE_THREAD_SSE = true;
  const ACTIVE_ORDERS_POLL_MS = 60000;
  const ACTIVE_ORDERS_VISIBILITY_REFRESH_DEBOUNCE_MS = 45000;
  const ACTIVE_CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
  const CHAT_AUTOSCROLL_MS = 170;
  const CHAT_THREAD_LAYOUT_BURST_GAP_MS = 110;
  const CHAT_THREAD_LAYOUT_BURST_COOLDOWN_MS = 260;
  const CHAT_SCROLL_DOWN_SHOW_DISTANCE_PX = 6;
  const CHAT_SCROLL_DOWN_FORCE_SHOW_MS = 700;
  const CHAT_STICKY_BOTTOM_THRESHOLD_PX = 18;
  const CHAT_PINNED_BOTTOM_PERSIST_THRESHOLD_PX = 2;
  const CHAT_THREAD_EDGE_SPRING_TOUCH_LOCK_PX = 4;
  const CHAT_THREAD_EDGE_SPRING_TOUCH_HOLD_DEADBAND_PX = 1.5;
  const CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX = 1;
  const CHAT_THREAD_EDGE_SPRING_ENABLED = false;
  const CHAT_THREAD_EDGE_SPRING_KEYBOARD_BOTTOM_EPSILON_PX = 28;
  const CHAT_THREAD_EDGE_SPRING_MAX_SHIFT_PX = 144;
  const CHAT_THREAD_EDGE_SPRING_MOBILE_MAX_SHIFT_PX = 112;
  const CHAT_THREAD_EDGE_SPRING_DISTANCE_GAIN = 1.36;
  const CHAT_THREAD_EDGE_SPRING_WHEEL_FACTOR = 0.24;
  const CHAT_THREAD_EDGE_SPRING_RELEASE_STIFFNESS = 170;
  const CHAT_THREAD_EDGE_SPRING_RELEASE_DAMPING = 26;
  const CHAT_THREAD_EDGE_SPRING_WHEEL_RELEASE_MS = 90;
  const CHAT_THREAD_EDGE_SPRING_WHEEL_NUDGE_ENABLED = false;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_ENABLED = false;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_WINDOW_MS = 1400;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_ACTIVE_VELOCITY_WINDOW_MS = 240;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_EDGE_TRIGGER_VELOCITY_WINDOW_MS = 120;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY = 0.18;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_ARM_MIN_EDGE_DISTANCE_PX = 96;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_ARM_MAX_EDGE_DISTANCE_PX = 220;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_DISTANCE_FACTOR = 34;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_MAX_SHIFT_RATIO = 0.88;
  const CHAT_THREAD_EDGE_SPRING_MOMENTUM_EDGE_REACH_EPSILON_PX = 4;
  const CHAT_THREAD_EDGE_SPRING_MOBILE_BOTTOM_MAX_SHIFT_EXTRA_RATIO = 0.72;
  const CHAT_THREAD_EDGE_SPRING_MOBILE_BOTTOM_DISTANCE_BOOST_MAX = 2.2;
  const CHAT_TYPING_HEARTBEAT_MS = 500;
  const CHAT_TYPING_IDLE_STOP_MS = 2800;
  const CHAT_TYPING_BLUR_STOP_MS = 180;
  const CHAT_TYPING_EXPIRE_GRACE_MS = 3600;
  const CHAT_MESSAGE_ALERT_COOLDOWN_MS = 900;
  const CHAT_UNANSWERED_ALERT_DELAY_MS = 5000;
  const CHAT_PUSH_SYNC_DEBOUNCE_MS = 180;
  const CHAT_PUSH_SUBSCRIPTION_CLIENT_ID = 0;
  const CHAT_BROWSER_ALERTS_ENABLED = false;
  const CHAT_AUTO_OPEN_QUERY_PARAM = "open_chat";
  const CHAT_AUTO_OPEN_SOURCE_PARAM = "chat_source";
  const CHAT_AUTO_OPEN_CLIENT_ID_PARAM = "chat_client_id";
  const CHAT_AUTO_OPEN_MESSAGE_ID_PARAM = "chat_message_id";
  const CHAT_MESSAGE_JUMP_BOTTOM_GAP_PX = 14;
  const CHAT_CLIENTS_PAGE_SIZE = 20;
  const CHAT_CLIENTS_LOAD_MORE_THRESHOLD_PX = 140;
  const CHAT_CLIENTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const CHAT_REMOTE_CLIENTS_PAGE_CACHE_TTL_MS = 1200;
  const CLIENT_DETAILS_SHARED_CACHE_TTL_MS = 10 * 60 * 1000;
  const SHARED_ORDER_DETAILS_CACHE_TTL_MS = 15 * 60 * 1000;
  const SHARED_ORDER_DETAILS_CACHE_MAX = 400;
  const CHAT_CLIENTS_CACHE_MAX_ROWS = 600;
  const CHAT_FOREGROUND_SYNC_DEBOUNCE_MS = 30000;
  const CHAT_READ_SYNC_MIN_INTERVAL_MS = 15000;
  const CHAT_FOREGROUND_EVENT_DEBOUNCE_MS = 10000;
  const CHAT_SUMMARIES_SYNC_MIN_INTERVAL_MS = 900;
  const CHAT_THREAD_PAGE_SIZE = 60;
  const CHAT_THREAD_BACKGROUND_SYNC_LIMIT = 20;
  const CHAT_THREAD_SYNC_COALESCE_MS = 350;
  const CHAT_FULL_THREAD_PULL_COOLDOWN_MS = 30000;
  const CHAT_THREAD_EAGER_IMAGE_COUNT = 4;
  const CHAT_THREAD_LOAD_MORE_THRESHOLD_PX = 20;
  const CHAT_TOUCH_CONTEXT_LONG_PRESS_MS = 430;
  const CHAT_TOUCH_CONTEXT_LONG_PRESS_MOVE_CANCEL_PX = 14;
  const CHAT_MOBILE_CONTEXT_MENU_APPEAR_DELAY_MS = 140;
  const CHAT_MOBILE_CONTEXT_RELAYOUT_LOCK_MS = 260;
  const CHAT_MOBILE_CONTEXT_CLONE_OPEN_TRANSITION = "transform .46s cubic-bezier(.22,.61,.36,1)";
  const CHAT_MOBILE_CONTEXT_CLONE_RELAYOUT_TRANSITION = "transform .46s cubic-bezier(.22,.61,.36,1)";
  const CHAT_TOUCH_CONTEXT_MOVE_CANCEL_PX = 9;
  const CHAT_TOUCH_SWIPE_REPLY_TRIGGER_PX = 56;
  const CHAT_TOUCH_SWIPE_MAX_SHIFT_PX = 96;
  const CHAT_TOUCH_THREAD_NAV_LOCK_PX = 10;
  const CHAT_TOUCH_THREAD_NAV_TRIGGER_PX = 72;
  const CHAT_NATIVE_BOTTOM_BOUNCE_SETTLE_MS = 980;
  const CHAT_TOUCH_HEART_DOUBLE_TAP_MS = 280;
  const CHAT_TOUCH_HEART_DOUBLE_TAP_MOVE_PX = 24;
  const CHAT_COMPOSER_DRAFT_MAX_LENGTH = 8000;
  const CHAT_REACTION_PENDING_TTL_MS = 10000;
  const CHAT_DROP_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i;
  const CHAT_AUTO_LINK_PATTERN = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:xn--[a-z0-9-]{2,59}|[\p{L}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)(?::\d{2,5})?(?:[/?#][^\s<]*)?|(?:\+?\d[\d\s().-]{8,}\d))/giu;
  const CHAT_BARE_DOMAIN_AUTO_LINK_PATTERN = /^(?=.{1,253}$)(?:(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)\.)+(?:xn--[a-z0-9-]{2,59}|[\p{L}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)(?::\d{2,5})?(?:[/?#][^\s<]*)?$/iu;
  const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
  const IMAGE_OPTIMIZE_SKIP_BELOW_BYTES = 700 * 1024;
  const IMAGE_OPTIMIZE_TARGET_BYTES = 900 * 1024;
  const IMAGE_OPTIMIZE_MAX_SIDE_PX = 1600;
  const IMAGE_OPTIMIZE_MIN_SIDE_PX = 900;
  const IMAGE_OPTIMIZE_INITIAL_QUALITY = 0.86;
  const IMAGE_OPTIMIZE_MIN_QUALITY = 0.58;
  const IMAGE_OPTIMIZE_SCALE_STEP = 0.84;
  const TEST_CHAT_IDS_TO_PRUNE = ["9997", "9998", "9999"];
  const EMOJI_ASSET_BASE_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64";
  const EMOJI_DATASET_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/emoji.json";
  const EMOJI_REMOTE_DATASET_ENABLED = false;
  const EMOJI_NATIVE_RENDER_ONLY = false;
  const EMOJI_ATLAS_CACHE_NAME = "markinme-emoji-atlas-v1";
  const EMOJI_REACTION_POOL_LIMIT = 64;
  const EMOJI_ATLAS_ENABLED = true;
  const EMOJI_ATLAS_URL = "/static/assets/emoji/apple-people-atlas.webp?v=1";
  const EMOJI_ATLAS_COLUMNS = 16;
  const EMOJI_RECENT_STORAGE_KEY = "dashboard:chat-recent-emojis:v1";
  const CHAT_ASSISTANT_ORDER_CARD_MESSAGE_RE = /^assistant-auto-(?:where-order|phone-order)-o([0-9_]+)-/;
  const CHAT_ASSISTANT_ORDER_CARD_TEXT_RE = /#\s*(\d{1,12})/g;
  const CHAT_ORDER_CARD_STATUS_FALLBACK = "\u0411\u0435\u0437 \u0441\u0442\u0430\u0442\u0443\u0441\u0430";
  const CHAT_ORDER_CARD_OPEN_LABEL = "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0437\u0430\u043a\u0430\u0437";
  const CHAT_ORDER_CARD_TITLE = "\u0417\u0430\u043a\u0430\u0437";
  const EMOJI_CATEGORY_META = [
    { key: "recent", label: "\u041d\u0435\u0434\u0430\u0432\u043d\u0438\u0435", iconClass: "far fa-clock" },
    { key: "people", label: "\u0421\u043c\u0430\u0439\u043b\u044b \u0438 \u043b\u044e\u0434\u0438", iconClass: "far fa-smile" },
    { key: "nature", label: "\u0416\u0438\u0432\u043e\u0442\u043d\u044b\u0435 \u0438 \u043f\u0440\u0438\u0440\u043e\u0434\u0430", iconClass: "fas fa-paw" },
    { key: "food", label: "\u0415\u0434\u0430 \u0438 \u043d\u0430\u043f\u0438\u0442\u043a\u0438", iconClass: "fas fa-apple-whole" },
    { key: "activity", label: "\u0410\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438", iconClass: "far fa-futbol" },
    { key: "travel", label: "\u041f\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0438\u044f", iconClass: "fas fa-car-side" },
    { key: "objects", label: "\u041e\u0431\u044a\u0435\u043a\u0442\u044b", iconClass: "far fa-lightbulb" },
    { key: "symbols", label: "\u0421\u0438\u043c\u0432\u043e\u043b\u044b", iconClass: "fas fa-at" },
    { key: "flags", label: "\u0424\u043b\u0430\u0433\u0438", iconClass: "far fa-flag" },
  ];
  const EMOJI_FALLBACK_CATEGORIES = {
    people: [
      "\u{1F600}","\u{1F603}","\u{1F604}","\u{1F601}","\u{1F606}","\u{1F605}","\u{1F923}","\u{1F602}","\u{1F642}","\u{1F643}",
      "\u{1F609}","\u{1F60A}","\u{1F607}","\u{1F970}","\u{1F60D}","\u{1F618}","\u{1F617}","\u{1F61A}","\u{1F60B}","\u{1F61B}",
      "\u{1F61C}","\u{1F92A}","\u{1F928}","\u{1F9D0}","\u{1F913}","\u{1F60E}","\u{1F973}","\u{1F60F}","\u{1F612}","\u{1F61E}",
      "\u{1F614}","\u{1F61F}","\u{1F615}","\u{1F641}","\u{2639}\u{FE0F}","\u{1F623}","\u{1F616}","\u{1F62B}","\u{1F629}","\u{1F97A}",
      "\u{1F62D}","\u{1F624}","\u{1F620}","\u{1F621}","\u{1F92C}","\u{1F92F}","\u{1F633}","\u{1F975}","\u{1F976}","\u{1F631}",
      "\u{1F628}","\u{1F630}","\u{1F625}","\u{1F613}","\u{1F917}","\u{1F914}","\u{1FAE1}","\u{1F92D}","\u{1FAE2}","\u{1F92B}",
      "\u{1F925}","\u{1F636}","\u{1FAE0}","\u{1F610}","\u{1FAE4}","\u{1F611}","\u{1F62C}","\u{1F644}","\u{1F62E}\u{200D}\u{1F4A8}","\u{1F924}",
      "\u{1F62A}","\u{1F635}","\u{1F910}","\u{1F974}","\u{1F922}","\u{1F92E}","\u{1F927}","\u{1F637}","\u{1F912}","\u{1F915}",
      "\u{2764}\u{FE0F}","\u{1F494}","\u{1F4AF}","\u{1F44D}","\u{1F44E}","\u{1F44F}","\u{1F64C}","\u{1F64F}","\u{1F44B}","\u{1F91D}","\u{1F4AA}",
      "\u{1F622}","\u{1F525}","\u{1F62E}"
    ],
    nature: [],
    food: [],
    activity: [],
    travel: [],
    objects: [],
    symbols: [],
    flags: [],
  };
  function normalizeEmojiAtlasKey(value) {
    return String(value || "")
      .trim()
      .normalize("NFC")
      .replace(/\uFE0F/g, "");
  }
  const QUICK_REACTIONS = [
    "\u{1F642}",
    "\u{1F622}",
    "\u{2764}\u{FE0F}",
    "\u{1F44D}",
    "\u{1F44E}",
    "\u{1F525}",
    "\u{1F621}",
  ];
  const EXTRA_REACTIONS = [
    "\u{1F97A}",
    "\u{1F615}",
    "\u{1F61E}",
    "\u{1F61F}",
    "\u{1F641}",
    "\u{1F62E}",
  ];
  const EMOJI_ATLAS_ROWS = Math.max(
    1,
    Math.ceil(((EMOJI_FALLBACK_CATEGORIES.people || []).length || 1) / EMOJI_ATLAS_COLUMNS)
  );
  const EMOJI_ATLAS_INDEX_BY_KEY = (() => {
    const map = Object.create(null);
    (EMOJI_FALLBACK_CATEGORIES.people || []).forEach((emoji, index) => {
      const key = normalizeEmojiAtlasKey(emoji);
      if (!key) return;
      if (map[key] === undefined) map[key] = index;
    });
    return map;
  })();
  const CHAT_REACTION_ACTOR = "out";
  const CHAT_TYPING_PHRASES = [
    "печатает",
    "набирает ответ",
    "клацает по клавишам",
    "стучит по клавиатуре",
    "строчит сообщение",
    "собирает мысли в текст",
    "формулирует ответ",
    "набивает текст",
    "долбит по клавишам",
    "подбирает слова",
    "колдует над сообщением",
    "нажимает клавиши",
  ];

  const dom = {
    left: {
      panel: document.querySelector(".page-col-left"),
      search: $("#chatClientsSearch"),
      list: $("#chatClientsList"),
      empty: $("#chatClientsEmpty"),
      mobileCloseBtn: $("#chatMobileClientsCloseBtn"),
    },
    center: {
      stack: $(".chat-center-stack"),
      headerPanel: $(".chat-header-island"),
      mobileClientsBackBtn: $("#chatMobileClientsBackBtn"),
      headerOrder: $("#chatHeaderOrder"),
      mobileHeaderOrderBtn: $("#chatMobileHeaderOrderBtn"),
      headerClientBtn: $("#chatHeaderClientBtn"),
      mobileHeaderClientBtn: $("#chatMobileHeaderClientBtn"),
      headerName: $("#chatHeaderName"),
      mobileHeaderName: $("#chatMobileHeaderName"),
      headerPhone: $("#chatHeaderPhone"),
      mobileHeaderPhone: $("#chatMobileHeaderPhone"),
      headerLoading: $("#chatHeaderLoading"),
      mobileHeaderLoading: $("#chatMobileHeaderLoading"),
      orderTitle: $("#chatOrderTitle"),
      orderStatus: $("#chatOrderStatus"),
      orderKind: $("#chatOrderKind"),
      orderId: $("#chatOrderId"),
      mobileOrderId: $("#chatMobileOrderId"),
      orderTime: $("#chatOrderTime"),
      mobileOrderTime: $("#chatMobileOrderTime"),
      orderTimeIcon: $("#chatOrderTimeIcon"),
      orderAddress: $("#chatOrderAddress"),
      orderComment: $("#chatOrderComment"),
      orderTotal: $("#chatOrderTotal"),
      messagesWrap: $("#chatMessagesWrap"),
      messages: $("#chatMessages"),
      scrollDownBtn: $("#chatScrollDownBtn"),
      scrollDownBadge: $("#chatScrollDownBadge"),
      typingIndicator: $("#chatTypingIndicator"),
      empty: $("#chatEmptyState"),
      attachInput: $("#chatAttachmentInput"),
      attachBtn: $("#chatAttachBtn"),
      attachPreviewOverlay: $("#chatAttachPreviewOverlay"),
      attachPreviewCloseBtn: $("#chatAttachPreviewCloseBtn"),
      attachPreviewTitle: $("#chatAttachPreviewTitle"),
      attachPreviewImage: $("#chatAttachPreviewImage"),
      attachPreviewThumbs: $("#chatAttachPreviewThumbs"),
      attachPreviewEmojiBtn: $("#chatAttachPreviewEmojiBtn"),
      attachPreviewCaption: $("#chatAttachPreviewCaption"),
      attachPreviewSendBtn: $("#chatAttachPreviewSendBtn"),
      imageViewerOverlay: $("#chatImageViewerOverlay"),
      imageViewerCloseBtn: $("#chatImageViewerCloseBtn"),
      imageViewerImage: $("#chatImageViewerImage"),
      emojiBtn: $("#chatEmojiBtn"),
      emojiPopover: $("#chatEmojiPopover"),
      input: $("#chatMessageInput"),
      sendBtn: $("#chatSendBtn"),
      footerPanel: $(".chat-footer-island"),
      composer: $(".chat-main-composer"),
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
      selectionCopyBtn: $("#chatSelectionCopyBtn"),
      selectionDeleteBtn: $("#chatSelectionDeleteBtn"),
      startupSplash: $("#chatStartupSplash"),
      bootstrapLoader: $("#chatBootstrapLoader"),
    },
  };

  const state = {
    clients: [],
    filteredClients: [],
    activeClientId: null,
    activeClient: null,
    activeClientDataLoading: false,
    activeOrders: [],
    activeOrdersSignature: "[]",
    orderStatuses: [],
    orderStatusesLoaded: false,
    orderStatusesLoading: false,
    headerOrderId: 0,
    headerOrderSnapshot: null,
    headerOrderStatusMutationInFlight: false,
    q: "",
    requestToken: 0,
    editingMessageId: null,
    contextMessageId: null,
    contextClientId: null,
    replyDraft: null,
    deleteConfirmUi: null,
    pendingDeleteConfirm: null,
    deleteConfirmCloseTimer: 0,
    clientContextMenu: null,
    selectionMode: false,
    selectedMessageIds: new Set(),
    store: loadStore(),
    orderDetailsCache: new Map(),
    clientProfileCache: new Map(),
    clientOrdersCache: new Map(),
    remoteThreadUpdatedAt: {},
    remoteThreadSyncInFlight: {},
    remoteThreadSyncPendingByClient: {},
    remoteThreadSyncLastAtByClient: {},
    fullThreadPullLastAtByClient: {},
    remoteSaveTimers: {},
    remoteSaveInFlight: {},
    remoteMutationQueues: {},
    localThreadMutations: {},
    remoteSummaryFingerprints: {},
    remoteSummariesByClient: {},
    clientSortBoostUpdatedAtByClient: {},
    pendingMergedSelectionClientId: "",
    activeThreadWaitLoopStarted: false,
    activeThreadWaitLoopToken: 0,
    summariesWaitLoopStarted: false,
    summariesWaitLoopToken: 0,
    summariesUpdatedAt: "",
    summariesRevision: 0,
    summariesPollTimer: 0,
    summariesSyncInFlight: null,
    summariesSyncPendingForceThreads: false,
    summariesLastSyncedAt: 0,
    activeOrdersPollTimer: 0,
    activeOrdersPollInFlight: false,
    foregroundSyncInFlight: false,
    foregroundSyncLastAt: 0,
    readSyncLastAt: 0,
    foregroundEventLastAt: 0,
    messagesScrollRaf: 0,
    pendingScrollNewByClient: {},
    pendingScrollMessageIdsByClient: {},
    threadScrollTopByClient: {},
    threadPinnedBottomByClient: {},
    forceDesktopBottomClientId: "",
    forceDesktopBottomUntil: 0,
    peerTypingByClient: {},
    peerTypingUpdatedAtByClient: {},
    peerTypingHideTimers: {},
    localTypingHeartbeatTimer: 0,
    localTypingStopTimer: 0,
    localTypingWatchTimer: 0,
    localTypingClientId: "",
    localTypingActive: false,
    localTypingPhrase: "",
    localTypingLastActivityAt: 0,
    localTypingLastText: "",
    localTypingPushChain: Promise.resolve(),
    attachPreviewItems: [],
    attachPreviewActiveIndex: 0,
    attachPreviewSourceFiles: [],
    attachPreviewObjectUrls: [],
    attachPreviewSending: false,
    threadDropDragDepth: 0,
    clientsPager: null,
    clientsLoadInFlight: null,
    threadHistoryByClient: {},
    activeThreadWaitAbortController: null,
    summariesWaitAbortController: null,
    activeThreadEventSource: null,
    activeThreadEventSourceClientId: "",
    summariesEventSource: null,
    summariesSsePullTimer: 0,
    summariesSsePullPending: false,
    summariesSsePullInFlight: false,
    isRealtimePaused: false,
    isBootstrapLoading: true,
    chatWidgetEnabled: true,
    activeOrdersLastFetchedAt: 0,
    activeOrdersHydratedClientId: 0,
    rightPanelOrderId: 0,

    // Right column (chat) local tabs: order/client panels.
    rightTabs: [],
    activeRightTabKey: "",
    rightTabActivationToken: 0,
    rightPanelClientOrdersScrollTop: 0,
    rightPanelClientContentTab: "addresses",
    lastTouchLongPressContextMenuAt: 0,
    touchContextMenuArmUntil: 0,
    suppressOrderCardContextMenuUntil: 0,
    rightOrderOpenedFromMessageBubble: false,
    rightOrderOpenedFromHeader: false,
  };
  state.threadScrollTopByClient = sanitizeStoredThreadScrollTopByClient(state.store?.ui?.threadScrollTopByClient);
  state.threadPinnedBottomByClient = sanitizeStoredThreadPinnedBottomByClient(state.store?.ui?.threadPinnedBottomByClient);
  state.clientsPager = createDefaultClientsPager();
  if (dom.center.startupSplash && document.body && dom.center.startupSplash.parentElement !== document.body) {
    document.body.appendChild(dom.center.startupSplash);
  }
  if (document.body && dom.center.startupSplash && !dom.center.startupSplash.classList.contains("hidden")) {
    document.body.classList.add("chat-startup-splash-active");
  }

  function refreshDesktopHeaderDomRefs() {
    dom.center.headerOrder = $("#chatHeaderOrder");
    const headerRoot = dom.center.headerOrder || document;
    dom.center.headerClientBtn = $(".order-col.order-client", headerRoot) || $("#chatHeaderClientBtn", headerRoot) || $("#chatHeaderClientBtn");
    dom.center.headerName = $("#chatHeaderName", headerRoot) || $("#chatHeaderName");
    dom.center.headerPhone = $("#chatHeaderPhone", headerRoot) || $("#chatHeaderPhone");
    dom.center.headerLoading = $("#chatHeaderLoading");
    dom.center.orderTitle = $("#chatOrderTitle");
    dom.center.orderStatus = $("#chatOrderStatus", headerRoot) || $("#chatOrderStatus");
    dom.center.orderKind = $("#chatOrderKind");
    dom.center.orderId = $("#chatOrderId", headerRoot) || $("#chatOrderId");
    dom.center.orderTime = $("#chatOrderTime", headerRoot) || $("#chatOrderTime");
    dom.center.orderTimeIcon = $("#chatOrderTimeIcon", headerRoot) || $("#chatOrderTimeIcon");
    dom.center.orderAddress = $("#chatOrderAddress", headerRoot) || $("#chatOrderAddress");
    dom.center.orderComment = $("#chatOrderComment", headerRoot) || $("#chatOrderComment");
    dom.center.orderTotal = $("#chatOrderTotal", headerRoot) || $("#chatOrderTotal");
  }

  function buildHeaderOrderStatusIconHtml(source) {
    const iconValue = String(source?.icon || source?.status_icon || "").trim();
    if (!iconValue) return '<i class="fas fa-circle"></i>';
    if (isIconUrl(iconValue)) {
      return `<img src="${escapeHtml(iconValue)}" alt="" loading="lazy">`;
    }
    return `<i class="${escapeHtml(normalizeIconClass(iconValue) || "fas fa-circle")}"></i>`;
  }

  function getSortedHeaderOrderStatuses() {
    return [...(Array.isArray(state.orderStatuses) ? state.orderStatuses : [])]
      .filter((status) => Number.isFinite(Number(status?.id)) && Number(status.id) > 0)
      .sort((a, b) => (Number(a?.sort || 0) - Number(b?.sort || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));
  }

  function getHeaderOrderStatusMetaById(statusId) {
    const id = Number(statusId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return getSortedHeaderOrderStatuses().find((status) => Number(status?.id) === id) || null;
  }

  function getHeaderOrderStatusMeta(order, fallbackText = "") {
    const matched = getHeaderOrderStatusMetaById(order?.status_id);
    if (matched) return matched;
    return {
      id: Number(order?.status_id || 0) || null,
      code: String(order?.status_code || "").trim(),
      title: String(order?.status_title || fallbackText || "").trim(),
      icon: String(order?.status_icon || "").trim(),
      is_final: Number(order?.status_is_final || 0) || 0,
    };
  }

  function normalizeHeaderStatusCode(statusMeta) {
    return String(statusMeta?.code || "").trim().toLowerCase();
  }

  function isHeaderDeliveredStatusMeta(statusMeta) {
    return normalizeHeaderStatusCode(statusMeta) === "delivered";
  }

  function isHeaderCanceledStatusMeta(statusMeta) {
    const code = normalizeHeaderStatusCode(statusMeta);
    return code === "canceled" || code === "cancelled";
  }

  function isHeaderFinalStatusMeta(statusMeta) {
    return Number(statusMeta?.is_final || 0) === 1 || isHeaderCanceledStatusMeta(statusMeta);
  }

  function isHeaderForbiddenStatusTransition(fromStatus, toStatus) {
    return isHeaderDeliveredStatusMeta(fromStatus) && isHeaderCanceledStatusMeta(toStatus);
  }

  function getHeaderNextStatusMetaForOrder(order) {
    const sortedStatuses = getSortedHeaderOrderStatuses();
    if (!sortedStatuses.length) return null;
    const currentStatusId = Number(order?.status_id || 0);
    const currentIndex = sortedStatuses.findIndex((status) => Number(status?.id) === currentStatusId);
    const currentStatus = currentIndex >= 0 ? sortedStatuses[currentIndex] : null;
    if (currentIndex < 0) return sortedStatuses[0] || null;
    if (isHeaderFinalStatusMeta(currentStatus)) return null;
    const maxOffset = isHeaderDeliveredStatusMeta(currentStatus)
      ? Math.max(0, sortedStatuses.length - currentIndex - 1)
      : sortedStatuses.length;
    for (let offset = 1; offset <= maxOffset; offset += 1) {
      const candidate = sortedStatuses[(currentIndex + offset) % sortedStatuses.length];
      if (!candidate) continue;
      if (Number(candidate?.id || 0) === Number(currentStatus?.id || 0)) break;
      if (isHeaderForbiddenStatusTransition(currentStatus, candidate)) continue;
      return candidate;
    }
    return null;
  }

  function ensureHeaderOrderStatusesLoaded(force = false) {
    if (state.orderStatusesLoading) return Promise.resolve();
    if (!force && state.orderStatusesLoaded) return Promise.resolve();
    state.orderStatusesLoading = true;
    return apiJson("/api/admin/orders/statuses")
      .then((json) => {
        state.orderStatuses = Array.isArray(json?.data) ? json.data : [];
        state.orderStatusesLoaded = true;
      })
      .catch((err) => {
        console.error(err);
        state.orderStatuses = [];
        state.orderStatusesLoaded = true;
      })
      .finally(() => {
        state.orderStatusesLoading = false;
        if (dom.center.headerOrder) renderChatHeader();
      });
  }

  function buildHeaderOrderStageButtonHtml(order, text) {
    const currentTitle = String(text || "—").trim() || "—";
    const currentStatus = order ? getHeaderOrderStatusMeta(order, currentTitle) : null;
    const nextStatus = order ? getHeaderNextStatusMetaForOrder(order) : null;
    const nextStatusId = Number(nextStatus?.id || 0);
    const canCycle = Boolean(
      order
      && Number(order?.id || 0) > 0
      && currentStatus
      && !isHeaderFinalStatusMeta(currentStatus)
      && Number.isFinite(nextStatusId)
      && nextStatusId > 0
      && !state.headerOrderStatusMutationInFlight
    );
    const nextTitle = canCycle
      ? (String(nextStatus?.title || "").trim() || currentTitle)
      : currentTitle;
    const titleText = canCycle ? `${currentTitle} -> ${nextTitle}` : currentTitle;
    const currentIconHtml = buildHeaderOrderStatusIconHtml(currentStatus || order);
    const nextIconHtml = canCycle ? buildHeaderOrderStatusIconHtml(nextStatus) : "";
    if (sharedOrderPanel && typeof sharedOrderPanel.buildOrderStageCycleButtonHtml === "function") {
      const temp = document.createElement("div");
      temp.innerHTML = sharedOrderPanel.buildOrderStageCycleButtonHtml({
        orderId: Number(order?.id || 0),
        canCycle,
        currentTitle,
        nextTitle,
        titleText,
        nextNote: "Сменить",
        currentIconHtml,
        nextIconHtml,
        nextStatusId,
      }).trim();
      const button = temp.firstElementChild;
      if (button) {
        button.id = "chatOrderStatus";
        if (!canCycle) {
          button.disabled = true;
          button.setAttribute("aria-disabled", "true");
        } else {
          button.removeAttribute("disabled");
          button.setAttribute("aria-disabled", "false");
        }
        return button.outerHTML;
      }
    }
    return '' +
      `<button class="order-stage-btn${canCycle ? "" : " is-static"}" id="chatOrderStatus" type="button"${canCycle ? ` data-action="order-row-status-next" data-order-id="${escapeHtml(order?.id || "")}" data-next-status-id="${escapeHtml(nextStatusId)}" aria-disabled="false"` : ' disabled aria-disabled="true"'}>` +
        '<span class="order-stage-btn-icon-shell" aria-hidden="true">' +
          '<span class="order-stage-btn-icon-wrap order-stage-btn-icon-current">' +
            currentIconHtml +
          '</span>' +
          (canCycle ? (
            '<span class="order-stage-btn-icon-wrap order-stage-btn-icon-next">' +
              nextIconHtml +
            '</span>'
          ) : '') +
        '</span>' +
        '<span class="order-stage-btn-content">' +
          '<span class="order-stage-btn-panel order-stage-btn-panel-current">' +
            `<span class="order-stage-btn-current">${escapeHtml(currentTitle)}</span>` +
          '</span>' +
          (canCycle ? (
            '<span class="order-stage-btn-panel order-stage-btn-panel-next" aria-hidden="true">' +
              `<span class="order-stage-btn-next">${escapeHtml(nextTitle)}</span>` +
              '<span class="order-stage-btn-meta">Сменить</span>' +
            '</span>'
          ) : '') +
        '</span>' +
      '</button>';
  }

  function buildDesktopChatHeaderFallbackMarkup() {
    return '' +
      '<div class="order-col order-id">' +
        '<div class="order-id-select-hit order-id-select-hit--readonly">' +
          '<div class="order-id-num" id="chatOrderId">—</div>' +
          '<div class="order-id-time" id="chatOrderTime">—</div>' +
        '</div>' +
      '</div>' +
      '<div class="order-col order-indicators">' +
        '<span class="order-time-icon" id="chatOrderTimeIcon" aria-hidden="true"><i class="fas fa-calendar-day"></i></span>' +
      '</div>' +
      '<div class="order-col order-client">' +
        '<div class="order-client-name"><i class="fas fa-user"></i><span class="order-client-name-text" id="chatHeaderName">—</span></div>' +
        '<div class="order-client-phone muted">' +
          '<i class="fas fa-phone"></i>' +
          '<span class="order-client-phone-text" id="chatHeaderPhone">—</span>' +
        '</div>' +
      '</div>' +
      '<div class="order-col order-address">' +
        '<div class="order-address-line"><i class="fas fa-map-marker-alt"></i><span id="chatOrderAddress">—</span></div>' +
        '<div class="order-address-comment muted"><i class="far fa-comment"></i><span id="chatOrderComment">—</span></div>' +
      '</div>' +
      '<div class="order-col order-stage">' + buildHeaderOrderStageButtonHtml(null, "—") + '</div>' +
      '<div class="order-col order-total">' +
        '<button type="button" class="order-payment-btn order-payment-cash is-empty" id="chatOrderTotal" tabindex="-1">—</button>' +
      '</div>';
  }

  function ensureDesktopChatHeaderMarkup() {
    refreshDesktopHeaderDomRefs();
    if (!dom.center.headerOrder) return;

    const headerOrder = dom.center.headerOrder;
    if (headerOrder.dataset.sharedMarkupReady === "1") return;

    const headerLoading = dom.center.headerLoading;
    const orderTitle = dom.center.orderTitle;
    const orderKind = dom.center.orderKind;
    const timeIconHtml = '<span class="order-time-icon" id="chatOrderTimeIcon" aria-hidden="true"><i class="fas fa-calendar-day"></i></span>';
    const customerNameHtml = '<span class="order-client-name-text" id="chatHeaderName">—</span>';
    const customerPhoneHtml = '' +
      '<div class="order-client-phone muted">' +
        '<i class="fas fa-phone"></i>' +
        '<span class="order-client-phone-text" id="chatHeaderPhone">—</span>' +
      '</div>';
    const addressLineHtml = '<div class="order-address-line"><i class="fas fa-map-marker-alt"></i><span id="chatOrderAddress">—</span></div>';
    const addressCommentHtml = '<div class="order-address-comment muted"><i class="far fa-comment"></i><span id="chatOrderComment">—</span></div>';
    const stageHtml = buildHeaderOrderStageButtonHtml(null, "—");
    const paymentHtml = '<button type="button" class="order-payment-btn order-payment-cash is-empty" id="chatOrderTotal" tabindex="-1">—</button>';

    if (headerLoading?.parentElement) headerLoading.parentElement.removeChild(headerLoading);
    if (orderTitle?.parentElement) orderTitle.parentElement.removeChild(orderTitle);
    if (orderKind?.parentElement) orderKind.parentElement.removeChild(orderKind);

    headerOrder.classList.remove("chat-main-order", "chat-desktop-order-header");
    headerOrder.classList.add("order-list-card", "shared-order-summary-row");
    headerOrder.innerHTML = sharedOrderPanel && typeof sharedOrderPanel.buildOrderListRowInnerHtml === "function"
      ? sharedOrderPanel.buildOrderListRowInnerHtml({
        showMultiSelect: false,
        orderIdNumHtml: '<div class="order-id-num" id="chatOrderId">—</div>',
        createdAtHtml: '<div class="order-id-time" id="chatOrderTime">—</div>',
        customerNameHtml,
        customerPhoneHtml,
        timeIconHtml,
        addressLineHtml,
        addressCommentHtml,
        stageHtml,
        paymentHtml,
      })
      : buildDesktopChatHeaderFallbackMarkup();

    if (headerLoading) headerOrder.appendChild(headerLoading);
    if (orderTitle) headerOrder.appendChild(orderTitle);
    if (orderKind) headerOrder.appendChild(orderKind);

    headerOrder.dataset.sharedMarkupReady = "1";
    refreshDesktopHeaderDomRefs();
    initHeaderClientOpenAction();
  }

  function isHeaderOrderPaid(order) {
    const raw = order?.is_paid;
    return Number(raw || 0) === 1 || raw === true;
  }

  function isHeaderOrderFullyRefunded(order) {
    if (!order || !isHeaderOrderPaid(order)) return false;
    const refundState = String(order?.refund_state || "").trim().toLowerCase();
    const refundedTotal = Number(order?.refunded_total || 0) || 0;
    const refundableTotal = Number(order?.refundable_total);
    if (refundState === "full") return true;
    if (refundedTotal <= 0) return false;
    if (Number.isFinite(refundableTotal)) return refundableTotal <= 0.001;
    return refundedTotal >= ((Number(order?.total_price || order?.total || 0) || 0) - 0.001);
  }

  function renderHeaderOrderPaymentIconHtml(paymentCode) {
    return `<i class="fas ${escapeHtml(paymentIcon(paymentCode))}"></i>`;
  }

  let emojiCategories = {};
  let emojiRecentList = [];
  let emojiActiveCategory = "people";
  let emojiDatasetPromise = null;
  let emojiPopoverMode = "composer";
  let emojiPopoverReactionMessageId = "";
  let pendingNotificationChatOpenRequest = null;
  let pendingNotificationMessageFocus = null;
  let attachmentDraftDbPromise = null;
  let attachPreviewDraftPersistTimer = 0;
  let attachPreviewDraftRestoreToken = 0;
  let uiStatePersistTimer = 0;
  let pinnedBottomLayoutSyncRaf = 0;
  const threadReactionRenderSignatures = new Map();
  const pendingThreadReactionPopKeys = new Set();
  const pendingThreadReactionOverrides = new Map();
  const remoteClientsPageRequests = new Map();
  let activeClientSwipeRow = null;
  let suppressClientRowClickUntil = 0;
  let adminChatBodyScrollLockState = null;
  let adminChatBodyScrollLockY = 0;
  let adminChatKeyboardSyncBound = false;
  let adminChatKeyboardSyncRaf = 0;
  let adminChatKeyboardMotionRaf = 0;
  let adminChatKeyboardMotionUntil = 0;
  let adminChatKeyboardViewportBaseBottom = 0;
  let adminChatKeyboardViewportBaseHeight = 0;
  let adminChatKeyboardLastViewportBottom = 0;
  let adminChatKeyboardLastInset = 0;
  let adminChatKeyboardTrackedMessagesBottomDistance = null;
  let adminChatKeyboardFocusSessionActive = false;
  let adminChatPageScrollRepairRaf = 0;
  let adminChatPageScrollRepairUntil = 0;
  let adminChatOverlayLayoutBound = false;
  let adminChatThreadEdgeSpringShift = 0;
  let adminChatThreadEdgeSpringVelocity = 0;
  let adminChatThreadEdgeSpringRaf = 0;
  let adminChatThreadEdgeSpringPinRaf = 0;
  let adminChatThreadEdgeSpringWheelReleaseTimer = 0;
  let adminChatThreadEdgeSpringTouchActive = false;
  let adminChatThreadEdgeSpringTouchEdge = "";
  let adminChatThreadEdgeSpringMomentumTouchActive = false;
  let adminChatThreadEdgeSpringMomentumLastTouchEndAt = 0;
  let adminChatThreadEdgeSpringMomentumBounceConsumed = false;
  let adminChatThreadEdgeSpringMomentumLastScrollTop = 0;
  let adminChatThreadEdgeSpringMomentumLastScrollAt = 0;
  let adminChatThreadEdgeSpringMomentumLastVelocity = 0;
  let adminChatThreadEdgeSpringMomentumLastActiveVelocity = 0;
  let adminChatThreadEdgeSpringMomentumLastActiveVelocityAt = 0;
  let adminChatThreadEdgeSpringMomentumArmedVelocity = 0;
  let adminChatThreadEdgeSpringMomentumArmedEdge = "";
  let adminChatThreadEdgeSpringMomentumWatchRaf = 0;
  let adminChatThreadTouchGestureActive = false;
  let adminChatThreadTouchGestureReleaseTimer = 0;
  let adminChatRenderAutoScrollTimer = 0;
  let adminChatDeferredAutoScrollTimer = 0;
  let adminChatSuppressPinnedBottomUntil = 0;
  let adminChatKeyboardCollapseBottomDistance = null;
  let adminChatKeyboardCollapseInputAnchorSnapshot = null;
  let adminChatKeyboardOpenInputAnchorSnapshot = null;
  let adminChatKeyboardOpenBottomDistance = null;
  let adminChatKeyboardInsetApplyToken = 0;
  let threadLayoutAnimationLastRunAt = 0;
  let threadLayoutAnimationQuietUntil = 0;
  let threadLayoutAnimationToken = 0;
  let scrollDownForceVisibleUntil = 0;
  let scrollDownForceVisibleReleaseTimer = 0;

  function shouldSuppressPinnedBottomAutoScroll() {
    return Date.now() < Number(adminChatSuppressPinnedBottomUntil || 0);
  }

  function getClientSwipeRowMain(row) {
    return row ? $(".chat-client-row-main", row) : null;
  }

  function getClientSwipeWidth(row) {
    const actions = row ? $(".chat-client-row-actions", row) : null;
    if (!actions) return 0;
    const visibleButtons = $$(".chat-client-row-action", actions)
      .filter((btn) => btn && !btn.classList.contains("hidden"));
    if (!visibleButtons.length) return 0;
    return visibleButtons.reduce((sum, btn) => {
      const width = Math.max(
        92,
        Math.round(btn.getBoundingClientRect().width || btn.offsetWidth || 92)
      );
      return sum + width;
    }, 0);
  }

  function closeClientSwipeRow(row, options = {}) {
    const targetRow = row && row.isConnected ? row : null;
    if (!targetRow) {
      if (activeClientSwipeRow === row) activeClientSwipeRow = null;
      return false;
    }
    const main = getClientSwipeRowMain(targetRow);
    if (!main) return false;
    const wasOpen = targetRow.classList.contains("is-swipe-open") || targetRow.classList.contains("is-swipe-dragging");
    targetRow.classList.remove("is-swipe-open", "is-swipe-dragging");
    if (options.immediate === true) {
      targetRow.classList.remove("is-swipe-returning");
      main.style.transform = "";
    } else {
      targetRow.classList.add("is-swipe-returning");
      main.style.transform = "";
      window.setTimeout(() => {
        if (targetRow.isConnected) targetRow.classList.remove("is-swipe-returning");
      }, 180);
    }
    delete targetRow.dataset.swipeOffset;
    if (activeClientSwipeRow === targetRow) activeClientSwipeRow = null;
    return wasOpen;
  }

  function closeAllClientSwipeRows(exceptRow = null, options = {}) {
    if (!dom.left.list) {
      activeClientSwipeRow = null;
      return;
    }
    $$(".chat-client-row.is-swipe-open, .chat-client-row.is-swipe-dragging", dom.left.list)
      .forEach((row) => {
        if (exceptRow && row === exceptRow) return;
        closeClientSwipeRow(row, options);
      });
  }

  function openClientSwipeRow(row) {
    const targetRow = row && row.isConnected ? row : null;
    if (!targetRow) return false;
    const main = getClientSwipeRowMain(targetRow);
    const swipeWidth = getClientSwipeWidth(targetRow);
    if (!main || swipeWidth <= 0) return false;
    closeAllClientSwipeRows(targetRow, { immediate: true });
    targetRow.classList.remove("is-swipe-dragging", "is-swipe-returning");
    targetRow.classList.add("is-swipe-open");
    targetRow.dataset.swipeOffset = String(-swipeWidth);
    main.style.transform = `translateX(${-swipeWidth}px)`;
    activeClientSwipeRow = targetRow;
    return true;
  }

  function bindClientRowSwipe(row, client) {
    if (!row || row.dataset.swipeBound === "1") return;
    row.dataset.swipeBound = "1";
    const main = getClientSwipeRowMain(row);
    const actions = $(".chat-client-row-actions", row);
    if (!main || !actions) return;

    let touchId = null;
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let currentOffset = 0;
    let gestureActive = false;
    let gestureSwiping = false;

    const finishSwipeGesture = (cancelled = false) => {
      if (!gestureActive && !gestureSwiping) return;
      const swipeWidth = getClientSwipeWidth(row);
      const shouldOpen = !cancelled && swipeWidth > 0 && currentOffset <= (-swipeWidth * 0.45);
      row.classList.remove("is-swipe-dragging");
      if (gestureSwiping) suppressClientRowClickUntil = Date.now() + 220;
      if (shouldOpen) {
        openClientSwipeRow(row);
      } else {
        closeClientSwipeRow(row);
      }
      touchId = null;
      startX = 0;
      startY = 0;
      startOffset = 0;
      currentOffset = 0;
      gestureActive = false;
      gestureSwiping = false;
    };

    main.addEventListener("touchstart", (event) => {
      if (!isChatMobileViewport()) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const swipeWidth = getClientSwipeWidth(row);
      if (swipeWidth <= 0) return;
      touchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      startOffset = row.classList.contains("is-swipe-open") ? -swipeWidth : 0;
      currentOffset = startOffset;
      gestureActive = true;
      gestureSwiping = false;
    }, { passive: true });

    main.addEventListener("touchmove", (event) => {
      if (!gestureActive) return;
      const touch = Array.from(event.touches || []).find((item) => item.identifier === touchId) || event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const swipeWidth = getClientSwipeWidth(row);
      if (swipeWidth <= 0) {
        finishSwipeGesture(true);
        return;
      }

      if (!gestureSwiping) {
        if (Math.abs(dx) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          finishSwipeGesture(true);
          return;
        }
        closeAllClientSwipeRows(row, { immediate: true });
        gestureSwiping = true;
        row.classList.add("is-swipe-dragging");
        row.classList.remove("is-swipe-returning");
      }

      event.preventDefault();
      currentOffset = Math.max(-swipeWidth, Math.min(0, startOffset + dx));
      row.dataset.swipeOffset = String(currentOffset);
      main.style.transform = `translateX(${currentOffset}px)`;
    }, { passive: false });

    main.addEventListener("touchend", () => {
      finishSwipeGesture(false);
    }, { passive: true });

    main.addEventListener("touchcancel", () => {
      finishSwipeGesture(true);
    }, { passive: true });

    actions.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-chat-client-action-inline]");
      if (!actionBtn) return;
      event.preventDefault();
      event.stopPropagation();
      closeClientSwipeRow(row, { immediate: true });
      const action = String(actionBtn.getAttribute("data-chat-client-action-inline") || "");
      if (action === "clear") {
        clearClientChat(client.id);
        return;
      }
      if (action === "delete-guest") {
        deleteGuestClientChat(client.id);
      }
    });
  }

  function schedulePinnedBottomLayoutSync() {
    if (pinnedBottomLayoutSyncRaf) return;
    pinnedBottomLayoutSyncRaf = window.requestAnimationFrame(() => {
      pinnedBottomLayoutSyncRaf = 0;
      if (adminChatThreadTouchGestureActive) return;
      if (shouldSuppressPinnedBottomAutoScroll()) return;
      const activeId = normalizeClientIdKey(state.activeClientId);
      if (!activeId) return;
      if (!isThreadPinnedBottomPreferred(activeId)) return;
      scrollMessagesToBottom({ behavior: "auto", keepPending: true });
      saveThreadScrollPosition(activeId);
    });
  }

  function enforcePinnedBottomForActiveThread(reason = "") {
    if (adminChatThreadTouchGestureActive) return false;
    if (shouldSuppressPinnedBottomAutoScroll()) return false;
    const activeId = normalizeClientIdKey(state.activeClientId);
    if (!activeId) return false;
    if (!isThreadPinnedBottomPreferred(activeId)) return false;
    const keyboardOpen = !!(
      document.body
      && document.body.classList.contains("chat-mobile-keyboard-open")
    );
    scrollMessagesToBottom({
      behavior: keyboardOpen ? "smooth-fast" : "auto",
      keepPending: true,
    });
    saveThreadScrollPosition(activeId);
    return true;
  }

  function shouldUseNativeMobileEmojiKeyboard() {
    const narrowViewport = typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 768px)").matches
      : window.innerWidth <= 768;
    if (!narrowViewport) return false;

    const hasTouchPoints = Number(navigator.maxTouchPoints || 0) > 0;
    const hasCoarsePointer = typeof window.matchMedia === "function"
      && window.matchMedia("(pointer: coarse)").matches;
    return hasTouchPoints || hasCoarsePointer;
  }

  function isIOSMobileBrowser() {
    const ua = String((navigator && navigator.userAgent) || "");
    const platform = String((navigator && navigator.platform) || "");
    const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
    if (!ua && !platform) return false;
    if (/iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad|iPod/i.test(platform)) return true;
    return /Macintosh/i.test(ua) && maxTouchPoints > 1;
  }

  function parseCssLengthPx(value) {
    const parsed = parseFloat(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isAdminMobileChatLayout() {
    return !!(document.body && document.body.classList.contains("page-chat") && isChatMobileViewport());
  }

  function shouldPreferNativeAdminMobileChatTouchHandling() {
    return isAdminMobileChatLayout();
  }

  function hasFocusedAdminChatTextInput() {
    const active = document.activeElement;
    return active === dom.center.input || active === dom.center.attachPreviewCaption;
  }

  function getFocusedAdminChatTextInput() {
    const active = document.activeElement;
    if (active === dom.center.input || active === dom.center.attachPreviewCaption) {
      return active;
    }
    return null;
  }

  function isAdminChatEmptyThreadTouchTarget(target) {
    const targetEl = target && target.closest ? target : null;
    if (!targetEl) return false;
    if (targetEl.closest(".chat-day-separator")) return false;
    if (targetEl.closest(".chat-message-bubble")) return false;
    if (targetEl.closest(".chat-message-attachment")) return false;
    if (targetEl.closest(".chat-message-order-cards")) return false;
    if (targetEl.closest(".chat-message-reaction-pill")) return false;
    if (targetEl.closest("[data-chat-autolink]")) return false;
    if (targetEl.closest("[data-chat-scroll-to-message]")) return false;
    if (targetEl.closest("button,a,input,textarea,[contenteditable='true']")) return false;
    return true;
  }

  function dismissAdminChatTextInputFocus() {
    const activeField = getFocusedAdminChatTextInput();
    if (!activeField || typeof activeField.blur !== "function") return false;
    try {
      activeField.blur();
    } catch {
      return false;
    }
    scheduleAdminChatKeyboardViewportSyncBurst();
    return true;
  }

  function getAdminChatViewportHeight() {
    const viewport = window.visualViewport;
    const visualViewportHeight = viewport ? Number(viewport.height || 0) : 0;
    if (Number.isFinite(visualViewportHeight) && visualViewportHeight > 0) {
      return Math.max(0, Math.round(visualViewportHeight));
    }
    return Math.max(
      0,
      Math.round(
        Math.max(
          Number(window.innerHeight || 0),
          Number(document.documentElement && document.documentElement.clientHeight || 0)
        )
      )
    );
  }

  function getAdminChatViewportEffectiveOffsetTop() {
    const viewport = window.visualViewport;
    const viewportOffsetTop = viewport ? Number(viewport.offsetTop || 0) : 0;
    if (!Number.isFinite(viewportOffsetTop) || viewportOffsetTop <= 0) {
      return 0;
    }
    if (
      isIOSMobileBrowser()
      && isAdminMobileChatLayout()
      && adminChatBodyScrollLockState
      && (
        hasFocusedAdminChatTextInput()
        || (
          adminChatKeyboardFocusSessionActive === true
          && Math.max(0, Number(adminChatKeyboardLastInset || 0)) > 0
        )
      )
    ) {
      return 0;
    }
    return Math.round(viewportOffsetTop);
  }

  function getAdminChatViewportOffsetTop() {
    return getAdminChatViewportEffectiveOffsetTop();
  }

  function getAdminChatViewportBottom() {
    const viewport = window.visualViewport;
    const viewportOffsetTop = getAdminChatViewportEffectiveOffsetTop();
    const viewportHeight = viewport ? Number(viewport.height || 0) : 0;
    const viewportBottom = (
      Number.isFinite(viewportHeight)
      && viewportHeight > 0
      && Number.isFinite(viewportOffsetTop)
      && viewportOffsetTop >= 0
    )
      ? viewportOffsetTop + viewportHeight
      : 0;
    const fallbackBottom = Math.max(
      Number(window.innerHeight || 0),
      Number(document.documentElement && document.documentElement.clientHeight || 0)
    );
    if (isIOSMobileBrowser() && viewportBottom > 0) {
      return Math.max(0, Math.round(viewportBottom));
    }
    return Math.max(0, Math.round(Math.max(viewportBottom, fallbackBottom)));
  }

  function captureAdminChatKeyboardViewportBaseBottom(options = {}) {
    const nextBottom = getAdminChatViewportBottom();
    const nextHeight = getAdminChatViewportHeight();
    if (!nextBottom) return adminChatKeyboardViewportBaseBottom;
    if (
      options.force === true
      || !adminChatKeyboardViewportBaseBottom
      || nextBottom > adminChatKeyboardViewportBaseBottom
    ) {
      adminChatKeyboardViewportBaseBottom = nextBottom;
    }
    if (
      nextHeight > 0
      && (
        options.force === true
        || !adminChatKeyboardViewportBaseHeight
        || nextHeight > adminChatKeyboardViewportBaseHeight
      )
    ) {
      adminChatKeyboardViewportBaseHeight = nextHeight;
    }
    return adminChatKeyboardViewportBaseBottom;
  }

  function setAdminChatKeyboardTrackedMessagesBottomDistance(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) {
      adminChatKeyboardTrackedMessagesBottomDistance = null;
      return null;
    }
    adminChatKeyboardTrackedMessagesBottomDistance = Math.max(0, next);
    return adminChatKeyboardTrackedMessagesBottomDistance;
  }

  function shouldTrackAdminChatKeyboardMessagesBottomDistance(options = {}) {
    if (!isAdminMobileChatLayout()) return false;
    const prevInset = Math.max(0, Number(
      options.prevInset !== undefined ? options.prevInset : adminChatKeyboardLastInset
    ) || 0);
    const nextInset = Math.max(0, Number(
      options.nextInset !== undefined ? options.nextInset : 0
    ) || 0);
    const viewportBottom = Number(options.viewportBottom || 0);
    const viewportHeight = Number(options.viewportHeight || 0);
    const keyboardTrackingActive = options.keyboardTrackingActive === true
      || isAdminChatKeyboardTrackingActive({ prevInset, nextInset });
    if (!keyboardTrackingActive) return false;
    return options.forceThreadBottomSync === true
      || prevInset > 0
      || nextInset > 0
      || hasFocusedAdminChatTextInput()
      || isAdminChatViewportCompressed(viewportBottom, viewportHeight);
  }

  function rememberAdminChatKeyboardTrackedMessagesBottomDistance(options = {}) {
    if (!isAdminMobileChatLayout()) return null;
    const snapshot = getMessagesBottomDistanceSnapshot();
    if (snapshot == null) return adminChatKeyboardTrackedMessagesBottomDistance;
    if (options.force === true || adminChatKeyboardTrackedMessagesBottomDistance == null) {
      return setAdminChatKeyboardTrackedMessagesBottomDistance(snapshot);
    }
    return adminChatKeyboardTrackedMessagesBottomDistance;
  }

  function isAdminChatViewportCompressed(viewportBottomValue, viewportHeightValue = null) {
    const currentBottom = Number(viewportBottomValue || 0);
    const currentHeight = Number(viewportHeightValue || 0);
    const baseBottom = Number(adminChatKeyboardViewportBaseBottom || 0);
    const baseHeight = Number(adminChatKeyboardViewportBaseHeight || 0);
    if (!Number.isFinite(currentBottom) || currentBottom <= 0) return false;
    const bottomCompressed = Number.isFinite(baseBottom) && baseBottom > 0
      ? currentBottom < (baseBottom - 6)
      : false;
    const heightCompressed = Number.isFinite(currentHeight) && currentHeight > 0 && Number.isFinite(baseHeight) && baseHeight > 0
      ? currentHeight < (baseHeight - 72)
      : false;
    return bottomCompressed || heightCompressed;
  }

  function restoreLockedAdminChatPageScroll() {
    if (!adminChatBodyScrollLockState || !isIOSMobileBrowser() || !isAdminMobileChatLayout()) return false;
    const lockedY = Math.max(0, Number(adminChatBodyScrollLockY || 0));
    const bodyStyle = document.body.style;
    const docEl = document.documentElement;
    const htmlStyle = docEl ? docEl.style : null;
    const expectedTop = `-${lockedY}px`;

    if (bodyStyle.position !== "fixed") bodyStyle.position = "fixed";
    if (bodyStyle.top !== expectedTop) bodyStyle.top = expectedTop;
    if (bodyStyle.left !== "0px" && bodyStyle.left !== "0") bodyStyle.left = "0";
    if (bodyStyle.right !== "0px" && bodyStyle.right !== "0") bodyStyle.right = "0";
    if (bodyStyle.width !== "100%") bodyStyle.width = "100%";
    if (bodyStyle.height !== "100%") bodyStyle.height = "100%";
    if (bodyStyle.overflow !== "hidden") bodyStyle.overflow = "hidden";
    if (bodyStyle.overscrollBehavior !== "none") bodyStyle.overscrollBehavior = "none";

    if (htmlStyle) {
      if (htmlStyle.overflow !== "hidden") htmlStyle.overflow = "hidden";
      if (htmlStyle.overscrollBehavior !== "none") htmlStyle.overscrollBehavior = "none";
      if (htmlStyle.height !== "100%") htmlStyle.height = "100%";
    }
    return true;
  }

  function hasLockedAdminChatPageScrollDrift() {
    if (!adminChatBodyScrollLockState || !isIOSMobileBrowser() || !isAdminMobileChatLayout()) return false;
    const expectedY = Math.max(0, Number(adminChatBodyScrollLockY || 0));
    const currentY = Math.max(
      0,
      Number(window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0)
    );
    const expectedTop = `-${expectedY}px`;
    const bodyStyle = document.body.style;
    return (
      Math.abs(currentY - expectedY) >= 1
      || bodyStyle.position !== "fixed"
      || bodyStyle.top !== expectedTop
    );
  }

  function lockAdminChatPageScroll() {
    if (adminChatBodyScrollLockState || !document.body || !isIOSMobileBrowser() || !isAdminMobileChatLayout()) return;
    const bodyStyle = document.body.style;
    const docEl = document.documentElement;
    const htmlStyle = docEl ? docEl.style : null;
    adminChatBodyScrollLockY = Math.max(
      0,
      Number(window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0)
    );
    adminChatBodyScrollLockState = {
      position: String(bodyStyle.position || ""),
      top: String(bodyStyle.top || ""),
      left: String(bodyStyle.left || ""),
      right: String(bodyStyle.right || ""),
      width: String(bodyStyle.width || ""),
      height: String(bodyStyle.height || ""),
      overflow: String(bodyStyle.overflow || ""),
      overscrollBehavior: String(bodyStyle.overscrollBehavior || ""),
      htmlOverflow: String(htmlStyle && htmlStyle.overflow || ""),
      htmlOverscrollBehavior: String(htmlStyle && htmlStyle.overscrollBehavior || ""),
      htmlHeight: String(htmlStyle && htmlStyle.height || ""),
    };
    restoreLockedAdminChatPageScroll();
  }

  function unlockAdminChatPageScroll() {
    if (!adminChatBodyScrollLockState || !document.body) return;
    const bodyStyle = document.body.style;
    const docEl = document.documentElement;
    const htmlStyle = docEl ? docEl.style : null;
    const savedY = Math.max(0, Number(adminChatBodyScrollLockY || 0));
    bodyStyle.position = adminChatBodyScrollLockState.position;
    bodyStyle.top = adminChatBodyScrollLockState.top;
    bodyStyle.left = adminChatBodyScrollLockState.left;
    bodyStyle.right = adminChatBodyScrollLockState.right;
    bodyStyle.width = adminChatBodyScrollLockState.width;
    bodyStyle.height = adminChatBodyScrollLockState.height;
    bodyStyle.overflow = adminChatBodyScrollLockState.overflow;
    bodyStyle.overscrollBehavior = adminChatBodyScrollLockState.overscrollBehavior;
    if (htmlStyle) {
      htmlStyle.overflow = adminChatBodyScrollLockState.htmlOverflow;
      htmlStyle.overscrollBehavior = adminChatBodyScrollLockState.htmlOverscrollBehavior;
      htmlStyle.height = adminChatBodyScrollLockState.htmlHeight;
    }
    adminChatBodyScrollLockState = null;
    adminChatBodyScrollLockY = 0;
    if (!hasFocusedAdminChatTextInput()) {
      window.scrollTo(0, savedY);
    }
  }

  function armAdminChatPageScrollRepair(durationMs) {
    if (!isIOSMobileBrowser()) return;
    const duration = Math.max(160, Number(durationMs || 0) || 0);
    adminChatPageScrollRepairUntil = Math.max(adminChatPageScrollRepairUntil, Date.now() + duration);
  }

  function disarmAdminChatPageScrollRepair() {
    adminChatPageScrollRepairUntil = 0;
  }

  function shouldRunAdminChatPageScrollRepair() {
    if (!adminChatBodyScrollLockState || !isIOSMobileBrowser() || !isAdminMobileChatLayout()) return false;
    if (isAdminChatThreadEdgeSpringPositionControlled()) return false;
    if (hasLockedAdminChatPageScrollDrift()) return true;
    return Date.now() < Number(adminChatPageScrollRepairUntil || 0);
  }

  function scheduleAdminChatPageScrollRepair() {
    if (!shouldRunAdminChatPageScrollRepair()) return;
    if (adminChatPageScrollRepairRaf) return;
    adminChatPageScrollRepairRaf = requestAnimationFrame(() => {
      adminChatPageScrollRepairRaf = 0;
      if (!shouldRunAdminChatPageScrollRepair()) return;
      restoreLockedAdminChatPageScroll();
    });
  }

  function getAdminMobileChatBottomOverlayNode() {
    const selectionBar = dom.center.selectionBar;
    if (selectionBar && !selectionBar.classList.contains("hidden")) return selectionBar;
    return dom.center.footerPanel || null;
  }

  function syncAdminMobileChatScrollDownPosition() {
    const btn = dom.center.scrollDownBtn;
    if (!btn) return;

    if (!isAdminMobileChatLayout()) {
      btn.style.removeProperty("right");
      btn.style.removeProperty("bottom");
      return;
    }

    const root = btn.offsetParent instanceof HTMLElement ? btn.offsetParent : btn.parentElement;
    const footer = dom.center.footerPanel;
    const sendBtn = dom.center.sendBtn;
    if (!(root instanceof HTMLElement) || !(footer instanceof HTMLElement) || !(sendBtn instanceof HTMLElement)) {
      btn.style.removeProperty("right");
      btn.style.removeProperty("bottom");
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const sendRect = sendBtn.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (
      rootRect.width <= 0
      || rootRect.height <= 0
      || sendRect.width <= 0
      || sendRect.height <= 0
      || btnRect.width <= 0
      || btnRect.height <= 0
    ) {
      btn.style.removeProperty("right");
      btn.style.removeProperty("bottom");
      return;
    }

    const sendCenterX = sendRect.left + (sendRect.width / 2);
    const nextRight = Math.max(0, Math.round(rootRect.right - sendCenterX - (btnRect.width / 2)));
    const nextBottom = Math.max(18, Math.round(rootRect.bottom - sendRect.top + 16));
    btn.style.right = `${nextRight}px`;
    btn.style.bottom = `${nextBottom}px`;
  }

  function shouldUseAdminChatThreadEdgeSpring() {
    if (CHAT_THREAD_EDGE_SPRING_ENABLED !== true) return false;
    if (!dom.center.messagesWrap) return false;
    if (!dom.center.messages) return false;
    if (!isAdminMobileChatLayout()) return false;
    if (!dom.center.messages.querySelector(".chat-message[data-message-id]")) return false;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return false;
    }
    return true;
  }

  function hasAdminChatThreadMessages() {
    return !!(
      dom.center.messages
      && dom.center.messages.querySelector
      && dom.center.messages.querySelector(".chat-message[data-message-id]")
    );
  }

  function isAdminChatThreadVerticallyScrollable(wrap = dom.center.messagesWrap) {
    return getAdminChatThreadMaxScrollTop(wrap) > 1;
  }

  function setAdminChatThreadEdgeSpringTouchState(active, edge = "") {
    adminChatThreadEdgeSpringTouchActive = active === true;
    adminChatThreadEdgeSpringTouchEdge = adminChatThreadEdgeSpringTouchActive
      ? String(edge || "")
      : "";
  }

  function isAdminChatThreadEdgeSpringTouchActive(edge = "") {
    if (adminChatThreadEdgeSpringTouchActive !== true) return false;
    if (!edge) return true;
    return adminChatThreadEdgeSpringTouchEdge === String(edge || "");
  }

  function isAdminChatThreadEdgeSpringPositionControlled() {
    return isAdminChatThreadEdgeSpringTouchActive()
      || Math.abs(Number(adminChatThreadEdgeSpringShift || 0)) >= 0.1
      || !!adminChatThreadEdgeSpringRaf;
  }

  function getAdminChatThreadEdgeSpringNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  function shouldUseAdminChatThreadEdgeSpringMomentumBounce() {
    return CHAT_THREAD_EDGE_SPRING_MOMENTUM_ENABLED === true && shouldUseAdminChatThreadEdgeSpring();
  }

  function shouldUseAdminChatThreadEdgeSpringWheelNudge() {
    return CHAT_THREAD_EDGE_SPRING_WHEEL_NUDGE_ENABLED === true && shouldUseAdminChatThreadEdgeSpring();
  }

  function resetAdminChatThreadEdgeSpringMomentumState() {
    adminChatThreadEdgeSpringMomentumTouchActive = false;
    adminChatThreadEdgeSpringMomentumLastTouchEndAt = 0;
    adminChatThreadEdgeSpringMomentumBounceConsumed = false;
    adminChatThreadEdgeSpringMomentumLastScrollTop = 0;
    adminChatThreadEdgeSpringMomentumLastScrollAt = 0;
    adminChatThreadEdgeSpringMomentumLastVelocity = 0;
    adminChatThreadEdgeSpringMomentumLastActiveVelocity = 0;
    adminChatThreadEdgeSpringMomentumLastActiveVelocityAt = 0;
    adminChatThreadEdgeSpringMomentumArmedVelocity = 0;
    adminChatThreadEdgeSpringMomentumArmedEdge = "";
    stopAdminChatThreadEdgeSpringMomentumWatcher();
  }

  function beginAdminChatThreadEdgeSpringMomentumTracking(wrap = dom.center.messagesWrap) {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return;
    }
    adminChatThreadEdgeSpringMomentumTouchActive = true;
    adminChatThreadEdgeSpringMomentumLastTouchEndAt = 0;
    adminChatThreadEdgeSpringMomentumBounceConsumed = false;
    adminChatThreadEdgeSpringMomentumLastVelocity = 0;
    adminChatThreadEdgeSpringMomentumLastActiveVelocity = 0;
    adminChatThreadEdgeSpringMomentumLastActiveVelocityAt = 0;
    adminChatThreadEdgeSpringMomentumArmedVelocity = 0;
    adminChatThreadEdgeSpringMomentumArmedEdge = "";
    if (adminChatThreadEdgeSpringMomentumWatchRaf) {
      cancelAnimationFrame(adminChatThreadEdgeSpringMomentumWatchRaf);
      adminChatThreadEdgeSpringMomentumWatchRaf = 0;
    }
    adminChatThreadEdgeSpringMomentumLastScrollAt = getAdminChatThreadEdgeSpringNow();
    adminChatThreadEdgeSpringMomentumLastScrollTop = wrap
      ? Number(wrap.scrollTop || 0)
      : 0;
  }

  function getAdminChatThreadEdgeSpringMomentumDistanceToEdge(edge = "", wrap = dom.center.messagesWrap) {
    if (!wrap) return Number.POSITIVE_INFINITY;
    if (edge === "top") {
      return Math.max(0, Number(wrap.scrollTop || 0));
    }
    if (edge === "bottom") {
      return Math.max(0, getAdminChatThreadMaxScrollTop(wrap) - Number(wrap.scrollTop || 0));
    }
    return Number.POSITIVE_INFINITY;
  }

  function getAdminChatThreadEdgeSpringMomentumArmDistanceThreshold(wrap = dom.center.messagesWrap) {
    const clientHeight = Math.max(0, Number(wrap && wrap.clientHeight || 0));
    return Math.max(
      CHAT_THREAD_EDGE_SPRING_MOMENTUM_ARM_MIN_EDGE_DISTANCE_PX,
      Math.min(
        CHAT_THREAD_EDGE_SPRING_MOMENTUM_ARM_MAX_EDGE_DISTANCE_PX,
        clientHeight * 0.28,
      ),
    );
  }

  function resolveAdminChatThreadEdgeSpringMomentumVelocity(now = getAdminChatThreadEdgeSpringNow(), options = {}) {
    const includeArmed = options.includeArmed !== false;
    let velocity = Number(adminChatThreadEdgeSpringMomentumLastVelocity || 0);
    if (Math.abs(velocity) >= CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY) return velocity;

    const activeVelocityAge = now - Number(adminChatThreadEdgeSpringMomentumLastActiveVelocityAt || 0);
    if (activeVelocityAge <= CHAT_THREAD_EDGE_SPRING_MOMENTUM_ACTIVE_VELOCITY_WINDOW_MS) {
      velocity = Number(adminChatThreadEdgeSpringMomentumLastActiveVelocity || 0);
    }
    if (Math.abs(velocity) >= CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY) return velocity;

    if (
      includeArmed === true
      && adminChatThreadEdgeSpringMomentumLastTouchEndAt > 0
      && (now - adminChatThreadEdgeSpringMomentumLastTouchEndAt) <= CHAT_THREAD_EDGE_SPRING_MOMENTUM_WINDOW_MS
    ) {
      velocity = Number(adminChatThreadEdgeSpringMomentumArmedVelocity || 0);
    }
    return velocity;
  }

  function getAdminChatThreadEdgeSpringMomentumArrivalVelocity(edge = "", now = getAdminChatThreadEdgeSpringNow()) {
    const direction = edge === "top"
      ? -1
      : edge === "bottom"
        ? 1
        : 0;
    if (!direction) return 0;

    const lastScrollAt = Number(adminChatThreadEdgeSpringMomentumLastScrollAt || 0);
    if (
      lastScrollAt > 0
      && (now - lastScrollAt) <= CHAT_THREAD_EDGE_SPRING_MOMENTUM_EDGE_TRIGGER_VELOCITY_WINDOW_MS
    ) {
      const velocity = Number(adminChatThreadEdgeSpringMomentumLastVelocity || 0);
      if (velocity === 0) return 0;
      return Math.sign(velocity) === direction
        ? velocity
        : 0;
    }

    const activeVelocityAt = Number(adminChatThreadEdgeSpringMomentumLastActiveVelocityAt || 0);
    if (
      activeVelocityAt > 0
      && (now - activeVelocityAt) <= CHAT_THREAD_EDGE_SPRING_MOMENTUM_EDGE_TRIGGER_VELOCITY_WINDOW_MS
    ) {
      const velocity = Number(adminChatThreadEdgeSpringMomentumLastActiveVelocity || 0);
      if (velocity === 0) return 0;
      return Math.sign(velocity) === direction
        ? velocity
        : 0;
    }

    return 0;
  }

  function stopAdminChatThreadEdgeSpringMomentumWatcher() {
    if (!adminChatThreadEdgeSpringMomentumWatchRaf) return;
    cancelAnimationFrame(adminChatThreadEdgeSpringMomentumWatchRaf);
    adminChatThreadEdgeSpringMomentumWatchRaf = 0;
  }

  function scheduleAdminChatThreadEdgeSpringMomentumWatcher() {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return;
    }
    if (adminChatThreadEdgeSpringMomentumWatchRaf) return;
    const tick = () => {
      adminChatThreadEdgeSpringMomentumWatchRaf = 0;
      const wrap = dom.center.messagesWrap;
      if (!wrap || !shouldUseAdminChatThreadEdgeSpring()) return;
      if (adminChatThreadEdgeSpringMomentumTouchActive) return;
      if (adminChatThreadEdgeSpringMomentumBounceConsumed) return;

      const now = getAdminChatThreadEdgeSpringNow();
      if (
        adminChatThreadEdgeSpringMomentumLastTouchEndAt <= 0
        || (now - adminChatThreadEdgeSpringMomentumLastTouchEndAt) > CHAT_THREAD_EDGE_SPRING_MOMENTUM_WINDOW_MS
      ) {
        return;
      }

      maybeTriggerAdminChatThreadEdgeSpringMomentumBounce(wrap);
      if (adminChatThreadEdgeSpringMomentumBounceConsumed) return;
      if (!adminChatThreadEdgeSpringMomentumArmedEdge) return;
      adminChatThreadEdgeSpringMomentumWatchRaf = requestAnimationFrame(tick);
    };
    adminChatThreadEdgeSpringMomentumWatchRaf = requestAnimationFrame(tick);
  }

  function armAdminChatThreadEdgeSpringMomentumBounce(wrap = dom.center.messagesWrap) {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return;
    }
    const now = getAdminChatThreadEdgeSpringNow();
    const velocity = resolveAdminChatThreadEdgeSpringMomentumVelocity(now, { includeArmed: false });
    if (Math.abs(velocity) < CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY) {
      adminChatThreadEdgeSpringMomentumArmedVelocity = 0;
      adminChatThreadEdgeSpringMomentumArmedEdge = "";
      stopAdminChatThreadEdgeSpringMomentumWatcher();
      return;
    }

    const edge = velocity < 0 ? "top" : "bottom";
    const distanceToEdge = getAdminChatThreadEdgeSpringMomentumDistanceToEdge(edge, wrap);
    if (distanceToEdge > getAdminChatThreadEdgeSpringMomentumArmDistanceThreshold(wrap)) {
      adminChatThreadEdgeSpringMomentumArmedVelocity = 0;
      adminChatThreadEdgeSpringMomentumArmedEdge = "";
      stopAdminChatThreadEdgeSpringMomentumWatcher();
      return;
    }

    adminChatThreadEdgeSpringMomentumArmedVelocity = velocity;
    adminChatThreadEdgeSpringMomentumArmedEdge = edge;
    scheduleAdminChatThreadEdgeSpringMomentumWatcher();
  }

  function refreshAdminChatThreadEdgeSpringMomentumBounce(wrap = dom.center.messagesWrap) {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return false;
    }
    if (!wrap) return false;
    if (adminChatThreadEdgeSpringMomentumTouchActive) return false;
    if (adminChatThreadEdgeSpringMomentumBounceConsumed) return false;

    const now = getAdminChatThreadEdgeSpringNow();
    if (
      adminChatThreadEdgeSpringMomentumLastTouchEndAt <= 0
      || (now - adminChatThreadEdgeSpringMomentumLastTouchEndAt) > CHAT_THREAD_EDGE_SPRING_MOMENTUM_WINDOW_MS
    ) {
      return false;
    }

    const velocity = resolveAdminChatThreadEdgeSpringMomentumVelocity(now, { includeArmed: false });
    if (Math.abs(velocity) < CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY) {
      return false;
    }

    const edge = velocity < 0 ? "top" : "bottom";
    const distanceToEdge = getAdminChatThreadEdgeSpringMomentumDistanceToEdge(edge, wrap);
    if (distanceToEdge > getAdminChatThreadEdgeSpringMomentumArmDistanceThreshold(wrap)) {
      return false;
    }

    if (
      adminChatThreadEdgeSpringMomentumArmedEdge === edge
      && Math.abs(Number(adminChatThreadEdgeSpringMomentumArmedVelocity || 0)) >= Math.abs(velocity)
    ) {
      scheduleAdminChatThreadEdgeSpringMomentumWatcher();
      return true;
    }

    adminChatThreadEdgeSpringMomentumArmedVelocity = velocity;
    adminChatThreadEdgeSpringMomentumArmedEdge = edge;
    scheduleAdminChatThreadEdgeSpringMomentumWatcher();
    return true;
  }

  function finishAdminChatThreadEdgeSpringMomentumTracking(wrap = dom.center.messagesWrap) {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return;
    }
    adminChatThreadEdgeSpringMomentumTouchActive = false;
    adminChatThreadEdgeSpringMomentumLastTouchEndAt = getAdminChatThreadEdgeSpringNow();
    armAdminChatThreadEdgeSpringMomentumBounce(wrap);
  }

  function sampleAdminChatThreadEdgeSpringMomentumScroll(wrap = dom.center.messagesWrap) {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return;
    }
    if (!wrap) return;
    const now = getAdminChatThreadEdgeSpringNow();
    const nextTop = Number(wrap.scrollTop || 0);
    if (adminChatThreadEdgeSpringMomentumLastScrollAt > 0) {
      const dt = Math.max(1, now - adminChatThreadEdgeSpringMomentumLastScrollAt);
      const delta = nextTop - adminChatThreadEdgeSpringMomentumLastScrollTop;
      if (Math.abs(delta) >= 0.1) {
        adminChatThreadEdgeSpringMomentumLastVelocity = delta / dt;
        if (Math.abs(adminChatThreadEdgeSpringMomentumLastVelocity) >= CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY) {
          adminChatThreadEdgeSpringMomentumLastActiveVelocity = adminChatThreadEdgeSpringMomentumLastVelocity;
          adminChatThreadEdgeSpringMomentumLastActiveVelocityAt = now;
        }
      }
    }
    adminChatThreadEdgeSpringMomentumLastScrollAt = now;
    adminChatThreadEdgeSpringMomentumLastScrollTop = nextTop;
    if (
      !adminChatThreadEdgeSpringMomentumTouchActive
      && !adminChatThreadEdgeSpringMomentumBounceConsumed
      && !isAdminChatThreadEdgeSpringTouchActive()
    ) {
      refreshAdminChatThreadEdgeSpringMomentumBounce(wrap);
    }
  }

  function maybeTriggerAdminChatThreadEdgeSpringMomentumBounce(wrap = dom.center.messagesWrap) {
    if (!shouldUseAdminChatThreadEdgeSpringMomentumBounce()) {
      resetAdminChatThreadEdgeSpringMomentumState();
      return false;
    }
    if (!wrap || !shouldUseAdminChatThreadEdgeSpring()) return false;
    if (adminChatThreadEdgeSpringMomentumTouchActive) return false;
    if (adminChatThreadEdgeSpringMomentumBounceConsumed) return false;
    if (isAdminChatThreadEdgeSpringTouchActive()) return false;
    if (Math.abs(adminChatThreadEdgeSpringShift) >= 0.1 || adminChatThreadEdgeSpringRaf) return false;

    const now = getAdminChatThreadEdgeSpringNow();
    if (
      adminChatThreadEdgeSpringMomentumLastTouchEndAt <= 0
      || (now - adminChatThreadEdgeSpringMomentumLastTouchEndAt) > CHAT_THREAD_EDGE_SPRING_MOMENTUM_WINDOW_MS
    ) {
      return false;
    }

    let edge = "";
    const armedEdge = String(adminChatThreadEdgeSpringMomentumArmedEdge || "");
    const nearTop = getAdminChatThreadEdgeSpringMomentumDistanceToEdge("top", wrap)
      <= getAdminChatThreadMomentumEdgeReachEpsilon("top", wrap);
    const nearBottom = getAdminChatThreadEdgeSpringMomentumDistanceToEdge("bottom", wrap)
      <= getAdminChatThreadMomentumEdgeReachEpsilon("bottom", wrap);
    if (armedEdge === "top" && nearTop) {
      edge = "top";
    } else if (armedEdge === "bottom" && nearBottom) {
      edge = "bottom";
    } else {
      const velocity = Number(adminChatThreadEdgeSpringMomentumLastVelocity || 0);
      if (velocity < 0 && isAdminChatThreadAtTop(wrap)) {
        edge = "top";
      } else if (velocity > 0 && isAdminChatThreadAtBottom(wrap)) {
        edge = "bottom";
      }
    }
    if (!edge && armedEdge === "top" && nearTop) edge = "top";
    if (!edge && armedEdge === "bottom" && nearBottom) edge = "bottom";
    if (!edge) return false;

    const velocity = getAdminChatThreadEdgeSpringMomentumArrivalVelocity(edge, now);
    if (Math.abs(velocity) < CHAT_THREAD_EDGE_SPRING_MOMENTUM_MIN_VELOCITY) return false;

    const maxShift = getAdminChatThreadEdgeSpringMaxShift(edge);
    const rawDistance = Math.abs(velocity) * CHAT_THREAD_EDGE_SPRING_MOMENTUM_DISTANCE_FACTOR;
    const shift = computeAdminChatThreadEdgeSpringShift(rawDistance, edge);
    const limitedShift = Math.sign(shift) * Math.min(
      maxShift * CHAT_THREAD_EDGE_SPRING_MOMENTUM_MAX_SHIFT_RATIO,
      Math.abs(shift),
    );
    if (Math.abs(limitedShift) < 0.1) return false;

    adminChatThreadEdgeSpringMomentumBounceConsumed = true;
    adminChatThreadEdgeSpringMomentumArmedVelocity = 0;
    adminChatThreadEdgeSpringMomentumArmedEdge = "";
    stopAdminChatThreadEdgeSpringMomentumWatcher();
    stopAdminChatThreadEdgeSpringAnimation();
    adminChatThreadEdgeSpringVelocity = 0;
    setAdminChatThreadEdgeSpringShift(limitedShift);
    releaseAdminChatThreadEdgeSpring();
    return true;
  }

  function getAdminChatThreadEdgeSpringOverlayMetrics() {
    if (!isAdminMobileChatLayout()) {
      return {
        headerHeight: 0,
        footerHeight: 0,
        overlayDelta: 0,
        footerToHeaderRatio: 1,
      };
    }
    const stack = dom.center.stack;
    if (!stack || typeof window.getComputedStyle !== "function") {
      return {
        headerHeight: 0,
        footerHeight: 0,
        overlayDelta: 0,
        footerToHeaderRatio: 1,
      };
    }
    const styles = window.getComputedStyle(stack);
    const headerHeight = Math.max(
      0,
      parseFloat(styles.getPropertyValue("--chat-mobile-header-overlay-height")) || 0,
    );
    const footerHeight = Math.max(
      headerHeight,
      parseFloat(styles.getPropertyValue("--chat-mobile-footer-overlay-height")) || 0,
    );
    const overlayDelta = Math.max(0, footerHeight - headerHeight);
    return {
      headerHeight,
      footerHeight,
      overlayDelta,
      footerToHeaderRatio: headerHeight > 0
        ? (footerHeight / Math.max(1, headerHeight))
        : 1,
    };
  }

  function getAdminChatThreadEdgeSpringMaxShift() {
    return isAdminMobileChatLayout()
      ? CHAT_THREAD_EDGE_SPRING_MOBILE_MAX_SHIFT_PX
      : CHAT_THREAD_EDGE_SPRING_MAX_SHIFT_PX;
  }

  function getAdminChatThreadEdgeSpringEffectiveDistance(distancePx) {
    const rawDistance = Math.max(0, Number(distancePx || 0));
    return rawDistance > 0 ? rawDistance : 0;
  }

  function getAdminChatThreadMaxScrollTop(wrap = dom.center.messagesWrap) {
    if (!wrap) return 0;
    return Math.max(0, Number(wrap.scrollHeight || 0) - Number(wrap.clientHeight || 0));
  }

  function shouldUseAdminChatKeyboardBottomSpringAllowance(wrap = dom.center.messagesWrap) {
    if (!isAdminMobileChatLayout() || !wrap) return false;
    return !!(
      (document.body && document.body.classList.contains("chat-mobile-keyboard-open"))
      || hasFocusedAdminChatTextInput()
    );
  }

  function isAdminChatThreadNearBottomForKeyboardSpring(wrap = dom.center.messagesWrap) {
    if (!wrap) return false;
    const maxTop = getAdminChatThreadMaxScrollTop(wrap);
    const epsilon = shouldUseAdminChatKeyboardBottomSpringAllowance(wrap)
      ? CHAT_THREAD_EDGE_SPRING_KEYBOARD_BOTTOM_EPSILON_PX
      : CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX;
    if (maxTop <= epsilon) return true;
    return (maxTop - Number(wrap.scrollTop || 0)) <= epsilon;
  }

  function getAdminChatThreadMomentumEdgeReachEpsilon(edge = "", wrap = dom.center.messagesWrap) {
    if (edge === "bottom" && shouldUseAdminChatKeyboardBottomSpringAllowance(wrap)) {
      return Math.max(
        CHAT_THREAD_EDGE_SPRING_MOMENTUM_EDGE_REACH_EPSILON_PX,
        CHAT_THREAD_EDGE_SPRING_KEYBOARD_BOTTOM_EPSILON_PX,
      );
    }
    return CHAT_THREAD_EDGE_SPRING_MOMENTUM_EDGE_REACH_EPSILON_PX;
  }

  function isAdminChatThreadAtTop(wrap = dom.center.messagesWrap) {
    if (!wrap) return false;
    return Number(wrap.scrollTop || 0) <= CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX;
  }

  function isAdminChatThreadAtBottom(wrap = dom.center.messagesWrap) {
    if (!wrap) return false;
    const maxTop = getAdminChatThreadMaxScrollTop(wrap);
    if (maxTop <= CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX) return true;
    return (maxTop - Number(wrap.scrollTop || 0)) <= CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX;
  }

  function pinAdminChatThreadToEdge(edge, wrap = dom.center.messagesWrap) {
    if (!wrap) return;
    if (edge === "top") {
      if (Number(wrap.scrollTop || 0) > 0) wrap.scrollTop = 0;
      return;
    }
    if (edge === "bottom") {
      const maxTop = getAdminChatThreadMaxScrollTop(wrap);
      if (Math.abs(Number(wrap.scrollTop || 0) - maxTop) > 0.5) {
        wrap.scrollTop = maxTop;
      }
    }
  }

  function stopAdminChatThreadEdgeSpringPinWatcher() {
    if (!adminChatThreadEdgeSpringPinRaf) return;
    cancelAnimationFrame(adminChatThreadEdgeSpringPinRaf);
    adminChatThreadEdgeSpringPinRaf = 0;
  }

  function startAdminChatThreadEdgeSpringPinWatcher(edge, wrap = dom.center.messagesWrap) {
    const targetEdge = String(edge || "");
    if (targetEdge !== "top" && targetEdge !== "bottom") return;
    stopAdminChatThreadEdgeSpringPinWatcher();
    const tick = () => {
      adminChatThreadEdgeSpringPinRaf = 0;
      if (!shouldUseAdminChatThreadEdgeSpring()) return;
      if (!isAdminChatThreadEdgeSpringTouchActive(targetEdge)) return;
      pinAdminChatThreadToEdge(targetEdge, wrap);
      adminChatThreadEdgeSpringPinRaf = requestAnimationFrame(tick);
    };
    adminChatThreadEdgeSpringPinRaf = requestAnimationFrame(tick);
  }

  function stopAdminChatThreadEdgeSpringAnimation() {
    if (adminChatThreadEdgeSpringRaf) {
      cancelAnimationFrame(adminChatThreadEdgeSpringRaf);
      adminChatThreadEdgeSpringRaf = 0;
    }
    if (adminChatThreadEdgeSpringWheelReleaseTimer) {
      window.clearTimeout(adminChatThreadEdgeSpringWheelReleaseTimer);
      adminChatThreadEdgeSpringWheelReleaseTimer = 0;
    }
  }

  function disableAdminChatThreadEdgeSpring() {
    resetAdminChatThreadEdgeSpringMomentumState();
    stopAdminChatThreadEdgeSpringPinWatcher();
    setAdminChatThreadEdgeSpringTouchState(false);
    stopAdminChatThreadEdgeSpringAnimation();
    adminChatThreadEdgeSpringVelocity = 0;
    setAdminChatThreadEdgeSpringShift(0);
  }

  function setAdminChatThreadEdgeSpringShift(valuePx) {
    const wrap = dom.center.messagesWrap;
    const raw = Number(valuePx || 0);
    const maxShift = getAdminChatThreadEdgeSpringMaxShift();
    const next = Number.isFinite(raw)
      ? Math.max(-maxShift, Math.min(maxShift, raw))
      : 0;
    if (Math.abs(next - adminChatThreadEdgeSpringShift) < 0.01) return adminChatThreadEdgeSpringShift;
    adminChatThreadEdgeSpringShift = next;
    if (wrap) {
      if (Math.abs(next) < 0.1) {
        wrap.style.setProperty("--chat-thread-edge-spring-shift", "0px");
      } else {
        wrap.style.setProperty("--chat-thread-edge-spring-shift", `${Number(next.toFixed(3))}px`);
      }
    }
    return adminChatThreadEdgeSpringShift;
  }

  function computeAdminChatThreadEdgeSpringShift(distancePx, direction) {
    const rawDistance = getAdminChatThreadEdgeSpringEffectiveDistance(distancePx);
    if (rawDistance <= 0) return 0;
    const maxShift = getAdminChatThreadEdgeSpringMaxShift();
    const resisted = maxShift * (
      1 - (1 / (((rawDistance * CHAT_THREAD_EDGE_SPRING_DISTANCE_GAIN) / maxShift) + 1))
    );
    return direction === "bottom" ? -resisted : resisted;
  }

  function releaseAdminChatThreadEdgeSpring(options = {}) {
    const immediate = options.immediate === true;
    stopAdminChatThreadEdgeSpringAnimation();
    stopAdminChatThreadEdgeSpringPinWatcher();
    setAdminChatThreadEdgeSpringTouchState(false);
    if (immediate || Math.abs(adminChatThreadEdgeSpringShift) < 0.1) {
      adminChatThreadEdgeSpringVelocity = 0;
      setAdminChatThreadEdgeSpringShift(0);
      return;
    }

    adminChatThreadEdgeSpringRaf = requestAnimationFrame(function step(now) {
      if (!shouldUseAdminChatThreadEdgeSpring()) {
        adminChatThreadEdgeSpringRaf = 0;
        adminChatThreadEdgeSpringVelocity = 0;
        setAdminChatThreadEdgeSpringShift(0);
        return;
      }

      const prevNow = Number(step._prevNow || now);
      const dt = Math.max(0.001, Math.min(0.034, (now - prevNow) / 1000));
      step._prevNow = now;

      const displacement = Number(adminChatThreadEdgeSpringShift || 0);
      const acceleration = (
        (-CHAT_THREAD_EDGE_SPRING_RELEASE_STIFFNESS * displacement)
        - (CHAT_THREAD_EDGE_SPRING_RELEASE_DAMPING * adminChatThreadEdgeSpringVelocity)
      );
      adminChatThreadEdgeSpringVelocity += acceleration * dt;
      const nextDisplacement = displacement + (adminChatThreadEdgeSpringVelocity * dt);
      if (
        (displacement > 0 && nextDisplacement <= 0)
        || (displacement < 0 && nextDisplacement >= 0)
      ) {
        adminChatThreadEdgeSpringRaf = 0;
        adminChatThreadEdgeSpringVelocity = 0;
        setAdminChatThreadEdgeSpringShift(0);
        return;
      }
      setAdminChatThreadEdgeSpringShift(nextDisplacement);

      if (Math.abs(adminChatThreadEdgeSpringShift) < 0.24 && Math.abs(adminChatThreadEdgeSpringVelocity) < 2.4) {
        adminChatThreadEdgeSpringRaf = 0;
        adminChatThreadEdgeSpringVelocity = 0;
        setAdminChatThreadEdgeSpringShift(0);
        return;
      }

      adminChatThreadEdgeSpringRaf = requestAnimationFrame(step);
    });
  }

  function nudgeAdminChatThreadEdgeSpringFromWheel(direction, deltaY) {
    const sign = direction === "bottom" ? -1 : 1;
    const currentShift = Number(adminChatThreadEdgeSpringShift || 0);
    const nextBase = Math.sign(currentShift) === sign ? Math.abs(currentShift) : 0;
    const nextShift = sign * Math.min(
      getAdminChatThreadEdgeSpringMaxShift(direction),
      nextBase + (Math.abs(Number(deltaY || 0)) * CHAT_THREAD_EDGE_SPRING_WHEEL_FACTOR),
    );
    stopAdminChatThreadEdgeSpringAnimation();
    adminChatThreadEdgeSpringVelocity = 0;
    setAdminChatThreadEdgeSpringShift(nextShift);
    adminChatThreadEdgeSpringWheelReleaseTimer = window.setTimeout(() => {
      adminChatThreadEdgeSpringWheelReleaseTimer = 0;
      releaseAdminChatThreadEdgeSpring();
    }, CHAT_THREAD_EDGE_SPRING_WHEEL_RELEASE_MS);
  }

  function bindAdminChatThreadEdgeSpring() {
    const wrap = dom.center.messagesWrap;
    if (!wrap || wrap.dataset.edgeSpringBound === "1") return;
    wrap.dataset.edgeSpringBound = "1";

    let touchState = null;

    const clearTouchState = () => {
      touchState = null;
    };

    const resolveTrackedTouch = (touchList) => {
      if (!touchState || touchState.id == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === touchState.id) return touch;
      }
      return null;
    };

    wrap.addEventListener("touchstart", (event) => {
      if (!shouldUseAdminChatThreadEdgeSpring()) {
        clearTouchState();
        releaseAdminChatThreadEdgeSpring({ immediate: true });
        return;
      }
      if (!event || event.touches.length !== 1) {
        clearTouchState();
        setAdminChatThreadEdgeSpringTouchState(false);
        return;
      }
      if (event.target && event.target.closest && event.target.closest(".chat-message-order-cards")) {
        clearTouchState();
        setAdminChatThreadEdgeSpringTouchState(false);
        return;
      }
      const touch = event.touches[0];
      clearTouchState();
      setAdminChatThreadEdgeSpringTouchState(false);
      stopMessagesSmoothScroll();
      stopAdminChatThreadEdgeSpringAnimation();
      stopAdminChatThreadEdgeSpringPinWatcher();
      adminChatThreadEdgeSpringVelocity = 0;
      setAdminChatThreadEdgeSpringShift(0);
      touchState = {
        id: touch.identifier,
        startX: Number(touch.clientX || 0),
        startY: Number(touch.clientY || 0),
        startedAtTop: isAdminChatThreadAtTop(wrap),
        startedAtBottom: isAdminChatThreadAtBottom(wrap),
        lastAppliedX: Number(touch.clientX || 0),
        lastAppliedY: Number(touch.clientY || 0),
        edge: "",
        locked: false,
        active: false,
      };
    }, { passive: true });

    wrap.addEventListener("touchmove", (event) => {
      if (event.defaultPrevented) return;
      if (!touchState) return;
      if (!shouldUseAdminChatThreadEdgeSpring()) {
        clearTouchState();
        releaseAdminChatThreadEdgeSpring({ immediate: true });
        return;
      }
      if (!event || event.touches.length !== 1) {
        clearTouchState();
        releaseAdminChatThreadEdgeSpring();
        return;
      }
      if (event.target && event.target.closest && event.target.closest(".chat-message-order-cards")) {
        clearTouchState();
        releaseAdminChatThreadEdgeSpring({ immediate: true });
        return;
      }

      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;

      const touchX = Number(touch.clientX || 0);
      const touchY = Number(touch.clientY || 0);
      const dx = touchX - touchState.startX;
      const dy = touchY - touchState.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const maxTop = getAdminChatThreadMaxScrollTop(wrap);

      let desiredEdge = "";
      if (maxTop <= CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX) {
        if (Math.abs(dy) > 0.1) desiredEdge = dy >= 0 ? "top" : "bottom";
      } else if (dy > 0 && (touchState.startedAtTop === true || isAdminChatThreadAtTop(wrap))) {
        desiredEdge = "top";
      } else if (dy < 0 && (touchState.startedAtBottom === true || isAdminChatThreadAtBottom(wrap))) {
        desiredEdge = "bottom";
      }

      if (!touchState.locked) {
        if (absY < CHAT_THREAD_EDGE_SPRING_TOUCH_LOCK_PX || absY <= absX) return;
        if (!desiredEdge) return;
        touchState.locked = true;
        touchState.edge = desiredEdge;
        touchState.active = true;
        touchState.lastAppliedX = touchX;
        touchState.lastAppliedY = touchY;
        setAdminChatThreadEdgeSpringTouchState(true, desiredEdge);
        startAdminChatThreadEdgeSpringPinWatcher(desiredEdge, wrap);
      }

      if (!touchState.edge) return;
      const holdDx = Math.abs(touchX - Number(touchState.lastAppliedX || touchState.startX));
      const holdDy = Math.abs(touchY - Number(touchState.lastAppliedY || touchState.startY));
      if (
        holdDx < CHAT_THREAD_EDGE_SPRING_TOUCH_HOLD_DEADBAND_PX
        && holdDy < CHAT_THREAD_EDGE_SPRING_TOUCH_HOLD_DEADBAND_PX
      ) {
        event.preventDefault();
        return;
      }
      touchState.lastAppliedX = touchX;
      touchState.lastAppliedY = touchY;
      pinAdminChatThreadToEdge(touchState.edge, wrap);
      const rawDistance = touchState.edge === "bottom"
        ? Math.max(0, -dy)
        : Math.max(0, dy);
      if (rawDistance <= 0.1) {
        event.preventDefault();
        setAdminChatThreadEdgeSpringShift(0);
        return;
      }

      stopAdminChatThreadEdgeSpringAnimation();
      adminChatThreadEdgeSpringVelocity = 0;
      setAdminChatThreadEdgeSpringShift(
        computeAdminChatThreadEdgeSpringShift(rawDistance, touchState.edge),
      );
      event.preventDefault();
    }, { passive: false });

    const finishTouch = (options = {}) => {
      const state = touchState;
      clearTouchState();
      stopAdminChatThreadEdgeSpringPinWatcher();
      setAdminChatThreadEdgeSpringTouchState(false);
      if (!state) return;
      if (options.immediate === true) {
        releaseAdminChatThreadEdgeSpring({ immediate: true });
        return;
      }
      if (state.locked || Math.abs(adminChatThreadEdgeSpringShift) >= 0.1) {
        releaseAdminChatThreadEdgeSpring();
        return;
      }
      releaseAdminChatThreadEdgeSpring({ immediate: true });
    };

    wrap.addEventListener("touchend", () => {
      finishTouch();
    }, { passive: true });
    wrap.addEventListener("touchcancel", () => {
      finishTouch({ immediate: true });
    }, { passive: true });

    wrap.addEventListener("wheel", (event) => {
      if (event.defaultPrevented) return;
      if (!shouldUseAdminChatThreadEdgeSpringWheelNudge()) return;
      if (event.target && event.target.closest && event.target.closest(".chat-message-order-cards")) return;

      const deltaX = Number(event.deltaX || 0);
      const deltaY = Number(event.deltaY || 0);
      if (Math.abs(deltaY) < 0.01 || Math.abs(deltaY) <= Math.abs(deltaX)) return;

      const maxTop = getAdminChatThreadMaxScrollTop(wrap);
      let edge = "";
      if (maxTop <= CHAT_THREAD_EDGE_SPRING_EDGE_EPSILON_PX) {
        edge = deltaY < 0 ? "top" : "bottom";
      } else if (deltaY < 0 && isAdminChatThreadAtTop(wrap)) {
        edge = "top";
      } else if (deltaY > 0 && isAdminChatThreadAtBottom(wrap)) {
        edge = "bottom";
      }
      if (!edge) return;

      event.preventDefault();
      nudgeAdminChatThreadEdgeSpringFromWheel(edge, deltaY);
    }, { passive: false });
  }

  function syncAdminMobileThreadBottomInset() {
    const stack = dom.center.stack;
    if (!stack) return;

    if (!isAdminMobileChatLayout()) {
      stack.style.removeProperty("--chat-mobile-thread-bottom-inset");
      return;
    }

    const overlayHeightFromCssVar = Math.max(
      0,
      Math.round(
        parseFloat(window.getComputedStyle(stack).getPropertyValue("--chat-mobile-footer-overlay-height")) || 0,
      ),
    );
    const bottomOverlayNode = getAdminMobileChatBottomOverlayNode();
    const overlayHeightFromDom = Math.max(0, getAdminMobileBottomOverlayHeight(bottomOverlayNode));
    const overlayHeight = overlayHeightFromDom > 0
      ? overlayHeightFromDom
      : overlayHeightFromCssVar;
    stack.style.setProperty(
      "--chat-mobile-thread-bottom-inset",
      `${overlayHeight}px`,
    );
  }

  function getAdminMobileBottomOverlayHeight(node) {
    if (!(node instanceof HTMLElement)) return 0;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    const styles = window.getComputedStyle(node);
    const marginTop = parseCssLengthPx(styles.marginTop);
    const marginBottom = parseCssLengthPx(styles.marginBottom);
    return Math.max(0, Math.ceil(rect.height + marginTop + marginBottom));
  }

  function syncAdminMobileChatOverlayLayout() {
    const stack = dom.center.stack;
    if (!stack) return;

    if (!isAdminMobileChatLayout()) {
      stack.classList.remove("is-mobile-overlay-layout");
      stack.style.removeProperty("--chat-mobile-header-overlay-height");
      stack.style.removeProperty("--chat-mobile-footer-overlay-height");
      stack.style.removeProperty("--chat-mobile-thread-top-inset");
      stack.style.removeProperty("--chat-mobile-thread-bottom-inset");
      stack.style.removeProperty("--chat-scroll-down-composer-extra");
      syncAdminMobileChatScrollDownPosition();
      syncComposerSendButtonFocusLock();
      return;
    }

    const headerHeight = Math.max(0, Math.ceil(dom.center.headerPanel?.getBoundingClientRect().height || 0));
    const bottomOverlayNode = getAdminMobileChatBottomOverlayNode();
    const bottomOverlayHeight = getAdminMobileBottomOverlayHeight(bottomOverlayNode);
    stack.classList.add("is-mobile-overlay-layout");
    stack.style.setProperty("--chat-mobile-header-overlay-height", `${headerHeight}px`);
    stack.style.setProperty("--chat-mobile-footer-overlay-height", `${bottomOverlayHeight}px`);
    stack.style.setProperty("--chat-mobile-thread-top-inset", `${headerHeight}px`);
    stack.style.setProperty(
      "--chat-scroll-down-composer-extra",
      `${Math.max(0, bottomOverlayHeight - 26)}px`
    );
    syncAdminMobileThreadBottomInset();
    syncAdminMobileChatScrollDownPosition();
    syncComposerSendButtonFocusLock();
  }

  function bindAdminMobileChatOverlayLayout() {
    if (adminChatOverlayLayoutBound) return;
    adminChatOverlayLayoutBound = true;

    const sync = () => {
      syncAdminMobileChatOverlayLayout();
      schedulePinnedBottomLayoutSync();
    };

    const handleShellMetricsChange = (event) => {
      const dragging = event && event.detail && event.detail.dragging === true;
      if (dragging) return;
      sync();
    };

    const overlayNodes = [
      dom.center.headerPanel,
      dom.center.footerPanel,
      dom.center.selectionBar,
      dom.center.composer,
    ].filter(Boolean);

    if (typeof ResizeObserver === "function" && overlayNodes.length) {
      const observer = new ResizeObserver(() => {
        sync();
      });
      if (dom.center.stack) dom.center.stack.__mobileOverlayLayoutObserver = observer;
      overlayNodes.forEach((node) => observer.observe(node));
    }

    document.addEventListener("admin-mobile-shell-metrics-change", handleShellMetricsChange, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    requestAnimationFrame(sync);
  }

  function handleAdminChatPageScrollRepairEvent() {
    scheduleAdminChatPageScrollRepair();
  }

  function setAdminChatKeyboardViewportSyncing(active) {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    document.body.classList.toggle(
      "chat-mobile-keyboard-viewport-syncing",
      active === true && isAdminMobileChatLayout(),
    );
  }

  function clearAdminChatKeyboardMotionSync() {
    if (adminChatKeyboardMotionRaf) {
      cancelAnimationFrame(adminChatKeyboardMotionRaf);
      adminChatKeyboardMotionRaf = 0;
    }
    adminChatKeyboardMotionUntil = 0;
    setAdminChatKeyboardViewportSyncing(false);
  }

  function setAdminChatViewportShift(valuePx) {
    const raw = Number(valuePx || 0);
    const next = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
    if (dom.center.stack) {
      dom.center.stack.style.setProperty("--chat-android-viewport-shift", `${next}px`);
    }
    if (document.body) {
      document.body.style.setProperty("--chat-ios-overlay-shift", `${next}px`);
    }
    return next;
  }

  function isAdminChatKeyboardTrackingActive(options = {}) {
    const prevInset = Math.max(0, Number(
      options.prevInset !== undefined ? options.prevInset : adminChatKeyboardLastInset
    ) || 0);
    const nextInset = Math.max(0, Number(
      options.nextInset !== undefined ? options.nextInset : 0
    ) || 0);
    return hasFocusedAdminChatTextInput()
      || adminChatKeyboardFocusSessionActive === true
      || prevInset > 0
      || nextInset > 0;
  }

  function setAdminChatKeyboardInset(valuePx, options = {}) {
    const prev = Math.max(0, Number(adminChatKeyboardLastInset || 0));
    const raw = Number(valuePx || 0);
    const next = Number.isFinite(raw) && raw > 2 ? Math.round(raw) : 0;
    const forceThreadBottomSync = options.forceThreadBottomSync === true;
    const viewportBottom = Number(options.viewportBottom || 0);
    const viewportHeight = Number(options.viewportHeight || 0);
    const keyboardTrackingActive = isAdminChatKeyboardTrackingActive({
      prevInset: prev,
      nextInset: next,
    });
    const currentMessagesBottomDistance = getMessagesBottomDistanceSnapshot();
    const trackedMessagesBottomDistance = Number(adminChatKeyboardTrackedMessagesBottomDistance);
    const shouldUseTrackedMessagesBottomDistance = shouldTrackAdminChatKeyboardMessagesBottomDistance({
      prevInset: prev,
      nextInset: next,
      forceThreadBottomSync,
      viewportBottom,
      viewportHeight,
      keyboardTrackingActive,
    });
    const openingKeyboardNow = prev <= 0 && next > 0;
    const shouldPreserveOnKeyboardCollapse = prev > 0 && next <= 0;
    const canSyncThreadBottomDistance = (
      !isAdminChatThreadEdgeSpringPositionControlled()
      && (
        !adminChatThreadTouchGestureActive
        || openingKeyboardNow
        || shouldPreserveOnKeyboardCollapse
      )
    );
    const threadInputAnchorSnapshot = canSyncThreadBottomDistance && keyboardTrackingActive
      ? getAdminChatThreadInputAnchorSnapshot()
      : null;
    if (openingKeyboardNow) {
      adminChatKeyboardOpenBottomDistance = getMessagesBottomDistanceSnapshot();
      adminChatKeyboardOpenInputAnchorSnapshot = threadInputAnchorSnapshot || getAdminChatThreadInputAnchorSnapshot();
      adminChatKeyboardCollapseInputAnchorSnapshot = null;
    }
    if (!adminChatKeyboardOpenInputAnchorSnapshot && (prev > 0 || next > 0) && keyboardTrackingActive) {
      adminChatKeyboardOpenInputAnchorSnapshot = threadInputAnchorSnapshot || getAdminChatThreadInputAnchorSnapshot();
    }
    if (shouldPreserveOnKeyboardCollapse && threadInputAnchorSnapshot) {
      adminChatKeyboardCollapseInputAnchorSnapshot = threadInputAnchorSnapshot;
    }
    const stableInputAnchorSnapshot = shouldPreserveOnKeyboardCollapse
      ? (
          adminChatKeyboardCollapseInputAnchorSnapshot
          || adminChatKeyboardOpenInputAnchorSnapshot
          || threadInputAnchorSnapshot
        )
      : (
          adminChatKeyboardOpenInputAnchorSnapshot
          || threadInputAnchorSnapshot
        );
    if (openingKeyboardNow || shouldPreserveOnKeyboardCollapse) {
      adminChatKeyboardInsetApplyToken += 1;
    }
    const applyToken = adminChatKeyboardInsetApplyToken;
    const isApplyTokenValid = () => applyToken === adminChatKeyboardInsetApplyToken;
    const applyThreadViewportSnapshot = (messagesBottomDistance = null, persistOptions = {}) => {
      let applied = false;
      if (stableInputAnchorSnapshot) {
        applied = applyAdminChatThreadInputAnchorSnapshot(stableInputAnchorSnapshot);
      }
      if (!applied && messagesBottomDistance != null) {
        applied = applyMessagesBottomDistanceSnapshot(messagesBottomDistance);
      }
      if (applied || messagesBottomDistance != null) {
        saveThreadScrollPosition(state.activeClientId, persistOptions);
      }
      return applied;
    };
    const collapseBottomDistanceSnapshot = shouldPreserveOnKeyboardCollapse
      ? (
          Number.isFinite(trackedMessagesBottomDistance)
            ? trackedMessagesBottomDistance
            : (
                Number.isFinite(Number(adminChatKeyboardOpenBottomDistance))
                  ? Number(adminChatKeyboardOpenBottomDistance)
                  : getMessagesBottomDistanceSnapshot()
              )
        )
      : null;
    const targetMessagesBottomDistance = shouldUseTrackedMessagesBottomDistance && Number.isFinite(trackedMessagesBottomDistance)
      ? trackedMessagesBottomDistance
      : (shouldUseTrackedMessagesBottomDistance ? currentMessagesBottomDistance : null);
    const keyboardActive = options.active === true || next > 0;
    if (dom.center.stack) {
      dom.center.stack.style.setProperty("--chat-mobile-keyboard-inset", `${next}px`);
      dom.center.stack.classList.toggle("is-mobile-keyboard-open", keyboardActive);
    }
    if (document.body) {
      document.body.classList.toggle("chat-mobile-keyboard-open", keyboardActive);
    }
    if (keyboardActive) {
      adminChatSuppressPinnedBottomUntil = 0;
      adminChatKeyboardCollapseBottomDistance = null;
      adminChatKeyboardCollapseInputAnchorSnapshot = null;
    }
    if (!keyboardActive && adminChatRenderAutoScrollTimer) {
      window.clearTimeout(adminChatRenderAutoScrollTimer);
      adminChatRenderAutoScrollTimer = 0;
    }
    if (!keyboardActive && adminChatDeferredAutoScrollTimer) {
      window.clearTimeout(adminChatDeferredAutoScrollTimer);
      adminChatDeferredAutoScrollTimer = 0;
    }
    if (canSyncThreadBottomDistance && targetMessagesBottomDistance != null && (prev !== next || forceThreadBottomSync)) {
      applyThreadViewportSnapshot(targetMessagesBottomDistance);
      requestAnimationFrame(() => {
        if (!isApplyTokenValid()) return;
        applyThreadViewportSnapshot(targetMessagesBottomDistance);
      });
      if (openingKeyboardNow) {
        [120, 280, 520].forEach((delay) => {
          window.setTimeout(() => {
            if (!isApplyTokenValid()) return;
            const keyboardStillOpen = !!(
              document.body
              && document.body.classList.contains("chat-mobile-keyboard-open")
            );
            if (!keyboardStillOpen) return;
            applyThreadViewportSnapshot(targetMessagesBottomDistance);
          }, delay);
        });
      }
    }
    if (canSyncThreadBottomDistance && collapseBottomDistanceSnapshot != null) {
      adminChatKeyboardCollapseBottomDistance = Math.max(0, collapseBottomDistanceSnapshot);
      adminChatSuppressPinnedBottomUntil = Date.now() + 760;
      requestAnimationFrame(() => {
        if (!isApplyTokenValid()) return;
        applyThreadViewportSnapshot(adminChatKeyboardCollapseBottomDistance);
        requestAnimationFrame(() => {
          if (!isApplyTokenValid()) return;
          applyThreadViewportSnapshot(adminChatKeyboardCollapseBottomDistance);
        });
      });
      window.setTimeout(() => {
        if (!isApplyTokenValid()) return;
        if (adminChatKeyboardCollapseBottomDistance == null) return;
        applyThreadViewportSnapshot(adminChatKeyboardCollapseBottomDistance);
      }, 120);
      window.setTimeout(() => {
        if (!isApplyTokenValid()) return;
        if (adminChatKeyboardCollapseBottomDistance == null) return;
        applyThreadViewportSnapshot(adminChatKeyboardCollapseBottomDistance);
      }, 280);
      window.setTimeout(() => {
        if (!isApplyTokenValid()) return;
        if (adminChatKeyboardCollapseBottomDistance == null) return;
        applyThreadViewportSnapshot(adminChatKeyboardCollapseBottomDistance, { forcePersist: true });
      }, 520);
      window.setTimeout(() => {
        if (!isApplyTokenValid()) return;
        if (adminChatKeyboardCollapseBottomDistance == null) return;
        applyThreadViewportSnapshot(adminChatKeyboardCollapseBottomDistance, { forcePersist: true });
        adminChatKeyboardCollapseBottomDistance = null;
        adminChatKeyboardCollapseInputAnchorSnapshot = null;
        adminChatKeyboardOpenInputAnchorSnapshot = null;
        adminChatKeyboardOpenBottomDistance = null;
      }, 760);
    }
    if (canSyncThreadBottomDistance && keyboardTrackingActive && targetMessagesBottomDistance != null && shouldUseTrackedMessagesBottomDistance) {
      setAdminChatKeyboardTrackedMessagesBottomDistance(targetMessagesBottomDistance);
    } else if (canSyncThreadBottomDistance && keyboardTrackingActive && !hasFocusedAdminChatTextInput()) {
      setAdminChatKeyboardTrackedMessagesBottomDistance(currentMessagesBottomDistance);
    }
    return next;
  }

  function setAdminChatIosViewportLock(active, viewportHeightPx) {
    if (!document.body) return;
    document.body.classList.remove("is-ios-chat-viewport-locked");
    document.body.style.removeProperty("--chat-ios-page-height");
    if (active !== true) {
      document.body.style.setProperty("--chat-ios-overlay-shift", "0px");
    }
  }

  function resetAdminChatKeyboardViewportSync(options = {}) {
    adminChatKeyboardInsetApplyToken += 1;
    if (adminChatKeyboardSyncRaf) {
      cancelAnimationFrame(adminChatKeyboardSyncRaf);
      adminChatKeyboardSyncRaf = 0;
    }
    if (adminChatPageScrollRepairRaf) {
      cancelAnimationFrame(adminChatPageScrollRepairRaf);
      adminChatPageScrollRepairRaf = 0;
    }
    clearAdminChatKeyboardMotionSync();
    disarmAdminChatPageScrollRepair();
    setAdminChatKeyboardInset(0, { active: false });
    setAdminChatViewportShift(0);
    setAdminChatIosViewportLock(false, 0);
    adminChatKeyboardLastViewportBottom = 0;
    adminChatKeyboardViewportBaseBottom = 0;
    adminChatKeyboardViewportBaseHeight = 0;
    adminChatKeyboardLastInset = 0;
    adminChatKeyboardTrackedMessagesBottomDistance = null;
    adminChatKeyboardCollapseInputAnchorSnapshot = null;
    adminChatKeyboardOpenInputAnchorSnapshot = null;
    adminChatKeyboardFocusSessionActive = false;
    if (options.unlockScroll !== false) {
      unlockAdminChatPageScroll();
    }
  }

  function computeAdminChatKeyboardInset(viewportBottomValue, viewportHeightValue = null) {
    if (!isAdminMobileChatLayout()) return 0;
    if (!shouldUseNativeMobileEmojiKeyboard()) return 0;
    const viewportBottom = Number.isFinite(Number(viewportBottomValue))
      ? Number(viewportBottomValue)
      : getAdminChatViewportBottom();
    const viewportHeight = Number.isFinite(Number(viewportHeightValue))
      ? Number(viewportHeightValue)
      : getAdminChatViewportHeight();
    if (!Number.isFinite(viewportBottom) || viewportBottom <= 0) return 0;
    const focused = hasFocusedAdminChatTextInput();
    const keyboardTrackingActive = isAdminChatKeyboardTrackingActive();
    if (!keyboardTrackingActive) return 0;
    if (!focused && !isAdminChatViewportCompressed(viewportBottom, viewportHeight)) return 0;

    const keyboardAnchor = (
      (dom.center.stack && typeof dom.center.stack.closest === "function"
        ? dom.center.stack.closest(".page-col-center")
        : null)
      || document.querySelector(".main-container.app-grid")
      || document.querySelector(".main-container")
      || dom.center.stack
      || dom.center.footerPanel
      || dom.center.composer
    );
    const anchorRect = keyboardAnchor ? keyboardAnchor.getBoundingClientRect() : null;
    const anchorBottom = Number(anchorRect && anchorRect.bottom || 0);
    const overlapInset = Number.isFinite(anchorBottom)
      ? Math.max(0, anchorBottom - viewportBottom)
      : 0;
    const needsFallbackInset = !Number.isFinite(anchorBottom) || anchorBottom <= 0;
    const fallbackInset = !isIOSMobileBrowser() && needsFallbackInset && adminChatKeyboardViewportBaseBottom > 0
      ? Math.max(0, adminChatKeyboardViewportBaseBottom - viewportBottom)
      : 0;
    return Math.max(overlapInset, fallbackInset);
  }

  function syncAdminChatKeyboardViewportNow() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    if (!isAdminMobileChatLayout()) {
      resetAdminChatKeyboardViewportSync();
      return;
    }

    const viewportHeight = getAdminChatViewportHeight();
    const viewportOffsetTop = getAdminChatViewportOffsetTop();
    const viewportBottom = getAdminChatViewportBottom();
    const prevViewportBottom = adminChatKeyboardLastViewportBottom || viewportBottom;
    const prevInset = adminChatKeyboardLastInset;
    adminChatKeyboardLastViewportBottom = viewportBottom;
    const focused = hasFocusedAdminChatTextInput();
    const keyboardTrackingActive = isAdminChatKeyboardTrackingActive({ prevInset });

    if (
      !focused
      || !adminChatKeyboardViewportBaseBottom
      || !adminChatKeyboardViewportBaseHeight
      || viewportBottom >= (Number(adminChatKeyboardViewportBaseBottom || 0) - 6)
      || viewportHeight >= (Number(adminChatKeyboardViewportBaseHeight || 0) - 6)
    ) {
      captureAdminChatKeyboardViewportBaseBottom();
    }

    const viewportCompressed = isAdminChatViewportCompressed(viewportBottom, viewportHeight);
    const viewportChanged = Math.abs(viewportBottom - prevViewportBottom) >= 1;
    const forceThreadBottomSync = keyboardTrackingActive && viewportChanged && (
      focused
      || prevInset > 0
      || isAdminChatViewportCompressed(prevViewportBottom, viewportHeight)
      || viewportCompressed
    );
    setAdminChatViewportShift(isIOSMobileBrowser() && keyboardTrackingActive ? viewportOffsetTop : 0);
    setAdminChatIosViewportLock(keyboardTrackingActive, viewportHeight);
    const computedInset = computeAdminChatKeyboardInset(viewportBottom, viewportHeight);
    const detectedKeyboardVisible = computedInset > 0 || (keyboardTrackingActive && viewportCompressed);
    if (isIOSMobileBrowser()) {
      if (focused && (detectedKeyboardVisible || adminChatKeyboardFocusSessionActive)) {
        adminChatKeyboardFocusSessionActive = true;
      } else if (!focused) {
        adminChatKeyboardFocusSessionActive = false;
      }
    } else {
      adminChatKeyboardFocusSessionActive = false;
    }
    const keyboardVisible = keyboardTrackingActive && detectedKeyboardVisible;
    if (!keyboardVisible && !focused) {
      unlockAdminChatPageScroll();
    }

    const nextInset = setAdminChatKeyboardInset(
      computedInset,
      {
        active: keyboardVisible,
        forceThreadBottomSync,
        viewportBottom,
        viewportHeight,
      },
    );
    syncAdminMobileChatOverlayLayout();
    adminChatKeyboardLastInset = nextInset;
    if (adminChatBodyScrollLockState && !isIOSMobileBrowser()) {
      restoreLockedAdminChatPageScroll();
    }
    if (nextInset <= 0 && !viewportCompressed && !focused) {
      unlockAdminChatPageScroll();
      captureAdminChatKeyboardViewportBaseBottom({ force: true });
    }

    if ((keyboardTrackingActive && Math.abs(viewportBottom - prevViewportBottom) >= 1) || nextInset > 0 || focused) {
      schedulePinnedBottomLayoutSync();
      updateMessagesScrollDownButton();
    }
  }

  function scheduleAdminChatKeyboardViewportSync() {
    if (adminChatKeyboardSyncRaf) return;
    adminChatKeyboardSyncRaf = requestAnimationFrame(() => {
      adminChatKeyboardSyncRaf = 0;
      syncAdminChatKeyboardViewportNow();
    });
  }

  function scheduleAdminChatKeyboardViewportMotionSync(durationMs) {
    if (!isAdminMobileChatLayout()) return;
    const now = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
    const duration = Math.max(180, Number(durationMs || 0) || 0);
    adminChatKeyboardMotionUntil = Math.max(adminChatKeyboardMotionUntil, now + duration);
    setAdminChatKeyboardViewportSyncing(true);
    if (adminChatKeyboardMotionRaf) return;

    const step = () => {
      adminChatKeyboardMotionRaf = 0;
      if (!isAdminMobileChatLayout()) {
        clearAdminChatKeyboardMotionSync();
        return;
      }

      syncAdminChatKeyboardViewportNow();

      const currentBottom = getAdminChatViewportBottom();
      const currentNow = typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

      if (
        hasFocusedAdminChatTextInput()
        || isAdminChatViewportCompressed(currentBottom, getAdminChatViewportHeight())
        || currentNow < adminChatKeyboardMotionUntil
      ) {
        setAdminChatKeyboardViewportSyncing(true);
        adminChatKeyboardMotionRaf = requestAnimationFrame(step);
        return;
      }

      adminChatKeyboardMotionUntil = 0;
      setAdminChatKeyboardViewportSyncing(false);
    };

    adminChatKeyboardMotionRaf = requestAnimationFrame(step);
  }

  function scheduleAdminChatKeyboardViewportSyncBurst() {
    scheduleAdminChatKeyboardViewportSync();
    scheduleAdminChatPageScrollRepair();
    scheduleAdminChatKeyboardViewportMotionSync(520);
    [40, 120, 260, 420].forEach((delay) => {
      window.setTimeout(() => {
        scheduleAdminChatKeyboardViewportSync();
        scheduleAdminChatPageScrollRepair();
      }, delay);
    });
  }

  function handleAdminChatKeyboardViewportSyncEvent() {
    scheduleAdminChatKeyboardViewportSync();
    scheduleAdminChatPageScrollRepair();
    scheduleAdminChatKeyboardViewportMotionSync(260);
  }

  function bindAdminChatKeyboardViewportSync() {
    if (adminChatKeyboardSyncBound) return;
    adminChatKeyboardSyncBound = true;
    const viewport = window.visualViewport;
    if (viewport) {
      viewport.addEventListener("resize", handleAdminChatKeyboardViewportSyncEvent);
      viewport.addEventListener("scroll", handleAdminChatKeyboardViewportSyncEvent);
    }
    window.addEventListener("resize", handleAdminChatKeyboardViewportSyncEvent, { passive: true });
    window.addEventListener("orientationchange", handleAdminChatKeyboardViewportSyncEvent);
    window.addEventListener("scroll", handleAdminChatPageScrollRepairEvent, { passive: true });
  }

  function handleAdminChatTextInputFocus() {
    if (!isAdminMobileChatLayout()) return;
    adminChatKeyboardFocusSessionActive = isIOSMobileBrowser();
    armAdminChatPageScrollRepair(900);
    lockAdminChatPageScroll();
    restoreLockedAdminChatPageScroll();
    captureAdminChatKeyboardViewportBaseBottom({ force: true });
    rememberAdminChatKeyboardTrackedMessagesBottomDistance({ force: true });
    scheduleAdminChatKeyboardViewportSyncBurst();
    scheduleAdminChatPageScrollRepair();
  }

  function handleAdminChatTextInputBlur() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    disarmAdminChatPageScrollRepair();
    scheduleAdminChatKeyboardViewportSyncBurst();
    window.setTimeout(() => {
      if (!hasFocusedAdminChatTextInput()) {
        adminChatKeyboardFocusSessionActive = false;
        scheduleAdminChatKeyboardViewportSync();
      }
    }, 40);
  }

  function focusChatTextField(field, options = {}) {
    const node = field || null;
    if (!node || typeof node.focus !== "function") return false;
    if ("disabled" in node && node.disabled) return false;
    const preventScroll = options.preventScroll !== false;
    restoreLockedAdminChatPageScroll();
    try {
      if (preventScroll) {
        node.focus({ preventScroll: true });
      } else {
        node.focus();
      }
    } catch {
      try {
        node.focus();
      } catch {
        return false;
      }
    }
    restoreLockedAdminChatPageScroll();
    if (options.moveCaretToEnd !== false && typeof node.setSelectionRange === "function") {
      const pos = String(node.value || "").length;
      try {
        node.setSelectionRange(pos, pos);
      } catch {}
    }
    return document.activeElement === node;
  }

  function focusComposerInput(options = {}) {
    if (!dom.center.input) return false;
    const focused = focusChatTextField(dom.center.input, options);
    if (!isIOSMobileBrowser() || !shouldUseNativeMobileEmojiKeyboard()) return focused;
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(cb, 16);
    schedule(() => {
      focusChatTextField(dom.center.input, options);
    });
    return focused;
  }

  function primeAdminMobileTextFieldFocus(eventOrNode) {
    if (!shouldPreferNativeAdminMobileChatTouchHandling()) return;
    const node = eventOrNode && eventOrNode.currentTarget
      ? eventOrNode.currentTarget
      : eventOrNode;
    if (!node || typeof node.focus !== "function") return;
    if ("disabled" in node && node.disabled) return;
    if (document.activeElement === node) return;
    if (eventOrNode && eventOrNode.type === "pointerdown") {
      const pointerType = String(eventOrNode.pointerType || "").toLowerCase();
      if (pointerType && pointerType !== "touch") return;
    }
    handleAdminChatTextInputFocus();
    focusChatTextField(node, { moveCaretToEnd: false });
    syncComposerSendButtonFocusLock();
  }

  function bindAdminMobileTextFieldTapFocus(node, datasetKey = "mobileTapFocusBound") {
    if (!node || typeof node.addEventListener !== "function") return;
    const guardKey = String(datasetKey || "mobileTapFocusBound");
    if (node.dataset && node.dataset[guardKey] === "1") return;
    if (node.dataset) node.dataset[guardKey] = "1";

    let activeTouchId = null;
    let startX = 0;
    let startY = 0;
    let dragAxis = "";
    let moved = false;

    const reset = () => {
      activeTouchId = null;
      startX = 0;
      startY = 0;
      dragAxis = "";
      moved = false;
    };

    const resolveTrackedTouch = (touchList) => {
      if (activeTouchId == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === activeTouchId) return touch;
      }
      return null;
    };

    const canScrollNode = (deltaY) => {
      const maxTop = Math.max(0, Number(node.scrollHeight || 0) - Number(node.clientHeight || 0));
      if (maxTop <= 1) return false;
      const currentTop = Math.max(0, Number(node.scrollTop || 0));
      if (deltaY < 0 && currentTop < maxTop - 1) return true;
      if (deltaY > 0 && currentTop > 1) return true;
      return false;
    };

    node.addEventListener("touchstart", (event) => {
      reset();
      if (!shouldPreferNativeAdminMobileChatTouchHandling()) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      startX = Number(touch.clientX || 0);
      startY = Number(touch.clientY || 0);
    }, { passive: true, capture: true });

    node.addEventListener("touchmove", (event) => {
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;

      const deltaX = Number(touch.clientX || 0) - startX;
      const deltaY = Number(touch.clientY || 0) - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!dragAxis) {
        if (absX < 4 && absY < 4) return;
        dragAxis = absX >= absY ? "x" : "y";
      }
      if (absX >= 6 || absY >= 6) {
        moved = true;
      }
      if (dragAxis !== "y") return;
      if (canScrollNode(deltaY)) return;

      event.preventDefault();
      event.stopPropagation();
      if (hasFocusedAdminChatTextInput()) {
        restoreLockedAdminChatPageScroll();
        scheduleAdminChatPageScrollRepair();
      }
    }, { passive: false, capture: true });

    node.addEventListener("touchend", () => {
      const shouldFocus = activeTouchId != null
        && !moved
        && shouldPreferNativeAdminMobileChatTouchHandling();
      reset();
      if (!shouldFocus) return;
      primeAdminMobileTextFieldFocus(node);
    }, { passive: true, capture: true });

    node.addEventListener("touchcancel", reset, { passive: true, capture: true });
  }

  function repairAdminIosTextFocusOnClick(event) {
    const node = event && event.currentTarget ? event.currentTarget : null;
    if (!node || typeof node.focus !== "function") return;
    if (!isAdminChatIosKeyboardHiddenWithFocusedInput(node)) return;
    captureAdminChatKeyboardViewportBaseBottom({ force: true });
    rememberAdminChatKeyboardTrackedMessagesBottomDistance({ force: true });
    armAdminChatPageScrollRepair(900);
    lockAdminChatPageScroll();
    restoreLockedAdminChatPageScroll();
    try {
      node.blur();
    } catch {}
    focusChatTextField(node, { moveCaretToEnd: true });
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(cb, 16);
    schedule(() => {
      focusChatTextField(node, { moveCaretToEnd: true });
    });
    scheduleAdminChatKeyboardViewportSyncBurst();
    scheduleAdminChatPageScrollRepair();
    syncComposerSendButtonFocusLock();
  }

  function shouldRetainComposerFocusOnMobileSend() {
    return isAdminMobileChatLayout() && shouldUseNativeMobileEmojiKeyboard();
  }

  function syncComposerSendButtonFocusLock() {
    const sendBtn = dom.center.sendBtn;
    const input = dom.center.input;
    if (!sendBtn) return;
    if (
      shouldRetainComposerFocusOnMobileSend()
      && input
      && !input.disabled
      && document.activeElement === input
    ) {
      sendBtn.setAttribute("tabindex", "-1");
      return;
    }
    sendBtn.removeAttribute("tabindex");
  }

  function shouldGuardIOSNativeTextFocus(node) {
    if (!node || typeof node.focus !== "function") return false;
    if (!isIOSMobileBrowser() || !shouldUseNativeMobileEmojiKeyboard()) return false;
    if (document.activeElement === node) return false;
    if ("disabled" in node && node.disabled) return false;
    return true;
  }

  function isAdminChatIosKeyboardHiddenWithFocusedInput(node) {
    if (!node || typeof node.focus !== "function") return false;
    if (!isIOSMobileBrowser() || !shouldUseNativeMobileEmojiKeyboard()) return false;
    if (document.activeElement !== node) return false;
    if (adminChatKeyboardFocusSessionActive !== true) return false;
    if (Math.max(0, Number(adminChatKeyboardLastInset || 0)) > 0) return false;
    return !isAdminChatViewportCompressed(
      getAdminChatViewportBottom(),
      getAdminChatViewportHeight(),
    );
  }

  function guardIOSNativeTextFocus(event) {
    const node = event && event.currentTarget ? event.currentTarget : null;
    if (isAdminChatIosKeyboardHiddenWithFocusedInput(node)) {
      event.preventDefault();
      captureAdminChatKeyboardViewportBaseBottom({ force: true });
      rememberAdminChatKeyboardTrackedMessagesBottomDistance({ force: true });
      armAdminChatPageScrollRepair(900);
      lockAdminChatPageScroll();
      restoreLockedAdminChatPageScroll();
      try {
        node.blur();
      } catch {}
      focusChatTextField(node, { moveCaretToEnd: true });
      const schedule = typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (cb) => window.setTimeout(cb, 16);
      schedule(() => {
        focusChatTextField(node, { moveCaretToEnd: true });
      });
      scheduleAdminChatKeyboardViewportSyncBurst();
      scheduleAdminChatPageScrollRepair();
      return;
    }
    if (!shouldGuardIOSNativeTextFocus(node)) return;
    event.preventDefault();
    captureAdminChatKeyboardViewportBaseBottom({ force: true });
    rememberAdminChatKeyboardTrackedMessagesBottomDistance({ force: true });
    armAdminChatPageScrollRepair(900);
    lockAdminChatPageScroll();
    restoreLockedAdminChatPageScroll();
    focusChatTextField(node, { moveCaretToEnd: true });
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => window.setTimeout(cb, 16);
    schedule(() => {
      focusChatTextField(node, { moveCaretToEnd: true });
    });
    scheduleAdminChatKeyboardViewportSyncBurst();
    scheduleAdminChatPageScrollRepair();
  }

  function isChatMobileViewport() {
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 768px)").matches
      : window.innerWidth <= 768;
  }

  function readPersistedMobileChatView() {
    if (!document.body || !document.body.classList.contains("page-chat")) return "";
    try {
      const raw = String(sessionStorage.getItem(CHAT_MOBILE_VIEW_STORAGE_KEY) || "").trim().toLowerCase();
      if (raw === "clients" || raw === "right" || raw === "center") return raw;
    } catch {}
    return "";
  }

  function writePersistedMobileChatView(view) {
    if (!document.body || !document.body.classList.contains("page-chat")) return String(view || "");
    const nextView = String(view || "").trim().toLowerCase();
    const safeView = nextView === "clients" || nextView === "right" ? nextView : "center";
    try {
      sessionStorage.setItem(CHAT_MOBILE_VIEW_STORAGE_KEY, safeView);
    } catch {}
    return safeView;
  }

  function syncMobileClientCardFooter(view) {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    if (!isChatMobileViewport()) return;
    const footer = document.getElementById("clientBenefitsFooter");
    if (!footer) return;
    const nextView = String(view || "").trim().toLowerCase();
    const hasActiveClient = Number(state.activeClientId || 0) > 0;
    const isOrderMode = document.body.classList.contains("chat-right-order-mode");
    const shouldShow = nextView === "right" && !isOrderMode && hasActiveClient;
    footer.classList.toggle("hidden", !shouldShow);
  }

  function syncMobileChatView(view, options = {}) {
    if (!document.body || !document.body.classList.contains("page-chat")) return "center";
    if (!isChatMobileViewport()) {
      document.body.classList.remove("chat-mobile-left-open", "chat-mobile-right-open");
      return "center";
    }
    const requestedView = String(view || "").trim().toLowerCase();
    let nextView = requestedView === "clients" || requestedView === "right" ? requestedView : "center";
    if (nextView === "center" && Number(state.activeClientId || 0) <= 0) {
      nextView = "clients";
    }
    if (nextView === "right" && Number(state.activeClientId || 0) <= 0) {
      nextView = "clients";
    }
    document.body.classList.toggle("chat-mobile-left-open", nextView === "clients");
    document.body.classList.toggle("chat-mobile-right-open", nextView === "right");
    document.body.classList.remove("sheet-open");
    if (options.persistState !== false) {
      writePersistedMobileChatView(nextView);
    }
    if (nextView === "clients") {
      restoreClientsListScrollPosition({ defer: true });
    }
    syncMobileClientCardFooter(nextView);
    return nextView;
  }

  function syncMobileChatViewFromState(options = {}) {
    if (!document.body || !document.body.classList.contains("page-chat")) return "center";
    if (!isChatMobileViewport()) {
      document.body.classList.remove("chat-mobile-left-open", "chat-mobile-right-open");
      return "center";
    }
    const persistedView = readPersistedMobileChatView();
    const hasActiveClient = Number(state.activeClientId || 0) > 0;
    const fallbackView = hasActiveClient ? "center" : "clients";
    const preferredView = options.view ? String(options.view) : persistedView || fallbackView;
    return syncMobileChatView(preferredView, options);
  }

  function openClientsPanel(options = {}) {
    return syncMobileChatView("clients", options);
  }

  function closeClientsPanel(options = {}) {
    const fallbackView = Number(state.activeClientId || 0) > 0 ? "center" : "clients";
    return syncMobileChatView(fallbackView, options);
  }

  function toggleClientsPanel(options = {}) {
    if (!document.body || !document.body.classList.contains("page-chat")) return "center";
    const isOpen = document.body.classList.contains("chat-mobile-left-open");
    return isOpen ? closeClientsPanel(options) : openClientsPanel(options);
  }

  async function openClientDetailsPanel(options = {}) {
    const activeClientId = Number(state.activeClientId || 0);
    if (activeClientId <= 0) return "clients";
    showChatRightPane("client");
    const selectedFromList = state.clients.find((client) => Number(client?.id || 0) === activeClientId) || null;
    upsertChatRightTab("client", activeClientId, selectedFromList?.name || "");
    const clientsRightApi = getClientsRightApi();
    if (clientsRightApi && typeof clientsRightApi.setChatRightForceEmpty === "function") {
      clientsRightApi.setChatRightForceEmpty(false);
    }
    if (clientsRightApi) {
      const isGuestClient = isGuestChatClient(selectedFromList);
      if (
        isGuestClient
        && typeof clientsRightApi.selectGuestChatClient === "function"
      ) {
        await clientsRightApi.selectGuestChatClient(
          activeClientId,
          selectedFromList?.name || "",
          { skipMobileSheet: true }
        ).catch(console.error);
      } else if (typeof clientsRightApi.selectClientById === "function") {
        await clientsRightApi.selectClientById(
          activeClientId,
          selectedFromList?.name || "",
          {
            chatGuest: isGuestClient,
            skipMobileSheet: true,
          }
        ).catch(console.error);
      }

      if (
        typeof clientsRightApi.openMobileSheet === "function"
        && !(document.body && document.body.classList.contains("page-chat"))
      ) {
        clientsRightApi.openMobileSheet(options);
        return "right";
      }
    }
    return syncMobileChatView("right", options);
  }

  function closeClientDetailsPanel(options = {}) {
    const clientsRightApi = getClientsRightApi();
    if (clientsRightApi && typeof clientsRightApi.closeMobileSheet === "function") {
      clientsRightApi.closeMobileSheet(options);
      return "center";
    }
    return syncMobileChatView(Number(state.activeClientId || 0) > 0 ? "center" : "clients", options);
  }

  function triggerReactionFeedback() {
    try {
      const tgHaptics = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;
      if (tgHaptics && typeof tgHaptics.impactOccurred === "function") {
        tgHaptics.impactOccurred("light");
        return;
      }
    } catch (_) {}
    if (navigator.vibrate && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  }

  function isAndroidYandexBrowser() {
    const ua = String((navigator && navigator.userAgent) || "");
    if (!ua) return false;
    return /Android/i.test(ua) && /YaBrowser/i.test(ua);
  }

  function isAndroidMobileBrowser() {
    const ua = String((navigator && navigator.userAgent) || "");
    if (!ua) return false;
    return /Android/i.test(ua);
  }

  function isTouchGeneratedClick(event) {
    if (!event) return false;
    if (typeof event.pointerType === "string" && event.pointerType.toLowerCase() === "touch") return true;
    const sourceCapabilities = event.sourceCapabilities;
    if (sourceCapabilities && sourceCapabilities.firesTouchEvents) return true;
    return false;
  }
  let emojiAtlasPreloadStarted = false;
  let emojiAtlasRuntimeUrl = "";
  let unreadEventRaf = 0;
  let messageAlertAudioCtx = null;
  let messageAlertAudioUnlocked = false;
  let messageAlertLastAt = 0;
  let messageAlertSummariesPrimed = false;
  let suppressMessageAlertUntil = 0;
  const unansweredAlertTimerByClient = Object.create(null);
  const unansweredAlertSeqByClient = Object.create(null);
  const unansweredAlertLastNotifiedIncomingByClient = Object.create(null);
  let suppressTouchClickUntil = 0;
  let lastMessageHeartTap = null;
  let suppressFloatingMenuDocumentClickUntil = 0;
  let suppressFloatingMenuAutoHideUntil = 0;
  let chatStartupSplashHideTimer = 0;
  const CHAT_TOUCH_MENU_INTERACTION_GUARD_MS = 380;
  let reactionBarAnchorRect = null;
  let contextMenuAnchorPoint = null;
  let mobileContextSceneUi = null;
  let mobileContextSceneState = null;
  let activeThreadSsePullTimer = 0;
  let activeThreadSsePullInFlight = false;
  let activeThreadSsePullPending = false;
  let headerLoadingSafetyTimer = 0;
  let webPushPublicKeyCache = "";
  let webPushPublicKeyFetched = false;
  let webPushSyncTimer = 0;
  let webPushSyncInFlight = false;
  let webPushSyncedFingerprint = "";
  let webPushSubscriptionVapidKey = "";
  let webPushSyncRequestedWithPermission = false;
  let webPushSyncForceRequested = false;
  let webPushDisableInFlight = false;
  let hardContextMenuBlockBound = false;
  const activeApiAbortControllers = new Set();
  const adminPushVapidStorageKey = "dashboard_chat_push_vapid_t" + String(getTenantId());

  try {
    webPushSubscriptionVapidKey = String(localStorage.getItem(adminPushVapidStorageKey) || "");
  } catch {
    webPushSubscriptionVapidKey = "";
  }

  function createDefaultClientsPager() {
    return {
      pageSize: CHAT_CLIENTS_PAGE_SIZE,
      adminOffset: 0,
      adminTotal: 0,
      remoteOffset: 0,
      remoteTotal: 0,
      hasMore: true,
      loading: false,
      initialized: false,
    };
  }

  function resetClientsPager() {
    state.clientsPager = createDefaultClientsPager();
  }

  function ensureClientsPager() {
    if (!state.clientsPager || typeof state.clientsPager !== "object") {
      resetClientsPager();
    }
    return state.clientsPager;
  }

  function isAbortError(err) {
    if (!err) return false;
    const name = String(err.name || "").toLowerCase();
    if (name === "aborterror") return true;
    const msg = String(err.message || "").toLowerCase();
    return msg.includes("aborted");
  }

  function setChatBootstrapLoading(active) {
    const nextActive = active === true;
    state.isBootstrapLoading = nextActive;
    if (dom.center.startupSplash) {
      if (chatStartupSplashHideTimer) {
        window.clearTimeout(chatStartupSplashHideTimer);
        chatStartupSplashHideTimer = 0;
      }
      if (nextActive) {
        if (document.body) document.body.classList.add("chat-startup-splash-active");
        dom.center.startupSplash.classList.remove("hidden", "is-done");
      } else {
        dom.center.startupSplash.classList.add("is-done");
        chatStartupSplashHideTimer = window.setTimeout(() => {
          chatStartupSplashHideTimer = 0;
          if (!dom.center.startupSplash) return;
          dom.center.startupSplash.classList.add("hidden");
          if (document.body) document.body.classList.remove("chat-startup-splash-active");
        }, 320);
      }
    }
    if (dom.center.bootstrapLoader) {
      dom.center.bootstrapLoader.classList.toggle("hidden", !nextActive);
    }
    if (dom.center.messagesWrap) {
      dom.center.messagesWrap.classList.toggle("is-bootstrap-loading", nextActive);
    }
  }

  function setHeaderLoading(active) {
    ensureDesktopChatHeaderMarkup();
    state.activeClientDataLoading = active === true;
    const hasActiveClient = Number(state.activeClientId || 0) > 0;
    const show = state.activeClientDataLoading && hasActiveClient;
    if (dom.center.headerOrder && dom.center.headerLoading && dom.center.headerLoading.parentElement !== dom.center.headerOrder) {
      dom.center.headerOrder.appendChild(dom.center.headerLoading);
    }
    if (dom.center.headerOrder) {
      dom.center.headerOrder.classList.toggle("is-chat-header-loading", show);
    }
    if (dom.center.headerLoading) {
      dom.center.headerLoading.classList.toggle("hidden", !show);
      dom.center.headerLoading.setAttribute("aria-hidden", show ? "false" : "true");
    }
    if (dom.center.mobileHeaderLoading) {
      dom.center.mobileHeaderLoading.classList.toggle("hidden", !show);
      dom.center.mobileHeaderLoading.setAttribute("aria-hidden", show ? "false" : "true");
    }
    if (dom.center.mobileHeaderClientBtn) {
      dom.center.mobileHeaderClientBtn.classList.toggle("is-loading", show);
    }
  }

  function ensureThreadHistoryState(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    if (!state.threadHistoryByClient || typeof state.threadHistoryByClient !== "object") {
      state.threadHistoryByClient = {};
    }
    if (!state.threadHistoryByClient[key] || typeof state.threadHistoryByClient[key] !== "object") {
      state.threadHistoryByClient[key] = {
        hasMore: false,
        nextBeforeId: null,
        loading: false,
      };
    }
    return state.threadHistoryByClient[key];
  }

  function updateThreadHistoryFromSnapshot(clientId, snapshot) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const page = snapshot && snapshot.page && typeof snapshot.page === "object"
      ? snapshot.page
      : {};
    const history = ensureThreadHistoryState(key);
    if (!history) return;
    history.hasMore = page.hasMore === true;
    const nextBeforeId = Number(page.nextBeforeId || 0);
    history.nextBeforeId = Number.isFinite(nextBeforeId) && nextBeforeId > 0 ? Math.trunc(nextBeforeId) : null;
  }

  function getClientsRightApi() {
    const api = window.__clientsDashboardApi;
    if (!api) return null;
    return api;
  }

  function getOrdersRightApi() {
    const api = window.__ordersDashboardApi;
    if (!api) return null;
    return api;
  }

  function moveChatRightPaneNode(node, target) {
    if (!node || !target || node.parentElement === target) return;
    target.appendChild(node);
  }

  function captureClientOrdersListScrollTop() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const list = document.getElementById("clientOrdersList");
    if (!list) return;
    state.rightPanelClientOrdersScrollTop = Math.max(0, Number(list.scrollTop || 0));
  }

  function captureClientContentTab() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const activeTabBtn = document.querySelector('#clientContentTabs .shop-profile-tab.is-active[data-ctab]');
    const tabValue = String(activeTabBtn?.getAttribute("data-ctab") || "").trim().toLowerCase();
    if (tabValue === "orders" || tabValue === "addresses") {
      state.rightPanelClientContentTab = tabValue;
    }
  }

  function restoreClientOrdersListScrollTop() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const savedTop = Math.max(0, Number(state.rightPanelClientOrdersScrollTop || 0));
    const list = document.getElementById("clientOrdersList");
    if (!list) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        list.scrollTop = savedTop;
      });
    });
  }

  function restoreClientPanelState() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const tabValue = String(state.rightPanelClientContentTab || "").trim().toLowerCase();
    if (tabValue === "orders" || tabValue === "addresses") {
      const tabBtn = document.querySelector(`#clientContentTabs .shop-profile-tab[data-ctab="${cssEscape(tabValue)}"]`);
      if (tabBtn && typeof tabBtn.click === "function") {
        tabBtn.click();
      }
    }
    if (tabValue === "orders") {
      restoreClientOrdersListScrollTop();
    }
  }

  function hideLegacyRightPaneHeadersForChat() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const ids = ["clientTabsHeader", "orderTabsHeader", "orderTabsHeaderCheckout"];
    ids.forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.classList.add("hidden");
      node.setAttribute("aria-hidden", "true");
      node.style.setProperty("display", "none", "important");
    });
  }

  function getChatRightTabsHeaderHost(mode) {
    const nextMode = String(mode || "").trim().toLowerCase() === "order" ? "order" : "client";
    if (nextMode === "order") {
      const ordersPane = document.getElementById("ordersRightPane");
      if (!ordersPane) return null;
      return ordersPane.querySelector(".panel") || ordersPane;
    }
    return document.querySelector(".client-info-panel");
  }

  function placeChatRightTabsHeader(mode) {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const header = document.getElementById("chatRightTabsHeader");
    if (!header) return;
    const host = getChatRightTabsHeaderHost(mode);
    if (!host) return;
    if (header.parentElement === host && host.firstElementChild === header) return;
    host.insertBefore(header, host.firstChild || null);
  }

  function showChatRightPane(mode) {
    const nextMode = String(mode || "").trim().toLowerCase() === "order" ? "order" : "client";
    const host = document.querySelector(".page-chat .page-col-right");
    const storage = document.getElementById("chatRightPaneStorage");
    const clientPane = document.querySelector(".client-info-panel");
    const ordersPane = document.getElementById("ordersRightPane");
    const ordersCheckoutPane = document.getElementById("ordersCheckoutRightPane");
    if (host && storage && clientPane && ordersPane && ordersCheckoutPane) {
      if (nextMode === "order") {
        moveChatRightPaneNode(clientPane, storage);
        moveChatRightPaneNode(ordersPane, host);
        moveChatRightPaneNode(ordersCheckoutPane, host);
      } else {
        moveChatRightPaneNode(ordersPane, storage);
        moveChatRightPaneNode(ordersCheckoutPane, storage);
        moveChatRightPaneNode(clientPane, host);
      }
    }
    document.body.classList.toggle("chat-right-order-mode", nextMode === "order");
    placeChatRightTabsHeader(nextMode);
    hideLegacyRightPaneHeadersForChat();
  }

  function clearChatRightPane() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const host = document.querySelector(".page-chat .page-col-right");
    const storage = document.getElementById("chatRightPaneStorage");
    const clientPane = document.querySelector(".client-info-panel");
    const ordersPane = document.getElementById("ordersRightPane");
    const ordersCheckoutPane = document.getElementById("ordersCheckoutRightPane");
    const tabsHeader = document.getElementById("chatRightTabsHeader");
    if (host && storage) {
      moveChatRightPaneNode(clientPane, host);
      moveChatRightPaneNode(ordersPane, storage);
      moveChatRightPaneNode(ordersCheckoutPane, storage);
      moveChatRightPaneNode(tabsHeader, clientPane || storage);
    }
    document.body.classList.remove("chat-right-order-mode");
    if (tabsHeader) {
      tabsHeader.classList.add("hidden");
      tabsHeader.setAttribute("aria-hidden", "true");
    }
    const clientEmpty = document.getElementById("clientEmpty");
    const clientInfoWrap = document.getElementById("clientInfoWrap");
    const clientOrderInfoWrap = document.getElementById("clientOrderInfoWrap");
    if (clientEmpty) clientEmpty.classList.remove("hidden");
    if (clientInfoWrap) clientInfoWrap.classList.add("hidden");
    if (clientOrderInfoWrap) clientOrderInfoWrap.classList.add("hidden");
    const clientsRightApi = getClientsRightApi();
    if (clientsRightApi && typeof clientsRightApi.setChatRightForceEmpty === "function") {
      clientsRightApi.setChatRightForceEmpty(true);
    }
    hideLegacyRightPaneHeadersForChat();
  }

  function buildChatRightTabKey(kind, id) {
    const k = String(kind || "").trim().toLowerCase() === "order" ? "order" : "client";
    const n = Number(id || 0);
    return `${k}:${Number.isFinite(n) ? n : 0}`;
  }

  function renderChatRightTabs() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;
    const wrap = document.getElementById("chatRightTabs");
    if (!wrap) return;
    const tabs = Array.isArray(state.rightTabs) ? state.rightTabs : [];
    const clientsRightApi = getClientsRightApi();
    if (clientsRightApi && typeof clientsRightApi.setChatRightForceEmpty === "function") {
      clientsRightApi.setChatRightForceEmpty(tabs.length === 0);
    }
    const header = document.getElementById("chatRightTabsHeader");
    if (header) {
      const hasTabs = tabs.length > 0;
      header.classList.toggle("hidden", !hasTabs);
      header.setAttribute("aria-hidden", hasTabs ? "false" : "true");
    }
    wrap.innerHTML = tabs.map((t) => {
      const key = buildChatRightTabKey(t.kind, t.id);
      const selected = key && key === String(state.activeRightTabKey || "");
      const title = t.kind === "order" ? `#${t.id}` : (String(t.title || "").trim() || "Клиент");
      const safeTitle = escapeHtml(title);
      return `
        <div class="product-tab ${selected ? "is-active" : ""}" role="tab"
          data-chat-right-tab="${escapeHtml(key)}"
          aria-selected="${selected ? "true" : "false"}"
          title="${safeTitle}">
          <span class="product-tab-title">${safeTitle}</span>
          <button class="product-tab-close" type="button" data-chat-right-tab-close="${escapeHtml(key)}" aria-label="Закрыть вкладку">&times;</button>
        </div>
      `;
    }).join("");
  }

  function upsertChatRightTab(kind, id, title = "") {
    const tabKind = String(kind || "").trim().toLowerCase() === "order" ? "order" : "client";
    const n = Number(id || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!Array.isArray(state.rightTabs)) state.rightTabs = [];
    const key = buildChatRightTabKey(tabKind, n);
    const existing = state.rightTabs.find((t) => buildChatRightTabKey(t.kind, t.id) === key) || null;
    if (existing) {
      if (tabKind === "client" && title) existing.title = String(title || "").trim();
    } else {
      state.rightTabs.push({ kind: tabKind, id: n, title: String(title || "").trim() });
    }
    state.activeRightTabKey = key;
    state.rightTabActivationToken += 1;
    renderChatRightTabs();
    return key;
  }

  function closeChatRightTab(key) {
    const k = String(key || "").trim();
    if (!k || !Array.isArray(state.rightTabs)) return;
    state.rightTabs = state.rightTabs.filter((t) => buildChatRightTabKey(t.kind, t.id) !== k);
    if (String(state.activeRightTabKey || "") === k) {
      const last = state.rightTabs[state.rightTabs.length - 1] || null;
      state.activeRightTabKey = last ? buildChatRightTabKey(last.kind, last.id) : "";
    }
    state.rightTabActivationToken += 1;
    renderChatRightTabs();
    if (state.activeRightTabKey) {
      activateChatRightTab(state.activeRightTabKey).catch(console.error);
      return;
    }
    state.rightTabActivationToken += 1;
    clearChatRightPane();
  }

  async function activateChatRightTab(key) {
    const k = String(key || "").trim();
    if (!k) return;
    const activationToken = ++state.rightTabActivationToken;
    const tabExists = Array.isArray(state.rightTabs)
      && state.rightTabs.some((t) => buildChatRightTabKey(t.kind, t.id) === k);
    if (!tabExists) return;
    const [kindRaw, idRaw] = k.split(":");
    const kind = kindRaw === "order" ? "order" : "client";
    const id = Number(idRaw || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    state.activeRightTabKey = k;
    renderChatRightTabs();
    if (activationToken !== state.rightTabActivationToken) return;
    const clientsRightApi = getClientsRightApi();
    if (clientsRightApi && typeof clientsRightApi.setChatRightForceEmpty === "function") {
      clientsRightApi.setChatRightForceEmpty(false);
    }

    if (kind === "order") {
      captureClientContentTab();
      captureClientOrdersListScrollTop();
      showChatRightPane("order");
      const ordersRightApi = getOrdersRightApi();
      if (ordersRightApi && typeof ordersRightApi.openOrderById === "function") {
        ordersRightApi.openOrderById(id, { openMobile: false });
      }
      if (activationToken !== state.rightTabActivationToken) return;
      syncMobileChatView("right");
      return;
    }

    showChatRightPane("client");
    
    const selectedFromList = state.clients.find((client) => Number(client?.id || 0) === id) || null;
    const isGuestClient = isGuestChatClient(selectedFromList);
    const preferredTitle = selectedFromList?.name || "";
    if (clientsRightApi) {
      if (isGuestClient && typeof clientsRightApi.selectGuestChatClient === "function") {
        await clientsRightApi.selectGuestChatClient(id, preferredTitle, { skipMobileSheet: true }).catch(console.error);
      } else if (typeof clientsRightApi.selectClientById === "function") {
        await clientsRightApi.selectClientById(id, preferredTitle, { chatGuest: isGuestClient, skipMobileSheet: true }).catch(console.error);
      }
    }
    if (activationToken !== state.rightTabActivationToken) return;
    syncMobileChatView("right");
    restoreClientPanelState();
  }

  function seedChatRightTabsFromCurrentState() {
    if (!document.body || !document.body.classList.contains("page-chat")) return;

    const activeClientId = Number(state.activeClientId || 0);
    const activeClientFromList = (Array.isArray(state.clients) ? state.clients : [])
      .find((client) => Number(client?.id || 0) === activeClientId) || null;
    const activeClientTitle = String(
      activeClientFromList?.name
      || state.activeClient?.name
      || ""
    ).trim();

    if (Number.isFinite(activeClientId) && activeClientId > 0) {
      upsertChatRightTab("client", activeClientId, activeClientTitle);
    }

    const headerOrderId = Number(
      (dom.center.mobileHeaderOrderBtn && dom.center.mobileHeaderOrderBtn.getAttribute("data-order-id"))
      || (dom.center.headerOrder && dom.center.headerOrder.getAttribute("data-order-id"))
      || state.rightPanelOrderId
      || 0
    );

    if (Number.isFinite(headerOrderId) && headerOrderId > 0) {
      upsertChatRightTab("order", headerOrderId);
    }

    const rightMode = document.body.classList.contains("chat-right-order-mode") ? "order" : "client";
    if (rightMode === "order" && Number.isFinite(headerOrderId) && headerOrderId > 0) {
      state.activeRightTabKey = buildChatRightTabKey("order", headerOrderId);
    } else if (Number.isFinite(activeClientId) && activeClientId > 0) {
      state.activeRightTabKey = buildChatRightTabKey("client", activeClientId);
    }

    renderChatRightTabs();
  }

  function getTenantId() {
    const meta = document.querySelector('meta[name="tenant_id"]');
    if (meta && meta.content) {
      const n = Number(meta.content);
      if (Number.isFinite(n) && n > 0) return n;
    }
    try {
      const raw = localStorage.getItem("tenant");
      if (raw) {
        const tenant = JSON.parse(raw);
        const id = Number(tenant && tenant.id);
        if (Number.isFinite(id) && id > 0) return Math.trunc(id);
      }
    } catch {}
    return 1;
  }

  function getSharedClientDetailsCacheKey() {
    return `dashboard:clients:details:v1:${getTenantId()}`;
  }

  function getSharedOrderDetailsCacheKey() {
    return `dashboard:orders:details:v1:${getTenantId()}`;
  }

  function readSharedOrderDetailsCache() {
    try {
      const raw = localStorage.getItem(getSharedOrderDetailsCacheKey());
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function getSharedOrderDetails(orderId) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    const cache = readSharedOrderDetailsCache();
    const entry = cache[String(id)];
    if (!entry || typeof entry !== "object") return null;
    const updatedAt = Number(entry.updatedAt || 0);
    if (!updatedAt || (Date.now() - updatedAt) > SHARED_ORDER_DETAILS_CACHE_TTL_MS) return null;
    const order = entry.order && typeof entry.order === "object" ? entry.order : null;
    return order ? { ...order } : null;
  }

  function setSharedOrderDetails(order) {
    const id = Number(order?.id || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const cache = readSharedOrderDetailsCache();
    cache[String(id)] = {
      updatedAt: Date.now(),
      order: order && typeof order === "object" ? { ...order } : null,
    };
    const compacted = Object.entries(cache)
      .sort((a, b) => Number(b?.[1]?.updatedAt || 0) - Number(a?.[1]?.updatedAt || 0))
      .slice(0, SHARED_ORDER_DETAILS_CACHE_MAX)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    try {
      localStorage.setItem(getSharedOrderDetailsCacheKey(), JSON.stringify(compacted));
    } catch {}
  }

  function getSharedClientDetailsFromLocalStorage(clientId) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    try {
      const raw = localStorage.getItem(getSharedClientDetailsCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const entry = parsed[String(id)];
      if (!entry || typeof entry !== "object") return null;
      const updatedAt = Number(entry.updatedAt || 0);
      if (!updatedAt || (Date.now() - updatedAt) > CLIENT_DETAILS_SHARED_CACHE_TTL_MS) return null;
      const sharedClient = entry.client && typeof entry.client === "object" ? { ...entry.client } : null;
      const sharedOrders = Array.isArray(entry.orders) ? entry.orders.map((row) => ({ ...row })) : [];
      return {
        updatedAt,
        client: sharedClient,
        orders: sharedOrders,
      };
    } catch {
      return null;
    }
  }

  function setSharedClientDetailsToLocalStorage(clientId, payload = {}) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    const key = String(id);
    try {
      const cacheKey = getSharedClientDetailsCacheKey();
      const raw = localStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const cache = parsed && typeof parsed === "object" ? parsed : {};
      const prev = cache[key] && typeof cache[key] === "object" ? cache[key] : {};
      const prevClient = prev.client && typeof prev.client === "object" ? prev.client : null;
      const prevOrders = Array.isArray(prev.orders) ? prev.orders : [];
      const nextClient = payload.client && typeof payload.client === "object"
        ? { ...payload.client }
        : prevClient;
      const nextOrders = Array.isArray(payload.orders)
        ? payload.orders.map((row) => ({ ...row }))
        : prevOrders;
      cache[key] = {
        updatedAt: Date.now(),
        client: nextClient,
        orders: nextOrders,
      };
      localStorage.setItem(cacheKey, JSON.stringify(cache));
      return true;
    } catch {
      return false;
    }
  }

  function normalizeTenantChatWidgetEnabled(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") return true;
    if (rawValue === false || rawValue === 0) return false;
    const normalized = String(rawValue).trim().toLowerCase();
    if (!normalized) return true;
    if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
    if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric !== 0;
    return true;
  }

  function getTenantChatWidgetEnabledFromStorage() {
    try {
      const tenant = JSON.parse(localStorage.getItem("tenant") || "{}");
      return normalizeTenantChatWidgetEnabled(tenant && tenant.chat_widget_enabled);
    } catch {
      return true;
    }
  }

  function createChatDisabledAbortError() {
    const disabledErr = new Error("CHAT_DISABLED");
    disabledErr.name = "AbortError";
    return disabledErr;
  }

  function syncTenantChatWidgetEnabledToStorage(enabled) {
    try {
      const tenant = JSON.parse(localStorage.getItem("tenant") || "{}");
      if (!tenant || typeof tenant !== "object") return;
      tenant.chat_widget_enabled = enabled !== false ? 1 : 0;
      localStorage.setItem("tenant", JSON.stringify(tenant));
      document.dispatchEvent(new CustomEvent(TENANT_DATA_CHANGED_EVENT, { detail: { tenant } }));
    } catch {}
  }

  function handleChatFeatureDisabledByServer() {
    syncTenantChatWidgetEnabledToStorage(false);
    applyChatWidgetEnabledRuntimeState(false, { resume: false });
  }

  function canUseAttachmentDraftStorage() {
    return typeof window !== "undefined" && !!window.indexedDB;
  }

  function openAttachmentDraftDb() {
    if (!canUseAttachmentDraftStorage()) return Promise.resolve(null);
    if (attachmentDraftDbPromise) return attachmentDraftDbPromise;

    attachmentDraftDbPromise = new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(
          CHAT_ATTACHMENT_DRAFT_DB_NAME,
          CHAT_ATTACHMENT_DRAFT_DB_VERSION
        );
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(CHAT_ATTACHMENT_DRAFT_STORE)) {
            db.createObjectStore(CHAT_ATTACHMENT_DRAFT_STORE, { keyPath: "key" });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            try { db.close(); } catch {}
            attachmentDraftDbPromise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          attachmentDraftDbPromise = null;
          reject(request.error || new Error("ATTACHMENT_DRAFT_DB_OPEN_FAILED"));
        };
      } catch (err) {
        attachmentDraftDbPromise = null;
        reject(err);
      }
    }).catch(() => null);

    return attachmentDraftDbPromise;
  }

  async function readAttachmentDraftRecord(key) {
    const draftKey = String(key || "").trim();
    if (!draftKey) return null;
    const db = await openAttachmentDraftDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CHAT_ATTACHMENT_DRAFT_STORE, "readonly");
        const store = tx.objectStore(CHAT_ATTACHMENT_DRAFT_STORE);
        const request = store.get(draftKey);
        request.onsuccess = () => {
          const result = request.result;
          resolve(result && typeof result === "object" ? result : null);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function writeAttachmentDraftRecord(record) {
    const payload = record && typeof record === "object" ? record : null;
    const draftKey = String(payload?.key || "").trim();
    if (!draftKey) return false;
    const db = await openAttachmentDraftDb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CHAT_ATTACHMENT_DRAFT_STORE, "readwrite");
        const store = tx.objectStore(CHAT_ATTACHMENT_DRAFT_STORE);
        const request = store.put({
          key: draftKey,
          updatedAt: Number(payload.updatedAt || Date.now()),
          caption: String(payload.caption || ""),
          files: Array.isArray(payload.files) ? payload.files : [],
        });
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function deleteAttachmentDraftRecord(key) {
    const draftKey = String(key || "").trim();
    if (!draftKey) return false;
    const db = await openAttachmentDraftDb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(CHAT_ATTACHMENT_DRAFT_STORE, "readwrite");
        const store = tx.objectStore(CHAT_ATTACHMENT_DRAFT_STORE);
        const request = store.delete(draftKey);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  function normalizeStoredAttachmentDraftFile(file, fallbackIndex = 0) {
    if (typeof File !== "undefined" && file instanceof File) return file;
    if (typeof File === "undefined" || !(file instanceof Blob)) return null;
    const fileName = `chat-image-${Math.max(1, Number(fallbackIndex) + 1)}.bin`;
    try {
      return new File([file], fileName, {
        type: String(file.type || "application/octet-stream"),
        lastModified: Date.now(),
      });
    } catch {
      return null;
    }
  }

  function buildAttachPreviewDraftKey(clientId = state.activeClientId) {
    const tenantId = getTenantId();
    const key = normalizeClientIdKey(clientId);
    if (!tenantId || !key) return "";
    return `dashboard:${tenantId}:${key}`;
  }

  function clearAttachPreviewDraftPersistTimer() {
    if (!attachPreviewDraftPersistTimer) return;
    window.clearTimeout(attachPreviewDraftPersistTimer);
    attachPreviewDraftPersistTimer = 0;
  }

  async function clearPersistedAttachPreviewDraft(options = {}) {
    clearAttachPreviewDraftPersistTimer();
    const key = String(options.key || buildAttachPreviewDraftKey()).trim();
    if (!key) return false;
    return deleteAttachmentDraftRecord(key);
  }

  async function persistCurrentAttachPreviewDraft() {
    clearAttachPreviewDraftPersistTimer();
    const key = buildAttachPreviewDraftKey();
    if (!key) return false;
    const files = Array.isArray(state.attachPreviewSourceFiles)
      ? state.attachPreviewSourceFiles.filter((file) => file instanceof File)
      : [];
    if (!files.length) {
      await deleteAttachmentDraftRecord(key).catch(() => {});
      return false;
    }
    const caption = dom.center.attachPreviewCaption
      ? String(dom.center.attachPreviewCaption.value || "")
      : "";
    return writeAttachmentDraftRecord({
      key,
      updatedAt: Date.now(),
      caption,
      files,
    });
  }

  function schedulePersistAttachPreviewDraft(delayMs = 180) {
    clearAttachPreviewDraftPersistTimer();
    const key = buildAttachPreviewDraftKey();
    if (!key) return;
    attachPreviewDraftPersistTimer = window.setTimeout(() => {
      attachPreviewDraftPersistTimer = 0;
      persistCurrentAttachPreviewDraft().catch(() => {});
    }, Math.max(0, Number(delayMs || 0)));
  }

  async function restorePersistedAttachPreviewDraft(clientId = state.activeClientId) {
    const key = buildAttachPreviewDraftKey(clientId);
    if (!key || !isChatWidgetEnabledRuntime()) return false;
    if (
      dom.center.attachPreviewOverlay
      && !dom.center.attachPreviewOverlay.classList.contains("hidden")
    ) {
      return false;
    }

    const restoreToken = ++attachPreviewDraftRestoreToken;
    const record = await readAttachmentDraftRecord(key);
    if (!record || restoreToken !== attachPreviewDraftRestoreToken) return false;
    if (buildAttachPreviewDraftKey(clientId) !== key) return false;

    const files = (Array.isArray(record.files) ? record.files : [])
      .map((file, index) => normalizeStoredAttachmentDraftFile(file, index))
      .filter((file) => file instanceof File);
    if (!files.length) {
      await deleteAttachmentDraftRecord(key).catch(() => {});
      return false;
    }

    return openAttachPreviewFromFiles(files, {
      caption: String(record.caption || ""),
      focusCaption: true,
    });
  }

  function isChatWidgetEnabledRuntime() {
    return state.chatWidgetEnabled !== false;
  }

  function setSidebarChatNavVisibility(enabled) {
    const navLink = document.getElementById("sidebarChatNavLink");
    if (!navLink) return;
    const navItem = navLink.closest("li");
    const hidden = enabled !== true;
    if (navItem) {
      navItem.classList.toggle("hidden", hidden);
    } else {
      navLink.classList.toggle("hidden", hidden);
    }
    navLink.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  function abortAllActiveApiRequests() {
    activeApiAbortControllers.forEach((controller) => {
      try { controller.abort(); } catch {}
    });
    activeApiAbortControllers.clear();
  }

  function applyChatWidgetEnabledRuntimeState(enabled, options = {}) {
    const wasEnabled = state.chatWidgetEnabled !== false;
    const nextEnabled = enabled !== false;
    state.chatWidgetEnabled = nextEnabled;
    setSidebarChatNavVisibility(nextEnabled);

    if (!nextEnabled) {
      pauseRealtimeSync({ flushTyping: true, keepalive: true, forceTypingStop: true });
      abortAllActiveApiRequests();
      messageAlertSummariesPrimed = false;
      setHeaderLoading(false);
      setComposerEnabled(false);
      setChatBootstrapLoading(false);
      return { enabled: false, changed: nextEnabled !== wasEnabled };
    }

    if (!wasEnabled || options.resume === true) {
      resumeRealtimeSync();
    }

    return { enabled: true, changed: nextEnabled !== wasEnabled };
  }

  function syncChatWidgetEnabledFromTenant(options = {}) {
    const runtimeState = applyChatWidgetEnabledRuntimeState(
      getTenantChatWidgetEnabledFromStorage(),
      options
    );
    if (!runtimeState.enabled) return false;

    if (runtimeState.changed || options.reload === true) {
      state.summariesUpdatedAt = "";
      state.summariesRevision = 0;
      const cachedClientsCount = Array.isArray(state.store?.clientsCache) ? state.store.clientsCache.length : 0;
      const localThreadsCount = state.store && state.store.threads && typeof state.store.threads === "object"
        ? Object.keys(state.store.threads).length
        : 0;
      const hasInstantBootstrapData = cachedClientsCount > 0 || localThreadsCount > 0;
      setChatBootstrapLoading(!hasInstantBootstrapData);
      loadClients()
        .catch(console.error)
        .finally(() => {
          if (isChatWidgetEnabledRuntime()) {
            setChatBootstrapLoading(false);
          }
        });
    }
    return true;
  }

  function withChatActorQuery(url, actorValue) {
    const rawUrl = String(url || "");
    if (!rawUrl || rawUrl.indexOf(CHAT_TEMP_API_BASE) !== 0) return rawUrl;
    const actor = String(actorValue || "").trim().toLowerCase();
    if (!actor) return rawUrl;
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      if (!parsed.searchParams.has("chat_actor")) {
        parsed.searchParams.set("chat_actor", actor);
      }
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      const hasQuery = rawUrl.indexOf("?") !== -1;
      const already = rawUrl.indexOf("chat_actor=") !== -1;
      if (already) return rawUrl;
      return rawUrl + (hasQuery ? "&" : "?") + "chat_actor=" + encodeURIComponent(actor);
    }
  }

  function getSharedClientOrdersFetcher() {
    if (typeof window === "undefined") return null;
    if (typeof window.__markinMeSharedOrdersFetcher === "function") {
      return window.__markinMeSharedOrdersFetcher;
    }
    const inFlight = new Map();
    window.__markinMeSharedOrdersFetcher = async (clientId, requestFactory) => {
      const key = String(Number(clientId || 0) || "");
      if (!key || typeof requestFactory !== "function") {
        return requestFactory();
      }
      if (inFlight.has(key)) return inFlight.get(key);
      const task = Promise.resolve()
        .then(() => requestFactory())
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, task);
      return task;
    };
    return window.__markinMeSharedOrdersFetcher;
  }

  function buildFreshClientOrdersUrl(clientId) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return `/api/admin/clients/${clientId}/orders`;
    return `/api/admin/clients/${id}/orders?_=${Date.now()}`;
  }

  async function fetchClientOrdersFresh(clientId) {
    return apiJson(buildFreshClientOrdersUrl(clientId), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
  }

  function buildFreshHeaderOrderCandidateUrl(clientId) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return `/api/admin/clients/${clientId}/orders/header-candidate`;
    return `/api/admin/clients/${id}/orders/header-candidate?_=${Date.now()}`;
  }

  async function fetchHeaderOrderCandidateFresh(clientId) {
    return apiJson(buildFreshHeaderOrderCandidateUrl(clientId), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
  }

  function buildFreshOrderDetailsUrl(orderId) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return `/api/admin/orders/${orderId}`;
    return `/api/admin/orders/${id}?_=${Date.now()}`;
  }

  async function fetchOrderDetailsFresh(orderId) {
    return apiJson(buildFreshOrderDetailsUrl(orderId), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
  }

  function buildChatSseUrl(url, actorValue, extraParams = {}) {
    const rawUrl = withChatActorQuery(url, actorValue);
    const tenantId = getTenantId();
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      if (tenantId) parsed.searchParams.set("tenant_id", String(tenantId));
      Object.entries(extraParams || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        parsed.searchParams.set(String(key), String(value));
      });
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return rawUrl;
    }
  }

  function closeChatEventSource(source) {
    if (!source) return;
    try {
      source.onopen = null;
      source.onerror = null;
      source.onmessage = null;
      if (typeof source.close === "function") source.close();
    } catch {}
  }

  function parseChatSsePayload(event) {
    if (!event || typeof event.data !== "string" || !event.data) return null;
    try {
      const parsed = JSON.parse(event.data);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  async function apiJson(url, opts = {}) {
    if (!isChatWidgetEnabledRuntime()) {
      throw createChatDisabledAbortError();
    }

    const tenantId = getTenantId();
    const token = localStorage.getItem("authToken");
    const storeId = localStorage.getItem("activeStoreId") || "1";
    const isFormDataBody = (
      typeof FormData !== "undefined"
      && opts.body instanceof FormData
    );

    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": storeId,
      ...(opts.body && !isFormDataBody ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };

    if (token) headers.Authorization = `Bearer ${token}`;
    const actorFromHeaders = String(headers["x-chat-actor"] || "").trim().toLowerCase();
    const requestUrl = withChatActorQuery(url, actorFromHeaders || "out");

    const requestAbortController = new AbortController();
    activeApiAbortControllers.add(requestAbortController);
    const externalSignal = opts.signal;
    const abortFromExternal = () => {
      try { requestAbortController.abort(); } catch {}
    };
    if (externalSignal) {
      if (externalSignal.aborted) {
        abortFromExternal();
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, { once: true });
      }
    }

    try {
      const res = await fetch(requestUrl, {
        method: opts.method || "GET",
        headers,
        cache: opts.cache || "default",
        keepalive: opts.keepalive === true,
        signal: requestAbortController.signal,
        body: opts.body
          ? (isFormDataBody ? opts.body : JSON.stringify(opts.body))
          : undefined,
      });

      if (res.status === 401) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        localStorage.removeItem("tenant");
        window.location.href = "/login";
        throw new Error("UNAUTHORIZED");
      }

      const json = await res.json().catch(() => null);
      if (!json || json.ok !== true) {
        const errorCode = String(json?.error || `API_ERROR (${res.status})`);
        if (errorCode === "CHAT_DISABLED") {
          handleChatFeatureDisabledByServer();
          throw createChatDisabledAbortError();
        }
        throw new Error(errorCode);
      }
      return json;
    } finally {
      activeApiAbortControllers.delete(requestAbortController);
      if (externalSignal) {
        try { externalSignal.removeEventListener("abort", abortFromExternal); } catch {}
      }
    }
  }

  function normalizeClientIdKey(clientId) {
    const n = Number(clientId);
    if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
    return "";
  }

  function normalizeChatNotificationOpenRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === "object" ? rawRequest : {};
    const openRaw = source.open_chat ?? source.openChat ?? source.open;
    const shouldOpen = (
      openRaw === true
      || openRaw === 1
      || String(openRaw || "").trim().toLowerCase() === "1"
      || String(openRaw || "").trim().toLowerCase() === "true"
    );
    const sourceValue = String(
      source.chat_source
      ?? source.chatSource
      ?? source.source
      ?? ""
    ).trim().toLowerCase();
    const clientId = normalizeClientIdKey(
      source.chat_client_id
      ?? source.client_id
      ?? source.clientId
    );
    if (!clientId) return null;
    if (!shouldOpen && sourceValue !== "push") return null;
    return {
      open: true,
      source: sourceValue || "push",
      clientId,
      messageId: String(
        source.chat_message_id
        ?? source.message_id
        ?? source.messageId
        ?? ""
      ).trim().slice(0, 120),
    };
  }

  function readChatNotificationOpenRequestFromLocation() {
    try {
      const currentUrl = new URL(window.location.href);
      return normalizeChatNotificationOpenRequest({
        open_chat: currentUrl.searchParams.get(CHAT_AUTO_OPEN_QUERY_PARAM),
        chat_source: currentUrl.searchParams.get(CHAT_AUTO_OPEN_SOURCE_PARAM),
        chat_client_id: currentUrl.searchParams.get(CHAT_AUTO_OPEN_CLIENT_ID_PARAM),
        chat_message_id: currentUrl.searchParams.get(CHAT_AUTO_OPEN_MESSAGE_ID_PARAM),
      });
    } catch {
      return null;
    }
  }

  function clearChatNotificationOpenRequestFromLocation() {
    try {
      const currentUrl = new URL(window.location.href);
      let changed = false;
      [
        CHAT_AUTO_OPEN_QUERY_PARAM,
        CHAT_AUTO_OPEN_SOURCE_PARAM,
        CHAT_AUTO_OPEN_CLIENT_ID_PARAM,
        CHAT_AUTO_OPEN_MESSAGE_ID_PARAM,
      ].forEach((key) => {
        if (!currentUrl.searchParams.has(key)) return;
        currentUrl.searchParams.delete(key);
        changed = true;
      });
      if (!changed) return;
      const nextUrl = currentUrl.pathname + currentUrl.search + currentUrl.hash;
      window.history.replaceState(window.history.state, "", nextUrl);
    } catch {}
  }

  function getThreadMutationVersion(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return 0;
    const value = Number(state.localThreadMutations?.[key] || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function markThreadMutated(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    state.localThreadMutations[key] = getThreadMutationVersion(key) + 1;
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

  function buildSummaryFingerprint(row) {
    const source = row && typeof row === "object" ? row : {};
    const messageCount = Number(source.message_count ?? source.messageCount ?? 0);
    const unreadCount = Number(source.unread_count ?? source.unreadCount ?? 0);
    const lastMessageAt = String(source.last_message_at ?? source.lastMessageAt ?? "");
    const lastMessageText = String(source.last_message_text ?? source.lastMessageText ?? "");
    const safeMessageCount = Number.isFinite(messageCount) && messageCount > 0 ? Math.trunc(messageCount) : 0;
    const safeUnreadCount = Number.isFinite(unreadCount) && unreadCount > 0 ? Math.trunc(unreadCount) : 0;
    const typingActive = source.typing_active === true || source.typingActive === true;
    const typingText = String(source.typing_text ?? source.typingText ?? "");
    const typingUpdatedAt = String(source.typing_updated_at ?? source.typingUpdatedAt ?? "");
    const typingExpiresAt = String(source.typing_expires_at ?? source.typingExpiresAt ?? "");
    return [safeMessageCount, safeUnreadCount, lastMessageAt, lastMessageText, typingActive ? "1" : "0", typingText, typingUpdatedAt, typingExpiresAt].join("|");
  }

  function hasPendingRemoteSave(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    return !!state.remoteSaveTimers[key] || state.remoteSaveInFlight[key] === true;
  }

  function stableSerialize(value) {
    try {
      return JSON.stringify(value || []);
    } catch {
      return "[]";
    }
  }

  function buildMessageFastFingerprint(message) {
    const msg = message && typeof message === "object" ? message : {};
    const reactions = ensureMessageReactions(msg);
    const reactionIn = String(reactions.in || "");
    const reactionOut = String(reactions.out || "");
    return [
      String(msg.id || ""),
      String(msg.updated_at || ""),
      String(msg.edited_at || ""),
      String(msg.deleted_at || ""),
      String(msg.read_at || ""),
      String(msg.status || ""),
      String(msg.direction || ""),
      String(msg.type || ""),
      String(msg.text || ""),
      String(msg.file_url || ""),
      String(msg.reply_to_id || ""),
      String(msg.hidden || ""),
      reactionIn,
      reactionOut,
    ].join("|");
  }

  function areThreadMessagesEqualFast(prev, next) {
    if (prev === next) return true;
    const a = Array.isArray(prev) ? prev : [];
    const b = Array.isArray(next) ? next : [];
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (buildMessageFastFingerprint(a[index]) !== buildMessageFastFingerprint(b[index])) {
        return false;
      }
    }
    return true;
  }

  function buildActiveOrdersSignature(orders) {
    const list = Array.isArray(orders) ? orders : [];
    const normalized = list
      .map((order) => ({
        id: Number(order?.id || 0),
        customer_id: Number(order?.customer_id || order?.client_id || 0),
        status_id: Number(order?.status_id || 0),
        status_title: String(order?.status_title || ""),
        status_color: String(order?.status_color || ""),
        total_price: Number(order?.total_price ?? order?.total ?? 0),
        payment_code: String(order?.payment_code || ""),
        address: String(order?.address || order?.pickup_store_address || ""),
        comment: String(order?.comment || order?.address_comment || ""),
        method_code: String(order?.method_code || ""),
        created_at: String(order?.created_at || ""),
        scheduled_at: String(order?.scheduled_at || ""),
        updated_at: String(order?.updated_at || ""),
      }))
      .sort((a, b) => a.id - b.id);
    return stableSerialize(normalized);
  }

  function setActiveOrders(orders, options = {}) {
    const incoming = Array.isArray(orders) ? orders : [];
    const existingById = new Map(
      (Array.isArray(state.activeOrders) ? state.activeOrders : [])
        .map((order) => [Number(order?.id || 0), order])
    );
    const list = incoming.map((order) => {
      const id = Number(order?.id || 0);
      const prev = existingById.get(id);
      return prev ? { ...prev, ...order } : order;
    });
    if (!list.length) state.headerOrderId = 0;
    const signature = buildActiveOrdersSignature(list);
    const changed = signature !== state.activeOrdersSignature;
    state.activeOrders = list;
    state.activeOrdersSignature = signature;
    if (!list.length) {
      state.activeOrdersHydratedClientId = 0;
      state.headerOrderSnapshot = null;
    }

    if (changed || options.forceRender) {
      try {
        renderChatHeader();
      } catch (err) {
        console.error("Failed to render chat header from active orders:", err);
      }
      try {
        // Order cards are rendered inside message bubbles, so refresh the thread view too.
        renderMessages({ disableAutoPin: true, smoothScroll: false, skipSaveScrollPosition: true });
      } catch (err) {
        console.error("Failed to render chat messages from active orders:", err);
      }
    }
    return changed;
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

  function getRandomTypingPhrase() {
    if (!Array.isArray(CHAT_TYPING_PHRASES) || !CHAT_TYPING_PHRASES.length) {
      return "печатает";
    }
    const idx = Math.floor(Math.random() * CHAT_TYPING_PHRASES.length);
    const picked = String(CHAT_TYPING_PHRASES[idx] || "").trim();
    return picked || "печатает";
  }

  function normalizePeerTypingInfo(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const active = source.active === true;
    const text = String(source.text || "").trim().slice(0, 120);
    const updatedAt = String(source.updated_at || source.updatedAt || "");
    const expiresAt = String(source.expires_at || source.expiresAt || "");
    return {
      active: active && !!text,
      text: active ? text : "",
      updatedAt,
      expiresAt,
    };
  }


  function isPeerTypingInfoActiveNow(info) {
    const normalized = normalizePeerTypingInfo(info);
    if (!normalized.active || !String(normalized.text || "").trim()) return false;
    const until = getPeerTypingEffectiveUntilMs(normalized);
    if (!Number.isFinite(until)) return false;
    return until > Date.now();
  }

  function getPeerTypingEffectiveUntilMs(info) {
    const normalized = normalizePeerTypingInfo(info);
    const expiresAtMs = new Date(String(normalized.expiresAt || "")).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) return expiresAtMs;
    const updatedAtMs = new Date(String(normalized.updatedAt || "")).getTime();
    if (!Number.isFinite(updatedAtMs)) return expiresAtMs;
    return updatedAtMs + CHAT_TYPING_EXPIRE_GRACE_MS;
  }

  function ensurePeerTypingIndicatorNode() {
    if (dom.center.typingIndicator && dom.center.typingIndicator.isConnected) {
      return dom.center.typingIndicator;
    }
    const list = dom.center.messages;
    if (!list) return null;
    const existing = list.querySelector("#chatTypingIndicator");
    if (existing) {
      dom.center.typingIndicator = existing;
      return existing;
    }
    const node = document.createElement("div");
    node.id = "chatTypingIndicator";
    node.className = "chat-typing-indicator is-hidden";
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    list.appendChild(node);
    dom.center.typingIndicator = node;
    return node;
  }

  function renderPeerTypingIndicator() {
    const keepBottom = shouldKeepMessagesPinnedToBottom();
    const node = ensurePeerTypingIndicatorNode();
    if (!node) return;
    const activeKey = normalizeClientIdKey(state.activeClientId);
    const info = activeKey ? normalizePeerTypingInfo(state.peerTypingByClient[activeKey]) : null;
    const activeNow = !!(info && isPeerTypingInfoActiveNow(info));
    const shouldShow = activeNow;
    if (!shouldShow) {
      node.textContent = "";
      node.classList.add("is-hidden");
      if (keepBottom) {
        scrollMessagesToBottom({ behavior: "auto", keepPending: true });
      } else {
        updateMessagesScrollDownButton();
      }
      return;
    }
    node.textContent = String(info.text || "").trim();
    node.classList.remove("is-hidden");
    if (keepBottom) {
      scrollMessagesToBottom({ behavior: "auto", keepPending: true });
    } else {
      updateMessagesScrollDownButton();
    }
  }

  function clearPeerTypingHideTimer(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const timer = Number(state.peerTypingHideTimers[key] || 0);
    if (timer) window.clearTimeout(timer);
    delete state.peerTypingHideTimers[key];
  }

  function schedulePeerTypingAutoHide(clientId, info) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    clearPeerTypingHideTimer(key);
    const until = getPeerTypingEffectiveUntilMs(info);
    if (!Number.isFinite(until)) return;
    const delay = Math.max(0, until - Date.now() + 80);
    state.peerTypingHideTimers[key] = window.setTimeout(() => {
      delete state.peerTypingHideTimers[key];
      const current = normalizePeerTypingInfo(state.peerTypingByClient[key]);
      if (!current.active) return;
      const currentUntil = getPeerTypingEffectiveUntilMs(current);
      if (Number.isFinite(currentUntil) && currentUntil > Date.now()) {
        schedulePeerTypingAutoHide(key, current);
        return;
      }
      state.peerTypingByClient[key] = {
        active: false,
        text: "",
        updatedAt: current.updatedAt,
        expiresAt: "",
      };
      updateClientRowPreview(key);
      if (Number(state.activeClientId) === Number(key)) renderPeerTypingIndicator();
    }, delay);
  }

  function getPeerTypingUpdatedAt(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return "";
    return String(state.peerTypingUpdatedAtByClient[key] || "");
  }

  function applyPeerTypingState(clientId, remoteTyping, options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const opts = options || {};
    const info = normalizePeerTypingInfo(remoteTyping);
    const previousUpdatedAt = String(state.peerTypingUpdatedAtByClient[key] || "");
    const nextUpdatedAt = String(info.updatedAt || previousUpdatedAt || "");
    if (nextUpdatedAt) {
      state.peerTypingUpdatedAtByClient[key] = nextUpdatedAt;
    }

    if (opts.forceInactive === true) {
      state.peerTypingByClient[key] = {
        active: false,
        text: "",
        updatedAt: nextUpdatedAt,
        expiresAt: "",
      };
      clearPeerTypingHideTimer(key);
      updateClientRowPreview(key);
      if (Number(state.activeClientId) === Number(key)) renderPeerTypingIndicator();
      return;
    }

    state.peerTypingByClient[key] = info;
    if (info.active) {
      schedulePeerTypingAutoHide(key, info);
    } else {
      clearPeerTypingHideTimer(key);
    }
    updateClientRowPreview(key);
    if (Number(state.activeClientId) === Number(key)) renderPeerTypingIndicator();
  }

  async function pushThreadTypingState(clientId, active, phrase = "", options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const body = active === true
      ? { typing: true, text: String(phrase || "").trim().slice(0, 120) }
      : { typing: false };
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/typing`, {
      method: "POST",
      keepalive: options.keepalive === true,
      body,
    });
    const peerTyping = json?.data?.peer_typing;
    if (peerTyping && typeof peerTyping === "object") {
      applyPeerTypingState(key, peerTyping);
    }
  }

  function queueLocalTypingStatePush(clientId, active, phrase = "", options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return Promise.resolve();
    const chain = state.localTypingPushChain && typeof state.localTypingPushChain.then === "function"
      ? state.localTypingPushChain
      : Promise.resolve();
    const next = chain
      .then(() => pushThreadTypingState(key, active, phrase, options))
      .catch((err) => {
        console.error(err);
      });
    state.localTypingPushChain = next;
    return next;
  }

  function clearLocalTypingTimers() {
    if (state.localTypingHeartbeatTimer) {
      window.clearTimeout(state.localTypingHeartbeatTimer);
      state.localTypingHeartbeatTimer = 0;
    }
    if (state.localTypingStopTimer) {
      window.clearTimeout(state.localTypingStopTimer);
      state.localTypingStopTimer = 0;
    }
    if (state.localTypingWatchTimer) {
      window.clearTimeout(state.localTypingWatchTimer);
      state.localTypingWatchTimer = 0;
    }
  }

  function scheduleLocalTypingWatch() {
    if (!state.localTypingActive || !dom.center.input) return;
    if (state.localTypingWatchTimer) window.clearTimeout(state.localTypingWatchTimer);
    state.localTypingWatchTimer = window.setTimeout(() => {
      state.localTypingWatchTimer = 0;
      if (!state.localTypingActive || !dom.center.input) return;
      const key = normalizeClientIdKey(state.localTypingClientId);
      if (!key || Number(state.activeClientId) !== Number(key)) {
        stopLocalTypingSession(key, { flush: true });
        return;
      }
      const currentText = normalizeComposerText(dom.center.input.value);
      if (!currentText) {
        stopLocalTypingSession(key, { flush: true });
        return;
      }
      if (currentText !== String(state.localTypingLastText || "")) {
        state.localTypingLastText = currentText;
        state.localTypingLastActivityAt = Date.now();
      }
      scheduleLocalTypingWatch();
    }, 120);
  }

  function scheduleLocalTypingHeartbeat() {
    if (!state.localTypingActive) return;
    const key = normalizeClientIdKey(state.localTypingClientId);
    if (!key) return;
    if (state.localTypingHeartbeatTimer) window.clearTimeout(state.localTypingHeartbeatTimer);
    state.localTypingHeartbeatTimer = window.setTimeout(() => {
      const activeKey = normalizeClientIdKey(state.localTypingClientId);
      if (!state.localTypingActive || !activeKey || !dom.center.input) return;
      const currentText = normalizeComposerText(dom.center.input.value);
      const hasText = !!currentText;
      if (!hasText || Number(state.activeClientId) !== Number(activeKey)) {
        stopLocalTypingSession(activeKey, { flush: true });
        return;
      }
      if (currentText !== String(state.localTypingLastText || "")) {
        state.localTypingLastText = currentText;
        state.localTypingLastActivityAt = Date.now();
      }
      const lastActivityAt = Number(state.localTypingLastActivityAt || 0);
      if (
        Number.isFinite(CHAT_TYPING_IDLE_STOP_MS)
        && CHAT_TYPING_IDLE_STOP_MS > 0
        && lastActivityAt > 0
        && (Date.now() - lastActivityAt) >= CHAT_TYPING_IDLE_STOP_MS
      ) {
        stopLocalTypingSession(activeKey, { flush: true });
        return;
      }
      queueLocalTypingStatePush(activeKey, true, state.localTypingPhrase);
      scheduleLocalTypingHeartbeat();
    }, CHAT_TYPING_HEARTBEAT_MS);
  }

  function scheduleLocalTypingStop(delayMs = CHAT_TYPING_IDLE_STOP_MS) {
    if (state.localTypingStopTimer) window.clearTimeout(state.localTypingStopTimer);
    const rawTimeout = Number(delayMs ?? CHAT_TYPING_IDLE_STOP_MS);
    if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) return;
    const timeout = Math.max(80, rawTimeout);
    state.localTypingStopTimer = window.setTimeout(() => {
      const lastActivityAt = Number(state.localTypingLastActivityAt || 0);
      if (lastActivityAt > 0 && (Date.now() - lastActivityAt) < timeout) {
        scheduleLocalTypingStop(timeout);
        return;
      }
      const key = normalizeClientIdKey(state.localTypingClientId || state.activeClientId);
      stopLocalTypingSession(key, { flush: true });
    }, timeout);
  }

  function stopLocalTypingSession(clientId, options = {}) {
    const opts = options || {};
    const key = normalizeClientIdKey(clientId || state.localTypingClientId || state.activeClientId);
    const wasActive = state.localTypingActive === true && !!normalizeClientIdKey(state.localTypingClientId);
    clearLocalTypingTimers();
    state.localTypingActive = false;
    state.localTypingPhrase = "";
    state.localTypingClientId = "";
    state.localTypingLastActivityAt = 0;
    state.localTypingLastText = "";

    if (opts.flush !== false && key && (wasActive || opts.force === true)) {
      queueLocalTypingStatePush(key, false, "", { keepalive: opts.keepalive === true });
    }
  }

  function handleComposerTypingActivity(options = {}) {
    const opts = options || {};
    if (!dom.center.input) return;
    const key = normalizeClientIdKey(state.activeClientId);
    if (!key) {
      stopLocalTypingSession(state.localTypingClientId, { flush: true });
      return;
    }

    const currentText = normalizeComposerText(dom.center.input.value);
    const hasText = !!currentText;
    if (!hasText && opts.allowEmpty !== true) {
      stopLocalTypingSession(key, { flush: true });
      return;
    }

    if (state.localTypingActive && Number(state.localTypingClientId) !== Number(key)) {
      stopLocalTypingSession(state.localTypingClientId, { flush: true });
    }

    if (!state.localTypingActive) {
      state.localTypingActive = true;
      state.localTypingClientId = key;
      state.localTypingPhrase = getRandomTypingPhrase();
      queueLocalTypingStatePush(key, true, state.localTypingPhrase);
    }

    state.localTypingLastText = currentText;
    state.localTypingLastActivityAt = Date.now();
    scheduleLocalTypingHeartbeat();
    scheduleLocalTypingWatch();
    scheduleLocalTypingStop(CHAT_TYPING_IDLE_STOP_MS);
  }

  function isTypingKeyEvent(event) {
    if (!event) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.isComposing === true) return true;
    const key = String(event.key || "");
    if (!key) return false;
    if (key === "Backspace" || key === "Delete" || key === "Process" || key === "Unidentified") return true;
    if (String(event.code || "") === "Space") return true;
    return key.length === 1;
  }

  async function fetchRemoteThreadSnapshot(clientId, options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const limitRaw = Number(options.limit ?? CHAT_THREAD_PAGE_SIZE);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.max(1, Math.min(200, Math.trunc(limitRaw)))
      : CHAT_THREAD_PAGE_SIZE;
    const beforeIdRaw = Number(options.beforeId || 0);
    const beforeId = Number.isFinite(beforeIdRaw) && beforeIdRaw > 0
      ? Math.trunc(beforeIdRaw)
      : 0;
    const qs = new URLSearchParams({
      _ts: String(Date.now()),
      limit: String(limit),
    });
    if (beforeId > 0) qs.set("before_id", String(beforeId));
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}?${qs.toString()}`);
    const payload = json?.data || {};
    const page = payload.page && typeof payload.page === "object" ? payload.page : {};
    const nextBeforeIdRaw = Number(page.next_before_id || payload.next_before_id || 0);
    return {
      clientId: Number(key),
      updatedAt: String(payload.updated_at || ""),
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
      page: {
        hasMore: page.has_more === true || payload.has_more === true,
        nextBeforeId: Number.isFinite(nextBeforeIdRaw) && nextBeforeIdRaw > 0
          ? Math.trunc(nextBeforeIdRaw)
          : null,
      },
    };
  }

  async function fetchRemoteThreadMeta(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const qs = new URLSearchParams({ _ts: String(Date.now()) });
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/meta?${qs.toString()}`);
    const payload = json?.data || {};
    return {
      clientId: Number(key),
      updatedAt: String(payload.updated_at || ""),
    };
  }

  async function fetchRemoteThreadDiff(clientId, sinceUpdatedAt) {
    const key = normalizeClientIdKey(clientId);
    const since = String(sinceUpdatedAt || "").trim();
    if (!key || !since) return null;
    const qs = new URLSearchParams({
      since,
      _ts: String(Date.now()),
    });
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/diff?${qs.toString()}`);
    const payload = json?.data || {};
    return {
      clientId: Number(key),
      updatedAt: String(payload.updated_at || ""),
      messageCount: Number(payload.message_count || 0),
      messages: Array.isArray(payload.messages) ? payload.messages : [],
    };
  }

  async function patchRemoteThreadMeta(clientId, metaPatch = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const nextName = String(metaPatch?.name || "").trim();
    const nextPhone = String(metaPatch?.phone || "").trim();
    if (!nextName && !nextPhone) return false;
    await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/meta`, {
      method: "PATCH",
      body: {
        meta: {
          name: nextName,
          phone: nextPhone,
        },
      },
    });
    return true;
  }

  function syncClientIdentityIntoList(clientId, profile) {
    const key = normalizeClientIdKey(clientId || profile?.id);
    const nextName = String(profile?.name || "").trim();
    const nextPhone = String(profile?.phone || "").trim();
    const nextNameIdentity = normalizeClientNameIdentity(nextName);
    const nextPhoneDigits = normalizePhoneDigits(nextPhone);
    if (!key) {
      return {
        changed: false,
        prevName: "",
        prevPhone: "",
        nextName,
        nextPhone,
      };
    }

    let prevName = "";
    let prevPhone = "";
    let changed = false;

    state.clients = (Array.isArray(state.clients) ? state.clients : []).map((row) => {
      if (Number(row?.id) !== Number(key)) return row;
      prevName = String(row?.name || "").trim();
      prevPhone = String(row?.phone || "").trim();
      const prevNameIdentity = normalizeClientNameIdentity(prevName);
      const prevPhoneDigits = normalizePhoneDigits(prevPhone);
      const nextRow = { ...row };

      if (nextName && prevNameIdentity !== nextNameIdentity) {
        nextRow.name = nextName;
        changed = true;
      }
      if (nextPhoneDigits && prevPhoneDigits !== nextPhoneDigits) {
        nextRow.phone = nextPhone;
        changed = true;
      }
      if (
        nextRow._isVirtualChatClient === true
        && nextName
        && !isGuestLikeClientName(nextName)
      ) {
        delete nextRow._isVirtualChatClient;
        changed = true;
      }

      return changed ? nextRow : row;
    });

    if (state.activeClient && Number(state.activeClient.id) === Number(key)) {
      const activeName = String(state.activeClient.name || "").trim();
      const activePhone = String(state.activeClient.phone || "").trim();
      const activeNameIdentity = normalizeClientNameIdentity(activeName);
      const activePhoneDigits = normalizePhoneDigits(activePhone);
      if (nextName && activeNameIdentity !== nextNameIdentity) {
        state.activeClient.name = nextName;
        changed = true;
      }
      if (nextPhoneDigits && activePhoneDigits !== nextPhoneDigits) {
        state.activeClient.phone = nextPhone;
        changed = true;
      }
    }

    return {
      changed,
      prevName,
      prevPhone,
      nextName,
      nextPhone,
    };
  }

  function applyRemoteThreadSnapshot(snapshot, options = {}) {
    if (!snapshot || !Number.isFinite(Number(snapshot.clientId))) return false;
    const key = normalizeClientIdKey(snapshot.clientId);
    if (!key) return false;
    const appendOlder = options.appendOlder === true;
    const preserveHistory = options.preserveHistory === true && !appendOlder;
    const incomingNext = applyPendingThreadReactionOverridesToMessages(
      key,
      Array.isArray(snapshot.messages) ? snapshot.messages : []
    );
    const prev = Array.isArray(state.store.threads[key]) ? state.store.threads[key] : [];
    const next = appendOlder
      ? sanitizeThread(incomingNext.concat(prev))
      : preserveHistory
        ? sanitizeThread(prev.concat(incomingNext))
        : sanitizeThread(incomingNext);
    const same = areThreadMessagesEqualFast(prev, next);
    const remoteUpdatedAt = String(snapshot.updatedAt || "");
    const knownUpdatedAt = String(state.remoteThreadUpdatedAt[key] || "");
    const remoteIsNewer = compareIsoDates(remoteUpdatedAt, knownUpdatedAt) > 0;
    const localChangedDuringRequest = options.localChangedDuringRequest === true;
    const isActiveThread = Number(state.activeClientId) === Number(key);
    const shouldMarkRead = Number(state.activeClientId) === Number(key)
      && !options.skipReadMark
      && isChatTabActiveForRead();
    const wasPinnedToBottom = isActiveThread ? shouldKeepMessagesPinnedToBottom() : false;
    // During live thread updates rely only on current viewport position.
    // Persisted pinned preference is for restore/open, not for auto-scroll on incoming events.
    const preferPinnedBottom = isActiveThread ? wasPinnedToBottom : false;

    if (!same && !options.force) {
      if (hasPendingRemoteSave(key)) return false;
      if (localChangedDuringRequest && !remoteIsNewer) return false;
    }

    state.remoteThreadUpdatedAt[key] = remoteUpdatedAt;
    if (appendOlder || !preserveHistory) {
      updateThreadHistoryFromSnapshot(key, snapshot);
    }
    let hiddenChanged = pruneHiddenMessageIds(key);
    if (same) {
      let changed = markThreadDelivered(key);
      if (shouldMarkRead) {
        const readChanged = markVisibleThreadMessagesRead(key);
        changed = readChanged || changed;
        if (readChanged) emitUnreadChangedSoon();
      }
      const finalChanged = changed || hiddenChanged;
      if (finalChanged) applyClientFilter();
      return finalChanged;
    }

    const appendedIncomingMessageIds = (() => {
      if (appendOlder) return [];
      if (options.ignoreIncomingBadge === true) return [];
      const prevIds = new Set(
        (Array.isArray(prev) ? prev : [])
          .map((msg) => String(msg?.id || ""))
          .filter(Boolean)
      );
      return next
        .filter((msg) => msg && String(msg.direction || "").toLowerCase() === "in")
        .map((msg) => String(msg.id || ""))
        .filter((id) => id && !prevIds.has(id));
    })();

    state.store.threads[key] = next;
    saveStore();
    pruneHiddenMessageIds(key);
    markThreadDelivered(key);
    if (appendedIncomingMessageIds.length > 0) {
      applyPeerTypingState(key, null, { forceInactive: true });
      addPendingScrollMessageIds(key, appendedIncomingMessageIds);
      const appendedIdSet = new Set(appendedIncomingMessageIds);
      const latestIncoming = next
        .slice()
        .reverse()
        .find((msg) => msg && appendedIdSet.has(String(msg.id || "")));
      scheduleUnansweredIncomingNotification({
        clientId: key,
        incomingMessageId: String(latestIncoming?.id || ""),
        title: `Новое сообщение: ${getClientDisplayName(key)}`,
        body: getMessagePreviewText(latestIncoming) || "Откройте чат, чтобы ответить.",
        allowWhenActive: !isActiveThread,
      });
    }

    if (isActiveThread) {
      if (shouldMarkRead) {
        const readChanged = markVisibleThreadMessagesRead(key);
        if (readChanged) emitUnreadChangedSoon();
      }
      const hasIncomingAppended = appendedIncomingMessageIds.length > 0;
      const wrap = dom.center.messagesWrap;
      const shouldAutoScrollIncoming = hasIncomingAppended && preferPinnedBottom && !appendOlder;
      const preserveViewport = hasIncomingAppended && !shouldAutoScrollIncoming && !!wrap;
      let anchorMessageId = "";
      let anchorOffset = 0;
      if (preserveViewport && wrap && dom.center.messages) {
        const wrapRect = wrap.getBoundingClientRect();
        const topEdge = wrapRect.top + 4;
        const candidates = Array.from(
          dom.center.messages.querySelectorAll(".chat-message[data-message-id]")
        );
        const anchorNode = candidates.find((node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom > topEdge;
        }) || null;
        if (anchorNode) {
          anchorMessageId = String(anchorNode.getAttribute("data-message-id") || "");
          anchorOffset = anchorNode.getBoundingClientRect().top - wrapRect.top;
        }
      }
      // Auto-scroll only when operator was already at the bottom in active chat.
      const keepPinned = hasIncomingAppended
        ? shouldAutoScrollIncoming
        : (preferPinnedBottom && !appendOlder);
      renderMessages({
        disableAutoPin: appendOlder || !keepPinned,
        forceScrollBottom: keepPinned,
        smoothScroll: !appendOlder && keepPinned,
        skipPinnedBottomEnforce: hasIncomingAppended && !shouldAutoScrollIncoming,
      });
      if (preserveViewport && wrap) {
        if (anchorMessageId && dom.center.messages) {
          const escapedAnchorId = typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function"
            ? CSS.escape(anchorMessageId)
            : anchorMessageId.replace(/["\\]/g, "\\$&");
          const nextAnchor = dom.center.messages.querySelector(
            `.chat-message[data-message-id="${escapedAnchorId}"]`
          );
          if (nextAnchor) {
            const wrapRect = wrap.getBoundingClientRect();
            const nextOffset = nextAnchor.getBoundingClientRect().top - wrapRect.top;
            const delta = nextOffset - anchorOffset;
            if (Number.isFinite(delta) && Math.abs(delta) > 0.5) {
              wrap.scrollTop = Math.max(0, wrap.scrollTop + delta);
            }
          }
        }
        saveThreadScrollPosition(key);
      }
    }
    applyClientFilter();
    return true;
  }

  async function pushThreadToRemote(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const thread = getThread(key);
    const meta = getClientMetaForSync(key);
    state.remoteSaveInFlight[key] = true;
    try {
      const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: { messages: thread, meta },
      });
      const updatedAt = String(json?.data?.updated_at || "");
      if (updatedAt) state.remoteThreadUpdatedAt[key] = updatedAt;
    } finally {
      delete state.remoteSaveInFlight[key];
    }
  }

  async function deleteRemoteThread(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    delete state.remoteThreadUpdatedAt[key];
  }

  function buildRemoteMessagePayload(message) {
    if (!message || typeof message !== "object") return null;
    const reactions = ensureMessageReactions(message);
    const payload = {
      id: String(message.id || ""),
      direction: String(message.direction || "").toLowerCase() === "out" ? "out" : "in",
      text: String(message.text || ""),
      createdAt: String(message.createdAt || new Date().toISOString()),
      editedAt: String(message.editedAt || ""),
      read: message.read === true,
      pinned: message.pinned === true,
      reaction: String(message.reaction || ""),
      reactions: {
        in: String(reactions.in || ""),
        out: String(reactions.out || ""),
      },
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
            url: String(message.attachment.url || ""),
            width: Number(message.attachment.width || 0),
            height: Number(message.attachment.height || 0),
            size: Number(message.attachment.size || 0),
          }
        : null,
      deliveryStatus: String(message.deliveryStatus || ""),
      deliveredAt: String(message.deliveredAt || ""),
      readAt: String(message.readAt || ""),
    };
    return payload;
  }

  function enqueueRemoteMutation(clientId, mutator) {
    const key = normalizeClientIdKey(clientId);
    if (!key || typeof mutator !== "function") return Promise.resolve();
    const prev = state.remoteMutationQueues[key] || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const result = await mutator();
        return result;
      })
      .catch((err) => {
        console.error(err);
      });
    state.remoteMutationQueues[key] = next;
    return next;
  }

  async function remoteCreateMessage(clientId, message) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const payloadMessage = buildRemoteMessagePayload(message);
    if (!payloadMessage || !payloadMessage.id) return;
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/messages`, {
      method: "POST",
      body: {
        message: payloadMessage,
        meta: getClientMetaForSync(key),
      },
    });
    const updatedAt = String(json?.data?.updated_at || "");
    if (updatedAt) state.remoteThreadUpdatedAt[key] = updatedAt;
  }

  async function remotePatchMessage(clientId, messageId, patch) {
    const key = normalizeClientIdKey(clientId);
    const msgId = String(messageId || "").trim();
    if (!key || !msgId || !patch || typeof patch !== "object") return;
    const json = await apiJson(
      `${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/messages/${encodeURIComponent(msgId)}`,
      {
        method: "PATCH",
        body: {
          patch,
          meta: getClientMetaForSync(key),
        },
      }
    );
    const updatedAt = String(json?.data?.updated_at || "");
    if (updatedAt) state.remoteThreadUpdatedAt[key] = updatedAt;
  }

  async function remoteDeleteMessage(clientId, messageId) {
    const key = normalizeClientIdKey(clientId);
    const msgId = String(messageId || "").trim();
    if (!key || !msgId) return;
    const json = await apiJson(
      `${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/messages/${encodeURIComponent(msgId)}`,
      { method: "DELETE" }
    );
    const updatedAt = String(json?.data?.updated_at || "");
    if (updatedAt) state.remoteThreadUpdatedAt[key] = updatedAt;
  }

  async function remoteMarkMessagesRead(clientId, messageIds = []) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    const json = await apiJson(
      `${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/messages/read`,
      {
        method: "POST",
        body: {
          message_ids: ids,
          meta: getClientMetaForSync(key),
        },
      }
    );
    const updatedAt = String(json?.data?.updated_at || "");
    if (updatedAt) state.remoteThreadUpdatedAt[key] = updatedAt;
  }

  async function uploadChatImageAttachment(clientId, file) {
    const key = normalizeClientIdKey(clientId);
    if (!key || !file) return null;
    const uploadFile = await convertImageFileToWebpForChatUpload(file);
    const fd = new FormData();
    fd.append("client_id", String(key));
    fd.append(
      "file",
      uploadFile,
      String(uploadFile && uploadFile.name || toWebpFileName(file && file.name))
    );
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/attachment`, {
      method: "POST",
      body: fd,
    });
    const attachment = json?.data?.attachment;
    return isImageAttachment(attachment) ? attachment : null;
  }

  async function waitThreadRemoteUpdate(
    clientId,
    sinceUpdatedAt,
    typingSinceUpdatedAt = "",
    timeoutMs = THREAD_SYNC_WAIT_TIMEOUT_MS,
    options = {}
  ) {
    const key = normalizeClientIdKey(clientId);
    if (!key) {
      return {
        changed: false,
        updatedAt: "",
        timeout: true,
        messageChanged: false,
        typingChanged: false,
        typing: null,
      };
    }
    const qs = new URLSearchParams({
      since: String(sinceUpdatedAt || ""),
      typing_since: String(typingSinceUpdatedAt || ""),
      timeout_ms: String(Math.max(1000, Number(timeoutMs || THREAD_SYNC_WAIT_TIMEOUT_MS))),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(key)}/wait?${qs.toString()}`, {
      signal: options.signal,
    });
    const data = json?.data || {};
    return {
      changed: data.changed === true,
      updatedAt: String(data.updated_at || ""),
      timeout: data.timeout === true,
      messageChanged: data.message_changed === true,
      typingChanged: data.typing_changed === true,
      readDirection: String(data.read_direction || ""),
      readMessageIds: Array.isArray(data.read_message_ids)
        ? data.read_message_ids.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
      readAt: String(data.read_at || ""),
      typing: data.typing && typeof data.typing === "object" ? data.typing : null,
    };
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
    const mutationVersionBefore = getThreadMutationVersion(key);
    const limitRaw = Number(options.limit ?? CHAT_THREAD_PAGE_SIZE);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.max(1, Math.min(200, Math.trunc(limitRaw)))
      : CHAT_THREAD_PAGE_SIZE;
    const snapshot = await fetchRemoteThreadSnapshot(key, {
      limit,
    });
    if (!snapshot) return false;
    const localChangedDuringRequest = getThreadMutationVersion(key) !== mutationVersionBefore;
    return applyRemoteThreadSnapshot(snapshot, { ...options, localChangedDuringRequest });
  }

  async function loadOlderMessages(clientId, options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const history = ensureThreadHistoryState(key);
    if (!history || history.loading || history.hasMore !== true) return false;

    history.loading = true;
    const wrap = dom.center.messagesWrap;
    const prevTop = wrap ? wrap.scrollTop : 0;
    const prevHeight = wrap ? wrap.scrollHeight : 0;

    try {
      const snapshot = await fetchRemoteThreadSnapshot(key, {
        limit: CHAT_THREAD_PAGE_SIZE,
        beforeId: history.nextBeforeId,
      });
      if (!snapshot) return false;
      const changed = applyRemoteThreadSnapshot(snapshot, {
        ...options,
        appendOlder: true,
        skipReadMark: true,
        ignoreIncomingBadge: true,
      });

      if (changed && wrap && Number(state.activeClientId) === Number(key)) {
        const nextHeight = wrap.scrollHeight;
        const delta = nextHeight - prevHeight;
        wrap.scrollTop = Math.max(0, prevTop + delta);
        saveThreadScrollPosition(key);
      }
      return changed;
    } finally {
      history.loading = false;
    }
  }

  function applyRemoteThreadDiff(diff, options = {}) {
    if (!diff || !Number.isFinite(Number(diff.clientId))) return null;
    const key = normalizeClientIdKey(diff.clientId);
    if (!key) return null;

    const previousThread = Array.isArray(state.store.threads[key]) ? state.store.threads[key] : [];
    const expectedCount = Number(diff.messageCount);
    if (Number.isFinite(expectedCount) && expectedCount >= 0 && expectedCount < previousThread.length) {
      return null;
    }

    const changedMessages = Array.isArray(diff.messages) ? diff.messages : [];
    if (!changedMessages.length) {
      if (diff.updatedAt) state.remoteThreadUpdatedAt[key] = String(diff.updatedAt);
      return false;
    }

    const byId = new Map();
    previousThread.forEach((msg) => {
      const id = String(msg?.id || "");
      if (!id) return;
      byId.set(id, msg);
    });
    changedMessages.forEach((msg) => {
      if (!msg || typeof msg !== "object") return;
      const id = String(msg.id || "");
      if (!id) return;
      ensureMessageReactions(msg);
      byId.set(id, msg);
    });

    const nextThread = Array.from(byId.values()).sort((a, b) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return ta - tb;
    });

    if (Number.isFinite(expectedCount) && expectedCount >= 0 && expectedCount !== nextThread.length) {
      return null;
    }

    return applyRemoteThreadSnapshot(
      {
        clientId: Number(key),
        updatedAt: String(diff.updatedAt || ""),
        messages: nextThread,
      },
      options
    );
  }

  async function pullThreadFromRemoteIfChanged(clientId, options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const existingInFlight = state.remoteThreadSyncInFlight[key];
    if (existingInFlight) {
      const pending = state.remoteThreadSyncPendingByClient[key] || {};
      if (options.force === true) pending.force = true;
      if (options.signalHint === true) pending.signalHint = true;
      if (options.skipReadMark === true) pending.skipReadMark = true;
      state.remoteThreadSyncPendingByClient[key] = pending;
      return existingInFlight;
    }

    const now = Date.now();
    const lastSyncAt = Number(state.remoteThreadSyncLastAtByClient[key] || 0);
    if (
      options.force !== true
      && lastSyncAt > 0
      && (now - lastSyncAt) < CHAT_THREAD_SYNC_COALESCE_MS
    ) {
      return false;
    }

    const runOptions = { ...options };
    const runPromise = (async () => {
      if (runOptions.force === true) {
        return pullThreadFromRemote(key, {
          ...runOptions,
          preserveHistory: runOptions.signalHint === true ? false : true,
        });
      }

      try {
        const meta = await fetchRemoteThreadMeta(key);
        const remoteUpdatedAt = String(meta?.updatedAt || "");
        const knownUpdatedAt = String(state.remoteThreadUpdatedAt[key] || "");
        const preferSignalDiff = runOptions.signalHint === true;
        if (!preferSignalDiff && remoteUpdatedAt && knownUpdatedAt && remoteUpdatedAt === knownUpdatedAt) {
          return false;
        }
        if (!preferSignalDiff && !remoteUpdatedAt && !knownUpdatedAt) {
          return false;
        }

        if (knownUpdatedAt) {
          const mutationVersionBefore = getThreadMutationVersion(key);
          try {
            const diff = await fetchRemoteThreadDiff(key, knownUpdatedAt);
            if (diff) {
              const localChangedDuringRequest = getThreadMutationVersion(key) !== mutationVersionBefore;
              const applied = applyRemoteThreadDiff(diff, { ...runOptions, localChangedDuringRequest });
              if (applied !== null) {
                if (!(applied === false && runOptions.signalHint === true)) return applied;
              }
            }
          } catch {}
        }

        const nowTs = Date.now();
        const lastFullPullAt = Number(state.fullThreadPullLastAtByClient?.[key] || 0);
        if (
          runOptions.signalHint === true
          && lastFullPullAt > 0
          && (nowTs - lastFullPullAt) < CHAT_FULL_THREAD_PULL_COOLDOWN_MS
        ) {
          return false;
        }
        state.fullThreadPullLastAtByClient[key] = nowTs;
        return pullThreadFromRemote(key, {
          ...runOptions,
          limit: runOptions.signalHint === true
            ? Math.min(
              Number(runOptions.limit || CHAT_THREAD_BACKGROUND_SYNC_LIMIT),
              CHAT_THREAD_BACKGROUND_SYNC_LIMIT
            )
            : runOptions.limit,
          preserveHistory: runOptions.signalHint === true ? false : runOptions.preserveHistory,
        });
      } catch {
        const nowTs = Date.now();
        const lastFullPullAt = Number(state.fullThreadPullLastAtByClient?.[key] || 0);
        if (
          runOptions.signalHint === true
          && lastFullPullAt > 0
          && (nowTs - lastFullPullAt) < CHAT_FULL_THREAD_PULL_COOLDOWN_MS
        ) {
          return false;
        }
        state.fullThreadPullLastAtByClient[key] = nowTs;
        return pullThreadFromRemote(key, {
          ...runOptions,
          limit: runOptions.signalHint === true
            ? Math.min(
              Number(runOptions.limit || CHAT_THREAD_BACKGROUND_SYNC_LIMIT),
              CHAT_THREAD_BACKGROUND_SYNC_LIMIT
            )
            : runOptions.limit,
          preserveHistory: runOptions.signalHint === true ? false : runOptions.preserveHistory,
        });
      }
    })();

    state.remoteThreadSyncInFlight[key] = runPromise;
    return runPromise.finally(() => {
      delete state.remoteThreadSyncInFlight[key];
      state.remoteThreadSyncLastAtByClient[key] = Date.now();
      const pending = state.remoteThreadSyncPendingByClient[key];
      if (!pending) return;
      delete state.remoteThreadSyncPendingByClient[key];
      window.setTimeout(() => {
        pullThreadFromRemoteIfChanged(key, pending).catch(console.error);
      }, 0);
    });
  }

  async function loadRemoteChatClientsPage(options = {}) {
    const limitRaw = Number(options.limit ?? CHAT_CLIENTS_PAGE_SIZE);
    const offsetRaw = Number(options.offset || 0);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.max(1, Math.min(200, Math.trunc(limitRaw)))
      : CHAT_CLIENTS_PAGE_SIZE;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;
    const requestKey = `${limit}:${offset}`;
    const cachedEntry = remoteClientsPageRequests.get(requestKey);
    const now = Date.now();

    if (cachedEntry) {
      if (cachedEntry.value && Number(cachedEntry.expiresAt || 0) > now) {
        return cachedEntry.value;
      }
      if (cachedEntry.promise) {
        return cachedEntry.promise;
      }
      remoteClientsPageRequests.delete(requestKey);
    }

    const qs = new URLSearchParams({
      _ts: String(Date.now()),
      limit: String(limit),
      offset: String(offset),
    });
    const requestPromise = apiJson(`${CHAT_TEMP_API_BASE}/clients?${qs.toString()}`)
      .then((json) => {
        const rows = Array.isArray(json?.data) ? json.data : [];
        const totalRaw = Number(json?.total);
        const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? Math.trunc(totalRaw) : 0;
        const hasMore = json?.has_more === true || (total > 0 && (offset + rows.length) < total);
        const page = {
          rows,
          total,
          limit,
          offset,
          hasMore,
        };
        remoteClientsPageRequests.set(requestKey, {
          value: page,
          expiresAt: Date.now() + CHAT_REMOTE_CLIENTS_PAGE_CACHE_TTL_MS,
        });
        return page;
      })
      .catch((err) => {
        remoteClientsPageRequests.delete(requestKey);
        throw err;
      });

    remoteClientsPageRequests.set(requestKey, { promise: requestPromise });
    return requestPromise;
  }

  function normalizeClientNameIdentity(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u0451/g, "\u0435")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isGuestLikeClientName(value) {
    const normalized = normalizeClientNameIdentity(value);
    if (!normalized) return false;
    return /^\u0433\u043e\u0441\u0442\u044c\b/.test(normalized);
  }

  function mergeRemoteClients(localRows, remoteRows) {
    const merged = new Map();
    (Array.isArray(localRows) ? localRows : []).forEach((row) => {
      const key = normalizeClientIdKey(row?.id);
      if (!key) return;
      merged.set(key, { ...row });
    });

    (Array.isArray(remoteRows) ? remoteRows : []).forEach((remote) => {
      const key = normalizeClientIdKey(remote?.client_id ?? remote?.clientId ?? remote?.id);
      if (!key) return;
      const meta = remote?.meta && typeof remote.meta === "object" ? remote.meta : {};
      const remoteName = String(meta.name || "").trim();
      const remotePhone = String(meta.phone || "").trim();
      const updatedAt = String(
        remote?.updated_at
        || remote?.updatedAt
        || remote?.last_message_at
        || remote?.lastMessageAt
        || ""
      );
      const existing = merged.get(key);
      if (existing) {
        const nextExisting = { ...existing };
        const existingName = String(nextExisting.name || "").trim();
        const existingPhone = String(nextExisting.phone || "").trim();
        const existingPhoneDigits = normalizePhoneDigits(existingPhone);
        const remotePhoneDigits = normalizePhoneDigits(remotePhone);
        const existingNameIsGuest = isGuestLikeClientName(existingName);
        const remoteNameIsGuest = isGuestLikeClientName(remoteName);

        const shouldReplaceName = (
          !!remoteName
          && (
            !existingName
            || (existingNameIsGuest && !remoteNameIsGuest)
            || (
              nextExisting._isVirtualChatClient === true
              && !remoteNameIsGuest
              && normalizeClientNameIdentity(remoteName) !== normalizeClientNameIdentity(existingName)
            )
          )
        );
        if (shouldReplaceName && remoteName !== existingName) {
          nextExisting.name = remoteName;
        }

        const shouldReplacePhone = (
          !!remotePhone
          && (
            !existingPhoneDigits
            || (existingNameIsGuest && !remoteNameIsGuest)
            || (
              nextExisting._isVirtualChatClient === true
              && !!remotePhoneDigits
              && remotePhoneDigits !== existingPhoneDigits
              && !remoteNameIsGuest
            )
          )
        );
        if (shouldReplacePhone && remotePhoneDigits && remotePhoneDigits !== existingPhoneDigits) {
          nextExisting.phone = remotePhone;
        }

        if (updatedAt) {
          const existingUpdatedAt = String(nextExisting.updated_at || "");
          if (!existingUpdatedAt || compareIsoDates(updatedAt, existingUpdatedAt) > 0) {
            nextExisting.updated_at = updatedAt;
            if (!nextExisting.created_at) nextExisting.created_at = updatedAt;
            if (!nextExisting.last_order_date) nextExisting.last_order_date = updatedAt;
          }
        }

        merged.set(key, nextExisting);
        return;
      }

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

  async function applyRemoteSummariesRows(rows, options = {}) {
    const forceThreads = options.forceThreads === true;
    const normalizedRows = Array.isArray(rows) ? rows : [];
    if (!normalizedRows.length) return false;
    const previousUnreadByClient = {};
    const summaryAlerts = [];
    const hadSummaryBaseline = messageAlertSummariesPrimed;
    normalizedRows.forEach((row) => {
      const key = normalizeClientIdKey(row?.client_id ?? row?.clientId ?? row?.id);
      if (!key) return;
      const previousSummary = state.remoteSummariesByClient && state.remoteSummariesByClient[key];
      const prevUnreadRaw = Number(previousSummary?.unread_count ?? previousSummary?.unreadCount ?? 0);
      const prevUnread = Number.isFinite(prevUnreadRaw) && prevUnreadRaw > 0 ? Math.trunc(prevUnreadRaw) : 0;
      previousUnreadByClient[key] = prevUnread;
      if (!state.remoteSummariesByClient || typeof state.remoteSummariesByClient !== "object") {
        state.remoteSummariesByClient = {};
      }
      state.remoteSummariesByClient[key] = row && typeof row === "object" ? { ...row } : {};
    });
    normalizedRows.forEach((row) => {
      const key = normalizeClientIdKey(row?.client_id ?? row?.clientId ?? row?.id);
      if (!key) return;
      if (Number(key) === Number(state.activeClientId)) return;
      const nextUnreadRaw = Number(row?.unread_count ?? row?.unreadCount ?? 0);
      const nextUnread = Number.isFinite(nextUnreadRaw) && nextUnreadRaw > 0 ? Math.trunc(nextUnreadRaw) : 0;
      const prevUnread = Number(previousUnreadByClient[key] || 0);
      const nextLastAt = String(
        row?.last_message_at
        ?? row?.lastMessageAt
        ?? row?.updated_at
        ?? row?.updatedAt
        ?? ""
      ).trim();
      const liveTyping = normalizePeerTypingInfo(state.peerTypingByClient[key]);
      const summaryTypingActive = row?.typing_active === true || row?.typingActive === true;
      const summaryTypingUpdatedAt = String(
        row?.typing_updated_at
        ?? row?.typingUpdatedAt
        ?? ""
      ).trim();
      const summaryTypingExpiresAt = String(
        row?.typing_expires_at
        ?? row?.typingExpiresAt
        ?? ""
      ).trim();
      const shouldDropTypingByExplicitSummaryStop = (
        liveTyping.active
        && !summaryTypingActive
        && !summaryTypingExpiresAt
        && !!summaryTypingUpdatedAt
        && !!String(liveTyping.updatedAt || "").trim()
        && compareIsoDates(summaryTypingUpdatedAt, String(liveTyping.updatedAt || "").trim()) >= 0
      );
      if (shouldDropTypingByExplicitSummaryStop) {
        clearPeerTypingHideTimer(key);
        state.peerTypingByClient[key] = {
          active: false,
          text: "",
          updatedAt: String(liveTyping.updatedAt || ""),
          expiresAt: "",
        };
        updateClientRowPreview(key);
      }
      if (!hadSummaryBaseline || nextUnread <= prevUnread) return;
      summaryAlerts.push({
        clientId: key,
        unread: nextUnread,
        lastMessageId: String(
          row?.last_message_message_id
          ?? row?.lastMessageMessageId
          ?? row?.last_message_id
          ?? row?.lastMessageId
          ?? ""
        ).trim(),
        updatedAt: String(row?.updated_at || row?.updatedAt || row?.last_message_at || row?.lastMessageAt || ""),
        preview: String(row?.last_message_text || row?.lastMessageText || "").replace(/\s+/g, " ").trim(),
      });
    });
    messageAlertSummariesPrimed = true;
    if (summaryAlerts.length > 0) {
      summaryAlerts.sort((a, b) => compareIsoDates(b.updatedAt, a.updatedAt));
      const newestAlert = summaryAlerts[0];
      scheduleUnansweredIncomingNotification({
        clientId: newestAlert.clientId,
        incomingMessageId: String(newestAlert.lastMessageId || ""),
        title: `Новое сообщение: ${getClientDisplayName(newestAlert.clientId)}`,
        body: newestAlert.preview || `Непрочитанных: ${newestAlert.unread}`,
        allowWhenActive: true,
      });
    }
    const latestUpdatedAt = normalizedRows.reduce((latest, row) => {
      const updatedAt = String(
        row?.updated_at
        || row?.updatedAt
        || row?.last_message_at
        || row?.lastMessageAt
        || ""
      );
      if (!updatedAt) return latest;
      if (!latest || compareIsoDates(updatedAt, latest) > 0) return updatedAt;
      return latest;
    }, "");
    if (latestUpdatedAt || state.summariesUpdatedAt) {
      state.summariesUpdatedAt = latestUpdatedAt;
    }
    const changedIds = rows
      .map((row) => ({
        key: normalizeClientIdKey(row?.client_id ?? row?.clientId ?? row?.id),
        updatedAt: String(
          row?.updated_at
          || row?.updatedAt
          || row?.last_message_at
          || row?.lastMessageAt
          || ""
        ),
        summaryFingerprint: buildSummaryFingerprint(row),
      }))
      .filter((row) => row.key)
      .filter((row) => {
        const key = row.key;
        const prevUpdatedAt = String(state.remoteThreadUpdatedAt[key] || "");
        const prevFingerprint = String(state.remoteSummaryFingerprints[key] || "");
        state.remoteSummaryFingerprints[key] = row.summaryFingerprint;
        if (forceThreads && Number(state.activeClientId) === Number(key)) return true;
        return prevUpdatedAt !== row.updatedAt || prevFingerprint !== row.summaryFingerprint;
      })
      .map((row) => row.key);

    if (!changedIds.length) return false;
    applyClientFilter();
    flushPendingMergedClientSelection();
    normalizedRows.forEach((row) => {
      const key = normalizeClientIdKey(row?.client_id ?? row?.clientId ?? row?.id);
      if (!key) return;
      const summaryUpdatedAt = String(row?.updated_at || row?.updatedAt || "");
      if (summaryUpdatedAt) state.remoteThreadUpdatedAt[key] = summaryUpdatedAt;
    });
    let changed = false;
    const activeKey = normalizeClientIdKey(state.activeClientId);
    const idsToPull = changedIds.filter((id) => id && activeKey && Number(id) === Number(activeKey));
    for (const id of idsToPull) {
      // eslint-disable-next-line no-await-in-loop
      const pulled = await pullThreadFromRemote(id, { skipReadMark: Number(state.activeClientId) === Number(id) });
      if (pulled) changed = true;
    }
    return changed || changedIds.length > 0;
  }

  async function pullRemoteSummaries(clientIds, options = {}) {
    const ids = (Array.isArray(clientIds) ? clientIds : [])
      .map((id) => normalizeClientIdKey(id))
      .filter(Boolean);
    if (!ids.length) return false;

    const qs = new URLSearchParams();
    qs.set("client_ids", ids.join(","));
    qs.set("_ts", String(Date.now()));
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/summaries?${qs.toString()}`);
    const rows = Array.isArray(json?.data) ? json.data : [];
    return applyRemoteSummariesRows(rows, options);
  }

  async function waitRemoteSummariesUpdate(
    sinceUpdatedAt,
    sinceRevision = 0,
    timeoutMs = THREAD_SYNC_SUMMARY_WAIT_TIMEOUT_MS,
    options = {}
  ) {
    const qs = new URLSearchParams({
      since: String(sinceUpdatedAt || ""),
      since_revision: String(Math.max(0, Math.trunc(Number(sinceRevision || 0)))),
      timeout_ms: String(Math.max(1000, Number(timeoutMs || THREAD_SYNC_SUMMARY_WAIT_TIMEOUT_MS))),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`${CHAT_TEMP_API_BASE}/summaries/wait?${qs.toString()}`, {
      signal: options.signal,
    });
    return {
      changed: json?.data?.changed === true,
      messageChanged: json?.data?.message_changed === true,
      typingChanged: json?.data?.typing_changed === true,
      clientId: normalizeClientIdKey(json?.data?.client_id),
      removedClientId: normalizeClientIdKey(
        json?.data?.removed_client_id
        ?? json?.data?.removedClientId
        ?? json?.data?.merged_from_client_id
        ?? json?.data?.mergedFromClientId
      ),
      mergedFromClientId: normalizeClientIdKey(
        json?.data?.merged_from_client_id
        ?? json?.data?.mergedFromClientId
      ),
      mergedIntoClientId: normalizeClientIdKey(
        json?.data?.merged_into_client_id
        ?? json?.data?.mergedIntoClientId
      ),
      updatedAt: String(json?.data?.updated_at || ""),
      revision: Number.isFinite(Number(json?.data?.revision))
        ? Math.max(0, Math.trunc(Number(json.data.revision)))
        : 0,
      typing: json?.data?.typing && typeof json?.data?.typing === "object"
        ? json.data.typing
        : null,
      timeout: json?.data?.timeout === true,
    };
  }

  function normalizeSummaryMergeNotice(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const removedClientId = normalizeClientIdKey(
      source.removed_client_id
      ?? source.removedClientId
      ?? source.merged_from_client_id
      ?? source.mergedFromClientId
      ?? source.removedClient
      ?? ""
    );
    const mergedIntoClientId = normalizeClientIdKey(
      source.merged_into_client_id
      ?? source.mergedIntoClientId
      ?? source.to_client_id
      ?? source.toClientId
      ?? ""
    );
    const updatedAt = String(source.updated_at ?? source.updatedAt ?? "").trim();
    if (!removedClientId && !mergedIntoClientId) return null;
    return {
      removedClientId,
      mergedIntoClientId,
      updatedAt,
    };
  }

  function setClientSortBoostUpdatedAt(clientId, updatedAt) {
    const key = normalizeClientIdKey(clientId);
    const nextUpdatedAt = String(updatedAt || "").trim();
    if (!key || !nextUpdatedAt) return false;
    const prevUpdatedAt = String(state.clientSortBoostUpdatedAtByClient[key] || "");
    if (prevUpdatedAt && compareIsoDates(prevUpdatedAt, nextUpdatedAt) >= 0) return false;
    state.clientSortBoostUpdatedAtByClient[key] = nextUpdatedAt;
    const client = findClientById(key);
    if (client) {
      const clientUpdatedAt = String(client.updated_at || "");
      if (!clientUpdatedAt || compareIsoDates(nextUpdatedAt, clientUpdatedAt) > 0) {
        client.updated_at = nextUpdatedAt;
      }
    }
    return true;
  }

  function flushPendingMergedClientSelection() {
    const key = normalizeClientIdKey(state.pendingMergedSelectionClientId);
    if (!key) return false;
    const client = findClientById(key);
    if (!client) return false;
    state.pendingMergedSelectionClientId = "";
    if (Number(state.activeClientId) !== Number(key)) {
      selectClient(key).catch(console.error);
    }
    return true;
  }

  function applyServerMergeNotice(raw) {
    const notice = normalizeSummaryMergeNotice(raw);
    if (!notice) return false;
    let changed = false;
    if (notice.mergedIntoClientId && notice.updatedAt) {
      changed = setClientSortBoostUpdatedAt(notice.mergedIntoClientId, notice.updatedAt) || changed;
    }
    let removedResult = { removed: false, wasActive: false };
    if (notice.removedClientId) {
      removedResult = destroyClientThreadState(notice.removedClientId, { removeClientEntry: true });
      changed = removedResult.removed === true || changed;
    }
    if (removedResult.wasActive && notice.mergedIntoClientId) {
      if (findClientById(notice.mergedIntoClientId)) {
        state.pendingMergedSelectionClientId = "";
        if (Number(state.activeClientId) !== Number(notice.mergedIntoClientId)) {
          selectClient(notice.mergedIntoClientId).catch(console.error);
        }
      } else {
        state.pendingMergedSelectionClientId = notice.mergedIntoClientId;
      }
      changed = true;
    }
    if (changed) applyClientFilter();
    return changed;
  }

  async function syncRemoteSummariesSnapshot(options = {}) {
    if (!isChatWidgetEnabledRuntime()) return false;
    const forceThreads = options.forceThreads === true;
    const now = Date.now();
    if (
      !forceThreads
      && Number(state.summariesLastSyncedAt || 0) > 0
      && (now - Number(state.summariesLastSyncedAt || 0)) < CHAT_SUMMARIES_SYNC_MIN_INTERVAL_MS
    ) {
      return false;
    }

    if (state.summariesSyncInFlight) {
      if (forceThreads) state.summariesSyncPendingForceThreads = true;
      return state.summariesSyncInFlight;
    }

    const runSnapshotOnce = async (runOptions = {}) => {
      const pager = ensureClientsPager();
      const remotePage = await loadRemoteChatClientsPage({
        limit: pager.pageSize || CHAT_CLIENTS_PAGE_SIZE,
        offset: 0,
      }).catch(() => null);
      const remoteClients = Array.isArray(remotePage?.rows) ? remotePage.rows : [];
      let changed = false;
      if (remoteClients.length) {
        const merged = filterOpenChatClients(mergeRemoteClients(state.clients, remoteClients));
        const prevFingerprint = stableSerialize(
          (state.clients || []).map((client) => [Number(client.id), String(client.name || ""), String(client.phone || "")])
        );
        const nextFingerprint = stableSerialize(
          (merged || []).map((client) => [Number(client.id), String(client.name || ""), String(client.phone || "")])
        );
        if (prevFingerprint !== nextFingerprint) {
          state.clients = merged;
          const activeKey = normalizeClientIdKey(state.activeClientId);
          let activeIdentityChanged = false;
          if (activeKey) {
            const activeFromList = merged.find((client) => Number(client?.id) === Number(activeKey)) || null;
            if (activeFromList) {
              const prevActive = state.activeClient && typeof state.activeClient === "object"
                ? state.activeClient
                : {};
              const nextActiveName = String(activeFromList.name || prevActive.name || "");
              const nextActivePhone = String(activeFromList.phone || prevActive.phone || "");
              activeIdentityChanged = (
                normalizeClientNameIdentity(prevActive.name) !== normalizeClientNameIdentity(nextActiveName)
                || normalizePhoneDigits(prevActive.phone) !== normalizePhoneDigits(nextActivePhone)
              );
              state.activeClient = {
                ...prevActive,
                id: Number(activeFromList.id || activeKey),
                name: nextActiveName,
                phone: nextActivePhone,
              };
            }
          }
          applyClientFilter();
          flushPendingMergedClientSelection();
          if (activeIdentityChanged && Number(state.activeClientId) === Number(activeKey)) {
            renderMessages({ disableAutoPin: true, smoothScroll: false, skipSaveScrollPosition: true });
          }
        }
      }

      const appliedFromRemotePage = await applyRemoteSummariesRows(remoteClients, runOptions).catch(console.error);
      if (appliedFromRemotePage) changed = true;

      const remoteClientIdSet = new Set(
        remoteClients
          .map((row) => normalizeClientIdKey(row?.client_id ?? row?.clientId ?? row?.id))
          .filter(Boolean)
      );
      const activeKey = normalizeClientIdKey(state.activeClientId);
      const ids = activeKey && !remoteClientIdSet.has(activeKey) ? [activeKey] : [];
      if (ids.length) {
        const pulled = await pullRemoteSummaries(ids, runOptions).catch((err) => {
          console.error(err);
          return false;
        });
        if (pulled) changed = true;
      }

      return changed;
    };

    state.summariesSyncInFlight = (async () => {
      let changed = false;
      let runForceThreads = forceThreads || state.summariesSyncPendingForceThreads === true;
      state.summariesSyncPendingForceThreads = false;
      do {
        // eslint-disable-next-line no-await-in-loop
        const loopChanged = await runSnapshotOnce({ forceThreads: runForceThreads });
        changed = changed || loopChanged;
        runForceThreads = state.summariesSyncPendingForceThreads === true;
        state.summariesSyncPendingForceThreads = false;
      } while (runForceThreads);
      return changed;
    })();

    try {
      const result = await state.summariesSyncInFlight;
      state.summariesLastSyncedAt = Date.now();
      return result;
    } finally {
      state.summariesSyncInFlight = null;
    }
  }

  function sleepMs(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms || 0))));
  }

  function stopActiveThreadSseConnection() {
    closeChatEventSource(state.activeThreadEventSource);
    state.activeThreadEventSource = null;
    state.activeThreadEventSourceClientId = "";
    if (activeThreadSsePullTimer) {
      window.clearTimeout(activeThreadSsePullTimer);
      activeThreadSsePullTimer = 0;
    }
    activeThreadSsePullPending = false;
    activeThreadSsePullInFlight = false;
  }

  function stopSummariesSseConnection() {
    closeChatEventSource(state.summariesEventSource);
    state.summariesEventSource = null;
    if (state.summariesSsePullTimer) {
      window.clearTimeout(state.summariesSsePullTimer);
      state.summariesSsePullTimer = 0;
    }
    state.summariesSsePullPending = false;
    state.summariesSsePullInFlight = false;
  }

  function scheduleSummariesSsePull(options = {}) {
    const forceThreads = options.forceThreads === true;
    if (forceThreads) state.summariesSyncPendingForceThreads = true;
    state.summariesSsePullPending = true;
    if (state.summariesSsePullTimer) return;

    state.summariesSsePullTimer = window.setTimeout(async () => {
      state.summariesSsePullTimer = 0;
      if (state.summariesSsePullInFlight || state.isRealtimePaused) return;
      state.summariesSsePullInFlight = true;
      state.summariesSsePullPending = false;
      try {
        await syncRemoteSummariesSnapshot({
          forceThreads: state.summariesSyncPendingForceThreads === true,
        });
      } catch (err) {
        console.error(err);
      } finally {
        state.summariesSsePullInFlight = false;
        if (state.summariesSsePullPending) {
          scheduleSummariesSsePull({
            forceThreads: state.summariesSyncPendingForceThreads === true,
          });
        }
      }
    }, SUMMARIES_SSE_PULL_DEBOUNCE_MS);
  }

  function scheduleActiveThreadSsePull(clientId) {
    const activeId = normalizeClientIdKey(clientId);
    if (!activeId) return;
    activeThreadSsePullPending = true;
    if (activeThreadSsePullTimer) return;
    activeThreadSsePullTimer = window.setTimeout(async () => {
      activeThreadSsePullTimer = 0;
      if (activeThreadSsePullInFlight || state.isRealtimePaused) return;
      if (normalizeClientIdKey(state.activeClientId) !== activeId) return;

      activeThreadSsePullInFlight = true;
      activeThreadSsePullPending = false;
      try {
        await pullThreadFromRemoteIfChanged(activeId, {
          skipReadMark: false,
          force: false,
          signalHint: true,
        });
      } catch (err) {
        console.error(err);
      } finally {
        activeThreadSsePullInFlight = false;
        if (activeThreadSsePullPending && normalizeClientIdKey(state.activeClientId) === activeId) {
          scheduleActiveThreadSsePull(activeId);
        }
      }
    }, THREAD_SSE_PULL_DEBOUNCE_MS);
  }

  function ensureActiveThreadSseConnection() {
    if (!ENABLE_ACTIVE_THREAD_SSE) {
      stopActiveThreadSseConnection();
      return false;
    }
    if (!CHAT_SSE_ENABLED || state.isRealtimePaused) return false;
    const activeId = normalizeClientIdKey(state.activeClientId);
    if (!activeId) {
      stopActiveThreadSseConnection();
      return false;
    }
    if (
      state.activeThreadEventSource
      && state.activeThreadEventSourceClientId === activeId
    ) {
      return true;
    }

    stopActiveThreadSseConnection();
    const source = new EventSource(
      buildChatSseUrl(`${CHAT_TEMP_API_BASE}/thread/${encodeURIComponent(activeId)}/stream`, "out")
    );
    state.activeThreadEventSource = source;
    state.activeThreadEventSourceClientId = activeId;

    source.addEventListener("thread", (event) => {
      const payload = parseChatSsePayload(event);
      if (!payload || state.activeThreadEventSource !== source) return;
      if (normalizeClientIdKey(state.activeClientId) !== activeId) return;

      if (payload.typing && typeof payload.typing === "object") {
        applyPeerTypingState(activeId, payload.typing);
      }

      applyImmediateThreadReadPayload(activeId, payload);

      if (payload.changed !== true && payload.message_changed !== true) return;

      const knownUpdatedAt = String(state.remoteThreadUpdatedAt[activeId] || "");
      const messageChanged = payload.message_changed === true
        || (
          payload.changed === true
          && payload.typing_changed !== true
        )
        || (
          payload.changed === true
          && payload.updated_at
          && payload.updated_at !== knownUpdatedAt
        );

      if (messageChanged) scheduleActiveThreadSsePull(activeId);
    });

    source.addEventListener("disabled", () => {
      if (state.activeThreadEventSource !== source) return;
      handleChatFeatureDisabledByServer();
      stopActiveThreadSseConnection();
    });

    source.onerror = () => {
      if (state.activeThreadEventSource !== source) return;
    };

    return true;
  }

  function ensureSummariesSseConnection() {
    if (!CHAT_SSE_ENABLED || state.isRealtimePaused) return false;
    if (state.summariesEventSource) return true;

    const source = new EventSource(
      buildChatSseUrl(`${CHAT_TEMP_API_BASE}/summaries/stream`, "out")
    );
    state.summariesEventSource = source;

    source.addEventListener("summaries", (event) => {
      const payload = parseChatSsePayload(event);
      if (!payload || state.summariesEventSource !== source) return;
      applyServerMergeNotice(payload);

      const nextUpdatedAt = String(payload.updated_at || "");
      const nextRevision = Number.isFinite(Number(payload.revision))
        ? Math.max(0, Math.trunc(Number(payload.revision)))
        : 0;

      const payloadClientId = normalizeClientIdKey(payload.client_id);
      const activeClientId = normalizeClientIdKey(state.activeClientId);
      const typingOnlyChange = payload.typing_changed === true && payload.message_changed !== true;
      if (typingOnlyChange && payloadClientId) {
        if (
          payloadClientId !== activeClientId
          && payload.typing
          && typeof payload.typing === "object"
        ) {
          applyPeerTypingState(payloadClientId, payload.typing);
        }
      }

      if (payload.changed !== false && !typingOnlyChange) {
        const activeId = normalizeClientIdKey(state.activeClientId);
        if (activeId) {
          pullThreadFromRemoteIfChanged(activeId, {
            skipReadMark: false,
            force: false,
            signalHint: true,
          }).catch(console.error);
        }
        // Keep left chat list in sync for non-active clients too:
        // typing preview, last message preview and unread badge.
        scheduleSummariesSsePull({ forceThreads: true });
      }

      if (nextUpdatedAt || state.summariesUpdatedAt) {
        state.summariesUpdatedAt = nextUpdatedAt;
      }
      if (nextRevision || state.summariesRevision) {
        state.summariesRevision = nextRevision;
      }
    });

    source.addEventListener("disabled", () => {
      if (state.summariesEventSource !== source) return;
      handleChatFeatureDisabledByServer();
      stopSummariesSseConnection();
    });

    source.onerror = () => {
      if (state.summariesEventSource !== source) return;
    };

    return true;
  }

  function startRemoteSyncLoops() {
    if (!isChatWidgetEnabledRuntime()) return;
    state.isRealtimePaused = false;

    if (CHAT_SSE_ENABLED) {
      ensureSummariesSseConnection();
      if (ENABLE_ACTIVE_THREAD_SSE) {
        ensureActiveThreadSseConnection();
      } else {
        stopActiveThreadSseConnection();
      }
    }

    if ((!CHAT_SSE_ENABLED || !ENABLE_ACTIVE_THREAD_SSE) && !state.activeThreadWaitLoopStarted) {
      state.activeThreadWaitLoopStarted = true;
      state.activeThreadWaitLoopToken += 1;
      const loopToken = state.activeThreadWaitLoopToken;

      (async function runActiveThreadWaitLoop() {
        while (state.activeThreadWaitLoopStarted && loopToken === state.activeThreadWaitLoopToken) {
          const loopStartedAt = Date.now();
          const activeId = normalizeClientIdKey(state.activeClientId);
          if (!activeId) {
            await sleepMs(THREAD_SYNC_WAIT_RETRY_MS);
            continue;
          }

          try {
            const knownUpdatedAt = String(state.remoteThreadUpdatedAt[activeId] || "");
            const knownTypingUpdatedAt = getPeerTypingUpdatedAt(activeId);
            const waitAbort = new AbortController();
            state.activeThreadWaitAbortController = waitAbort;
            const waited = await waitThreadRemoteUpdate(
              activeId,
              knownUpdatedAt,
              knownTypingUpdatedAt,
              THREAD_SYNC_WAIT_TIMEOUT_MS,
              { signal: waitAbort.signal }
            );
            if (!state.activeThreadWaitLoopStarted || loopToken !== state.activeThreadWaitLoopToken) break;
            if (normalizeClientIdKey(state.activeClientId) !== activeId) continue;

            if (waited?.typing && typeof waited.typing === "object") {
              applyPeerTypingState(activeId, waited.typing);
            }

            applyImmediateThreadReadPayload(activeId, waited);

            const messageChanged = waited?.messageChanged === true
              || (
                waited?.messageChanged !== false
                && waited?.changed === true
                && waited?.typingChanged !== true
              )
              || (waited?.updatedAt && waited.updatedAt !== knownUpdatedAt);

            if (messageChanged) {
              await pullThreadFromRemoteIfChanged(activeId, { skipReadMark: false, force: true }).catch(console.error);
            }
          } catch (err) {
            if (!isAbortError(err)) {
              console.error(err);
            }
            await sleepMs(THREAD_SYNC_WAIT_RETRY_MS);
          } finally {
            state.activeThreadWaitAbortController = null;
            const elapsed = Date.now() - loopStartedAt;
            if (elapsed < THREAD_SYNC_LOOP_MIN_INTERVAL_MS) {
              await sleepMs(THREAD_SYNC_LOOP_MIN_INTERVAL_MS - elapsed);
            }
          }
        }
      })().catch(console.error);
    }

    if (!CHAT_SSE_ENABLED && !state.summariesWaitLoopStarted) {
      state.summariesWaitLoopStarted = true;
      state.summariesWaitLoopToken += 1;
      const summariesLoopToken = state.summariesWaitLoopToken;

      (async function runSummariesWaitLoop() {
        while (state.summariesWaitLoopStarted && summariesLoopToken === state.summariesWaitLoopToken) {
          const loopStartedAt = Date.now();
          try {
            const knownUpdatedAt = String(state.summariesUpdatedAt || "");
            const knownRevision = Number(state.summariesRevision || 0);
            const waitAbort = new AbortController();
            state.summariesWaitAbortController = waitAbort;
            const waited = await waitRemoteSummariesUpdate(
              knownUpdatedAt,
              knownRevision,
              THREAD_SYNC_SUMMARY_WAIT_TIMEOUT_MS,
              { signal: waitAbort.signal }
            );
            if (!state.summariesWaitLoopStarted || summariesLoopToken !== state.summariesWaitLoopToken) break;
            applyServerMergeNotice(waited);
            const nextUpdatedAt = String(waited?.updatedAt || "");
            const nextRevision = Number.isFinite(Number(waited?.revision))
              ? Math.max(0, Math.trunc(Number(waited.revision)))
              : 0;
            const waitedClientId = normalizeClientIdKey(waited?.clientId);
            const activeClientId = normalizeClientIdKey(state.activeClientId);
            const typingOnlyChange = waited?.typingChanged === true && waited?.messageChanged !== true;
            if (typingOnlyChange && waitedClientId) {
              if (
                waitedClientId !== activeClientId
                && waited?.typing
                && typeof waited.typing === "object"
              ) {
                applyPeerTypingState(waitedClientId, waited.typing);
              }
            } else {
              // Pull summaries when messages changed or when reason is unknown.
              await syncRemoteSummariesSnapshot({ forceThreads: waited?.timeout !== true }).catch(console.error);
            }
            if (nextUpdatedAt || state.summariesUpdatedAt) {
              state.summariesUpdatedAt = nextUpdatedAt;
            }
            if (nextRevision || state.summariesRevision) {
              state.summariesRevision = nextRevision;
            }
          } catch (err) {
            if (!isAbortError(err)) {
              console.error(err);
            }
            await sleepMs(THREAD_SYNC_WAIT_RETRY_MS);
          } finally {
            state.summariesWaitAbortController = null;
            const elapsed = Date.now() - loopStartedAt;
            if (elapsed < THREAD_SYNC_LOOP_MIN_INTERVAL_MS) {
              await sleepMs(THREAD_SYNC_LOOP_MIN_INTERVAL_MS - elapsed);
            }
          }
        }
      })().catch(console.error);
    }

    if (!CHAT_SSE_ENABLED && !state.summariesPollTimer) {
      state.summariesPollTimer = window.setInterval(async () => {
        try {
          await syncRemoteSummariesSnapshot();
        } catch (err) {
          console.error(err);
        }
      }, THREAD_SYNC_SUMMARY_POLL_MS);
    }
  }

  function stopRemoteSyncLoops() {
    state.isRealtimePaused = true;
    state.activeThreadWaitLoopStarted = false;
    state.activeThreadWaitLoopToken += 1;
    state.summariesWaitLoopStarted = false;
    state.summariesWaitLoopToken += 1;
    stopActiveThreadSseConnection();
    stopSummariesSseConnection();

    if (state.activeThreadWaitAbortController) {
      try { state.activeThreadWaitAbortController.abort(); } catch {}
      state.activeThreadWaitAbortController = null;
    }
    if (state.summariesWaitAbortController) {
      try { state.summariesWaitAbortController.abort(); } catch {}
      state.summariesWaitAbortController = null;
    }
    if (state.summariesSsePullTimer) {
      window.clearTimeout(state.summariesSsePullTimer);
      state.summariesSsePullTimer = 0;
    }
    state.summariesSsePullPending = false;
    state.summariesSsePullInFlight = false;

    if (state.summariesPollTimer) {
      window.clearInterval(state.summariesPollTimer);
      state.summariesPollTimer = 0;
    }
  }

  function pauseRealtimeSync(options = {}) {
    stopRemoteSyncLoops();
    stopActiveOrdersPollTimer();

    Object.keys(state.remoteSaveTimers || {}).forEach((key) => {
      const timerId = Number(state.remoteSaveTimers[key] || 0);
      if (timerId) window.clearTimeout(timerId);
      delete state.remoteSaveTimers[key];
    });

    if (webPushSyncTimer) {
      window.clearTimeout(webPushSyncTimer);
      webPushSyncTimer = 0;
    }

    if (options.keepTyping !== true) {
      stopLocalTypingSession(state.activeClientId, {
        flush: options.flushTyping !== false,
        keepalive: options.keepalive === true,
        force: options.forceTypingStop === true,
      });
    }
  }

  function resumeRealtimeSync() {
    if (!isChatWidgetEnabledRuntime()) return;
    startRemoteSyncLoops();
    ensureActiveOrdersPollTimer();
  }

  function loadStore() {
    try {
      const defaults = {
        threads: {},
        hiddenMessageIds: {},
        lastOpenClientId: null,
        clientsCache: [],
        clientsCacheUpdatedAt: 0,
        ui: {
          clientsListScrollTop: 0,
          threadScrollTopByClient: {},
          threadPinnedBottomByClient: {},
          composerDraftByClient: {},
        },
      };
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const parsedUi = parsed && typeof parsed.ui === "object" ? parsed.ui : {};
      const legacyThreadScrollMap = parsed && typeof parsed.threadScrollTopByClient === "object"
        ? parsed.threadScrollTopByClient
        : {};
      const uiThreadScrollMap = parsedUi && typeof parsedUi.threadScrollTopByClient === "object"
        ? parsedUi.threadScrollTopByClient
        : {};
      const uiThreadPinnedBottomMap = parsedUi && typeof parsedUi.threadPinnedBottomByClient === "object"
        ? parsedUi.threadPinnedBottomByClient
        : {};
      const uiComposerDraftMap = parsedUi && typeof parsedUi.composerDraftByClient === "object"
        ? parsedUi.composerDraftByClient
        : {};
      const resolvedThreadScrollMap = Object.keys(uiThreadScrollMap).length
        ? uiThreadScrollMap
        : legacyThreadScrollMap;
      const nextStore = {
        threads: parsed && typeof parsed.threads === "object" ? parsed.threads : {},
        hiddenMessageIds: parsed && typeof parsed.hiddenMessageIds === "object" ? parsed.hiddenMessageIds : {},
        lastOpenClientId: Number(parsed?.lastOpenClientId || 0) || null,
        clientsCache: Array.isArray(parsed?.clientsCache) ? parsed.clientsCache : [],
        clientsCacheUpdatedAt: Number.isFinite(Number(parsed?.clientsCacheUpdatedAt))
          ? Math.max(0, Math.trunc(Number(parsed.clientsCacheUpdatedAt)))
          : 0,
        ui: {
          clientsListScrollTop: toStoredScrollTop(parsedUi?.clientsListScrollTop),
          threadScrollTopByClient: sanitizeStoredThreadScrollTopByClient(resolvedThreadScrollMap),
          threadPinnedBottomByClient: sanitizeStoredThreadPinnedBottomByClient(uiThreadPinnedBottomMap),
          composerDraftByClient: sanitizeStoredComposerDraftByClient(uiComposerDraftMap),
        },
      };
      let changed = false;
      TEST_CHAT_IDS_TO_PRUNE.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(nextStore.threads, id)) {
          delete nextStore.threads[id];
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextStore.hiddenMessageIds, id)) {
          delete nextStore.hiddenMessageIds[id];
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextStore.ui.threadScrollTopByClient, id)) {
          delete nextStore.ui.threadScrollTopByClient[id];
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(nextStore.ui.composerDraftByClient, id)) {
          delete nextStore.ui.composerDraftByClient[id];
          changed = true;
        }
      });
      Object.keys(nextStore.threads || {}).forEach((clientId) => {
        const thread = Array.isArray(nextStore.threads[clientId]) ? nextStore.threads[clientId] : [];
        const nextThread = thread.filter((message) => !isLegacyClientOrderSeedMessageId(message?.id));
        if (nextThread.length !== thread.length) {
          nextStore.threads[clientId] = nextThread;
          changed = true;
        }
      });
      Object.keys(nextStore.hiddenMessageIds || {}).forEach((clientId) => {
        const hiddenList = Array.isArray(nextStore.hiddenMessageIds[clientId]) ? nextStore.hiddenMessageIds[clientId] : [];
        const nextHiddenList = hiddenList.filter((messageId) => !isLegacyClientOrderSeedMessageId(messageId));
        if (nextHiddenList.length !== hiddenList.length) {
          nextStore.hiddenMessageIds[clientId] = nextHiddenList;
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(nextStore));
      }
      return nextStore;
    } catch {
      return {
        threads: {},
        hiddenMessageIds: {},
        lastOpenClientId: null,
        clientsCache: [],
        clientsCacheUpdatedAt: 0,
        ui: {
          clientsListScrollTop: 0,
          threadScrollTopByClient: {},
          threadPinnedBottomByClient: {},
          composerDraftByClient: {},
        },
      };
    }
  }

  function toStoredScrollTop(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function sanitizeStoredThreadScrollTopByClient(rawMap) {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const out = {};
    Object.keys(source).forEach((key) => {
      const id = normalizeClientIdKey(key);
      if (!id) return;
      const top = toStoredScrollTop(source[key]);
      out[id] = top;
    });
    return out;
  }

  function sanitizeStoredThreadPinnedBottomByClient(rawMap) {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const out = {};
    Object.keys(source).forEach((key) => {
      const id = normalizeClientIdKey(key);
      if (!id) return;
      out[id] = source[key] === true;
    });
    return out;
  }

  function normalizeComposerDraftValue(value) {
    const raw = String(value ?? "").replace(/\r/g, "");
    if (!raw) return "";
    return raw.slice(0, CHAT_COMPOSER_DRAFT_MAX_LENGTH);
  }

  function sanitizeStoredComposerDraftByClient(rawMap) {
    const source = rawMap && typeof rawMap === "object" ? rawMap : {};
    const out = {};
    Object.keys(source).forEach((key) => {
      const id = normalizeClientIdKey(key);
      if (!id) return;
      const value = normalizeComposerDraftValue(source[key]);
      if (!value) return;
      out[id] = value;
    });
    return out;
  }

  function ensureUiStoreState() {
    if (!state.store || typeof state.store !== "object") {
      state.store = {
        threads: {},
        hiddenMessageIds: {},
        lastOpenClientId: null,
      };
    }
    if (!state.store.ui || typeof state.store.ui !== "object") {
      state.store.ui = {};
    }
    if (!state.store.ui.threadScrollTopByClient || typeof state.store.ui.threadScrollTopByClient !== "object") {
      state.store.ui.threadScrollTopByClient = {};
    }
    if (!state.store.ui.threadPinnedBottomByClient || typeof state.store.ui.threadPinnedBottomByClient !== "object") {
      state.store.ui.threadPinnedBottomByClient = {};
    }
    if (!state.store.ui.composerDraftByClient || typeof state.store.ui.composerDraftByClient !== "object") {
      state.store.ui.composerDraftByClient = {};
    }
    if (!Number.isFinite(Number(state.store.ui.clientsListScrollTop))) {
      state.store.ui.clientsListScrollTop = 0;
    }
    return state.store.ui;
  }

  function persistComposerDraftForClient(clientId = state.activeClientId, rawValue) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return "";
    const ui = ensureUiStoreState();
    const nextValue = normalizeComposerDraftValue(
      rawValue !== undefined
        ? rawValue
        : (dom.center.input && typeof dom.center.input.value === "string" ? dom.center.input.value : "")
    );
    const prevValue = normalizeComposerDraftValue(ui.composerDraftByClient[key]);
    if (nextValue === prevValue) return nextValue;
    if (nextValue) ui.composerDraftByClient[key] = nextValue;
    else delete ui.composerDraftByClient[key];
    scheduleUiStatePersist();
    updateClientRowPreview(key);
    return nextValue;
  }

  function restoreComposerDraftForClient(clientId = state.activeClientId, options = {}) {
    if (!dom.center.input) return "";
    const key = normalizeClientIdKey(clientId);
    const draft = key
      ? normalizeComposerDraftValue(state.store?.ui?.composerDraftByClient?.[key])
      : "";
    if (dom.center.input.value !== draft) {
      dom.center.input.value = draft;
    }
    const syncOptions = options && typeof options === "object" ? options : {};
    syncComposerRichPreview(syncOptions);
    if (key) updateClientRowPreview(key);
    return draft;
  }

  function clearComposerDraftForClient(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const ui = ensureUiStoreState();
    if (!Object.prototype.hasOwnProperty.call(ui.composerDraftByClient, key)) return;
    delete ui.composerDraftByClient[key];
    scheduleUiStatePersist();
    updateClientRowPreview(key);
  }

  function saveClientsListScrollPosition() {
    if (!dom.left.list) return;
    const ui = ensureUiStoreState();
    ui.clientsListScrollTop = toStoredScrollTop(dom.left.list.scrollTop);
    scheduleUiStatePersist();
  }

  function restoreClientsListScrollPosition(options = {}) {
    if (!dom.left.list) return false;
    const apply = () => {
      if (!dom.left.list) return false;
      const targetTop = toStoredScrollTop(state.store?.ui?.clientsListScrollTop);
      const maxTop = Math.max(0, dom.left.list.scrollHeight - dom.left.list.clientHeight);
      dom.left.list.scrollTop = Math.max(0, Math.min(targetTop, maxTop));
      return true;
    };
    if (options.defer === true) {
      const schedule = typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (cb) => window.setTimeout(cb, 16);
      schedule(() => {
        schedule(() => {
          apply();
        });
      });
      return true;
    }
    return apply();
  }

  function syncUiStateIntoStore() {
    const ui = ensureUiStoreState();
    ui.threadScrollTopByClient = sanitizeStoredThreadScrollTopByClient(state.threadScrollTopByClient);
    ui.threadPinnedBottomByClient = sanitizeStoredThreadPinnedBottomByClient(state.threadPinnedBottomByClient);
    if (dom.left.list) {
      ui.clientsListScrollTop = toStoredScrollTop(dom.left.list.scrollTop);
    } else {
      ui.clientsListScrollTop = toStoredScrollTop(ui.clientsListScrollTop);
    }
  }

  function saveStore() {
    try {
      syncUiStateIntoStore();
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state.store));
    } catch {}
  }

  function scheduleUiStatePersist(delayMs = 220) {
    const delay = Math.max(0, Number(delayMs) || 0);
    if (uiStatePersistTimer) {
      window.clearTimeout(uiStatePersistTimer);
      uiStatePersistTimer = 0;
    }
    uiStatePersistTimer = window.setTimeout(() => {
      uiStatePersistTimer = 0;
      saveStore();
    }, delay);
  }

  function flushUiStatePersist() {
    if (uiStatePersistTimer) {
      window.clearTimeout(uiStatePersistTimer);
      uiStatePersistTimer = 0;
    }
    saveStore();
  }

  function ensureThread(clientId) {
    const key = String(clientId);
    if (!Array.isArray(state.store.threads[key])) state.store.threads[key] = [];
    state.store.threads[key].forEach((message) => {
      ensureMessageReactions(message);
    });
    return state.store.threads[key];
  }

  function getThread(clientId) { return clientId ? ensureThread(clientId) : []; }

  function isLegacyClientOrderSeedMessageId(messageId) {
    const id = String(messageId || "").trim();
    if (!id) return false;
    return /^seed-\d+$/.test(id);
  }

  function isAssistantOrSystemThreadMessageId(messageId) {
    const id = String(messageId || "").trim();
    if (!id) return false;
    if (id.indexOf("assistant-auto-") === 0) return true;
    if (/^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
    if (/^daily-welcome-options-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
    return false;
  }

  function sanitizeThread(messages) {
    const list = Array.isArray(messages) ? messages : [];
    const out = [];
    const indexById = new Map();

    list.forEach((message) => {
      if (!message || typeof message !== "object") return;
      const id = String(message.id || "").trim();
      if (!id) return;

      ensureMessageReactions(message);
      message.direction = isAssistantOrSystemThreadMessageId(id)
        ? "out"
        : (String(message.direction || "").toLowerCase() === "out" ? "out" : "in");
      if (!message.createdAt) message.createdAt = new Date().toISOString();

      if (indexById.has(id)) {
        out[indexById.get(id)] = message;
        return;
      }
      indexById.set(id, out.length);
      out.push(message);
    });

    out.sort((a, b) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      const ia = String(a?.id || "");
      const ib = String(b?.id || "");
      if (ia === ib) return 0;
      return ia < ib ? -1 : 1;
    });

    return out;
  }

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

  function getRemoteSummaryForClient(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const summary = state.remoteSummariesByClient && state.remoteSummariesByClient[key];
    return summary && typeof summary === "object" ? summary : null;
  }

  function getLastMessage(clientId) {
    const thread = getVisibleThread(clientId);
    const localLast = thread.length ? thread[thread.length - 1] : null;
    const summary = getRemoteSummaryForClient(clientId);
    if (!summary) return localLast;
    const text = String(summary.last_message_text || "");
    const createdAt = String(summary.last_message_at || summary.updated_at || "");
    if (!text && !createdAt) return localLast;
    const summaryLast = {
      id: "",
      text: text,
      createdAt: createdAt,
      direction: "in",
      deliveryStatus: "",
      attachment: null,
    };
    if (!localLast) return summaryLast;
    return compareIsoDates(summaryLast.createdAt, localLast.createdAt) > 0 ? summaryLast : localLast;
  }

  function getClientTypingPreviewText(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return "";

    const summary = getRemoteSummaryForClient(key);
    const summaryLastAt = String(
      summary?.last_message_at
      ?? summary?.lastMessageAt
      ?? ""
    );
    const shouldSuppressTyping = (typingUpdatedAt) => {
      const typingAt = String(typingUpdatedAt || "").trim();
      if (!typingAt || !summaryLastAt) return false;
      return compareIsoDates(summaryLastAt, typingAt) >= 0;
    };

    const liveInfo = normalizePeerTypingInfo(state.peerTypingByClient[key]);
    if (isPeerTypingInfoActiveNow(liveInfo)) {
      return String(liveInfo.text || "").trim();
    }

    const summaryInfo = normalizePeerTypingInfo({
      active: summary?.typing_active === true || summary?.typingActive === true,
      text: String(summary?.typing_text ?? summary?.typingText ?? ""),
      updated_at: String(summary?.typing_updated_at ?? summary?.typingUpdatedAt ?? ""),
      expires_at: String(summary?.typing_expires_at ?? summary?.typingExpiresAt ?? ""),
    });
    if (!isPeerTypingInfoActiveNow(summaryInfo)) return "";
    if (shouldSuppressTyping(summaryInfo.updatedAt)) return "";
    return String(summaryInfo.text || "").trim();
  }

  function getClientDraftPreviewText(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return "";
    if (key === normalizeClientIdKey(state.activeClientId)) return "";
    return normalizeComposerDraftValue(state.store?.ui?.composerDraftByClient?.[key]);
  }

  function getClientPreviewState(clientId) {
    const draftPreview = getClientDraftPreviewText(clientId);
    if (draftPreview) {
      return { text: draftPreview, isDraft: true, isTyping: false };
    }
    const typingPreview = getClientTypingPreviewText(clientId);
    if (typingPreview) {
      return { text: typingPreview, isDraft: false, isTyping: true };
    }
    const lastMsg = getLastMessage(clientId);
    return {
      text: getMessagePreviewText(lastMsg) || "Нет сообщений",
      isDraft: false,
      isTyping: false,
    };
  }

  function renderClientPreview(previewEl, previewState) {
    if (!previewEl) return;
    const stateValue = previewState && typeof previewState === "object"
      ? previewState
      : { text: "", isDraft: false, isTyping: false };
    const previewText = String(stateValue.text || "");
    previewEl.textContent = "";
    previewEl.classList.toggle("is-typing", stateValue.isTyping === true);
    previewEl.classList.toggle("is-draft", stateValue.isDraft === true);

    if (stateValue.isDraft === true) {
      const labelEl = document.createElement("span");
      labelEl.className = "chat-client-preview-draft-label";
      labelEl.textContent = "Черновик:";
      const textEl = document.createElement("span");
      textEl.className = "chat-client-preview-draft-text";
      if (hasEmojiInText(previewText)) {
        renderEmojiMessageText(textEl, previewText, "chat-emoji-glyph chat-emoji-glyph--preview");
      } else {
        textEl.textContent = previewText;
      }
      previewEl.appendChild(labelEl);
      previewEl.appendChild(document.createTextNode(" "));
      previewEl.appendChild(textEl);
      return;
    }

    if (hasEmojiInText(previewText)) {
      renderEmojiMessageText(previewEl, previewText, "chat-emoji-glyph chat-emoji-glyph--preview");
      return;
    }
    previewEl.textContent = previewText;
  }



  function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
      return CSS.escape(String(value || ""));
    }
    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  function getClientPreviewText(clientId) {
    const typingPreview = getClientTypingPreviewText(clientId);
    if (typingPreview) return typingPreview;
    const lastMsg = getLastMessage(clientId);
    return getMessagePreviewText(lastMsg) || "Нет сообщений";
  }

  function updateClientRowPreview(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key || !dom.left.list) return;
    const selectorId = (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function")
      ? CSS.escape(String(key))
      : String(key).replace(/["\\]/g, "\\$&");
    const row = dom.left.list.querySelector(`.chat-client-row[data-client-id="${selectorId}"]`);
    if (!row) return;
    const client = (state.filteredClients || []).find((item) => Number(item?.id) === Number(key))
      || (state.clients || []).find((item) => Number(item?.id) === Number(key))
      || null;
    if (client) {
      row.replaceWith(buildChatClientRow(client));
      return;
    }
    const previewEl = $(".chat-client-preview", row);
    if (!previewEl) return;
    renderClientPreview(previewEl, getClientPreviewState(key));
  }

  function collectUnansweredIncomingIds(thread) {
    const list = Array.isArray(thread) ? thread : [];
    const unresolved = [];
    let pendingBotReplies = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const msg = list[i];
      if (!msg) continue;
      const direction = String(msg.direction || "").toLowerCase();
      if (direction === "out") {
        if (isAssistantOrSystemThreadMessageId(msg.id)) pendingBotReplies += 1;
        continue;
      }
      if (direction !== "in") continue;
      if (pendingBotReplies > 0) {
        pendingBotReplies -= 1;
        continue;
      }
      const id = String(msg.id || "").trim();
      if (id) unresolved.push(id);
    }
    return unresolved;
  }

  function countUnansweredClientMessages(clientId) {
    return collectUnansweredIncomingIds(getVisibleThread(clientId)).length;
  }

  function getUnreadCount(clientId) {
    const key = normalizeClientIdKey(clientId);
    const summary = getRemoteSummaryForClient(clientId);
    const hasLocalThread = !!(key && Array.isArray(state.store?.threads?.[key]));
    if (hasLocalThread && Number(state.activeClientId) === Number(key)) {
      const localUnread = getVisibleThread(key).filter((msg) => msg && msg.direction === "in" && !isMessageRead(msg)).length;
      const visibleUnread = collectVisibleIncomingUnreadMessageIds(key).length;
      return Math.max(0, localUnread - visibleUnread);
    }
    const unread = Number(summary?.unread_count ?? summary?.unreadCount ?? 0);
    if (Number.isFinite(unread) && unread >= 0) return Math.trunc(unread);
    if (hasLocalThread) {
      return getVisibleThread(key).filter((msg) => msg && msg.direction === "in" && !isMessageRead(msg)).length;
    }
    return 0;
  }

  function setRemoteSummaryUnreadCount(clientId, nextUnreadCount) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    if (!state.remoteSummariesByClient || typeof state.remoteSummariesByClient !== "object") return false;
    const summary = state.remoteSummariesByClient[key];
    if (!summary || typeof summary !== "object") return false;
    const unreadRaw = Number(nextUnreadCount);
    const unread = Number.isFinite(unreadRaw) && unreadRaw > 0 ? Math.trunc(unreadRaw) : 0;
    const currentRaw = Number(summary.unread_count ?? summary.unreadCount ?? 0);
    const currentUnread = Number.isFinite(currentRaw) && currentRaw > 0 ? Math.trunc(currentRaw) : 0;
    if (currentUnread === unread) return false;
    const nextSummary = {
      ...summary,
      unread_count: unread,
      unreadCount: unread,
    };
    state.remoteSummariesByClient[key] = nextSummary;
    state.remoteSummaryFingerprints[key] = buildSummaryFingerprint(nextSummary);
    return true;
  }

  function clearRemoteSummaryUnreadCount(clientId) {
    return setRemoteSummaryUnreadCount(clientId, 0);
  }

  function syncRemoteSummaryPreviewFromLocalThread(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    if (!state.remoteSummariesByClient || typeof state.remoteSummariesByClient !== "object") {
      state.remoteSummariesByClient = {};
    }

    const current = state.remoteSummariesByClient[key];
    const base = current && typeof current === "object"
      ? { ...current }
      : { client_id: Number(key), clientId: Number(key) };

    const thread = getVisibleThread(key);
    const lastMsg = Array.isArray(thread) && thread.length ? thread[thread.length - 1] : null;
    const nextText = lastMsg ? String(getMessagePreviewText(lastMsg) || "").trim() : "";
    const nextAt = lastMsg ? String(lastMsg.createdAt || "") : "";

    base.last_message_text = nextText;
    base.lastMessageText = nextText;
    base.last_message_at = nextAt;
    base.lastMessageAt = nextAt;
    state.remoteSummariesByClient[key] = base;
    state.remoteSummaryFingerprints[key] = buildSummaryFingerprint(base);
    return true;
  }

  function getTotalUnreadCount() {
    const keys = new Set();
    Object.keys(state.store.threads || {}).forEach((key) => {
      const normalized = normalizeClientIdKey(key);
      if (normalized) keys.add(normalized);
    });
    (state.clients || []).forEach((client) => {
      const normalized = normalizeClientIdKey(client?.id);
      if (normalized) keys.add(normalized);
    });
    Object.keys(state.remoteSummariesByClient || {}).forEach((key) => {
      const normalized = normalizeClientIdKey(key);
      if (normalized) keys.add(normalized);
    });

    let total = 0;
    keys.forEach((key) => {
      total += getUnreadCount(key);
    });
    return total;
  }

  function getTotalUnreadChatsCount() {
    const keys = new Set();
    Object.keys(state.store.threads || {}).forEach((key) => {
      const normalized = normalizeClientIdKey(key);
      if (normalized) keys.add(normalized);
    });
    (state.clients || []).forEach((client) => {
      const normalized = normalizeClientIdKey(client?.id);
      if (normalized) keys.add(normalized);
    });
    Object.keys(state.remoteSummariesByClient || {}).forEach((key) => {
      const normalized = normalizeClientIdKey(key);
      if (normalized) keys.add(normalized);
    });

    let total = 0;
    keys.forEach((key) => {
      if (getUnreadCount(key) > 0) total += 1;
    });
    return total;
  }

  function emitUnreadChangedSoon() {
    if (unreadEventRaf) return;
    const schedule = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb) => window.setTimeout(cb, 16);
    unreadEventRaf = schedule(() => {
      unreadEventRaf = 0;
      const totalUnread = getTotalUnreadCount();
      const totalUnreadChats = getTotalUnreadChatsCount();
      document.dispatchEvent(
        new CustomEvent(CHAT_UNREAD_EVENT, {
          detail: { totalUnread, totalUnreadChats },
        })
      );
    });
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

  function isChatTabActiveForRead() {
    if (typeof document === "undefined") return true;
    if (document.visibilityState && document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return true;
  }

  function getClientDisplayName(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return "Клиент";
    const fromList = (state.clients || []).find((client) => Number(client?.id) === Number(key));
    if (fromList && String(fromList.name || "").trim()) return String(fromList.name || "").trim();
    if (state.activeClient && Number(state.activeClient.id) === Number(key)) {
      const activeName = String(state.activeClient.name || "").trim();
      if (activeName) return activeName;
    }
    return `Клиент #${key}`;
  }

  function ensureMessageAlertAudioContext() {
    if (messageAlertAudioCtx) return messageAlertAudioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      messageAlertAudioCtx = new Ctx();
    } catch {
      messageAlertAudioCtx = null;
    }
    return messageAlertAudioCtx;
  }

  function getTenantMessageSoundUrl() {
    try {
      const raw = localStorage.getItem("tenant");
      if (!raw) return "";
      const tenant = JSON.parse(raw);
      const url = String(tenant && tenant.sound_new_message_url || "").trim();
      return url || "";
    } catch {
      return "";
    }
  }

  function requestMessageAlertNotificationPermission() {
    if (!CHAT_BROWSER_ALERTS_ENABLED) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try {
      const result = Notification.requestPermission();
      if (result && typeof result.then === "function") {
        result.catch(() => {});
      }
    } catch {}
  }

  function unlockMessageAlertsOnce() {
    if (!CHAT_BROWSER_ALERTS_ENABLED) {
      disableWebPushSubscription().catch(() => {});
      return;
    }
    const soundUrl = getTenantMessageSoundUrl();
    if (soundUrl) {
      try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.001;
        const unlockPromise = audio.play();
        if (unlockPromise && typeof unlockPromise.then === "function") {
          unlockPromise
            .then(() => {
              messageAlertAudioUnlocked = true;
              try {
                audio.pause();
                audio.currentTime = 0;
              } catch {}
            })
            .catch(() => {});
        }
      } catch {}
    }
    const ctx = ensureMessageAlertAudioContext();
    if (ctx) {
      if (ctx.state === "running") {
        messageAlertAudioUnlocked = true;
      } else {
        ctx.resume()
          .then(() => { messageAlertAudioUnlocked = true; })
          .catch(() => {});
      }
    }
    requestMessageAlertNotificationPermission();
    queueWebPushSubscriptionSync({
      requestPermission: true,
      immediate: true,
    });
  }

  function playFallbackMessageAlertTone() {
    const ctx = ensureMessageAlertAudioContext();
    if (!ctx || !messageAlertAudioUnlocked) return;
    if (ctx.state !== "running") return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(920, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {}
  }

  function playMessageAlertSound() {
    const soundUrl = getTenantMessageSoundUrl();
    if (soundUrl) {
      try {
        const audio = new Audio(soundUrl);
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            playFallbackMessageAlertTone();
          });
        }
        return;
      } catch {}
    }
    playFallbackMessageAlertTone();
  }

  function playOutgoingMessageSendTone() {
    const ctx = ensureMessageAlertAudioContext();
    if (!ctx) return;

    const scheduleTone = () => {
      try {
        const startAt = ctx.currentTime + 0.002;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, startAt);
        master.gain.exponentialRampToValueAtTime(0.095, startAt + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.17);
        master.connect(ctx.destination);

        const oscA = ctx.createOscillator();
        const gainA = ctx.createGain();
        oscA.type = "triangle";
        oscA.frequency.setValueAtTime(1320, startAt);
        oscA.frequency.exponentialRampToValueAtTime(1680, startAt + 0.08);
        gainA.gain.setValueAtTime(1, startAt);
        gainA.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.11);
        oscA.connect(gainA);
        gainA.connect(master);
        oscA.start(startAt);
        oscA.stop(startAt + 0.12);

        const oscB = ctx.createOscillator();
        const gainB = ctx.createGain();
        oscB.type = "sine";
        oscB.frequency.setValueAtTime(1760, startAt + 0.05);
        oscB.frequency.exponentialRampToValueAtTime(1480, startAt + 0.145);
        gainB.gain.setValueAtTime(0.0001, startAt + 0.045);
        gainB.gain.exponentialRampToValueAtTime(0.85, startAt + 0.072);
        gainB.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.17);
        oscB.connect(gainB);
        gainB.connect(master);
        oscB.start(startAt + 0.045);
        oscB.stop(startAt + 0.18);
      } catch {}
    };

    try {
      if (ctx.state === "running") {
        messageAlertAudioUnlocked = true;
        scheduleTone();
        return;
      }
      const resumePromise = ctx.resume();
      if (resumePromise && typeof resumePromise.then === "function") {
        resumePromise
          .then(() => {
            messageAlertAudioUnlocked = true;
            scheduleTone();
          })
          .catch(() => {});
      }
    } catch {}
  }

  function showIncomingMessageBrowserNotification(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      const n = new Notification(String(title || "Новое сообщение"), {
        body: String(body || "Откройте чат, чтобы ответить."),
        silent: false,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {}
  }

  function shouldSuppressLocalBrowserNotification() {
    if (!isWebPushSupported() || !isWebPushSecureContext()) return false;
    if (Notification.permission !== "granted") return false;
    if (String(webPushSyncedFingerprint || "").trim()) return true;
    if (String(webPushSubscriptionVapidKey || "").trim()) return true;
    return webPushSyncInFlight === true;
  }

  function resolveUnansweredIncomingMessage(thread, incomingMessageId = "") {
    const list = Array.isArray(thread) ? thread : [];
    if (!list.length) return null;
    const anchorId = String(incomingMessageId || "").trim();
    const unresolvedIds = new Set(collectUnansweredIncomingIds(list));

    if (anchorId) {
      const idx = list.findIndex((msg) => String(msg?.id || "") === anchorId);
      if (idx < 0) return null;
      if (String(list[idx]?.direction || "").toLowerCase() !== "in") return null;
      if (!unresolvedIds.has(anchorId)) return null;
      return list[idx];
    }

    for (let i = list.length - 1; i >= 0; i -= 1) {
      const msg = list[i];
      if (String(msg?.direction || "").toLowerCase() !== "in") continue;
      const id = String(msg?.id || "").trim();
      if (!id || !unresolvedIds.has(id)) continue;
      return msg;
    }
    return null;
  }

  async function evaluateAndNotifyUnansweredIncoming(options = {}) {
    const key = normalizeClientIdKey(options.clientId);
    if (!key) return;

    let probeThread = null;
    try {
      const snapshot = await fetchRemoteThreadSnapshot(key, {
        limit: Math.max(CHAT_THREAD_PAGE_SIZE, CHAT_THREAD_BACKGROUND_SYNC_LIMIT),
      });
      if (snapshot && Array.isArray(snapshot.messages)) {
        probeThread = sanitizeThread(snapshot.messages);
      }
    } catch {}

    const localThread = getVisibleThread(key);
    const threadForCheck = Array.isArray(probeThread) && probeThread.length
      ? probeThread
      : localThread;
    let candidate = resolveUnansweredIncomingMessage(threadForCheck, options.incomingMessageId);
    if (!candidate && probeThread && String(options.incomingMessageId || "").trim()) {
      candidate = resolveUnansweredIncomingMessage(localThread, options.incomingMessageId);
    }
    if (!candidate) return;

    const candidateId = String(candidate.id || "");
    if (candidateId && unansweredAlertLastNotifiedIncomingByClient[key] === candidateId) return;

    maybeNotifyIncomingMessage({
      title: options.title,
      body: options.body || getMessagePreviewText(candidate),
      allowWhenActive: options.allowWhenActive === true,
    });
    if (candidateId) unansweredAlertLastNotifiedIncomingByClient[key] = candidateId;
  }

  function scheduleUnansweredIncomingNotification(options = {}) {
    const key = normalizeClientIdKey(options.clientId);
    if (!key) return;
    if (unansweredAlertTimerByClient[key]) {
      window.clearTimeout(unansweredAlertTimerByClient[key]);
      delete unansweredAlertTimerByClient[key];
    }

    const seq = (Number(unansweredAlertSeqByClient[key] || 0) + 1);
    unansweredAlertSeqByClient[key] = seq;
    const delay = Math.max(0, Number(options.delayMs || CHAT_UNANSWERED_ALERT_DELAY_MS) || 0);
    unansweredAlertTimerByClient[key] = window.setTimeout(async () => {
      if (seq !== Number(unansweredAlertSeqByClient[key] || 0)) return;
      if (!unansweredAlertTimerByClient[key]) return;
      delete unansweredAlertTimerByClient[key];
      await evaluateAndNotifyUnansweredIncoming({
        clientId: key,
        incomingMessageId: String(options.incomingMessageId || ""),
        title: String(options.title || ""),
        body: String(options.body || ""),
        allowWhenActive: options.allowWhenActive === true,
      });
    }, delay);
  }

  function maybeNotifyIncomingMessage(options = {}) {
    if (!CHAT_BROWSER_ALERTS_ENABLED) return;
    const opts = options || {};
    if (Date.now() < Number(suppressMessageAlertUntil || 0)) return;
    const tabActive = isChatTabActiveForRead();
    if (tabActive && opts.allowWhenActive !== true) return;

    const now = Date.now();
    if (now - messageAlertLastAt < CHAT_MESSAGE_ALERT_COOLDOWN_MS) return;
    messageAlertLastAt = now;

    playMessageAlertSound();
    if (!tabActive) {
      if (shouldSuppressLocalBrowserNotification()) return;
      showIncomingMessageBrowserNotification(opts.title, opts.body);
    }
  }

  function initMessageAlerts() {
    if (!CHAT_BROWSER_ALERTS_ENABLED) {
      disableWebPushSubscription().catch(() => {});
      return;
    }
    document.addEventListener("click", unlockMessageAlertsOnce, { once: true, passive: true, capture: true });
    document.addEventListener("touchstart", unlockMessageAlertsOnce, { once: true, passive: true, capture: true });
    document.addEventListener("keydown", unlockMessageAlertsOnce, { once: true });
  }

  function isWebPushSupported() {
    if (!CHAT_BROWSER_ALERTS_ENABLED) return false;
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator)) return false;
    if (!("PushManager" in window)) return false;
    if (!("Notification" in window)) return false;
    return true;
  }

  function isWebPushSecureContext() {
    if (window.isSecureContext === true) return true;
    const host = String(window.location && window.location.hostname || "").toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "127.0.0.1" || host === "[::1]") return true;
    if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
    return false;
  }

  function getAdminServiceWorkerUrl() {
    const configured = String((window && window.__APP_SERVICE_WORKER_URL__) || "").trim();
    if (configured) return configured;
    return "/sw.js";
  }

  function getAdminServiceWorkerVersionToken() {
    return String((window && window.__APP_SERVICE_WORKER_VERSION__) || "").trim();
  }

  function registrationMatchesExpectedServiceWorker(registration) {
    const expectedUrl = getAdminServiceWorkerUrl();
    const expectedToken = getAdminServiceWorkerVersionToken();
    if (!registration) return false;
    const scriptUrl = String(
      registration.active?.scriptURL
      || registration.waiting?.scriptURL
      || registration.installing?.scriptURL
      || ""
    ).trim();
    if (!scriptUrl) return false;
    if (expectedToken && scriptUrl.includes(expectedToken)) return true;
    if (!expectedToken && expectedUrl && scriptUrl.includes(expectedUrl)) return true;
    return false;
  }

  function webPushArrayBufferToBase64(raw) {
    if (!raw) return "";
    try {
      const bytes = new Uint8Array(raw);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    } catch {
      return "";
    }
  }

  function webPushUrlBase64ToUint8Array(base64String) {
    const value = String(base64String || "").trim();
    if (!value) return new Uint8Array();
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const binary = window.atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function normalizeWebPushSubscriptionForApi(subscription) {
    if (!subscription) return null;
    const source = typeof subscription.toJSON === "function"
      ? subscription.toJSON()
      : subscription;
    const endpoint = String(source && source.endpoint || "").trim();
    if (!endpoint) return null;

    let p256dh = "";
    let auth = "";
    if (source && source.keys && typeof source.keys === "object") {
      p256dh = String(source.keys.p256dh || "").trim();
      auth = String(source.keys.auth || "").trim();
    }
    if ((!p256dh || !auth) && typeof subscription.getKey === "function") {
      p256dh = p256dh || webPushArrayBufferToBase64(subscription.getKey("p256dh"));
      auth = auth || webPushArrayBufferToBase64(subscription.getKey("auth"));
    }
    if (!p256dh || !auth) return null;

    return {
      endpoint: endpoint,
      keys: {
        p256dh: p256dh,
        auth: auth,
      },
    };
  }

  function buildWebPushSubscriptionFingerprint(clientId, normalizedSubscription) {
    const payload = normalizedSubscription && typeof normalizedSubscription === "object"
      ? normalizedSubscription
      : {};
    const endpoint = String(payload.endpoint || "").trim();
    const keys = payload.keys && typeof payload.keys === "object" ? payload.keys : {};
    const p256dh = String(keys.p256dh || "");
    const auth = String(keys.auth || "");
    return [String(clientId || ""), endpoint, p256dh, auth].join("|");
  }

  async function getWebPushServiceWorkerRegistration() {
    if (!isWebPushSupported()) return null;
    const expectedUrl = getAdminServiceWorkerUrl();
    try {
      const byScope = await navigator.serviceWorker.getRegistration("/");
      if (byScope && registrationMatchesExpectedServiceWorker(byScope)) {
        try {
          if (typeof byScope.update === "function") await byScope.update();
        } catch {}
        if (byScope.active) return byScope;
      } else if (byScope) {
        try {
          await byScope.unregister();
        } catch {}
      }
      if (byScope) {
        try {
          const ready = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => window.setTimeout(() => resolve(null), 2400)),
          ]);
          if (registrationMatchesExpectedServiceWorker(ready)) return ready;
        } catch {
          if (registrationMatchesExpectedServiceWorker(byScope)) return byScope;
        }
      }
    } catch {}
    try {
      const fallback = await navigator.serviceWorker.getRegistration();
      if (fallback && registrationMatchesExpectedServiceWorker(fallback)) {
        try {
          if (typeof fallback.update === "function") await fallback.update();
        } catch {}
        if (fallback.active) return fallback;
        return fallback;
      }
      if (fallback) {
        try {
          await fallback.unregister();
        } catch {}
      }
    } catch {}
    try {
      const registered = await navigator.serviceWorker.register(expectedUrl, { scope: "/" });
      try {
        if (registered && typeof registered.update === "function") await registered.update();
      } catch {}
      if (registered && registered.active) return registered;
      try {
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => window.setTimeout(() => resolve(null), 2600)),
        ]);
        if (registrationMatchesExpectedServiceWorker(ready)) return ready;
        return registered || null;
      } catch {
        return registered || null;
      }
    } catch {}
    return null;
  }

  async function fetchWebPushPublicKey(options = {}) {
    if (!options.forceRefresh && webPushPublicKeyFetched) {
      return webPushPublicKeyCache;
    }
    const json = await apiJson(CHAT_TEMP_API_BASE + "/push/public-key");
    const data = json && json.data ? json.data : {};
    const enabled = data.enabled === true;
    const key = enabled ? String(data.public_key || "").trim() : "";
    webPushPublicKeyFetched = true;
    webPushPublicKeyCache = key;
    return key;
  }

  async function remoteUnsubscribeWebPushByEndpoint(endpoint) {
    const safeEndpoint = String(endpoint || "").trim();
    if (!safeEndpoint) return;
    await apiJson(CHAT_TEMP_API_BASE + "/push/unsubscribe", {
      method: "POST",
      headers: { "x-chat-actor": "out" },
      body: { endpoint: safeEndpoint },
    }).catch(() => {});
  }

  async function disableWebPushSubscription() {
    if (webPushDisableInFlight) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    webPushDisableInFlight = true;
    try {
      let registration = null;
      try {
        registration = await navigator.serviceWorker.getRegistration("/");
      } catch {}
      if (!registration) {
        try {
          registration = await navigator.serviceWorker.getRegistration();
        } catch {}
      }
      if (!registration || !registration.pushManager) {
        webPushSyncedFingerprint = "";
        webPushSubscriptionVapidKey = "";
        try { localStorage.removeItem(adminPushVapidStorageKey); } catch {}
        return;
      }

      let subscription = null;
      try {
        subscription = await registration.pushManager.getSubscription();
      } catch {}
      const endpoint = String(subscription && subscription.endpoint || "");
      if (subscription) {
        try { await subscription.unsubscribe(); } catch {}
      }
      if (endpoint) {
        await remoteUnsubscribeWebPushByEndpoint(endpoint);
      }
      webPushSyncedFingerprint = "";
      webPushSubscriptionVapidKey = "";
      try { localStorage.removeItem(adminPushVapidStorageKey); } catch {}
    } catch {
      // noop
    } finally {
      webPushDisableInFlight = false;
    }
  }

  function queueWebPushSubscriptionSync(options = {}) {
    if (!CHAT_BROWSER_ALERTS_ENABLED) {
      if (webPushSyncTimer) {
        window.clearTimeout(webPushSyncTimer);
        webPushSyncTimer = 0;
      }
      webPushSyncRequestedWithPermission = false;
      webPushSyncForceRequested = false;
      disableWebPushSubscription().catch(() => {});
      return;
    }
    if (!isChatWidgetEnabledRuntime()) {
      if (webPushSyncTimer) {
        window.clearTimeout(webPushSyncTimer);
        webPushSyncTimer = 0;
      }
      webPushSyncRequestedWithPermission = false;
      webPushSyncForceRequested = false;
      return;
    }
    if (options.requestPermission === true) webPushSyncRequestedWithPermission = true;
    if (options.force === true) webPushSyncForceRequested = true;
    if (webPushSyncTimer) {
      window.clearTimeout(webPushSyncTimer);
      webPushSyncTimer = 0;
    }
    const delay = options.immediate === true ? 0 : CHAT_PUSH_SYNC_DEBOUNCE_MS;
    webPushSyncTimer = window.setTimeout(() => {
      webPushSyncTimer = 0;
      const runOptions = {
        requestPermission: webPushSyncRequestedWithPermission === true,
        force: webPushSyncForceRequested === true,
      };
      webPushSyncRequestedWithPermission = false;
      webPushSyncForceRequested = false;
      syncWebPushSubscription(runOptions).catch(() => {});
    }, delay);
  }

  async function syncWebPushSubscription(options = {}) {
    if (!CHAT_BROWSER_ALERTS_ENABLED) {
      await disableWebPushSubscription();
      return;
    }
    if (!isChatWidgetEnabledRuntime()) return;
    if (!isWebPushSupported()) return;
    if (!isWebPushSecureContext()) return;
    if (webPushSyncInFlight) {
      queueWebPushSubscriptionSync(options);
      return;
    }

    webPushSyncInFlight = true;
    try {
      const registration = await getWebPushServiceWorkerRegistration();
      if (!registration || !registration.pushManager) return;

      const publicKey = await fetchWebPushPublicKey();
      if (!publicKey) {
        webPushSyncedFingerprint = "";
        webPushSubscriptionVapidKey = "";
        try { localStorage.removeItem(adminPushVapidStorageKey); } catch {}
        return;
      }

      let permission = String(Notification.permission || "default");
      if (permission === "default" && options.requestPermission === true) {
        try {
          permission = String(await Notification.requestPermission());
        } catch {
          permission = String(Notification.permission || "default");
        }
      }

      let subscription = await registration.pushManager.getSubscription().catch(() => null);
      if (permission !== "granted") {
        const staleEndpoint = String(subscription && subscription.endpoint || "");
        if (staleEndpoint) await remoteUnsubscribeWebPushByEndpoint(staleEndpoint);
        webPushSyncedFingerprint = "";
        return;
      }

      if (
        subscription
        && (!webPushSubscriptionVapidKey || webPushSubscriptionVapidKey !== publicKey)
      ) {
        const staleEndpoint = String(subscription.endpoint || "");
        try { await subscription.unsubscribe(); } catch {}
        if (staleEndpoint) await remoteUnsubscribeWebPushByEndpoint(staleEndpoint);
        subscription = null;
        webPushSyncedFingerprint = "";
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: webPushUrlBase64ToUint8Array(publicKey),
        });
      }

      const normalizedSubscription = normalizeWebPushSubscriptionForApi(subscription);
      if (!normalizedSubscription) return;

      const fingerprint = buildWebPushSubscriptionFingerprint(
        CHAT_PUSH_SUBSCRIPTION_CLIENT_ID,
        normalizedSubscription
      );
      if (!options.force && fingerprint === webPushSyncedFingerprint) {
        webPushSubscriptionVapidKey = publicKey;
        try { localStorage.setItem(adminPushVapidStorageKey, publicKey); } catch {}
        return;
      }

      await apiJson(CHAT_TEMP_API_BASE + "/push/subscribe", {
        method: "POST",
        headers: { "x-chat-actor": "out" },
        body: {
          client_id: CHAT_PUSH_SUBSCRIPTION_CLIENT_ID,
          subscription: normalizedSubscription,
        },
      });
      webPushSyncedFingerprint = fingerprint;
      webPushSubscriptionVapidKey = publicKey;
      try { localStorage.setItem(adminPushVapidStorageKey, publicKey); } catch {}
    } catch {
      // noop
    } finally {
      webPushSyncInFlight = false;
    }
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
      markThreadMutated(clientId);
      saveStore();
    }
    return changed;
  }

  function markThreadRead(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const unreadIds = getThread(key)
      .filter((msg) => msg && msg.direction === "in" && !isMessageRead(msg))
      .map((msg) => String(msg.id || ""))
      .filter(Boolean);
    return markThreadReadByIds(key, unreadIds);
  }

  function markThreadReadByIds(clientId, messageIds) {
    const key = normalizeClientIdKey(clientId);
    const ids = Array.isArray(messageIds) ? messageIds.map((id) => String(id || "")).filter(Boolean) : [];
    if (!key || !ids.length) return false;
    const idSet = new Set(ids);
    const thread = getThread(key);
    let changed = false;
    const changedIds = [];
    const nowIso = new Date().toISOString();
    thread.forEach((msg) => {
      if (!msg || msg.direction !== "in") return;
      const id = String(msg.id || "");
      if (!id || !idSet.has(id)) return;
      if (isMessageRead(msg)) return;
      msg.read = true;
      msg.deliveryStatus = "read";
      msg.deliveredAt = msg.deliveredAt || nowIso;
      msg.readAt = msg.readAt || nowIso;
      changedIds.push(id);
      changed = true;
    });
    if (changed) {
      const remainingUnread = getVisibleThread(key)
        .filter((msg) => msg && msg.direction === "in" && !isMessageRead(msg))
        .length;
      setRemoteSummaryUnreadCount(key, remainingUnread);
      markThreadMutated(key);
      saveStore();
      enqueueRemoteMutation(key, () => remoteMarkMessagesRead(key, changedIds));
    }
    return changed;
  }

  function collectVisibleIncomingUnreadMessageIds(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key || Number(state.activeClientId) !== Number(key)) return [];
    if (!dom.center.messagesWrap || !dom.center.messages) return [];

    const wrapRect = dom.center.messagesWrap.getBoundingClientRect();
    const topEdge = wrapRect.top + 6;
    const bottomEdge = wrapRect.bottom - 6;
    if (bottomEdge <= topEdge) return [];

    const out = [];
    dom.center.messages.querySelectorAll('.chat-message.chat-message--in[data-message-id]').forEach((node) => {
      const rect = node.getBoundingClientRect();
      const isVisible = rect.bottom > topEdge && rect.top < bottomEdge;
      if (!isVisible) return;
      const id = String(node.getAttribute("data-message-id") || "");
      if (!id) return;
      const msg = findThreadMessage(key, id);
      if (!msg || isMessageRead(msg)) return;
      out.push(id);
    });
    return out;
  }

  function markVisibleThreadMessagesRead(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    return markThreadReadByIds(key, collectVisibleIncomingUnreadMessageIds(key));
  }

  function syncActiveThreadReadState(options = {}) {
    const id = Number(options.clientId || state.activeClientId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (!isChatTabActiveForRead()) return false;
    const changed = markVisibleThreadMessagesRead(id);
    if (changed || options.forceRender) {
      applyClientFilter();
      if (options.forceRender && Number(state.activeClientId) === id) renderMessages();
    }
    if (changed) emitUnreadChangedSoon();
    return changed;
  }

  function pushMessage(clientId, message) {
    const thread = getThread(clientId);
    ensureMessageReactions(message);
    thread.push(message);
    if (thread.length > 2000) thread.splice(0, thread.length - 2000);
    markThreadMutated(clientId);
    saveStore();
    enqueueRemoteMutation(clientId, () => remoteCreateMessage(clientId, message));
  }

  function getMessageAuthorName(message) {
    if (!message) return "";
    if (message.direction === "out") return "Вы";
    return String(state.activeClient?.name || "Клиент");
  }

  function isImageAttachment(attachment) {
    if (!attachment || typeof attachment !== "object") return false;
    const kind = String(attachment.kind || "").toLowerCase();
    if (kind !== "image") return false;
    const dataUrl = String(attachment.dataUrl || "");
    const url = String(attachment.url || attachment.src || "");
    const hasDataUrl = /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl);
    const hasUrl = /^(?:\/uploads\/chat\/|\/static\/uploads\/chat\/)/i.test(url)
      || /^https?:\/\//i.test(url)
      || /^blob:/i.test(url);
    return hasDataUrl || hasUrl;
  }

  function getAttachmentImageSrc(attachment) {
    if (!isImageAttachment(attachment)) return "";
    const dataUrl = String(attachment.dataUrl || "").trim();
    if (dataUrl) return dataUrl;
    return String(attachment.url || attachment.src || "").trim();
  }

  function getMessageImageAttachment(message) {
    if (!message || typeof message !== "object") return null;
    const attachment = message.attachment;
    return isImageAttachment(attachment) ? attachment : null;
  }

  function isCacheableThreadImageSrc(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value || /^data:/i.test(value) || /^blob:/i.test(value)) return false;
    if (/^(?:\/uploads\/chat\/|\/static\/uploads\/chat\/)/i.test(value)) return true;
    try {
      const parsed = new URL(value, window.location.origin);
      return parsed.origin === window.location.origin
        && /^\/(?:uploads|static\/uploads)\/chat\//i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function applyThreadImageLoadingStrategy() {
    if (!dom.center.messages) return;
    const activeId = normalizeClientIdKey(state.activeClientId);
    const images = Array.from(dom.center.messages.querySelectorAll(".chat-message-attachment-image")).filter((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      const src = String(img.getAttribute("src") || "").trim();
      return isCacheableThreadImageSrc(src);
    });
    const eagerFromIndex = Math.max(0, images.length - CHAT_THREAD_EAGER_IMAGE_COUNT);
    images.forEach((img, index) => {
      const eager = index >= eagerFromIndex;
      img.loading = eager ? "eager" : "lazy";
      img.decoding = "async";
      try {
        img.fetchPriority = eager ? "high" : "low";
      } catch {}
      if (img.dataset.bottomPinBound !== "1") {
        img.dataset.bottomPinBound = "1";
        const alignBottomIfNeeded = () => {
          if (!activeId) return;
          if (normalizeClientIdKey(state.activeClientId) !== activeId) return;
          if (!isThreadPinnedBottomPreferred(activeId)) return;
          scrollMessagesToBottom({ behavior: "auto", keepPending: true });
          saveThreadScrollPosition(activeId);
        };
        img.addEventListener("load", alignBottomIfNeeded, { passive: true });
        img.addEventListener("error", alignBottomIfNeeded, { passive: true });
      }
    });
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
    focusComposerInput({ moveCaretToEnd: true });
    syncComposerRichPreview({});
  }

  function scrollToMessageInThread(messageId, options = {}) {
    if (!dom.center.messages || !dom.center.messagesWrap) return;
    const key = String(messageId || "");
    if (!key) return false;

    const wrap = dom.center.messagesWrap;
    const target = $$(".chat-message", dom.center.messages)
      .find((node) => String(node.getAttribute("data-message-id") || "") === key);
    if (!target) return false;

    const wrapRect = wrap.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offsetTop = targetRect.top - wrapRect.top;
    const placement = options.placement === "bottom" ? "bottom" : "center";
    const gap = Math.max(0, Number(options.bottomGapPx || CHAT_MESSAGE_JUMP_BOTTOM_GAP_PX));
    const centeredTop = wrap.scrollTop + offsetTop - ((wrap.clientHeight - targetRect.height) / 2);
    const bottomAlignedTop = wrap.scrollTop + offsetTop + targetRect.height - Math.max(0, wrap.clientHeight - gap);
    const nextTop = Math.max(0, placement === "bottom" ? bottomAlignedTop : centeredTop);
    const behavior = options.behavior === "auto" ? "auto" : "smooth";
    const currentTop = Number(wrap.scrollTop || 0);
    const movingAwayFromBottom = nextTop < (currentTop - CHAT_SCROLL_DOWN_SHOW_DISTANCE_PX);
    if (movingAwayFromBottom) {
      forceShowMessagesScrollDownButton();
    }

    wrap.scrollTo({ top: nextTop, behavior });
    if (behavior === "smooth") {
      window.setTimeout(() => {
        updateMessagesScrollDownButton();
      }, 16);
      window.setTimeout(() => {
        updateMessagesScrollDownButton();
      }, 90);
      window.setTimeout(() => {
        updateMessagesScrollDownButton();
      }, 220);
      window.setTimeout(() => {
        updateMessagesScrollDownButton();
      }, 360);
    }
    target.classList.add("is-jump-highlight");
    if (target.__jumpTimer) clearTimeout(target.__jumpTimer);
    target.__jumpTimer = window.setTimeout(() => {
      target.classList.remove("is-jump-highlight");
    }, 1200);
    return true;
  }

  function queuePendingNotificationMessageFocus(messageId, clientId) {
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedClientId = normalizeClientIdKey(clientId);
    if (!normalizedMessageId || !normalizedClientId) return false;
    pendingNotificationMessageFocus = {
      clientId: normalizedClientId,
      messageId: normalizedMessageId,
    };
    return true;
  }

  function flushPendingNotificationMessageFocus() {
    const pending = pendingNotificationMessageFocus && typeof pendingNotificationMessageFocus === "object"
      ? pendingNotificationMessageFocus
      : null;
    if (!pending) return false;
    const activeClientId = normalizeClientIdKey(state.activeClientId);
    if (!activeClientId || pending.clientId !== activeClientId) return false;
    const focused = scrollToMessageInThread(pending.messageId, {
      placement: "bottom",
      behavior: "auto",
      bottomGapPx: CHAT_MESSAGE_JUMP_BOTTOM_GAP_PX,
    });
    if (!focused) return false;
    pendingNotificationMessageFocus = null;
    saveThreadScrollPosition(state.activeClientId);
    updateMessagesScrollDownButton();
    return true;
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
      checkRow: $(".chat-delete-confirm-check", overlay),
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
    const rawClientName = String(options.clientName || state.activeClient?.name || "клиента").trim();
    const clientName = rawClientName || "клиента";
    const allowDeleteForClient = options.allowDeleteForClient !== false;
    const titleText = String(options.title || `Удалить ${count} ${getMessagesWord(count)}`);
    const bodyText = String(options.text || (count === 1
      ? "Вы точно хотите удалить это сообщение?"
      : "Вы точно хотите удалить эти сообщения?"));
    const checkText = String(options.checkText || `Также удалить для ${clientName}`);
    const confirmText = String(options.confirmText || "\u0423\u0414\u0410\u041b\u0418\u0422\u042c");

    if (ui.title) ui.title.textContent = titleText;
    if (ui.text) ui.text.textContent = bodyText;
    if (ui.checkText) ui.checkText.textContent = checkText;
    if (ui.deleteBtn) ui.deleteBtn.textContent = confirmText;
    if (ui.checkRow) ui.checkRow.classList.toggle("hidden", !allowDeleteForClient);
    if (ui.check) {
      ui.check.disabled = !allowDeleteForClient;
      ui.check.checked = allowDeleteForClient;
    }

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
      reactions: { in: "", out: "" },
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
    if (EMOJI_NATIVE_RENDER_ONLY) return "";
    const code = emojiToAssetCode(emoji);
    return code ? `${EMOJI_ASSET_BASE_URL}/${code}.png` : "";
  }

  function preloadEmojiAtlas() {
    if (EMOJI_NATIVE_RENDER_ONLY) return;
    if (shouldUseNativeMobileEmojiKeyboard()) return;
    if (!EMOJI_ATLAS_ENABLED || emojiAtlasPreloadStarted) return;
    emojiAtlasPreloadStarted = true;
    ensureEmojiAtlasRuntimeUrl().then((url) => {
      const img = new Image();
      img.decoding = "async";
      img.src = url || EMOJI_ATLAS_URL;
    }).catch(() => {});
  }

  async function ensureEmojiAtlasRuntimeUrl() {
    if (emojiAtlasRuntimeUrl) return emojiAtlasRuntimeUrl;
    try {
      if (!("caches" in window)) return EMOJI_ATLAS_URL;
      const cache = await caches.open(EMOJI_ATLAS_CACHE_NAME);
      let response = await cache.match(EMOJI_ATLAS_URL, { ignoreSearch: false });
      if (!response || !response.ok) {
        response = await fetch(EMOJI_ATLAS_URL, { cache: "force-cache" });
        if (response && response.ok) {
          try { await cache.put(EMOJI_ATLAS_URL, response.clone()); } catch {}
        }
      }
      if (!response || !response.ok) return EMOJI_ATLAS_URL;
      const blob = await response.blob();
      if (!blob || !blob.size) return EMOJI_ATLAS_URL;
      emojiAtlasRuntimeUrl = URL.createObjectURL(blob);
      return emojiAtlasRuntimeUrl;
    } catch {
      return EMOJI_ATLAS_URL;
    }
  }

  function getEmojiAtlasPosition(emoji) {
    if (!EMOJI_ATLAS_ENABLED) return null;
    const key = normalizeEmojiAtlasKey(emoji);
    if (!key) return null;
    const index = EMOJI_ATLAS_INDEX_BY_KEY[key];
    if (!Number.isFinite(index) || index < 0) return null;
    return {
      row: Math.floor(index / EMOJI_ATLAS_COLUMNS),
      col: index % EMOJI_ATLAS_COLUMNS,
    };
  }

  function getEmojiAtlasRenderCellSize(glyphClassName) {
    const cls = String(glyphClassName || "");
    if (!cls) return 24;
    if (cls.indexOf("shop-company-chat-emoji-glyph--reaction") !== -1 || cls.indexOf("chat-emoji-glyph--reaction") !== -1) return 21;
    if (cls.indexOf("shop-company-chat-emoji-glyph--pill") !== -1 || cls.indexOf("chat-emoji-glyph--pill") !== -1) return 26;
    if (cls.indexOf("shop-company-chat-emoji-glyph--composer") !== -1 || cls.indexOf("chat-emoji-glyph--composer") !== -1) return 30;
    if (cls.indexOf("shop-company-chat-emoji-glyph--picker") !== -1 || cls.indexOf("chat-emoji-glyph--picker") !== -1) return 24;
    if (
      cls.indexOf("shop-company-chat-emoji-glyph--input-inline") !== -1
      || cls.indexOf("shop-company-chat-emoji-glyph--preview") !== -1
      || cls.indexOf("chat-emoji-glyph--input-inline") !== -1
      || cls.indexOf("chat-emoji-glyph--preview") !== -1
    ) {
      return null;
    }
    return 24;
  }

  function shouldPreferEmojiAssetGlyph(glyphClassName, emojiValue) {
    const cls = String(glyphClassName || "");
    const isCompactReactionGlyph = (
      cls.indexOf("shop-company-chat-emoji-glyph--pill") !== -1
      || cls.indexOf("shop-company-chat-emoji-glyph--reaction") !== -1
      || cls.indexOf("chat-emoji-glyph--pill") !== -1
      || cls.indexOf("chat-emoji-glyph--reaction") !== -1
    );
    if (!isCompactReactionGlyph) return false;
    return true;
  }

  function createEmojiAtlasGlyph(glyphClassName, emojiValue) {
    if (EMOJI_NATIVE_RENDER_ONLY) return null;
    if (shouldPreferEmojiAssetGlyph(glyphClassName, emojiValue)) return null;
    const pos = getEmojiAtlasPosition(emojiValue);
    if (!pos) return null;
    const xPercent = EMOJI_ATLAS_COLUMNS > 1 ? (pos.col / (EMOJI_ATLAS_COLUMNS - 1)) * 100 : 0;
    const yPercent = EMOJI_ATLAS_ROWS > 1 ? (pos.row / (EMOJI_ATLAS_ROWS - 1)) * 100 : 0;

    const glyph = document.createElement("span");
    glyph.className = String(glyphClassName || "");
    const atlasUrl = emojiAtlasRuntimeUrl || EMOJI_ATLAS_URL;
    glyph.style.backgroundImage = `url("${atlasUrl}")`;
    glyph.style.backgroundRepeat = "no-repeat";
    glyph.style.backgroundSize = `${EMOJI_ATLAS_COLUMNS * 100}% ${EMOJI_ATLAS_ROWS * 100}%`;
    glyph.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
    glyph.setAttribute("aria-hidden", "true");
    return glyph;
  }

  function createEmojiAssetGlyph(glyphClassName, emojiValue) {
    if (EMOJI_NATIVE_RENDER_ONLY) return null;
    const assetUrl = getEmojiAssetUrl(emojiValue);
    if (!assetUrl) return null;
    const glyph = document.createElement("span");
    glyph.className = String(glyphClassName || "");
    glyph.style.backgroundImage = `url("${assetUrl}")`;
    glyph.style.backgroundRepeat = "no-repeat";
    glyph.style.backgroundSize = "contain";
    glyph.style.backgroundPosition = "center";
    glyph.setAttribute("aria-hidden", "true");
    return glyph;
  }

  function appendNativeEmojiGlyph(target, emoji, glyphClassName) {
    if (!target) return;
    const value = String(emoji || "");
    if (!value) return;
    const cls = String(glyphClassName || "");
    const atlasGlyph = createEmojiAtlasGlyph(cls, value);
    if (atlasGlyph) {
      target.appendChild(atlasGlyph);
      return;
    }
    const assetGlyph = createEmojiAssetGlyph(cls, value);
    if (assetGlyph) {
      target.appendChild(assetGlyph);
      return;
    }
    {
      target.appendChild(document.createTextNode(value));
      return;
    }
  }

  function setEmojiGlyph(target, emoji, glyphClassName) {
    if (!target) return;
    const value = String(emoji || "");
    target.textContent = "";
    appendNativeEmojiGlyph(target, value, glyphClassName);
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
          appendNativeEmojiGlyph(target, segment, glyphClassName);
          return;
        }

        target.appendChild(document.createTextNode(segment));
      });

      if (lineIndex < lines.length - 1) target.appendChild(document.createElement("br"));
    });
  }

  function trimAutoLinkTrailingPunctuation(value) {
    let core = String(value || "");
    let trailing = "";
    const closingToOpening = {
      ")": "(",
      "]": "[",
      "}": "{",
    };

    while (core) {
      const lastChar = core.slice(-1);
      if (/[.,!?;:]/.test(lastChar)) {
        trailing = lastChar + trailing;
        core = core.slice(0, -1);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(closingToOpening, lastChar)) {
        const openChar = closingToOpening[lastChar];
        const openCount = core.split(openChar).length - 1;
        const closeCount = core.split(lastChar).length - 1;
        if (closeCount > openCount) {
          trailing = lastChar + trailing;
          core = core.slice(0, -1);
          continue;
        }
      }
      break;
    }

    return core
      ? { core, trailing }
      : { core: String(value || ""), trailing: "" };
  }

  function isPhoneAutoLinkValue(value) {
    const raw = String(value || "");
    if (!raw || /[a-z]/i.test(raw)) return false;
    const digits = raw.replace(/\D+/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  function isBareDomainAutoLinkValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    return CHAT_BARE_DOMAIN_AUTO_LINK_PATTERN.test(raw);
  }

  function isBareDomainAutoLinkBoundarySafe(source, startIndex) {
    const text = String(source || "");
    const index = Math.max(0, Number(startIndex) || 0);
    const prevChar = index > 0 ? text.slice(index - 1, index) : "";
    if (!prevChar) return true;
    return !/[@/\p{L}\p{N}_-]/u.test(prevChar);
  }

  function buildAutoLinkHref(value, options = {}) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (isPhoneAutoLinkValue(raw)) {
      const normalized = raw
        .replace(/[^\d+]/g, "")
        .replace(/(?!^)\+/g, "");
      return normalized ? `tel:${normalized}` : "";
    }
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^www\./i.test(raw)) return `https://${raw}`;
    if (isBareDomainAutoLinkValue(raw)) {
      const source = String(options.source || "");
      const startIndex = Number(options.startIndex || 0);
      if (source && !isBareDomainAutoLinkBoundarySafe(source, startIndex)) return "";
      return `https://${raw}`;
    }
    return "";
  }

  function appendAutoLinkedPlainText(target, text, linkClassName) {
    if (!target) return;
    const source = String(text || "");
    if (!source) return;

    CHAT_AUTO_LINK_PATTERN.lastIndex = 0;
    let cursor = 0;
    let match;

    while ((match = CHAT_AUTO_LINK_PATTERN.exec(source))) {
      const matchText = String(match[0] || "");
      const startIndex = Number(match.index || 0);
      if (startIndex > cursor) {
        target.appendChild(document.createTextNode(source.slice(cursor, startIndex)));
      }

      const trimmed = trimAutoLinkTrailingPunctuation(matchText);
      const href = buildAutoLinkHref(trimmed.core, {
        source,
        startIndex,
      });
      if (href) {
        const link = document.createElement("a");
        link.className = linkClassName;
        link.href = href;
        link.textContent = trimmed.core;
        link.setAttribute("data-chat-autolink", "1");
        if (!isPhoneAutoLinkValue(trimmed.core)) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        target.appendChild(link);
      } else {
        target.appendChild(document.createTextNode(matchText));
      }

      if (trimmed.trailing) {
        target.appendChild(document.createTextNode(trimmed.trailing));
      }

      cursor = startIndex + matchText.length;
      if (CHAT_AUTO_LINK_PATTERN.lastIndex <= startIndex) {
        CHAT_AUTO_LINK_PATTERN.lastIndex = startIndex + matchText.length;
      }
    }

    if (cursor < source.length) {
      target.appendChild(document.createTextNode(source.slice(cursor)));
    }
  }

  function renderRichMessageText(target, text, glyphClassName, linkClassName) {
    if (!target) return;
    target.textContent = "";
    const lines = String(text || "").split("\n");

    lines.forEach((line, lineIndex) => {
      const segments = segmentGraphemes(line);
      let plainBuffer = "";

      const flushPlainBuffer = () => {
        if (!plainBuffer) return;
        appendAutoLinkedPlainText(target, plainBuffer, linkClassName);
        plainBuffer = "";
      };

      segments.forEach((segment) => {
        if (isEmojiGrapheme(segment)) {
          flushPlainBuffer();
          appendNativeEmojiGlyph(target, segment, glyphClassName);
          return;
        }
        plainBuffer += segment;
      });

      flushPlainBuffer();
      if (lineIndex < lines.length - 1) {
        target.appendChild(document.createElement("br"));
      }
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

  function ensureMessageReactions(message) {
    if (!message || typeof message !== "object") return { in: "", out: "" };
    const reactions = sanitizeReactionsMap(message.reactions);
    const legacy = String(message.reaction || "").trim();
    if (!reactions.in && !reactions.out && legacy) {
      const fallbackActor = String(message.direction || "").toLowerCase() === "out" ? "out" : "in";
      reactions[fallbackActor] = legacy;
    }
    message.reactions = reactions;
    return reactions;
  }

  function getMessageActorReaction(message, actor = CHAT_REACTION_ACTOR) {
    const reactions = ensureMessageReactions(message);
    return String(reactions[actor] || "");
  }

  function setMessageActorReaction(message, actor, reaction) {
    if (!message || typeof message !== "object") return false;
    const actorKey = actor === "in" ? "in" : "out";
    const next = String(reaction || "").trim();
    const reactions = ensureMessageReactions(message);
    const current = String(reactions[actorKey] || "");
    const toggled = normalizeReactionValue(current) === normalizeReactionValue(next) ? "" : next;
    if (current === toggled) return false;
    reactions[actorKey] = toggled;
    message.reactions = reactions;
    message.reaction = String(reactions[CHAT_REACTION_ACTOR] || "");
    return true;
  }

  function getMessageReactionItems(message) {
    const reactions = ensureMessageReactions(message);
    const items = [];
    const outReaction = String(reactions.out || "");
    const inReaction = String(reactions.in || "");
    if (outReaction) items.push({ actor: "out", reaction: outReaction });
    if (inReaction) items.push({ actor: "in", reaction: inReaction });
    return items;
  }

  function getThreadReactionRenderKey(clientId, messageId, fallbackKey) {
    const clientKey = normalizeClientIdKey(clientId) || "thread";
    const entryKey = String(messageId || "").trim() || String(fallbackKey || "").trim();
    if (!entryKey) return "";
    return `${clientKey}:${entryKey}`;
  }

  function getPendingThreadReactionOverride(clientId, messageId, fallbackKey) {
    const key = getThreadReactionRenderKey(clientId, messageId, fallbackKey);
    if (!key) return null;
    const pending = pendingThreadReactionOverrides.get(key);
    if (!pending) return null;
    const expiresAt = Number(pending.expiresAt || 0);
    if (expiresAt > 0 && expiresAt < Date.now()) {
      pendingThreadReactionOverrides.delete(key);
      pendingThreadReactionPopKeys.delete(key);
      return null;
    }
    return pending;
  }

  function setPendingThreadReactionOverride(clientId, messageId, reaction, fallbackKey) {
    const key = getThreadReactionRenderKey(clientId, messageId, fallbackKey);
    if (!key) return;
    pendingThreadReactionOverrides.set(key, {
      actor: CHAT_REACTION_ACTOR,
      reaction: String(reaction || "").trim(),
      expiresAt: Date.now() + CHAT_REACTION_PENDING_TTL_MS,
    });
  }

  function clearPendingThreadReactionOverride(clientId, messageId, fallbackKey) {
    const key = getThreadReactionRenderKey(clientId, messageId, fallbackKey);
    if (!key) return;
    pendingThreadReactionOverrides.delete(key);
    pendingThreadReactionPopKeys.delete(key);
  }

  function applyPendingThreadReactionOverrideToMessage(clientId, message, fallbackKey) {
    if (!message || typeof message !== "object") return message;
    const messageId = String(message.id || "").trim();
    const pending = getPendingThreadReactionOverride(clientId, messageId, fallbackKey);
    if (!pending) return message;
    const remoteActorReaction = String(getMessageActorReaction(message, pending.actor) || "");
    const expectedReaction = String(pending.reaction || "");
    if (normalizeReactionValue(remoteActorReaction) === normalizeReactionValue(expectedReaction)) {
      clearPendingThreadReactionOverride(clientId, messageId, fallbackKey);
      return message;
    }
    const clonedMessage = { ...message, reactions: { ...ensureMessageReactions(message) } };
    const actorKey = pending.actor === "in" ? "in" : "out";
    clonedMessage.reactions[actorKey] = expectedReaction;
    clonedMessage.reaction = String(clonedMessage.reactions[CHAT_REACTION_ACTOR] || "");
    return clonedMessage;
  }

  function applyPendingThreadReactionOverridesToMessages(clientId, messages) {
    return (Array.isArray(messages) ? messages : []).map((message, index) => (
      applyPendingThreadReactionOverrideToMessage(
        clientId,
        message,
        getThreadMessageRenderKey(message, index)
      )
    ));
  }

  function markPendingThreadReactionPop(clientId, messageId, fallbackKey) {
    const key = getThreadReactionRenderKey(clientId, messageId, fallbackKey);
    if (!key) return;
    pendingThreadReactionPopKeys.add(key);
  }

  function getThreadReactionAnimationItemKey(actor, reaction) {
    const actorKey = actor === "in" ? "in" : actor === "out" ? "out" : "";
    const reactionValue = normalizeReactionValue(reaction || "");
    if (!actorKey || !reactionValue) return "";
    return `${actorKey}:${reactionValue}`;
  }

  function createThreadReactionRenderState(reactionItems) {
    const state = {
      in: "",
      inRaw: "",
      out: "",
      outRaw: "",
      signature: "",
    };
    (Array.isArray(reactionItems) ? reactionItems : []).forEach((item) => {
      const actorKey = String(item && item.actor || "").trim();
      const normalizedActor = actorKey === "in" ? "in" : actorKey === "out" ? "out" : "";
      const reactionRawValue = String(item && item.reaction || "").trim().normalize("NFC");
      const reactionValue = normalizeReactionValue(reactionRawValue);
      if (!normalizedActor || !reactionValue) return;
      state[normalizedActor] = reactionValue;
      state[normalizedActor + "Raw"] = reactionRawValue;
    });
    state.signature = ["out", "in"]
      .map((actorKey) => getThreadReactionAnimationItemKey(actorKey, state[actorKey]))
      .filter(Boolean)
      .join("|");
    return state;
  }

  function getThreadReactionLeavingItems(prevState, nextState) {
    if (!prevState || typeof prevState !== "object") return [];
    const leavingItems = [];
    ["out", "in"].forEach((actorKey) => {
      const prevReaction = String(prevState[actorKey] || "");
      const nextReaction = String(nextState && nextState[actorKey] || "");
      if (!prevReaction || prevReaction === nextReaction) return;
      const prevReactionRaw = String(prevState[actorKey + "Raw"] || prevReaction || "");
      leavingItems.push({
        actor: actorKey,
        reaction: prevReactionRaw,
        itemKey: getThreadReactionAnimationItemKey(actorKey, prevReaction),
      });
    });
    return leavingItems;
  }

  function getThreadReactionAnimationMeta(clientId, messageId, reactionItems, fallbackKey) {
    const key = getThreadReactionRenderKey(clientId, messageId, fallbackKey);
    if (!key) return { animateAny: false, itemKeys: new Set(), leavingItems: [] };
    const nextState = createThreadReactionRenderState(reactionItems);
    const prevState = threadReactionRenderSignatures.get(key);
    const hasPendingLocalPop = pendingThreadReactionPopKeys.has(key);
    const animatedItemKeys = new Set();
    const leavingItems = getThreadReactionLeavingItems(prevState, nextState);
    threadReactionRenderSignatures.set(key, nextState);
    if (!nextState.signature) {
      pendingThreadReactionPopKeys.delete(key);
      return { animateAny: false, itemKeys: animatedItemKeys, leavingItems };
    }
    if (hasPendingLocalPop) {
      pendingThreadReactionPopKeys.delete(key);
      const localItemKey = getThreadReactionAnimationItemKey(CHAT_REACTION_ACTOR, nextState[CHAT_REACTION_ACTOR]);
      if (localItemKey) animatedItemKeys.add(localItemKey);
      return {
        animateAny: animatedItemKeys.size > 0,
        itemKeys: animatedItemKeys,
        leavingItems,
      };
    }
    if (!prevState || typeof prevState !== "object") {
      return { animateAny: false, itemKeys: animatedItemKeys, leavingItems };
    }
    ["out", "in"].forEach((actorKey) => {
      const nextReaction = String(nextState[actorKey] || "");
      const prevReaction = String(prevState[actorKey] || "");
      if (!nextReaction || prevReaction === nextReaction) return;
      const itemKey = getThreadReactionAnimationItemKey(actorKey, nextReaction);
      if (itemKey) animatedItemKeys.add(itemKey);
    });
    return {
      animateAny: animatedItemKeys.size > 0,
      itemKeys: animatedItemKeys,
      leavingItems,
    };
  }

  function bindThreadReactionLeavingCleanup(reactionsWrap, bubble) {
    if (!reactionsWrap || !bubble || reactionsWrap.dataset.leaveCleanupBound === "1") return;
    reactionsWrap.dataset.leaveCleanupBound = "1";
    reactionsWrap.addEventListener("animationend", (event) => {
      const target = event.target;
      if (!target || !target.classList || !target.classList.contains("is-reaction-leave")) return;
      if (target.parentNode === reactionsWrap) {
        reactionsWrap.removeChild(target);
      }
      if (!reactionsWrap.querySelector(".chat-message-reaction-pill")) {
        bubble.classList.remove("has-reaction");
        if (reactionsWrap.parentNode === bubble) {
          bubble.removeChild(reactionsWrap);
        }
      }
    });
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

  function fmtOrderAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    const rounded = Math.round(amount);
    return `${new Intl.NumberFormat("ru-RU").format(rounded)} ₽`;
  }

  function toPositiveOrderId(rawValue) {
    const id = Number(rawValue || 0);
    if (!Number.isFinite(id) || id <= 0) return 0;
    return Math.trunc(id);
  }

  function resolveAssistantOrderCardId(messageId) {
    const id = String(messageId || "").trim();
    if (!id) return 0;
    const match = id.match(CHAT_ASSISTANT_ORDER_CARD_MESSAGE_RE);
    if (!match) return 0;
    const raw = String(match[1] || "");
    if (!raw) return 0;
    return toPositiveOrderId(raw.split("_")[0] || "");
  }

  function resolveAssistantOrderCardIdsByMessageId(messageId) {
    const id = String(messageId || "").trim();
    if (!id) return [];
    const match = id.match(CHAT_ASSISTANT_ORDER_CARD_MESSAGE_RE);
    if (!match) return [];
    const raw = String(match[1] || "");
    if (!raw) return [];
    const seen = new Set();
    return raw
      .split("_")
      .map((part) => toPositiveOrderId(part))
      .filter((orderId) => {
        if (!orderId || seen.has(orderId)) return false;
        seen.add(orderId);
        return true;
      });
  }

  function extractAssistantOrderCardIdsFromText(value) {
    const text = String(value || "");
    if (!text) return [];
    const ids = [];
    const seen = new Set();
    let match = CHAT_ASSISTANT_ORDER_CARD_TEXT_RE.exec(text);
    while (match) {
      const id = toPositiveOrderId(match[1]);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      match = CHAT_ASSISTANT_ORDER_CARD_TEXT_RE.exec(text);
    }
    CHAT_ASSISTANT_ORDER_CARD_TEXT_RE.lastIndex = 0;
    return ids;
  }

  function resolveAssistantOrderCardIds(message) {
    const source = message && typeof message === "object" ? message : {};
    const ids = [];
    const seen = new Set();

    resolveAssistantOrderCardIdsByMessageId(source.id).forEach((orderId) => {
      if (!orderId || seen.has(orderId)) return;
      seen.add(orderId);
      ids.push(orderId);
    });
    if (!ids.length) return ids;

    extractAssistantOrderCardIdsFromText(source.text).forEach((id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });

    return ids;
  }

  function findKnownOrderById(orderId) {
    const id = toPositiveOrderId(orderId);
    if (!id) return null;

    const fromActiveList = (Array.isArray(state.activeOrders) ? state.activeOrders : [])
      .find((order) => toPositiveOrderId(order?.id) === id);
    if (fromActiveList && typeof fromActiveList === "object") return fromActiveList;

    const fromDetailsCache = state.orderDetailsCache instanceof Map
      ? state.orderDetailsCache.get(id)
      : null;
    if (fromDetailsCache && typeof fromDetailsCache === "object") return fromDetailsCache;
    return null;
  }

  function buildMessageOrderCardModels(message) {
    const ids = resolveAssistantOrderCardIds(message);
    if (!ids.length) return [];

    return ids.map((orderId) => {
      const knownOrder = findKnownOrderById(orderId);
      const statusTitle = String(knownOrder?.status_title || knownOrder?.statusTitle || CHAT_ORDER_CARD_STATUS_FALLBACK).trim()
        || CHAT_ORDER_CARD_STATUS_FALLBACK;
      const totalRaw = knownOrder ? (knownOrder.total_price ?? knownOrder.total ?? null) : null;
      const totalLabel = totalRaw === null || totalRaw === undefined ? "" : fmtOrderAmount(totalRaw);

      return {
        orderId,
        orderLabel: `#${orderId}`,
        statusTitle,
        totalLabel,
      };
    });
  }

  function buildMessageOrderCardMarkup(model) {
    if (!model) return "";
    const statusMarkup = model.statusTitle
      ? `<div class="chat-message-order-card__status">${escapeHtml(model.statusTitle)}</div>`
      : "";
    const totalMarkup = model.totalLabel
      ? `<div class="chat-message-order-card__total">${escapeHtml(model.totalLabel)}</div>`
      : "";
    const label = `${CHAT_ORDER_CARD_TITLE} ${model.orderLabel}`;

    return `
      <button
        type="button"
        class="chat-message-order-card"
        data-chat-order-card-id="${escapeHtml(String(model.orderId))}"
        aria-label="${escapeHtml(CHAT_ORDER_CARD_OPEN_LABEL)}"
      >
        <div class="chat-message-order-card__head">
          <span class="chat-message-order-card__title">${escapeHtml(label)}</span>
          ${statusMarkup}
        </div>
        ${totalMarkup}
      </button>
    `;
  }

  function buildMessageOrderCardsMarkup(models) {
    const list = Array.isArray(models) ? models.filter(Boolean) : [];
    if (!list.length) return "";
    return `<div class="chat-message-order-cards">${list.map(buildMessageOrderCardMarkup).join("")}</div>`;
  }

  function getOrderAddressLine(order) {
    if (!order || typeof order !== "object") return "Адрес не указан";
    const methodCode = String(order.method_code || "").toLowerCase();
    const pickupAddress = order.pickup_store_address
      ? [order.pickup_store_name, order.pickup_store_address].filter(Boolean).join(", ")
      : "";
    const baseAddress = methodCode === "pickup"
      ? (pickupAddress || order.address || "")
      : (order.address || pickupAddress || "");
    const normalized = String(baseAddress || "").replace(/\s+/g, " ").trim();
    return normalized || "Адрес не указан";
  }

  function getOrderCommentLine(order) {
    if (!order || typeof order !== "object") return "Нет комментария";
    const comment = String(order.comment || order.address_comment || "").replace(/\s+/g, " ").trim();
    return comment || "Нет комментария";
  }

  function isIconUrl(value) {
    const val = String(value || "").trim();
    if (!val) return false;
    return /^https?:\/\//i.test(val) || val.startsWith("/") || val.startsWith("./") || val.startsWith("../");
  }

  function normalizeIconClass(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("fa-")) return "fas " + raw;
    if (/^fa[srlbd]?\s+/i.test(raw)) return raw;
    return "fas " + raw;
  }

  function fallbackTimeOptionIcon(codeValue) {
    const code = String(codeValue || "").trim().toLowerCase();
    if (code === "asap" || code === "urgent") return "fas fa-bolt";
    if (code === "at_time") return "fas fa-clock";
    if (code === "on_date") return "fas fa-calendar-day";
    return "";
  }

  function resolveTimeOptionIcon(order) {
    if (!order) return "";
    const storedIcon = String(order.time_option_icon || "").trim();
    if (storedIcon) return storedIcon;
    return fallbackTimeOptionIcon(order.time_option_code);
  }

  function setHeaderTimeIcon(order) {
    if (!dom.center.orderTimeIcon) return;

    const iconValue = resolveTimeOptionIcon(order);
    let iconHtml = '<i class="fas fa-calendar-day"></i>';
    if (iconValue) {
      if (isIconUrl(iconValue)) {
        iconHtml = `<img src="${escapeHtml(iconValue)}" alt="" loading="lazy">`;
      } else {
        const iconClass = normalizeIconClass(iconValue) || "fas fa-calendar-day";
        iconHtml = `<i class="${escapeHtml(iconClass)}"></i>`;
      }
    }

    dom.center.orderTimeIcon.innerHTML = iconHtml;
    const title = String(order && order.time_option_title || "").trim();
    if (title) dom.center.orderTimeIcon.setAttribute("title", title);
    else dom.center.orderTimeIcon.removeAttribute("title");
  }

  function paymentIcon(code) {
    if (!code) return "fa-credit-card";
    const c = String(code).toLowerCase();
    if (c.includes("cash")) return "fa-money-bill-wave";
    if (c.includes("card")) return "fa-credit-card";
    if (c.includes("online")) return "fa-globe";
    return "fa-credit-card";
  }

  function isCancelledOrderStatus(order) {
    const isFinalRaw = order?.status_is_final ?? order?.statusIsFinal;
    const isFinal = Number(isFinalRaw) === 1 || isFinalRaw === true;
    const code = String(order?.status_code || order?.statusCode || "").toLowerCase();
    const title = String(order?.status_title || order?.statusTitle || "").toLowerCase();
    if (!isFinal && !code && !title) return false;
    return code.includes("cancel")
      || code.includes("reject")
      || /\bотмен/.test(title)
      || title.includes("cancel");
  }

  function isCompletedOrderStatus(order) {
    const isFinalRaw = order?.status_is_final ?? order?.statusIsFinal;
    const isFinal = Number(isFinalRaw) === 1 || isFinalRaw === true;
    const code = String(order?.status_code || order?.statusCode || "").toLowerCase();
    const title = String(order?.status_title || order?.statusTitle || "").toLowerCase();
    if (isFinal && !isCancelledOrderStatus(order)) return true;
    return code.includes("deliver")
      || code.includes("complete")
      || code.includes("done")
      || code.includes("finish")
      || /\bвыполн/.test(title)
      || /\bзаверш/.test(title)
      || /\bдоставлен/.test(title)
      || /\bдоставлено/.test(title)
      || /\bвыполнен/.test(title)
      || /\bвыполнено/.test(title);
  }

  function isActiveOrderStatus(order) {
    if (!order || typeof order !== "object") return false;
    if (isCancelledOrderStatus(order)) return false;
    if (isCompletedOrderStatus(order)) return false;
    return true;
  }

  function getSortedOrdersForHeader(orders) {
    return (Array.isArray(orders) ? orders : [])
      .slice()
      .sort((a, b) => {
        const ta = parseDateValue(a?.created_at)?.getTime() || 0;
        const tb = parseDateValue(b?.created_at)?.getTime() || 0;
        if (tb !== ta) return tb - ta;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });
  }

  function getHeaderOrderCandidate(orders) {
    const sorted = getSortedOrdersForHeader(orders);
    const latestActive = sorted.find((o) => isActiveOrderStatus(o));
    const latestCompleted = sorted.find((o) => isCompletedOrderStatus(o));
    const latestCancelled = sorted.find((o) => isCancelledOrderStatus(o));
    const latestOrder = sorted[0] || null;
    return {
      sortedOrders: sorted,
      currentOrder: latestActive || null,
      latestActive: latestActive || null,
      latestCompleted: latestCompleted || null,
      latestCancelled: latestCancelled || null,
      latestOrder: latestOrder || null,
      headerOrder: latestActive || latestCompleted || latestCancelled || latestOrder || null,
    };
  }

  function mergeDetailedOrderIntoActiveList(orderId, detailedOrder) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (!detailedOrder || typeof detailedOrder !== "object") return false;
    const list = Array.isArray(state.activeOrders) ? state.activeOrders : [];
    let changed = false;
    const nextList = list.map((order) => {
      if (Number(order && order.id || 0) !== id) return order;
      changed = true;
      return { ...order, ...detailedOrder };
    });
    if (changed) {
      state.activeOrders = nextList;
      state.activeOrdersSignature = buildActiveOrdersSignature(nextList);
    }
    return changed;
  }

  function setHeaderOrderLinkState(orderId) {
    const id = Number(orderId || 0);
    const canOpen = Number.isFinite(id) && id > 0;
    [dom.center.headerOrder, dom.center.mobileHeaderOrderBtn].forEach((node) => {
      if (!node) return;
      if (canOpen) node.setAttribute("data-order-id", String(id));
      else node.removeAttribute("data-order-id");
      node.classList.toggle("is-order-openable", canOpen);
      node.setAttribute("aria-disabled", canOpen ? "false" : "true");
      if ("disabled" in node) node.disabled = !canOpen;
      else node.tabIndex = canOpen ? 0 : -1;
    });
  }

  function setHeaderClientLinkState(canOpen) {
    const enabled = canOpen === true;
    [dom.center.headerClientBtn, dom.center.mobileHeaderClientBtn].forEach((node) => {
      if (!node) return;
      node.classList.toggle("is-openable", enabled);
      if ("disabled" in node) node.disabled = !enabled;
      node.setAttribute("aria-disabled", enabled ? "false" : "true");
      node.tabIndex = enabled ? 0 : -1;
    });
  }

  function normalizeTooltipText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function setNativeTooltip(node, text) {
    if (!node) return;
    const normalized = normalizeTooltipText(text);
    if (normalized && normalized !== "—") node.setAttribute("title", normalized);
    else node.removeAttribute("title");
  }

  function joinTooltipParts(parts) {
    return (Array.isArray(parts) ? parts : [])
      .map((part) => normalizeTooltipText(part))
      .filter(Boolean)
      .join(" • ");
  }

  function syncHeaderTooltips() {
    if (!dom.center.headerOrder) return;

    const idText = normalizeTooltipText(dom.center.orderId?.textContent);
    const timeText = normalizeTooltipText(dom.center.orderTime?.textContent);
    const clientNameText = normalizeTooltipText(dom.center.headerName?.textContent);
    const clientPhoneText = normalizeTooltipText(dom.center.headerPhone?.textContent);
    const addressText = normalizeTooltipText(dom.center.orderAddress?.textContent);
    const commentText = normalizeTooltipText(dom.center.orderComment?.textContent);
    const statusText = normalizeTooltipText(dom.center.orderStatus?.textContent);
    const totalText = normalizeTooltipText(dom.center.orderTotal?.textContent);
    const titleText = normalizeTooltipText(dom.center.orderTitle?.textContent);

    setNativeTooltip(dom.center.orderId, idText);
    setNativeTooltip(dom.center.orderTime, timeText);
    setNativeTooltip(dom.center.headerName, clientNameText);
    setNativeTooltip(dom.center.headerPhone, clientPhoneText);
    setNativeTooltip(dom.center.orderAddress, addressText);
    setNativeTooltip(dom.center.orderComment, commentText);
    setNativeTooltip(dom.center.orderStatus, statusText);
    setNativeTooltip(dom.center.orderTotal, totalText);

    setNativeTooltip($(".order-col.order-id", dom.center.headerOrder), joinTooltipParts([idText, timeText]));
    setNativeTooltip($(".order-col.order-client", dom.center.headerOrder), joinTooltipParts([clientNameText, clientPhoneText]));
    setNativeTooltip($(".order-col.order-address", dom.center.headerOrder), joinTooltipParts([addressText, commentText]));
    setNativeTooltip($(".order-col.order-stage", dom.center.headerOrder), statusText);
    setNativeTooltip($(".order-col.order-total", dom.center.headerOrder), totalText);

    const timeIconTitle = normalizeTooltipText(dom.center.orderTimeIcon?.getAttribute("title"));
    setNativeTooltip($(".order-col.order-indicators", dom.center.headerOrder), timeIconTitle || timeText);
    setNativeTooltip(dom.center.headerOrder, titleText);
    setNativeTooltip(dom.center.mobileHeaderClientBtn, joinTooltipParts([clientNameText, clientPhoneText]));
    setNativeTooltip(dom.center.mobileHeaderOrderBtn, joinTooltipParts([idText, timeText, titleText]));
  }

  async function hydrateHeaderOrderDetails(requestId, clientId) {
    const activeClientId = Number(clientId || state.activeClientId || 0);
    if (!Number.isFinite(activeClientId) || activeClientId <= 0) return;

    const snapshotOrderId = Number(state.headerOrderSnapshot?.id || 0);
    const candidate = getHeaderOrderCandidate(state.activeOrders);
    const headerOrder = snapshotOrderId > 0
      ? (state.headerOrderSnapshot || candidate.headerOrder)
      : candidate.headerOrder;
    const headerOrderId = snapshotOrderId > 0
      ? snapshotOrderId
      : Number(headerOrder && headerOrder.id || 0);
    if (!Number.isFinite(headerOrderId) || headerOrderId <= 0) return;

    try {
      const json = await fetchOrderDetailsFresh(headerOrderId);
      if (requestId !== state.requestToken) return;
      if (Number(state.activeClientId || 0) !== activeClientId) return;

      const detailedOrder = json && json.data ? json.data : null;
      if (!detailedOrder || typeof detailedOrder !== "object") return;
      state.orderDetailsCache.set(headerOrderId, detailedOrder);
      setSharedOrderDetails(detailedOrder);
      if (Number(state.headerOrderSnapshot?.id || 0) === headerOrderId) {
        state.headerOrderSnapshot = { ...state.headerOrderSnapshot, ...detailedOrder };
      }
      mergeDetailedOrderIntoActiveList(headerOrderId, detailedOrder);
      renderChatHeader();
    } catch (err) {
      console.error(err);
    }
  }

  function getOrderClientId(order) {
    const id = Number(order?.customer_id || order?.client_id || order?.clientId || 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function upsertActiveOrder(order) {
    const orderId = Number(order?.id || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return false;
    const list = Array.isArray(state.activeOrders) ? state.activeOrders : [];
    let found = false;
    const nextList = list.map((item) => {
      if (Number(item?.id || 0) !== orderId) return item;
      found = true;
      return { ...item, ...order };
    });
    if (!found) nextList.push(order);
    return setActiveOrders(nextList);
  }

  async function refreshActiveOrdersForActiveClient(options = {}) {
    if (!isChatWidgetEnabledRuntime()) return false;
    const clientId = Number(options.clientId || state.activeClientId || 0);
    if (!Number.isFinite(clientId) || clientId <= 0) return false;
    if (state.activeOrdersPollInFlight) return false;

    state.activeOrdersPollInFlight = true;
    try {
      const ordersJson = await fetchClientOrdersFresh(clientId);
      if (Number(state.activeClientId || 0) !== clientId) return false;
      const nextOrders = Array.isArray(ordersJson?.data) ? ordersJson.data : [];
      setCachedActiveClientOrders(clientId, nextOrders);
      const changed = setActiveOrders(nextOrders, { forceRightOrderRefresh: true });
      try {
        const candidateJson = await fetchHeaderOrderCandidateFresh(clientId);
        if (Number(state.activeClientId || 0) === clientId) {
          const candidateOrder = candidateJson && candidateJson.data && typeof candidateJson.data === "object"
            ? candidateJson.data
            : null;
          if (candidateOrder && Number(candidateOrder.id || 0) > 0) {
            state.headerOrderSnapshot = { ...candidateOrder };
            upsertActiveOrder(candidateOrder);
          } else {
            state.headerOrderSnapshot = null;
          }
        }
      } catch (candidateErr) {
        if (!isAbortError(candidateErr)) console.error(candidateErr);
      }
      state.activeOrdersHydratedClientId = Number(clientId || 0);
      state.activeOrdersLastFetchedAt = Date.now();
      if (changed || options.forceHydrate) {
        hydrateHeaderOrderDetails(state.requestToken, clientId).catch(console.error);
      }
      return changed;
    } catch (err) {
      if (isAbortError(err) || !isChatWidgetEnabledRuntime()) return false;
      console.error(err);
      return false;
    } finally {
      state.activeOrdersPollInFlight = false;
    }
  }

  function ensureActiveOrdersPollTimer() {
    if (!isChatWidgetEnabledRuntime()) return;
    if (state.activeOrdersPollTimer) return;
    state.activeOrdersPollTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!state.activeClientId) return;
      refreshActiveOrdersForActiveClient().catch(console.error);
    }, ACTIVE_ORDERS_POLL_MS);
  }

  function stopActiveOrdersPollTimer() {
    if (!state.activeOrdersPollTimer) return;
    window.clearInterval(state.activeOrdersPollTimer);
    state.activeOrdersPollTimer = 0;
  }

  function initOrderHeaderLiveSync() {
    if (isChatWidgetEnabledRuntime()) {
      ensureActiveOrdersPollTimer();
    }
    if (initOrderHeaderLiveSync.bound) return;
    initOrderHeaderLiveSync.bound = true;

    document.addEventListener(ORDER_UPDATED_EVENT, (event) => {
      if (!isChatWidgetEnabledRuntime()) return;
      const order = event?.detail?.order;
      if (!order || typeof order !== "object") return;

      const activeClientId = Number(state.activeClientId || state.activeClient?.id || 0);
      if (!Number.isFinite(activeClientId) || activeClientId <= 0) return;

      const orderId = Number(order.id || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return;

      const ownerClientId = getOrderClientId(order);
      const existsInActive = (Array.isArray(state.activeOrders) ? state.activeOrders : [])
        .some((item) => Number(item?.id || 0) === orderId);
      const hydratedForActiveClient = Number(state.activeOrdersHydratedClientId || 0) === activeClientId;

      if (ownerClientId > 0 && ownerClientId !== activeClientId && !existsInActive) return;
      if (ownerClientId <= 0 && !existsInActive) return;
      if (!hydratedForActiveClient && !existsInActive) return;

      const changed = upsertActiveOrder(order);
      if (changed) {
        hydrateHeaderOrderDetails(state.requestToken, activeClientId).catch(console.error);
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!isChatWidgetEnabledRuntime()) return;
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (
        now - Number(state.activeOrdersLastFetchedAt || 0)
        < ACTIVE_ORDERS_VISIBILITY_REFRESH_DEBOUNCE_MS
      ) {
        return;
      }
      refreshActiveOrdersForActiveClient({ force: false, forceHydrate: true }).catch(console.error);
    });
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
    const key = normalizeClientIdKey(client?.id);
    const boostedUpdatedAt = key ? String(state.clientSortBoostUpdatedAtByClient[key] || "") : "";
    const fromThread = getLastMessage(client.id)?.createdAt;
    const src = fromThread || client.last_order_date || client.updated_at || client.created_at;
    const date = src ? new Date(String(src).replace(" ", "T")) : null;
    const baseTimestamp = date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    if (!boostedUpdatedAt) return baseTimestamp;
    const boostedDate = new Date(String(boostedUpdatedAt).replace(" ", "T"));
    const boostedTimestamp = !Number.isNaN(boostedDate.getTime()) ? boostedDate.getTime() : 0;
    return Math.max(baseTimestamp, boostedTimestamp);
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
    emitUnreadChangedSoon();
  }

  function buildChatClientRow(client) {
    const active = Number(state.activeClientId) === Number(client.id);
    const unread = getUnreadCount(client.id);
    const lastMsg = getLastMessage(client.id);
    const previewState = getClientPreviewState(client.id);
    const preview = String(previewState.text || "");
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
    const canDeleteGuest = isGuestChatClient(client);

    const row = document.createElement("div");
    row.className = `chat-client-row${active ? " is-active" : ""}`;
    row.setAttribute("data-client-id", String(client.id));
    row.innerHTML = `
      <button type="button" class="chat-client-row-main" aria-label="${escapeHtml(client.name || `РљР»РёРµРЅС‚ #${client.id}`)}">
        <span class="chat-client-main">
        <span class="chat-client-top">
          <span class="chat-client-name" data-chat-client-open-details="1">${escapeHtml(client.name || `Клиент #${client.id}`)}</span>
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
          <span class="chat-client-preview${getClientTypingPreviewText(client.id) ? " is-typing" : ""}" data-chat-client-open-details="1">${escapeHtml(preview)}</span>
          ${unread > 0 ? `<span class="chat-client-unread">${escapeHtml(unreadText)}</span>` : ""}
        </span>
        </span>
      </button>
      <div class="chat-client-row-actions" aria-hidden="true">
        <button type="button" class="chat-client-row-action is-clear" data-chat-client-action-inline="clear">Очистить</button>
        <button type="button" class="chat-client-row-action is-delete${canDeleteGuest ? "" : " hidden"}" data-chat-client-action-inline="delete-guest">Удалить</button>
      </div>
    `;

    const previewEl = $(".chat-client-preview", row);
    if (previewEl) {
      renderClientPreview(previewEl, previewState);
    }

    const openClientThreadAndDetails = async (event) => {
      if (isAdminMobileChatLayout()) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        await selectClient(client.id, { openDetails: false });
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeAllClientSwipeRows(null, { immediate: true });
      hideClientContextMenu();
      if (Number(state.activeClientId) !== Number(client.id)) {
        await selectClient(client.id, { openDetails: true });
        return;
      }
      await openClientDetailsPanel();
    };

    const mainBtn = $(".chat-client-row-main", row);
    if (mainBtn) {
      mainBtn.addEventListener("click", (event) => {
        if (Date.now() < suppressClientRowClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (row.classList.contains("is-swipe-open")) {
          event.preventDefault();
          event.stopPropagation();
          closeClientSwipeRow(row);
          return;
        }
        openClientThreadAndDetails(event).catch(console.error);
      });
      mainBtn.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        showClientContextMenu(event.clientX, event.clientY, client.id);
      });
    }

    row.addEventListener("click", (event) => {
      if (event.target.closest(".chat-client-row-main")) return;
      if (event.target.closest("[data-chat-client-action-inline]")) return;
      hideClientContextMenu();
    });
    bindClientRowSwipe(row, client);
    return row;
  }

  function renderClientsList() {
    if (!dom.left.list) return;
    closeAllClientSwipeRows(null, { immediate: true });
    const hadClientRows = !!dom.left.list.querySelector(".chat-client-row");
    const previousScrollTop = toStoredScrollTop(dom.left.list.scrollTop);
    dom.left.list.innerHTML = "";
    const items = state.filteredClients || [];
    if (!items.length) {
      if (dom.left.empty) dom.left.empty.classList.remove("hidden");
      saveClientsListScrollPosition();
      return;
    }
    if (dom.left.empty) dom.left.empty.classList.add("hidden");
    items.forEach((client) => dom.left.list.appendChild(buildChatClientRow(client)));
    const persistedScrollTop = toStoredScrollTop(state.store?.ui?.clientsListScrollTop);
    const targetTop = hadClientRows ? previousScrollTop : persistedScrollTop;
    const maxTop = Math.max(0, dom.left.list.scrollHeight - dom.left.list.clientHeight);
    dom.left.list.scrollTop = Math.max(0, Math.min(targetTop, maxTop));
    saveClientsListScrollPosition();
    maybeLoadMoreClientsByScroll();
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
        .map((part) => Number.parseInt(part, 16))
        .filter((cp) => Number.isFinite(cp) && cp > 0)
        .map((cp) => String.fromCodePoint(cp))
        .join("");
    } catch {
      return "";
    }
  }

  function normalizeEmojiList(list) {
    const input = Array.isArray(list) ? list : [];
    const seen = new Set();
    const out = [];
    input.forEach((item) => {
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
    EMOJI_CATEGORY_META.forEach(({ key }) => {
      if (key !== "recent") base[key] = [];
    });

    const source = input && typeof input === "object" ? input : {};
    Object.entries(source).forEach(([rawKey, rawList]) => {
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
      emojiRecentList.filter((item) => normalizeReactionValue(item) !== norm)
    );
    emojiRecentList = normalizeEmojiList(emojiRecentList).slice(0, 42);
    saveRecentEmojis(emojiRecentList);
  }

  function buildEmojiCategoriesFromDataset(entries) {
    const categories = normalizeEmojiCategoryMap({});
    const list = Array.isArray(entries) ? entries : [];
    const pushUnified = (target, unified) => {
      const emoji = unifiedToEmoji(unified);
      if (emoji) categories[target].push(emoji);
    };

    list.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.has_img_google === false) return;
      const category = normalizeEmojiCategoryName(entry.category);
      if (!category || !categories[category]) return;

      pushUnified(category, entry.unified);

      if (entry.skin_variations && typeof entry.skin_variations === "object") {
        Object.values(entry.skin_variations).forEach((variant) => {
          if (!variant || typeof variant !== "object") return;
          pushUnified(category, variant.unified);
        });
      }
    });

    Object.keys(categories).forEach((key) => {
      categories[key] = normalizeEmojiList(categories[key]);
    });
    return categories;
  }

  function getFirstAvailableEmojiCategory(preferred = "people") {
    if (preferred && preferred !== "recent" && (emojiCategories[preferred] || []).length) return preferred;
    const found = EMOJI_CATEGORY_META
      .map(({ key }) => key)
      .find((key) => key !== "recent" && (emojiCategories[key] || []).length);
    return found || "people";
  }

  function getEmojiCategoriesForRender() {
    const output = {};
    EMOJI_CATEGORY_META.forEach(({ key }) => {
      if (key === "recent") {
        output[key] = normalizeEmojiList(emojiRecentList).slice(0, 42);
        return;
      }
      output[key] = Array.isArray(emojiCategories[key]) ? emojiCategories[key] : [];
    });
    return output;
  }

  async function ensureEmojiDatasetLoaded() {
    if (!EMOJI_REMOTE_DATASET_ENABLED) {
      if (!emojiDatasetPromise) emojiDatasetPromise = Promise.resolve();
      return emojiDatasetPromise;
    }
    if (emojiDatasetPromise) return emojiDatasetPromise;

    emojiDatasetPromise = (async () => {
      try {
        const res = await fetch(EMOJI_DATASET_URL, { cache: "force-cache" });
        if (!res.ok) throw new Error(`EMOJI_DATASET_HTTP_${res.status}`);
        const payload = await res.json();
        const next = buildEmojiCategoriesFromDataset(payload);
        const hasAny = Object.values(next).some((list) => Array.isArray(list) && list.length);
        if (!hasAny) return;

        emojiCategories = next;
        if (!(getEmojiCategoriesForRender()[emojiActiveCategory] || []).length) {
          emojiActiveCategory = getFirstAvailableEmojiCategory(emojiActiveCategory);
        }

        if (dom.center.emojiPopover && !dom.center.emojiPopover.classList.contains("hidden")) {
          renderEmojiPicker();
        }
      } catch (err) {
        console.error("emoji dataset load failed", err);
        emojiDatasetPromise = null;
      }
    })();

    return emojiDatasetPromise;
  }

  function insertEmojiIntoComposer(emoji) {
    const value = String(emoji || "");
    if (!value) return;

    const attachPreviewOpen = !!(
      dom.center.attachPreviewOverlay
      && !dom.center.attachPreviewOverlay.classList.contains("hidden")
    );
    const attachPreviewTargetFocused = !!(
      dom.center.attachPreviewCaption
      && document.activeElement === dom.center.attachPreviewCaption
    );
    const useAttachPreviewCaption = !!(
      attachPreviewOpen
      && dom.center.attachPreviewCaption
      && (
        attachPreviewTargetFocused
        || (dom.center.emojiPopover && dom.center.emojiPopover.classList.contains("is-attach-preview"))
      )
    );

    if (useAttachPreviewCaption) {
      const caption = dom.center.attachPreviewCaption;
      const start = caption.selectionStart ?? caption.value.length;
      const end = caption.selectionEnd ?? caption.value.length;
      caption.value = `${caption.value.slice(0, start)}${value}${caption.value.slice(end)}`;
      caption.focus();
      const pos = start + value.length;
      caption.setSelectionRange(pos, pos);
      return;
    }

    if (!dom.center.input) return;
    const input = dom.center.input;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
    input.focus();
    const pos = start + value.length;
    input.setSelectionRange(pos, pos);
    syncComposerRichPreview({});
    handleComposerTypingActivity();
  }

  function bindEmojiPickerDragScroll(body, isMobileSheet) {
    if (!body || body.dataset.emojiDragScrollBound === "1") return;
    body.dataset.emojiDragScrollBound = "1";

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let dragAxis = "";
    let didDrag = false;
    let suppressClickUntil = 0;
    let prevScrollSnapType = "";

    const isEnabled = () => (
      typeof isMobileSheet === "function"
        ? isMobileSheet()
        : !!isMobileSheet
    );

    const setScrollLeft = (nextLeft) => {
      const safeLeft = Math.max(0, Number(nextLeft) || 0);
      if (typeof body.scrollTo === "function") {
        body.scrollTo({ left: safeLeft, behavior: "auto" });
        return;
      }
      body.scrollLeft = safeLeft;
    };

    const finish = () => {
      if (activePointerId != null && typeof body.releasePointerCapture === "function") {
        try {
          body.releasePointerCapture(activePointerId);
        } catch {}
      }
      body.style.scrollSnapType = prevScrollSnapType;
      prevScrollSnapType = "";
      activePointerId = null;
      startX = 0;
      startY = 0;
      startScrollLeft = 0;
      dragAxis = "";
      if (didDrag) suppressClickUntil = Date.now() + 180;
      didDrag = false;
    };

    body.addEventListener("pointerdown", (event) => {
      if (!isEnabled()) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      activePointerId = event.pointerId;
      startX = Number(event.clientX || 0);
      startY = Number(event.clientY || 0);
      startScrollLeft = Number(body.scrollLeft || 0);
      dragAxis = "";
      didDrag = false;
      prevScrollSnapType = body.style.scrollSnapType || "";
      body.style.scrollSnapType = "none";
      if (typeof body.setPointerCapture === "function") {
        try {
          body.setPointerCapture(activePointerId);
        } catch {}
      }
    });

    body.addEventListener("pointermove", (event) => {
      if (activePointerId == null || event.pointerId !== activePointerId || !isEnabled()) return;
      const deltaX = Number(event.clientX || 0) - startX;
      const deltaY = Number(event.clientY || 0) - startY;

      if (!dragAxis) {
        if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
        dragAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      }
      if (dragAxis !== "x") return;
      if (!didDrag && Math.abs(deltaX) < 6) return;

      didDrag = true;
      event.preventDefault();
      setScrollLeft(startScrollLeft - deltaX);
    }, { passive: false });

    body.addEventListener("wheel", (event) => {
      if (!isEnabled()) return;
      const maxLeft = Math.max(0, body.scrollWidth - body.clientWidth);
      if (maxLeft <= 0) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const prevLeft = Math.max(0, Number(body.scrollLeft || 0));
      const nextLeft = Math.max(0, Math.min(maxLeft, prevLeft + event.deltaY));
      if (Math.abs(nextLeft - prevLeft) < 0.5) return;

      setScrollLeft(nextLeft);
      event.preventDefault();
    }, { passive: false });

    body.addEventListener("click", (event) => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
      body.addEventListener(eventName, finish);
    });
  }

  function bindVerticalOverflowDragScroll(container, isEnabled) {
    if (!container || container.dataset.verticalDragScrollBound === "1") return;
    container.dataset.verticalDragScrollBound = "1";

    let activePointerId = null;
    let activeTouchId = null;
    let startY = 0;
    let startScrollTop = 0;
    let didDrag = false;
    let suppressClickUntil = 0;

    const isActive = () => (
      typeof isEnabled === "function"
        ? isEnabled()
        : !!isEnabled
    );

    const hasOverflow = () => (
      isActive()
      && (Math.max(0, Number(container.scrollHeight || 0) - Number(container.clientHeight || 0)) > 2)
    );

    const armAutoHideShield = (ms = 520) => {
      suppressFloatingMenuAutoHideUntil = Math.max(
        suppressFloatingMenuAutoHideUntil,
        Date.now() + Math.max(120, Number(ms) || 0),
      );
    };

    const finish = () => {
      if (activePointerId != null && typeof container.releasePointerCapture === "function") {
        try {
          container.releasePointerCapture(activePointerId);
        } catch {}
      }
      activePointerId = null;
      activeTouchId = null;
      startY = 0;
      startScrollTop = 0;
      if (didDrag) {
        suppressClickUntil = Date.now() + 180;
        suppressFloatingMenuDocumentClickUntil = Math.max(suppressFloatingMenuDocumentClickUntil, Date.now() + 320);
        armAutoHideShield(720);
      }
      didDrag = false;
    };

    const applyNextScrollTop = (clientY) => {
      const maxTop = Math.max(0, Number(container.scrollHeight || 0) - Number(container.clientHeight || 0));
      if (maxTop <= 0) return false;
      const deltaY = Number(clientY || 0) - startY;
      if (!didDrag && Math.abs(deltaY) < 6) return false;

      const nextTop = Math.max(0, Math.min(maxTop, startScrollTop - deltaY));
      const currentTop = Number(container.scrollTop || 0);
      if (!didDrag && Math.abs(nextTop - currentTop) < 0.5) return false;
      didDrag = true;
      container.scrollTop = nextTop;
      armAutoHideShield(720);
      return true;
    };

    const resolveTrackedTouch = (touchList) => {
      if (activeTouchId == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === activeTouchId) return touch;
      }
      return null;
    };

    container.addEventListener("pointerdown", (event) => {
      if (!hasOverflow()) return;
      if (event.pointerType === "mouse") return;
      if (event.button !== 0) return;
      activePointerId = event.pointerId;
      startY = Number(event.clientY || 0);
      startScrollTop = Number(container.scrollTop || 0);
      didDrag = false;
      armAutoHideShield(900);
      if (typeof container.setPointerCapture === "function") {
        try {
          container.setPointerCapture(activePointerId);
        } catch {}
      }
      event.stopPropagation();
    });

    container.addEventListener("pointermove", (event) => {
      if (!hasOverflow() || activePointerId == null || event.pointerId !== activePointerId) return;
      if (!applyNextScrollTop(event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    container.addEventListener("touchstart", (event) => {
      if (!hasOverflow() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      startY = Number(touch.clientY || 0);
      startScrollTop = Number(container.scrollTop || 0);
      didDrag = false;
      armAutoHideShield(900);
      event.stopPropagation();
    }, { passive: true });

    container.addEventListener("touchmove", (event) => {
      if (!hasOverflow()) return;
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;
      if (!applyNextScrollTop(touch.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    ["touchend", "touchcancel"].forEach((eventName) => {
      container.addEventListener(eventName, (event) => {
        if (activeTouchId == null) return;
        const touch = resolveTrackedTouch(event.changedTouches);
        if (!touch && eventName !== "touchcancel") return;
        finish();
      }, { passive: true });
    });

    ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
      container.addEventListener(eventName, finish);
    });

    container.addEventListener("wheel", (event) => {
      if (!hasOverflow()) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const maxTop = Math.max(0, Number(container.scrollHeight || 0) - Number(container.clientHeight || 0));
      const prevTop = Math.max(0, Number(container.scrollTop || 0));
      const nextTop = Math.max(0, Math.min(maxTop, prevTop + event.deltaY));
      if (Math.abs(nextTop - prevTop) < 0.5) return;

      container.scrollTop = nextTop;
      armAutoHideShield(720);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    container.addEventListener("click", (event) => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function bindReactionOverflowScrollers() {
    // Drag-to-scroll for additional reactions is disabled for both
    // floating reaction bar and context-menu expanded reactions.
  }

  function bindFloatingMenuInteractionGuards() {
    const roots = [dom.center.contextMenu, dom.center.reactionBar];
    roots.forEach((root) => {
      if (!root || root.dataset.floatingMenuGuardBound === "1") return;
      root.dataset.floatingMenuGuardBound = "1";

      const armShield = (ms = 900) => {
        suppressFloatingMenuAutoHideUntil = Math.max(
          suppressFloatingMenuAutoHideUntil,
          Date.now() + Math.max(120, Number(ms) || 0),
        );
      };

      ["pointerdown", "touchstart", "mousedown"].forEach((eventName) => {
        root.addEventListener(eventName, (event) => {
          armShield(900);
          event.stopPropagation();
        }, { passive: eventName === "touchstart" });
      });

      ["pointermove", "touchmove"].forEach((eventName) => {
        root.addEventListener(eventName, (event) => {
          armShield(720);
          event.stopPropagation();
        }, { passive: true });
      });

      root.addEventListener("wheel", (event) => {
        const verticalDelta = Number(event.deltaY || 0);
        if (Math.abs(verticalDelta) < 0.01) return;

        // The reaction bar already has its own overflow wheel handler.
        // Running a second wheel-driven scroll step here makes desktop
        // scrolling feel jumpy compared with the client chat.
        if (root === dom.center.reactionBar) {
          armShield(720);
          suppressFloatingMenuDocumentClickUntil = Math.max(
            suppressFloatingMenuDocumentClickUntil,
            Date.now() + 220,
          );
          return;
        }

        let scrollContainer = null;
        if (root === dom.center.contextMenu && root.classList.contains("is-reactions-expanded")) {
          scrollContainer = $(".chat-message-menu-reactions", root);
        }
        if (!scrollContainer) return;

        const maxTop = Math.max(
          0,
          Number(scrollContainer.scrollHeight || 0) - Number(scrollContainer.clientHeight || 0),
        );
        if (maxTop <= 0) return;

        const prevTop = Math.max(0, Number(scrollContainer.scrollTop || 0));
        const nextTop = Math.max(0, Math.min(maxTop, prevTop + verticalDelta));
        if (Math.abs(nextTop - prevTop) > 0.5) {
          scrollContainer.scrollTop = nextTop;
        }
        armShield(720);
        suppressFloatingMenuDocumentClickUntil = Math.max(
          suppressFloatingMenuDocumentClickUntil,
          Date.now() + 220,
        );
        event.preventDefault();
        event.stopPropagation();
      }, { passive: false });
    });
  }

  function mountFloatingChatMenus() {
    const targets = [dom.center.contextMenu, dom.center.reactionBar];
    targets.forEach((node) => {
      if (!node || !document.body || node.parentElement === document.body) return;
      document.body.appendChild(node);
    });
  }

  function renderEmojiPicker() {
    if (!dom.center.emojiPopover) return;
    const popover = dom.center.emojiPopover;
    popover.innerHTML = "";

    const categories = getEmojiCategoriesForRender();
    const visibleCategories = EMOJI_CATEGORY_META.filter(({ key }) => {
      const list = Array.isArray(categories[key]) ? categories[key] : [];
      return list.length > 0;
    });

    if (!visibleCategories.length) {
      const empty = document.createElement("div");
      empty.className = "chat-emoji-empty";
      empty.textContent = "\u041d\u0435\u0442 \u044d\u043c\u043e\u0434\u0437\u0438";
      popover.appendChild(empty);
      return;
    }

    if (!visibleCategories.some(({ key }) => key === emojiActiveCategory)) {
      emojiActiveCategory = visibleCategories[0].key;
    }

    const tabs = document.createElement("div");
    tabs.className = "chat-emoji-categories";
    popover.appendChild(tabs);

    const body = document.createElement("div");
    body.className = "chat-emoji-body";
    popover.appendChild(body);

    const tabByKey = new Map();
    const sectionByKey = new Map();

    const updateActiveTabUi = (nextKey) => {
      tabByKey.forEach((tab, key) => {
        tab.classList.toggle("is-active", key === nextKey);
      });
    };

    visibleCategories.forEach((category) => {
      const list = Array.isArray(categories[category.key]) ? categories[category.key] : [];

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `chat-emoji-category-btn${emojiActiveCategory === category.key ? " is-active" : ""}`;
      tab.setAttribute("aria-label", category.label);
      tab.title = category.label;
      tab.innerHTML = `<i class="${category.iconClass}" aria-hidden="true"></i>`;
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const section = sectionByKey.get(category.key);
        if (!section) return;
        emojiActiveCategory = category.key;
        updateActiveTabUi(emojiActiveCategory);
        if (popover.classList.contains("is-mobile-sheet")) {
          body.scrollTo({
            left: Math.max(0, section.offsetLeft || 0),
            behavior: "smooth",
          });
          return;
        }
        body.scrollTo({
          top: Math.max(0, section.offsetTop - 2),
          behavior: "smooth",
        });
      });
      tabByKey.set(category.key, tab);
      tabs.appendChild(tab);

      const section = document.createElement("section");
      section.className = "chat-emoji-section";
      section.setAttribute("data-emoji-category", category.key);
      if (popover.classList.contains("is-mobile-sheet")) {
        const mobileRows = 4;
        const mobileColWidth = 40;
        const mobileGap = 6;
        const columns = Math.max(1, Math.ceil(list.length / mobileRows));
        const computedWidth = (columns * mobileColWidth) + ((columns - 1) * mobileGap);
        section.style.width = `${computedWidth}px`;
        section.style.minWidth = `${computedWidth}px`;
        section.style.maxWidth = `${computedWidth}px`;
        section.style.flex = "0 0 auto";
      } else {
        section.style.width = "";
        section.style.minWidth = "";
        section.style.maxWidth = "";
        section.style.flex = "";
      }

      const title = document.createElement("div");
      title.className = "chat-emoji-title";
      title.textContent = category.label;
      if (popover.classList.contains("is-mobile-sheet")) {
        title.style.whiteSpace = "nowrap";
        title.style.width = "max-content";
        title.style.maxWidth = "none";
      } else {
        title.style.whiteSpace = "";
        title.style.width = "";
        title.style.maxWidth = "";
      }
      section.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "chat-emoji-grid";
      if (popover.classList.contains("is-mobile-sheet")) {
        grid.style.width = "max-content";
        grid.style.gridAutoFlow = "column";
        grid.style.gridTemplateRows = "repeat(4, 40px)";
        grid.style.gridAutoColumns = "40px";
      } else {
        grid.style.width = "";
        grid.style.gridAutoFlow = "";
        grid.style.gridTemplateRows = "";
        grid.style.gridAutoColumns = "";
      }
      list.forEach((emoji) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-emoji-btn";
        btn.setAttribute("aria-label", emoji);
        btn.title = emoji;
        setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--picker");
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (
            emojiPopoverMode === "reaction"
            && emojiPopoverReactionMessageId
            && state.activeClientId
          ) {
            reactMessageFromContext(emojiPopoverReactionMessageId, emoji);
            rememberRecentEmoji(emoji);
            hideEmojiPopover();
            return;
          }
          insertEmojiIntoComposer(emoji);
          rememberRecentEmoji(emoji);
        });
        grid.appendChild(btn);
      });
      section.appendChild(grid);
      sectionByKey.set(category.key, section);
      body.appendChild(section);
    });

    const syncActiveCategoryByScroll = () => {
      if (popover.classList.contains("is-mobile-sheet")) {
        const left = Math.max(0, Number(body.scrollLeft || 0));
        let nextKey = emojiActiveCategory;
        visibleCategories.forEach(({ key }) => {
          const section = sectionByKey.get(key);
          if (!section) return;
          const sectionLeft = Math.max(0, Number(section.offsetLeft || 0));
          if (sectionLeft <= (left + 8)) nextKey = key;
        });
        if (nextKey !== emojiActiveCategory) {
          emojiActiveCategory = nextKey;
          updateActiveTabUi(emojiActiveCategory);
        }
        return;
      }

      const threshold = body.scrollTop + 12;
      let currentKey = emojiActiveCategory;
      visibleCategories.forEach(({ key }) => {
        const section = sectionByKey.get(key);
        if (!section) return;
        if (section.offsetTop <= threshold) currentKey = key;
      });
      if (currentKey !== emojiActiveCategory) {
        emojiActiveCategory = currentKey;
        updateActiveTabUi(emojiActiveCategory);
      }
    };

    bindEmojiPickerDragScroll(body, () => popover.classList.contains("is-mobile-sheet"));
    body.addEventListener("scroll", syncActiveCategoryByScroll, { passive: true });
    updateActiveTabUi(emojiActiveCategory);

    requestAnimationFrame(() => {
      const activeSection = sectionByKey.get(emojiActiveCategory);
      if (popover.classList.contains("is-mobile-sheet")) {
        body.scrollTo({
          left: Math.max(0, activeSection ? (activeSection.offsetLeft || 0) : 0),
          behavior: "auto",
        });
      } else if (activeSection) {
        body.scrollTop = Math.max(0, activeSection.offsetTop - 2);
      }
      requestAnimationFrame(syncActiveCategoryByScroll);
    });
  }

  function updateEmojiPopoverViewportMode() {
    if (!dom.center.emojiPopover) return;
    dom.center.emojiPopover.classList.toggle("is-mobile-sheet", isChatMobileViewport());
  }

  function setEmojiDefaultOpenCategory() {
    const categories = getEmojiCategoriesForRender();
    const recent = Array.isArray(categories.recent) ? categories.recent : [];
    if (recent.length > 0) {
      emojiActiveCategory = "recent";
      return;
    }
    const firstAvailable = EMOJI_CATEGORY_META
      .map(({ key }) => key)
      .find((key) => {
        const list = Array.isArray(categories[key]) ? categories[key] : [];
        return list.length > 0;
      });
    emojiActiveCategory = firstAvailable || "people";
  }

  function syncEmojiPickerViewportPosition() {
    if (!dom.center.emojiPopover || dom.center.emojiPopover.classList.contains("hidden")) return;
    const body = $(".chat-emoji-body", dom.center.emojiPopover);
    if (!body) return;
    const sections = $$(".chat-emoji-section", body);
    if (!sections.length) return;

    const activeSection = sections.find((section) => (
      String(section.getAttribute("data-emoji-category") || "") === String(emojiActiveCategory || "")
    ));
    const targetSection = activeSection || sections[0];
    if (!targetSection) return;

    if (dom.center.emojiPopover.classList.contains("is-mobile-sheet")) {
      body.scrollTo({
        left: Math.max(0, Number(targetSection.offsetLeft || 0)),
        behavior: "auto",
      });
      return;
    }
    body.scrollTop = Math.max(0, Number(targetSection.offsetTop || 0) - 2);
  }

  function syncEmojiSheetOpenState() {
    if (!dom.center.stack || !dom.center.emojiPopover) return;
    const wasOpen = dom.center.stack.classList.contains("is-emoji-sheet-open");
    const isOpen = (
      !dom.center.emojiPopover.classList.contains("hidden")
      && dom.center.emojiPopover.classList.contains("is-mobile-sheet")
      && !dom.center.emojiPopover.classList.contains("is-attach-preview")
    );
    dom.center.stack.classList.toggle("is-emoji-sheet-open", isOpen);
    if (wasOpen !== isOpen) {
      schedulePinnedBottomLayoutSync();
      updateMessagesScrollDownButton();
    }
  }
      
  function bindEmojiPopoverGuard() {
    if (!dom.center.emojiPopover) return;
    if (dom.center.emojiPopover.dataset.clickGuardBound === "1") return;
    dom.center.emojiPopover.dataset.clickGuardBound = "1";
    dom.center.emojiPopover.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    dom.center.emojiPopover.addEventListener("mousedown", (event) => {
      event.stopPropagation();
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

  function collectAllReactionEmojis() {
    const out = [];
    const seen = new Set();
    const push = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      const normalized = normalizeReactionValue(raw) || raw;
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(raw);
    };

    const peopleSource = (emojiCategories.people && emojiCategories.people.length)
      ? emojiCategories.people
      : (EMOJI_FALLBACK_CATEGORIES.people || []);
    peopleSource.forEach(push);

    return out.slice(0, EMOJI_REACTION_POOL_LIMIT);
  }

  function ensureReactionBarAllEmojiButtons() {
    if (!dom.center.reactionBar) return;
    $$('[data-chat-reaction-slot="extra-all"]', dom.center.reactionBar).forEach((node) => node.remove());
    const toggleBtn = $('[data-chat-reaction="__toggle_more__"]', dom.center.reactionBar);
    if (!toggleBtn) return;

    const skip = new Set();
    QUICK_REACTIONS.forEach((emoji) => {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });
    EXTRA_REACTIONS.forEach((emoji) => {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });

    const fragment = document.createDocumentFragment();
    collectAllReactionEmojis().forEach((emoji) => {
      const key = normalizeReactionValue(emoji);
      if (!key || skip.has(key)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-reaction-btn chat-reaction-extra chat-reaction-extra--dynamic";
      btn.setAttribute("data-chat-reaction-slot", "extra-all");
      btn.setAttribute("data-chat-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--reaction");
      fragment.appendChild(btn);
    });

    toggleBtn.before(fragment);
  }

  function ensureContextMenuAllEmojiButtons(menuRoot = dom.center.contextMenu) {
    if (!menuRoot) return;
    $$('[data-chat-msg-reaction-slot="extra-all"]', menuRoot).forEach((node) => node.remove());
    const toggleBtn = $('[data-chat-msg-reaction="__toggle_more__"]', menuRoot);
    if (!toggleBtn) return;

    const skip = new Set();
    QUICK_REACTIONS.forEach((emoji) => {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });
    EXTRA_REACTIONS.forEach((emoji) => {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });

    const fragment = document.createDocumentFragment();
    collectAllReactionEmojis().forEach((emoji) => {
      const key = normalizeReactionValue(emoji);
      if (!key || skip.has(key)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-message-menu-reaction chat-message-menu-reaction--extra chat-message-menu-reaction--dynamic";
      btn.setAttribute("data-chat-msg-reaction-slot", "extra-all");
      btn.setAttribute("data-chat-msg-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--reaction");
      fragment.appendChild(btn);
    });

    toggleBtn.before(fragment);
  }

  function normalizeContextMenuReactionButtons(menuRoot = dom.center.contextMenu) {
    if (!menuRoot) return;

    $$('[data-chat-msg-reaction-slot="quick"]', menuRoot).forEach((btn, index) => {
      const emoji = QUICK_REACTIONS[index] || QUICK_REACTIONS[QUICK_REACTIONS.length - 1];
      btn.setAttribute("data-chat-msg-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--reaction");
    });

    $$('[data-chat-msg-reaction-slot="extra"]', menuRoot).forEach((btn, index) => {
      const emoji = EXTRA_REACTIONS[index] || EXTRA_REACTIONS[EXTRA_REACTIONS.length - 1];
      btn.setAttribute("data-chat-msg-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "chat-emoji-glyph chat-emoji-glyph--reaction");
    });
  }

  function refreshContextMenuReactionBoxPosition() {
    if (!dom.center.contextMenu || dom.center.contextMenu.classList.contains("hidden")) return;
    if (mobileContextSceneState) {
      if (!layoutMobileContextScene({ animateRelayout: true })) hideMessageContextMenu();
      return;
    }
    if (window.innerWidth <= 768 && state.contextMessageId) {
      repositionMessageContextMenu(state.contextMessageId, { forceMobile: true });
      return;
    }
    const anchor = contextMenuAnchorPoint;
    if (anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)) {
      positionFloatingBox(dom.center.contextMenu, anchor.x, anchor.y, 8);
      return;
    }
    const left = Number.parseFloat(dom.center.contextMenu.style.left || "");
    const top = Number.parseFloat(dom.center.contextMenu.style.top || "");
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    positionFloatingBox(dom.center.contextMenu, left, top, 8);
  }

  function setContextMenuReactionsExpanded(expanded) {
    if (!dom.center.contextMenu) return;
    const isExpanded = !!expanded;
    const scheduleContextSceneRelayout = (doubleFrame = false) => {
      requestAnimationFrame(() => {
        const run = () => {
          if (!dom.center.contextMenu || dom.center.contextMenu.classList.contains("hidden")) return;
          if (!!dom.center.contextMenu.classList.contains("is-reactions-expanded") !== isExpanded) return;
          refreshContextMenuReactionBoxPosition();
        };
        if (doubleFrame) {
          requestAnimationFrame(run);
        } else {
          run();
        }
      });
    };
    if (isExpanded) {
      clearContextMenuTouchGuard();
      ensureContextMenuAllEmojiButtons(dom.center.contextMenu);
      ensureEmojiDatasetLoaded().then(() => {
        if (!dom.center.contextMenu || dom.center.contextMenu.classList.contains("hidden")) return;
        if (!dom.center.contextMenu.classList.contains("is-reactions-expanded")) return;
        ensureContextMenuAllEmojiButtons(dom.center.contextMenu);
        scheduleContextSceneRelayout(false);
      }).catch(() => {});
    }
    dom.center.contextMenu.classList.toggle("is-reactions-expanded", isExpanded);
    scheduleContextSceneRelayout(false);
    const toggleBtn = $('[data-chat-msg-reaction="__toggle_more__"]', dom.center.contextMenu);
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", isExpanded ? "Скрыть дополнительные реакции" : "Показать ещё реакции");
  }

  function setReactionBarExpanded(expanded) {
    if (!dom.center.reactionBar) return;
    const isExpanded = !!expanded;
    if (isExpanded) {
      ensureReactionBarAllEmojiButtons();
      ensureEmojiDatasetLoaded().then(() => {
        if (!dom.center.reactionBar || !dom.center.reactionBar.classList.contains("is-expanded")) return;
        ensureReactionBarAllEmojiButtons();
        const anchorRect = reactionBarAnchorRect
          || (dom.center.contextMenu && !dom.center.contextMenu.classList.contains("hidden")
            ? dom.center.contextMenu.getBoundingClientRect()
            : null);
        if (anchorRect) positionReactionBar(anchorRect);
      }).catch(() => {});
    }
    dom.center.reactionBar.classList.toggle("is-expanded", isExpanded);
    if (!dom.center.reactionBar.classList.contains("hidden")) {
      const anchorRect = reactionBarAnchorRect
        || (dom.center.contextMenu && !dom.center.contextMenu.classList.contains("hidden")
          ? dom.center.contextMenu.getBoundingClientRect()
          : null);
      if (anchorRect) positionReactionBar(anchorRect);
    }
    const toggleBtn = $('[data-chat-reaction="__toggle_more__"]', dom.center.reactionBar);
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", isExpanded ? "Скрыть дополнительные реакции" : "Показать ещё реакции");
  }

  function decorateComposerEmojiControls() {
    if (dom.center.emojiBtn) {
      dom.center.emojiBtn.classList.remove("has-emoji-content");
      dom.center.emojiBtn.textContent = "";
      const smileIcon = document.createElement("i");
      smileIcon.className = "far fa-smile";
      smileIcon.setAttribute("aria-hidden", "true");
      dom.center.emojiBtn.appendChild(smileIcon);
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
    if (adminChatThreadTouchGestureActive) return false;
    if (isAdminChatThreadEdgeSpringPositionControlled()) return false;
    const wrap = dom.center.messagesWrap;
    // If the thread fully fits into the viewport, treat it as bottom-pinned too.
    // This preserves the visual bottom anchor when desktop width changes make
    // bubbles wrap and the same thread suddenly becomes scrollable.
    if (!isAdminChatThreadVerticallyScrollable(wrap)) return hasAdminChatThreadMessages();
    return (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight) <= CHAT_STICKY_BOTTOM_THRESHOLD_PX;
  }

  function shouldPersistThreadPinnedBottom(wrap = dom.center.messagesWrap) {
    if (!wrap) return false;
    if (adminChatThreadTouchGestureActive) return false;
    if (!isAdminChatThreadVerticallyScrollable(wrap)) return hasAdminChatThreadMessages();
    return (wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight) <= CHAT_PINNED_BOTTOM_PERSIST_THRESHOLD_PX;
  }

  function getAdminChatThreadInputAnchorNode() {
    const focused = getFocusedAdminChatTextInput();
    if (focused instanceof HTMLElement) return focused;
    if (dom.center.input instanceof HTMLElement) return dom.center.input;
    if (dom.center.composer instanceof HTMLElement) return dom.center.composer;
    if (dom.center.footerPanel instanceof HTMLElement) return dom.center.footerPanel;
    return null;
  }

  function getAdminChatThreadInputAnchorSnapshot() {
    const wrap = dom.center.messagesWrap;
    const anchor = getAdminChatThreadInputAnchorNode();
    if (!(wrap instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return null;

    const wrapRect = wrap.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    if (!Number.isFinite(wrapRect.top) || wrapRect.height <= 0) return null;

    const anchorTopInWrap = Number(anchorRect.top || 0) - Number(wrapRect.top || 0);
    if (!Number.isFinite(anchorTopInWrap)) return null;
    // Keep raw offset even when anchor is temporarily outside wrap bounds during keyboard motion.
    const contentTopAtAnchor = Number(wrap.scrollTop || 0) + anchorTopInWrap;
    if (!Number.isFinite(contentTopAtAnchor)) return null;

    return {
      contentTopAtAnchor: Math.max(0, contentTopAtAnchor),
    };
  }

  function getMessagesBottomDistanceSnapshot() {
    const wrap = dom.center.messagesWrap;
    if (!wrap) return null;
    const distance = Number(wrap.scrollHeight || 0) - Number(wrap.clientHeight || 0) - Number(wrap.scrollTop || 0);
    if (!Number.isFinite(distance)) return null;
    return Math.max(0, distance);
  }

  function applyMessagesBottomDistanceSnapshot(distance) {
    const wrap = dom.center.messagesWrap;
    if (!wrap) return false;
    if (isAdminChatThreadEdgeSpringPositionControlled()) return false;
    const raw = Number(distance);
    if (!Number.isFinite(raw)) return false;
    const maxTop = Math.max(0, Number(wrap.scrollHeight || 0) - Number(wrap.clientHeight || 0));
    const nextTop = Math.max(0, Math.min(maxTop, maxTop - Math.max(0, raw)));
    wrap.scrollTop = nextTop;
    updateMessagesScrollDownButton();
    return true;
  }

  function applyAdminChatThreadInputAnchorSnapshot(snapshot) {
    const wrap = dom.center.messagesWrap;
    const anchor = getAdminChatThreadInputAnchorNode();
    if (!(wrap instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return false;
    if (isAdminChatThreadEdgeSpringPositionControlled()) return false;

    const contentTopAtAnchor = Number(snapshot && snapshot.contentTopAtAnchor);
    if (!Number.isFinite(contentTopAtAnchor)) return false;

    const wrapRect = wrap.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    if (!Number.isFinite(wrapRect.top) || wrapRect.height <= 0) return false;

    const anchorTopInWrap = Number(anchorRect.top || 0) - Number(wrapRect.top || 0);
    if (!Number.isFinite(anchorTopInWrap)) return false;
    const maxTop = Math.max(0, Number(wrap.scrollHeight || 0) - Number(wrap.clientHeight || 0));
    const nextTop = Math.max(0, Math.min(maxTop, contentTopAtAnchor - anchorTopInWrap));
    wrap.scrollTop = nextTop;
    updateMessagesScrollDownButton();
    return true;
  }

  function isThreadPinnedBottomPreferred(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    return state.threadPinnedBottomByClient[key] === true
      || state.store?.ui?.threadPinnedBottomByClient?.[key] === true;
  }

  function setRenderedThreadClientKey(clientId) {
    const key = normalizeClientIdKey(clientId);
    [dom.center.messagesWrap, dom.center.messages].forEach((node) => {
      if (!node || !node.dataset) return;
      if (key) node.dataset.renderedClientId = key;
      else delete node.dataset.renderedClientId;
    });
  }

  function getRenderedThreadClientKey() {
    const wrapKey = normalizeClientIdKey(dom.center.messagesWrap?.dataset?.renderedClientId);
    const messagesKey = normalizeClientIdKey(dom.center.messages?.dataset?.renderedClientId);
    return wrapKey || messagesKey || "";
  }

  function getPendingScrollMessageIdSet(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    if (!(state.pendingScrollMessageIdsByClient[key] instanceof Set)) {
      state.pendingScrollMessageIdsByClient[key] = new Set();
    }
    return state.pendingScrollMessageIdsByClient[key];
  }

  function getPendingScrollNewCount(clientId = state.activeClientId) {
    const set = getPendingScrollMessageIdSet(clientId);
    if (!set) return 0;
    return set.size;
  }

  function collectUnreadIncomingBelowViewportMessageIds(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key || Number(state.activeClientId) !== Number(key)) return [];
    if (!dom.center.messagesWrap || !dom.center.messages) return [];

    const wrapRect = dom.center.messagesWrap.getBoundingClientRect();
    const bottomEdge = wrapRect.bottom - 6;
    if (!Number.isFinite(bottomEdge)) return [];

    const out = [];
    dom.center.messages.querySelectorAll(".chat-message[data-message-id]").forEach((node) => {
      const id = String(node.getAttribute("data-message-id") || "");
      if (!id) return;
      const msg = findThreadMessage(key, id);
      if (!msg || msg.direction !== "in" || isMessageRead(msg)) return;
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= bottomEdge) return;
      out.push(id);
    });
    return out;
  }

  function getScrollDownBadgeCount(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return 0;
    const ids = new Set();
    const pendingSet = getPendingScrollMessageIdSet(key);
    if (pendingSet) {
      pendingSet.forEach((id) => {
        const value = String(id || "");
        if (value) ids.add(value);
      });
    }
    collectUnreadIncomingBelowViewportMessageIds(key).forEach((id) => {
      const value = String(id || "");
      if (value) ids.add(value);
    });
    return ids.size;
  }

  function animateCountBadgeTick(badge) {
    if (!badge) return;
    badge.classList.remove("is-count-tick");
    // Force reflow so repeated updates replay animation.
    // eslint-disable-next-line no-unused-expressions
    badge.offsetWidth;
    badge.classList.add("is-count-tick");
  }

  function addPendingScrollMessageIds(clientId, messageIds) {
    const key = normalizeClientIdKey(clientId);
    const ids = Array.isArray(messageIds) ? messageIds : [];
    if (!key || !ids.length) return;
    const set = getPendingScrollMessageIdSet(key);
    if (!set) return;
    let changed = false;
    ids.forEach((id) => {
      const value = String(id || "");
      if (!value || set.has(value)) return;
      set.add(value);
      changed = true;
    });
    if (changed) {
      state.pendingScrollNewByClient[key] = set.size;
      if (Number(state.activeClientId) === Number(key)) {
        syncPendingScrollCountByViewport(key);
      }
      updateMessagesScrollDownButton();
    }
  }

  function clearPendingScrollNewCount(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const set = getPendingScrollMessageIdSet(key);
    if (!set || set.size === 0) return;
    set.clear();
    state.pendingScrollNewByClient[key] = 0;
    updateMessagesScrollDownButton();
  }

  function syncPendingScrollCountByViewport(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key || !dom.center.messagesWrap || !dom.center.messages) return;
    const set = getPendingScrollMessageIdSet(key);
    if (!set || set.size === 0) return;

    const wrapRect = dom.center.messagesWrap.getBoundingClientRect();
    const topEdge = wrapRect.top + 6;
    const bottomEdge = wrapRect.bottom - 6;
    if (bottomEdge <= topEdge) return;

    const nodeById = new Map();
    dom.center.messages.querySelectorAll(".chat-message[data-message-id]").forEach((node) => {
      const id = String(node.getAttribute("data-message-id") || "");
      if (!id) return;
      nodeById.set(id, node);
    });

    let changed = false;
    Array.from(set).forEach((id) => {
      const node = nodeById.get(id);
      if (!node) {
        // Message is no longer in DOM/thread (reloaded, trimmed, hidden): drop stale pending id.
        set.delete(id);
        changed = true;
        return;
      }
      const rect = node.getBoundingClientRect();
      const isVisible = rect.bottom > topEdge && rect.top < bottomEdge;
      if (!isVisible) return;
      set.delete(id);
      changed = true;
    });

    if (!changed) return;
    state.pendingScrollNewByClient[key] = set.size;
    updateMessagesScrollDownButton();
  }

  function saveThreadScrollPosition(clientId = state.activeClientId, options = {}) {
    const key = normalizeClientIdKey(clientId);
    const wrap = dom.center.messagesWrap;
    if (!key || !wrap) return;
    const nextTop = toStoredScrollTop(wrap.scrollTop);
    const pinnedBottom = shouldPersistThreadPinnedBottom(wrap);
    state.threadScrollTopByClient[key] = nextTop;
    state.threadPinnedBottomByClient[key] = pinnedBottom;
    const ui = ensureUiStoreState();
    ui.threadScrollTopByClient[key] = nextTop;
    ui.threadPinnedBottomByClient[key] = pinnedBottom;
    scheduleUiStatePersist();
    if (options && options.forcePersist === true) {
      flushUiStatePersist();
    }
  }

  function restoreThreadScrollPosition(clientId = state.activeClientId) {
    const key = normalizeClientIdKey(clientId);
    const wrap = dom.center.messagesWrap;
    if (!key || !wrap) return false;
    const pinnedBottom = state.threadPinnedBottomByClient[key] === true
      || state.store?.ui?.threadPinnedBottomByClient?.[key] === true;
    if (pinnedBottom) {
      const maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      wrap.scrollTop = maxTop;
      state.threadPinnedBottomByClient[key] = true;
      state.threadScrollTopByClient[key] = maxTop;
      const ui = ensureUiStoreState();
      ui.threadPinnedBottomByClient[key] = true;
      ui.threadScrollTopByClient[key] = maxTop;
      return true;
    }
    const fallbackTop = Number(state.store?.ui?.threadScrollTopByClient?.[key]);
    const raw = Number.isFinite(Number(state.threadScrollTopByClient[key]))
      ? Number(state.threadScrollTopByClient[key])
      : fallbackTop;
    if (!Number.isFinite(raw)) return false;
    const maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    const nextTop = Math.max(0, Math.min(raw, maxTop));
    wrap.scrollTop = nextTop;
    state.threadScrollTopByClient[key] = nextTop;
    const ui = ensureUiStoreState();
    ui.threadScrollTopByClient[key] = nextTop;
    return true;
  }

  function updateMessagesScrollDownButton() {
    const wrap = dom.center.messagesWrap;
    const btn = dom.center.scrollDownBtn;
    if (!wrap) return;
    syncAdminMobileThreadBottomInset();
    if (!btn) return;
    syncAdminMobileChatScrollDownPosition();

    const hiddenDistance = wrap.scrollHeight - wrap.clientHeight - wrap.scrollTop;
    const badgeCount = getScrollDownBadgeCount();
    const forcedVisible = Date.now() < Number(scrollDownForceVisibleUntil || 0);
    if (!forcedVisible && btn.dataset.forceVisible === "1") {
      btn.dataset.forceVisible = "0";
      btn.style.removeProperty("display");
    }
    const shouldShow = forcedVisible || badgeCount > 0 || hiddenDistance >= CHAT_SCROLL_DOWN_SHOW_DISTANCE_PX;
    const wasHidden = btn.classList.contains("hidden");
    btn.classList.toggle("hidden", !shouldShow);
    if (shouldShow && wasHidden) {
      requestAnimationFrame(syncAdminMobileChatScrollDownPosition);
    }

    const badge = dom.center.scrollDownBadge;
    if (!badge) return;
    if (badgeCount <= 0) {
      badge.textContent = "";
      badge.classList.add("hidden");
      return;
    }
    const nextText = badgeCount > 99 ? "99+" : String(badgeCount);
    if (badge.textContent !== nextText) {
      badge.textContent = nextText;
      animateCountBadgeTick(badge);
    }
    badge.classList.remove("hidden");
  }

  function forceShowMessagesScrollDownButton(durationMs = CHAT_SCROLL_DOWN_FORCE_SHOW_MS) {
    const btn = dom.center.scrollDownBtn;
    if (!btn) return;
    const duration = Math.max(160, Number(durationMs || 0) || CHAT_SCROLL_DOWN_FORCE_SHOW_MS);
    scrollDownForceVisibleUntil = Date.now() + duration;
    if (scrollDownForceVisibleReleaseTimer) {
      window.clearTimeout(scrollDownForceVisibleReleaseTimer);
      scrollDownForceVisibleReleaseTimer = 0;
    }
    btn.dataset.forceVisible = "1";
    btn.style.setProperty("display", "inline-flex", "important");
    btn.classList.remove("hidden");
    scrollDownForceVisibleReleaseTimer = window.setTimeout(() => {
      scrollDownForceVisibleReleaseTimer = 0;
      clearForcedMessagesScrollDownButtonVisibility();
      updateMessagesScrollDownButton();
    }, duration + 24);
  }

  function clearForcedMessagesScrollDownButtonVisibility() {
    if (scrollDownForceVisibleReleaseTimer) {
      window.clearTimeout(scrollDownForceVisibleReleaseTimer);
      scrollDownForceVisibleReleaseTimer = 0;
    }
    scrollDownForceVisibleUntil = 0;
    const btn = dom.center.scrollDownBtn;
    if (btn && btn.dataset.forceVisible === "1") {
      btn.dataset.forceVisible = "0";
      btn.style.removeProperty("display");
    }
  }

  function stopMessagesSmoothScroll() {
    if (!state.messagesScrollRaf) return;
    cancelAnimationFrame(state.messagesScrollRaf);
    state.messagesScrollRaf = 0;
  }

  function scrollMessagesToBottom(options = {}) {
    const wrap = dom.center.messagesWrap;
    if (!wrap) return;
    clearForcedMessagesScrollDownButtonVisibility();

    const clientIdAtSchedule = options.clientIdAtSchedule !== undefined
      ? String(options.clientIdAtSchedule || "")
      : "";
    if (clientIdAtSchedule && String(state.activeClientId || "") !== clientIdAtSchedule) {
      return;
    }

    const deferIfTouchGesture = options.deferIfTouchGesture !== false;
    const deferredAttempt = Math.max(0, Number(options.deferredAttempt || 0));
    if (
      deferIfTouchGesture
      && isAdminMobileChatLayout()
      && adminChatThreadTouchGestureActive
      && deferredAttempt < 16
    ) {
      if (!adminChatDeferredAutoScrollTimer) {
        const retryDelay = 120;
        adminChatDeferredAutoScrollTimer = window.setTimeout(() => {
          adminChatDeferredAutoScrollTimer = 0;
          scrollMessagesToBottom({
            ...options,
            deferredAttempt: deferredAttempt + 1,
            clientIdAtSchedule: clientIdAtSchedule || String(state.activeClientId || ""),
          });
        }, retryDelay);
      }
      return;
    }

    const behavior = String(options.behavior || "auto");
    const keepPending = options.keepPending === true;
    const durationRaw = Number(options.duration);
    const duration = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : CHAT_AUTOSCROLL_MS;
    const target = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    const startTop = Number(wrap.scrollTop || 0);
    const delta = target - startTop;

    if (behavior !== "smooth-fast") {
      stopMessagesSmoothScroll();
      wrap.scrollTop = target;
      if (!keepPending) clearPendingScrollNewCount();
      updateMessagesScrollDownButton();
      return;
    }
    if (Math.abs(delta) < 1) return;
    if (Math.abs(delta) < 20) {
      stopMessagesSmoothScroll();
      wrap.scrollTop = target;
      if (!keepPending) clearPendingScrollNewCount();
      updateMessagesScrollDownButton();
      return;
    }

    stopMessagesSmoothScroll();
    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

    const step = (now) => {
      if (!dom.center.messagesWrap) {
        state.messagesScrollRaf = 0;
        return;
      }
      const currentTime = typeof now === "number" ? now : Date.now();
      const progress = Math.min(1, (currentTime - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      wrap.scrollTop = startTop + (delta * eased);
      if (progress < 1) {
        state.messagesScrollRaf = requestAnimationFrame(step);
        return;
      }
      state.messagesScrollRaf = 0;
      if (Math.abs(target - Number(wrap.scrollTop || 0)) > 0.5) {
        wrap.scrollTop = target;
      }
      if (!keepPending) clearPendingScrollNewCount();
      updateMessagesScrollDownButton();
    };

    state.messagesScrollRaf = requestAnimationFrame(step);
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
      const stickToBottom = options && options.stickToBottom === true;
      const skipThreadViewportSync = options && options.skipThreadViewportSync === true;
      const wrap = dom.center.messagesWrap;
      const composer = input.closest(".chat-main-composer");
      const wasNearBottom = skipThreadViewportSync ? false : shouldKeepMessagesPinnedToBottom();
      const prevBottomDistance = skipThreadViewportSync ? null : getMessagesBottomDistanceSnapshot();
      const prevComposerHeight = composer ? Number(composer.getBoundingClientRect().height || 0) : 0;

      const inputStyles = window.getComputedStyle(input);
      const minHeight = parseFloat(inputStyles.minHeight) || 45;
      const maxHeight = parseFloat(inputStyles.maxHeight) || 160;
      const value = String(input.value || "");

      if (!value) {
        input.style.height = `${minHeight}px`;
        input.style.overflowY = "hidden";
        preview.classList.add("hidden");
        preview.textContent = "";
        input.classList.remove("is-rich-emoji-preview");
        const nextComposerHeight = composer ? Number(composer.getBoundingClientRect().height || 0) : prevComposerHeight;
        const composerHeightDelta = Math.abs(nextComposerHeight - prevComposerHeight);
        const keepBottomPinned = (
          stickToBottom
          || wasNearBottom
          || (
            Number.isFinite(prevBottomDistance)
            && prevBottomDistance <= Math.max(CHAT_STICKY_BOTTOM_THRESHOLD_PX + 12, composerHeightDelta + 24)
          )
        );
        if (keepBottomPinned && wrap && Number.isFinite(prevBottomDistance)) {
          applyMessagesBottomDistanceSnapshot(prevBottomDistance);
          saveThreadScrollPosition(state.activeClientId);
        } else {
          updateMessagesScrollDownButton();
        }
        return;
      }

      input.style.height = "auto";
      const fullHeight = input.scrollHeight || minHeight;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, fullHeight));
      input.style.height = `${nextHeight}px`;
      input.style.overflowY = fullHeight > maxHeight + 1 ? "auto" : "hidden";
      const nextComposerHeight = composer ? Number(composer.getBoundingClientRect().height || 0) : prevComposerHeight;
      const composerHeightDelta = Math.abs(nextComposerHeight - prevComposerHeight);
      const keepBottomPinned = (
        stickToBottom
        || wasNearBottom
        || (
          Number.isFinite(prevBottomDistance)
          && prevBottomDistance <= Math.max(CHAT_STICKY_BOTTOM_THRESHOLD_PX + 12, composerHeightDelta + 24)
        )
      );

      if (!value || !hasEmojiInText(value)) {
        preview.classList.add("hidden");
        preview.textContent = "";
        input.classList.remove("is-rich-emoji-preview");
        if (keepBottomPinned && wrap && Number.isFinite(prevBottomDistance)) {
          applyMessagesBottomDistanceSnapshot(prevBottomDistance);
          saveThreadScrollPosition(state.activeClientId);
        } else {
          updateMessagesScrollDownButton();
        }
        return;
      }

      preview.classList.remove("hidden");
      input.classList.add("is-rich-emoji-preview");
      renderEmojiMessageText(preview, value, "chat-emoji-glyph chat-emoji-glyph--input-inline");
      preview.style.transform = `translate(${-Math.max(0, input.scrollLeft)}px, ${-Math.max(0, input.scrollTop)}px)`;

      if (keepBottomPinned && wrap && Number.isFinite(prevBottomDistance)) {
        applyMessagesBottomDistanceSnapshot(prevBottomDistance);
        saveThreadScrollPosition(state.activeClientId);
      } else {
        updateMessagesScrollDownButton();
      }
    };

    input.__syncEmojiPreview = sync;
    input.addEventListener("input", () => sync({}));
    ["scroll", "click", "keyup", "focus", "blur"].forEach((eventName) => {
      input.addEventListener(eventName, () => sync());
    });
    window.addEventListener("resize", () => sync());

    input.dataset.emojiPreviewReady = "1";
    sync({});
  }

  function setComposerEnabled(enabled) {
    [dom.center.input, dom.center.attachBtn, dom.center.emojiBtn, dom.center.sendBtn].forEach((el) => {
      if (!el) return;
      el.disabled = !enabled;
    });
    [dom.center.attachPreviewCaption, dom.center.attachPreviewEmojiBtn, dom.center.attachPreviewSendBtn].forEach((el) => {
      if (!el) return;
      el.disabled = !enabled;
    });
    if (!enabled) {
      stopLocalTypingSession(state.activeClientId, { flush: true });
      closeAttachPreview({ focusComposer: false, clearPersistedDraft: false });
    }
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
    syncAdminMobileChatOverlayLayout();
    schedulePinnedBottomLayoutSync();

    if (dom.center.selectionCount) {
      dom.center.selectionCount.textContent = `Выбрано ${count} ${getMessagesWord(count)}`;
    }
    syncRenderedMessageSelectionState();
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
    markThreadMutated(clientId);
    saveStore();
    enqueueRemoteMutation(clientId, () => remotePatchMessage(clientId, messageId, {
      text: msg.text,
      editedAt: msg.editedAt,
    }));
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
    markThreadMutated(clientId);
    syncRemoteSummaryPreviewFromLocalThread(clientId);
    saveStore();
    enqueueRemoteMutation(clientId, () => remoteDeleteMessage(clientId, messageId));
    return true;
  }

  function hideThreadMessagesLocally(clientId, messageIds) {
    const ids = new Set((Array.isArray(messageIds) ? messageIds : []).map((id) => String(id || "")).filter(Boolean));
    if (!ids.size) return false;

    const thread = getThread(clientId);
    let changed = false;
    thread.forEach((msg) => {
      const id = String(msg?.id || "");
      if (!id) return;
      if (!ids.has(id)) return;
      if (setMessageHiddenLocally(clientId, id, true, { persist: false })) changed = true;
    });

    ids.forEach((id) => state.selectedMessageIds.delete(id));
    if (state.selectedMessageIds.size === 0) setSelectionMode(false);
    if (changed) {
      markThreadMutated(clientId);
      syncRemoteSummaryPreviewFromLocalThread(clientId);
      saveStore();
    }
    return changed;
  }

  function getCachedActiveClientProfile(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const cached = state.clientProfileCache.get(key);
    if (!cached || typeof cached !== "object") return null;
    const expiresAt = Number(cached.expiresAt || 0);
    if (Date.now() > expiresAt) {
      state.clientProfileCache.delete(key);
      return null;
    }
    return cached.value && typeof cached.value === "object" ? { ...cached.value } : null;
  }

  function getCachedActiveClientOrders(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const cached = state.clientOrdersCache.get(key);
    if (!cached || typeof cached !== "object") return null;
    const expiresAt = Number(cached.expiresAt || 0);
    if (Date.now() > expiresAt) {
      state.clientOrdersCache.delete(key);
      return null;
    }
    return Array.isArray(cached.value) ? cached.value.map((row) => ({ ...row })) : null;
  }

  function setCachedActiveClientProfile(clientId, value) {
    const key = normalizeClientIdKey(clientId);
    if (!key || !value || typeof value !== "object") return;
    state.clientProfileCache.set(key, {
      value: { ...value },
      expiresAt: Date.now() + ACTIVE_CLIENT_CACHE_TTL_MS,
    });
  }

  function setCachedActiveClientOrders(clientId, rows) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const safeRows = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
    state.clientOrdersCache.set(key, {
      value: safeRows,
      expiresAt: Date.now() + ACTIVE_CLIENT_CACHE_TTL_MS,
    });
  }

  function hydrateActiveClientFromSharedCache(clientId) {
    const shared = getSharedClientDetailsFromLocalStorage(clientId);
    if (!shared) return false;
    if (shared.client) {
      state.activeClient = { ...state.activeClient, ...shared.client };
      setCachedActiveClientProfile(clientId, state.activeClient);
      syncClientIdentityIntoList(clientId, state.activeClient);
    }
    // Header orders must come from fresh API only (no shared-cache hydration).
    return true;
  }

  function syncHiddenMessagesForActor(clientId, messageIds) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (!ids.length) return;
    ids.forEach((messageId) => {
      enqueueRemoteMutation(key, () => remotePatchMessage(key, messageId, { hidden: true }));
    });
  }

  function toggleThreadMessagePinned(clientId, messageId) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg) return false;
    msg.pinned = !msg.pinned;
    markThreadMutated(clientId);
    saveStore();
    enqueueRemoteMutation(clientId, () => remotePatchMessage(clientId, messageId, {
      pinned: msg.pinned === true,
    }));
    return true;
  }

  function setThreadMessageReaction(clientId, messageId, reaction) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg) return false;
    if (!setMessageActorReaction(msg, CHAT_REACTION_ACTOR, reaction)) return false;
    markThreadMutated(clientId);
    saveStore();
    setPendingThreadReactionOverride(clientId, messageId, getMessageActorReaction(msg, CHAT_REACTION_ACTOR));
    markPendingThreadReactionPop(clientId, messageId);
    triggerReactionFeedback();
    enqueueRemoteMutation(clientId, () => remotePatchMessage(clientId, messageId, {
      reaction: String(getMessageActorReaction(msg, CHAT_REACTION_ACTOR) || ""),
      reactions: ensureMessageReactions(msg),
    }));
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

  function setOutgoingDeliveryStatus(clientId, messageId, nextStatus, options = {}) {
    const msg = findThreadMessage(clientId, messageId);
    if (!msg || msg.direction !== "out") return false;

    const target = String(nextStatus || "").toLowerCase();
    if (!["sent", "delivered", "read"].includes(target)) return false;

    const current = getOutgoingDeliveryStatus(msg);
    if (getDeliveryStatusRank(target) <= getDeliveryStatusRank(current)) return false;

    msg.deliveryStatus = target;
    if (target === "delivered" && !msg.deliveredAt) msg.deliveredAt = new Date().toISOString();
    if (target === "read" && !msg.readAt) msg.readAt = new Date().toISOString();
    markThreadMutated(clientId);
    saveStore();
    if (options.persistRemote !== false) {
      enqueueRemoteMutation(clientId, () => remotePatchMessage(clientId, messageId, {
        deliveryStatus: msg.deliveryStatus,
        deliveredAt: msg.deliveredAt || "",
        readAt: msg.readAt || "",
      }));
    }

    if (Number(state.activeClientId) === Number(clientId)) renderMessages();
    applyClientFilter();
    return true;
  }

  function applyOutgoingReadReceipt(clientId, messageIds, options = {}) {
    const key = normalizeClientIdKey(clientId);
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (!key || !ids.length) return false;

    const readAtRaw = String(options.readAt || "").trim();
    const parsedReadAt = readAtRaw ? new Date(readAtRaw) : null;
    const readAtIso = parsedReadAt && !Number.isNaN(parsedReadAt.getTime())
      ? parsedReadAt.toISOString()
      : new Date().toISOString();

    let changed = false;
    ids.forEach((messageId) => {
      const msg = findThreadMessage(key, messageId);
      if (!msg || msg.direction !== "out") return;
      const hadReadAt = !!msg.readAt;
      const hadDeliveredAt = !!msg.deliveredAt;
      const prevStatus = getOutgoingDeliveryStatus(msg);
      msg.deliveryStatus = "read";
      if (!msg.deliveredAt) msg.deliveredAt = readAtIso;
      if (!msg.readAt) msg.readAt = readAtIso;
      if (prevStatus !== "read" || !hadReadAt || !hadDeliveredAt) {
        changed = true;
      }
    });

    if (!changed) return false;
    markThreadMutated(key);
    saveStore();
    if (Number(state.activeClientId) === Number(key)) renderMessages();
    applyClientFilter();
    return true;
  }

  function applyImmediateThreadReadPayload(clientId, payload = {}) {
    const direction = String(payload.read_direction || payload.readDirection || "").toLowerCase();
    if (direction !== "out") return false;
    const ids = Array.isArray(payload.read_message_ids)
      ? payload.read_message_ids
      : (Array.isArray(payload.readMessageIds) ? payload.readMessageIds : []);
    if (!ids.length) return false;
    return applyOutgoingReadReceipt(clientId, ids, {
      readAt: String(payload.read_at || payload.readAt || ""),
    });
  }

  function scheduleOutgoingDeliveryProgress(clientId, messageId) {
    const id = String(messageId || "");
    if (!id) return;

    window.setTimeout(() => {
      setOutgoingDeliveryStatus(clientId, id, "delivered", { persistRemote: false });
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
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
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

  function toWebpFileName(fileName) {
    const raw = String(fileName || "").trim();
    const withoutExt = raw.replace(/\.[^./\\]+$/, "");
    const base = String(withoutExt || "chat-image")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .trim();
    return (base || "chat-image") + ".webp";
  }

  async function convertImageFileToWebpForChatUpload(file) {
    if (!(file instanceof File)) return file;
    const sourceMime = String(file.type || "").toLowerCase();
    if (!sourceMime.startsWith("image/")) return file;
    if (sourceMime === "image/gif" || sourceMime === "image/svg+xml") return file;
    try {
      const optimized = await buildOptimizedImagePayload(file, "image/webp");
      if (!optimized || !optimized.dataUrl) return file;
      const optimizedMime = String(optimized.mime || "").toLowerCase();
      if (optimizedMime !== "image/webp") return file;
      const blob = await fetch(optimized.dataUrl).then((res) => res.blob());
      if (!blob || !blob.size) return file;
      if (typeof File !== "function") return file;
      return new File([blob], toWebpFileName(file.name), {
        type: "image/webp",
        lastModified: Number(file.lastModified || Date.now()),
      });
    } catch {
      return file;
    }
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
    if (!isLikelyImageFile(file)) return null;
    if (!state.activeClientId) return null;
    return uploadChatImageAttachment(state.activeClientId, file).catch(() => null);
  }

  function buildLocalAttachPreviewItemFromFile(file) {
    if (!(file instanceof File)) return null;
    if (!isLikelyImageFile(file)) return null;
    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      return null;
    }
    state.attachPreviewObjectUrls.push(objectUrl);
    return {
      kind: "image",
      name: String(file.name || "image"),
      mime: String(file.type || "image/*"),
      url: String(objectUrl || ""),
      width: 0,
      height: 0,
      size: Number(file.size || 0),
    };
  }

  function isLikelyImageFile(file) {
    if (!(file instanceof File)) return false;
    const mime = String(file.type || "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    const fileName = String(file.name || "").toLowerCase();
    return CHAT_DROP_IMAGE_EXT_RE.test(fileName);
  }

  function dataTransferHasFiles(dataTransfer) {
    if (!dataTransfer) return false;
    const types = Array.from(dataTransfer.types || []);
    return types.includes("Files");
  }

  function extractImageFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];

    const directFiles = Array.from(dataTransfer.files || []).filter((file) => isLikelyImageFile(file));
    if (directFiles.length) return directFiles;

    const itemFiles = [];
    Array.from(dataTransfer.items || []).forEach((item) => {
      if (!item || item.kind !== "file") return;
      const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
      if (!isLikelyImageFile(file)) return;
      itemFiles.push(file);
    });
    return itemFiles;
  }

  function setThreadImageDropActive(active) {
    if (!dom.center.messagesWrap) return;
    dom.center.messagesWrap.classList.toggle("is-image-drop-target", active === true);
  }

  function resetThreadImageDrop() {
    state.threadDropDragDepth = 0;
    setThreadImageDropActive(false);
  }

  function initThreadImageDrop() {
    const wrap = dom.center.messagesWrap;
    if (!wrap || wrap.dataset.imageDropBound === "1") return;
    wrap.dataset.imageDropBound = "1";

    wrap.addEventListener("dragenter", (event) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (!state.activeClientId) return;
      state.threadDropDragDepth = Math.max(0, Number(state.threadDropDragDepth || 0)) + 1;
      setThreadImageDropActive(true);
    });

    wrap.addEventListener("dragover", (event) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (!state.activeClientId) return;
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      state.threadDropDragDepth = Math.max(1, Number(state.threadDropDragDepth || 0));
      setThreadImageDropActive(true);
    });

    wrap.addEventListener("dragleave", () => {
      if (!wrap.classList.contains("is-image-drop-target")) return;
      state.threadDropDragDepth = Math.max(0, Number(state.threadDropDragDepth || 0) - 1);
      if (state.threadDropDragDepth === 0) {
        setThreadImageDropActive(false);
      }
    });

    wrap.addEventListener("drop", async (event) => {
      const hasFilePayload = dataTransferHasFiles(event.dataTransfer);
      if (!state.activeClientId) {
        if (hasFilePayload) event.preventDefault();
        resetThreadImageDrop();
        return;
      }
      const files = extractImageFilesFromDataTransfer(event.dataTransfer);
      if (!files.length) {
        if (hasFilePayload) event.preventDefault();
        resetThreadImageDrop();
        return;
      }
      event.preventDefault();
      resetThreadImageDrop();
      await openAttachPreviewFromFiles(files).catch(console.error);
    });

    window.addEventListener("blur", () => {
      resetThreadImageDrop();
    });

    window.addEventListener("dragend", () => {
      resetThreadImageDrop();
    });

    document.addEventListener("drop", (event) => {
      if (wrap.contains(event.target)) return;
      resetThreadImageDrop();
    });
  }

  function initThreadImagePaste() {
    const wrap = dom.center.messagesWrap;
    if (wrap && wrap.dataset.imagePasteBound !== "1") {
      wrap.dataset.imagePasteBound = "1";
      if (!wrap.hasAttribute("tabindex")) {
        wrap.tabIndex = -1;
      }

      wrap.addEventListener("pointerdown", (event) => {
        const pointerType = String(event.pointerType || "").toLowerCase();
        if (pointerType === "touch" || pointerType === "pen" || shouldUseNativeMobileEmojiKeyboard()) return;
        const target = event.target;
        if (target && target.closest && target.closest("button,a,input,textarea,[contenteditable='true']")) return;
        if (document.activeElement === wrap) return;
        try {
          wrap.focus({ preventScroll: true });
        } catch {
          wrap.focus();
        }
      });

      wrap.addEventListener("paste", (event) => {
        if (!state.activeClientId) return;
        const files = extractImageFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        openAttachPreviewFromFiles(files).catch(console.error);
      });
    }

    if (dom.center.input && dom.center.input.dataset.imagePasteBound !== "1") {
      dom.center.input.dataset.imagePasteBound = "1";
      dom.center.input.addEventListener("paste", (event) => {
        if (!state.activeClientId) return;
        const files = extractImageFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        openAttachPreviewFromFiles(files).catch(console.error);
      });
    }
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
    focusComposerInput({ moveCaretToEnd: true });
    syncComposerRichPreview({});
  }

  function hideReactionBar() {
    if (dom.center.reactionBar) {
      clearReactionBarTouchGuard();
      dom.center.reactionBar.classList.add("hidden");
      setReactionBarExpanded(false);
    }
    reactionBarAnchorRect = null;
    if (!dom.center.contextMenu || dom.center.contextMenu.classList.contains("hidden")) {
      state.contextMessageId = null;
    }
  }

  function hideMessageMenu() {
    setContextMenuReactionsExpanded(false);
    hideMobileContextScene();
    if (dom.center.contextMenu) {
      if (dom.center.contextMenu.__mobileSceneMenuFadeTimer) {
        window.clearTimeout(dom.center.contextMenu.__mobileSceneMenuFadeTimer);
        dom.center.contextMenu.__mobileSceneMenuFadeTimer = 0;
      }
      clearContextMenuTouchGuard();
      dom.center.contextMenu.classList.add("hidden");
      dom.center.contextMenu.style.visibility = "";
      dom.center.contextMenu.style.opacity = "";
      dom.center.contextMenu.style.transition = "";
    }
    contextMenuAnchorPoint = null;
    if (!dom.center.reactionBar || dom.center.reactionBar.classList.contains("hidden")) {
      state.contextMessageId = null;
    }
  }

  function hideMessageContextMenu() {
    hideMessageMenu();
    hideReactionBar();
  }

  function ensureMobileContextSceneUi() {
    if (mobileContextSceneUi && mobileContextSceneUi.root && mobileContextSceneUi.root.isConnected) {
      return mobileContextSceneUi;
    }

    const root = document.createElement("div");
    root.className = "chat-mobile-context-scene hidden";
    root.innerHTML =
      '<div class="chat-mobile-context-scene__backdrop"></div>' +
      '<div class="chat-mobile-context-scene__clone" aria-hidden="true"></div>';
    document.body.appendChild(root);

    const ui = {
      root: root,
      backdrop: $(".chat-mobile-context-scene__backdrop", root),
      cloneHost: $(".chat-mobile-context-scene__clone", root),
    };

    if (ui.backdrop && ui.backdrop.dataset.bound !== "1") {
      ui.backdrop.dataset.bound = "1";
      ui.backdrop.addEventListener("click", (event) => {
        if (
          Date.now() < Number(suppressFloatingMenuDocumentClickUntil || 0)
          || Date.now() < Number(suppressFloatingMenuAutoHideUntil || 0)
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        hideMessageContextMenu();
      });
    }

    mobileContextSceneUi = ui;
    return ui;
  }

  function shouldUseMobileContextScene() {
    return isAdminMobileChatLayout() && !!dom.center.messages;
  }

  function getMobileContextSceneViewportBox() {
    const viewport = window.visualViewport;
    const width = viewport ? Number(viewport.width || 0) : 0;
    const height = viewport ? Number(viewport.height || 0) : 0;
    const left = viewport ? Number(viewport.offsetLeft || 0) : 0;
    const top = viewport ? Number(viewport.offsetTop || 0) : 0;
    const resolvedWidth = Number.isFinite(width) && width > 0
      ? width
      : Math.max(
          Number(window.innerWidth || 0),
          Number(document.documentElement && document.documentElement.clientWidth || 0),
        );
    const resolvedTop = Number.isFinite(top) ? top : 0;
    const resolvedBottom = getFloatingViewportBottom();
    const resolvedHeight = Number.isFinite(height) && height > 0
      ? height
      : Math.max(0, resolvedBottom - resolvedTop);
    return {
      left: Math.round(Number.isFinite(left) ? left : 0),
      top: Math.round(resolvedTop),
      width: Math.max(0, Math.round(resolvedWidth)),
      height: Math.max(0, Math.round(resolvedHeight)),
      right: Math.round((Number.isFinite(left) ? left : 0) + resolvedWidth),
      bottom: Math.round(resolvedBottom),
    };
  }

  function findContextMessageSourceNodes(messageId) {
    const key = String(messageId || "").trim();
    if (!key || !dom.center.messages) return null;
    const row = $(`.chat-message[data-message-id="${cssEscape(key)}"]`, dom.center.messages);
    if (!row) return null;
    const bubble = $(".chat-message-bubble", row);
    if (!bubble) return null;
    return {
      row,
      bubble,
    };
  }

  function hideMobileContextScene() {
    const scene = mobileContextSceneState;
    if (scene && scene.sourceRow && scene.sourceRow.isConnected) {
      scene.sourceRow.classList.remove("is-mobile-context-source-hidden");
    }

    const ui = mobileContextSceneUi;
    if (ui) {
      ui.root.classList.remove("is-open");
      ui.root.classList.add("hidden");
      if (ui.cloneHost) {
        ui.cloneHost.classList.remove("chat-message--out", "chat-message--in");
        if (typeof ui.cloneHost.replaceChildren === "function") {
          ui.cloneHost.replaceChildren();
        } else {
          ui.cloneHost.textContent = "";
        }
        ui.cloneHost.style.left = "";
        ui.cloneHost.style.top = "";
        ui.cloneHost.style.width = "";
        ui.cloneHost.style.minWidth = "";
        ui.cloneHost.style.maxWidth = "";
        ui.cloneHost.style.transition = "";
        ui.cloneHost.style.transform = "";
      }
    }

    if (dom.center.contextMenu) {
      dom.center.contextMenu.style.visibility = "";
    }
    if (dom.center.messages) {
      dom.center.messages
        .querySelectorAll(".chat-message.is-mobile-context-source-hidden")
        .forEach((node) => node.classList.remove("is-mobile-context-source-hidden"));
    }

    mobileContextSceneState = null;
  }

  function layoutMobileContextScene(options) {
    const scene = mobileContextSceneState;
    const contextMenuEl = dom.center.contextMenu;
    if (!scene || !contextMenuEl || !scene.sourceBubble || !scene.sourceBubble.isConnected) return false;
    const ui = ensureMobileContextSceneUi();
    if (!ui || !ui.cloneHost) return false;

    const bubbleRect = scene.sourceBubble.getBoundingClientRect();
    if (!bubbleRect || bubbleRect.width <= 0 || bubbleRect.height <= 0) return false;

    const menuWasHidden = contextMenuEl.classList.contains("hidden");
    if (menuWasHidden) {
      contextMenuEl.classList.remove("hidden");
      contextMenuEl.style.visibility = "hidden";
      contextMenuEl.style.opacity = "0";
    }
    const menuRect = contextMenuEl.getBoundingClientRect();
    const menuWidth = Math.max(0, Number(menuRect.width || 0));
    const menuHeight = Math.max(0, Number(menuRect.height || 0));
    const viewportBox = getMobileContextSceneViewportBox();
    const isOutgoing = scene.isOutgoing === true;
    const sidePadding = 16;
    const topPadding = 20;
    const bottomPadding = 20;
    const menuGap = 12;
    const maxBubbleLeft = Math.max(viewportBox.left + sidePadding, viewportBox.right - bubbleRect.width - sidePadding);
    const maxMenuLeft = Math.max(viewportBox.left + sidePadding, viewportBox.right - menuWidth - sidePadding);
    const desiredBubbleLeft = isOutgoing
      ? viewportBox.right - sidePadding - bubbleRect.width
      : viewportBox.left + sidePadding;
    const minBubbleTop = viewportBox.top + topPadding;
    const maxBubbleTop = viewportBox.bottom - bottomPadding - bubbleRect.height;
    const maxBubbleTopForMenu = viewportBox.bottom - bottomPadding - menuHeight - menuGap - bubbleRect.height;
    const sourceBubbleTop = Math.round(Number(bubbleRect.top || 0));
    const baseBubbleTop = Math.max(minBubbleTop, Math.min(sourceBubbleTop, maxBubbleTop));
    const targetBubbleLeft = Math.round(
      Math.min(Math.max(viewportBox.left + sidePadding, desiredBubbleLeft), maxBubbleLeft)
    );
    const targetBubbleTop = Math.round(
      Math.max(minBubbleTop, Math.min(baseBubbleTop, maxBubbleTopForMenu))
    );
    const desiredMenuLeft = isOutgoing
      ? targetBubbleLeft + bubbleRect.width - menuWidth
      : targetBubbleLeft;
    const targetMenuLeft = Math.round(
      Math.min(Math.max(viewportBox.left + sidePadding, desiredMenuLeft), maxMenuLeft)
    );
    const targetMenuTop = Math.round(
      Math.max(
        viewportBox.top + topPadding,
        Math.min(
          targetBubbleTop + bubbleRect.height + menuGap,
          viewportBox.bottom - bottomPadding - menuHeight
        )
      )
    );
    const originTranslateX = Number(bubbleRect.left) - Number(targetBubbleLeft);
    const originTranslateY = Number(bubbleRect.top) - Number(targetBubbleTop);
    const startScale = 1;
    const opts = options && typeof options === "object" ? options : {};
    const relayoutLocked = Number(scene.relayoutUnlockAt || 0) > Date.now();
    const shouldAnimateRelayout = opts.animateRelayout === true && scene.isOpen === true && !relayoutLocked;
    const openImmediately = (opts.openImmediately === true || scene.isOpen === true) && !shouldAnimateRelayout;

    ui.root.classList.remove("hidden");
    const prevCloneRect = shouldAnimateRelayout ? ui.cloneHost.getBoundingClientRect() : null;
    const hasPrevCloneRect = !!(
      prevCloneRect
      && Number.isFinite(prevCloneRect.left)
      && Number.isFinite(prevCloneRect.top)
      && prevCloneRect.width > 0
      && prevCloneRect.height > 0
    );
    ui.cloneHost.style.left = String(targetBubbleLeft) + "px";
    ui.cloneHost.style.top = String(targetBubbleTop) + "px";
    const bubbleWidthPx = Math.ceil(Number(bubbleRect.width || 0));
    ui.cloneHost.style.width = String(bubbleWidthPx) + "px";
    ui.cloneHost.style.minWidth = String(bubbleWidthPx) + "px";
    ui.cloneHost.style.maxWidth = String(bubbleWidthPx) + "px";
    ui.cloneHost.style.transition = "none";
    ui.cloneHost.style.transform = openImmediately
      ? "translate3d(0, 0, 0) scale(1)"
      : "translate3d(" + originTranslateX + "px, " + originTranslateY + "px, 0) scale(" + startScale + ")";
    // Keep iOS Safari from skipping the initial transform frame.
    void ui.cloneHost.offsetHeight;

    contextMenuEl.style.left = String(targetMenuLeft) + "px";
    contextMenuEl.style.top = String(targetMenuTop) + "px";
    contextMenuAnchorPoint = null;

    const revealContextMenu = function () {
      if (mobileContextSceneState !== scene) return;
      if (!contextMenuEl || contextMenuEl.classList.contains("hidden")) return;
      contextMenuEl.style.visibility = "";
      contextMenuEl.style.transition = "opacity .18s ease";
      contextMenuEl.style.opacity = "1";
    };

    if (shouldAnimateRelayout && hasPrevCloneRect) {
      const relayoutTranslateX = Number(prevCloneRect.left) - Number(targetBubbleLeft);
      const relayoutTranslateY = Number(prevCloneRect.top) - Number(targetBubbleTop);
      ui.root.classList.add("is-open");
      ui.cloneHost.style.transition = "none";
      ui.cloneHost.style.transform = "translate3d(" + relayoutTranslateX + "px, " + relayoutTranslateY + "px, 0) scale(1)";
      void ui.cloneHost.offsetWidth;
      ui.cloneHost.style.transition = CHAT_MOBILE_CONTEXT_CLONE_RELAYOUT_TRANSITION;
      if (contextMenuEl.__mobileSceneMenuFadeTimer) {
        window.clearTimeout(contextMenuEl.__mobileSceneMenuFadeTimer);
      }
      contextMenuEl.__mobileSceneMenuFadeTimer = window.setTimeout(function () {
        contextMenuEl.__mobileSceneMenuFadeTimer = 0;
        revealContextMenu();
      }, CHAT_MOBILE_CONTEXT_MENU_APPEAR_DELAY_MS);
      requestAnimationFrame(function () {
        if (mobileContextSceneState !== scene) return;
        ui.cloneHost.style.transform = "translate3d(0, 0, 0) scale(1)";
        scene.relayoutUnlockAt = Date.now() + CHAT_MOBILE_CONTEXT_RELAYOUT_LOCK_MS;
        scene.isOpen = true;
      });
      return true;
    }

    if (openImmediately) {
      ui.root.classList.add("is-open");
      ui.cloneHost.style.transition = "none";
      if (contextMenuEl.__mobileSceneMenuFadeTimer) {
        window.clearTimeout(contextMenuEl.__mobileSceneMenuFadeTimer);
      }
      contextMenuEl.__mobileSceneMenuFadeTimer = window.setTimeout(function () {
        contextMenuEl.__mobileSceneMenuFadeTimer = 0;
        revealContextMenu();
      }, CHAT_MOBILE_CONTEXT_MENU_APPEAR_DELAY_MS);
      scene.isOpen = true;
      return true;
    }

    requestAnimationFrame(function () {
      if (mobileContextSceneState !== scene) return;
      ui.root.classList.add("is-open");
      ui.cloneHost.style.transition = CHAT_MOBILE_CONTEXT_CLONE_OPEN_TRANSITION;
      ui.cloneHost.style.transform = "translate3d(0, 0, 0) scale(1)";
      if (contextMenuEl.__mobileSceneMenuFadeTimer) {
        window.clearTimeout(contextMenuEl.__mobileSceneMenuFadeTimer);
      }
      contextMenuEl.__mobileSceneMenuFadeTimer = window.setTimeout(function () {
        contextMenuEl.__mobileSceneMenuFadeTimer = 0;
        revealContextMenu();
      }, CHAT_MOBILE_CONTEXT_MENU_APPEAR_DELAY_MS);
      scene.relayoutUnlockAt = Date.now() + CHAT_MOBILE_CONTEXT_RELAYOUT_LOCK_MS;
      scene.isOpen = true;
    });
    return true;
  }

  function showMobileContextScene(messageId) {
    if (!shouldUseMobileContextScene() || !dom.center.contextMenu) return false;
    const source = findContextMessageSourceNodes(messageId);
    if (!source) return false;

    if (dom.center.contextMenu.__mobileSceneMenuFadeTimer) {
      window.clearTimeout(dom.center.contextMenu.__mobileSceneMenuFadeTimer);
      dom.center.contextMenu.__mobileSceneMenuFadeTimer = 0;
    }
    dom.center.contextMenu.style.transition = "";
    dom.center.contextMenu.style.opacity = "";
    dom.center.contextMenu.style.visibility = "";

    hideMobileContextScene();
    const ui = ensureMobileContextSceneUi();
    if (!ui || !ui.cloneHost) return false;

    const bubbleClone = source.bubble.cloneNode(true);
    bubbleClone.classList.add("chat-message-bubble--mobile-context-clone");
    bubbleClone.setAttribute("aria-hidden", "true");
    const isOutgoing = source.row.classList.contains("chat-message--out");
    ui.cloneHost.classList.toggle("chat-message--out", isOutgoing);
    ui.cloneHost.classList.toggle("chat-message--in", !isOutgoing);
    if (typeof ui.cloneHost.replaceChildren === "function") {
      ui.cloneHost.replaceChildren(bubbleClone);
    } else {
      ui.cloneHost.textContent = "";
      ui.cloneHost.appendChild(bubbleClone);
    }
    source.row.classList.add("is-mobile-context-source-hidden");

    mobileContextSceneState = {
      messageId: String(messageId || ""),
      sourceRow: source.row,
      sourceBubble: source.bubble,
      isOutgoing: isOutgoing,
      isOpen: false,
      relayoutUnlockAt: 0,
    };

    ui.root.classList.remove("is-open");
    ui.root.classList.remove("hidden");
    suppressFloatingMenuAutoHideUntil = Math.max(suppressFloatingMenuAutoHideUntil, Date.now() + 420);
    suppressFloatingMenuDocumentClickUntil = Math.max(suppressFloatingMenuDocumentClickUntil, Date.now() + 420);
    const didLayout = layoutMobileContextScene();
    if (!didLayout) hideMobileContextScene();
    return didLayout;
  }

  function clearContextMenuTouchGuard() {
    const menu = dom.center.contextMenu;
    if (!menu) return;
    if (menu.__touchGuardTimer) {
      window.clearTimeout(menu.__touchGuardTimer);
      menu.__touchGuardTimer = 0;
    }
    menu.__touchGuardAwaitRelease = false;
    menu.__awaitFreshTouchStart = false;
    menu.style.pointerEvents = "";
  }

  function clearReactionBarTouchGuard() {
    const bar = dom.center.reactionBar;
    if (!bar) return;
    if (bar.__touchGuardTimer) {
      window.clearTimeout(bar.__touchGuardTimer);
      bar.__touchGuardTimer = 0;
    }
    bar.__touchGuardAwaitRelease = false;
    bar.__awaitFreshTouchStart = false;
    bar.style.pointerEvents = "";
  }

  function releaseContextMenuTouchGuard() {
    const menu = dom.center.contextMenu;
    if (!menu) return;
    if (menu.__touchGuardTimer) {
      window.clearTimeout(menu.__touchGuardTimer);
      menu.__touchGuardTimer = 0;
    }
    menu.__touchGuardAwaitRelease = false;
    if (menu.classList.contains("hidden")) return;
    menu.style.pointerEvents = "";
  }

  function releaseReactionBarTouchGuard() {
    const bar = dom.center.reactionBar;
    if (!bar) return;
    if (bar.__touchGuardTimer) {
      window.clearTimeout(bar.__touchGuardTimer);
      bar.__touchGuardTimer = 0;
    }
    bar.__touchGuardAwaitRelease = false;
    if (bar.classList.contains("hidden")) return;
    bar.style.pointerEvents = "";
  }

  function armContextMenuTouchGuard() {
    const menu = dom.center.contextMenu;
    if (!menu) return;
    clearContextMenuTouchGuard();
    menu.__awaitFreshTouchStart = true;
    menu.__touchGuardAwaitRelease = true;
    menu.style.pointerEvents = "none";
    menu.__touchGuardTimer = window.setTimeout(() => {
      releaseContextMenuTouchGuard();
    }, CHAT_TOUCH_MENU_INTERACTION_GUARD_MS + 420);
  }

  function armReactionBarTouchGuard() {
    const bar = dom.center.reactionBar;
    if (!bar) return;
    clearReactionBarTouchGuard();
    bar.__awaitFreshTouchStart = true;
    bar.__touchGuardAwaitRelease = true;
    bar.style.pointerEvents = "none";
    bar.__touchGuardTimer = window.setTimeout(() => {
      releaseReactionBarTouchGuard();
    }, CHAT_TOUCH_MENU_INTERACTION_GUARD_MS + 420);
  }

  function markFreshContextMenuTouchInteraction() {
    const menu = dom.center.contextMenu;
    if (!menu || menu.classList.contains("hidden")) return;
    if (menu.__awaitFreshTouchStart !== true) return;
    menu.__awaitFreshTouchStart = false;
  }

  function markFreshReactionBarTouchInteraction() {
    const bar = dom.center.reactionBar;
    if (!bar || bar.classList.contains("hidden")) return;
    if (bar.__awaitFreshTouchStart !== true) return;
    bar.__awaitFreshTouchStart = false;
  }

  function shouldSuppressGuardedContextMenuClick(event) {
    const menu = dom.center.contextMenu;
    if (!menu || menu.classList.contains("hidden")) return false;
    if (menu.__awaitFreshTouchStart !== true) return false;
    if (!isTouchGeneratedClick(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function shouldSuppressGuardedReactionBarClick(event) {
    const bar = dom.center.reactionBar;
    if (!bar || bar.classList.contains("hidden")) return false;
    if (bar.__awaitFreshTouchStart !== true) return false;
    if (!isTouchGeneratedClick(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function releaseContextMenuTouchGuardAfterTouch(event = null) {
    const menu = dom.center.contextMenu;
    const pointerType = String(event?.pointerType || "").toLowerCase();
    if (pointerType && pointerType !== "touch") return;
    if (menu && !menu.classList.contains("hidden") && menu.__touchGuardAwaitRelease === true) {
      releaseContextMenuTouchGuard();
    }
    const bar = dom.center.reactionBar;
    if (bar && !bar.classList.contains("hidden") && bar.__touchGuardAwaitRelease === true) {
      releaseReactionBarTouchGuard();
    }
  }

  function ensureClientContextMenu() {
    if (state.clientContextMenu && state.clientContextMenu.isConnected) return state.clientContextMenu;

    const menu = document.createElement("div");
    menu.id = "chatClientContextMenu";
    menu.className = "chat-message-menu hidden";
    menu.innerHTML = `
      <button type="button" class="chat-message-menu-btn is-danger" data-chat-client-action="clear">
        <i class="far fa-trash-alt" aria-hidden="true"></i>
        <span>Очистить чат</span>
      </button>
      <button type="button" class="chat-message-menu-btn is-danger hidden" data-chat-client-action="delete-guest">
        <i class="far fa-trash-alt" aria-hidden="true"></i>
        <span>\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0447\u0430\u0442</span>
      </button>
    `;
    document.body.appendChild(menu);

    menu.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-chat-client-action]");
      if (!actionBtn) return;
      const action = actionBtn.getAttribute("data-chat-client-action");
      const clientId = state.contextClientId;
      hideClientContextMenu();
      if (!clientId) return;
      if (action === "clear") {
        clearClientChat(clientId);
        return;
      }
      if (action === "delete-guest") {
        deleteGuestClientChat(clientId);
      }
    });

    state.clientContextMenu = menu;
    return menu;
  }

  function hideClientContextMenu() {
    if (state.clientContextMenu) state.clientContextMenu.classList.add("hidden");
    state.contextClientId = null;
  }

  function findClientById(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    const id = Number(key);
    return (state.clients || []).find((row) => Number(row?.id) === id) || null;
  }

  function isGuestChatClient(client) {
    if (!client || typeof client !== "object") return false;
    const isVirtual = client._isVirtualChatClient === true;
    const phoneDigits = normalizePhoneDigits(client.phone);
    const totalOrders = Number(client.total_orders || 0);
    const hasOrders = Number.isFinite(totalOrders) && totalOrders > 0;
    if (isVirtual && !phoneDigits && !hasOrders) return true;
    const normalizedName = normalizeClientNameIdentity(client.name);
    if (!normalizedName) return false;
    return /^\u0433\u043e\u0441\u0442\u044c\b/.test(normalizedName);
  }

  function destroyClientThreadState(clientId, options = {}) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return { removed: false, wasActive: false };
    const opts = options || {};
    const idNum = Number(key);
    const wasActive = Number(state.activeClientId) === idNum;

    const saveTimer = state.remoteSaveTimers[key];
    if (saveTimer) {
      clearTimeout(saveTimer);
      delete state.remoteSaveTimers[key];
    }
    const hideTimer = Number(state.peerTypingHideTimers[key] || 0);
    if (hideTimer) {
      clearTimeout(hideTimer);
      delete state.peerTypingHideTimers[key];
    }

    delete state.remoteThreadUpdatedAt[key];
    delete state.remoteThreadSyncInFlight[key];
    delete state.remoteThreadSyncPendingByClient[key];
    delete state.remoteThreadSyncLastAtByClient[key];
    delete state.fullThreadPullLastAtByClient[key];
    delete state.remoteSummaryFingerprints[key];
    delete state.remoteSummariesByClient[key];
    delete state.clientSortBoostUpdatedAtByClient[key];
    delete state.remoteSaveInFlight[key];
    delete state.remoteMutationQueues[key];
    delete state.localThreadMutations[key];
    delete state.pendingScrollNewByClient[key];
    delete state.pendingScrollMessageIdsByClient[key];
    delete state.threadScrollTopByClient[key];
    delete state.threadPinnedBottomByClient[key];
    delete state.peerTypingByClient[key];
    delete state.peerTypingUpdatedAtByClient[key];
    delete state.threadHistoryByClient[key];

    const hiddenMap = ensureHiddenMessageMap();
    if (hiddenMap && typeof hiddenMap === "object") delete hiddenMap[key];
    if (state.store?.threads && typeof state.store.threads === "object") delete state.store.threads[key];

    const ui = ensureUiStoreState();
    if (ui?.threadScrollTopByClient && typeof ui.threadScrollTopByClient === "object") {
      delete ui.threadScrollTopByClient[key];
    }
    if (ui?.threadPinnedBottomByClient && typeof ui.threadPinnedBottomByClient === "object") {
      delete ui.threadPinnedBottomByClient[key];
    }

    if (Number(state.store?.lastOpenClientId || 0) === idNum) {
      state.store.lastOpenClientId = null;
    }
    if (normalizeClientIdKey(state.pendingMergedSelectionClientId) === key) {
      state.pendingMergedSelectionClientId = "";
    }

    if (opts.removeClientEntry === true) {
      state.clients = (state.clients || []).filter((row) => Number(row?.id) !== idNum);
      state.filteredClients = (state.filteredClients || []).filter((row) => Number(row?.id) !== idNum);
    }

    if (normalizeClientIdKey(state.localTypingClientId) === key) {
      stopLocalTypingSession(key, { flush: true, force: true });
    }

    if (wasActive) {
      hideMessageContextMenu();
      if (state.selectionMode || state.selectedMessageIds.size) setSelectionMode(false);
      cancelEditingMessage();
      clearComposerReply();
      if (dom.center.input) {
        dom.center.input.value = "";
        syncComposerRichPreview({});
      }
      state.activeClientId = null;
      state.activeClient = null;
      setActiveOrders([], { forceRender: true });
      ensureActiveThreadSseConnection();
    }

    saveStore();
    return { removed: true, wasActive };
  }

  function deleteGuestClientChat(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;
    const client = findClientById(key);
    if (!isGuestChatClient(client)) return false;

    const clientName = String(client?.name || `\u0413\u043e\u0441\u0442\u044c #${key}`);
    openDeleteConfirm({
      count: 1,
      clientName,
      title: `\u0423\u0434\u0430\u043b\u0438\u0442\u044c ${clientName}?`,
      text: "\u0427\u0430\u0442 \u0433\u043e\u0441\u0442\u044f \u0431\u0443\u0434\u0435\u0442 \u0443\u0434\u0430\u043b\u0435\u043d \u0431\u0435\u0437 \u0432\u043e\u0437\u043c\u043e\u0436\u043d\u043e\u0441\u0442\u0438 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f.",
      allowDeleteForClient: false,
      onConfirm: () => {
        const result = destroyClientThreadState(key, { removeClientEntry: true });
        applyClientFilter();
        if (result.wasActive) {
          renderMessages();
          const fallbackClient = Array.isArray(state.filteredClients) ? state.filteredClients[0] : null;
          if (fallbackClient && Number(fallbackClient.id) > 0) {
            selectClient(fallbackClient.id).catch(console.error);
          }
        }
        emitUnreadChangedSoon();
        deleteRemoteThread(key).catch(console.error);
      },
    });
    return true;
  }

  function clearClientChat(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return false;

    const client = state.clients.find((row) => Number(row.id) === Number(key));
    const clientName = String(client?.name || `Клиент #${key}`);
    const thread = getThread(key);
    const messageIds = thread.map((msg) => String(msg?.id || "")).filter(Boolean);
    const count = Math.max(1, messageIds.length);

    openDeleteConfirm({
      count,
      clientName,
      title: `\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0447\u0430\u0442 \u0441 ${clientName}?`,
      text: "\u0412\u044b \u0442\u043e\u0447\u043d\u043e \u0445\u043e\u0442\u0438\u0442\u0435 \u043e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u044d\u0442\u043e\u0442 \u0447\u0430\u0442?",
      checkText: `\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u0443 ${clientName}`,
      confirmText: "\u041e\u0427\u0418\u0421\u0422\u0418\u0422\u042c",
      allowDeleteForClient: true,
      onConfirm: ({ deleteForClient } = {}) => {
        const removeForBoth = deleteForClient !== false;
        const hiddenMap = ensureHiddenMessageMap();
        if (!Array.isArray(state.store.threads[key])) state.store.threads[key] = [];
        if (!Array.isArray(hiddenMap[key])) hiddenMap[key] = [];

        if (removeForBoth) {
          state.store.threads[key] = [];
          hiddenMap[key] = [];
          syncRemoteSummaryPreviewFromLocalThread(key);
          saveStore();

          const saveTimer = state.remoteSaveTimers[key];
          if (saveTimer) {
            clearTimeout(saveTimer);
            delete state.remoteSaveTimers[key];
          }
          delete state.remoteThreadUpdatedAt[key];

          if (Number(state.activeClientId) === Number(key)) {
            hideMessageContextMenu();
            if (state.selectionMode || state.selectedMessageIds.size) {
              setSelectionMode(false);
            }
            cancelEditingMessage();
            clearComposerReply();
            if (dom.center.input) {
              dom.center.input.value = "";
              syncComposerRichPreview({});
            }
            renderMessages();
          }
          applyClientFilter();
          enqueueRemoteMutation(key, () => pushThreadToRemote(key)).catch(console.error);
          return;
        }

        if (!messageIds.length) return;
        const changed = hideThreadMessagesLocally(key, messageIds);
        if (!changed) return;
        syncHiddenMessagesForActor(key, messageIds);
        if (Number(state.activeClientId) === Number(key)) {
          hideMessageContextMenu();
          renderMessages();
        }
        syncRemoteSummaryPreviewFromLocalThread(key);
        applyClientFilter();
      },
    });
    return true;
  }

  function showClientContextMenu(x, y, clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return;
    hideMessageContextMenu();
    const menu = ensureClientContextMenu();
    const client = findClientById(key);
    const canDeleteGuest = isGuestChatClient(client);
    const clearBtn = menu.querySelector('[data-chat-client-action="clear"]');
    const guestDeleteBtn = menu.querySelector('[data-chat-client-action="delete-guest"]');
    if (clearBtn) {
      clearBtn.classList.remove("hidden");
    }
    if (guestDeleteBtn) {
      guestDeleteBtn.classList.toggle("hidden", !canDeleteGuest);
    }
    state.contextClientId = key;
    positionFloatingBox(menu, x, y, 8);
  }

  function getFloatingViewportBottom() {
    const viewport = window.visualViewport;
    const viewportHeight = viewport ? Number(viewport.height || 0) : 0;
    const viewportOffsetTop = viewport ? Number(viewport.offsetTop || 0) : 0;
    if (
      Number.isFinite(viewportHeight)
      && viewportHeight > 0
      && Number.isFinite(viewportOffsetTop)
      && viewportOffsetTop >= 0
    ) {
      return Math.round(viewportOffsetTop + viewportHeight);
    }
    return Math.max(
      Number(window.innerHeight || 0),
      Number(document.documentElement && document.documentElement.clientHeight || 0),
    );
  }

  function clampFloatingBoxLeft(boxWidth, desiredLeft, padding = 8) {
    const maxLeft = Math.max(padding, window.innerWidth - boxWidth - padding);
    return Math.min(Math.max(padding, Number(desiredLeft) || 0), maxLeft);
  }

  function clampFloatingBoxTop(boxHeight, desiredTop, padding = 8) {
    const viewportBottom = getFloatingViewportBottom();
    const bottomPadding = getMobileChatFloatingBottomInset(padding, viewportBottom);
    const maxTop = Math.max(padding, viewportBottom - boxHeight - bottomPadding);
    return Math.min(Math.max(padding, Number(desiredTop) || 0), maxTop);
  }

  function positionFloatingBox(box, x, y, padding = 8) {
    box.classList.remove("hidden");
    const rect = box.getBoundingClientRect();
    const left = clampFloatingBoxLeft(rect.width, x, padding);
    const top = clampFloatingBoxTop(rect.height, y, padding);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function positionReactionBar(menuRect) {
    if (!dom.center.reactionBar || !menuRect) return;
    const barRect = dom.center.reactionBar.getBoundingClientRect();
    const padding = 8;
    const viewportBottom = getFloatingViewportBottom();
    const bottomPadding = getMobileChatFloatingBottomInset(padding, viewportBottom);
    const left = Math.min(
      Math.max(padding, Number(menuRect.right || 0) - barRect.width),
      Math.max(padding, window.innerWidth - barRect.width - padding),
    );
    const preferTop = menuRect.top - barRect.height - 8;
    const top = preferTop >= padding
      ? preferTop
      : Math.min(Math.max(padding, menuRect.bottom + 8), Math.max(padding, viewportBottom - barRect.height - bottomPadding));

    dom.center.reactionBar.style.left = `${left}px`;
    dom.center.reactionBar.style.top = `${top}px`;
  }

  function getMobileChatFloatingBottomInset(padding = 8, viewportBottomValue = null) {
    let inset = Math.max(8, Number(padding) || 0);
    if (!document.body || !document.body.classList.contains("page-chat")) return inset;
    if (window.innerWidth > 768) return inset;
    const viewportBottom = Number.isFinite(Number(viewportBottomValue))
      ? Number(viewportBottomValue)
      : getFloatingViewportBottom();

    const measureBottomInset = (element) => {
      if (!element || !element.isConnected) return 0;
      const style = window.getComputedStyle(element);
      if (!style || style.display === "none" || style.visibility === "hidden") return 0;
      const rect = element.getBoundingClientRect();
      if (!rect || rect.height <= 0 || rect.width <= 0) return 0;
      if (rect.top >= viewportBottom) return 0;
      return Math.max(0, viewportBottom - rect.top);
    };

    const shell = document.getElementById("adminMobileShell");
    const navShell = document.getElementById("adminMobileNavShell");
    inset = Math.max(inset, measureBottomInset(shell) + 8);
    inset = Math.max(inset, measureBottomInset(navShell) + 8);

    const activeBottomBar = state.selectionMode
      ? dom.center.selectionBar
      : dom.center.footerPanel;
    const activeBottomInner = state.selectionMode
      ? dom.center.selectionBar
      : dom.center.composer;
    inset = Math.max(inset, measureBottomInset(activeBottomBar) + 8);
    inset = Math.max(inset, measureBottomInset(activeBottomInner) + 12);
    inset = Math.max(inset, state.selectionMode ? 120 : 132);

    return inset;
  }

  function repositionMessageContextMenu(messageId, options = {}) {
    if (!dom.center.contextMenu || dom.center.contextMenu.classList.contains("hidden")) return;
    if (window.innerWidth > 768 && options.forceMobile !== true) return;
    const key = String(messageId || state.contextMessageId || "").trim();
    if (!key || !dom.center.messages) return;
    const messageNode = dom.center.messages.querySelector(`[data-message-id="${cssEscape(key)}"]`);
    if (!messageNode) return;
    const bubble = $(".chat-message-bubble", messageNode);
    if (!bubble) return;

    const menuRect = dom.center.contextMenu.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const padding = 8;
    const bubbleGap = 10;
    const preferAbove = options.preferAbove === true;
    const isOutgoing = messageNode.classList.contains("chat-message--out");
    const desiredLeft = isOutgoing
      ? bubbleRect.right - menuRect.width
      : bubbleRect.left;
    const desiredTop = preferAbove
      ? bubbleRect.top - menuRect.height - bubbleGap
      : bubbleRect.bottom + bubbleGap;
    const nextLeft = clampFloatingBoxLeft(menuRect.width, desiredLeft, padding);
    let nextTop = clampFloatingBoxTop(menuRect.height, desiredTop, padding);

    if (!preferAbove) {
      const viewportBottom = getFloatingViewportBottom();
      const bottomInset = getMobileChatFloatingBottomInset(padding, viewportBottom);
      const visibleBottom = viewportBottom - bottomInset;
      if ((nextTop + menuRect.height) > visibleBottom) {
        nextTop = clampFloatingBoxTop(menuRect.height, bubbleRect.top - menuRect.height - bubbleGap, padding);
      }
    }

    dom.center.contextMenu.style.left = `${Math.round(nextLeft)}px`;
    dom.center.contextMenu.style.top = `${Math.round(nextTop)}px`;
    contextMenuAnchorPoint = {
      x: Math.round(nextLeft),
      y: Math.round(nextTop),
    };
  }

  function showReactionBarForMessage(message, menuRect) {
    if (!dom.center.reactionBar) return;
    state.contextMessageId = String(message.id || "");
    const ownReaction = getMessageActorReaction(message, CHAT_REACTION_ACTOR);
    setReactionBarExpanded(false);
    $$('[data-chat-reaction]', dom.center.reactionBar).forEach((btn) => {
      const value = btn.getAttribute("data-chat-reaction");
      const isAction = value === "__toggle_more__";
      const isActive = value && !isAction && normalizeReactionValue(value) === normalizeReactionValue(ownReaction);
      btn.classList.toggle("is-active", isActive);
    });

    reactionBarAnchorRect = menuRect
      ? {
          left: Number(menuRect.left || 0),
          top: Number(menuRect.top || 0),
          bottom: Number(menuRect.bottom || 0),
          right: Number(menuRect.right || 0),
        }
      : null;
    dom.center.reactionBar.classList.remove("hidden");
    armReactionBarTouchGuard();
    positionReactionBar(menuRect);
  }

  function showReactionBar(messageId, anchorEl) {
    if (!state.activeClientId || !anchorEl) return;
    const message = findThreadMessage(state.activeClientId, messageId);
    if (!message) return;
    const anchorRect = typeof anchorEl.getBoundingClientRect === "function"
      ? anchorEl.getBoundingClientRect()
      : anchorEl;
    showReactionBarForMessage(message, anchorRect);
  }

  function showMessageContextMenu(x, y, messageId, options = {}) {
    if (!state.activeClientId || !dom.center.contextMenu) return;
    const message = findThreadMessage(state.activeClientId, messageId);
    if (!message) return;

    hideClientContextMenu();
    hideEmojiPopover();
    hideReactionBar();
    state.contextMessageId = String(messageId || "");
    normalizeContextMenuReactionButtons(dom.center.contextMenu);
    setContextMenuReactionsExpanded(false);
    if (dom.center.menuPinLabel) dom.center.menuPinLabel.textContent = message.pinned ? "Открепить" : "Закрепить";
    const canManageOwnMessage = message.direction === "out";
    if (dom.center.menuEditAction) dom.center.menuEditAction.classList.toggle("hidden", !canManageOwnMessage);
    if (dom.center.menuDeleteAction) dom.center.menuDeleteAction.classList.remove("hidden");

    if (showMobileContextScene(messageId)) {
      contextMenuAnchorPoint = null;
      if (options.touchGuard === true) {
        armContextMenuTouchGuard();
      } else {
        clearContextMenuTouchGuard();
      }
      return;
    }

    contextMenuAnchorPoint = {
      x: Number(x) || 0,
      y: Number(y) || 0,
    };
    positionFloatingBox(dom.center.contextMenu, x, y, 8);
    repositionMessageContextMenu(messageId, {
      forceMobile: options.touchGuard === true || window.innerWidth <= 768,
    });
    if (options.touchGuard === true) {
      armContextMenuTouchGuard();
    } else {
      clearContextMenuTouchGuard();
    }
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
    if (!message) return;
    const canDeleteForClient = message.direction === "out";

    openDeleteConfirm({
      count: 1,
      allowDeleteForClient: canDeleteForClient,
      onConfirm: ({ deleteForClient } = {}) => {
        const removeForBoth = canDeleteForClient && deleteForClient !== false;
        const changed = removeForBoth
          ? removeThreadMessage(state.activeClientId, messageId)
          : hideThreadMessagesLocally(state.activeClientId, [messageId]);
        if (!changed) return;
        if (!removeForBoth) {
          syncHiddenMessagesForActor(state.activeClientId, [messageId]);
        }

        if (String(state.editingMessageId || "") === String(messageId)) {
          cancelEditingMessage();
          if (dom.center.input) dom.center.input.value = "";
          syncComposerRichPreview({});
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

  function canUseMessageHeartShortcutTarget(target) {
    const targetEl = target && target.closest ? target : null;
    if (!targetEl) return true;
    return !(
      targetEl.closest("[data-chat-autolink]")
      || targetEl.closest("[data-chat-msg-reaction-toggle]")
      || targetEl.closest("[data-chat-order-card-id]")
      || targetEl.closest("[data-chat-scroll-to-message]")
      || targetEl.closest(".chat-message-attachment")
    );
  }

  function clearMessageHeartTap() {
    lastMessageHeartTap = null;
  }

  function consumeMessageHeartDoubleTap(messageId, point = {}) {
    const nextMessageId = String(messageId || "").trim();
    if (!nextMessageId) {
      clearMessageHeartTap();
      return false;
    }
    const now = Date.now();
    const x = Number(point.x || 0);
    const y = Number(point.y || 0);
    const prev = lastMessageHeartTap;
    lastMessageHeartTap = {
      messageId: nextMessageId,
      x,
      y,
      at: now,
    };
    if (!prev) return false;
    if (prev.messageId !== nextMessageId) return false;
    if ((now - prev.at) > CHAT_TOUCH_HEART_DOUBLE_TAP_MS) return false;
    if (Math.abs(prev.x - x) > CHAT_TOUCH_HEART_DOUBLE_TAP_MOVE_PX) return false;
    if (Math.abs(prev.y - y) > CHAT_TOUCH_HEART_DOUBLE_TAP_MOVE_PX) return false;
    clearMessageHeartTap();
    return true;
  }

  function toggleHeartReactionForMessage(messageId) {
    if (!state.activeClientId) return false;
    const heartReaction = "\u{2764}\u{FE0F}";
    if (!setThreadMessageReaction(state.activeClientId, messageId, heartReaction)) return false;
    hideMessageContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    renderMessages();
    return true;
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

  function deleteSelectedMessages() {
    if (!state.activeClientId || state.selectedMessageIds.size === 0) return;
    const selectedMessages = getSelectedMessages();
    if (!selectedMessages.length) return;

    const selectedIds = new Set(selectedMessages.map((msg) => String(msg.id || "")).filter(Boolean));
    if (!selectedIds.size) return;

    const selectedOwnIds = new Set(
      selectedMessages
        .filter((msg) => msg.direction === "out")
        .map((msg) => String(msg.id || ""))
        .filter(Boolean)
    );
    const count = selectedIds.size;
    const allowDeleteForClient = selectedOwnIds.size > 0;

    openDeleteConfirm({
      count,
      allowDeleteForClient,
      onConfirm: ({ deleteForClient } = {}) => {
        const removeForBoth = allowDeleteForClient && deleteForClient !== false;
        const key = String(state.activeClientId);
        const thread = getThread(state.activeClientId);

        if (removeForBoth) {
          state.store.threads[key] = thread.filter((msg) => !selectedOwnIds.has(String(msg.id)));
          selectedOwnIds.forEach((id) => setMessageHiddenLocally(state.activeClientId, id, false, { persist: false }));
          pruneHiddenMessageIds(state.activeClientId);
        }

        const localHideIds = new Set(selectedIds);
        if (removeForBoth) {
          selectedOwnIds.forEach((id) => localHideIds.delete(id));
        }
        hideThreadMessagesLocally(state.activeClientId, Array.from(localHideIds));
        if (localHideIds.size) {
          syncHiddenMessagesForActor(state.activeClientId, Array.from(localHideIds));
        }

        if (state.editingMessageId && selectedIds.has(String(state.editingMessageId))) {
          cancelEditingMessage();
          if (dom.center.input) dom.center.input.value = "";
          syncComposerRichPreview({});
        }

        if (state.replyDraft?.id && selectedIds.has(String(state.replyDraft.id))) {
          clearComposerReply();
        }

        setSelectionMode(false);
        saveStore();
        if (removeForBoth) {
          Array.from(selectedOwnIds).forEach((id) => {
            enqueueRemoteMutation(state.activeClientId, () => remoteDeleteMessage(state.activeClientId, id));
          });
        }
        syncRemoteSummaryPreviewFromLocalThread(state.activeClientId);
        renderMessages();
        applyClientFilter();
      },
    });
  }

  function renderChatHeader() {
    ensureDesktopChatHeaderMarkup();
    setHeaderLoading(state.activeClientDataLoading === true);
    const legacySetOrderStatusView = (text, _color, order = null) => {
      if (!dom.center.headerOrder) return;
      const safeText = String(text || "—").trim() || "—";
      const safeColor = String(_color || "").trim();
      dom.center.orderStatus.textContent = safeText;
      dom.center.orderStatus.classList.toggle("is-empty", safeText === "—" || safeText === "Без заказа");
      if (!safeColor) {
        dom.center.orderStatus.style.background = "";
        dom.center.orderStatus.style.borderColor = "";
        dom.center.orderStatus.style.color = "";
        return;
      }
      dom.center.orderStatus.style.borderColor = hexToRgba(safeColor, 0.45) || safeColor;
      dom.center.orderStatus.style.background = hexToRgba(safeColor, 0.12) || "";
      dom.center.orderStatus.style.color = safeColor;
    };

    const setOrderStatusView = (text, _color, order = null) => {
      if (!dom.center.headerOrder) return;
      const safeText = String(text || "\u2014").trim() || "\u2014";
      const stageCol = $(".order-col.order-stage", dom.center.headerOrder);
      if (!stageCol) return;
      stageCol.innerHTML = buildHeaderOrderStageButtonHtml(order, safeText);
      refreshDesktopHeaderDomRefs();
    };

    const setOrderTotalView = (totalText, paymentCode, order = null) => {
      if (!dom.center.orderTotal) return;
      const safeTotal = String(totalText || "—").trim() || "—";
      const isEmpty = safeTotal === "—";

      const paymentTitle = String(order?.payment_title || "").trim();
      const isFullyRefunded = isHeaderOrderFullyRefunded(order);
      const isPaid = isHeaderOrderPaid(order);
      const paymentStateClass = isFullyRefunded
        ? "order-payment-refund"
        : (isPaid ? "order-payment-paid" : "order-payment-unpaid");
      const paymentStatusText = isFullyRefunded ? "Возвращено" : (isPaid ? "Оплачено" : "Не оплачено");

      dom.center.orderTotal.className = "order-payment-btn";
      dom.center.orderTotal.classList.toggle("is-empty", isEmpty);
      if (isEmpty) {
        dom.center.orderTotal.removeAttribute("title");
        dom.center.orderTotal.textContent = "—";
        return;
      }

      const code = String(paymentCode || "").toLowerCase();
      const isCash = code.includes("cash");
      dom.center.orderTotal.classList.add(isCash ? "order-payment-cash" : "order-payment-card", paymentStateClass);
      if (paymentTitle) dom.center.orderTotal.setAttribute("title", paymentTitle);
      else dom.center.orderTotal.removeAttribute("title");
      if (sharedOrderPanel && typeof sharedOrderPanel.buildOrderPaymentButtonHtml === "function") {
        const temp = document.createElement("div");
        temp.innerHTML = sharedOrderPanel.buildOrderPaymentButtonHtml({
          paymentTypeClass: isCash ? "order-payment-cash" : "order-payment-card",
          paymentStateClass,
          paymentTitle,
          paymentIconHtml: renderHeaderOrderPaymentIconHtml(code),
          totalText: safeTotal,
          statusText: paymentStatusText,
        }).trim();
        const builtButton = temp.firstElementChild;
        if (builtButton) {
          dom.center.orderTotal.className = builtButton.className;
          dom.center.orderTotal.innerHTML = builtButton.innerHTML;
          return;
        }
      }
      dom.center.orderTotal.innerHTML = `<i class="fas ${escapeHtml(paymentIcon(code))}"></i> ${escapeHtml(safeTotal)}`;
    };

    const setOrderHeaderFields = ({
      kind = "Последний заказ",
      id = "—",
      time = "—",
      address = "Адрес не указан",
      comment = "Нет комментария",
      statusText = "Без заказа",
      statusColor = "",
      total = "—",
      paymentCode = "",
      title = "Последний заказ: —",
      clientName = "—",
      clientPhone = "—",
      order = null,
      orderId = 0,
    } = {}) => {
      const safeId = String(id || "\u2014").trim() || "\u2014";
      const safeTime = String(time || "\u2014").trim() || "\u2014";
      const safeClientName = String(clientName || "\u2014").trim() || "\u2014";
      const safeClientPhone = String(clientPhone || "\u2014").trim() || "\u2014";
      const mobileOrderLabel = Number(orderId || 0) > 0 ? `#${safeId}` : "—";
      if (dom.center.orderKind) dom.center.orderKind.textContent = kind;
      if (dom.center.orderId) dom.center.orderId.textContent = safeId;
      if (dom.center.mobileOrderId) dom.center.mobileOrderId.textContent = mobileOrderLabel;
      if (dom.center.orderTime) dom.center.orderTime.textContent = safeTime;
      if (dom.center.mobileOrderTime) dom.center.mobileOrderTime.textContent = safeTime;
      if (dom.center.orderAddress) dom.center.orderAddress.textContent = address;
      if (dom.center.orderComment) dom.center.orderComment.textContent = comment;
      if (dom.center.headerName) dom.center.headerName.textContent = safeClientName;
      if (dom.center.mobileHeaderName) dom.center.mobileHeaderName.textContent = safeClientName;
      if (dom.center.headerPhone) dom.center.headerPhone.textContent = safeClientPhone;
      if (dom.center.mobileHeaderPhone) dom.center.mobileHeaderPhone.textContent = safeClientPhone;
      setHeaderTimeIcon(order);
      setOrderTotalView(total, paymentCode, order);
      if (dom.center.orderTitle) dom.center.orderTitle.textContent = title;
      setOrderStatusView(statusText, statusColor, order);
      setHeaderOrderLinkState(orderId);
      syncHeaderTooltips();
    };

    if (!state.activeClient) {
      setHeaderLoading(false);
      state.headerOrderSnapshot = null;
      setHeaderClientLinkState(false);
      setOrderHeaderFields({
        kind: "Последний заказ",
        id: "—",
        time: "—",
        address: "Адрес не указан",
        comment: "Нет комментария",
        statusText: "—",
        total: "—",
        title: "Последний заказ: —",
        clientName: "Выберите клиента",
        clientPhone: "Нажмите на чат в левом списке",
        orderId: 0,
      });
      cancelEditingMessage();
      clearComposerReply();
      if (state.pendingDeleteConfirm) closeDeleteConfirm();
      hideMessageContextMenu();
      setComposerEnabled(false);
      return;
    }

    setHeaderClientLinkState(true);

    const candidate = getHeaderOrderCandidate(state.activeOrders);
    const currentOrder = candidate.currentOrder;
    const snapshotOrderId = Number(state.headerOrderSnapshot?.id || 0);
    const snapshotFromList = snapshotOrderId > 0
      ? (Array.isArray(candidate.sortedOrders)
        ? candidate.sortedOrders.find((order) => Number(order?.id || 0) === snapshotOrderId) || null
        : null)
      : null;
    const snapshotOrder = snapshotFromList
      ? { ...state.headerOrderSnapshot, ...snapshotFromList }
      : (snapshotOrderId > 0 ? state.headerOrderSnapshot : null);
    const headerOrder = snapshotOrder || candidate.headerOrder;
    if (headerOrder && !state.orderStatusesLoaded && !state.orderStatusesLoading) {
      ensureHeaderOrderStatusesLoaded().catch(console.error);
    }

    if (!headerOrder) {
      state.headerOrderId = 0;
      setOrderHeaderFields({
        kind: "Последний заказ",
        id: "—",
        time: "—",
        address: "Адрес не указан",
        comment: "Нет комментария",
        statusText: "Без заказа",
        total: "—",
        title: "Последний заказ: —",
        clientName: state.activeClient.name || `Клиент #${state.activeClient.id}`,
        clientPhone: formatPhoneDigitsToRU(state.activeClient.phone),
        orderId: 0,
      });
    } else {
      const currentOrderId = Number(currentOrder?.id || 0);
      const headerOrderId = Number(headerOrder?.id || 0);
      const kindTitle = currentOrderId > 0 && headerOrderId > 0 && currentOrderId === headerOrderId
        ? "Текущий заказ"
        : "Последний заказ";
      const orderTime = fmtTime(headerOrder.created_at || headerOrder.scheduled_at) || "—";
      const orderId = Number(headerOrder.id);
      state.headerOrderId = Number.isFinite(orderId) && orderId > 0 ? orderId : 0;
      const totalRaw = headerOrder.total_price ?? headerOrder.total;
      setOrderHeaderFields({
        kind: kindTitle,
        id: Number.isFinite(orderId) && orderId > 0 ? String(orderId) : "—",
        time: orderTime,
        address: getOrderAddressLine(headerOrder),
        comment: getOrderCommentLine(headerOrder),
        statusText: headerOrder.status_title || "Без статуса",
        statusColor: headerOrder.status_color || "#64748b",
        total: fmtOrderAmount(totalRaw),
        paymentCode: headerOrder.payment_code || "",
        title: `${kindTitle} #${headerOrder.id || "—"}`,
        clientName: state.activeClient.name || `Клиент #${state.activeClient.id}`,
        clientPhone: formatPhoneDigitsToRU(state.activeClient.phone),
        order: headerOrder,
        orderId,
      });
    }

    syncComposerMode();
    setComposerEnabled(true);
  }

  function safeThreadRenderSignature(value) {
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return String(value || "");
    }
  }

  function setThreadRenderDescriptor(node, key, signature) {
    if (!node || !node.dataset) return node;
    node.dataset.renderKey = String(key || "");
    node.dataset.renderSignature = String(signature || "");
    return node;
  }

  function getThreadMessageRenderKey(msg, index) {
    const messageId = String(msg && msg.id || "").trim();
    return messageId ? `message:${messageId}` : `message-index:${index}`;
  }

  function getThreadMessageRenderSignature(msg) {
    const source = msg && typeof msg === "object" ? msg : {};
    const imageAttachment = getMessageImageAttachment(source);
    const reactionItems = getMessageReactionItems(source).map((itemReaction) => ({
      actor: String(itemReaction && itemReaction.actor || ""),
      reaction: String(itemReaction && itemReaction.reaction || ""),
    }));
    const orderCardModels = buildMessageOrderCardModels(source).map((model) => ({
      orderId: String(model && model.orderId || ""),
      orderLabel: String(model && model.orderLabel || ""),
      statusTitle: String(model && model.statusTitle || ""),
      totalLabel: String(model && model.totalLabel || ""),
    }));
    return safeThreadRenderSignature({
      id: String(source.id || ""),
      direction: String(source.direction || ""),
      createdAt: String(source.createdAt || ""),
      editedAt: String(source.editedAt || ""),
      text: String(source.text || ""),
      pinned: source.pinned === true,
      replyTo: source.replyTo && typeof source.replyTo === "object"
        ? {
            id: String(source.replyTo.id || ""),
            sender: String(source.replyTo.sender || ""),
            text: String(source.replyTo.text || ""),
          }
        : null,
      attachment: imageAttachment
        ? {
            src: getAttachmentImageSrc(imageAttachment),
            name: String(imageAttachment.name || ""),
          }
        : null,
      outgoingStatus: source.direction === "out" ? getOutgoingDeliveryStatus(source) : "",
      reactions: reactionItems,
      orderCards: orderCardModels,
    });
  }

  function createThreadDayNode(dayLabel) {
    const dayNode = document.createElement("div");
    dayNode.className = "chat-day-separator";
    dayNode.textContent = dayLabel;
    return dayNode;
  }

  function createThreadMessageNode(msg, renderKey) {
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
    const orderCardModels = buildMessageOrderCardModels(msg);
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
            src="${escapeHtml(getAttachmentImageSrc(imageAttachment))}"
            alt="${escapeHtml(String(imageAttachment.name || "Фото"))}"
            draggable="false"
            loading="lazy"
            decoding="async"
          />
        </div>
      `
      : "";
    const textMarkup = hasText ? '<div class="chat-message-text"></div>' : "";
    const orderCardMarkup = buildMessageOrderCardsMarkup(orderCardModels);
    item.innerHTML = `
      <span class="chat-message-select-badge" aria-hidden="true"><i class="fas fa-check"></i></span>
      <div class="chat-message-bubble"${msg.id ? ` data-message-id="${escapeHtml(String(msg.id || ""))}"` : ""}>
        ${replyMarkup}
        ${attachmentMarkup}
        ${textMarkup}
        ${orderCardMarkup}
        <div class="chat-message-meta">
          <span class="chat-message-meta-main">
            <span class="chat-message-time">${escapeHtml(time)}</span>
            ${outgoingStatus
              ? `<span class="chat-message-status chat-message-status--${escapeHtml(outgoingStatus)}" title="${escapeHtml(outgoingStatusTitle)}" aria-label="${escapeHtml(outgoingStatusTitle)}">${getOutgoingStatusIconMarkup(outgoingStatus)}</span>`
              : ""}
          </span>
          ${msg.pinned ? '<span class="chat-message-pin" title="Закреплено"><i class="fas fa-thumbtack"></i></span>' : ""}
        </div>
      </div>
    `;

    const bubble = $(".chat-message-bubble", item);
    const messageTextNode = $(".chat-message-text", item);
    if (messageTextNode) {
      renderRichMessageText(
        messageTextNode,
        msg.text || "",
        "chat-emoji-glyph chat-emoji-glyph--inline",
        "chat-auto-link"
      );
    }
    if (bubble && hasImageAttachment) {
      bubble.classList.add("has-attachment");
      if (!hasText) bubble.classList.add("has-attachment-only");
    }
    if (bubble && orderCardModels.length) {
      bubble.classList.add("chat-message-bubble--order-card");
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
    if (bubble && emojiOnlyInfo.isEmojiOnly && !reply && !hasImageAttachment && !orderCardModels.length) {
      bubble.classList.add("is-emoji-only");
      if (emojiOnlyInfo.count <= 1) bubble.classList.add("is-emoji-only-single");
      else if (emojiOnlyInfo.count <= 3) bubble.classList.add("is-emoji-only-few");
      else bubble.classList.add("is-emoji-only-many");
    }

    const reactionItems = getMessageReactionItems(msg);
    const reactionAnimationMeta = getThreadReactionAnimationMeta(
      state.activeClientId,
      messageId,
      reactionItems,
      renderKey
    );
    if ((reactionItems.length || reactionAnimationMeta.leavingItems.length) && bubble) {
      const reactionsWrap = document.createElement("div");
      reactionsWrap.className = `chat-message-reactions${reactionAnimationMeta.animateAny ? " is-reaction-pop" : ""}`;
      bubble.classList.add("has-reaction");

      reactionItems.forEach((itemReaction, reactionIndex) => {
        const reactionBtn = document.createElement("button");
        reactionBtn.type = "button";
        const reactionItemKey = getThreadReactionAnimationItemKey(itemReaction && itemReaction.actor, itemReaction && itemReaction.reaction);
        const shouldAnimateItem = reactionAnimationMeta.itemKeys.has(reactionItemKey);
        reactionBtn.className = `chat-message-reaction-pill${shouldAnimateItem ? " is-reaction-pop" : ""}`;
        reactionBtn.style.zIndex = String(10 + reactionIndex);
        if (shouldAnimateItem) {
          reactionBtn.style.setProperty("--reaction-pop-delay", `${reactionIndex * 32}ms`);
        }
        reactionBtn.setAttribute("data-chat-msg-reaction-toggle", messageId);
        reactionBtn.setAttribute("data-chat-reaction-value", String(itemReaction.reaction || ""));
        reactionBtn.setAttribute("data-chat-reaction-actor", String(itemReaction.actor || ""));
        reactionBtn.title = itemReaction.actor === CHAT_REACTION_ACTOR ? "Изменить реакцию" : "Реакция собеседника";
        reactionBtn.setAttribute("aria-label", String(itemReaction.reaction || ""));
        setEmojiGlyph(reactionBtn, itemReaction.reaction, "chat-emoji-glyph chat-emoji-glyph--pill");
        reactionsWrap.appendChild(reactionBtn);
      });

      if (reactionAnimationMeta.leavingItems.length) {
        bindThreadReactionLeavingCleanup(reactionsWrap, bubble);
        reactionAnimationMeta.leavingItems.forEach((itemReaction, reactionIndex) => {
          const reactionGhost = document.createElement("span");
          reactionGhost.className = "chat-message-reaction-pill is-reaction-leave";
          reactionGhost.style.zIndex = String(Math.max(0, reactionIndex));
          reactionGhost.setAttribute("aria-hidden", "true");
          setEmojiGlyph(reactionGhost, itemReaction.reaction, "chat-emoji-glyph chat-emoji-glyph--pill");
          reactionsWrap.appendChild(reactionGhost);
        });
      }

      bubble.appendChild(reactionsWrap);
    }

    return item;
  }

  function syncRenderedMessageSelectionState() {
    if (!dom.center.messages) return;
    dom.center.messages.querySelectorAll(".chat-message[data-message-id]").forEach((node) => {
      const messageId = String(node.getAttribute("data-message-id") || "");
      node.classList.toggle("is-selection-mode", state.selectionMode);
      node.classList.toggle("is-selected", !!messageId && state.selectedMessageIds.has(messageId));
    });
  }

  function reconcileThreadMessageNodes(descriptors) {
    if (!dom.center.messages) return;
    const container = dom.center.messages;
    const now = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
    const isLayoutBurst = (
      Number.isFinite(threadLayoutAnimationLastRunAt)
      && threadLayoutAnimationLastRunAt > 0
      && (now - threadLayoutAnimationLastRunAt) <= CHAT_THREAD_LAYOUT_BURST_GAP_MS
    );
    if (isLayoutBurst) {
      threadLayoutAnimationQuietUntil = Math.max(
        Number(threadLayoutAnimationQuietUntil || 0),
        now + CHAT_THREAD_LAYOUT_BURST_COOLDOWN_MS
      );
    }
    threadLayoutAnimationLastRunAt = now;
    const layoutBurstCooldownActive = now < Number(threadLayoutAnimationQuietUntil || 0);
    const canAnimateLayoutShift = (
      descriptors.length > 0
      && container.childElementCount > 0
      && container.childElementCount <= 180
      && document.visibilityState !== "hidden"
      && !layoutBurstCooldownActive
      && !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    );
    const firstRectsByKey = new Map();
    if (canAnimateLayoutShift) {
      Array.from(container.children).forEach((node) => {
        if (!(node instanceof HTMLElement) || !node.dataset) return;
        const key = String(node.dataset.renderKey || "");
        if (!key || firstRectsByKey.has(key)) return;
        firstRectsByKey.set(key, node.getBoundingClientRect());
      });
    }
    const existingByKey = new Map();
    const insertedNodes = [];
    Array.from(container.children).forEach((node) => {
      const key = node && node.dataset ? String(node.dataset.renderKey || "") : "";
      if (key && !existingByKey.has(key)) existingByKey.set(key, node);
    });

    let anchor = container.firstElementChild;
    descriptors.forEach((descriptor) => {
      const key = String(descriptor && descriptor.key || "");
      const signature = String(descriptor && descriptor.signature || "");
      if (!key || typeof descriptor.create !== "function") return;

      const current = existingByKey.get(key) || null;
      const currentSignature = current && current.dataset
        ? String(current.dataset.renderSignature || "")
        : "";
      let nextNode = null;
      if (current && currentSignature === signature) {
        nextNode = setThreadRenderDescriptor(current, key, signature);
      } else if (current && current.parentNode === container) {
        nextNode = setThreadRenderDescriptor(descriptor.create(), key, signature);
        container.replaceChild(nextNode, current);
        if (anchor === current) {
          anchor = nextNode;
        }
      } else {
        nextNode = setThreadRenderDescriptor(descriptor.create(), key, signature);
        insertedNodes.push(nextNode);
      }

      if (nextNode !== anchor) {
        container.insertBefore(nextNode, anchor);
      } else {
        anchor = anchor ? anchor.nextElementSibling : null;
        return;
      }

      anchor = nextNode.nextElementSibling;
    });

    while (anchor) {
      const next = anchor.nextElementSibling;
      container.removeChild(anchor);
      anchor = next;
    }

    if (!canAnimateLayoutShift) return;
    const currentAnimationToken = ++threadLayoutAnimationToken;
    const movedDurationMs = 460;
    const movedEasing = "cubic-bezier(.2,.8,.2,1)";
    requestAnimationFrame(() => {
      if (currentAnimationToken !== threadLayoutAnimationToken) return;
      insertedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (typeof node.animate !== "function") return;
        if (typeof node.getAnimations === "function") {
          node.getAnimations({ subtree: false }).forEach((animation) => {
            try { animation.cancel(); } catch {}
          });
        }
        node.animate(
          [
            { transform: "translateY(10px)", opacity: 0.01 },
            { transform: "translateY(0px)", opacity: 1 },
          ],
          { duration: 340, easing: movedEasing, fill: "both" },
        );
      });
      if (firstRectsByKey.size === 0) return;
      Array.from(container.children).forEach((node) => {
        if (!(node instanceof HTMLElement) || !node.dataset) return;
        if (insertedNodes.includes(node)) return;
        const key = String(node.dataset.renderKey || "");
        if (!key) return;
        const lastRect = node.getBoundingClientRect();
        const firstRect = firstRectsByKey.get(key) || null;
        if (!firstRect) return;
        const deltaY = firstRect.top - lastRect.top;
        if (Math.abs(deltaY) < 0.5) return;
        if (typeof node.animate === "function") {
          if (typeof node.getAnimations === "function") {
            node.getAnimations({ subtree: false }).forEach((animation) => {
              try { animation.cancel(); } catch {}
            });
          }
          node.animate(
            [
              { transform: `translateY(${deltaY}px)` },
              { transform: "translateY(0px)" },
            ],
            { duration: movedDurationMs, easing: movedEasing, fill: "both" },
          );
        }
      });
    });
  }

  function renderMessages(options = {}) {
    if (!dom.center.messages || !dom.center.empty) return;
    releaseAdminChatThreadEdgeSpring({ immediate: true });
    const forceScrollBottom = options.forceScrollBottom === true;
    const disableAutoPin = options.disableAutoPin === true;
    const smoothScroll = options.smoothScroll !== false;
    const skipSaveScrollPosition = options.skipSaveScrollPosition === true;
    const skipPinnedBottomEnforce = options.skipPinnedBottomEnforce === true;
    const keepPinnedBeforeRender = shouldKeepMessagesPinnedToBottom();

    if (!state.activeClientId) {
      setRenderedThreadClientKey("");
      resetThreadImageDrop();
      setSelectionMode(false);
      dom.center.empty.classList.remove("hidden");
      dom.center.messages.innerHTML = "";
      hideMessageContextMenu();
      clearPendingScrollNewCount();
      updateMessagesScrollDownButton();
      return;
    }

    setRenderedThreadClientKey(state.activeClientId);
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

    if (!thread.length) {
      setSelectionMode(false);
      dom.center.messages.innerHTML =
        '<div class="chat-local-empty">' +
          '<i class="fas fa-comment-dots"></i>' +
          '<span>\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u0435\u0440\u0435\u043f\u0438\u0441\u043a\u0438 \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u0430\u044f. \u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043f\u0435\u0440\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435.</span>' +
        '</div>';
      hideMessageContextMenu();
      clearPendingScrollNewCount();
      updateMessagesScrollDownButton();
      return;
    }

    const activeClientKey = normalizeClientIdKey(state.activeClientId) || "unknown";
    const descriptors = [];
    let prevDayKey = "";
    thread.forEach((msg, index) => {
      const dayKey = getDayKey(msg.createdAt);
      if (dayKey && dayKey !== prevDayKey) {
        descriptors.push({
          key: `client:${activeClientKey}:day:${dayKey}`,
          signature: safeThreadRenderSignature({
            type: "day",
            dayKey,
            label: fmtDayLabel(msg.createdAt),
          }),
          create: () => createThreadDayNode(fmtDayLabel(msg.createdAt)),
        });
        prevDayKey = dayKey;
      }

      const renderKey = `client:${activeClientKey}:${getThreadMessageRenderKey(msg, index)}`;
      descriptors.push({
        key: renderKey,
        signature: getThreadMessageRenderSignature(msg),
        create: () => createThreadMessageNode(msg, renderKey),
      });
    });
    reconcileThreadMessageNodes(descriptors);
    if (dom.center.messages) {
      const mobileContextSceneOpen = !!(
        mobileContextSceneUi
        && mobileContextSceneUi.root
        && !mobileContextSceneUi.root.classList.contains("hidden")
        && mobileContextSceneUi.root.classList.contains("is-open")
      );
      if (!mobileContextSceneOpen) {
        dom.center.messages
          .querySelectorAll(".chat-message.is-mobile-context-source-hidden")
          .forEach((node) => node.classList.remove("is-mobile-context-source-hidden"));
      }
    }

    if (state.contextMessageId) {
      const exists = thread.some((msg) => String(msg.id) === String(state.contextMessageId));
      if (!exists) hideMessageContextMenu();
    }

    syncSelectionUi();

    if (dom.center.messagesWrap && !state.selectionMode) {
      if (forceScrollBottom || (!disableAutoPin && keepPinnedBeforeRender)) {
        const keyboardOpen = !!(
          document.body
          && document.body.classList.contains("chat-mobile-keyboard-open")
        );
        if (adminChatRenderAutoScrollTimer) {
          window.clearTimeout(adminChatRenderAutoScrollTimer);
          adminChatRenderAutoScrollTimer = 0;
        }
        if (keyboardOpen) {
          const renderClientIdAtSchedule = String(state.activeClientId || "");
          adminChatRenderAutoScrollTimer = window.setTimeout(() => {
            adminChatRenderAutoScrollTimer = 0;
            const keyboardStillOpen = !!(
              document.body
              && document.body.classList.contains("chat-mobile-keyboard-open")
            );
            if (!keyboardStillOpen) return;
            if (String(state.activeClientId || "") !== renderClientIdAtSchedule) return;
            scrollMessagesToBottom({ behavior: smoothScroll ? "smooth-fast" : "auto" });
          }, 130);
        } else {
          scrollMessagesToBottom({ behavior: smoothScroll ? "smooth-fast" : "auto" });
        }
      }
    }
    if (dom.center.messagesWrap && !state.selectionMode && !isAdminMobileChatLayout()) {
      const wrap = dom.center.messagesWrap;
      const hiddenDistance = Math.max(
        0,
        Number(wrap.scrollHeight || 0) - Number(wrap.clientHeight || 0) - Number(wrap.scrollTop || 0)
      );
      const shouldForceDesktopBottomWindow = (
        String(state.forceDesktopBottomClientId || "") === String(state.activeClientId || "")
        && Date.now() < Number(state.forceDesktopBottomUntil || 0)
      );
      const shouldForceDesktopBottomSnap = (
        (thread.length <= 12 && hiddenDistance > 120)
        || (shouldForceDesktopBottomWindow && hiddenDistance > 24)
      );
      if (shouldForceDesktopBottomSnap) {
        scrollMessagesToBottom({ behavior: "auto", keepPending: true });
      }
    }
    syncPendingScrollCountByViewport(state.activeClientId);
    if (!skipSaveScrollPosition) {
      saveThreadScrollPosition(state.activeClientId);
    }
    updateMessagesScrollDownButton();
    renderPeerTypingIndicator();
    applyThreadImageLoadingStrategy();
    if (!skipPinnedBottomEnforce) {
      enforcePinnedBottomForActiveThread("renderMessages:end");
    }
    flushPendingNotificationMessageFocus();
  }

  function sendMessage(text, options = {}) {
    if (!state.activeClientId) return false;
    const clean = normalizeComposerText(text);
    const attachment = isImageAttachment(options.attachment) ? options.attachment : null;
    if (!clean && !attachment) return false;

    if (state.editingMessageId) {
      const ok = updateThreadMessage(state.activeClientId, state.editingMessageId, clean);
      cancelEditingMessage();
      if (!ok) return false;
      clearComposerDraftForClient(state.activeClientId);
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
      reactions: { in: "", out: "" },
      replyTo: replySnapshot,
      deliveryStatus: "sent",
      deliveredAt: "",
      readAt: "",
    });

    scheduleOutgoingDeliveryProgress(state.activeClientId, newMessageId);
    clearComposerReply();
    clearComposerDraftForClient(state.activeClientId);
    hideMessageContextMenu();
    renderMessages({ forceScrollBottom: true, smoothScroll: true });
    applyClientFilter();
    playOutgoingMessageSendTone();
    return true;
  }

  function bindAdminMobileFooterPanGuard() {
    const footer = dom.center.footerPanel;
    if (!footer || footer.dataset.mobilePanGuardBound === "1") return;
    footer.dataset.mobilePanGuardBound = "1";

    let activePointerId = null;
    let activeTouchId = null;
    let startX = 0;
    let startY = 0;
    let dragAxis = "";
    let trackedInput = null;

    const reset = () => {
      activePointerId = null;
      activeTouchId = null;
      startX = 0;
      startY = 0;
      dragAxis = "";
      trackedInput = null;
    };

    const isEnabled = () => isAdminMobileChatLayout();

    const begin = (clientX, clientY, target) => {
      startX = Number(clientX || 0);
      startY = Number(clientY || 0);
      dragAxis = "";
      trackedInput = target && target.closest ? target.closest(".chat-message-input") : null;
    };

    const canScrollTrackedInput = (deltaY) => {
      if (!trackedInput) return false;
      const maxTop = Math.max(0, Number(trackedInput.scrollHeight || 0) - Number(trackedInput.clientHeight || 0));
      if (maxTop <= 1) return false;
      const currentTop = Math.max(0, Number(trackedInput.scrollTop || 0));
      if (deltaY < 0 && currentTop < maxTop - 1) return true;
      if (deltaY > 0 && currentTop > 1) return true;
      return false;
    };

    const shouldBlockMove = (clientX, clientY) => {
      if (!isEnabled()) return false;
      const deltaX = Number(clientX || 0) - startX;
      const deltaY = Number(clientY || 0) - startY;
      if (!dragAxis) {
        if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return false;
        dragAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      }
      if (dragAxis !== "y") return false;
      if (canScrollTrackedInput(deltaY)) return false;
      return true;
    };

    const resolveTrackedTouch = (touchList) => {
      if (activeTouchId == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === activeTouchId) return touch;
      }
      return null;
    };

    footer.addEventListener("pointerdown", (event) => {
      if (!isEnabled()) return;
      if (event.pointerType === "mouse" || event.button !== 0) return;
      activePointerId = event.pointerId;
      begin(event.clientX, event.clientY, event.target);
    }, { capture: true });

    footer.addEventListener("pointermove", (event) => {
      if (activePointerId == null || event.pointerId !== activePointerId) return;
      if (!shouldBlockMove(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    footer.addEventListener("touchstart", (event) => {
      if (!isEnabled() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      begin(touch.clientX, touch.clientY, event.target);
    }, { passive: true, capture: true });

    footer.addEventListener("touchmove", (event) => {
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;
      if (!shouldBlockMove(touch.clientX, touch.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    ["pointerup", "pointercancel", "lostpointercapture", "touchend", "touchcancel"].forEach((eventName) => {
      footer.addEventListener(eventName, reset, { passive: true, capture: true });
    });
  }

  function bindAdminChatZoomGuards() {
    const pageBody = document.body;
    if (!pageBody || !pageBody.classList.contains("page-chat")) return;
    if (pageBody.dataset.chatZoomGuardBound === "1") return;
    pageBody.dataset.chatZoomGuardBound = "1";

    const shouldBlock = () => !!document.body && document.body.classList.contains("page-chat");
    const preventGesture = (event) => {
      if (!shouldBlock()) return;
      event.preventDefault();
    };
    const preventMultiTouch = (event) => {
      if (!shouldBlock()) return;
      const touches = Number(event.touches && event.touches.length || 0);
      if (touches > 1) {
        event.preventDefault();
      }
    };
    const preventCtrlWheelZoom = (event) => {
      if (!shouldBlock() || event.ctrlKey !== true) return;
      event.preventDefault();
    };

    ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
      document.addEventListener(eventName, preventGesture, { passive: false, capture: true });
    });
    document.addEventListener("touchstart", preventMultiTouch, { passive: false, capture: true });
    document.addEventListener("touchmove", preventMultiTouch, { passive: false, capture: true });
    document.addEventListener("wheel", preventCtrlWheelZoom, { passive: false, capture: true });
  }

  function bindAdminMobileVerticalPanGuard(element, datasetKey) {
    if (!element) return;
    const guardKey = String(datasetKey || "mobilePanGuardBound");
    if (element.dataset && element.dataset[guardKey] === "1") return;
    if (element.dataset) element.dataset[guardKey] = "1";

    let activePointerId = null;
    let activeTouchId = null;
    let startX = 0;
    let startY = 0;
    let dragAxis = "";

    const isEnabled = () => isAdminMobileChatLayout();

    const reset = () => {
      activePointerId = null;
      activeTouchId = null;
      startX = 0;
      startY = 0;
      dragAxis = "";
    };

    const begin = (clientX, clientY) => {
      startX = Number(clientX || 0);
      startY = Number(clientY || 0);
      dragAxis = "";
    };

    const shouldBlockMove = (clientX, clientY) => {
      if (!isEnabled()) return false;
      const deltaX = Number(clientX || 0) - startX;
      const deltaY = Number(clientY || 0) - startY;
      if (!dragAxis) {
        if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return false;
        dragAxis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
      }
      return dragAxis === "y";
    };

    const resolveTrackedTouch = (touchList) => {
      if (activeTouchId == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === activeTouchId) return touch;
      }
      return null;
    };

    element.addEventListener("pointerdown", (event) => {
      if (!isEnabled()) return;
      if (event.pointerType === "mouse" || event.button !== 0) return;
      activePointerId = event.pointerId;
      begin(event.clientX, event.clientY);
    }, { capture: true });

    element.addEventListener("pointermove", (event) => {
      if (activePointerId == null || event.pointerId !== activePointerId) return;
      if (!shouldBlockMove(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    element.addEventListener("touchstart", (event) => {
      if (!isEnabled() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      begin(touch.clientX, touch.clientY);
    }, { passive: true, capture: true });

    element.addEventListener("touchmove", (event) => {
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;
      if (!shouldBlockMove(touch.clientX, touch.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    ["pointerup", "pointercancel", "lostpointercapture", "touchend", "touchcancel"].forEach((eventName) => {
      element.addEventListener(eventName, reset, { passive: true, capture: true });
    });
  }

  function bindAdminMobileStaticPanGuards() {
    bindAdminMobileVerticalPanGuard(dom.center.headerPanel, "mobilePanGuardBound");
    bindAdminMobileVerticalPanGuard(dom.center.scrollDownBtn, "mobilePanGuardBound");
  }

  function bindAdminMobileEmptyThreadTouchBlock() {
    const wrap = dom.center.messagesWrap;
    if (!wrap || wrap.dataset.mobileEmptyThreadTouchBlockBound === "1") return;
    wrap.dataset.mobileEmptyThreadTouchBlockBound = "1";

    let touchState = null;

    const reset = () => {
      touchState = null;
    };

    const resolveTrackedTouch = (touchList) => {
      if (!touchState || touchState.id == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === touchState.id) return touch;
      }
      return null;
    };

    const shouldBlock = () => {
      if (!isAdminMobileChatLayout()) return false;
      if (hasFocusedAdminChatTextInput()) return false;
      if (isAdminChatThreadVerticallyScrollable(wrap)) return false;
      return true;
    };

    wrap.addEventListener("touchstart", (event) => {
      reset();
      if (event.touches.length !== 1) return;
      if (!shouldBlock()) return;
      const touch = event.touches[0];
      touchState = {
        id: touch.identifier,
        startX: Number(touch.clientX || 0),
        startY: Number(touch.clientY || 0),
      };
    }, { passive: true, capture: true });

    wrap.addEventListener("touchmove", (event) => {
      if (!touchState) return;
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;
      if (!shouldBlock()) {
        reset();
        return;
      }
      const dx = Number(touch.clientX || 0) - touchState.startX;
      const dy = Number(touch.clientY || 0) - touchState.startY;
      if (dy <= 6 || Math.abs(dy) <= Math.abs(dx)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    ["touchend", "touchcancel"].forEach((eventName) => {
      wrap.addEventListener(eventName, reset, { passive: true, capture: true });
    });
  }

  function bindAdminMobileThreadSwipeToClients() {
    const wrap = dom.center.messagesWrap;
    if (!wrap || wrap.dataset.mobileThreadSwipeToClientsBound === "1") return;
    wrap.dataset.mobileThreadSwipeToClientsBound = "1";

    let activeTouchId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let swipeLocked = false;
    let dragStarted = false;

    const reset = () => {
      if (document.body) {
        document.body.classList.remove("chat-mobile-left-dragging");
      }
      if (dom.left.panel) {
        dom.left.panel.style.removeProperty("transform");
      }
      activeTouchId = null;
      startX = 0;
      startY = 0;
      lastX = 0;
      lastY = 0;
      swipeLocked = false;
      dragStarted = false;
    };

    const isEnabled = () => {
      if (shouldPreferNativeAdminMobileChatTouchHandling()) return false;
      if (!isAdminMobileChatLayout()) return false;
      if (!document.body) return false;
      if (document.body.classList.contains("chat-mobile-left-open")) return false;
      if (document.body.classList.contains("chat-mobile-right-open")) return false;
      if (state.selectionMode) return false;
      if (hasFocusedAdminChatTextInput()) return false;
      return true;
    };

    const getLeftPanelClosedDistance = () => {
      const panelWidth = Math.max(
        0,
        Math.round(
          Number(dom.left.panel?.getBoundingClientRect?.().width || 0)
          || Number(dom.left.panel?.offsetWidth || 0)
          || Number(window.innerWidth || 0)
        )
      );
      return Math.max(0, panelWidth + 18);
    };

    const applyDragOffset = (clientX) => {
      if (!document.body || !dom.left.panel) return;
      const panelWidth = Math.max(
        0,
        Math.round(
          Number(dom.left.panel?.offsetWidth || 0)
          || Number(window.innerWidth || 0)
        )
      );
      const closedDistance = getLeftPanelClosedDistance();
      const pointerX = Math.max(0, Number(clientX || 0));
      const offset = Math.max(-closedDistance, Math.min(0, pointerX - panelWidth));
      document.body.classList.add("chat-mobile-left-dragging");
      dom.left.panel.style.transform = `translateX(${offset}px)`;
    };

    const resolveTrackedTouch = (touchList) => {
      if (activeTouchId == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === activeTouchId) return touch;
      }
      return null;
    };

    wrap.addEventListener("touchstart", (event) => {
      reset();
      if (!isEnabled() || event.touches.length !== 1) return;
      if (!isAdminChatEmptyThreadTouchTarget(event.target)) return;
      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      startX = Number(touch.clientX || 0);
      startY = Number(touch.clientY || 0);
      lastX = startX;
      lastY = startY;
    }, { passive: true });

    wrap.addEventListener("touchmove", (event) => {
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch) return;
      lastX = Number(touch.clientX || 0);
      lastY = Number(touch.clientY || 0);

      const dx = lastX - startX;
      const dy = lastY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (!swipeLocked) {
        if (absX < CHAT_TOUCH_THREAD_NAV_LOCK_PX && absY < CHAT_TOUCH_THREAD_NAV_LOCK_PX) return;
        if (absY > absX || dx >= 0) {
          reset();
          return;
        }
        swipeLocked = true;
        dragStarted = true;
        hideMessageContextMenu();
        hideReactionBar();
        hideEmojiPopover();
      }

      applyDragOffset(lastX);
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    const finish = () => {
      if (activeTouchId == null) return;
      const dx = lastX - startX;
      const dy = lastY - startY;
      const shouldOpenClients = (
        swipeLocked
        && dx <= -CHAT_TOUCH_THREAD_NAV_TRIGGER_PX
        && Math.abs(dy) <= Math.max(44, Math.abs(dx))
      );
      const hadDrag = dragStarted === true;
      if (!hadDrag) {
        reset();
        return;
      }
      if (document.body) {
        document.body.classList.remove("chat-mobile-left-dragging");
      }
      if (shouldOpenClients) {
        openClientsPanel();
      } else {
        syncMobileChatView("center", { persistState: false });
      }
      if (dom.left.panel) {
        dom.left.panel.style.removeProperty("transform");
      }
      activeTouchId = null;
      startX = 0;
      startY = 0;
      lastX = 0;
      lastY = 0;
      swipeLocked = false;
      dragStarted = false;
    };

    wrap.addEventListener("touchend", finish, { passive: true });
    wrap.addEventListener("touchcancel", reset, { passive: true });
  }

  function bindAdminMobileThreadKeyboardDismiss() {
    const wrap = dom.center.messagesWrap;
    if (!wrap || wrap.dataset.mobileKeyboardDismissBound === "1") return;
    wrap.dataset.mobileKeyboardDismissBound = "1";

    let activeTouchId = null;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let eligible = false;

    const reset = () => {
      activeTouchId = null;
      startX = 0;
      startY = 0;
      moved = false;
      eligible = false;
    };

    const resolveTrackedTouch = (touchList) => {
      if (activeTouchId == null || !touchList) return null;
      for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList[index];
        if (touch && touch.identifier === activeTouchId) return touch;
      }
      return null;
    };

    wrap.addEventListener("touchstart", (event) => {
      reset();
      if (shouldPreferNativeAdminMobileChatTouchHandling()) return;
      if (!isAdminMobileChatLayout()) return;
      if (!hasFocusedAdminChatTextInput()) return;
      if (event.touches.length !== 1) return;
      if (!isAdminChatEmptyThreadTouchTarget(event.target)) return;
      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      startX = Number(touch.clientX || 0);
      startY = Number(touch.clientY || 0);
      eligible = true;
    }, { passive: true });

    wrap.addEventListener("touchmove", (event) => {
      const touch = resolveTrackedTouch(event.touches) || resolveTrackedTouch(event.changedTouches);
      if (!touch || !eligible) return;
      const dx = Number(touch.clientX || 0) - startX;
      const dy = Number(touch.clientY || 0) - startY;
      if (Math.abs(dx) >= 8 || Math.abs(dy) >= 8) {
        moved = true;
      }
    }, { passive: true });

    const finish = (event) => {
      if (activeTouchId == null) return;
      const shouldDismiss = eligible
        && !moved
        && isAdminMobileChatLayout()
        && hasFocusedAdminChatTextInput()
        && isAdminChatEmptyThreadTouchTarget(event.target);
      reset();
      if (shouldDismiss) {
        dismissAdminChatTextInputFocus();
      }
    };

    wrap.addEventListener("touchend", finish, { passive: true });
    wrap.addEventListener("touchcancel", reset, { passive: true });
  }

  function finalizeComposerSendUi(options = {}) {
    const refocusInput = options.refocusInput !== false;
    stopLocalTypingSession(state.activeClientId, { flush: true, force: true });

    if (dom.center.input) {
      dom.center.input.value = "";
      syncComposerRichPreview({ stickToBottom: true });
      if (refocusInput && !dom.center.input.disabled) {
        focusComposerInput({ moveCaretToEnd: false });
      }
    } else {
      syncComposerRichPreview({ stickToBottom: true });
    }
    syncComposerSendButtonFocusLock();

    if (!dom.center.messagesWrap || state.selectionMode) return;
    requestAnimationFrame(() => {
      if (!dom.center.messagesWrap) return;
      scrollMessagesToBottom({ behavior: "auto", keepPending: true });
      saveThreadScrollPosition(state.activeClientId);
    });
  }

  function getAttachPreviewTitle(count) {
    const total = Number(count) || 0;
    if (total <= 1) return "1 фотография";
    if (total >= 2 && total <= 4) return `${total} фотографии`;
    return `${total} фотографий`;
  }

  function clearAttachPreviewObjectUrls() {
    const urls = Array.isArray(state.attachPreviewObjectUrls) ? state.attachPreviewObjectUrls : [];
    if (!urls.length) return;
    urls.forEach((url) => {
      try { URL.revokeObjectURL(String(url || "")); } catch {}
    });
    state.attachPreviewObjectUrls = [];
  }

  function closeAttachPreview(options = {}) {
    const clearItems = options.clearItems !== false;
    const focusComposer = options.focusComposer !== false;
    const clearCaption = options.clearCaption !== false;
    const clearPersistedDraft = options.clearPersistedDraft !== false;
    const overlay = dom.center.attachPreviewOverlay;
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
    if (clearItems) {
      clearAttachPreviewObjectUrls();
      state.attachPreviewItems = [];
      state.attachPreviewActiveIndex = 0;
      state.attachPreviewSourceFiles = [];
      state.attachPreviewSending = false;
    }
    if (clearCaption && dom.center.attachPreviewCaption) {
      dom.center.attachPreviewCaption.value = "";
    }
    if (dom.center.attachPreviewThumbs) {
      dom.center.attachPreviewThumbs.innerHTML = "";
      dom.center.attachPreviewThumbs.classList.add("hidden");
    }
    if (dom.center.attachPreviewSendBtn) {
      dom.center.attachPreviewSendBtn.disabled = false;
    }
    if (
      dom.center.emojiPopover
      && dom.center.emojiPopover.classList.contains("is-attach-preview")
    ) {
      hideEmojiPopover();
    }
    if (dom.center.attachInput) dom.center.attachInput.value = "";
    if (focusComposer && dom.center.input && !dom.center.input.disabled) {
      focusComposerInput({ moveCaretToEnd: false });
    }
    if (clearItems && clearPersistedDraft) {
      clearPersistedAttachPreviewDraft().catch(() => {});
    }
  }

  function isMessageImageViewerOpen() {
    return !!(
      dom.center.imageViewerOverlay
      && !dom.center.imageViewerOverlay.classList.contains("hidden")
    );
  }

  function clearMessageImageViewerLayout() {
    if (!dom.center.imageViewerOverlay) return;
    dom.center.imageViewerOverlay.style.removeProperty("--chat-image-viewer-max-width");
    dom.center.imageViewerOverlay.style.removeProperty("--chat-image-viewer-max-height");
    dom.center.imageViewerOverlay.style.removeProperty("--chat-image-viewer-target-width");
    dom.center.imageViewerOverlay.style.removeProperty("--chat-image-viewer-target-height");
  }

  function updateMessageImageViewerLayout() {
    const overlay = dom.center.imageViewerOverlay;
    const image = dom.center.imageViewerImage;
    if (!isMessageImageViewerOpen()) return;
    if (!overlay || !overlay.isConnected || !image) return;

    const naturalWidth = Number(image.naturalWidth || 0);
    const naturalHeight = Number(image.naturalHeight || 0);
    if (
      !Number.isFinite(naturalWidth)
      || !Number.isFinite(naturalHeight)
      || naturalWidth <= 0
      || naturalHeight <= 0
    ) {
      return;
    }

    const overlayRect = overlay.getBoundingClientRect();
    const overlayWidth = Number((overlayRect && overlayRect.width) || 0);
    const overlayHeight = Number((overlayRect && overlayRect.height) || 0);
    const viewportWidth = overlayWidth > 0
      ? overlayWidth
      : Math.max(
        Number(window.innerWidth || 0),
        Number((document.documentElement && document.documentElement.clientWidth) || 0)
      );
    const viewportHeight = overlayHeight > 0
      ? overlayHeight
      : Math.max(
        Number(window.innerHeight || 0),
        Number((document.documentElement && document.documentElement.clientHeight) || 0)
      );
    if (!viewportWidth || !viewportHeight) return;

    const compact = viewportWidth <= 768;
    const padding = compact ? 12 : 18;
    const closeButtonReserve = compact ? 18 : 24;
    const maxWidth = Math.max(220, viewportWidth - (padding * 2));
    const maxHeight = Math.max(180, viewportHeight - (padding * 2) - closeButtonReserve);
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    const targetWidth = Math.max(160, Math.round(naturalWidth * scale));
    const targetHeight = Math.max(120, Math.round(naturalHeight * scale));

    overlay.style.setProperty("--chat-image-viewer-max-width", maxWidth + "px");
    overlay.style.setProperty("--chat-image-viewer-max-height", maxHeight + "px");
    overlay.style.setProperty("--chat-image-viewer-target-width", targetWidth + "px");
    overlay.style.setProperty("--chat-image-viewer-target-height", targetHeight + "px");
  }

  function closeMessageImageViewer() {
    if (!dom.center.imageViewerOverlay) return;
    dom.center.imageViewerOverlay.classList.add("hidden");
    dom.center.imageViewerOverlay.setAttribute("aria-hidden", "true");
    if (dom.center.imageViewerImage) {
      dom.center.imageViewerImage.removeAttribute("src");
    }
    clearMessageImageViewerLayout();
  }

  function openMessageImageViewer(imageSrc, imageAlt = "") {
    if (!dom.center.imageViewerOverlay || !dom.center.imageViewerImage) return false;
    const src = String(imageSrc || "").trim();
    if (!src) return false;
    clearMessageImageViewerLayout();
    dom.center.imageViewerImage.src = src;
    dom.center.imageViewerImage.alt = String(imageAlt || "Image preview");
    dom.center.imageViewerOverlay.classList.remove("hidden");
    dom.center.imageViewerOverlay.setAttribute("aria-hidden", "false");
    if (dom.center.imageViewerImage.complete) {
      updateMessageImageViewerLayout();
    }
    return true;
  }

  function initMessageImageViewerModal() {
    const overlay = dom.center.imageViewerOverlay;
    if (!overlay || overlay.dataset.bound === "1") return;
    overlay.dataset.bound = "1";

    if (dom.center.imageViewerCloseBtn) {
      dom.center.imageViewerCloseBtn.addEventListener("click", () => {
        closeMessageImageViewer();
      });
    }

    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      closeMessageImageViewer();
    });

    if (dom.center.imageViewerImage) {
      dom.center.imageViewerImage.addEventListener("load", () => {
        updateMessageImageViewerLayout();
      });
    }
  }

  function renderAttachPreview() {
    const items = Array.isArray(state.attachPreviewItems) ? state.attachPreviewItems : [];
    const total = items.length;
    if (!total) {
      closeAttachPreview({ focusComposer: false });
      return;
    }

    const nextIndex = Math.max(0, Math.min(Number(state.attachPreviewActiveIndex) || 0, total - 1));
    state.attachPreviewActiveIndex = nextIndex;
    const active = items[nextIndex] || null;

    if (dom.center.attachPreviewTitle) {
      dom.center.attachPreviewTitle.textContent = getAttachPreviewTitle(total);
    }
    if (dom.center.attachPreviewImage && active) {
      dom.center.attachPreviewImage.src = getAttachmentImageSrc(active);
      dom.center.attachPreviewImage.alt = String(active.name || "Изображение");
    }

    if (dom.center.attachPreviewThumbs) {
      const thumbs = dom.center.attachPreviewThumbs;
      thumbs.innerHTML = "";
      if (total > 1) {
        thumbs.classList.remove("hidden");
        items.forEach((item, idx) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chat-attach-preview-thumb";
          if (idx === nextIndex) btn.classList.add("is-active");
          btn.setAttribute("data-chat-attach-preview-index", String(idx));

          const img = document.createElement("img");
          img.src = getAttachmentImageSrc(item);
          img.alt = String(item.name || `Фото ${idx + 1}`);
          img.loading = "eager";
          img.decoding = "async";
          img.draggable = false;

          btn.appendChild(img);
          thumbs.appendChild(btn);
        });
      } else {
        thumbs.classList.add("hidden");
      }
    }
  }

  function openAttachPreview(attachments, options = {}) {
    const items = Array.isArray(attachments)
      ? attachments.filter((item) => isImageAttachment(item))
      : [];
    if (!items.length || !dom.center.attachPreviewOverlay) return false;

    state.attachPreviewItems = items;
    state.attachPreviewActiveIndex = 0;
    if (options.preserveSourceFiles !== true) {
      state.attachPreviewSourceFiles = [];
    }
    state.attachPreviewSending = false;
    if (dom.center.attachPreviewSendBtn) {
      dom.center.attachPreviewSendBtn.disabled = false;
    }
    if (dom.center.attachPreviewCaption) {
      dom.center.attachPreviewCaption.value = String(options.caption || "");
    }

    renderAttachPreview();
    dom.center.attachPreviewOverlay.classList.remove("hidden");
    dom.center.attachPreviewOverlay.setAttribute("aria-hidden", "false");
    if (dom.center.attachPreviewCaption) {
      focusChatTextField(dom.center.attachPreviewCaption, { moveCaretToEnd: false });
    }
    return true;
  }

  function hideEmojiPopover() {
    if (!dom.center.emojiPopover) return;
    remountEmojiPopover("composer");
    dom.center.emojiPopover.classList.add("hidden");
    dom.center.emojiPopover.classList.remove("is-attach-preview");
    dom.center.emojiPopover.classList.remove("is-mobile-sheet");
    emojiPopoverMode = "composer";
    emojiPopoverReactionMessageId = "";
    syncEmojiSheetOpenState();
  }

  function remountEmojiPopover(target = "composer") {
    if (!dom.center.emojiPopover) return;
    const popover = dom.center.emojiPopover;
    if (!popover.__homeParent) {
      popover.__homeParent = popover.parentElement || null;
    }
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    const canMountToAttachPreview = (
      normalizedTarget === "attach-preview"
      && dom.center.attachPreviewOverlay
      && !dom.center.attachPreviewOverlay.classList.contains("hidden")
    );
    const desiredParent = canMountToAttachPreview ? dom.center.attachPreviewOverlay : popover.__homeParent;
    if (!desiredParent) return;
    if (popover.parentElement === desiredParent) return;
    desiredParent.appendChild(popover);
  }

  function toggleEmojiPopover(target = "composer") {
    if (!dom.center.emojiPopover) return;
    const popover = dom.center.emojiPopover;
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    const isPreviewTarget = normalizedTarget === "attach-preview";
    const isOpen = !popover.classList.contains("hidden");
    const hasSameTarget = popover.classList.contains("is-attach-preview") === isPreviewTarget;
    const willOpen = !isOpen || !hasSameTarget;

    remountEmojiPopover(normalizedTarget);
    popover.classList.toggle("is-attach-preview", isPreviewTarget);
    updateEmojiPopoverViewportMode();
    popover.classList.toggle("hidden", !willOpen);
    if (!willOpen) {
      remountEmojiPopover("composer");
      emojiPopoverMode = "composer";
      emojiPopoverReactionMessageId = "";
      popover.classList.remove("is-mobile-sheet");
    }
    syncEmojiSheetOpenState();
    if (willOpen) {
      if (normalizedTarget !== "attach-preview") {
        emojiPopoverMode = "composer";
        emojiPopoverReactionMessageId = "";
        setEmojiDefaultOpenCategory();
      }
      renderEmojiPicker();
      ensureEmojiDatasetLoaded().catch(() => {});
      requestAnimationFrame(syncEmojiPickerViewportPosition);
    }
  }

  function showEmojiPopover(target = "composer", options = {}) {
    if (!dom.center.emojiPopover) return;
    const popover = dom.center.emojiPopover;
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    const isPreviewTarget = normalizedTarget === "attach-preview";
    const mode = options && options.mode === "reaction" ? "reaction" : "composer";
    const messageId = mode === "reaction" ? String(options.messageId || "") : "";

    remountEmojiPopover(normalizedTarget);
    popover.classList.toggle("is-attach-preview", isPreviewTarget);
    updateEmojiPopoverViewportMode();
    popover.classList.remove("hidden");
    emojiPopoverMode = mode;
    emojiPopoverReactionMessageId = messageId;
    if (mode !== "reaction" && normalizedTarget !== "attach-preview") {
      setEmojiDefaultOpenCategory();
    }
    syncEmojiSheetOpenState();
    renderEmojiPicker();
    ensureEmojiDatasetLoaded().catch(() => {});
    requestAnimationFrame(syncEmojiPickerViewportPosition);
  }

  function sendPreparedImageAttachments(attachments, options = {}) {
    if (!state.activeClientId) return 0;
    const list = Array.isArray(attachments)
      ? attachments.filter((item) => isImageAttachment(item))
      : [];
    if (!list.length) return 0;

    const replySnapshot = state.replyDraft && state.replyDraft.id
      ? {
          id: String(state.replyDraft.id),
          sender: String(state.replyDraft.sender || ""),
          text: String(state.replyDraft.text || ""),
        }
      : null;

    const captionText = normalizeComposerText(options.caption || "");
    let sent = 0;
    for (const attachment of list) {
      const newMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pushMessage(state.activeClientId, {
        id: newMessageId,
        direction: "out",
        text: sent === 0 ? captionText : "",
        attachment,
        createdAt: new Date().toISOString(),
        read: false,
        pinned: false,
        reaction: "",
        reactions: { in: "", out: "" },
        replyTo: sent === 0 ? replySnapshot : null,
        deliveryStatus: "sent",
        deliveredAt: "",
        readAt: "",
      });
      scheduleOutgoingDeliveryProgress(state.activeClientId, newMessageId);
      sent += 1;
    }

    if (sent > 0) {
      stopLocalTypingSession(state.activeClientId, { flush: true, force: true });
      clearComposerReply();
      hideMessageContextMenu();
      renderMessages({ forceScrollBottom: true, smoothScroll: true });
      applyClientFilter();
      playOutgoingMessageSendTone();
    }
    return sent;
  }

  async function sendImageAttachments(files, options = {}) {
    if (!isChatWidgetEnabledRuntime()) return 0;
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return 0;

    const prepared = await Promise.all(
      list.map((file) => buildImageAttachmentFromFile(file).catch(() => null))
    );
    const attachments = prepared.filter(Boolean);

    return sendPreparedImageAttachments(attachments, options);
  }

  async function openAttachPreviewFromFiles(files, options = {}) {
    if (!isChatWidgetEnabledRuntime()) return false;
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return false;

    if (state.editingMessageId) {
      cancelEditingMessage();
    }
    clearAttachPreviewObjectUrls();
    state.attachPreviewSourceFiles = [];

    const prepared = [];
    list.forEach((file) => {
      if (!(file instanceof File)) return;
      if (!isLikelyImageFile(file)) return;
      const previewAttachment = buildLocalAttachPreviewItemFromFile(file);
      if (!previewAttachment) return;
      prepared.push({ file, attachment: previewAttachment });
    });

    if (!prepared.length) return false;
    state.attachPreviewSourceFiles = prepared.map((item) => item.file);
    const attachments = prepared.map((item) => item.attachment);
    const previewOptions = {
      preserveSourceFiles: true,
      caption: String(options.caption || ""),
    };
    if (Object.prototype.hasOwnProperty.call(options, "focusCaption")) {
      previewOptions.focusCaption = options.focusCaption === true;
    }
    const opened = openAttachPreview(attachments, previewOptions);
    if (opened) schedulePersistAttachPreviewDraft(0);
    return opened;
  }

  function initAttachPreviewModal() {
    const overlay = dom.center.attachPreviewOverlay;
    if (!overlay || overlay.dataset.bound === "1") return;
    overlay.dataset.bound = "1";

    if (dom.center.attachPreviewCloseBtn) {
      dom.center.attachPreviewCloseBtn.addEventListener("click", () => {
        closeAttachPreview();
      });
    }

    if (dom.center.attachPreviewThumbs) {
      dom.center.attachPreviewThumbs.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-chat-attach-preview-index]");
        if (!btn) return;
        const idx = Number(btn.getAttribute("data-chat-attach-preview-index") || 0);
        if (!Number.isFinite(idx)) return;
        state.attachPreviewActiveIndex = idx;
        renderAttachPreview();
      });
    }

    if (dom.center.attachPreviewEmojiBtn) {
      dom.center.attachPreviewEmojiBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (shouldUseNativeMobileEmojiKeyboard()) {
          hideEmojiPopover();
          if (dom.center.attachPreviewCaption) {
            focusChatTextField(dom.center.attachPreviewCaption, { moveCaretToEnd: false });
          }
          return;
        }
        toggleEmojiPopover("attach-preview");
        if (dom.center.attachPreviewCaption) {
          focusChatTextField(dom.center.attachPreviewCaption, { moveCaretToEnd: false });
        }
      });
    }

    if (dom.center.attachPreviewSendBtn) {
      dom.center.attachPreviewSendBtn.addEventListener("click", async () => {
        if (state.attachPreviewSending) return;
        const caption = dom.center.attachPreviewCaption
          ? String(dom.center.attachPreviewCaption.value || "")
          : "";
        const sourceFiles = Array.isArray(state.attachPreviewSourceFiles)
          ? state.attachPreviewSourceFiles.filter((file) => file instanceof File)
          : [];

        state.attachPreviewSending = true;
        dom.center.attachPreviewSendBtn.disabled = true;
        try {
          const sent = sourceFiles.length
            ? await sendImageAttachments(sourceFiles, { caption })
            : sendPreparedImageAttachments(state.attachPreviewItems, { caption });
          if (sent > 0) {
            closeAttachPreview({ clearCaption: true });
          }
        } finally {
          state.attachPreviewSending = false;
          if (
            dom.center.attachPreviewOverlay
            && !dom.center.attachPreviewOverlay.classList.contains("hidden")
          ) {
            dom.center.attachPreviewSendBtn.disabled = false;
          }
        }
      });
    }

    if (dom.center.attachPreviewCaption) {
      bindAdminMobileTextFieldTapFocus(dom.center.attachPreviewCaption, "mobileCaptionTapFocusBound");
      dom.center.attachPreviewCaption.addEventListener("click", repairAdminIosTextFocusOnClick);
      dom.center.attachPreviewCaption.addEventListener("input", () => {
        schedulePersistAttachPreviewDraft();
      });
      dom.center.attachPreviewCaption.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (dom.center.attachPreviewSendBtn) dom.center.attachPreviewSendBtn.click();
      });
      dom.center.attachPreviewCaption.addEventListener("focus", handleAdminChatTextInputFocus);
      dom.center.attachPreviewCaption.addEventListener("blur", handleAdminChatTextInputBlur);
    }

    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      closeAttachPreview();
    });
  }

  function initMessageContextMenu() {
    if (!dom.center.messages || !dom.center.contextMenu) return;
    let touchContextGesture = null;
    let touchAttachmentTap = null;
    let orderCardMouseDrag = null;
    let orderCardTouchPan = null;
    let suppressOrderCardClickUntil = 0;
    const CHAT_ATTACHMENT_TAP_MAX_MS = 260;
    const CHAT_ATTACHMENT_TAP_MOVE_CANCEL_PX = 10;
    const CHAT_ORDER_CARD_MOUSE_DRAG_START_PX = 5;
    const CHAT_ORDER_CARD_TOUCH_PAN_START_PX = 6;
    const CHAT_ORDER_CARD_MOUSE_DRAG_SUPPRESS_CLICK_MS = 240;
    const CHAT_ORDER_CARD_MOUSE_DRAG_FACTOR = 1;
    const CHAT_ORDER_CARD_TOUCH_PAN_FACTOR = 1;
    const CHAT_ORDER_CARD_WHEEL_FACTOR = 1;

    function clearTouchContextGesture() {
      if (!touchContextGesture) return;
      if (touchContextGesture.longPressTimer) {
        window.clearTimeout(touchContextGesture.longPressTimer);
      }
      if (touchContextGesture.bubble) {
        touchContextGesture.bubble.classList.remove("is-swipe-active", "is-swipe-returning");
        touchContextGesture.bubble.style.transform = "";
      }
      touchContextGesture = null;
    }

    function clearOrderCardMouseDrag(options) {
      if (!orderCardMouseDrag) return;
      const opts = options || {};
      const strip = orderCardMouseDrag.strip;
      if (strip && strip.classList) {
        strip.classList.remove("is-mouse-dragging");
      }
      if (opts.suppressClick === true && orderCardMouseDrag.didDrag === true) {
        suppressOrderCardClickUntil = Math.max(
          suppressOrderCardClickUntil,
          Date.now() + CHAT_ORDER_CARD_MOUSE_DRAG_SUPPRESS_CLICK_MS,
        );
      }
      orderCardMouseDrag = null;
    }

    function clearOrderCardTouchPan(options) {
      if (!orderCardTouchPan) return;
      const opts = options || {};
      const strip = orderCardTouchPan.strip;
      if (strip && strip.classList) {
        strip.classList.remove("is-mouse-dragging");
      }
      if (opts.suppressClick === true && orderCardTouchPan.didDrag === true) {
        suppressOrderCardClickUntil = Math.max(
          suppressOrderCardClickUntil,
          Date.now() + CHAT_ORDER_CARD_MOUSE_DRAG_SUPPRESS_CLICK_MS,
        );
      }
      orderCardTouchPan = null;
    }

    function resolveOrderCardScrollStrip(target) {
      const targetEl = target && target.closest ? target : null;
      if (!targetEl) return null;
      const strip = targetEl.closest(".chat-message-order-cards")
        || (targetEl.closest(".chat-message-bubble--order-card")
          ? targetEl.closest(".chat-message-bubble--order-card").querySelector(".chat-message-order-cards")
          : null);
      if (!strip) return null;
      const maxLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
      if (maxLeft <= 0) return null;
      return strip;
    }

    dom.center.messages.addEventListener("touchstart", (event) => {
      const target = event.target;
      if (!target || !target.closest || event.touches.length !== 1) {
        touchAttachmentTap = null;
        return;
      }
      const attachmentWrap = target.closest(".chat-message-attachment");
      if (!attachmentWrap) {
        touchAttachmentTap = null;
        return;
      }
      const img = attachmentWrap.querySelector(".chat-message-attachment-image");
      if (!img) {
        touchAttachmentTap = null;
        return;
      }
      const touch = event.touches[0];
      touchAttachmentTap = {
        startedAt: Date.now(),
        startX: Number(touch.clientX || 0),
        startY: Number(touch.clientY || 0),
        moved: false,
        src: String(img.getAttribute("src") || ""),
        alt: String(img.getAttribute("alt") || "Image preview"),
      };
    }, { passive: true, capture: true });

    dom.center.messages.addEventListener("click", (event) => {
      if (Date.now() < Number(suppressTouchClickUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const replyJump = event.target.closest("[data-chat-scroll-to-message]");
      if (replyJump) {
        const targetId = replyJump.getAttribute("data-chat-scroll-to-message");
        if (targetId) scrollToMessageInThread(targetId);
        return;
      }

      const orderCard = event.target.closest("[data-chat-order-card-id]");
      if (orderCard) {
        state.suppressOrderCardContextMenuUntil = Date.now() + 1200;
        clearTouchContextGesture();
        hideMessageContextMenu();
        if (Date.now() < suppressOrderCardClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!state.selectionMode) {
          const orderId = Number(orderCard.getAttribute("data-chat-order-card-id") || 0);
          if (Number.isFinite(orderId) && orderId > 0) {
            event.preventDefault();
            openOrderFromMessageCard(orderId);
          }
          return;
        }
      }

      const reactionPill = event.target.closest("[data-chat-msg-reaction-toggle]");
      if (reactionPill && state.activeClientId) {
        const messageId = reactionPill.getAttribute("data-chat-msg-reaction-toggle");
        const reactionActor = reactionPill.getAttribute("data-chat-reaction-actor") || "";
        if (reactionActor && reactionActor !== CHAT_REACTION_ACTOR) {
          hideMessageContextMenu();
          return;
        }
        const reactionValue = reactionPill.getAttribute("data-chat-reaction-value") || reactionPill.textContent || "";
        if (messageId) reactMessageFromContext(messageId, reactionValue);
        hideMessageContextMenu();
        return;
      }

      const attachmentImage = event.target.closest(".chat-message-attachment-image");
      if (attachmentImage && !state.selectionMode) {
        if (isAndroidYandexBrowser() || isTouchGeneratedClick(event)) return;
        hideMessageContextMenu();
        openMessageImageViewer(
          attachmentImage.getAttribute("src") || "",
          attachmentImage.getAttribute("alt") || "Image preview",
        );
        return;
      }

      const attachmentWrap = event.target.closest(".chat-message-attachment");
      if (attachmentWrap && !state.selectionMode) {
        if (isAndroidYandexBrowser() || isTouchGeneratedClick(event)) return;
        const img = attachmentWrap.querySelector(".chat-message-attachment-image");
        if (img) {
          hideMessageContextMenu();
          openMessageImageViewer(
            img.getAttribute("src") || "",
            img.getAttribute("alt") || "Image preview",
          );
          return;
        }
      }

      const autoLink = event.target.closest("[data-chat-autolink]");
      if (autoLink && !state.selectionMode) {
        return;
      }

      const messageBubble = event.target.closest(".chat-message-bubble");
      const messageEl = event.target.closest(".chat-message");
      const messageId = messageEl ? String(messageEl.getAttribute("data-message-id") || "") : "";
      if (!state.selectionMode) {
        if (!messageBubble || !messageId) return;
        hideMessageContextMenu();
        hideReactionBar();
        hideEmojiPopover();
        return;
      }
      if (!messageEl) return;
      if (!messageId) return;
      toggleMessageSelection(messageId);
      renderMessages();
    });

    dom.center.messages.addEventListener("contextmenu", (event) => {
      if (event.target.closest && event.target.closest("[data-chat-autolink]") && !state.selectionMode) return;
      if (Date.now() < Number(state.suppressOrderCardContextMenuUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const messageElForContext = event.target && event.target.closest ? event.target.closest(".chat-message") : null;
      const isOrderBubbleTarget = !!(
        (event.target
          && event.target.closest
          && (
            event.target.closest(".chat-message-bubble--order-card")
            || event.target.closest("[data-chat-order-card-id]")
          ))
        || (messageElForContext && messageElForContext.querySelector(".chat-message-bubble--order-card"))
      );
      if (
        isOrderBubbleTarget
        && isChatMobileViewport()
        && Date.now() > Number(state.touchContextMenuArmUntil || 0)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const messageEl = messageElForContext || event.target.closest(".chat-message");
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
      showMessageContextMenu(event.clientX, event.clientY, messageId, {
        touchGuard: isTouchGeneratedClick(event),
      });
    });

    dom.center.messages.addEventListener("contextmenu", (event) => {
      if (event.target.closest && event.target.closest("[data-chat-autolink]")) return;
      if (event.target && event.target.closest && event.target.closest(".chat-message")) {
        event.preventDefault();
      }
    }, true);

    dom.center.messages.addEventListener("dblclick", (event) => {
      if (Date.now() < Number(suppressTouchClickUntil || 0)) return;
      if (isTouchGeneratedClick(event)) return;
      if (state.selectionMode) return;
      if (!canUseMessageHeartShortcutTarget(event.target)) return;
      const messageEl = event.target.closest(".chat-message[data-message-id]");
      if (!messageEl || !state.activeClientId) return;
      const messageId = String(messageEl.getAttribute("data-message-id") || "");
      if (!messageId) return;
      event.preventDefault();
      event.stopPropagation();
      toggleHeartReactionForMessage(messageId);
    });

    dom.center.messages.addEventListener("selectstart", (event) => {
      if (event.target.closest && event.target.closest(".chat-message")) {
        event.preventDefault();
      }
    });

    dom.center.messages.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) {
        clearTouchContextGesture();
        return;
      }

      const orderStrip = resolveOrderCardScrollStrip(event.target);

      if (event.target.closest && event.target.closest("[data-chat-autolink]") && !state.selectionMode) {
        clearTouchContextGesture();
        return;
      }

      const messageBubble = event.target.closest(".chat-message-bubble[data-message-id]");
      if (!messageBubble) {
        clearTouchContextGesture();
        clearOrderCardTouchPan();
        return;
      }
      const isOrderCardTouchTarget = !!(event.target && event.target.closest && event.target.closest("[data-chat-order-card-id]"));

      const messageId = String(messageBubble.getAttribute("data-message-id") || "");
      if (!messageId || !state.activeClientId) {
        clearTouchContextGesture();
        clearOrderCardTouchPan();
        return;
      }

      const touch = event.touches[0];
      if (orderStrip) {
        clearOrderCardTouchPan();
        orderCardTouchPan = {
          strip: orderStrip,
          startX: Number(touch.clientX || 0),
          startY: Number(touch.clientY || 0),
          startLeft: Math.max(0, Number(orderStrip.scrollLeft || 0)),
          active: false,
          didDrag: false,
        };
      } else {
        clearOrderCardTouchPan();
      }
      clearTouchContextGesture();
      if (isOrderCardTouchTarget) {
        // Short tap on order cards should open the order only (click handler),
        // without arming message context long-press flow for this touch.
        return;
      }
      touchContextGesture = {
        messageId,
        bubble: messageBubble,
        startX: Number(touch.clientX || 0),
        startY: Number(touch.clientY || 0),
        lastX: Number(touch.clientX || 0),
        lastY: Number(touch.clientY || 0),
        swipeLocked: false,
        // Keep swipe-to-reply available on admin mobile thread.
        swipeRejected: false,
        swipeShift: 0,
        replyTriggered: false,
        longPressFired: false,
        longPressTimer: 0,
        allowSwipeReply: !!(messageBubble.closest(".chat-message.chat-message--in")),
        doubleTapEligible: canUseMessageHeartShortcutTarget(event.target),
      };

      touchContextGesture.longPressTimer = window.setTimeout(() => {
        if (!touchContextGesture || touchContextGesture.messageId !== messageId) return;
        touchContextGesture.longPressFired = true;
        state.lastTouchLongPressContextMenuAt = Date.now();
        state.touchContextMenuArmUntil = state.lastTouchLongPressContextMenuAt + 1400;
        suppressTouchClickUntil = Math.max(suppressTouchClickUntil, Date.now() + 480);
        if (state.selectionMode) {
          toggleMessageSelection(messageId);
          renderMessages();
          return;
        }
        showMessageContextMenu(touchContextGesture.lastX, touchContextGesture.lastY, messageId, {
          touchGuard: true,
        });
      }, CHAT_TOUCH_CONTEXT_LONG_PRESS_MS);
    }, { passive: true });

    dom.center.messages.addEventListener("touchmove", (event) => {
      if (event.defaultPrevented) {
        clearTouchContextGesture();
        return;
      }
      if (orderCardTouchPan) {
        if (event.touches.length !== 1) {
          clearOrderCardTouchPan();
          clearTouchContextGesture();
          return;
        }
        const touch = event.touches[0];
        const x = Number(touch.clientX || 0);
        const y = Number(touch.clientY || 0);
        const dx = x - orderCardTouchPan.startX;
        const dy = y - orderCardTouchPan.startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (!orderCardTouchPan.active) {
          if (absX < CHAT_ORDER_CARD_TOUCH_PAN_START_PX && absY < CHAT_ORDER_CARD_TOUCH_PAN_START_PX) return;
          if (absY > absX) {
            clearOrderCardTouchPan();
            clearTouchContextGesture();
            return;
          }
          orderCardTouchPan.active = true;
          orderCardTouchPan.strip.classList.add("is-mouse-dragging");
          clearTouchContextGesture();
        }

        event.preventDefault();
        const maxLeft = Math.max(0, orderCardTouchPan.strip.scrollWidth - orderCardTouchPan.strip.clientWidth);
        const nextLeft = Math.max(
          0,
          Math.min(maxLeft, orderCardTouchPan.startLeft - (dx * CHAT_ORDER_CARD_TOUCH_PAN_FACTOR)),
        );
        const prevLeft = Math.max(0, Number(orderCardTouchPan.strip.scrollLeft || 0));
        if (Math.abs(nextLeft - prevLeft) > 0.1) {
          orderCardTouchPan.strip.scrollLeft = nextLeft;
          orderCardTouchPan.didDrag = true;
        }
        return;
      }

      if (touchAttachmentTap && event.touches.length === 1) {
        const touch = event.touches[0];
        const dx = Math.abs(Number(touch.clientX || 0) - touchAttachmentTap.startX);
        const dy = Math.abs(Number(touch.clientY || 0) - touchAttachmentTap.startY);
        if (dx > CHAT_ATTACHMENT_TAP_MOVE_CANCEL_PX || dy > CHAT_ATTACHMENT_TAP_MOVE_CANCEL_PX) {
          touchAttachmentTap.moved = true;
        }
      }
      if (isAdminChatThreadEdgeSpringTouchActive()) {
        clearTouchContextGesture();
        return;
      }
      if (!touchContextGesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const x = Number(touch.clientX || 0);
      const y = Number(touch.clientY || 0);
      touchContextGesture.lastX = x;
      touchContextGesture.lastY = y;
      const dx = x - touchContextGesture.startX;
      const dy = y - touchContextGesture.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if ((absX > CHAT_TOUCH_CONTEXT_LONG_PRESS_MOVE_CANCEL_PX || absY > CHAT_TOUCH_CONTEXT_LONG_PRESS_MOVE_CANCEL_PX) && touchContextGesture.longPressTimer) {
        window.clearTimeout(touchContextGesture.longPressTimer);
        touchContextGesture.longPressTimer = 0;
      }

      if (touchContextGesture.longPressFired) return;
      if (touchContextGesture.swipeRejected) return;
      if (touchContextGesture.allowSwipeReply !== true) return;

      if (!touchContextGesture.swipeLocked) {
        if (absX < 10 && absY < 10) return;
        if (absY > absX) {
          clearTouchContextGesture();
          return;
        }
        if (dx <= 0) {
          clearTouchContextGesture();
          return;
        }
        touchContextGesture.swipeLocked = true;
      }

      event.preventDefault();
      const shift = Math.max(0, Math.min(CHAT_TOUCH_SWIPE_MAX_SHIFT_PX, dx));
      touchContextGesture.swipeShift = shift;
      touchContextGesture.bubble.classList.add("is-swipe-active");
      touchContextGesture.bubble.style.transform = `translateX(${shift}px)`;

      if (shift >= CHAT_TOUCH_SWIPE_REPLY_TRIGGER_PX && !touchContextGesture.replyTriggered) {
        touchContextGesture.replyTriggered = true;
        suppressTouchClickUntil = Math.max(suppressTouchClickUntil, Date.now() + 560);
        setComposerReplyByMessage(touchContextGesture.messageId);
        hideMessageContextMenu();
        hideEmojiPopover();
        if (navigator.vibrate && typeof navigator.vibrate === "function") {
          navigator.vibrate(14);
        }
      }
    }, { passive: false });

    dom.center.messages.addEventListener("touchend", () => {
      if (orderCardTouchPan) {
        const shouldSuppressClick = orderCardTouchPan.didDrag === true;
        clearOrderCardTouchPan({ suppressClick: shouldSuppressClick });
        clearTouchContextGesture();
        return;
      }
      if (touchAttachmentTap) {
        const duration = Date.now() - Number(touchAttachmentTap.startedAt || 0);
        const canOpen =
          !touchAttachmentTap.moved
          && duration > 0
          && duration <= CHAT_ATTACHMENT_TAP_MAX_MS
          && !state.selectionMode
          && !!touchAttachmentTap.src;
        if (canOpen) {
          hideMessageContextMenu();
          openMessageImageViewer(touchAttachmentTap.src, touchAttachmentTap.alt);
          suppressTouchClickUntil = Math.max(suppressTouchClickUntil, Date.now() + 320);
        }
        touchAttachmentTap = null;
      }
      if (!touchContextGesture) return;
      const finishedGesture = touchContextGesture;
      if (touchContextGesture.longPressTimer) {
        window.clearTimeout(touchContextGesture.longPressTimer);
        touchContextGesture.longPressTimer = 0;
      }
      if (touchContextGesture.swipeShift > 0 && touchContextGesture.bubble) {
        const bubble = touchContextGesture.bubble;
        bubble.classList.add("is-swipe-returning");
        bubble.style.transform = "";
        window.setTimeout(() => {
          bubble.classList.remove("is-swipe-active", "is-swipe-returning");
        }, 170);
      }
      if (touchContextGesture.replyTriggered && dom.center.input) {
        focusComposerInput({ moveCaretToEnd: true });
      }
      const canUseHeartDoubleTap = (
        !state.selectionMode
        && finishedGesture.doubleTapEligible === true
        && !finishedGesture.longPressFired
        && !finishedGesture.replyTriggered
        && Math.abs(finishedGesture.lastX - finishedGesture.startX) <= CHAT_TOUCH_HEART_DOUBLE_TAP_MOVE_PX
        && Math.abs(finishedGesture.lastY - finishedGesture.startY) <= CHAT_TOUCH_HEART_DOUBLE_TAP_MOVE_PX
      );
      if (canUseHeartDoubleTap) {
        if (consumeMessageHeartDoubleTap(finishedGesture.messageId, {
          x: finishedGesture.lastX,
          y: finishedGesture.lastY,
        })) {
          suppressTouchClickUntil = Math.max(suppressTouchClickUntil, Date.now() + 420);
          toggleHeartReactionForMessage(finishedGesture.messageId);
        }
      } else {
        clearMessageHeartTap();
      }
      if (touchContextGesture.longPressFired || touchContextGesture.replyTriggered) {
        suppressTouchClickUntil = Math.max(suppressTouchClickUntil, Date.now() + 420);
      }
      touchContextGesture = null;
    }, { passive: true });

    dom.center.messages.addEventListener("touchcancel", () => {
      clearOrderCardTouchPan();
      touchAttachmentTap = null;
      clearTouchContextGesture();
    }, { passive: true });

    document.addEventListener("touchend", releaseContextMenuTouchGuardAfterTouch, true);
    document.addEventListener("touchcancel", releaseContextMenuTouchGuardAfterTouch, true);
    document.addEventListener("pointerup", releaseContextMenuTouchGuardAfterTouch, true);
    document.addEventListener("pointercancel", releaseContextMenuTouchGuardAfterTouch, true);

    dom.center.messages.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const orderStrip = resolveOrderCardScrollStrip(event.target);
      if (!orderStrip) return;

      clearOrderCardMouseDrag();
      orderCardMouseDrag = {
        strip: orderStrip,
        startX: Number(event.clientX || 0),
        startY: Number(event.clientY || 0),
        startLeft: Math.max(0, Number(orderStrip.scrollLeft || 0)),
        active: false,
        didDrag: false,
      };
    });

    document.addEventListener("mousemove", (event) => {
      const dragState = orderCardMouseDrag;
      if (!dragState || !dragState.strip || !dragState.strip.isConnected) return;

      const dx = Number(event.clientX || 0) - dragState.startX;
      const dy = Number(event.clientY || 0) - dragState.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (!dragState.active) {
        if (absX < CHAT_ORDER_CARD_MOUSE_DRAG_START_PX && absY < CHAT_ORDER_CARD_MOUSE_DRAG_START_PX) return;
        if (absY > absX) {
          clearOrderCardMouseDrag();
          return;
        }
        dragState.active = true;
        dragState.strip.classList.add("is-mouse-dragging");
      }

      event.preventDefault();
      const maxLeft = Math.max(0, dragState.strip.scrollWidth - dragState.strip.clientWidth);
      const nextLeft = Math.max(
        0,
        Math.min(maxLeft, dragState.startLeft - (dx * CHAT_ORDER_CARD_MOUSE_DRAG_FACTOR)),
      );
      const prevLeft = Math.max(0, Number(dragState.strip.scrollLeft || 0));
      if (Math.abs(nextLeft - prevLeft) > 0.1) {
        dragState.strip.scrollLeft = nextLeft;
        dragState.didDrag = true;
      }
    });

    document.addEventListener("mouseup", () => {
      if (!orderCardMouseDrag) return;
      const shouldSuppressClick = orderCardMouseDrag.didDrag === true;
      clearOrderCardMouseDrag({ suppressClick: shouldSuppressClick });
    });

    dom.center.messages.addEventListener("dragstart", (event) => {
      if (!resolveOrderCardScrollStrip(event.target)) return;
      event.preventDefault();
    });

    dom.center.messages.addEventListener("wheel", (event) => {
      const orderStrip = resolveOrderCardScrollStrip(event.target);
      if (!orderStrip) return;

      const deltaX = Number(event.deltaX || 0);
      const deltaY = Number(event.deltaY || 0);
      if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) return;

      const prefersHorizontal = event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY);
      const horizontalDelta = prefersHorizontal
        ? (deltaX + (event.shiftKey ? deltaY : 0))
        : deltaY;
      if (Math.abs(horizontalDelta) < 0.01) return;
      const slowedDelta = horizontalDelta * CHAT_ORDER_CARD_WHEEL_FACTOR;
      if (Math.abs(slowedDelta) < 0.01) return;

      const maxLeft = Math.max(0, orderStrip.scrollWidth - orderStrip.clientWidth);
      const prevLeft = Math.max(0, Number(orderStrip.scrollLeft || 0));
      const nextLeft = Math.max(0, Math.min(maxLeft, prevLeft + slowedDelta));
      if (Math.abs(nextLeft - prevLeft) < 0.1) return;
      orderStrip.scrollLeft = nextLeft;
      event.preventDefault();
    }, { passive: false });

    dom.center.contextMenu.addEventListener("touchstart", (event) => {
      markFreshContextMenuTouchInteraction();
      if (!dom.center.contextMenu.classList.contains("is-reactions-expanded")) return;
      const reactionsBox = event.target && event.target.closest
        ? event.target.closest(".chat-message-menu-reactions")
        : null;
      if (!reactionsBox) return;
      suppressFloatingMenuAutoHideUntil = Math.max(
        suppressFloatingMenuAutoHideUntil,
        Date.now() + 1200,
      );
      suppressFloatingMenuDocumentClickUntil = Math.max(
        suppressFloatingMenuDocumentClickUntil,
        Date.now() + 1200,
      );
    }, { passive: true });

    dom.center.contextMenu.addEventListener("touchmove", (event) => {
      if (!dom.center.contextMenu.classList.contains("is-reactions-expanded")) return;
      const reactionsBox = event.target && event.target.closest
        ? event.target.closest(".chat-message-menu-reactions")
        : null;
      if (!reactionsBox) return;
      suppressFloatingMenuAutoHideUntil = Math.max(
        suppressFloatingMenuAutoHideUntil,
        Date.now() + 320,
      );
      suppressFloatingMenuDocumentClickUntil = Math.max(
        suppressFloatingMenuDocumentClickUntil,
        Date.now() + 320,
      );
      event.stopPropagation();
    }, { passive: true });

    dom.center.contextMenu.addEventListener("touchend", (event) => {
      if (!dom.center.contextMenu.classList.contains("is-reactions-expanded")) return;
      const reactionsBox = event.target && event.target.closest
        ? event.target.closest(".chat-message-menu-reactions")
        : null;
      if (!reactionsBox) return;
      suppressFloatingMenuAutoHideUntil = Math.max(
        suppressFloatingMenuAutoHideUntil,
        Date.now() + 380,
      );
      suppressFloatingMenuDocumentClickUntil = Math.max(
        suppressFloatingMenuDocumentClickUntil,
        Date.now() + 380,
      );
      event.stopPropagation();
    }, { passive: true });

    dom.center.contextMenu.addEventListener("pointerdown", (event) => {
      if (String(event.pointerType || "").toLowerCase() !== "touch") return;
      markFreshContextMenuTouchInteraction();
    }, { passive: true });

    dom.center.contextMenu.addEventListener("click", (event) => {
      if (shouldSuppressGuardedContextMenuClick(event)) return;
      if (Date.now() < Number(suppressTouchClickUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const reactionBtn = event.target.closest("[data-chat-msg-reaction]");
      if (reactionBtn) {
        const reaction = String(reactionBtn.getAttribute("data-chat-msg-reaction") || "").trim();
        const messageId = String(state.contextMessageId || "");
        if (!reaction || !messageId) return;
        if (reaction === "__toggle_more__") {
          event.preventDefault();
          event.stopPropagation();
          const nextExpanded = !dom.center.contextMenu.classList.contains("is-reactions-expanded");
          setContextMenuReactionsExpanded(nextExpanded);
          return;
        }
        reactMessageFromContext(messageId, reaction);
        hideMessageContextMenu();
        return;
      }
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

    const contextMenuReactionsBox = $(".chat-message-menu-reactions", dom.center.contextMenu);
    if (contextMenuReactionsBox) {
      contextMenuReactionsBox.addEventListener("scroll", () => {
        if (!dom.center.contextMenu.classList.contains("is-reactions-expanded")) return;
        suppressFloatingMenuAutoHideUntil = Math.max(
          suppressFloatingMenuAutoHideUntil,
          Date.now() + 320,
        );
        suppressFloatingMenuDocumentClickUntil = Math.max(
          suppressFloatingMenuDocumentClickUntil,
          Date.now() + 320,
        );
      }, { passive: true });
    }

    if (dom.center.reactionBar) {
      dom.center.reactionBar.addEventListener("touchstart", () => {
        markFreshReactionBarTouchInteraction();
      }, { passive: true });

      dom.center.reactionBar.addEventListener("pointerdown", (event) => {
        if (String(event.pointerType || "").toLowerCase() !== "touch") return;
        markFreshReactionBarTouchInteraction();
      }, { passive: true });

      dom.center.reactionBar.addEventListener("click", (event) => {
        if (shouldSuppressGuardedReactionBarClick(event)) return;
        if (Date.now() < Number(suppressTouchClickUntil || 0)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const btn = event.target.closest("[data-chat-reaction]");
        if (!btn) return;
        const reaction = btn.getAttribute("data-chat-reaction");
        const messageId = state.contextMessageId;
        if (!reaction) return;
        if (reaction === "__toggle_more__") {
          event.preventDefault();
          event.stopPropagation();
          hideMessageMenu();
          const nextExpanded = !dom.center.reactionBar.classList.contains("is-expanded");
          setReactionBarExpanded(nextExpanded);
          return;
        }
        if (!messageId) return hideMessageContextMenu();
        reactMessageFromContext(messageId, reaction);
        hideMessageContextMenu();
      });
    }

    document.addEventListener("click", (event) => {
      const tabClose = event.target && event.target.closest && event.target.closest("[data-chat-right-tab-close]");
      if (tabClose) {
        event.preventDefault();
        event.stopPropagation();
        closeChatRightTab(tabClose.getAttribute("data-chat-right-tab-close"));
        return;
      }
      const tabBtn = event.target && event.target.closest && event.target.closest("[data-chat-right-tab]");
      if (tabBtn) {
        event.preventDefault();
        event.stopPropagation();
        activateChatRightTab(tabBtn.getAttribute("data-chat-right-tab")).catch(console.error);
        return;
      }

      if (Date.now() < Number(suppressFloatingMenuAutoHideUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (Date.now() < Number(suppressFloatingMenuDocumentClickUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!dom.center.contextMenu) return;
      const insideMenu = dom.center.contextMenu.contains(event.target);
      const insideReactions = dom.center.reactionBar && dom.center.reactionBar.contains(event.target);
      const insideMessage = event.target.closest && (
        event.target.closest(".chat-message-bubble")
        || event.target.closest(".chat-message-reaction-pill")
      );
      const insideClientMenu = state.clientContextMenu && state.clientContextMenu.contains(event.target);
      const insideClientRow = event.target.closest && event.target.closest(".chat-client-row");
      if (dom.center.contextMenu && !dom.center.contextMenu.classList.contains("hidden")) {
        if (!insideMenu && !insideReactions) hideMessageContextMenu();
      } else if (dom.center.reactionBar && !dom.center.reactionBar.classList.contains("hidden")) {
        if (!insideReactions && !insideMessage) hideReactionBar();
      }
      if (!insideClientMenu) hideClientContextMenu();
      if (!insideClientRow) closeAllClientSwipeRows(null, { immediate: true });
    });

    document.addEventListener("contextmenu", (event) => {
      if (Date.now() < Number(suppressFloatingMenuAutoHideUntil || 0)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target && event.target.closest && event.target.closest(".chat-message-attachment-image")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (dom.center.messages && dom.center.messages.contains(event.target)) {
        event.preventDefault();
      }
      if (!dom.center.contextMenu) return;
      const insideMenu = dom.center.contextMenu.contains(event.target);
      const insideReactions = dom.center.reactionBar && dom.center.reactionBar.contains(event.target);
      const insideMessage = event.target.closest && event.target.closest(".chat-message");
      const insideClientMenu = state.clientContextMenu && state.clientContextMenu.contains(event.target);
      const insideClientRow = event.target.closest && event.target.closest(".chat-client-row");
      if (!insideMenu && !insideReactions && !insideMessage) hideMessageContextMenu();
      if (!insideClientMenu && !insideClientRow) hideClientContextMenu();
    });

    if (!hardContextMenuBlockBound) {
      hardContextMenuBlockBound = true;
      window.addEventListener("contextmenu", (event) => {
        if (!isAndroidYandexBrowser()) return;
        if (!dom.center.messages) return;
        const target = event.target;
        if (!target || !(target instanceof Element)) return;
        const inChat = dom.center.messages.contains(target);
        const inContext = !!(dom.center.contextMenu && dom.center.contextMenu.contains(target));
        const inReactionBar = !!(dom.center.reactionBar && dom.center.reactionBar.contains(target));
        if (inChat && !inContext && !inReactionBar) {
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);
    }

    window.addEventListener("resize", () => {
      if (Date.now() < Number(suppressFloatingMenuAutoHideUntil || 0)) {
        if (isMessageImageViewerOpen()) updateMessageImageViewerLayout();
        return;
      }
      clearTouchContextGesture();
      hideMessageContextMenu();
      hideClientContextMenu();
      if (isMessageImageViewerOpen()) updateMessageImageViewerLayout();
    });
    window.addEventListener("scroll", () => {
      if (Date.now() < Number(suppressFloatingMenuAutoHideUntil || 0)) return;
      clearTouchContextGesture();
      hideMessageContextMenu();
      hideClientContextMenu();
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (isMessageImageViewerOpen()) {
        closeMessageImageViewer();
        return;
      }
      if (dom.center.attachPreviewOverlay && !dom.center.attachPreviewOverlay.classList.contains("hidden")) {
        closeAttachPreview();
        return;
      }
      if (state.pendingDeleteConfirm) return;
      hideMessageContextMenu();
      hideClientContextMenu();
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

    if (dom.center.selectionCopyBtn) {
      dom.center.selectionCopyBtn.addEventListener("click", () => {
        copySelectedMessages().catch(console.error);
      });
    }

    if (dom.center.selectionDeleteBtn) {
      dom.center.selectionDeleteBtn.addEventListener("click", deleteSelectedMessages);
    }
  }

  function openOrderFromHeader() {
    const headerOrderId = Number(
      (dom.center.mobileHeaderOrderBtn && dom.center.mobileHeaderOrderBtn.getAttribute("data-order-id"))
      || (dom.center.headerOrder && dom.center.headerOrder.getAttribute("data-order-id"))
      || 0
    );
    if (!Number.isFinite(headerOrderId) || headerOrderId <= 0) return;
    state.rightOrderOpenedFromMessageBubble = false;
    state.rightOrderOpenedFromHeader = true;
    captureClientContentTab();
    captureClientOrdersListScrollTop();
    showChatRightPane("order");
    upsertChatRightTab("order", headerOrderId);
    const ordersRightApi = getOrdersRightApi();
    if (!ordersRightApi || typeof ordersRightApi.openOrderById !== "function") return;
    ordersRightApi.openOrderById(headerOrderId, { openMobile: false });
    syncMobileChatView("right");
  }

  function openOrderFromMessageCard(orderId, options = {}) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const opts = options && typeof options === "object" ? options : {};
    state.rightOrderOpenedFromMessageBubble = opts.fromMessageBubble !== false;
    state.rightOrderOpenedFromHeader = false;
    captureClientContentTab();
    captureClientOrdersListScrollTop();
    showChatRightPane("order");
    upsertChatRightTab("order", id);
    const ordersRightApi = getOrdersRightApi();
    if (!ordersRightApi || typeof ordersRightApi.openOrderById !== "function") return;
    ordersRightApi.openOrderById(id, { openMobile: false });
    syncMobileChatView("right");
  }

  function bindChatRightOrderOpenRequests() {
    document.addEventListener("chat:right-order-open-request", (event) => {
      const detail = event && event.detail && typeof event.detail === "object" ? event.detail : {};
      const orderId = Number(detail.orderId || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return;
      const source = String(detail.source || "").trim().toLowerCase();
      openOrderFromMessageCard(orderId, {
        fromMessageBubble: source === "message-bubble",
      });
    });
  }

  function syncRightOrderPanelById(orderId, options = {}) {
    const id = Number(orderId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    const opts = options && typeof options === "object" ? options : {};
    if (opts.force !== true && Number(state.rightPanelOrderId || 0) === id) return false;
    state.rightOrderOpenedFromMessageBubble = false;
    state.rightOrderOpenedFromHeader = false;
    captureClientContentTab();
    captureClientOrdersListScrollTop();
    showChatRightPane("order");
    upsertChatRightTab("order", id);
    const ordersRightApi = getOrdersRightApi();
    if (!ordersRightApi || typeof ordersRightApi.openOrderById !== "function") return false;
    ordersRightApi.openOrderById(id, {
      forceRefresh: opts.forceRefresh === true,
      openMobile: false,
    });
    state.rightPanelOrderId = id;
    syncMobileChatView("right");
    return true;
  }

  async function updateHeaderOrderStatus(orderId, statusId) {
    const id = Number(orderId || 0);
    const nextStatusId = Number(statusId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    if (!Number.isFinite(nextStatusId) || nextStatusId <= 0) return;
    if (state.headerOrderStatusMutationInFlight) return;

    const sourceOrder = state.headerOrderSnapshot && Number(state.headerOrderSnapshot?.id || 0) === id
      ? state.headerOrderSnapshot
      : ((Array.isArray(state.activeOrders) ? state.activeOrders : []).find((order) => Number(order?.id || 0) === id) || null);
    const currentStatus = getHeaderOrderStatusMeta(sourceOrder);
    const targetStatus = getHeaderOrderStatusMetaById(nextStatusId);
    if (targetStatus && isHeaderForbiddenStatusTransition(currentStatus, targetStatus)) return;

    state.headerOrderStatusMutationInFlight = true;
    renderChatHeader();
    try {
      await apiJson(`/api/admin/orders/${id}/status`, {
        method: "PUT",
        body: { status_id: nextStatusId },
      });

      const json = await fetchOrderDetailsFresh(id);
      const freshOrder = json?.data || null;
      if (!freshOrder || typeof freshOrder !== "object") return;

      state.orderDetailsCache.set(id, freshOrder);
      state.headerOrderSnapshot = { ...freshOrder };
      setSharedOrderDetails(freshOrder);
      upsertActiveOrder(freshOrder);
      if (Number(state.rightPanelOrderId || 0) === id) {
        syncRightOrderPanelById(id, { force: true, forceRefresh: true });
      }
      renderChatHeader();
    } catch (err) {
      console.error(err);
    } finally {
      state.headerOrderStatusMutationInFlight = false;
      renderChatHeader();
    }
  }

  function initHeaderOrderStatusAction() {
    if (!dom.center.headerOrder || dom.center.headerOrder.dataset.boundStatusCycle === "1") return;
    dom.center.headerOrder.dataset.boundStatusCycle = "1";
    dom.center.headerOrder.addEventListener("click", async (event) => {
      const btn = event.target.closest('[data-action="order-row-status-next"]');
      if (!btn || !dom.center.headerOrder.contains(btn)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (btn.disabled) return;
      const orderId = Number(btn.getAttribute("data-order-id") || 0);
      const nextStatusId = Number(btn.getAttribute("data-next-status-id") || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return;
      if (!Number.isFinite(nextStatusId) || nextStatusId <= 0) return;
      await updateHeaderOrderStatus(orderId, nextStatusId);
    });
  }

  function initHeaderClientOpenAction() {
    [dom.center.headerClientBtn, dom.center.mobileHeaderClientBtn].forEach((node) => {
      if (!node || node.dataset.boundClientOpen === "1") return;
      node.dataset.boundClientOpen = "1";
      ["pointerdown", "touchstart", "mousedown"].forEach((eventName) => {
        node.addEventListener(eventName, (event) => {
          event.stopPropagation();
        }, { passive: eventName === "touchstart" });
      });
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openClientDetailsPanel({ skipPersist: false }).catch(console.error);
      });
    });
  }

  function initHeaderOrderOpenAction() {
    [dom.center.headerOrder, dom.center.mobileHeaderOrderBtn].forEach((node) => {
      if (!node || node.dataset.boundOpenOrder === "1") return;
      node.dataset.boundOpenOrder = "1";

      node.addEventListener("click", (event) => {
        if (event.target && event.target.closest && event.target.closest('[data-action="order-row-status-next"]')) return;
        event.preventDefault();
        event.stopPropagation();
        openOrderFromHeader();
      });

      node.addEventListener("keydown", (event) => {
        if (event.target && event.target.closest && event.target.closest('[data-action="order-row-status-next"]')) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openOrderFromHeader();
      });
    });
  }

  function buildGuestActiveClientProfile(clientId, selectedFromList = null) {
    const source = selectedFromList && typeof selectedFromList === "object" ? selectedFromList : {};
    const guestName = String(source.name || "\u0413\u043e\u0441\u0442\u044c").trim() || "\u0413\u043e\u0441\u0442\u044c";
    return {
      id: Number(clientId || source.id || 0) || 0,
      name: guestName,
      phone: "",
      birthday: "",
      photo: "",
      total_orders: 0,
      total_spent: 0,
      last_order_date: "",
      created_at: "",
      is_guest_chat: true,
    };
  }

  function buildOptimisticActiveClientProfile(clientId, selectedFromList = null) {
    const source = selectedFromList && typeof selectedFromList === "object" ? selectedFromList : {};
    const id = Number(clientId || source.id || 0) || 0;
    const fallbackName = id > 0 ? `\u041a\u043b\u0438\u0435\u043d\u0442 #${id}` : "\u041a\u043b\u0438\u0435\u043d\u0442";
    return {
      id,
      name: String(source.name || "").trim() || fallbackName,
      phone: String(source.phone || ""),
      birthday: String(source.birthday || ""),
      photo: String(source.photo || ""),
      total_orders: Number(source.total_orders || 0),
      total_spent: Number(source.total_spent || 0),
      last_order_date: String(source.last_order_date || ""),
      created_at: String(source.created_at || ""),
      is_guest_chat: false,
    };
  }

  async function loadActiveClientData(clientId, selectedFromList = null, options = {}) {
    const requestId = ++state.requestToken;
    const isGuestClient = options && options.isGuest === true;
    const shouldRenderThread = options && options.renderThread !== false;
    const shouldFetchOrders = options?.fetchOrders !== false;
    if (headerLoadingSafetyTimer) {
      window.clearTimeout(headerLoadingSafetyTimer);
      headerLoadingSafetyTimer = 0;
    }
    headerLoadingSafetyTimer = window.setTimeout(() => {
      if (requestId !== state.requestToken) return;
      if (Number(state.activeClientId || 0) !== Number(clientId || 0)) return;
      setHeaderLoading(false);
      headerLoadingSafetyTimer = 0;
    }, 10000);
    const finishHeaderLoading = () => {
      if (headerLoadingSafetyTimer) {
        window.clearTimeout(headerLoadingSafetyTimer);
        headerLoadingSafetyTimer = 0;
      }
      if (requestId !== state.requestToken) return;
      if (Number(state.activeClientId || 0) !== Number(clientId || 0)) return;
      setHeaderLoading(false);
    };
    if (isGuestClient) {
      state.activeClient = buildGuestActiveClientProfile(clientId, selectedFromList);
      setActiveOrders([], { forceRender: true });
      state.activeOrdersHydratedClientId = 0;
      if (shouldRenderThread) {
        renderMessages({ disableAutoPin: true, smoothScroll: false, skipSaveScrollPosition: true });
        if (isAdminMobileChatLayout()) {
          restoreThreadScrollPosition(state.activeClientId);
        } else {
          scrollMessagesToBottom({ behavior: "auto", keepPending: true });
        }
        saveThreadScrollPosition(state.activeClientId);
      }
      finishHeaderLoading();
      return;
    }

    try {
      // Stale-while-revalidate: show cache instantly, but always revalidate from API.
      const shouldFetchClientProfile = true;
      const shouldFetchOrdersFromNetwork = shouldFetchOrders === true;

      const clientJson = shouldFetchClientProfile
        ? await apiJson(`/api/admin/clients/${clientId}`)
        : { data: state.activeClient || selectedFromList || buildOptimisticActiveClientProfile(clientId, selectedFromList) };
      if (requestId !== state.requestToken) return;

      state.activeClient = clientJson?.data
        || selectedFromList
        || state.activeClient
        || buildOptimisticActiveClientProfile(clientId, selectedFromList);
      renderChatHeader();
      if (state.activeClient && typeof state.activeClient === "object") {
        setCachedActiveClientProfile(clientId, state.activeClient);
        setSharedClientDetailsToLocalStorage(clientId, { client: state.activeClient });
      }
      const syncedIdentity = syncClientIdentityIntoList(clientId, state.activeClient);
      if (syncedIdentity.changed) {
        applyClientFilter();
      }
      const prevPhoneDigits = normalizePhoneDigits(syncedIdentity.prevPhone);
      const nextPhoneDigits = normalizePhoneDigits(syncedIdentity.nextPhone);
      const shouldPatchMeta = (
        !!syncedIdentity.nextName
        && !isGuestLikeClientName(syncedIdentity.nextName)
        && (
          syncedIdentity.changed
          || isGuestLikeClientName(syncedIdentity.prevName)
          || (!!nextPhoneDigits && nextPhoneDigits !== prevPhoneDigits)
        )
      );
      if (shouldPatchMeta) {
        patchRemoteThreadMeta(clientId, {
          name: syncedIdentity.nextName,
          phone: syncedIdentity.nextPhone,
        }).catch(console.error);
      }
      if (shouldFetchOrdersFromNetwork) {
        try {
          const ordersJson = await fetchClientOrdersFresh(clientId);
          if (state.requestToken !== requestId) return;
          if (Number(state.activeClientId || 0) !== Number(clientId)) return;
          const freshOrders = Array.isArray(ordersJson?.data) ? ordersJson.data : [];
          setCachedActiveClientOrders(clientId, freshOrders);
          setSharedClientDetailsToLocalStorage(clientId, { orders: freshOrders });
          setActiveOrders(freshOrders, { forceRender: true, forceRightOrderRefresh: true });
          try {
            const candidateJson = await fetchHeaderOrderCandidateFresh(clientId);
            if (state.requestToken === requestId && Number(state.activeClientId || 0) === Number(clientId || 0)) {
              const candidateOrder = candidateJson && candidateJson.data && typeof candidateJson.data === "object"
                ? candidateJson.data
                : null;
              if (candidateOrder && Number(candidateOrder.id || 0) > 0) {
                state.headerOrderSnapshot = { ...candidateOrder };
                upsertActiveOrder(candidateOrder);
              } else {
                state.headerOrderSnapshot = null;
              }
            }
          } catch (candidateErr) {
            if (!isAbortError(candidateErr)) console.error(candidateErr);
          }
          state.activeOrdersHydratedClientId = Number(clientId || 0);
          await hydrateHeaderOrderDetails(requestId, clientId).catch(console.error);
        } catch (err) {
          if (!isAbortError(err)) console.error(err);
        }
      }
      finishHeaderLoading();
      if (shouldRenderThread) {
        renderMessages({ disableAutoPin: true, smoothScroll: false, skipSaveScrollPosition: true });
        if (isAdminMobileChatLayout()) {
          restoreThreadScrollPosition(state.activeClientId);
        } else {
          scrollMessagesToBottom({ behavior: "auto", keepPending: true });
        }
        saveThreadScrollPosition(state.activeClientId);
      }
    } catch (err) {
      if (requestId !== state.requestToken) return;
      console.error(err);
      state.activeClient = selectedFromList
        || state.activeClient
        || buildOptimisticActiveClientProfile(clientId, selectedFromList);
      setActiveOrders([], { forceRender: true });
      if (shouldRenderThread) {
        renderMessages({ disableAutoPin: true, smoothScroll: false, skipSaveScrollPosition: true });
        if (isAdminMobileChatLayout()) {
          restoreThreadScrollPosition(state.activeClientId);
        } else {
          scrollMessagesToBottom({ behavior: "auto", keepPending: true });
        }
        saveThreadScrollPosition(state.activeClientId);
      }
      finishHeaderLoading();
    }
  }

  async function selectClient(clientId, options = {}) {
    const id = Number(clientId || 0);
    if (!Number.isFinite(id) || id <= 0) return;
    const opts = options && typeof options === "object" ? options : {};
    suppressMessageAlertUntil = Date.now() + 3000;
    const previousActiveClientId = state.activeClientId;
    stopLocalTypingSession(previousActiveClientId, { flush: true });
    saveThreadScrollPosition(previousActiveClientId);
    flushUiStatePersist();

    closeAttachPreview({ focusComposer: false, clearPersistedDraft: false });
    cancelEditingMessage();
    clearComposerReply();
    if (state.pendingDeleteConfirm) closeDeleteConfirm();
    setSelectionMode(false);
    hideClientContextMenu();
    hideMessageContextMenu();
    persistComposerDraftForClient(previousActiveClientId);
    if (dom.center.input) {
      dom.center.input.value = "";
      dom.center.input.style.height = "45px";
      dom.center.input.style.overflowY = "hidden";
    }
    syncComposerRichPreview({});
    resetThreadImageDrop();

    state.activeClientId = id;
    if (!isAdminMobileChatLayout()) {
      state.forceDesktopBottomClientId = String(id);
      state.forceDesktopBottomUntil = Date.now() + 3000;
    } else {
      state.forceDesktopBottomClientId = "";
      state.forceDesktopBottomUntil = 0;
    }
    state.store.lastOpenClientId = id;
    restoreComposerDraftForClient(id, { skipThreadViewportSync: true });
    state.rightPanelOrderId = 0;
    showChatRightPane("client");
    state.headerOrderSnapshot = null;
    setHeaderLoading(true);
    saveStore();
    const selectedForTab = state.clients.find((c) => Number(c.id) === id) || null;
    const titleForTab = String(selectedForTab?.name || "").trim();
    const shouldAutoOpenDesktopDetails = !isAdminMobileChatLayout() && opts.openDetails !== false;
    const shouldOpenDetails = opts.openDetails === true || shouldAutoOpenDesktopDetails;

    if (shouldAutoOpenDesktopDetails || opts.openDetails === true) {
      upsertChatRightTab("client", id, titleForTab);
    }
    if (shouldOpenDetails) {
      window.requestAnimationFrame(() => {
        openClientDetailsPanel().catch(console.error);
      });
    }

    const selectedFromList = state.clients.find((c) => Number(c.id) === id) || null;
    const isGuestClient = isGuestChatClient(selectedFromList);
    state.activeClient = isGuestClient
      ? buildGuestActiveClientProfile(id, selectedFromList)
      : (selectedFromList || buildOptimisticActiveClientProfile(id, selectedFromList));
    try {
      setActiveOrders([], { forceRender: true });
    } catch (err) {
      console.error("Failed to reset active orders on chat client select:", err);
    }
    try {
      renderChatHeader();
    } catch (err) {
      console.error("Failed to render chat header on client select:", err);
    }
    state.activeOrdersHydratedClientId = 0;
    // Start header/client payload loading immediately so it isn't blocked by later UI steps.
    loadActiveClientData(id, selectedFromList, {
      isGuest: isGuestClient,
      renderThread: false,
    }).catch(console.error);
    try {
      const clientsRightApi = getClientsRightApi();
      if (clientsRightApi && typeof clientsRightApi.setChatRightForceEmpty === "function") {
        clientsRightApi.setChatRightForceEmpty(false);
      }
    } catch (err) {
      console.error("Failed to sync chat right empty state:", err);
    }

    const syncMobileViewAfterRender = (() => {
      if (opts.restoreMobileView === true) {
        return () => {
          window.requestAnimationFrame(() => {
            syncMobileChatViewFromState({ persistState: false });
          });
        };
      }
      if (opts.syncMobileView !== false) {
        return () => {
          window.requestAnimationFrame(() => {
            syncMobileChatView("center");
          });
        };
      }
      return null;
    })();

    ensureActiveThreadSseConnection();
    applyClientFilter();
    const forceDesktopBottomOnSelect = !isAdminMobileChatLayout();
    renderMessages({
      disableAutoPin: !forceDesktopBottomOnSelect,
      forceScrollBottom: forceDesktopBottomOnSelect,
      smoothScroll: false,
      skipSaveScrollPosition: true,
    });
    if (typeof syncMobileViewAfterRender === "function") {
      syncMobileViewAfterRender();
    }
    if (!isAdminMobileChatLayout()) {
      const hasPendingForClient = getPendingScrollNewCount(id) > 0;
      scrollMessagesToBottom({ behavior: "auto", keepPending: hasPendingForClient });
      saveThreadScrollPosition(id);
      window.requestAnimationFrame(() => {
        if (Number(state.activeClientId) !== Number(id)) return;
        scrollMessagesToBottom({ behavior: "auto", keepPending: hasPendingForClient });
        saveThreadScrollPosition(id);
      });
    } else if (!restoreThreadScrollPosition(id)) {
      const hasPendingForClient = getPendingScrollNewCount(id) > 0;
      scrollMessagesToBottom({ behavior: "auto", keepPending: hasPendingForClient });
      saveThreadScrollPosition(id);
    } else {
      syncPendingScrollCountByViewport(id);
      updateMessagesScrollDownButton();
      saveThreadScrollPosition(id);
    }
    syncActiveThreadReadState({ clientId: id });
    restorePersistedAttachPreviewDraft(id).catch(console.error);
    pullThreadFromRemote(id, { skipReadMark: true, ignoreIncomingBadge: true }).catch(console.error);
  }

  function mergeClientsIntoState(rows, { reset = false } = {}) {
    const incoming = Array.isArray(rows) ? rows : [];
    const byId = new Map();
    if (!reset) {
      (Array.isArray(state.clients) ? state.clients : []).forEach((row) => {
        const key = normalizeClientIdKey(row?.id);
        if (!key) return;
        byId.set(key, row);
      });
    }
    incoming.forEach((row) => {
      const key = normalizeClientIdKey(row?.id);
      if (!key) return;
      const prev = byId.get(key);
      byId.set(key, prev && typeof prev === "object" ? { ...prev, ...row } : row);
    });
    state.clients = Array.from(byId.values());
  }

  function filterOpenChatClients(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const existingThreadIds = new Set(Object.keys(state.store.threads || {}).map((k) => Number(k)));
    const filtered = list.filter(
      (client) =>
        existingThreadIds.has(Number(client.id))
        || Number(client.total_orders || 0) > 0
        || client._isVirtualChatClient === true
    );
    return filtered.length ? filtered : list;
  }

  function buildLocalClientsFromStoredThreads() {
    const threads = state.store && typeof state.store.threads === "object" ? state.store.threads : {};
    return Object.keys(threads)
      .map((key) => normalizeClientIdKey(key))
      .filter(Boolean)
      .map((key) => {
        const thread = Array.isArray(threads[key]) ? threads[key] : [];
        const lastMessage = thread.length ? thread[thread.length - 1] : null;
        const lastAt = String(
          lastMessage?.createdAt
          || lastMessage?.created_at
          || lastMessage?.updatedAt
          || lastMessage?.updated_at
          || ""
        );
        return {
          id: Number(key),
          name: `Клиент #${key}`,
          phone: "",
          total_orders: 0,
          created_at: lastAt || "",
          updated_at: lastAt || "",
          last_order_date: lastAt || "",
          _isVirtualChatClient: true,
        };
      })
      .sort((a, b) => compareIsoDates(String(b.last_order_date || ""), String(a.last_order_date || "")));
  }

  function sanitizeCachedClientRows(rows) {
    const source = Array.isArray(rows) ? rows : [];
    const out = [];
    const seen = new Set();
    source.forEach((row) => {
      const key = normalizeClientIdKey(row?.id);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({
        id: Number(key),
        name: String(row?.name || `Клиент #${key}`),
        phone: String(row?.phone || ""),
        total_orders: Number(row?.total_orders || 0),
        total_spent: Number(row?.total_spent || 0),
        last_order_date: String(row?.last_order_date || ""),
        created_at: String(row?.created_at || ""),
        updated_at: String(row?.updated_at || ""),
        _isVirtualChatClient: row?._isVirtualChatClient === true,
      });
    });
    return out.slice(0, CHAT_CLIENTS_CACHE_MAX_ROWS);
  }

  function readCachedClientsRows() {
    const updatedAt = Number(state.store?.clientsCacheUpdatedAt || 0);
    if (!updatedAt) return [];
    if (Date.now() - updatedAt > CHAT_CLIENTS_CACHE_TTL_MS) return [];
    return sanitizeCachedClientRows(state.store?.clientsCache || []);
  }

  function writeCachedClientsRows(rows) {
    const nextRows = sanitizeCachedClientRows(rows);
    state.store.clientsCache = nextRows;
    state.store.clientsCacheUpdatedAt = Date.now();
    saveStore();
  }

  async function loadClientsPage(options = {}) {
    if (!isChatWidgetEnabledRuntime()) return false;
    const reset = options.reset === true;
    const ensureSelection = options.ensureSelection === true;
    const pager = ensureClientsPager();
    if (pager.loading) return false;

    if (reset) {
      resetClientsPager();
      const localThreadClients = buildLocalClientsFromStoredThreads();
      const cachedClients = readCachedClientsRows();
      state.clients = filterOpenChatClients(mergeRemoteClients(cachedClients, localThreadClients));
      state.filteredClients = [];
      applyClientFilter();
      if (dom.left.list) {
        if (!state.clients.length) {
          dom.left.list.innerHTML = '<div class="muted" style="padding:8px;">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0447\u0430\u0442\u043e\u0432\u2026</div>';
        }
      }
    }

    const activePager = ensureClientsPager();
    if (!activePager.hasMore && !reset) return false;

    activePager.loading = true;
    try {
      const pageSize = activePager.pageSize || CHAT_CLIENTS_PAGE_SIZE;
      const adminQs = new URLSearchParams();
      adminQs.set("limit", String(pageSize));
      adminQs.set("offset", String(activePager.adminOffset || 0));
      adminQs.set("sort", "last_desc");

      const [adminJson, remotePage] = await Promise.all([
        apiJson("/api/admin/clients?" + adminQs.toString()).catch(() => ({
          data: [],
          total: activePager.adminTotal || 0,
        })),
        loadRemoteChatClientsPage({
          limit: pageSize,
          offset: activePager.remoteOffset || 0,
        }).catch(() => ({
          rows: [],
          total: activePager.remoteTotal || 0,
          hasMore: false,
        })),
      ]);

      const adminRows = Array.isArray(adminJson?.data) ? adminJson.data : [];
      const adminTotalRaw = Number(adminJson?.total);
      const adminTotal = Number.isFinite(adminTotalRaw) && adminTotalRaw >= 0 ? Math.trunc(adminTotalRaw) : 0;

      const remoteRows = Array.isArray(remotePage?.rows) ? remotePage.rows : [];
      const remoteTotalRaw = Number(remotePage?.total);
      const remoteTotal = Number.isFinite(remoteTotalRaw) && remoteTotalRaw >= 0 ? Math.trunc(remoteTotalRaw) : 0;
      const remoteHasMoreFlag = remotePage?.hasMore === true;

      if (adminRows.length === 0 && remoteRows.length === 0 && !reset) {
        activePager.hasMore = false;
        return false;
      }

      activePager.adminOffset += adminRows.length;
      activePager.remoteOffset += remoteRows.length;
      activePager.adminTotal = adminTotal;
      activePager.remoteTotal = remoteTotal;
      activePager.hasMore = activePager.adminOffset < activePager.adminTotal
        || activePager.remoteOffset < activePager.remoteTotal
        || remoteHasMoreFlag;
      activePager.initialized = true;

      const mergedRows = mergeRemoteClients(adminRows, remoteRows);
      const preparedRows = filterOpenChatClients(mergedRows);

      const prevIds = new Set(
        (state.clients || [])
          .map((client) => normalizeClientIdKey(client?.id))
          .filter(Boolean)
      );
      mergeClientsIntoState(preparedRows, { reset });
      applyClientFilter();
      writeCachedClientsRows(state.clients);

      const remoteSummaryIdSet = new Set(
        remoteRows
          .map((row) => normalizeClientIdKey(row?.client_id ?? row?.clientId ?? row?.id))
          .filter(Boolean)
      );
      if (remoteRows.length) {
        await applyRemoteSummariesRows(remoteRows, { forceThreads: false }).catch(console.error);
      }

      const summaryIds = (state.clients || [])
        .map((client) => normalizeClientIdKey(client?.id))
        .filter(Boolean)
        .filter((id) => (reset || !prevIds.has(id)) && !remoteSummaryIdSet.has(id));
      if (summaryIds.length) {
        const activeKey = normalizeClientIdKey(state.activeClientId);
        const priorityIds = [];
        if (activeKey && summaryIds.includes(activeKey)) {
          priorityIds.push(activeKey);
        }
        if (!reset) {
          summaryIds.forEach((id) => {
            if (!priorityIds.includes(id) && priorityIds.length < 12) priorityIds.push(id);
          });
        }
        if (priorityIds.length) {
          await pullRemoteSummaries(priorityIds).catch(console.error);
        }
        applyClientFilter();
      }

      const allowAutoSelect = ensureSelection && !isChatMobileViewport();
      if (allowAutoSelect) {
        const persisted = Number(state.store.lastOpenClientId || 0);
        const target = state.filteredClients.find((c) => Number(c.id) === persisted) || state.filteredClients[0];
        if (target) {
          if (Number(state.activeClientId) !== Number(target.id)) {
            await selectClient(target.id, { restoreMobileView: true });
          }
        } else {
          stopLocalTypingSession(state.activeClientId, { flush: true });
          state.activeClientId = null;
          state.activeClient = null;
          setHeaderLoading(false);
          setActiveOrders([], { forceRender: true });
          renderMessages();
          syncMobileChatView("clients");
        }
      }

      return preparedRows.length > 0;
    } finally {
      activePager.loading = false;
    }
  }

  function maybeLoadMoreClientsByScroll() {
    if (!dom.left.list) return;
    const pager = ensureClientsPager();
    if (!pager.hasMore || pager.loading) return;
    const remaining = dom.left.list.scrollHeight - dom.left.list.scrollTop - dom.left.list.clientHeight;
    if (remaining > CHAT_CLIENTS_LOAD_MORE_THRESHOLD_PX) return;
    loadClientsPage({ reset: false, ensureSelection: false }).catch(console.error);
  }

  async function loadClients() {
    if (!isChatWidgetEnabledRuntime()) return;
    if (!dom.left.list) return;
    if (state.clientsLoadInFlight) return state.clientsLoadInFlight;
    const mobileStart = isChatMobileViewport();

    const persistedClientId = Number(state.store?.lastOpenClientId || 0);
    if (
      !mobileStart
      &&
      persistedClientId > 0
      && Number(state.activeClientId || 0) !== persistedClientId
      && Array.isArray(state.store?.threads?.[String(persistedClientId)])
    ) {
      selectClient(persistedClientId, { restoreMobileView: true }).catch(console.error);
    }
    // Do not block the first paint on slow DB/API responses.
    state.clientsLoadInFlight = loadClientsPage({ reset: true, ensureSelection: !mobileStart })
      .catch((err) => {
        if (isAbortError(err) || !isChatWidgetEnabledRuntime()) return;
        console.error(err);
        dom.left.list.innerHTML = "";
        if (dom.left.empty) {
          dom.left.empty.textContent = "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0447\u0430\u0442\u044b";
          dom.left.empty.classList.remove("hidden");
        }
      })
      .finally(() => {
        if (mobileStart) {
          stopLocalTypingSession(state.activeClientId, { flush: true });
          state.activeClientId = null;
          state.activeClient = null;
          setHeaderLoading(false);
          setActiveOrders([], { forceRender: true });
          renderMessages();
          syncMobileChatView("clients", { persistState: true });
        }
        state.clientsLoadInFlight = null;
        // If first page doesn't fill the viewport, continue paging in background.
        maybeLoadMoreClientsByScroll();
      });
    return state.clientsLoadInFlight;
  }

  async function ensureClientAvailableForNotificationOpen(clientId) {
    const key = normalizeClientIdKey(clientId);
    if (!key) return null;
    let client = (state.clients || []).find((row) => Number(row?.id) === Number(key)) || null;
    if (client) return client;

    await pullRemoteSummaries([key]).catch(console.error);
    const summary = state.remoteSummariesByClient && state.remoteSummariesByClient[key];
    if (!summary) return null;

    state.clients = filterOpenChatClients(mergeRemoteClients(state.clients || [], [summary]));
    applyClientFilter();
    writeCachedClientsRows(state.clients);

    client = (state.clients || []).find((row) => Number(row?.id) === Number(key)) || null;
    return client;
  }

  async function flushPendingNotificationChatOpenRequest() {
    const request = normalizeChatNotificationOpenRequest(pendingNotificationChatOpenRequest);
    if (!request) return false;
    if (isChatMobileViewport()) {
      // Mobile chat must always start from clients list without auto-opening any thread/card.
      pendingNotificationChatOpenRequest = null;
      clearChatNotificationOpenRequestFromLocation();
      return false;
    }
    if (!syncChatWidgetEnabledFromTenant({ reload: true, resume: true })) return false;

    pendingNotificationChatOpenRequest = null;
    clearChatNotificationOpenRequestFromLocation();
    if (request.messageId) {
      queuePendingNotificationMessageFocus(request.messageId, request.clientId);
    }

    await loadClients().catch(console.error);
    const client = await ensureClientAvailableForNotificationOpen(request.clientId);
    if (!client) return false;

    const hiddenBySearch = !(state.filteredClients || []).some((row) => Number(row?.id) === Number(client.id));
    if (hiddenBySearch && dom.left.search) {
      state.q = "";
      dom.left.search.value = "";
      applyClientFilter();
    }

    if (Number(state.activeClientId) !== Number(client.id)) {
      await selectClient(client.id);
      return true;
    }

    suppressMessageAlertUntil = Date.now() + 3000;
    pullThreadFromRemote(client.id, { skipReadMark: true, ignoreIncomingBadge: true }).catch(console.error);
    syncActiveThreadReadState({ clientId: client.id });
    return true;
  }

  function queueNotificationChatOpenRequest(rawRequest, options = {}) {
    const normalized = normalizeChatNotificationOpenRequest(rawRequest);
    if (!normalized) return false;
    pendingNotificationChatOpenRequest = normalized;
    if (options.clearLocation === true) {
      clearChatNotificationOpenRequestFromLocation();
    }
    if (options.defer === true) return true;
    flushPendingNotificationChatOpenRequest().catch(console.error);
    return true;
  }

  function initComposer() {
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
    ensureEmojiDatasetLoaded().catch(() => {});
    mountFloatingChatMenus();
    bindEmojiPopoverGuard();
    bindFloatingMenuInteractionGuards();
    bindReactionOverflowScrollers();
    normalizeQuickReactionButtons();
    decorateComposerEmojiControls();
    initAttachPreviewModal();
    initThreadImageDrop();
    initThreadImagePaste();
    initMessageImageViewerModal();
    ensureComposerReplyElements();
    renderComposerReply();
    setupComposerRichPreview();
    setComposerEnabled(false);
    syncComposerMode();

    if (dom.center.replyCloseBtn && dom.center.replyCloseBtn.dataset.bound !== "1") {
      dom.center.replyCloseBtn.dataset.bound = "1";
      dom.center.replyCloseBtn.addEventListener("click", () => {
        clearComposerReply();
      });
    }

    if (dom.center.sendBtn) {
      dom.center.sendBtn.addEventListener("click", () => {
        if (!dom.center.input) return;
        const done = sendMessage(dom.center.input.value);
        if (!done) return;
        finalizeComposerSendUi({ refocusInput: true });
      });
    }

    if (dom.center.input) {
      dom.center.input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const done = sendMessage(dom.center.input.value);
          if (done) {
            finalizeComposerSendUi({ refocusInput: shouldRetainComposerFocusOnMobileSend() });
          }
          return;
        }

        if (event.key === "Escape" && state.editingMessageId) {
          cancelEditingMessage();
          dom.center.input.value = "";
          clearComposerDraftForClient(state.activeClientId);
          stopLocalTypingSession(state.activeClientId, { flush: true });
          syncComposerRichPreview({});
          return;
        }

        if (event.key === "Escape" && state.replyDraft) {
          clearComposerReply();
        }

        if (isTypingKeyEvent(event)) handleComposerTypingActivity({ allowEmpty: true });
      });

      dom.center.input.addEventListener("input", () => {
        handleComposerTypingActivity();
        persistComposerDraftForClient(state.activeClientId);
      });
      dom.center.input.addEventListener("beforeinput", () => {
        handleComposerTypingActivity({ allowEmpty: true });
      });
      dom.center.input.addEventListener("compositionstart", () => {
        handleComposerTypingActivity();
      });
      dom.center.input.addEventListener("compositionupdate", () => {
        handleComposerTypingActivity();
      });
      dom.center.input.addEventListener("compositionend", () => {
        handleComposerTypingActivity();
        persistComposerDraftForClient(state.activeClientId);
      });
      bindAdminMobileTextFieldTapFocus(dom.center.input, "mobileComposerTapFocusBound");
      dom.center.input.addEventListener("click", repairAdminIosTextFocusOnClick);
      dom.center.input.addEventListener("focus", () => {
        handleAdminChatTextInputFocus();
        syncComposerSendButtonFocusLock();
      });
      dom.center.input.addEventListener("blur", () => {
        persistComposerDraftForClient(state.activeClientId);
        scheduleLocalTypingStop(CHAT_TYPING_BLUR_STOP_MS);
        handleAdminChatTextInputBlur();
        syncComposerSendButtonFocusLock();
      });
    }

    if (dom.center.attachBtn && dom.center.attachInput) {
      dom.center.attachBtn.addEventListener("click", () => dom.center.attachInput.click());
      dom.center.attachInput.addEventListener("change", async () => {
        const files = Array.from(dom.center.attachInput.files || []);
        await openAttachPreviewFromFiles(files).catch(console.error);
        dom.center.attachInput.value = "";
      });
    }

    syncComposerSendButtonFocusLock();

    if (dom.center.emojiBtn && dom.center.emojiPopover) {
      dom.center.emojiBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        preloadEmojiAtlas();
        if (shouldUseNativeMobileEmojiKeyboard()) {
          hideEmojiPopover();
          if (dom.center.input) {
            focusComposerInput({ moveCaretToEnd: false });
          }
          return;
        }
        toggleEmojiPopover("composer");
        if (dom.center.input) {
          focusComposerInput({ moveCaretToEnd: false });
        }
      });

      document.addEventListener("click", (event) => {
        if (!dom.center.emojiPopover) return;
        const insidePopover = dom.center.emojiPopover.contains(event.target);
        const insideComposerBtn = dom.center.emojiBtn && dom.center.emojiBtn.contains(event.target);
        const insideAttachPreviewBtn = dom.center.attachPreviewEmojiBtn && dom.center.attachPreviewEmojiBtn.contains(event.target);
        if (!insidePopover && !insideComposerBtn && !insideAttachPreviewBtn) hideEmojiPopover();
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

  function initMobileChatControls() {
    if (dom.center.mobileClientsBackBtn && dom.center.mobileClientsBackBtn.dataset.bound !== "1") {
      dom.center.mobileClientsBackBtn.dataset.bound = "1";
      ["pointerdown", "touchstart", "mousedown"].forEach((eventName) => {
        dom.center.mobileClientsBackBtn.addEventListener(eventName, (event) => {
          event.stopPropagation();
        }, { passive: eventName === "touchstart" });
      });
      dom.center.mobileClientsBackBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openClientsPanel();
      });
    }

    if (dom.left.mobileCloseBtn && dom.left.mobileCloseBtn.dataset.bound !== "1") {
      dom.left.mobileCloseBtn.dataset.bound = "1";
      dom.left.mobileCloseBtn.addEventListener("click", () => {
        closeClientsPanel();
      });
    }

    const mobileRightBackBtn = document.getElementById("chatMobileRightBackBtn");
    if (mobileRightBackBtn && mobileRightBackBtn.dataset.bound !== "1") {
      mobileRightBackBtn.dataset.bound = "1";
      mobileRightBackBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOrderMode = document.body && document.body.classList.contains("chat-right-order-mode");
        if (isOrderMode && Number(state.activeClientId || 0) > 0) {
          if (state.rightOrderOpenedFromMessageBubble === true || state.rightOrderOpenedFromHeader === true) {
            state.rightOrderOpenedFromMessageBubble = false;
            state.rightOrderOpenedFromHeader = false;
            syncMobileChatView("center");
            return;
          }
          showChatRightPane("client");
          state.rightOrderOpenedFromHeader = false;
          syncMobileChatView("right");
          restoreClientPanelState();
          return;
        }
        syncMobileChatView("center");
      });
    }

    initHeaderClientOpenAction();

    window.__adminChatMobileApi = {
      openClientsPanel(options = {}) {
        return openClientsPanel(options);
      },
      closeClientsPanel(options = {}) {
        return closeClientsPanel(options);
      },
      toggleClientsPanel(options = {}) {
        return toggleClientsPanel(options);
      },
      openClientDetailsPanel(options = {}) {
        return openClientDetailsPanel(options);
      },
      closeClientDetailsPanel(options = {}) {
        return closeClientDetailsPanel(options);
      },
      syncView(options = {}) {
        return syncMobileChatViewFromState(options);
      },
    };

    if (!document.body || !document.body.classList.contains("page-chat")) return;
    hideLegacyRightPaneHeadersForChat();
    showChatRightPane("client");
    window.addEventListener("resize", () => {
      syncMobileChatViewFromState({ persistState: false });
    }, { passive: true });
    syncMobileChatViewFromState({ persistState: false });
  }

  function init() {
    pendingNotificationChatOpenRequest = pendingNotificationChatOpenRequest || readChatNotificationOpenRequestFromLocation();
    state.chatWidgetEnabled = getTenantChatWidgetEnabledFromStorage();
    setSidebarChatNavVisibility(state.chatWidgetEnabled !== false);
    setChatBootstrapLoading(state.chatWidgetEnabled !== false);
    ensureDesktopChatHeaderMarkup();
    initMessageAlerts();
    initComposer();
    bindAdminChatZoomGuards();
    bindAdminChatThreadEdgeSpring();
    bindAdminMobileEmptyThreadTouchBlock();
    if (!shouldPreferNativeAdminMobileChatTouchHandling()) {
      bindAdminMobileFooterPanGuard();
      bindAdminMobileStaticPanGuards();
      bindAdminMobileThreadKeyboardDismiss();
      bindAdminMobileThreadSwipeToClients();
    }
    initSelectionToolbar();
    initHeaderOrderStatusAction();
    initHeaderOrderOpenAction();
    bindChatRightOrderOpenRequests();
    initOrderHeaderLiveSync();
    if (dom.center.messagesWrap && dom.center.messagesWrap.dataset.scrollDownBound !== "1") {
      dom.center.messagesWrap.dataset.scrollDownBound = "1";
      let scheduleTouchGestureActiveRelease = () => {};
      if (dom.center.messagesWrap.dataset.touchGestureTrackBound !== "1") {
        dom.center.messagesWrap.dataset.touchGestureTrackBound = "1";
        scheduleTouchGestureActiveRelease = () => {
          if (adminChatThreadTouchGestureReleaseTimer) {
            window.clearTimeout(adminChatThreadTouchGestureReleaseTimer);
          }
          adminChatThreadTouchGestureReleaseTimer = window.setTimeout(() => {
            adminChatThreadTouchGestureReleaseTimer = 0;
            adminChatThreadTouchGestureActive = false;
          }, CHAT_NATIVE_BOTTOM_BOUNCE_SETTLE_MS);
        };
        dom.center.messagesWrap.addEventListener("touchstart", (event) => {
          if (adminChatThreadTouchGestureReleaseTimer) {
            window.clearTimeout(adminChatThreadTouchGestureReleaseTimer);
            adminChatThreadTouchGestureReleaseTimer = 0;
          }
          adminChatThreadTouchGestureActive = !!(event && event.touches && event.touches.length > 0);
        }, { passive: true });
        dom.center.messagesWrap.addEventListener("touchend", scheduleTouchGestureActiveRelease, { passive: true });
        dom.center.messagesWrap.addEventListener("touchcancel", scheduleTouchGestureActiveRelease, { passive: true });
      }
      dom.center.messagesWrap.addEventListener("scroll", () => {
        sampleAdminChatThreadEdgeSpringMomentumScroll(dom.center.messagesWrap);
        if (adminChatThreadTouchGestureActive) {
          scheduleTouchGestureActiveRelease();
        }
        const keepFloatingMenuOpen = Date.now() < Number(suppressFloatingMenuAutoHideUntil || 0);
        if (isAdminChatThreadEdgeSpringTouchActive()) {
          if (!keepFloatingMenuOpen) hideMessageContextMenu();
          return;
        }
        maybeTriggerAdminChatThreadEdgeSpringMomentumBounce(dom.center.messagesWrap);
        if (shouldTrackAdminChatKeyboardMessagesBottomDistance({
          viewportBottom: adminChatKeyboardLastViewportBottom,
          viewportHeight: getAdminChatViewportHeight(),
        })) {
          setAdminChatKeyboardTrackedMessagesBottomDistance(getMessagesBottomDistanceSnapshot());
        }
        saveThreadScrollPosition(state.activeClientId);
        if (dom.center.messagesWrap && dom.center.messagesWrap.scrollTop <= CHAT_THREAD_LOAD_MORE_THRESHOLD_PX) {
          loadOlderMessages(state.activeClientId).catch(console.error);
        }
        syncActiveThreadReadState();
        syncPendingScrollCountByViewport(state.activeClientId);
        if (shouldKeepMessagesPinnedToBottom()) {
          clearPendingScrollNewCount();
        }
        updateMessagesScrollDownButton();
        if (!keepFloatingMenuOpen) hideMessageContextMenu();
      });
    }
    if (dom.center.messages && dom.center.messages.dataset.pinnedBottomSyncBound !== "1") {
      dom.center.messages.dataset.pinnedBottomSyncBound = "1";
      // Capture phase is required: "load" on img does not bubble.
      dom.center.messages.addEventListener("load", (event) => {
        if (!(event.target instanceof HTMLImageElement)) return;
        schedulePinnedBottomLayoutSync();
      }, true);
      dom.center.messages.addEventListener("error", (event) => {
        if (!(event.target instanceof HTMLImageElement)) return;
        schedulePinnedBottomLayoutSync();
      }, true);
    }
    if (dom.center.messages && typeof ResizeObserver === "function" && dom.center.messages.dataset.pinnedBottomResizeBound !== "1") {
      dom.center.messages.dataset.pinnedBottomResizeBound = "1";
      const observer = new ResizeObserver(() => {
        schedulePinnedBottomLayoutSync();
      });
      observer.observe(dom.center.messages);
    }
    if (dom.center.messagesWrap && dom.center.messagesWrap.dataset.pinnedBottomWindowResizeBound !== "1") {
      dom.center.messagesWrap.dataset.pinnedBottomWindowResizeBound = "1";
      window.addEventListener("resize", () => {
        schedulePinnedBottomLayoutSync();
      }, { passive: true });
    }
    if (dom.center.scrollDownBtn && dom.center.scrollDownBtn.dataset.bound !== "1") {
      dom.center.scrollDownBtn.dataset.bound = "1";
      dom.center.scrollDownBtn.addEventListener("click", () => {
        scrollMessagesToBottom({ behavior: "smooth-fast", deferIfTouchGesture: false });
      });
    }
    if (dom.left.list && dom.left.list.dataset.scrollPersistBound !== "1") {
      dom.left.list.dataset.scrollPersistBound = "1";
      dom.left.list.addEventListener("scroll", () => {
        closeAllClientSwipeRows(null, { immediate: true });
        saveClientsListScrollPosition();
        maybeLoadMoreClientsByScroll();
      }, { passive: true });
    }
    bindSearch();
    initMobileChatControls();
    bindAdminMobileChatOverlayLayout();
    bindAdminChatKeyboardViewportSync();
    scheduleAdminChatKeyboardViewportSync();
    renderChatHeader();
    seedChatRightTabsFromCurrentState();
    syncSelectionUi();
    renderMessages();
    syncChatWidgetEnabledFromTenant({ reload: true, resume: true });
    flushPendingNotificationChatOpenRequest().catch(console.error);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const rawData = event && event.data && typeof event.data === "object" ? event.data : null;
        const eventType = String(rawData && rawData.type || "").trim().toLowerCase();
        if (eventType !== "chat-notification-click") return;
        const payload = rawData && rawData.payload && typeof rawData.payload === "object"
          ? rawData.payload
          : rawData;
        queueNotificationChatOpenRequest(payload, { clearLocation: false });
      });
    }

    const syncReadOnForeground = () => {
      if (!isChatWidgetEnabledRuntime()) return;
      if (!state.activeClientId) return;
      if (!isChatTabActiveForRead()) return;
      const now = Date.now();
      if ((now - Number(state.readSyncLastAt || 0)) < CHAT_READ_SYNC_MIN_INTERVAL_MS) return;
      state.readSyncLastAt = now;
      syncActiveThreadReadState();
    };

    const syncChatsOnForeground = () => {
      if (!isChatWidgetEnabledRuntime()) return;
      const now = Date.now();
      if (now - Number(state.foregroundEventLastAt || 0) < CHAT_FOREGROUND_EVENT_DEBOUNCE_MS) return;
      state.foregroundEventLastAt = now;
      if (state.foregroundSyncInFlight) return;
      if (now - Number(state.foregroundSyncLastAt || 0) < CHAT_FOREGROUND_SYNC_DEBOUNCE_MS) return;
      state.foregroundSyncInFlight = true;
      state.foregroundSyncLastAt = now;
      Promise.resolve()
        // Foreground switch must stay lightweight: no full clients/summaries pull here.
        // Realtime stream and periodic loops handle list freshness separately.
        .then(() => false)
        .then(() => syncReadOnForeground())
        .catch(console.error)
        .finally(() => {
          state.foregroundSyncInFlight = false;
          state.foregroundSyncLastAt = Date.now();
        });
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") {
        saveThreadScrollPosition(state.activeClientId);
        saveClientsListScrollPosition();
        flushUiStatePersist();
        return;
      }
      if (!syncChatWidgetEnabledFromTenant()) return;
      syncChatsOnForeground();
    });

    window.addEventListener("focus", () => {
      if (!syncChatWidgetEnabledFromTenant()) return;
      syncChatsOnForeground();
    });

    window.addEventListener("pageshow", () => {
      if (!syncChatWidgetEnabledFromTenant()) return;
      syncChatsOnForeground();
    });

    window.addEventListener("pagehide", () => {
      pauseRealtimeSync({ flushTyping: true, keepalive: true });
      saveThreadScrollPosition(state.activeClientId);
      saveClientsListScrollPosition();
      flushUiStatePersist();
    });

    document.addEventListener("tenantStoreChanged", () => {
      syncChatWidgetEnabledFromTenant({ reload: true, resume: true });
    });

    document.addEventListener(TENANT_DATA_CHANGED_EVENT, () => {
      syncChatWidgetEnabledFromTenant({ reload: true, resume: true });
    });

    window.addEventListener("storage", (event) => {
      const key = String(event?.key || "");
      if (key === "tenant") {
        syncChatWidgetEnabledFromTenant({ reload: true, resume: true });
        return;
      }
      if (key === getSharedClientDetailsCacheKey()) {
        const activeId = Number(state.activeClientId || 0);
        if (!Number.isFinite(activeId) || activeId <= 0) return;
        // Header orders are API-driven; ignore shared-cache updates here.
      }
    });

  }

  init();
})();


