(function () {
  const openBtn = document.getElementById("shopCompanyChatOpenBtn");
  const unreadBadge = document.getElementById("shopCompanyChatUnreadBadge");
  const overlay = document.getElementById("shopCompanyChatOverlay");
  const modal = overlay ? overlay.querySelector(".shop-company-chat-modal") : null;
  const modalHeader = overlay ? overlay.querySelector(".shop-company-chat-modal__header") : null;
  const modalBody = overlay ? overlay.querySelector(".shop-company-chat-modal__body") : null;
  const modalTitle = document.getElementById("shopCompanyChatTitle");
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
  const imageViewerCard = imageViewerOverlay
    ? imageViewerOverlay.querySelector(".chat-image-viewer-card")
    : null;
  const input = document.getElementById("shopCompanyChatInput");
  const emojiBtn = document.getElementById("shopCompanyChatEmojiBtn");
  const emojiPopover = document.getElementById("shopCompanyChatEmojiPopover");
  const emojiPopoverHomeParent = emojiPopover ? emojiPopover.parentElement : null;
  const scrollDownBtn = document.getElementById("shopCompanyChatScrollDownBtn");
  const scrollDownBadge = document.getElementById("shopCompanyChatScrollDownBadge");
  let typingIndicator = document.getElementById("shopCompanyChatTypingIndicator");
  const reactionBar = document.getElementById("shopCompanyChatReactionBar");

  if (!openBtn || !overlay || !modal || !modalHeader || !modalBody || !modalTitle || !closeBtn) return;
  if (!feed || !thread || !composer || !selectionToolbar || !selectionCloseBtn || !selectionCountEl || !selectionCopyBtn || !selectionDeleteBtn || !attachBtn || !attachInput || !attachPreviewOverlay || !attachPreviewCloseBtn || !attachPreviewTitle || !attachPreviewImage || !attachPreviewThumbs || !attachPreviewEmojiBtn || !attachPreviewCaption || !attachPreviewSendBtn || !imageViewerOverlay || !imageViewerCloseBtn || !imageViewerImage || !imageViewerCard || !input || !emojiBtn || !emojiPopover || !scrollDownBtn || !reactionBar) return;
  const initialModalTitleText = String(modalTitle.textContent || "").trim() || "\u0427\u0430\u0442";

  const EMOJI_ASSET_BASE_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64";
  const EMOJI_DATASET_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/emoji.json";
  const EMOJI_REMOTE_DATASET_ENABLED = false;
  const EMOJI_NATIVE_RENDER_ONLY = true;
  const EMOJI_REACTION_POOL_LIMIT = 64;
  const EMOJI_ATLAS_ENABLED = true;
  const EMOJI_ATLAS_URL = "/static/assets/emoji/apple-people-atlas.webp?v=1";
  const EMOJI_ATLAS_COLUMNS = 16;
  const EMOJI_RECENT_STORAGE_KEY = "shop-company-chat-recent-emojis:v1";
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
    flags: []
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
  const EMOJI_ATLAS_INDEX_BY_KEY = (function () {
    const map = Object.create(null);
    (EMOJI_FALLBACK_CATEGORIES.people || []).forEach(function (emoji, index) {
      const key = normalizeEmojiAtlasKey(emoji);
      if (!key) return;
      if (map[key] === undefined) map[key] = index;
    });
    return map;
  })();
  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const CHAT_THREAD_WAIT_TIMEOUT_MS = 20000;
  const CHAT_THREAD_WAIT_RETRY_MS = 1200;
  const CHAT_UNREAD_WAIT_TIMEOUT_MS = 25000;
  const CHAT_UNREAD_WAIT_RETRY_MS = 1400;
  const CHAT_THREAD_PAGE_SIZE = 60;
  const CHAT_THREAD_PAGE_MAX_SIZE = 200;
  const CHAT_DROP_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i;
  const CHAT_AUTOSCROLL_MS = 170;
  const CHAT_EMOJI_SHEET_SETTLE_MS = 280;
  const CHAT_SCROLL_DOWN_SHOW_DISTANCE_PX = 6;
  const CHAT_TYPING_HEARTBEAT_MS = 1800;
  const CHAT_TYPING_IDLE_STOP_MS = 2600;
  const CHAT_TYPING_BLUR_STOP_MS = 320;
  const CHAT_MESSAGE_ALERT_COOLDOWN_MS = 900;
  const CHAT_PUSH_SYNC_DEBOUNCE_MS = 180;
  const MAX_IMAGE_DATA_URL_LENGTH = 50 * 1024 * 1024;
  const IMAGE_OPTIMIZE_SKIP_BELOW_BYTES = 700 * 1024;
  const IMAGE_OPTIMIZE_TARGET_BYTES = 900 * 1024;
  const IMAGE_OPTIMIZE_MAX_SIDE_PX = 1600;
  const IMAGE_OPTIMIZE_MIN_SIDE_PX = 900;
  const IMAGE_OPTIMIZE_INITIAL_QUALITY = 0.86;
  const IMAGE_OPTIMIZE_MIN_QUALITY = 0.58;
  const IMAGE_OPTIMIZE_SCALE_STEP = 0.84;
  const CHAT_REACTION_ACTOR = "in";
  const CHAT_TYPING_PHRASES = [
    "\u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442",
    "\u043d\u0430\u0431\u0438\u0440\u0430\u0435\u0442 \u043e\u0442\u0432\u0435\u0442",
    "\u043a\u043b\u0430\u0446\u0430\u0435\u0442 \u043f\u043e \u043a\u043b\u0430\u0432\u0438\u0448\u0430\u043c",
    "\u0441\u0442\u0443\u0447\u0438\u0442 \u043f\u043e \u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0435",
    "\u0441\u0442\u0440\u043e\u0447\u0438\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435",
    "\u0441\u043e\u0431\u0438\u0440\u0430\u0435\u0442 \u043c\u044b\u0441\u043b\u0438 \u0432 \u0442\u0435\u043a\u0441\u0442",
    "\u0444\u043e\u0440\u043c\u0443\u043b\u0438\u0440\u0443\u0435\u0442 \u043e\u0442\u0432\u0435\u0442",
    "\u043d\u0430\u0431\u0438\u0432\u0430\u0435\u0442 \u0442\u0435\u043a\u0441\u0442",
    "\u0434\u043e\u043b\u0431\u0438\u0442 \u043f\u043e \u043a\u043b\u0430\u0432\u0438\u0448\u0430\u043c",
    "\u043f\u043e\u0434\u0431\u0438\u0440\u0430\u0435\u0442 \u0441\u043b\u043e\u0432\u0430",
    "\u043a\u043e\u043b\u0434\u0443\u0435\u0442 \u043d\u0430\u0434 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u043c",
    "\u043d\u0430\u0436\u0438\u043c\u0430\u0435\u0442 \u043a\u043b\u0430\u0432\u0438\u0448\u0438",
  ];

  let emojiAssetsState = EMOJI_NATIVE_RENDER_ONLY ? "fallback" : "unknown";
  let emojiAtlasPreloadStarted = false;
  let emojiCategories = {};
  let emojiRecentList = [];
  let emojiActiveCategory = "people";
  let emojiDatasetPromise = null;
  let emojiPopoverMode = "composer";
  let emojiPopoverReactionMessageId = "";

  const CHAT_QUICK_ORDER_ID = "order";
  const CHAT_QUICK_ORDER_QUESTION = "\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?";
  const DEFAULT_CHAT_QUICK_QUESTION_ITEMS = [
    {
      id: CHAT_QUICK_ORDER_ID,
      type: "order",
      question: CHAT_QUICK_ORDER_QUESTION,
      answer: "",
      enabled: true,
    },
    {
      id: "quality",
      type: "custom",
      question: "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430",
      answer:
        "\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. " +
        "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, " +
        "\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.",
      enabled: true,
    },
    {
      id: "completeness",
      type: "custom",
      question: "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430",
      answer:
        "\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, " +
        "\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.",
      enabled: true,
    },
    {
      id: "other",
      type: "custom",
      question: "\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441",
      answer:
        "\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.",
      enabled: true,
    },
  ];
  const DEFAULT_CHAT_QUICK_QUESTIONS = DEFAULT_CHAT_QUICK_QUESTION_ITEMS
    .filter(function (item) { return item && item.enabled !== false; })
    .map(function (item) { return String(item.question || ""); });
  const CHAT_QUICK_QUESTIONS_MAX = 6;
  const CHAT_SETTINGS_API_URL = "/api/public/tenant/chat-settings";
  const CHAT_ASSISTANT_GENDER_MALE = "m";
  const CHAT_ASSISTANT_GENDER_FEMALE = "f";
  const DEFAULT_CHAT_ASSISTANT_GENDER = CHAT_ASSISTANT_GENDER_MALE;
  const HOT_QUESTION_ORDER_KEY = "\u0433\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437";
  const HOT_QUESTION_ORDER_KEY_ALT = "\u0433\u0434\u0435 \u0437\u0430\u043a\u0430\u0437";
  const HOT_QUESTION_GUEST_PHONE_REPLY =
    "\u041d\u0435 \u043c\u043e\u0433\u0443 \u043d\u0430\u0439\u0442\u0438 \u0432\u0430\u0441 \u0432 \u0431\u0430\u0437\u0435. " +
    "\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430.";
  const HOT_QUESTION_NO_ACTIVE_ORDERS_REPLY =
    "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u043b: \u0441\u0435\u0439\u0447\u0430\u0441 \u0443 \u0432\u0430\u0441 \u043d\u0435\u0442 " +
    "\u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432.";
  const HOT_QUESTION_NO_ACTIVE_ORDERS_REPLY_FEMALE =
    "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u043b\u0430: \u0441\u0435\u0439\u0447\u0430\u0441 \u0443 \u0432\u0430\u0441 \u043d\u0435\u0442 " +
    "\u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0445 \u0437\u0430\u043a\u0430\u0437\u043e\u0432.";
  const HOT_QUESTION_ORDER_STATUS_UNKNOWN = "\u0421\u0442\u0430\u0442\u0443\u0441 \u0443\u0442\u043e\u0447\u043d\u044f\u0435\u0442\u0441\u044f";
  const HOT_QUESTION_ORDER_LIST_PREFIX = "\u041d\u0430\u0448\u0435\u043b \u0432\u0430\u0448\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u044b.";
  const HOT_QUESTION_ORDER_LIST_PREFIX_FEMALE = "\u041d\u0430\u0448\u043b\u0430 \u0432\u0430\u0448\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u044b.";
  const ASSISTANT_MESSAGE_ID_PREFIX = "assistant-auto-";
  const HOT_QUESTION_PHONE_PATTERN = /(?:\+?\d[\d\s\-()]{8,}\d)/g;
  const HOT_QUESTION_ORDER_CARD_MESSAGE_RE = /^assistant-auto-(?:where-order|phone-order)-o([0-9_]+)-/;
  const HOT_QUESTION_ORDER_CARD_PHOTOS_MAX = 4;
  const CHAT_ORDER_DETAILS_TITLE = "\u0414\u0435\u0442\u0430\u043b\u0438 \u0437\u0430\u043a\u0430\u0437\u0430";
  const CHAT_ORDER_LOADING_TEXT = "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026";
  const CHAT_ORDER_LOAD_ERROR_TEXT = "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0434\u0435\u0442\u0430\u043b\u0438 \u0437\u0430\u043a\u0430\u0437\u0430.";

  const DEFAULT_CHAT_ASSISTANT_NAME = "\u041d\u044f\u043c-\u041d\u044f\u043c";
  const DEFAULT_CHAT_WELCOME_MESSAGE =
    "\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u041d\u044f\u043c-\u041d\u044f\u043c!\n" +
    "\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f " +
    "\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 " +
    "\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 " +
    "\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.";
  const DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE =
    "\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u0446\u0430 \u041d\u044f\u043c-\u041d\u044f\u043c!\n" +
    "\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f " +
    "\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 " +
    "\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 " +
    "\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.";
  const DEFAULT_CHAT_OPTIONS_TEXT =
    "\u0427\u0442\u043e\u0431\u044b \u044f \u0441\u043c\u043e\u0433 \u0432\u0430\u043c \u043f\u043e\u043c\u043e\u0447\u044c, \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044e \u043d\u0438\u0436\u0435:";
  const chatRuntimeSettings = {
    assistantName: DEFAULT_CHAT_ASSISTANT_NAME,
    assistantGender: DEFAULT_CHAT_ASSISTANT_GENDER,
    welcomeMessage: DEFAULT_CHAT_WELCOME_MESSAGE,
    welcomeEnabled: true,
    optionsText: DEFAULT_CHAT_OPTIONS_TEXT,
    quickQuestions: DEFAULT_CHAT_QUICK_QUESTIONS.slice(),
    quickQuestionsConfig: DEFAULT_CHAT_QUICK_QUESTION_ITEMS.map(function (item) {
      return {
        id: String(item.id || ""),
        type: item.id === CHAT_QUICK_ORDER_ID ? "order" : "custom",
        question: String(item.question || ""),
        answer: String(item.answer || ""),
        enabled: item.enabled !== false,
      };
    }),
    quickQuestionsEnabled: true,
    operatorName: "",
    isEnabled: true,
  };
  const hotQuestionAliases = {
    order: new Set([HOT_QUESTION_ORDER_KEY, HOT_QUESTION_ORDER_KEY_ALT]),
  };

  const baseEntries = [];

  const INITIAL_BATCH = 3;
  const OLDER_BATCH = 4;

  let initialized = false;
  let isLoadingOlder = false;
  let visibleStart = baseEntries.length;
  let liveEntries = [];
  let messageSeq = 0;
  let sharedThreadUpdatedAt = "";
  let sharedThreadWaitLoopStarted = false;
  let sharedThreadWaitLoopToken = 0;
  let sharedThreadWaitAbortController = null;
  let sharedMutationQueue = Promise.resolve();
  let sharedMutationPendingCount = 0;
  let sharedThreadMutationVersion = 0;
  let profileMergeInFlight = false;
  let chatBodyScrollLockState = null;
  let chatBodyScrollLockY = 0;
  let feedScrollRaf = 0;
  let emojiSheetSettleRaf = 0;
  let emojiSheetSettleTimer = 0;
  let scrollDownComposerOffsetRaf = 0;
  let closeFeedPersistRaf = 0;
  let closeFeedPersistTimerFast = 0;
  let closeFeedPersistTimerSlow = 0;
  let closeFeedPersistToken = 0;
  let mobileKeyboardInsetSyncRaf = 0;
  let mobileKeyboardViewportSyncBound = false;
  let sharedPullInFlight = false;
  let sharedHistoryHasMore = false;
  let sharedHistoryNextBeforeId = null;
  let sharedHistoryLoading = false;
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
  let orderCardMouseDrag = null;
  let replyDraft = null;
  let replyUi = null;
  let attachPreviewItems = [];
  let attachPreviewActiveIndex = 0;
  let attachPreviewSourceFiles = [];
  let attachPreviewObjectUrls = [];
  let attachPreviewSending = false;
  let feedDropDragDepth = 0;
  let pendingFeedNewCount = 0;
  let pendingFeedMessageIds = new Set();
  let hasLoadedSharedThreadOnce = false;
  let lastFeedScrollTop = null;
  let lastFeedViewportState = null;
  let pendingFeedRestoreState = null;
  let pendingFeedRestoreMutationVersion = 0;
  let unreadServerTotal = 0;
  let unreadServerRevision = 0;
  let unreadServerUpdatedAt = "";
  let unreadStatePrimed = false;
  let unreadWaitLoopStarted = false;
  let unreadWaitLoopToken = 0;
  let unreadWaitAbortController = null;
  let peerTypingState = { active: false, text: "", updatedAt: "", expiresAt: "" };
  let peerTypingUpdatedAt = "";
  let peerTypingHideTimer = 0;
  let localTypingHeartbeatTimer = 0;
  let localTypingStopTimer = 0;
  let localTypingActive = false;
  let localTypingPhrase = "";
  let messageAlertAudioCtx = null;
  let messageAlertAudioUnlocked = false;
  let messageAlertUnlockAttempted = false;
  let messageAlertLastAt = 0;
  let suppressIncomingAlertsUntil = 0;
  let webPushPublicKeyCache = "";
  let webPushPublicKeyFetched = false;
  let webPushSyncTimer = 0;
  let webPushSyncInFlight = false;
  let webPushSyncedFingerprint = "";
  let webPushSubscriptionVapidKey = "";
  let webPushSyncRequestedWithPermission = false;
  let webPushSyncForceRequested = false;
  let webPushSyncQueuedClientId = "";
  let notificationPermissionPromptShownInSession = false;
  let notificationPermissionPromptEl = null;
  const selectedMessageIds = new Set();
  const hotQuestionOrderCardsCache = new Map();
  const hotQuestionOrderCardsFetchInFlight = new Map();
  let chatOrderDetailsView = null;
  let chatOrderBackBtn = null;
  let chatOrderDetailsActive = false;
  let chatOrderDetailsId = 0;
  let chatOrderDetailsPrevTitle = "";
  let chatBootstrapLoaderEl = null;
  let chatOrderUiSnapshot = null;
  let chatOrderFooterOutsideHandler = null;

  const LONG_PRESS_MS = 430;
  const SWIPE_REPLY_TRIGGER = 72;
  const ORDER_CARD_MOUSE_DRAG_START_PX = 5;
  const ORDER_CARD_MOUSE_DRAG_SUPPRESS_CLICK_MS = 240;

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

  function getRandomTypingPhrase() {
    if (!Array.isArray(CHAT_TYPING_PHRASES) || !CHAT_TYPING_PHRASES.length) {
      return "\u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442";
    }
    const idx = Math.floor(Math.random() * CHAT_TYPING_PHRASES.length);
    const phrase = String(CHAT_TYPING_PHRASES[idx] || "").trim();
    return phrase || "\u043f\u0435\u0447\u0430\u0442\u0430\u0435\u0442";
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
      updatedAt: updatedAt,
      expiresAt: expiresAt,
    };
  }

  function ensureTypingIndicatorNode() {
    if (typingIndicator && typingIndicator.isConnected) return typingIndicator;
    const existing = thread.querySelector("#shopCompanyChatTypingIndicator");
    if (existing) {
      typingIndicator = existing;
      return typingIndicator;
    }
    const row = document.createElement("div");
    row.id = "shopCompanyChatTypingIndicator";
    row.className = "shop-company-chat-row is-agent shop-company-chat-typing-row is-hidden";
    row.setAttribute("aria-live", "polite");
    row.setAttribute("aria-atomic", "true");

    const textNode = document.createElement("div");
    textNode.className = "shop-company-chat-typing-indicator";
    row.appendChild(textNode);
    thread.appendChild(row);

    typingIndicator = row;
    return typingIndicator;
  }

  function renderTypingIndicator() {
    const keepBottom = shouldKeepFeedPinnedToBottom();
    const node = ensureTypingIndicatorNode();
    if (!node) return;
    const canShow = overlay.classList.contains("is-open") && peerTypingState.active && peerTypingState.text;
    const textNode = node.querySelector(".shop-company-chat-typing-indicator");
    if (!canShow) {
      if (textNode) textNode.textContent = "";
      node.classList.add("is-hidden");
      if (keepBottom) {
        scrollToBottom(false);
      } else {
        updateScrollDownButton();
      }
      return;
    }
    if (textNode) textNode.textContent = String(peerTypingState.text || "").trim();
    node.classList.remove("is-hidden");
    if (keepBottom) {
      scrollToBottom(false);
    } else {
      updateScrollDownButton();
    }
  }

  function clearPeerTypingHideTimer() {
    if (!peerTypingHideTimer) return;
    window.clearTimeout(peerTypingHideTimer);
    peerTypingHideTimer = 0;
  }

  function schedulePeerTypingAutoHide() {
    clearPeerTypingHideTimer();
    const expiresAt = String(peerTypingState.expiresAt || "");
    if (!expiresAt) return;
    const until = new Date(expiresAt).getTime();
    if (!Number.isFinite(until)) return;
    const delay = Math.max(0, until - Date.now() + 80);
    peerTypingHideTimer = window.setTimeout(function () {
      peerTypingHideTimer = 0;
      const currentUntil = new Date(String(peerTypingState.expiresAt || "")).getTime();
      if (Number.isFinite(currentUntil) && currentUntil > Date.now()) return;
      peerTypingState = {
        active: false,
        text: "",
        updatedAt: String(peerTypingState.updatedAt || ""),
        expiresAt: "",
      };
      renderTypingIndicator();
    }, delay);
  }

  function applyPeerTypingState(rawTyping, options) {
    const opts = options || {};
    const info = normalizePeerTypingInfo(rawTyping);
    const nextUpdatedAt = String(info.updatedAt || peerTypingUpdatedAt || "");
    if (nextUpdatedAt) peerTypingUpdatedAt = nextUpdatedAt;
    if (opts.forceInactive === true) {
      peerTypingState = {
        active: false,
        text: "",
        updatedAt: nextUpdatedAt,
        expiresAt: "",
      };
      clearPeerTypingHideTimer();
      renderTypingIndicator();
      return;
    }

    peerTypingState = info;
    if (info.active) schedulePeerTypingAutoHide();
    else clearPeerTypingHideTimer();
    renderTypingIndicator();
  }

  function clearLocalTypingTimers() {
    if (localTypingHeartbeatTimer) {
      window.clearTimeout(localTypingHeartbeatTimer);
      localTypingHeartbeatTimer = 0;
    }
    if (localTypingStopTimer) {
      window.clearTimeout(localTypingStopTimer);
      localTypingStopTimer = 0;
    }
  }

  async function remoteSetTypingState(active, phrase, options) {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return;
    const opts = options || {};
    const payload = active === true
      ? { typing: true, text: String(phrase || "").trim().slice(0, 120) }
      : { typing: false };
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/typing",
      {
        method: "POST",
        keepalive: opts.keepalive === true,
        body: payload,
      }
    );
    const peerTyping = json && json.data ? json.data.peer_typing : null;
    if (peerTyping && typeof peerTyping === "object") {
      applyPeerTypingState(peerTyping);
    }
  }

  function scheduleLocalTypingHeartbeat() {
    if (!localTypingActive) return;
    if (localTypingHeartbeatTimer) window.clearTimeout(localTypingHeartbeatTimer);
    localTypingHeartbeatTimer = window.setTimeout(function () {
      if (!localTypingActive) return;
      if (!overlay.classList.contains("is-open")) {
        stopLocalTypingSession({ flush: true });
        return;
      }
      if (!normalizeComposerText(input.value)) {
        stopLocalTypingSession({ flush: true });
        return;
      }
      remoteSetTypingState(true, localTypingPhrase).catch(function () {});
      scheduleLocalTypingHeartbeat();
    }, CHAT_TYPING_HEARTBEAT_MS);
  }

  function scheduleLocalTypingStop(delayMs) {
    if (localTypingStopTimer) window.clearTimeout(localTypingStopTimer);
    const timeout = Math.max(80, Number(delayMs || CHAT_TYPING_IDLE_STOP_MS));
    localTypingStopTimer = window.setTimeout(function () {
      stopLocalTypingSession({ flush: true });
    }, timeout);
  }

  function stopLocalTypingSession(options) {
    const opts = options || {};
    const wasActive = localTypingActive === true;
    clearLocalTypingTimers();
    localTypingActive = false;
    localTypingPhrase = "";
    if (opts.flush !== false && wasActive) {
      remoteSetTypingState(false, "", { keepalive: opts.keepalive === true }).catch(function () {});
    }
  }

  function handleComposerTypingActivity() {
    if (!overlay.classList.contains("is-open")) return;
    const hasText = !!normalizeComposerText(input.value);
    if (!hasText) {
      stopLocalTypingSession({ flush: true });
      return;
    }
    if (!localTypingActive) {
      localTypingActive = true;
      localTypingPhrase = getRandomTypingPhrase();
      remoteSetTypingState(true, localTypingPhrase).catch(function () {});
    }
    scheduleLocalTypingHeartbeat();
    scheduleLocalTypingStop(CHAT_TYPING_IDLE_STOP_MS);
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
    syncPendingFeedCountByViewport();
    updateScrollDownButton();
    renderUnreadBadge(liveEntries);
  }

  function clearPendingFeedNewCount() {
    if (pendingFeedMessageIds.size <= 0 && pendingFeedNewCount <= 0) return;
    pendingFeedMessageIds.clear();
    pendingFeedNewCount = 0;
    updateScrollDownButton();
    renderUnreadBadge(liveEntries);
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
    renderUnreadBadge(liveEntries);
  }

  function getFeedViewportStateSnapshot() {
    if (!feed) return null;
    const top = normalizePersistedFeedTop(Number(feed.scrollTop || 0));
    if (!Number.isFinite(top)) return null;
    const snapshot = {
      top: top,
      anchorId: "",
      anchorOffset: 0,
    };
    if (!thread) return snapshot;
    const feedRect = feed.getBoundingClientRect();
    const topEdge = feedRect.top + 1;
    const rows = thread.querySelectorAll(".shop-company-chat-row[data-message-id]");
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rect = row.getBoundingClientRect();
      if (rect.bottom <= topEdge) continue;
      const id = String(row.getAttribute("data-message-id") || "");
      if (!id) break;
      snapshot.anchorId = id;
      snapshot.anchorOffset = rect.top - feedRect.top;
      break;
    }
    return snapshot;
  }

  function clampFeedScrollTop(value) {
    const maxTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    return Math.max(0, Math.min(Number(value || 0), maxTop));
  }

  function getFeedBottomDistanceSnapshot() {
    if (!feed) return null;
    const distance = Number(feed.scrollHeight || 0) - Number(feed.clientHeight || 0) - Number(feed.scrollTop || 0);
    if (!Number.isFinite(distance)) return null;
    return Math.max(0, distance);
  }

  function applyFeedBottomDistanceSnapshot(distance) {
    if (!feed) return false;
    const raw = Number(distance);
    if (!Number.isFinite(raw)) return false;
    const nextTop = Number(feed.scrollHeight || 0) - Number(feed.clientHeight || 0) - Math.max(0, raw);
    feed.scrollTop = clampFeedScrollTop(nextTop);
    updateScrollDownButton();
    return true;
  }

  function stopEmojiSheetBottomDistanceStabilization() {
    if (emojiSheetSettleRaf) {
      cancelAnimationFrame(emojiSheetSettleRaf);
      emojiSheetSettleRaf = 0;
    }
    if (emojiSheetSettleTimer) {
      clearTimeout(emojiSheetSettleTimer);
      emojiSheetSettleTimer = 0;
    }
  }

  function stabilizeFeedBottomDistance(distance, durationMs) {
    const target = Number(distance);
    if (!Number.isFinite(target) || target < 0) return;
    const duration = Math.max(120, Number(durationMs || CHAT_EMOJI_SHEET_SETTLE_MS));
    stopEmojiSheetBottomDistanceStabilization();

    const startedAt = typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

    const step = function (now) {
      applyFeedBottomDistanceSnapshot(target);
      const current = typeof now === "number" ? now : Date.now();
      if ((current - startedAt) < duration) {
        emojiSheetSettleRaf = requestAnimationFrame(step);
        return;
      }
      emojiSheetSettleRaf = 0;
      applyFeedBottomDistanceSnapshot(target);
    };

    emojiSheetSettleRaf = requestAnimationFrame(step);
    emojiSheetSettleTimer = window.setTimeout(function () {
      stopEmojiSheetBottomDistanceStabilization();
      applyFeedBottomDistanceSnapshot(target);
    }, duration + 90);
  }

  function normalizePersistedFeedTop(value) {
    const top = Number(value || 0);
    if (!Number.isFinite(top) || top <= 0) return 0;
    if (isMobileChatViewport() && top <= 24) return 0;
    return top;
  }

  function applyFeedViewportStateSnapshot(snapshot) {
    if (!feed || !snapshot || typeof snapshot !== "object") return false;
    const rawTop = Number(snapshot.top);
    if (!Number.isFinite(rawTop)) return false;

    feed.scrollTop = clampFeedScrollTop(normalizePersistedFeedTop(rawTop));

    const anchorId = String(snapshot.anchorId || "");
    if (anchorId && thread) {
      const anchorNode = thread.querySelector(
        '.shop-company-chat-row[data-message-id="' + cssEscape(anchorId) + '"]'
      );
      if (anchorNode) {
        const feedRect = feed.getBoundingClientRect();
        const rect = anchorNode.getBoundingClientRect();
        const targetOffset = Number(snapshot.anchorOffset);
        const safeTargetOffset = Number.isFinite(targetOffset) ? targetOffset : 0;
        const delta = (rect.top - feedRect.top) - safeTargetOffset;
        if (Math.abs(delta) > 0.5) {
          feed.scrollTop = clampFeedScrollTop(feed.scrollTop + delta);
        }
      }
    }

    const appliedTop = clampFeedScrollTop(feed.scrollTop);
    feed.scrollTop = appliedTop;
    lastFeedScrollTop = appliedTop;
    lastFeedViewportState = {
      top: appliedTop,
      anchorId: anchorId,
      anchorOffset: Number(snapshot.anchorOffset) || 0,
    };
    updateScrollDownButton();
    return true;
  }

  function scheduleFeedViewportRestoreStabilization(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    const stableSnapshot = {
      top: Number(snapshot.top) || 0,
      anchorId: String(snapshot.anchorId || ""),
      anchorOffset: Number(snapshot.anchorOffset) || 0,
    };

    if (!isMobileChatViewport()) {
      window.setTimeout(function () {
        if (!overlay.classList.contains("is-open")) return;
        applyFeedViewportStateSnapshot(stableSnapshot);
      }, 120);
    }

    const attachmentImages = Array.from(
      thread.querySelectorAll(".shop-company-chat-attachment-image")
    ).filter(function (img) {
      return !(img && img.complete);
    });
    if (!attachmentImages.length) return;

    let left = attachmentImages.length;
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      if (!overlay.classList.contains("is-open")) return;
      applyFeedViewportStateSnapshot(stableSnapshot);
    };
    const timer = window.setTimeout(finish, 1000);
    const onImgDone = function () {
      if (done) return;
      left -= 1;
      if (left <= 0) {
        clearTimeout(timer);
        finish();
      }
    };
    attachmentImages.forEach(function (img) {
      img.addEventListener("load", onImgDone, { once: true });
      img.addEventListener("error", onImgDone, { once: true });
    });
  }

  function isFeedViewportRestoreSatisfied(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || !feed) return true;

    const desiredTop = Number(snapshot.top);
    if (Number.isFinite(desiredTop)) {
      const maxTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
      if (desiredTop > maxTop + 2) return false;
    }

    const anchorId = String(snapshot.anchorId || "");
    if (!anchorId || !thread) return true;
    const anchorNode = thread.querySelector(
      '.shop-company-chat-row[data-message-id="' + cssEscape(anchorId) + '"]'
    );
    if (!anchorNode) return false;

    const feedRect = feed.getBoundingClientRect();
    const rect = anchorNode.getBoundingClientRect();
    const expectedOffset = Number(snapshot.anchorOffset);
    const targetOffset = Number.isFinite(expectedOffset) ? expectedOffset : 0;
    const delta = (rect.top - feedRect.top) - targetOffset;
    return Math.abs(delta) <= 3;
  }

  function tryApplyPendingFeedRestoreState() {
    if (!overlay.classList.contains("is-open")) return false;
    if (!pendingFeedRestoreState || typeof pendingFeedRestoreState !== "object") return false;
    if (pendingFeedRestoreMutationVersion !== sharedThreadMutationVersion) {
      pendingFeedRestoreState = null;
      pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
      return false;
    }
    applyFeedViewportStateSnapshot(pendingFeedRestoreState);
    if (!isFeedViewportRestoreSatisfied(pendingFeedRestoreState)) return false;
    pendingFeedRestoreState = null;
    pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
    return true;
  }

  function cancelDeferredClosedFeedPersist() {
    closeFeedPersistToken += 1;
    if (closeFeedPersistRaf) {
      cancelAnimationFrame(closeFeedPersistRaf);
      closeFeedPersistRaf = 0;
    }
    if (closeFeedPersistTimerFast) {
      clearTimeout(closeFeedPersistTimerFast);
      closeFeedPersistTimerFast = 0;
    }
    if (closeFeedPersistTimerSlow) {
      clearTimeout(closeFeedPersistTimerSlow);
      closeFeedPersistTimerSlow = 0;
    }
  }

  function persistFeedViewportAfterClose() {
    if (overlay.classList.contains("is-open")) return;
    saveFeedScrollPosition({ force: true, persist: true });
    persistFeedScrollPositionSnapshot();
  }

  function scheduleDeferredClosedFeedPersist() {
    cancelDeferredClosedFeedPersist();
    const token = closeFeedPersistToken;
    const persistIfCurrent = function () {
      if (token !== closeFeedPersistToken) return;
      persistFeedViewportAfterClose();
    };

    closeFeedPersistRaf = requestAnimationFrame(function () {
      closeFeedPersistRaf = 0;
      persistIfCurrent();
    });

    closeFeedPersistTimerFast = window.setTimeout(function () {
      closeFeedPersistTimerFast = 0;
      persistIfCurrent();
    }, 90);

    closeFeedPersistTimerSlow = window.setTimeout(function () {
      closeFeedPersistTimerSlow = 0;
      persistIfCurrent();
    }, 240);
  }

  function saveFeedScrollPosition(options) {
    const opts = options || {};
    const isOpen = overlay.classList.contains("is-open");
    if (!isOpen && opts.force !== true) return;
    if (!feed) return;
    const nextTop = normalizePersistedFeedTop(Number(feed.scrollTop || 0));
    lastFeedScrollTop = nextTop;

    if (!lastFeedViewportState || typeof lastFeedViewportState !== "object") {
      lastFeedViewportState = { top: nextTop, anchorId: "", anchorOffset: 0 };
    } else {
      lastFeedViewportState.top = nextTop;
    }

    if (opts.persist === true) {
      const clientId = String(opts.clientId || getActiveChatClientId() || "");
      const snapshot = getFeedViewportStateSnapshot() || {
        top: nextTop,
        anchorId: "",
        anchorOffset: 0,
      };
      lastFeedViewportState = snapshot;
      if (clientId) savePersistedFeedViewportState(clientId, snapshot);
    }
  }

  function restoreFeedScrollPosition(options) {
    const opts = options || {};
    const clientId = String(opts.clientId || getActiveChatClientId() || "");

    let snapshot = lastFeedViewportState && typeof lastFeedViewportState === "object"
      ? { ...lastFeedViewportState }
      : null;

    if (opts.preferPersisted === true || !snapshot || !Number.isFinite(Number(snapshot.top))) {
      const persistedState = loadPersistedFeedViewportState(clientId);
      if (persistedState) snapshot = persistedState;
    }

    if (!snapshot || !Number.isFinite(Number(snapshot.top))) {
      const fallbackTop = Number(lastFeedScrollTop);
      if (!Number.isFinite(fallbackTop)) return false;
      snapshot = {
        top: fallbackTop,
        anchorId: "",
        anchorOffset: 0,
      };
    }

    pendingFeedRestoreState = { ...snapshot };
    pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
    const applied = applyFeedViewportStateSnapshot(snapshot);
    if (!applied) return false;
    scheduleFeedViewportRestoreStabilization(snapshot);
    if (isFeedViewportRestoreSatisfied(snapshot)) {
      if (!isMobileChatViewport()) {
        pendingFeedRestoreState = null;
        pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
      }
    }
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

    const localUnreadCount = getUnreadAgentCount(entries);
    const pendingCount = Math.max(0, Number(pendingFeedNewCount || 0));
    const isOpen = overlay.classList.contains("is-open");
    if (isOpen) {
      unreadServerTotal = localUnreadCount;
      unreadStatePrimed = true;
    }
    const serverUnreadCount = Math.max(0, Number(unreadServerTotal || 0));
    const unreadCount = unreadStatePrimed ? serverUnreadCount : localUnreadCount;
    const displayCount = isOpen ? pendingCount : unreadCount;

    if (displayCount <= 0) {
      badge.textContent = "";
      badge.classList.add("hidden");
      openBtn.removeAttribute("data-unread-count");
      return;
    }

    const value = displayCount > 99 ? "99+" : String(displayCount);
    badge.textContent = value;
    badge.classList.remove("hidden");
    openBtn.setAttribute("data-unread-count", value);
  }

  function isChatTabActiveForRead() {
    if (typeof document === "undefined") return true;
    if (document.visibilityState && document.visibilityState !== "visible") return false;
    return true;
  }

  function isTabForegroundActive() {
    if (!isChatTabActiveForRead()) return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return true;
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
    if (!("Notification" in window)) return Promise.resolve("unsupported");
    if (Notification.permission !== "default") {
      return Promise.resolve(String(Notification.permission || "default"));
    }
    try {
      const result = Notification.requestPermission();
      if (result && typeof result.then === "function") {
        return result
          .then(function (permission) {
            return String(permission || Notification.permission || "default");
          })
          .catch(function () {
            return String(Notification.permission || "default");
          });
      }
    } catch {}
    return Promise.resolve(String(Notification.permission || "default"));
  }

  function shouldOfferNotificationPermissionPrompt() {
    if (notificationPermissionPromptShownInSession) return false;
    if (!overlay.classList.contains("is-open")) return false;
    if (!isWebPushSupported()) return false;
    if (!isWebPushSecureContext()) return false;
    if (!("Notification" in window)) return false;
    return String(Notification.permission || "default") === "default";
  }

  function ensureNotificationPermissionPrompt() {
    if (notificationPermissionPromptEl && notificationPermissionPromptEl.isConnected) {
      return notificationPermissionPromptEl;
    }
    if (!modalBody || !modalBody.isConnected) return null;
    const promptHost = feed && feed.isConnected ? feed : modalBody;
    const node = document.createElement("div");
    node.className = "shop-company-chat-permission-prompt hidden";
    node.setAttribute("aria-live", "polite");
    node.innerHTML =
      '<div class="shop-company-chat-permission-prompt__card">' +
        '<button type="button" class="shop-company-chat-permission-prompt__close" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">' +
          '<i class="fas fa-times"></i>' +
        "</button>" +
        '<div class="shop-company-chat-permission-prompt__text">\u041f\u043e\u043b\u0443\u0447\u0430\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043e \u043d\u043e\u0432\u044b\u0445 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f\u0445 \u0432 \u0447\u0430\u0442\u0435?</div>' +
        '<button type="button" class="shop-company-chat-permission-prompt__allow">\u0414\u0430</button>' +
      "</div>";
    promptHost.appendChild(node);
    notificationPermissionPromptEl = node;

    const closeBtn = node.querySelector(".shop-company-chat-permission-prompt__close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (event) {
        event.preventDefault();
        hideNotificationPermissionPrompt();
      });
    }

    const allowBtn = node.querySelector(".shop-company-chat-permission-prompt__allow");
    if (allowBtn) {
      allowBtn.addEventListener("click", function (event) {
        event.preventDefault();
        requestMessageAlertNotificationPermission()
          .catch(function () { return String(Notification.permission || "default"); })
          .finally(function () {
            hideNotificationPermissionPrompt();
            queueWebPushSubscriptionSync({
              clientId: getActiveChatClientId(),
              force: true,
              immediate: true,
            });
          });
      });
    }

    return node;
  }

  function hideNotificationPermissionPrompt() {
    const prompt = (
      notificationPermissionPromptEl
      && notificationPermissionPromptEl.isConnected
    )
      ? notificationPermissionPromptEl
      : null;
    if (!prompt) return;
    prompt.classList.remove("is-visible");
    prompt.classList.add("hidden");
  }

  function maybeShowNotificationPermissionPrompt() {
    const prompt = ensureNotificationPermissionPrompt();
    if (!prompt) return;
    if (!prompt.classList.contains("hidden")) return;
    if (!shouldOfferNotificationPermissionPrompt()) return;
    notificationPermissionPromptShownInSession = true;
    prompt.classList.remove("hidden");
    requestAnimationFrame(function () {
      prompt.classList.add("is-visible");
    });
  }

  function suppressIncomingAlertsFor(ms) {
    const durationMs = Math.max(0, Number(ms || 0));
    if (!durationMs) return;
    const until = Date.now() + durationMs;
    if (until > suppressIncomingAlertsUntil) {
      suppressIncomingAlertsUntil = until;
    }
  }

  function shouldSuppressIncomingAlertsNow() {
    return Date.now() < suppressIncomingAlertsUntil;
  }

  function unlockMessageAlertsOnce() {
    if (messageAlertUnlockAttempted) return;
    messageAlertUnlockAttempted = true;

    // Preload tenant sound asset without playback to avoid false "incoming" dings on first tap.
    const soundUrl = getTenantMessageSoundUrl();
    if (soundUrl) {
      try {
        const audio = new Audio(soundUrl);
        audio.preload = "auto";
        audio.load();
      } catch {}
    }
    const ctx = ensureMessageAlertAudioContext();
    if (ctx) {
      if (ctx.state === "running") {
        messageAlertAudioUnlocked = true;
      } else {
        ctx.resume()
          .then(function () { messageAlertAudioUnlocked = true; })
          .catch(function () {});
      }
    }
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
          playPromise.catch(function () {
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

    const scheduleTone = function () {
      try {
        const startAt = ctx.currentTime + 0.002;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, startAt);
        master.gain.exponentialRampToValueAtTime(0.06, startAt + 0.012);
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
        gainB.gain.exponentialRampToValueAtTime(0.7, startAt + 0.072);
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
          .then(function () {
            messageAlertAudioUnlocked = true;
            scheduleTone();
          })
          .catch(function () {});
      }
    } catch {}
  }

  function showIncomingMessageBrowserNotification(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      const n = new Notification(String(title || "\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435"), {
        body: String(body || "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0447\u0430\u0442, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u0432\u0435\u0442\u0438\u0442\u044c."),
        silent: false,
      });
      n.onclick = function () {
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

  function maybeNotifyIncomingAgentMessage(entry) {
    if (shouldSuppressIncomingAlertsNow()) return;
    const isOpen = overlay.classList.contains("is-open");
    const tabVisible = isChatTabActiveForRead();
    const tabFocused = typeof document.hasFocus !== "function" || document.hasFocus();
    const tabActive = tabVisible && tabFocused;
    const keepBottom = isOpen ? shouldKeepFeedPinnedToBottom() : false;
    const isMessageVisibleNow = isOpen && tabActive && keepBottom;
    if (isMessageVisibleNow) return;

    const now = Date.now();
    if (now - messageAlertLastAt < CHAT_MESSAGE_ALERT_COOLDOWN_MS) return;
    messageAlertLastAt = now;

    playMessageAlertSound();
    if (!tabActive || !isOpen) {
      if (shouldSuppressLocalBrowserNotification()) return;
      showIncomingMessageBrowserNotification(
        getCompanyAuthorName(),
        getEntryPreviewText(entry) || "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0447\u0430\u0442, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u0432\u0435\u0442\u0438\u0442\u044c."
      );
    }
  }

  function initMessageAlerts() {
    document.addEventListener("click", unlockMessageAlertsOnce, { once: true, passive: true, capture: true });
    document.addEventListener("touchstart", unlockMessageAlertsOnce, { once: true, passive: true, capture: true });
    document.addEventListener("keydown", unlockMessageAlertsOnce, { once: true });
  }

  function isWebPushSupported() {
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
    const safeClientId = String(clientId || "").trim();
    return [safeClientId, endpoint, p256dh, auth].join("|");
  }

  async function getWebPushServiceWorkerRegistration() {
    if (!isWebPushSupported()) return null;
    try {
      const byScope = await navigator.serviceWorker.getRegistration("/");
      if (byScope && byScope.active) return byScope;
      if (byScope) {
        try {
          const ready = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise(function (resolve) { window.setTimeout(function () { resolve(null); }, 2400); }),
          ]);
          return ready || byScope;
        } catch {
          return byScope;
        }
      }
    } catch {}
    try {
      const fallback = await navigator.serviceWorker.getRegistration();
      if (fallback && fallback.active) return fallback;
      if (fallback) return fallback;
    } catch {}
    try {
      const registered = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (registered && registered.active) return registered;
      try {
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise(function (resolve) { window.setTimeout(function () { resolve(null); }, 2600); }),
        ]);
        return ready || registered || null;
      } catch {
        return registered || null;
      }
    } catch {}
    return null;
  }

  async function fetchWebPushPublicKey(options) {
    const opts = options || {};
    if (!opts.forceRefresh && webPushPublicKeyFetched) {
      return webPushPublicKeyCache;
    }
    const json = await chatApiJson(CHAT_TEMP_API_BASE + "/push/public-key");
    const data = json && json.data ? json.data : {};
    const enabled = data.enabled === true;
    const key = enabled ? String(data.public_key || "").trim() : "";
    webPushPublicKeyFetched = true;
    webPushPublicKeyCache = key;
    return webPushPublicKeyCache;
  }

  async function remoteUnsubscribeWebPushByEndpoint(endpoint) {
    const safeEndpoint = String(endpoint || "").trim();
    if (!safeEndpoint) return;
    await chatApiJson(CHAT_TEMP_API_BASE + "/push/unsubscribe", {
      method: "POST",
      body: {
        endpoint: safeEndpoint,
      },
    }).catch(function () {});
  }

  function queueWebPushSubscriptionSync(options) {
    const opts = options || {};
    if (opts.requestPermission === true) webPushSyncRequestedWithPermission = true;
    if (opts.force === true) webPushSyncForceRequested = true;
    const nextClientId = String(opts.clientId || "");
    if (nextClientId) webPushSyncQueuedClientId = nextClientId;

    if (webPushSyncTimer) {
      window.clearTimeout(webPushSyncTimer);
      webPushSyncTimer = 0;
    }
    const delay = opts.immediate === true ? 0 : CHAT_PUSH_SYNC_DEBOUNCE_MS;
    webPushSyncTimer = window.setTimeout(function () {
      webPushSyncTimer = 0;
      const runOptions = {
        requestPermission: webPushSyncRequestedWithPermission === true,
        force: webPushSyncForceRequested === true,
        clientId: String(webPushSyncQueuedClientId || ""),
      };
      webPushSyncRequestedWithPermission = false;
      webPushSyncForceRequested = false;
      webPushSyncQueuedClientId = "";
      syncWebPushSubscription(runOptions).catch(function () {});
    }, delay);
  }

  async function syncWebPushSubscription(options) {
    const opts = options || {};
    const requestClientId = String(opts.clientId || getActiveChatClientId() || "").trim();
    if (!requestClientId) {
      webPushSyncedFingerprint = "";
      return;
    }

    if (!isWebPushSupported()) return;
    if (!isWebPushSecureContext()) return;
    if (webPushSyncInFlight) {
      queueWebPushSubscriptionSync(opts);
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
        try { localStorage.removeItem(webPushVapidStorageKey); } catch {}
        return;
      }

      let permission = String(Notification.permission || "default");
      if (permission === "default" && opts.requestPermission === true) {
        try {
          permission = String(await Notification.requestPermission());
        } catch {
          permission = String(Notification.permission || "default");
        }
      }

      let subscription = await registration.pushManager.getSubscription().catch(function () { return null; });

      if (permission !== "granted") {
        const staleEndpoint = String(subscription && subscription.endpoint || "");
        if (staleEndpoint) {
          await remoteUnsubscribeWebPushByEndpoint(staleEndpoint);
        }
        webPushSyncedFingerprint = "";
        return;
      }

      if (
        subscription
        && (!webPushSubscriptionVapidKey || webPushSubscriptionVapidKey !== publicKey)
      ) {
        const staleEndpoint = String(subscription.endpoint || "");
        try { await subscription.unsubscribe(); } catch {}
        if (staleEndpoint) {
          await remoteUnsubscribeWebPushByEndpoint(staleEndpoint);
        }
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

      const fingerprint = buildWebPushSubscriptionFingerprint(requestClientId, normalizedSubscription);
      if (!opts.force && fingerprint === webPushSyncedFingerprint) {
        webPushSubscriptionVapidKey = publicKey;
        try { localStorage.setItem(webPushVapidStorageKey, publicKey); } catch {}
        return;
      }

      await chatApiJson(CHAT_TEMP_API_BASE + "/push/subscribe", {
        method: "POST",
        body: {
          client_id: Number(requestClientId),
          subscription: normalizedSubscription,
        },
      });
      webPushSyncedFingerprint = fingerprint;
      webPushSubscriptionVapidKey = publicKey;
      try { localStorage.setItem(webPushVapidStorageKey, publicKey); } catch {}
    } catch {
      // noop
    } finally {
      webPushSyncInFlight = false;
    }
  }

  function shouldMarkAgentMessagesRead(options) {
    const opts = options || {};
    if (opts.force === true) return true;
    return overlay.classList.contains("is-open") && isChatTabActiveForRead();
  }

  function applyReadReceiptsToAgentEntries(entries, options) {
    const list = Array.isArray(entries) ? entries : [];
    const shouldMarkRead = shouldMarkAgentMessagesRead(options);
    const nowIso = new Date().toISOString();
    let changed = false;
    const readIds = [];

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
        const messageId = String(entry.id || "");
        entry.read = true;
        entry.deliveryStatus = "read";
        entry.deliveredAt = entry.deliveredAt || nowIso;
        entry.readAt = entry.readAt || nowIso;
        if (messageId) readIds.push(messageId);
        changed = true;
        return;
      }

      if (rawStatus !== "read") {
        entry.deliveryStatus = "read";
        if (!entry.readAt) entry.readAt = nowIso;
        changed = true;
      }
    });

    return { changed, readIds };
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

  function getActiveStoreId() {
    const n = Number(localStorage.getItem("activeStoreId") || "1");
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  const tenantId = getTenantId();
  const customerTokenKey = "shop_customer_token_t" + tenantId;
  const customerCacheKey = "shop_customer_cache_t" + tenantId;
  const guestChatClientKey = "shop_company_chat_guest_id_t" + tenantId;
  const customerChatClientIdByTokenPrefix = "shop_company_chat_customer_id_for_token_t" + tenantId + "_";
  const customerChatClientIdByIdentityPrefix = "shop_company_chat_customer_id_for_identity_t" + tenantId + "_";
  const webPushVapidStorageKey = "shop_company_chat_push_vapid_t" + tenantId;

  function getTenantFromLocalStorage() {
    try {
      const raw = localStorage.getItem("tenant");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function cloneDefaultChatQuickQuestionItems() {
    return DEFAULT_CHAT_QUICK_QUESTION_ITEMS.map(function (item) {
      return {
        id: String(item.id || ""),
        type: item.id === CHAT_QUICK_ORDER_ID ? "order" : "custom",
        question: String(item.question || ""),
        answer: String(item.answer || ""),
        enabled: item.enabled !== false,
      };
    });
  }

  function normalizeChatQuickQuestionText(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function normalizeChatQuickQuestionAnswer(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/\s+\n/g, "\n")
      .trim()
      .slice(0, 1200);
  }

  function normalizeChatQuickQuestionEnabled(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback !== false;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback !== false;
    if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;
    if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric !== 0;
    return fallback !== false;
  }

  function normalizeChatQuickQuestionId(value, index) {
    const source = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 48);
    if (source && source !== CHAT_QUICK_ORDER_ID) return source;
    return "custom-" + String(index + 1);
  }

  function isOrderQuickQuestionLike(value) {
    const normalized = normalizeHotQuestionKey(value);
    if (!normalized) return false;
    return normalized.includes(HOT_QUESTION_ORDER_KEY) || normalized.includes(HOT_QUESTION_ORDER_KEY_ALT);
  }

  function normalizeChatQuickQuestionConfigList(rawValue) {
    let parsed = [];
    if (Array.isArray(rawValue)) {
      parsed = rawValue;
    } else if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        parsed = [];
      } else {
        try {
          const next = JSON.parse(trimmed);
          parsed = Array.isArray(next) ? next : [];
        } catch {
          parsed = [];
        }
      }
    } else if (rawValue && typeof rawValue === "object" && Array.isArray(rawValue.items)) {
      parsed = rawValue.items;
    }

    if (!parsed.length) return cloneDefaultChatQuickQuestionItems();

    const maxCustomItems = Math.max(0, CHAT_QUICK_QUESTIONS_MAX - 1);
    const customCandidates = [];
    let orderEnabled = true;
    let orderDefined = false;

    parsed.forEach(function (item, index) {
      if (customCandidates.length >= maxCustomItems) return;

      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        const question = normalizeChatQuickQuestionText(item);
        if (!question) return;
        if (index === 0 && isOrderQuickQuestionLike(question)) {
          orderDefined = true;
          orderEnabled = true;
          return;
        }
        customCandidates.push({
          id: "",
          question: question,
          answer: "",
          enabled: true,
        });
        return;
      }

      if (!item || typeof item !== "object") return;
      const source = item;
      const question = normalizeChatQuickQuestionText(
        source.question ?? source.label ?? source.title ?? source.text ?? ""
      );
      const rawId = String(source.id ?? source.key ?? source.code ?? "").trim();
      const rawType = String(source.type ?? "").trim().toLowerCase();
      const isOrder = (
        rawId === CHAT_QUICK_ORDER_ID
        || rawType === CHAT_QUICK_ORDER_ID
        || normalizeChatQuickQuestionEnabled(source.is_order, false)
        || (index === 0 && isOrderQuickQuestionLike(question))
      );

      if (isOrder) {
        orderDefined = true;
        orderEnabled = normalizeChatQuickQuestionEnabled(
          source.enabled ?? source.is_enabled ?? source.active,
          true
        );
        return;
      }

      if (!question) return;
      let answer = normalizeChatQuickQuestionAnswer(
        source.answer ?? source.reply ?? source.response ?? source.message ?? ""
      );
      customCandidates.push({
        id: rawId,
        question: question,
        answer: answer,
        enabled: normalizeChatQuickQuestionEnabled(
          source.enabled ?? source.is_enabled ?? source.active,
          true
        ),
      });
    });

    const usedIds = new Set([CHAT_QUICK_ORDER_ID]);
    const customItems = [];
    customCandidates.slice(0, maxCustomItems).forEach(function (item, index) {
      let id = normalizeChatQuickQuestionId(item.id, index);
      if (usedIds.has(id)) {
        let seq = index + 1;
        while (usedIds.has("custom-" + String(seq))) seq += 1;
        id = "custom-" + String(seq);
      }
      usedIds.add(id);
      customItems.push({
        id: id,
        type: "custom",
        question: normalizeChatQuickQuestionText(item.question),
        answer: normalizeChatQuickQuestionAnswer(item.answer),
        enabled: item.enabled !== false,
      });
    });

    return [
      {
        id: CHAT_QUICK_ORDER_ID,
        type: "order",
        question: CHAT_QUICK_ORDER_QUESTION,
        answer: "",
        enabled: orderDefined ? orderEnabled !== false : true,
      },
      ...customItems,
    ];
  }

  function buildEnabledQuickQuestions(configList) {
    return (Array.isArray(configList) ? configList : [])
      .filter(function (item) { return item && item.enabled !== false; })
      .map(function (item) { return normalizeChatQuickQuestionText(item.question); })
      .filter(Boolean)
      .slice(0, CHAT_QUICK_QUESTIONS_MAX);
  }

  function applyAliasSet(setRef, values) {
    setRef.clear();
    values.forEach(function (value) {
      const text = String(value || "");
      if (!text) return;
      setRef.add(text);
    });
  }

  function rebuildHotQuestionAliases() {
    const quickConfig = Array.isArray(chatRuntimeSettings.quickQuestionsConfig)
      ? chatRuntimeSettings.quickQuestionsConfig
      : cloneDefaultChatQuickQuestionItems();
    const orderItem = quickConfig.find(function (item) {
      if (!item || item.enabled === false) return false;
      const id = String(item.id || "").toLowerCase();
      const type = String(item.type || "").toLowerCase();
      return id === CHAT_QUICK_ORDER_ID || type === "order";
    });
    const orderAliases = [HOT_QUESTION_ORDER_KEY, HOT_QUESTION_ORDER_KEY_ALT];

    const addNormalizedAlias = function (target, value) {
      const normalized = normalizeHotQuestionKey(value);
      if (!normalized) return;
      target.push(normalized);
    };

    addNormalizedAlias(orderAliases, CHAT_QUICK_ORDER_QUESTION);
    if (orderItem) addNormalizedAlias(orderAliases, orderItem.question);

    applyAliasSet(hotQuestionAliases.order, orderAliases);
  }

  function normalizeAssistantGenderValue(rawValue) {
    const normalized = String(rawValue == null ? "" : rawValue).trim().toLowerCase();
    if (normalized === CHAT_ASSISTANT_GENDER_FEMALE || normalized === "female" || normalized === "\u0436") {
      return CHAT_ASSISTANT_GENDER_FEMALE;
    }
    return DEFAULT_CHAT_ASSISTANT_GENDER;
  }

  function getDefaultChatWelcomeMessageByGender(rawGender) {
    return normalizeAssistantGenderValue(rawGender) === CHAT_ASSISTANT_GENDER_FEMALE
      ? DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE
      : DEFAULT_CHAT_WELCOME_MESSAGE;
  }

  function getGenderedAssistantText(maleText, femaleText) {
    if (normalizeAssistantGenderValue(chatRuntimeSettings.assistantGender) === CHAT_ASSISTANT_GENDER_FEMALE) {
      return String(femaleText || maleText || "");
    }
    return String(maleText || "");
  }

  function normalizeTenantChatSettings(rawSettings) {
    const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    const rawEnabledValue =
      source.is_enabled
      ?? source.chat_widget_enabled
      ?? source.chat_enabled;
    const normalizedEnabled = String(rawEnabledValue == null ? "" : rawEnabledValue).trim().toLowerCase();
    const isEnabled = !(
      rawEnabledValue === false
      || rawEnabledValue === 0
      || normalizedEnabled === "0"
      || normalizedEnabled === "false"
    );
    const assistantName = String(
      source.assistant_name ?? source.chat_assistant_name ?? ""
    ).trim() || DEFAULT_CHAT_ASSISTANT_NAME;
    const assistantGender = normalizeAssistantGenderValue(
      source.assistant_gender ?? source.chat_assistant_gender ?? DEFAULT_CHAT_ASSISTANT_GENDER
    );
    const welcomeMessageRaw = String(
      source.welcome_message ?? source.chat_welcome_message ?? ""
    ).trim();
    const welcomeMessage = welcomeMessageRaw || getDefaultChatWelcomeMessageByGender(assistantGender);
    const welcomeEnabledRaw =
      source.welcome_enabled
      ?? source.chat_welcome_enabled;
    const welcomeEnabledNorm = String(welcomeEnabledRaw == null ? "" : welcomeEnabledRaw).trim().toLowerCase();
    const welcomeEnabled = !(
      welcomeEnabledRaw === false
      || welcomeEnabledRaw === 0
      || welcomeEnabledNorm === "0"
      || welcomeEnabledNorm === "false"
    );
    const operatorName = String(
      source.operator_name
      ?? source.chat_operator_name
      ?? source.site_name
      ?? source.name
      ?? ""
    ).trim();
    const quickQuestionsConfig = normalizeChatQuickQuestionConfigList(
      source.quick_questions_config
      ?? source.quick_questions
      ?? source.chat_quick_questions_json
    );
    const quickQuestions = buildEnabledQuickQuestions(quickQuestionsConfig);
    const quickQuestionsEnabledRaw =
      source.quick_questions_enabled
      ?? source.chat_quick_questions_enabled;
    const quickQuestionsEnabledNorm = String(quickQuestionsEnabledRaw == null ? "" : quickQuestionsEnabledRaw).trim().toLowerCase();
    const quickQuestionsEnabled = !(
      quickQuestionsEnabledRaw === false
      || quickQuestionsEnabledRaw === 0
      || quickQuestionsEnabledNorm === "0"
      || quickQuestionsEnabledNorm === "false"
    );
    return {
      assistantName: assistantName,
      assistantGender: assistantGender,
      welcomeMessage: welcomeMessage,
      welcomeEnabled: welcomeEnabled,
      optionsText: DEFAULT_CHAT_OPTIONS_TEXT,
      quickQuestions: quickQuestions,
      quickQuestionsConfig: quickQuestionsConfig,
      quickQuestionsEnabled: quickQuestionsEnabled,
      operatorName: operatorName,
      isEnabled: isEnabled,
    };
  }

  let chatRuntimeSettingsSyncAt = 0;
  let chatRuntimeSettingsSyncInFlight = false;
  const CHAT_SETTINGS_SYNC_MIN_INTERVAL_MS = 2500;

  function syncRuntimeDecoratedEntries(list) {
    const entries = Array.isArray(list) ? list : [];
    entries.forEach(function (entry) {
      if (!entry || entry.type !== "message" || entry.role !== "agent") return;
      const messageId = String(entry.id || "");
      if (isAssistantMessageId(messageId)) {
        entry.author = String(chatRuntimeSettings.assistantName || DEFAULT_CHAT_ASSISTANT_NAME);
        if (/^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(messageId)) {
          entry.text = String(
            chatRuntimeSettings.welcomeMessage
            || getDefaultChatWelcomeMessageByGender(chatRuntimeSettings.assistantGender)
          );
        }
      } else {
        entry.author = getCompanyAuthorName();
      }
    });
  }

  function refreshChatRuntimeDecoratedView() {
    syncRuntimeDecoratedEntries(baseEntries);
    syncRuntimeDecoratedEntries(liveEntries);
    renderThread();
    updateScrollDownButton();
    renderUnreadBadge(liveEntries);
  }

  function applyChatWidgetEnabledState(isEnabled) {
    const enabled = isEnabled !== false;
    openBtn.classList.toggle("hidden", !enabled);
    if (enabled) {
      openBtn.removeAttribute("aria-hidden");
      openBtn.removeAttribute("tabindex");
      if (!overlay.classList.contains("is-open")) {
        startUnreadPolling();
      }
      return;
    }
    openBtn.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("tabindex", "-1");
    openBtn.removeAttribute("data-unread-count");
    if (unreadBadge) {
      unreadBadge.textContent = "";
      unreadBadge.classList.add("hidden");
    }
    if (overlay.classList.contains("is-open")) {
      closeCompanyChat();
    }
    stopSharedThreadPolling();
    stopUnreadPolling();
  }

  function applyChatRuntimeSettings(rawSettings, options) {
    const opts = options || {};
    const prevStateKey = [
      String(chatRuntimeSettings.assistantName || ""),
      String(chatRuntimeSettings.assistantGender || ""),
      String(chatRuntimeSettings.welcomeMessage || ""),
      String(chatRuntimeSettings.welcomeEnabled !== false ? "1" : "0"),
      String(chatRuntimeSettings.optionsText || ""),
      String(chatRuntimeSettings.operatorName || ""),
      JSON.stringify(chatRuntimeSettings.quickQuestions || []),
      JSON.stringify(chatRuntimeSettings.quickQuestionsConfig || []),
      String(chatRuntimeSettings.quickQuestionsEnabled !== false ? "1" : "0"),
      String(chatRuntimeSettings.isEnabled !== false ? "1" : "0"),
    ].join("|");

    const next = normalizeTenantChatSettings(rawSettings);
    chatRuntimeSettings.assistantName = next.assistantName;
    chatRuntimeSettings.assistantGender = normalizeAssistantGenderValue(next.assistantGender);
    chatRuntimeSettings.welcomeMessage = next.welcomeMessage;
    chatRuntimeSettings.welcomeEnabled = next.welcomeEnabled !== false;
    chatRuntimeSettings.optionsText = next.optionsText;
    chatRuntimeSettings.quickQuestions = next.quickQuestions.slice();
    chatRuntimeSettings.quickQuestionsConfig = Array.isArray(next.quickQuestionsConfig)
      ? next.quickQuestionsConfig.slice()
      : cloneDefaultChatQuickQuestionItems();
    chatRuntimeSettings.quickQuestionsEnabled = next.quickQuestionsEnabled !== false;
    chatRuntimeSettings.operatorName = next.operatorName;
    chatRuntimeSettings.isEnabled = next.isEnabled !== false;
    rebuildHotQuestionAliases();
    applyChatWidgetEnabledState(chatRuntimeSettings.isEnabled);

    const nextStateKey = [
      String(chatRuntimeSettings.assistantName || ""),
      String(chatRuntimeSettings.assistantGender || ""),
      String(chatRuntimeSettings.welcomeMessage || ""),
      String(chatRuntimeSettings.welcomeEnabled !== false ? "1" : "0"),
      String(chatRuntimeSettings.optionsText || ""),
      String(chatRuntimeSettings.operatorName || ""),
      JSON.stringify(chatRuntimeSettings.quickQuestions || []),
      JSON.stringify(chatRuntimeSettings.quickQuestionsConfig || []),
      String(chatRuntimeSettings.quickQuestionsEnabled !== false ? "1" : "0"),
      String(chatRuntimeSettings.isEnabled !== false ? "1" : "0"),
    ].join("|");
    if (opts.refreshUi === true && prevStateKey !== nextStateKey) {
      refreshChatRuntimeDecoratedView();
    }
    return next;
  }

  function getLocalTenantChatSettings() {
    const tenant = getTenantFromLocalStorage();
    if (!tenant || typeof tenant !== "object") return null;
    return {
      chat_assistant_name: tenant.chat_assistant_name,
      chat_assistant_gender: tenant.chat_assistant_gender,
      chat_welcome_message: tenant.chat_welcome_message,
      chat_welcome_enabled: tenant.chat_welcome_enabled,
      chat_operator_name: tenant.chat_operator_name,
      chat_quick_questions_json: tenant.chat_quick_questions_json,
      chat_quick_questions_enabled: tenant.chat_quick_questions_enabled,
      quick_questions_config: tenant.quick_questions_config,
      chat_widget_enabled: tenant.chat_widget_enabled,
      site_name: tenant.site_name,
      name: tenant.name,
    };
  }

  async function fetchTenantChatSettingsFromApi() {
    const qs = new URLSearchParams({
      tenant_id: String(tenantId),
      _ts: String(Date.now()),
    });
    const json = await chatApiJson(CHAT_SETTINGS_API_URL + "?" + qs.toString());
    return json && json.settings ? json.settings : null;
  }

  async function initChatRuntimeSettings(options) {
    const opts = options && typeof options === "object" ? options : {};
    const refreshUi = opts.refreshUi === true;
    const fetchRemote = opts.fetchRemote !== false;
    const forceRemote = opts.force === true;

    applyChatRuntimeSettings(getLocalTenantChatSettings(), { refreshUi: refreshUi });
    if (!fetchRemote) return;

    const now = Date.now();
    if (
      !forceRemote
      && chatRuntimeSettingsSyncAt
      && (now - chatRuntimeSettingsSyncAt) < CHAT_SETTINGS_SYNC_MIN_INTERVAL_MS
    ) {
      return;
    }
    if (chatRuntimeSettingsSyncInFlight) return;

    chatRuntimeSettingsSyncInFlight = true;
    try {
      const remoteSettings = await fetchTenantChatSettingsFromApi();
      if (remoteSettings) applyChatRuntimeSettings(remoteSettings, { refreshUi: refreshUi });
    } catch {
      // fallback to local/default settings
    } finally {
      chatRuntimeSettingsSyncAt = Date.now();
      chatRuntimeSettingsSyncInFlight = false;
    }
  }

  rebuildHotQuestionAliases();

  try {
    webPushSubscriptionVapidKey = String(localStorage.getItem(webPushVapidStorageKey) || "");
  } catch {
    webPushSubscriptionVapidKey = "";
  }

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

  function normalizePhoneIdentity(value) {
    const digits = String(value || "").replace(/\D+/g, "");
    return digits.length >= 10 ? digits : "";
  }

  function normalizeNameIdentity(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u0451/g, "\u0435")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isGuestLikeName(value) {
    const normalized = normalizeNameIdentity(value);
    if (!normalized) return false;
    return /^\u0433\u043e\u0441\u0442\u044c\b/.test(normalized);
  }

  function getStableCustomerChatClientId(token, directIdCandidate, customerCandidate) {
    const tokenHash = hashToStableInt(token);
    const mappingKey = customerChatClientIdByTokenPrefix + String(tokenHash);
    const directId = Number(directIdCandidate || 0);
    const customer = customerCandidate && typeof customerCandidate === "object"
      ? customerCandidate
      : null;
    const identityPhone = normalizePhoneIdentity(customer && customer.phone);
    const identityKey = identityPhone
      ? (customerChatClientIdByIdentityPrefix + String(hashToStableInt(identityPhone)))
      : "";
    let storedToken = 0;
    let storedIdentity = 0;

    try {
      storedToken = Number(localStorage.getItem(mappingKey) || 0);
    } catch {}
    if (identityKey) {
      try {
        storedIdentity = Number(localStorage.getItem(identityKey) || 0);
      } catch {}
    }

    let resolved = 0;
    if (Number.isFinite(directId) && directId > 0) {
      resolved = Math.trunc(directId);
    } else if (Number.isFinite(storedIdentity) && storedIdentity > 0) {
      resolved = Math.trunc(storedIdentity);
    } else if (Number.isFinite(storedToken) && storedToken > 0) {
      resolved = Math.trunc(storedToken);
    } else {
      const identityHash = identityPhone ? hashToStableInt(identityPhone) : tokenHash;
      resolved = Math.trunc(800000000 + (identityHash % 99999999));
    }

    try { localStorage.setItem(mappingKey, String(resolved)); } catch {}
    if (identityKey) {
      try { localStorage.setItem(identityKey, String(resolved)); } catch {}
    }
    return resolved;
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
      const stableCustomerId = getStableCustomerChatClientId(token, directId, customer);
      return {
        id: Math.trunc(stableCustomerId),
        name: String((customer && customer.name) || "\u041a\u043b\u0438\u0435\u043d\u0442"),
        phone: String((customer && customer.phone) || ""),
        isGuest: false,
      };
    }

    const guestId = ensureGuestChatClientId(opts.forceNewGuest === true);
    return {
      id: Math.trunc(guestId),
      name: "\u0413\u043e\u0441\u0442\u044c",
      phone: "",
      isGuest: true,
    };
  }

  function buildLocalHiddenMessagesKey(clientId) {
    const id = Number(clientId);
    const safeId = Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0;
    return "shop_company_chat_hidden_messages_t" + tenantId + "_c" + String(safeId);
  }

  function buildFeedScrollTopStorageKey(clientId) {
    const id = Number(clientId);
    const safeId = Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0;
    return "shop_company_chat_feed_scroll_t" + tenantId + "_c" + String(safeId);
  }

  function normalizeFeedViewportState(rawState) {
    if (!rawState || typeof rawState !== "object") return null;
    const top = normalizePersistedFeedTop(Number(rawState.top));
    if (!Number.isFinite(top) || top < 0) return null;
    return {
      top: top,
      anchorId: String(rawState.anchorId || ""),
      anchorOffset: Number(rawState.anchorOffset) || 0,
    };
  }

  function loadPersistedFeedViewportState(clientId) {
    const key = buildFeedScrollTopStorageKey(clientId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsedObj = JSON.parse(raw);
      const normalizedObj = normalizeFeedViewportState(parsedObj);
      if (normalizedObj) return normalizedObj;
    } catch {
      // noop
    }
    try {
      const rawNumber = Number(localStorage.getItem(key));
      if (!Number.isFinite(rawNumber) || rawNumber < 0) return null;
      return {
        top: rawNumber,
        anchorId: "",
        anchorOffset: 0,
      };
    } catch {
      return null;
    }
  }

  function savePersistedFeedViewportState(clientId, snapshot) {
    const key = buildFeedScrollTopStorageKey(clientId);
    const normalized = normalizeFeedViewportState(snapshot);
    if (!normalized) return;
    try { localStorage.setItem(key, JSON.stringify(normalized)); } catch {}
  }

  function persistFeedScrollPositionSnapshot(clientId) {
    const activeId = String(clientId || getActiveChatClientId() || "");
    if (!activeId) return;
    let snapshot = normalizeFeedViewportState(lastFeedViewportState);
    if (!snapshot) snapshot = getFeedViewportStateSnapshot();
    if (!snapshot) return;
    lastFeedViewportState = snapshot;
    lastFeedScrollTop = Number(snapshot.top);
    savePersistedFeedViewportState(activeId, snapshot);
  }

  function normalizeChatClientProfile(profile) {
    const source = profile && typeof profile === "object" ? profile : {};
    const id = Number(source.id);
    return {
      id: Number.isFinite(id) && id > 0 ? Math.trunc(id) : 0,
      name: String(source.name || "\u041a\u043b\u0438\u0435\u043d\u0442"),
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
  lastFeedViewportState = loadPersistedFeedViewportState(chatClientProfile.id);
  lastFeedScrollTop = Number(lastFeedViewportState && lastFeedViewportState.top);
  let sharedThreadMeta = {
    name: String(chatClientProfile.name || "\u041a\u043b\u0438\u0435\u043d\u0442"),
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
      const profileNameChanged = normalizeNameIdentity(currentProfile.name) !== normalizeNameIdentity(nextProfile.name);
      const profilePhoneChanged = normalizePhoneIdentity(currentProfile.phone) !== normalizePhoneIdentity(nextProfile.phone);
      if (profileNameChanged || profilePhoneChanged) {
        sharedThreadMeta = sanitizeSharedThreadMeta({
          ...sharedThreadMeta,
          name: String(nextProfile.name || sharedThreadMeta.name || ""),
          phone: String(nextProfile.phone || sharedThreadMeta.phone || ""),
        });
        if (nextProfile.isGuest !== true) {
          const nextMetaSnapshot = sanitizeSharedThreadMeta(sharedThreadMeta);
          enqueueSharedMutation(function () {
            return remotePatchSharedMeta({
              name: String(nextMetaSnapshot.name || ""),
              phone: String(nextMetaSnapshot.phone || ""),
              lastWelcomeDay: String(nextMetaSnapshot.lastWelcomeDay || ""),
            });
          });
        }
      }
      queueWebPushSubscriptionSync({
        clientId: String(nextProfile.id || ""),
      });
      return false;
    }

    const shouldMergeGuestIntoCustomer = (
      currentProfile.isGuest === true
      && nextProfile.isGuest === false
      && Number(currentProfile.id) > 0
      && Number(nextProfile.id) > 0
      && Number(currentProfile.id) !== Number(nextProfile.id)
    );
    const currentPhoneIdentity = normalizePhoneIdentity(currentProfile.phone);
    const nextPhoneIdentity = normalizePhoneIdentity(nextProfile.phone);
    const shouldMergeCustomerAliasIntoCustomer = (
      currentProfile.isGuest === false
      && nextProfile.isGuest === false
      && Number(currentProfile.id) > 0
      && Number(nextProfile.id) > 0
      && Number(currentProfile.id) !== Number(nextProfile.id)
      && !!currentPhoneIdentity
      && currentPhoneIdentity === nextPhoneIdentity
    );

    stopLocalTypingSession({ flush: true });
    clearPeerTypingHideTimer();
    peerTypingState = { active: false, text: "", updatedAt: "", expiresAt: "" };
    peerTypingUpdatedAt = "";
    renderTypingIndicator();

    chatClientProfile = nextProfile;
    localHiddenMessagesKey = buildLocalHiddenMessagesKey(chatClientProfile.id);
    localHiddenMessageIds = loadLocalHiddenMessageIds();

    sharedThreadUpdatedAt = "";
    sharedThreadMutationVersion = 0;
    hasLoadedSharedThreadOnce = false;
    sharedHistoryHasMore = false;
    sharedHistoryNextBeforeId = null;
    sharedHistoryLoading = false;
    pendingFeedRestoreState = null;
    pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
    sharedPullInFlight = false;
    sharedMutationQueue = Promise.resolve();
    sharedMutationPendingCount = 0;
    unreadServerTotal = 0;
    unreadServerRevision = 0;
    unreadServerUpdatedAt = "";
    unreadStatePrimed = false;
    lastFeedViewportState = loadPersistedFeedViewportState(nextProfile.id);
    lastFeedScrollTop = Number(lastFeedViewportState && lastFeedViewportState.top);
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
      name: String(chatClientProfile.name || "\u041a\u043b\u0438\u0435\u043d\u0442"),
      phone: String(chatClientProfile.phone || ""),
      lastWelcomeDay: "",
    };

    renderThread();
    updateScrollDownButton();
    renderUnreadBadge(liveEntries);

    const activeClientIdAfterSwitch = String(chatClientProfile.id || "");
    queueWebPushSubscriptionSync({
      clientId: activeClientIdAfterSwitch,
      force: true,
      immediate: true,
    });
    const continueWithPull = function () {
      if (opts.pull === false) return;
      if (String(chatClientProfile.id || "") !== activeClientIdAfterSwitch) return;
      pullSharedThreadFromServer({ force: true }).catch(function () {});
    };
    const syncProfileMetaWithServer = function () {
      if (nextProfile.isGuest === true) return Promise.resolve();
      if (String(chatClientProfile.id || "") !== activeClientIdAfterSwitch) return Promise.resolve();
      sharedThreadMeta = sanitizeSharedThreadMeta({
        ...sharedThreadMeta,
        name: String(nextProfile.name || sharedThreadMeta.name || ""),
        phone: String(nextProfile.phone || sharedThreadMeta.phone || ""),
      });
      const syncMetaSnapshot = sanitizeSharedThreadMeta(sharedThreadMeta);
      return enqueueSharedMutation(function () {
        if (String(chatClientProfile.id || "") !== activeClientIdAfterSwitch) return Promise.resolve();
        return remotePatchSharedMeta({
          name: String(syncMetaSnapshot.name || ""),
          phone: String(syncMetaSnapshot.phone || ""),
          lastWelcomeDay: String(syncMetaSnapshot.lastWelcomeDay || ""),
        });
      });
    };
    const finalizeProfileSwitch = function () {
      syncProfileMetaWithServer()
        .catch(function () {})
        .finally(function () {
          continueWithPull();
        });
    };

    if (shouldMergeGuestIntoCustomer || shouldMergeCustomerAliasIntoCustomer) {
      profileMergeInFlight = true;
      mergeGuestThreadIntoCustomerThread(currentProfile.id, nextProfile.id)
        .catch(function () {})
        .finally(function () {
          profileMergeInFlight = false;
          finalizeProfileSwitch();
        });
    } else {
      finalizeProfileSwitch();
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

  async function chatApiJson(url, opts) {
    const options = opts || {};
    const isFormDataBody = (
      typeof FormData !== "undefined"
      && options.body instanceof FormData
    );
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": String(getActiveStoreId()),
      "x-chat-actor": "in",
      ...(options.body && !isFormDataBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const requestUrl = withChatActorQuery(url, "in");
    const customerToken = getCustomerToken();
    if (customerToken) headers["x-customer-token"] = customerToken;

    const res = await fetch(requestUrl, {
      method: options.method || "GET",
      headers: headers,
      keepalive: options.keepalive === true,
      signal: options.signal,
      body: options.body
        ? (isFormDataBody ? options.body : JSON.stringify(options.body))
        : undefined,
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

    if (diffDays === 0) return "\u0421\u0435\u0433\u043e\u0434\u043d\u044f";
    if (diffDays === -1) return "\u0412\u0447\u0435\u0440\u0430";

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

  function getCompanyAuthorName() {
    const configured = String(chatRuntimeSettings.operatorName || "").trim();
    if (configured) return configured;
    try {
      const tenant = getTenantFromLocalStorage();
      if (tenant) {
        const preferred = String(tenant.chat_operator_name || "").trim();
        if (preferred) return preferred;
        const name = String(
          (tenant && (tenant.site_name || tenant.name || tenant.brand_name)) || ""
        ).trim();
        if (name) return name;
      }
    } catch {}
    return "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f";
  }

  function isAssistantMessageId(messageId) {
    const id = String(messageId || "");
    if (!id) return false;
    if (id.indexOf(ASSISTANT_MESSAGE_ID_PREFIX) === 0) return true;
    if (/^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
    if (/^daily-welcome-options-\d{4}-\d{2}-\d{2}$/.test(id)) return true;
    return false;
  }

  function makeAssistantMessageId(suffix) {
    const tail = String(suffix || "msg").replace(/[^\w-]+/g, "").slice(0, 80) || "msg";
    return ASSISTANT_MESSAGE_ID_PREFIX + tail + "-" + Date.now() + "-"
      + Math.random().toString(36).slice(2, 7);
  }

  function resolveAgentAuthorNameByMessageId(messageId) {
    return isAssistantMessageId(messageId)
      ? String(chatRuntimeSettings.assistantName || DEFAULT_CHAT_ASSISTANT_NAME)
      : getCompanyAuthorName();
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
      time: formatTimeFromIso(createdAt) + (editedAt ? " \u00b7 \u0438\u0437\u043c." : ""),
      text: isDailyWelcome
        ? String(
            chatRuntimeSettings.welcomeMessage
            || getDefaultChatWelcomeMessageByGender(chatRuntimeSettings.assistantGender)
          )
        : String(message.text || ""),
      author: role === "agent" ? resolveAgentAuthorNameByMessageId(messageId) : "",
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
    const profile = chatClientProfile && typeof chatClientProfile === "object"
      ? chatClientProfile
      : null;
    const profileName = String(profile && profile.name || "").trim();
    const profilePhone = String(profile && profile.phone || "").trim();
    const profileIsGuest = !!(profile && profile.isGuest === true);
    const sourceName = String(source.name || "").trim();
    const sourcePhone = String(source.phone || "").trim();
    const profilePhoneIdentity = normalizePhoneIdentity(profilePhone);
    const sourcePhoneIdentity = normalizePhoneIdentity(sourcePhone);
    const rawLastWelcomeDay = String(source.last_welcome_day || source.lastWelcomeDay || "").trim();
    const normalizedLastWelcomeDay = /^\d{4}-\d{2}-\d{2}$/.test(rawLastWelcomeDay) ? rawLastWelcomeDay : "";
    const preferProfileName = (
      !profileIsGuest
      && !!profileName
      && (!sourceName || isGuestLikeName(sourceName))
    );
    const preferProfilePhone = (
      !profileIsGuest
      && !!profilePhone
      && (!sourcePhone || sourcePhoneIdentity !== profilePhoneIdentity)
    );
    return {
      name: String(
        preferProfileName
          ? profileName
          : (sourceName || profileName || "\u041a\u043b\u0438\u0435\u043d\u0442")
      ),
      phone: String(
        preferProfilePhone
          ? profilePhone
          : (sourcePhone || profilePhone || "")
      ),
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
            url: String(entry.attachment.url || ""),
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

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
    });
  }

  function isAbortRequestError(err) {
    if (!err) return false;
    if (err.name === "AbortError") return true;
    const message = String(err && err.message || "");
    return /aborted|aborterror/i.test(message);
  }

  function enqueueSharedMutation(mutator) {
    if (typeof mutator !== "function") return Promise.resolve();
    sharedMutationPendingCount += 1;
    sharedMutationQueue = sharedMutationQueue
      .catch(function () {})
      .then(function () { return mutator(); })
      .catch(function (err) { console.error(err); })
      .finally(function () {
        sharedMutationPendingCount = Math.max(0, sharedMutationPendingCount - 1);
      });
    return sharedMutationQueue;
  }

  async function remoteCreateSharedMessage(entry) {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId || !entry) return;
    const payload = mapEntryToSharedMessage(entry);
    if (!payload || !payload.id) return;
    const metaState = sanitizeSharedThreadMeta(sharedThreadMeta);
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/messages",
      {
        method: "POST",
        body: {
          message: payload,
          meta: {
            name: String(metaState.name || "\u041a\u043b\u0438\u0435\u043d\u0442"),
            phone: String(metaState.phone || ""),
            last_welcome_day: String(metaState.lastWelcomeDay || ""),
          },
        },
      }
    );
    const updatedAt = String(json && json.data && json.data.updated_at || "");
    if (updatedAt) sharedThreadUpdatedAt = updatedAt;
  }

  async function remotePatchSharedMessage(messageId, patch) {
    const requestClientId = getActiveChatClientId();
    const id = String(messageId || "").trim();
    if (!requestClientId || !id || !patch || typeof patch !== "object") return;
    const metaState = sanitizeSharedThreadMeta(sharedThreadMeta);
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/messages/" + encodeURIComponent(id),
      {
        method: "PATCH",
        body: {
          patch: patch,
          meta: {
            name: String(metaState.name || "\u041a\u043b\u0438\u0435\u043d\u0442"),
            phone: String(metaState.phone || ""),
            last_welcome_day: String(metaState.lastWelcomeDay || ""),
          },
        },
      }
    );
    const updatedAt = String(json && json.data && json.data.updated_at || "");
    if (updatedAt) sharedThreadUpdatedAt = updatedAt;
  }

  async function remoteDeleteSharedMessage(messageId) {
    const requestClientId = getActiveChatClientId();
    const id = String(messageId || "").trim();
    if (!requestClientId || !id) return;
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/messages/" + encodeURIComponent(id),
      {
        method: "DELETE",
      }
    );
    const updatedAt = String(json && json.data && json.data.updated_at || "");
    if (updatedAt) sharedThreadUpdatedAt = updatedAt;
  }

  async function remotePatchSharedMeta(metaPatch) {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return false;
    const nextMeta = sanitizeSharedThreadMeta(metaPatch);
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/meta",
      {
        method: "PATCH",
        body: {
          meta: {
            name: String(nextMeta.name || ""),
            phone: String(nextMeta.phone || ""),
            last_welcome_day: String(nextMeta.lastWelcomeDay || ""),
          },
        },
      }
    );
    const data = json && json.data ? json.data : {};
    const updatedAt = String(data.updated_at || "");
    if (updatedAt) sharedThreadUpdatedAt = updatedAt;
    if (data.meta && typeof data.meta === "object") {
      sharedThreadMeta = sanitizeSharedThreadMeta(data.meta);
    }
    return true;
  }

  async function remoteMarkSharedMessagesRead(messageIds, options) {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return;
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .map(function (id) { return String(id || "").trim(); })
      .filter(Boolean);
    const opts = options || {};
    const metaState = sanitizeSharedThreadMeta(sharedThreadMeta);
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/messages/read",
      {
        method: "POST",
        keepalive: opts.keepalive === true,
        body: {
          message_ids: ids,
          meta: {
            name: String(metaState.name || "\u041a\u043b\u0438\u0435\u043d\u0442"),
            phone: String(metaState.phone || ""),
            last_welcome_day: String(metaState.lastWelcomeDay || ""),
          },
        },
      }
    );
    const updatedAt = String(json && json.data && json.data.updated_at || "");
    if (updatedAt) sharedThreadUpdatedAt = updatedAt;
  }

  async function uploadSharedImageAttachment(file) {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId || !(file instanceof File)) return null;
    const uploadFile = await convertImageFileToWebpForChatUpload(file);
    const fd = new FormData();
    fd.append("client_id", String(requestClientId));
    fd.append(
      "file",
      uploadFile,
      String(uploadFile && uploadFile.name || toWebpFileName(file.name))
    );
    const json = await chatApiJson(CHAT_TEMP_API_BASE + "/attachment", {
      method: "POST",
      body: fd,
    });
    const attachment = json && json.data ? json.data.attachment : null;
    return isImageAttachment(attachment) ? attachment : null;
  }

  async function waitSharedThreadUpdate(sinceUpdatedAt, typingSinceUpdatedAt, timeoutMs, options) {
    const opts = options || {};
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) {
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
      timeout_ms: String(Math.max(1000, Number(timeoutMs || CHAT_THREAD_WAIT_TIMEOUT_MS))),
      _ts: String(Date.now()),
    });
    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "/wait?" + qs.toString(),
      { signal: opts.signal }
    );
    const data = json && json.data ? json.data : {};
    return {
      changed: data.changed === true,
      updatedAt: String(data.updated_at || ""),
      timeout: data.timeout === true,
      messageChanged: data.message_changed === true,
      typingChanged: data.typing_changed === true,
      typing: data.typing && typeof data.typing === "object" ? data.typing : null,
    };
  }

  function normalizeUnreadSnapshot(payload) {
    const data = payload && typeof payload === "object" ? payload : {};
    const totalRaw = Number(data.unread_total ?? data.total ?? 0);
    const total = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.trunc(totalRaw) : 0;
    const revisionRaw = Number(data.revision || 0);
    const revision = Number.isFinite(revisionRaw) && revisionRaw > 0 ? Math.trunc(revisionRaw) : 0;
    return {
      total: total,
      revision: revision,
      updatedAt: String(data.updated_at || data.updatedAt || ""),
      changed: data.changed === true,
      timeout: data.timeout === true,
    };
  }

  async function fetchUnreadSnapshot(options) {
    const opts = options || {};
    const requestClientId = String(getActiveChatClientId() || "").trim();
    const qs = new URLSearchParams({
      _ts: String(Date.now()),
    });
    if (requestClientId) qs.set("client_id", requestClientId);
    const json = await chatApiJson(CHAT_TEMP_API_BASE + "/unread?" + qs.toString(), {
      signal: opts.signal,
    });
    return normalizeUnreadSnapshot(json && json.data ? json.data : {});
  }

  async function waitUnreadSnapshotChange(options) {
    const opts = options || {};
    const requestClientId = String(getActiveChatClientId() || "").trim();
    const timeoutMs = Math.max(
      1000,
      Number(opts.timeoutMs || opts.timeout || CHAT_UNREAD_WAIT_TIMEOUT_MS)
    );
    const qs = new URLSearchParams({
      since_total: String(Math.max(0, Number(unreadServerTotal || 0))),
      since_revision: String(Math.max(0, Number(unreadServerRevision || 0))),
      timeout_ms: String(timeoutMs),
      _ts: String(Date.now()),
    });
    if (requestClientId) qs.set("client_id", requestClientId);
    const json = await chatApiJson(CHAT_TEMP_API_BASE + "/unread/wait?" + qs.toString(), {
      signal: opts.signal,
    });
    return normalizeUnreadSnapshot(json && json.data ? json.data : {});
  }

  function maybeNotifyUnreadIncrease(previousTotal, nextTotal) {
    const prev = Math.max(0, Number(previousTotal || 0));
    const next = Math.max(0, Number(nextTotal || 0));
    if (!unreadStatePrimed) return;
    if (next <= prev) return;
    if (shouldSuppressIncomingAlertsNow()) return;
    if (overlay.classList.contains("is-open")) return;

    const now = Date.now();
    if (now - messageAlertLastAt < CHAT_MESSAGE_ALERT_COOLDOWN_MS) return;
    messageAlertLastAt = now;
    playMessageAlertSound();

    if (!isTabForegroundActive()) {
      if (shouldSuppressLocalBrowserNotification()) return;
      showIncomingMessageBrowserNotification(
        getCompanyAuthorName(),
        "\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u0447\u0430\u0442, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u0432\u0435\u0442\u0438\u0442\u044c."
      );
    }
  }

  function applyUnreadSnapshot(snapshot, options) {
    const opts = options || {};
    const normalized = normalizeUnreadSnapshot(snapshot || {});
    const prevTotal = Math.max(0, Number(unreadServerTotal || 0));
    unreadServerTotal = normalized.total;
    unreadServerRevision = normalized.revision;
    unreadServerUpdatedAt = normalized.updatedAt;
    if (opts.notify !== false) {
      maybeNotifyUnreadIncrease(prevTotal, normalized.total);
    }
    unreadStatePrimed = true;
    renderUnreadBadge(liveEntries);
    return normalized;
  }

  function mergeSharedEntryLists(olderEntries, newerEntries) {
    const out = [];
    const indexById = new Map();

    const appendEntry = function (entry, replaceExisting) {
      if (!entry || typeof entry !== "object") return;
      const id = String(entry.id || "").trim();
      if (!id) return;
      if (indexById.has(id)) {
        if (replaceExisting === true) {
          out[indexById.get(id)] = entry;
        }
        return;
      }
      indexById.set(id, out.length);
      out.push(entry);
    };

    (Array.isArray(olderEntries) ? olderEntries : []).forEach(function (entry) {
      appendEntry(entry, false);
    });
    (Array.isArray(newerEntries) ? newerEntries : []).forEach(function (entry) {
      appendEntry(entry, true);
    });

    return out;
  }

  function updateSharedHistoryStateFromPage(rawPage) {
    if (!rawPage || typeof rawPage !== "object") return;
    if (Object.prototype.hasOwnProperty.call(rawPage, "hasMore")) {
      sharedHistoryHasMore = rawPage.hasMore === true;
    }
    if (Object.prototype.hasOwnProperty.call(rawPage, "nextBeforeId")) {
      const nextBeforeIdRaw = Number(rawPage.nextBeforeId || 0);
      sharedHistoryNextBeforeId = Number.isFinite(nextBeforeIdRaw) && nextBeforeIdRaw > 0
        ? Math.trunc(nextBeforeIdRaw)
        : null;
    }
  }

  function toSharedThreadPageLimit(rawValue) {
    const n = Number(rawValue);
    if (!Number.isFinite(n) || n <= 0) return CHAT_THREAD_PAGE_SIZE;
    return Math.max(1, Math.min(CHAT_THREAD_PAGE_MAX_SIZE, Math.trunc(n)));
  }

  async function fetchSharedThreadPageFromServer(options) {
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return null;
    const opts = options || {};
    const limit = toSharedThreadPageLimit(opts.limit);
    const beforeIdRaw = Number(opts.beforeId || 0);
    const beforeId = Number.isFinite(beforeIdRaw) && beforeIdRaw > 0 ? Math.trunc(beforeIdRaw) : 0;
    const qs = new URLSearchParams({
      _ts: String(Date.now()),
      limit: String(limit),
    });
    if (beforeId > 0) qs.set("before_id", String(beforeId));

    const json = await chatApiJson(
      CHAT_TEMP_API_BASE + "/thread/" + encodeURIComponent(requestClientId) + "?" + qs.toString()
    );
    if (requestClientId !== getActiveChatClientId()) return null;

    const payload = json && json.data ? json.data : {};
    const page = payload.page && typeof payload.page === "object" ? payload.page : {};
    const nextBeforeIdRaw = Number(page.next_before_id || payload.next_before_id || 0);

    return {
      clientId: requestClientId,
      updatedAt: String(payload.updated_at || ""),
      meta: sanitizeSharedThreadMeta(payload.meta),
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      page: {
        hasMore: page.has_more === true || payload.has_more === true,
        nextBeforeId: Number.isFinite(nextBeforeIdRaw) && nextBeforeIdRaw > 0
          ? Math.trunc(nextBeforeIdRaw)
          : null,
      },
    };
  }

  function applySharedRemoteEntries(mappedEntries, updatedAt, options) {
    const opts = options || {};
    const appendOlder = opts.appendOlder === true;
    const preserveHistory = opts.preserveHistory === true && !appendOlder;
    const incomingEntries = Array.isArray(mappedEntries) ? mappedEntries : [];
    const currentEntries = Array.isArray(liveEntries) ? liveEntries : [];
    const entries = appendOlder
      ? mergeSharedEntryLists(incomingEntries, currentEntries)
      : preserveHistory
        ? mergeSharedEntryLists(currentEntries, incomingEntries)
        : incomingEntries;
    const remoteUpdatedAt = String(updatedAt || "");
    if (appendOlder || !preserveHistory) {
      updateSharedHistoryStateFromPage(opts.page);
    }

    pruneLocalHiddenMessageIds(baseEntries.concat(entries));
    const readReceiptState = applyReadReceiptsToAgentEntries(entries);
    const deliveryStateChanged = !!(readReceiptState && readReceiptState.changed);
    const readChangedIds = Array.isArray(readReceiptState && readReceiptState.readIds)
      ? readReceiptState.readIds
      : [];
    unreadServerTotal = getUnreadAgentCount(entries);
    unreadStatePrimed = true;
    renderUnreadBadge(entries);
    const sameThread = stableSerialize(currentEntries) === stableSerialize(entries);
    const hasPendingLocalSave = sharedMutationPendingCount > 0;
    const localChangedDuringRequest = opts.localChangedDuringRequest === true;
    const remoteIsNewer = compareIsoDates(remoteUpdatedAt, sharedThreadUpdatedAt) > 0;

    if (!opts.force && !sameThread) {
      if (hasPendingLocalSave) return false;
      if (localChangedDuringRequest && !remoteIsNewer) return false;
    }

    if (!opts.force && sameThread && sharedThreadUpdatedAt === remoteUpdatedAt) {
      hasLoadedSharedThreadOnce = true;
      if (readChangedIds.length) {
        enqueueSharedMutation(function () { return remoteMarkSharedMessagesRead(readChangedIds); });
      }
      return false;
    }

    const previousMessageIds = new Set(
      (Array.isArray(liveEntries) ? liveEntries : [])
        .filter(function (entry) { return entry && entry.type === "message"; })
        .map(function (entry) { return String(entry.id || ""); })
        .filter(Boolean)
    );
    const previousLatestAgentCreatedAt = (Array.isArray(liveEntries) ? liveEntries : [])
      .filter(function (entry) { return entry && entry.type === "message" && entry.role === "agent"; })
      .map(function (entry) { return String(entry.createdAt || ""); })
      .filter(Boolean)
      .reduce(function (latest, isoValue) {
        if (!latest) return isoValue;
        return compareIsoDates(isoValue, latest) > 0 ? isoValue : latest;
      }, "");
    const appendedAgentEntries = appendOlder || opts.skipIncomingNotify === true
      ? []
      : entries
        .filter(function (entry) {
          return entry && entry.type === "message" && entry.role === "agent";
        })
        .filter(function (entry) {
          const id = String(entry && entry.id || "");
          return id && !previousMessageIds.has(id);
        });
    const notifiableAgentEntries = appendedAgentEntries.filter(function (entry) {
      if (!entry || !previousLatestAgentCreatedAt) return true;
      const entryCreatedAt = String(entry.createdAt || "");
      if (!entryCreatedAt) return true;
      return compareIsoDates(entryCreatedAt, previousLatestAgentCreatedAt) >= 0;
    });
    const notifiableAgentMessageIds = notifiableAgentEntries
      .map(function (entry) { return String(entry && entry.id || ""); })
      .filter(Boolean);
    const notifiableAgentIdSet = new Set(notifiableAgentMessageIds);
    const latestIncomingAgentEntry = notifiableAgentMessageIds.length
      ? entries
        .slice()
        .reverse()
        .find(function (entry) {
          return entry
            && entry.type === "message"
            && entry.role === "agent"
            && notifiableAgentIdSet.has(String(entry.id || ""));
        }) || null
      : null;

    const prevTop = feed.scrollTop;
    const isChatOpen = overlay.classList.contains("is-open");
    liveEntries = entries;
    sharedThreadUpdatedAt = remoteUpdatedAt;
    renderThread();
    const hasIncomingAgentMessages = hasLoadedSharedThreadOnce && notifiableAgentMessageIds.length > 0;
    if (hasIncomingAgentMessages) {
      applyPeerTypingState(null, { forceInactive: true });
      maybeNotifyIncomingAgentMessage(latestIncomingAgentEntry);
    }
    feed.scrollTop = prevTop;
    tryApplyPendingFeedRestoreState();
    updateScrollDownButton();
    if (isChatOpen && hasIncomingAgentMessages) {
      addPendingFeedMessageIds(notifiableAgentMessageIds);
    }
    hasLoadedSharedThreadOnce = true;
    if (readChangedIds.length) {
      enqueueSharedMutation(function () { return remoteMarkSharedMessagesRead(readChangedIds); });
    }
    return true;
  }

  async function pullSharedThreadFromServer(options) {
    if (profileMergeInFlight) return false;
    if (sharedPullInFlight) return false;
    if (sharedHistoryLoading) return false;
    const localMutationVersionBeforePull = sharedThreadMutationVersion;
    const requestClientId = getActiveChatClientId();
    if (!requestClientId) return false;
    sharedPullInFlight = true;
    try {
      const opts = options || {};
      const snapshot = await fetchSharedThreadPageFromServer({
        limit: opts.limit,
      });
      if (!snapshot || requestClientId !== getActiveChatClientId()) return false;
      const updatedAt = String(snapshot.updatedAt || "");
      const rawSnapshotName = String(snapshot && snapshot.meta && snapshot.meta.name || "").trim();
      const shouldRepairGuestMeta = (
        chatClientProfile
        && chatClientProfile.isGuest !== true
        && (!rawSnapshotName || isGuestLikeName(rawSnapshotName))
      );
      sharedThreadMeta = sanitizeSharedThreadMeta(snapshot.meta);
      if (shouldRepairGuestMeta) {
        const syncMetaSnapshot = sanitizeSharedThreadMeta(sharedThreadMeta);
        enqueueSharedMutation(function () {
          if (String(requestClientId) !== String(getActiveChatClientId() || "")) return Promise.resolve();
          return remotePatchSharedMeta({
            name: String(syncMetaSnapshot.name || ""),
            phone: String(syncMetaSnapshot.phone || ""),
            lastWelcomeDay: String(syncMetaSnapshot.lastWelcomeDay || ""),
          });
        });
      }

      const remoteMessages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
      const mappedEntries = remoteMessages
        .map(mapSharedMessageToEntry)
        .filter(Boolean);
      const localChangedDuringRequest = sharedThreadMutationVersion !== localMutationVersionBeforePull;
      const preserveHistory = opts.preserveHistory !== false && Array.isArray(liveEntries) && liveEntries.length > 0;
      return applySharedRemoteEntries(mappedEntries, updatedAt, {
        ...opts,
        localChangedDuringRequest,
        preserveHistory,
        page: snapshot.page,
      });
    } finally {
      sharedPullInFlight = false;
    }
  }

  async function loadOlderSharedMessagesFromServer(options) {
    if (profileMergeInFlight) return false;
    if (sharedPullInFlight) return false;
    if (sharedHistoryLoading) return false;
    if (sharedHistoryHasMore !== true) return false;

    const beforeId = Number(sharedHistoryNextBeforeId || 0);
    if (!Number.isFinite(beforeId) || beforeId <= 0) return false;

    sharedHistoryLoading = true;
    try {
      const opts = options || {};
      const snapshot = await fetchSharedThreadPageFromServer({
        limit: opts.limit,
        beforeId: beforeId,
      });
      if (!snapshot) return false;
      const mappedEntries = (Array.isArray(snapshot.messages) ? snapshot.messages : [])
        .map(mapSharedMessageToEntry)
        .filter(Boolean);
      sharedThreadMeta = sanitizeSharedThreadMeta(snapshot.meta);
      return applySharedRemoteEntries(mappedEntries, String(snapshot.updatedAt || ""), {
        ...opts,
        appendOlder: true,
        force: true,
        skipIncomingNotify: true,
        page: snapshot.page,
      });
    } finally {
      sharedHistoryLoading = false;
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
    if (sharedThreadWaitLoopStarted) return;
    sharedThreadWaitLoopStarted = true;
    sharedThreadWaitLoopToken += 1;
    const loopToken = sharedThreadWaitLoopToken;

    (async function runSharedThreadWaitLoop() {
      while (sharedThreadWaitLoopStarted && loopToken === sharedThreadWaitLoopToken) {
        if (!overlay.classList.contains("is-open")) {
          await sleepMs(CHAT_THREAD_WAIT_RETRY_MS);
          continue;
        }
        if (!isChatTabActiveForRead()) {
          await sleepMs(CHAT_THREAD_WAIT_RETRY_MS);
          continue;
        }
        refreshChatClientProfileIfNeeded({ pull: false });
        const activeClientId = getActiveChatClientId();
        if (!activeClientId || profileMergeInFlight) {
          await sleepMs(CHAT_THREAD_WAIT_RETRY_MS);
          continue;
        }

        try {
          const knownUpdatedAt = String(sharedThreadUpdatedAt || "");
          const knownTypingUpdatedAt = String(peerTypingUpdatedAt || "");
          const waitAbortController = new AbortController();
          sharedThreadWaitAbortController = waitAbortController;
          const waited = await waitSharedThreadUpdate(
            knownUpdatedAt,
            knownTypingUpdatedAt,
            CHAT_THREAD_WAIT_TIMEOUT_MS,
            { signal: waitAbortController.signal }
          );
          if (sharedThreadWaitAbortController === waitAbortController) {
            sharedThreadWaitAbortController = null;
          }
          if (!sharedThreadWaitLoopStarted || loopToken !== sharedThreadWaitLoopToken) break;
          if (profileMergeInFlight) continue;
          if (String(activeClientId) !== String(getActiveChatClientId())) continue;
          if (waited.typing && typeof waited.typing === "object") {
            applyPeerTypingState(waited.typing);
          }
          const messageChanged = waited.messageChanged === true
            || (
              waited.messageChanged !== false
              && waited.changed === true
              && waited.typingChanged !== true
            )
            || (waited.updatedAt && waited.updatedAt !== knownUpdatedAt);
          const shouldPullThread = messageChanged || (waited.timeout !== true && waited.typingChanged !== true);
          if (shouldPullThread) {
            await pullSharedThreadFromServerIfChanged({ force: true }).catch(function () {});
          }
        } catch (err) {
          if (isAbortRequestError(err)) break;
          await sleepMs(CHAT_THREAD_WAIT_RETRY_MS);
        } finally {
          sharedThreadWaitAbortController = null;
        }
      }
    })().catch(function () {});
  }

  function stopSharedThreadPolling() {
    if (!sharedThreadWaitLoopStarted) return;
    sharedThreadWaitLoopStarted = false;
    sharedThreadWaitLoopToken += 1;
    if (sharedThreadWaitAbortController) {
      try { sharedThreadWaitAbortController.abort(); } catch {}
      sharedThreadWaitAbortController = null;
    }
  }

  function stopUnreadPolling() {
    if (!unreadWaitLoopStarted) return;
    unreadWaitLoopStarted = false;
    unreadWaitLoopToken += 1;
    if (unreadWaitAbortController) {
      try { unreadWaitAbortController.abort(); } catch {}
      unreadWaitAbortController = null;
    }
  }

  function startUnreadPolling() {
    if (!chatRuntimeSettings.isEnabled) return;
    if (overlay.classList.contains("is-open")) return;
    if (unreadWaitLoopStarted) return;
    unreadWaitLoopStarted = true;
    unreadWaitLoopToken += 1;
    const loopToken = unreadWaitLoopToken;

    (async function runUnreadWaitLoop() {
      if (!unreadStatePrimed) {
        try {
          const initialSnapshot = await fetchUnreadSnapshot();
          if (!unreadWaitLoopStarted || loopToken !== unreadWaitLoopToken) return;
          applyUnreadSnapshot(initialSnapshot, { notify: false });
        } catch {}
      }

      while (unreadWaitLoopStarted && loopToken === unreadWaitLoopToken) {
        if (overlay.classList.contains("is-open")) {
          await sleepMs(CHAT_UNREAD_WAIT_RETRY_MS);
          continue;
        }
        try {
          const waitAbortController = new AbortController();
          unreadWaitAbortController = waitAbortController;
          const waited = await waitUnreadSnapshotChange({
            timeoutMs: CHAT_UNREAD_WAIT_TIMEOUT_MS,
            signal: waitAbortController.signal,
          });
          if (unreadWaitAbortController === waitAbortController) {
            unreadWaitAbortController = null;
          }
          if (!unreadWaitLoopStarted || loopToken !== unreadWaitLoopToken) break;
          applyUnreadSnapshot(waited, { notify: true });
        } catch (err) {
          if (isAbortRequestError(err)) break;
          await sleepMs(CHAT_UNREAD_WAIT_RETRY_MS);
        } finally {
          unreadWaitAbortController = null;
        }
      }
    })().catch(function () {});
  }

  function syncVisibleChatReadState(options) {
    const opts = options || {};
    const forceRead = opts.force === true;
    if (!forceRead && !overlay.classList.contains("is-open")) return false;
    if (!forceRead && !isChatTabActiveForRead()) return false;
    const keepBottom = opts.preserveViewport === true ? false : shouldKeepFeedPinnedToBottom();
    const prevTop = feed.scrollTop;
    const readState = applyReadReceiptsToAgentEntries(liveEntries, { force: forceRead });
    const changed = !!(readState && readState.changed);
    const readIds = Array.isArray(readState && readState.readIds) ? readState.readIds : [];
    const immediateRemote = opts.flushRemote === true;
    renderUnreadBadge(liveEntries);
    if (!changed) return false;
    markSharedThreadMutated();
    renderThread();
    if (keepBottom) {
      scrollToBottom(false);
    } else {
      feed.scrollTop = prevTop;
      saveFeedScrollPosition({ force: true });
      updateScrollDownButton();
    }
    if (readIds.length) {
      if (immediateRemote) {
        remoteMarkSharedMessagesRead(readIds, { keepalive: true }).catch(function () {
          enqueueSharedMutation(function () {
            return remoteMarkSharedMessagesRead(readIds);
          });
        });
      } else {
        enqueueSharedMutation(function () {
          return remoteMarkSharedMessagesRead(readIds);
        });
      }
    }
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

  function preloadEmojiAtlas() {
    if (shouldUseNativeMobileEmojiKeyboard()) return;
    if (!EMOJI_ATLAS_ENABLED || emojiAtlasPreloadStarted) return;
    emojiAtlasPreloadStarted = true;
    const img = new Image();
    img.decoding = "async";
    img.src = EMOJI_ATLAS_URL;
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
    if (cls.indexOf("shop-company-chat-emoji-glyph--reaction") !== -1) return 26;
    if (cls.indexOf("shop-company-chat-emoji-glyph--pill") !== -1) return 32;
    if (cls.indexOf("shop-company-chat-emoji-glyph--composer") !== -1) return 30;
    if (cls.indexOf("shop-company-chat-emoji-glyph--picker") !== -1) return 24;
    if (
      cls.indexOf("shop-company-chat-emoji-glyph--input-inline") !== -1
      || cls.indexOf("shop-company-chat-emoji-glyph--preview") !== -1
    ) {
      return null;
    }
    return 24;
  }

  function createEmojiAtlasGlyph(glyphClassName, emojiValue) {
    if (shouldUseNativeMobileEmojiKeyboard()) return null;
    const pos = getEmojiAtlasPosition(emojiValue);
    if (!pos) return null;
    const xPercent = EMOJI_ATLAS_COLUMNS > 1 ? (pos.col / (EMOJI_ATLAS_COLUMNS - 1)) * 100 : 0;
    const yPercent = EMOJI_ATLAS_ROWS > 1 ? (pos.row / (EMOJI_ATLAS_ROWS - 1)) * 100 : 0;

    const glyph = document.createElement("span");
    glyph.className = String(glyphClassName || "");
    glyph.style.backgroundImage = 'url("' + EMOJI_ATLAS_URL + '")';
    glyph.style.backgroundRepeat = "no-repeat";
    glyph.style.backgroundSize = String(EMOJI_ATLAS_COLUMNS * 100) + "% " + String(EMOJI_ATLAS_ROWS * 100) + "%";
    glyph.style.backgroundPosition = String(xPercent) + "% " + String(yPercent) + "%";
    glyph.setAttribute("aria-hidden", "true");
    return glyph;
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
    if (EMOJI_NATIVE_RENDER_ONLY) {
      emojiAssetsState = "fallback";
      return;
    }
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

  function appendNativeEmojiGlyph(host, glyphValue, className) {
    if (!host) return;
    const val = String(glyphValue || "");
    if (!val) return;
    const cls = String(className || "");
    const atlasGlyph = createEmojiAtlasGlyph(cls, val);
    if (!atlasGlyph) {
      host.appendChild(document.createTextNode(val));
      return;
    }
    host.appendChild(atlasGlyph);
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
          appendNativeEmojiGlyph(target, segment, glyphClassName);
          return;
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
    if (!normalized) return "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435";
    if (normalized.length <= 74) return normalized;
    return normalized.slice(0, 74).trimEnd() + "\u2026";
  }

  function getMessageSenderLabel(entry) {
    if (!entry) return "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435";
    if (entry.role === "user") return "\u0412\u044b";
    return String(entry.author || chatRuntimeSettings.assistantName || DEFAULT_CHAT_ASSISTANT_NAME);
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

  function getEntryImageAttachment(entry) {
    if (!entry || typeof entry !== "object") return null;
    return isImageAttachment(entry.attachment) ? entry.attachment : null;
  }

  function getEntryPreviewText(entry) {
    if (!entry || typeof entry !== "object") return "";
    const text = String(entry.text || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    return getEntryImageAttachment(entry) ? "\u0424\u043e\u0442\u043e" : "";
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
      const blob = await fetch(optimized.dataUrl).then(function (res) { return res.blob(); });
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
    if (!isLikelyImageFile(file)) return null;
    return uploadSharedImageAttachment(file).catch(function () { return null; });
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
    attachPreviewObjectUrls.push(objectUrl);
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

    const directFiles = Array.from(dataTransfer.files || []).filter(function (file) {
      return isLikelyImageFile(file);
    });
    if (directFiles.length) return directFiles;

    const itemFiles = [];
    Array.from(dataTransfer.items || []).forEach(function (item) {
      if (!item || item.kind !== "file") return;
      const file = typeof item.getAsFile === "function" ? item.getAsFile() : null;
      if (!isLikelyImageFile(file)) return;
      itemFiles.push(file);
    });
    return itemFiles;
  }

  function setFeedImageDropActive(active) {
    feed.classList.toggle("is-image-drop-target", active === true);
  }

  function resetFeedImageDrop() {
    feedDropDragDepth = 0;
    setFeedImageDropActive(false);
  }

  function initFeedImageDrop() {
    if (feed.dataset.imageDropBound === "1") return;
    feed.dataset.imageDropBound = "1";

    feed.addEventListener("dragenter", function (event) {
      if (!overlay.classList.contains("is-open")) return;
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      feedDropDragDepth = Math.max(0, Number(feedDropDragDepth || 0)) + 1;
      setFeedImageDropActive(true);
    });

    feed.addEventListener("dragover", function (event) {
      if (!overlay.classList.contains("is-open")) return;
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      feedDropDragDepth = Math.max(1, Number(feedDropDragDepth || 0));
      setFeedImageDropActive(true);
    });

    feed.addEventListener("dragleave", function () {
      if (!feed.classList.contains("is-image-drop-target")) return;
      feedDropDragDepth = Math.max(0, Number(feedDropDragDepth || 0) - 1);
      if (feedDropDragDepth === 0) {
        setFeedImageDropActive(false);
      }
    });

    feed.addEventListener("drop", async function (event) {
      const hasFilePayload = dataTransferHasFiles(event.dataTransfer);
      const files = extractImageFilesFromDataTransfer(event.dataTransfer);
      if (!files.length) {
        if (hasFilePayload) event.preventDefault();
        resetFeedImageDrop();
        return;
      }
      event.preventDefault();
      resetFeedImageDrop();
      await openAttachPreviewFromFiles(files).catch(function () {});
    });

    window.addEventListener("blur", function () {
      resetFeedImageDrop();
    });

    window.addEventListener("dragend", function () {
      resetFeedImageDrop();
    });

    document.addEventListener("drop", function (event) {
      if (feed.contains(event.target)) return;
      resetFeedImageDrop();
    });
  }

  function initFeedImagePaste() {
    if (feed.dataset.imagePasteBound !== "1") {
      feed.dataset.imagePasteBound = "1";
      if (!feed.hasAttribute("tabindex")) {
        feed.tabIndex = -1;
      }

      feed.addEventListener("pointerdown", function (event) {
        const target = event.target;
        if (target && target.closest && target.closest("button,a,input,textarea,[contenteditable='true']")) return;
        if (document.activeElement === feed) return;
        try {
          feed.focus({ preventScroll: true });
        } catch {
          feed.focus();
        }
      });

      feed.addEventListener("paste", function (event) {
        if (!overlay.classList.contains("is-open")) return;
        const files = extractImageFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        openAttachPreviewFromFiles(files).catch(function () {});
      });
    }

    if (input.dataset.imagePasteBound !== "1") {
      input.dataset.imagePasteBound = "1";
      input.addEventListener("paste", function (event) {
        if (!overlay.classList.contains("is-open")) return;
        const files = extractImageFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        openAttachPreviewFromFiles(files).catch(function () {});
      });
    }
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

  function lockBackgroundPageScrollForChat() {
    if (chatBodyScrollLockState) return;
    const bodyStyle = document.body.style;
    chatBodyScrollLockY = Math.max(
      0,
      Number(window.pageYOffset || window.scrollY || document.documentElement.scrollTop || 0)
    );
    chatBodyScrollLockState = {
      position: String(bodyStyle.position || ""),
      top: String(bodyStyle.top || ""),
      left: String(bodyStyle.left || ""),
      right: String(bodyStyle.right || ""),
      width: String(bodyStyle.width || ""),
      overflow: String(bodyStyle.overflow || ""),
      overscrollBehavior: String(bodyStyle.overscrollBehavior || ""),
    };

    bodyStyle.position = "fixed";
    bodyStyle.top = "-" + String(chatBodyScrollLockY) + "px";
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";
  }

  function unlockBackgroundPageScrollForChat() {
    if (!chatBodyScrollLockState) return;
    const bodyStyle = document.body.style;
    const savedY = Math.max(0, Number(chatBodyScrollLockY || 0));
    bodyStyle.position = chatBodyScrollLockState.position;
    bodyStyle.top = chatBodyScrollLockState.top;
    bodyStyle.left = chatBodyScrollLockState.left;
    bodyStyle.right = chatBodyScrollLockState.right;
    bodyStyle.width = chatBodyScrollLockState.width;
    bodyStyle.overflow = chatBodyScrollLockState.overflow;
    bodyStyle.overscrollBehavior = chatBodyScrollLockState.overscrollBehavior;
    chatBodyScrollLockState = null;
    chatBodyScrollLockY = 0;
    if (overlay.classList.contains("is-open")) return;
    window.scrollTo(0, savedY);
  }

  function getTenantSplashLogoUrl() {
    try {
      const raw = localStorage.getItem("tenant");
      if (!raw) return "";
      const tenant = JSON.parse(raw);
      return String(
        (tenant && (tenant.logo_light_url || tenant.logo_dark_url)) || ""
      ).trim();
    } catch {
      return "";
    }
  }

  function syncChatBootstrapLoaderLogo() {
    const loader = ensureChatBootstrapLoader();
    if (!loader) return;
    const logoEl = loader.querySelector(".shop-company-chat-bootstrap-loader__logo");
    if (!logoEl) return;
    const logoUrl = getTenantSplashLogoUrl();
    if (logoUrl) {
      logoEl.setAttribute("src", logoUrl);
      logoEl.classList.remove("hidden");
      return;
    }
    logoEl.removeAttribute("src");
    logoEl.classList.add("hidden");
  }

  function ensureChatBootstrapLoader() {
    if (chatBootstrapLoaderEl && chatBootstrapLoaderEl.isConnected) return chatBootstrapLoaderEl;
    if (!feed || !feed.isConnected) return null;
    const node = document.createElement("div");
    node.className = "shop-company-chat-bootstrap-loader hidden";
    node.setAttribute("aria-hidden", "true");
    node.innerHTML =
      '<div class="shop-company-chat-bootstrap-loader__stack">' +
        '<img class="shop-company-chat-bootstrap-loader__logo hidden" alt="" />' +
        '<div class="shop-company-chat-bootstrap-loader__track">' +
          '<div class="shop-company-chat-bootstrap-loader__fill"></div>' +
        "</div>" +
      "</div>";
    feed.appendChild(node);
    chatBootstrapLoaderEl = node;
    syncChatBootstrapLoaderLogo();
    return node;
  }

  function setChatBootstrapLoading(active) {
    const loader = ensureChatBootstrapLoader();
    if (!loader) return;
    const nextActive = active === true;
    if (nextActive) syncChatBootstrapLoaderLogo();
    modalBody.classList.toggle("is-bootstrap-loading", nextActive);
    loader.classList.toggle("hidden", !nextActive);
  }

  var emojiPickerInitialized = false;
  function openCompanyChat() {
    suppressIncomingAlertsFor(1800);
    cancelDeferredClosedFeedPersist();
    preloadEmojiAtlas();
    if (!emojiPickerInitialized) {
      emojiPickerInitialized = true;
      probeEmojiAssetsAvailability();
      normalizeQuickReactionButtons();
      decorateComposerEmojiControls();
      renderEmojiPicker();
      ensureEmojiDatasetLoaded().catch(function () {});
    }
    ensureContextMenu();
    hideChatOrderDetailsView();
    stopUnreadPolling();
    const profileSwitched = refreshChatClientProfileIfNeeded({ pull: true });
    queueWebPushSubscriptionSync({
      clientId: getActiveChatClientId(),
      immediate: true,
    });
    pendingFeedRestoreState = loadPersistedFeedViewportState(getActiveChatClientId());
    pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
    if (!initialized) {
      // Initialize local thread view once before first remote pull.
      if (!Array.isArray(liveEntries) || liveEntries.length <= 0) {
        resetConversation();
      }
      initialized = true;
    }
    closeAttachPreview({ focusComposer: false });
    hideEmojiPopover();
    bindMobileKeyboardViewportSync();
    setMobileKeyboardInset(0);
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("shop-company-chat-open");
    maybeShowNotificationPermissionPrompt();
    lockBackgroundPageScrollForChat();
    scheduleScrollDownComposerExtraOffsetSync();
    scheduleMobileKeyboardInsetSync();
    renderTypingIndicator();
    const showBootstrapLoader = !hasLoadedSharedThreadOnce;
    if (showBootstrapLoader) {
      setChatBootstrapLoading(true);
    }
    requestAnimationFrame(function () {
      const initialPullPromise = profileSwitched
        ? Promise.resolve(false)
        : pullSharedThreadFromServer({ force: true });
      initialPullPromise
        .catch(function () { return false; })
        .finally(function () {
          const welcomeMessage = ensureDailyWelcomeMessage();
          if (welcomeMessage) {
            renderThread();
            enqueueSharedMutation(function () {
              return remoteCreateSharedMessage(welcomeMessage);
            });
          }
          const restored = restoreFeedScrollPosition({ preferPersisted: true });
          if (!restored) {
            scrollToBottom(false, true);
          } else {
            syncPendingFeedCountByViewport();
            updateScrollDownButton();
          }
          if (isMobileChatViewport()) {
            requestAnimationFrame(function () {
              tryApplyPendingFeedRestoreState();
            });
            window.setTimeout(function () {
              tryApplyPendingFeedRestoreState();
            }, 180);
            window.setTimeout(function () {
              tryApplyPendingFeedRestoreState();
            }, 360);
          } else {
            window.setTimeout(function () {
              tryApplyPendingFeedRestoreState();
            }, 0);
            window.setTimeout(function () {
              tryApplyPendingFeedRestoreState();
            }, 220);
          }
          syncComposerRichPreview({});
          if (!shouldUseNativeMobileEmojiKeyboard()) {
            input.focus();
            scheduleMobileKeyboardInsetSyncBurst();
          } else {
            setMobileKeyboardInset(0);
          }
          setChatBootstrapLoading(false);
          startSharedThreadPolling();
          syncVisibleChatReadState({ preserveViewport: true });
        });
    });
  }

  function closeCompanyChat() {
    stopSharedThreadPolling();
    stopLocalTypingSession({ flush: true });
    saveFeedScrollPosition({ persist: true });
    syncVisibleChatReadState({ force: true, flushRemote: true, preserveViewport: true });
    closeAttachPreview({ focusComposer: false });
    hideNotificationPermissionPrompt();
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    hideChatOrderDetailsView();
    if (selectedMessageIds.size > 0) clearSelectionMode();
    if (pendingDeleteConfirm) closeDeleteConfirm();
    cancelEditingMessage();
    resetFeedImageDrop();
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("shop-company-chat-open");
    unlockBackgroundPageScrollForChat();
    unbindMobileKeyboardViewportSync();
    persistFeedScrollPositionSnapshot();
    scheduleDeferredClosedFeedPersist();
    pendingFeedRestoreState = null;
    pendingFeedRestoreMutationVersion = sharedThreadMutationVersion;
    setChatBootstrapLoading(false);
    renderUnreadBadge(liveEntries);
    renderTypingIndicator();
    startUnreadPolling();
  }

  function resetConversation() {
    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();
    clearReplyDraft();
    selectedMessageIds.clear();
    liveEntries = [];
    hasLoadedSharedThreadOnce = false;
    sharedHistoryHasMore = false;
    sharedHistoryNextBeforeId = null;
    sharedHistoryLoading = false;
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
    if (chatRuntimeSettings.welcomeEnabled === false) return null;

    const dayKey = getLocalDayKey(new Date());
    if (!dayKey) return null;

    const metaState = sanitizeSharedThreadMeta(sharedThreadMeta);
    if (metaState.lastWelcomeDay === dayKey) return null;

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
      return null;
    }

    const nowIso = new Date().toISOString();
    const message = {
      id: welcomeId,
      type: "message",
      role: "agent",
      day: formatDayLabelFromIso(nowIso),
      time: formatTimeFromIso(nowIso),
      text: String(
        chatRuntimeSettings.welcomeMessage
        || getDefaultChatWelcomeMessageByGender(chatRuntimeSettings.assistantGender)
      ),
      author: String(chatRuntimeSettings.assistantName || DEFAULT_CHAT_ASSISTANT_NAME),
      createdAt: nowIso,
      editedAt: "",
      read: true,
      deliveryStatus: "read",
      deliveredAt: nowIso,
      readAt: nowIso,
      reaction: "",
      reactions: { in: "", out: "" },
    };
    liveEntries.push(message);
    markSharedThreadMutated();
    sharedThreadMeta = {
      name: metaState.name,
      phone: metaState.phone,
      lastWelcomeDay: dayKey,
    };
    renderUnreadBadge(liveEntries);
    return message;
  }

  function getAllEntries() {
    const quickQuestionsFeatureEnabled = chatRuntimeSettings.quickQuestionsEnabled !== false;
    const rawEntries = baseEntries
      .slice(visibleStart)
      .concat(liveEntries)
      .filter(function (entry) {
        if (entry && entry.type === "options" && !quickQuestionsFeatureEnabled) return false;
        const entryId = String(entry && entry.id || "");
        if (
          chatRuntimeSettings.welcomeEnabled === false
          && /^daily-welcome-\d{4}-\d{2}-\d{2}$/.test(entryId)
        ) return false;
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
      if (!quickQuestionsFeatureEnabled) return;
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
        text: String(chatRuntimeSettings.optionsText || DEFAULT_CHAT_OPTIONS_TEXT),
        options: (Array.isArray(chatRuntimeSettings.quickQuestions)
          ? chatRuntimeSettings.quickQuestions
          : DEFAULT_CHAT_QUICK_QUESTIONS
        ).slice(),
      });
      hasOptionsById.add(optionsId);
    });

    if (quickQuestionsFeatureEnabled) {
      const hasAnyOptions = withDailyPair.some(function (entry) {
        return entry && entry.type === "options";
      });
      if (!hasAnyOptions) {
        const nowIso = new Date().toISOString();
        const dayKey = getLocalDayKey(nowIso);
        const optionsId = "daily-welcome-options-" + dayKey;
        if (dayKey && !isMessageHiddenLocally(optionsId)) {
          const anchorEntry = withDailyPair[0] || null;
          const dayLabel = anchorEntry && anchorEntry.day
            ? String(anchorEntry.day)
            : formatDayLabelFromIso(nowIso);
          const timeLabel = anchorEntry && anchorEntry.time
            ? String(anchorEntry.time)
            : formatTimeFromIso(nowIso);
          withDailyPair.unshift({
            id: optionsId,
            type: "options",
            role: "agent",
            day: dayLabel,
            time: timeLabel,
            text: String(chatRuntimeSettings.optionsText || DEFAULT_CHAT_OPTIONS_TEXT),
            options: (Array.isArray(chatRuntimeSettings.quickQuestions)
              ? chatRuntimeSettings.quickQuestions
              : DEFAULT_CHAT_QUICK_QUESTIONS
            ).slice(),
          });
        }
      }
    }

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
      '<button class="shop-company-chat-composer-reply__close" type="button" aria-label="\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043e\u0442\u0432\u0435\u0442" title="\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043e\u0442\u0432\u0435\u0442">' +
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
      scheduleScrollDownComposerExtraOffsetSync();
      return;
    }

    ui.name.textContent = String(replyDraft.sender || "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435");
    renderEmojiMessageText(
      ui.text,
      getReplyPreviewText(replyDraft.text || ""),
      "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--preview"
    );
    ui.root.classList.remove("hidden");
    syncComposerRichPreview({});
    scheduleScrollDownComposerExtraOffsetSync();
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
    target.time = formatTimeFromIso(target.createdAt || target.editedAt) + " \u00b7 \u0438\u0437\u043c.";
    if (inLive) markSharedThreadMutated();

    const prevTop = feed.scrollTop;
    const keepBottom = shouldKeepFeedPinnedToBottom();
    renderThread();
    if (keepBottom) scrollToBottom(false);
    else {
      feed.scrollTop = prevTop;
      updateScrollDownButton();
    }

    if (inLive) {
      const messageId = String(target.id || id);
      enqueueSharedMutation(function () {
        return remotePatchSharedMessage(messageId, {
          text: String(target.text || ""),
          editedAt: String(target.editedAt || ""),
        });
      });
    }
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
    let menu = contextMenuEl && contextMenuEl.isConnected ? contextMenuEl : null;

    if (!menu) {
      menu = document.createElement("div");
      menu.id = "shopCompanyChatContextMenu";
      menu.className = "shop-company-chat-context-menu hidden";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f \u0441 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435\u043c");
      menu.innerHTML =
        '<div class="shop-company-chat-context-reactions" role="group" aria-label="Reactions">' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{1F44D}" aria-label="\u{1F44D}" title="\u{1F44D}">\u{1F44D}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{2764}\u{FE0F}" aria-label="\u{2764}\u{FE0F}" title="\u{2764}\u{FE0F}">\u{2764}\u{FE0F}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{1F525}" aria-label="\u{1F525}" title="\u{1F525}">\u{1F525}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{1F602}" aria-label="\u{1F602}" title="\u{1F602}">\u{1F602}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{1F970}" aria-label="\u{1F970}" title="\u{1F970}">\u{1F970}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{1F64F}" aria-label="\u{1F64F}" title="\u{1F64F}">\u{1F64F}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction" data-chat-msg-reaction-slot="quick" data-chat-msg-reaction="\u{1F603}" aria-label="\u{1F603}" title="\u{1F603}">\u{1F603}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--extra" data-chat-msg-reaction-slot="extra" data-chat-msg-reaction="\u{1F622}" aria-label="\u{1F622}" title="\u{1F622}">\u{1F622}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--extra" data-chat-msg-reaction-slot="extra" data-chat-msg-reaction="\u{1F615}" aria-label="\u{1F615}" title="\u{1F615}">\u{1F615}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--extra" data-chat-msg-reaction-slot="extra" data-chat-msg-reaction="\u{1F61E}" aria-label="\u{1F61E}" title="\u{1F61E}">\u{1F61E}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--extra" data-chat-msg-reaction-slot="extra" data-chat-msg-reaction="\u{1F61F}" aria-label="\u{1F61F}" title="\u{1F61F}">\u{1F61F}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--extra" data-chat-msg-reaction-slot="extra" data-chat-msg-reaction="\u{1F641}" aria-label="\u{1F641}" title="\u{1F641}">\u{1F641}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--extra" data-chat-msg-reaction-slot="extra" data-chat-msg-reaction="\u{1F62E}" aria-label="\u{1F62E}" title="\u{1F62E}">\u{1F62E}</button>' +
          '<button type="button" class="shop-company-chat-context-reaction shop-company-chat-context-reaction--toggle" data-chat-msg-reaction="__toggle_more__" aria-label="Show more reactions" aria-expanded="false">' +
            '<i class="fas fa-chevron-down" aria-hidden="true"></i>' +
          "</button>" +
        "</div>" +
        '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="reply">' +
          '<i class="fas fa-reply"></i><span>\u041e\u0442\u0432\u0435\u0442\u0438\u0442\u044c</span>' +
        "</button>" +
        '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="copy">' +
          '<i class="far fa-copy"></i><span>\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c</span>' +
        "</button>" +
        '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="edit">' +
          '<i class="fas fa-pen"></i><span>\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c</span>' +
        "</button>" +
        '<button type="button" class="shop-company-chat-context-btn is-danger" data-chat-msg-action="delete">' +
          '<i class="far fa-trash-alt"></i><span>\u0423\u0434\u0430\u043b\u0438\u0442\u044c</span>' +
        "</button>" +
        '<div class="shop-company-chat-context-divider"></div>' +
        '<button type="button" class="shop-company-chat-context-btn" data-chat-msg-action="select">' +
          '<i class="far fa-circle-check"></i><span>\u0412\u044b\u0431\u0440\u0430\u0442\u044c</span>' +
        "</button>";
      document.body.appendChild(menu);
      contextMenuEl = menu;
      contextMenuEditBtn = menu.querySelector('[data-chat-msg-action="edit"]');
      contextMenuDeleteBtn = menu.querySelector('[data-chat-msg-action="delete"]');
    }

    normalizeContextMenuReactionButtons(menu);
    setContextMenuReactionsExpanded(false);

    if (menu.dataset.bound === "1") return;
    menu.dataset.bound = "1";
    menu.addEventListener("click", function (event) {
      const reactionBtn = event.target.closest("[data-chat-msg-reaction]");
      if (reactionBtn) {
        const messageId = contextMenuMessageId;
        const reaction = String(reactionBtn.getAttribute("data-chat-msg-reaction") || "").trim();
        if (reaction === "__toggle_more__") {
          event.preventDefault();
          event.stopPropagation();
          hideReactionBar();
          const nextExpanded = !menu.classList.contains("is-reactions-expanded");
          setContextMenuReactionsExpanded(nextExpanded);
          refreshContextMenuReactionBoxPosition();
          return;
        }
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

  function hideContextMenu() {
    if (!contextMenuEl) return;
    contextMenuEl.classList.add("hidden");
    setContextMenuReactionsExpanded(false);
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
        '<div class="chat-delete-confirm-title" id="shopCompanyDeleteConfirmTitle">\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435</div>' +
        '<div class="chat-delete-confirm-text" id="shopCompanyDeleteConfirmText">\u0412\u044b \u0442\u043e\u0447\u043d\u043e \u0445\u043e\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435?</div>' +
        '<label class="chat-delete-confirm-check" for="shopCompanyDeleteConfirmForPeer">' +
          '<input class="chat-delete-confirm-checkbox" id="shopCompanyDeleteConfirmForPeer" type="checkbox" checked />' +
          '<span class="chat-delete-confirm-check-text" id="shopCompanyDeleteConfirmCheckText">\u0422\u0430\u043a\u0436\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0443 \u0441\u043e\u0431\u0435\u0441\u0435\u0434\u043d\u0438\u043a\u0430</span>' +
        "</label>" +
        '<div class="chat-delete-confirm-actions">' +
          '<button type="button" class="chat-delete-confirm-btn chat-delete-confirm-btn--cancel" id="shopCompanyDeleteConfirmCancelBtn">\u041e\u0422\u041c\u0415\u041d\u0410</button>' +
          '<button type="button" class="chat-delete-confirm-btn chat-delete-confirm-btn--danger" id="shopCompanyDeleteConfirmDeleteBtn">\u0423\u0414\u0410\u041b\u0418\u0422\u042c</button>' +
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
    if (n > 10 && n < 20) return "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439";
    if (n1 > 1 && n1 < 5) return "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f";
    if (n1 === 1) return "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435";
    return "\u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439";
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
    selectionCountEl.textContent = "\u0412\u044b\u0431\u0440\u0430\u043d\u043e " + count + " " + getMessagesWord(count);
    scheduleScrollDownComposerExtraOffsetSync();
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
    if (ui.title) ui.title.textContent = "\u0423\u0434\u0430\u043b\u0438\u0442\u044c " + count + " " + getMessagesWord(count);
    if (ui.text) ui.text.textContent = count === 1
      ? "\u0412\u044b \u0442\u043e\u0447\u043d\u043e \u0445\u043e\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435?"
      : "\u0412\u044b \u0442\u043e\u0447\u043d\u043e \u0445\u043e\u0442\u0438\u0442\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u0438 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f?";
    if (ui.checkText) ui.checkText.textContent = "\u0422\u0430\u043a\u0436\u0435 \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0443 \u0441\u043e\u0431\u0435\u0441\u0435\u0434\u043d\u0438\u043a\u0430";
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
    if (removedFromLive) {
      enqueueSharedMutation(function () {
        return remoteDeleteSharedMessage(id);
      });
    }
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

  function formatChatOrderAmount(amount) {
    const safeAmount = Number(amount || 0);
    if (!Number.isFinite(safeAmount)) return "\u2014";
    return safeAmount.toLocaleString("ru-RU") + " \u20bd";
  }

  function resolveChatOrderDisplayNumber(orderLike) {
    const source = orderLike && typeof orderLike === "object" ? orderLike : {};
    const id = toPositiveOrderId(source.id || source.orderId || source.order_id);
    if (id) return "#" + String(id);
    const publicId = String(source.publicId || source.public_id || "").trim();
    if (publicId) return "#" + publicId;
    return "#";
  }

  function resolveChatOrderStatusTitle(orderLike) {
    const source = orderLike && typeof orderLike === "object" ? orderLike : {};
    return String(
      source.statusTitle || source.status_title || HOT_QUESTION_ORDER_STATUS_UNKNOWN
    ).trim() || HOT_QUESTION_ORDER_STATUS_UNKNOWN;
  }

  function resolveChatOrderCreatedAt(orderLike) {
    const source = orderLike && typeof orderLike === "object" ? orderLike : {};
    return String(source.createdAt || source.created_at || "");
  }

  function resolveChatOrderTotal(orderLike) {
    const source = orderLike && typeof orderLike === "object" ? orderLike : {};
    if (Object.prototype.hasOwnProperty.call(source, "totalPrice")) return Number(source.totalPrice || 0);
    return Number(source.total_price || 0);
  }

  function ensureChatOrderDetailsViewNode() {
    if (chatOrderDetailsView && chatOrderDetailsView.isConnected) return chatOrderDetailsView;
    const existing = modalBody.querySelector("#shopCompanyChatOrderDetailsView");
    if (existing) {
      chatOrderDetailsView = existing;
      return chatOrderDetailsView;
    }

    const node = document.createElement("div");
    node.id = "shopCompanyChatOrderDetailsView";
    node.className = "shop-company-chat-order-view hidden";
    modalBody.insertBefore(node, composer);
    chatOrderDetailsView = node;
    return chatOrderDetailsView;
  }

  function ensureChatOrderBackButton() {
    if (chatOrderBackBtn && chatOrderBackBtn.isConnected) return chatOrderBackBtn;
    const existing = modalHeader.querySelector("#shopCompanyChatBackBtn");
    if (existing) {
      chatOrderBackBtn = existing;
      return chatOrderBackBtn;
    }

    const btn = document.createElement("button");
    btn.id = "shopCompanyChatBackBtn";
    btn.type = "button";
    btn.className = "shop-company-chat-modal__back hidden";
    btn.setAttribute("aria-label", "\u041d\u0430\u0437\u0430\u0434");
    btn.innerHTML = '<i class="fas fa-arrow-left"></i>';
    btn.addEventListener("click", function (event) {
      event.preventDefault();
      hideChatOrderDetailsView();
    });

    modalHeader.insertBefore(btn, modalTitle);
    chatOrderBackBtn = btn;
    return chatOrderBackBtn;
  }

  function setChatOrderDetailsMode(active) {
    const isActive = active === true;
    const detailsView = ensureChatOrderDetailsViewNode();
    if (!detailsView) return;

    if (isActive) {
      if (!chatOrderUiSnapshot) {
        chatOrderUiSnapshot = {
          feedHidden: feed.classList.contains("hidden"),
          scrollDownHidden: scrollDownBtn.classList.contains("hidden"),
          reactionHidden: reactionBar.classList.contains("hidden"),
          composerHidden: composer.classList.contains("hidden"),
          selectionHidden: selectionToolbar.classList.contains("hidden"),
        };
      }
      feed.classList.add("hidden");
      scrollDownBtn.classList.add("hidden");
      reactionBar.classList.add("hidden");
      composer.classList.add("hidden");
      selectionToolbar.classList.add("hidden");
      detailsView.classList.remove("hidden");
      return;
    }

    const snapshot = chatOrderUiSnapshot;
    chatOrderUiSnapshot = null;
    detailsView.classList.add("hidden");
    if (!snapshot) {
      feed.classList.remove("hidden");
      composer.classList.remove("hidden");
      return;
    }
    feed.classList.toggle("hidden", snapshot.feedHidden);
    scrollDownBtn.classList.toggle("hidden", snapshot.scrollDownHidden);
    reactionBar.classList.toggle("hidden", snapshot.reactionHidden);
    composer.classList.toggle("hidden", snapshot.composerHidden);
    selectionToolbar.classList.toggle("hidden", snapshot.selectionHidden);
  }

  function escapeChatHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function detachChatOrderFooterOutsideHandler() {
    if (!chatOrderFooterOutsideHandler) return;
    document.removeEventListener("pointerdown", chatOrderFooterOutsideHandler, true);
    chatOrderFooterOutsideHandler = null;
  }

  function renderChatOrderRepeatFooter(container, order) {
    if (!container) return;
    const source = order && typeof order === "object" ? order : {};
    const items = Array.isArray(source.items) ? source.items : [];

    const footer = document.createElement("div");
    footer.className = "shop-company-chat-order-footer";

    const repeatBtn = document.createElement("button");
    repeatBtn.type = "button";
    repeatBtn.className = "shop-checkout-back shop-order-details-repeat-btn";
    repeatBtn.setAttribute("aria-label", "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437");
    repeatBtn.innerHTML =
      '<i class="fas fa-rotate-right" aria-hidden="true"></i>'
      + '<span class="shop-order-details-repeat-text">\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437</span>';

    const totalBtn = document.createElement("button");
    totalBtn.type = "button";
    totalBtn.className = "shop-checkout-submit-btn shop-company-chat-order-total-btn";
    totalBtn.innerHTML =
      '<span class="shop-checkout-total">' + formatChatOrderAmount(resolveChatOrderTotal(source)) + "</span>";

    totalBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
    });

    repeatBtn.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!repeatBtn.classList.contains("is-expanded")) {
        repeatBtn.classList.add("is-expanded");
        return;
      }
      if (!items.length) {
        window.alert("\u0412 \u0437\u0430\u043a\u0430\u0437\u0435 \u043d\u0435\u0442 \u0442\u043e\u0432\u0430\u0440\u043e\u0432");
        return;
      }
      if (repeatBtn.disabled) return;
      repeatBtn.disabled = true;
      try {
        if (typeof window.repeatOrderItemsToCart === "function") {
          await window.repeatOrderItemsToCart(items);
        } else {
          throw new Error("REPEAT_HANDLER_UNAVAILABLE");
        }
      } catch (_err) {
        window.alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u043a\u0430\u0437");
      } finally {
        repeatBtn.disabled = false;
        repeatBtn.classList.remove("is-expanded");
      }
    });

    detachChatOrderFooterOutsideHandler();
    chatOrderFooterOutsideHandler = function (event) {
      if (!event) return;
      if (event.target instanceof Node && repeatBtn.contains(event.target)) return;
      repeatBtn.classList.remove("is-expanded");
    };
    document.addEventListener("pointerdown", chatOrderFooterOutsideHandler, true);

    footer.appendChild(repeatBtn);
    footer.appendChild(totalBtn);
    container.appendChild(footer);
  }

  function buildChatOrderDetailsHtml(order) {
    const source = order && typeof order === "object" ? order : {};
    let html = '<div class="shop-order-details">';

    html += '<div class="shop-order-details-header">';
    html += '<div class="shop-order-details-title">\u0417\u0430\u043a\u0430\u0437 '
      + escapeChatHtml(resolveChatOrderDisplayNumber(source))
      + "</div>";
    if (resolveChatOrderStatusTitle(source)) {
      html += '<div class="shop-order-details-status">'
        + escapeChatHtml(resolveChatOrderStatusTitle(source))
        + "</div>";
    }
    html += "</div>";

    html += '<div class="shop-order-details-info">';
    html += '<div class="shop-order-info-row">';
    html += '<div class="shop-order-info-label">\u0414\u0430\u0442\u0430 \u0438 \u0432\u0440\u0435\u043c\u044f</div>';
    html += '<div class="shop-order-info-value">'
      + escapeChatHtml(formatHotQuestionOrderDateLong(resolveChatOrderCreatedAt(source)))
      + "</div>";
    html += "</div>";

    if (source.method_title || source.methodTitle) {
      html += '<div class="shop-order-info-row">';
      html += '<div class="shop-order-info-label">\u0421\u043f\u043e\u0441\u043e\u0431 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438</div>';
      html += '<div class="shop-order-info-value">'
        + escapeChatHtml(String(source.method_title || source.methodTitle || ""))
        + "</div>";
      html += "</div>";
    }

    if (source.time_option_title || source.timeOptionTitle) {
      html += '<div class="shop-order-info-row">';
      html += '<div class="shop-order-info-label">\u0412\u0440\u0435\u043c\u044f \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438</div>';
      html += '<div class="shop-order-info-value">'
        + escapeChatHtml(String(source.time_option_title || source.timeOptionTitle || ""))
        + "</div>";
      html += "</div>";
    }

    const scheduledAt = String(source.scheduled_at || source.scheduledAt || "");
    if (scheduledAt) {
      html += '<div class="shop-order-info-row">';
      html += '<div class="shop-order-info-label">\u0417\u0430\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u043d\u0430</div>';
      html += '<div class="shop-order-info-value">'
        + escapeChatHtml(formatHotQuestionOrderDateLong(scheduledAt))
        + "</div>";
      html += "</div>";
    }
    html += "</div>";

    const address = String(source.address || "").trim();
    if (address) {
      html += '<div class="shop-order-details-section">';
      html += '<div class="shop-order-section-title">\u0410\u0434\u0440\u0435\u0441 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438</div>';
      html += '<div class="shop-order-address">' + escapeChatHtml(address) + "</div>";
      html += "</div>";
    }

    const items = Array.isArray(source.items) ? source.items : [];
    if (items.length) {
      html += '<div class="shop-order-details-section">';
      html += '<div class="shop-order-section-title">\u0422\u043e\u0432\u0430\u0440\u044b</div>';
      html += '<div class="shop-cart-items">';
      items.forEach(function (item) {
        if (typeof window.formatOrderItem === "function") {
          try {
            html += String(window.formatOrderItem(item) || "");
            return;
          } catch (_err) {}
        }
        const safeItem = item && typeof item === "object" ? item : {};
        const qtyRaw = Number(safeItem.qty ?? safeItem.quantity ?? safeItem.count ?? 1);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.trunc(qtyRaw) : 1;
        const linePriceRaw = Number(safeItem.total_price ?? safeItem.line_total ?? safeItem.totalPrice ?? 0);
        const linePrice = Number.isFinite(linePriceRaw) ? linePriceRaw : 0;
        html += '<div class="cart-row">';
        html += '<div class="cart-mid"><div class="cart-title">'
          + escapeChatHtml(String(safeItem.name || "\u2014"))
          + "</div></div>";
        html += '<div class="cart-right"><div class="cart-price">'
          + formatChatOrderAmount(linePrice)
          + '</div><div class="cart-qty">\u00d7' + String(qty) + "</div></div>";
        html += "</div>";
      });
      html += "</div>";
      html += "</div>";
    }

    if (source.cutlery_qty && Number(source.cutlery_qty) > 0) {
      html += '<div class="shop-order-details-section">';
      html += '<div class="shop-order-info-row">';
      html += '<div class="shop-order-info-label">\u041f\u0440\u0438\u0431\u043e\u0440\u044b</div>';
      html += '<div class="shop-order-info-value">' + escapeChatHtml(String(source.cutlery_qty)) + " \u0448\u0442.</div>";
      html += "</div>";
      html += "</div>";
    }

    if (source.comment) {
      html += '<div class="shop-order-details-section">';
      html += '<div class="shop-order-section-title">\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439</div>';
      html += '<div class="shop-order-comment">' + escapeChatHtml(String(source.comment || "")) + "</div>";
      html += "</div>";
    }

    if (typeof window.renderOrderSummaryBlock === "function") {
      try {
        html += String(window.renderOrderSummaryBlock(source) || "");
      } catch (_err) {
        html += '<div class="shop-order-details-section shop-order-summary">';
        html += '<div class="shop-order-summary-title">\u0421\u0443\u043c\u043c\u044b:</div>';
        html += '<div class="shop-order-summary-total-row">';
        html += '<span class="shop-order-summary-total-label">\u0418\u0422\u041e\u0413\u041e</span>';
        html += '<span class="shop-order-summary-total-value">' + formatChatOrderAmount(resolveChatOrderTotal(source)) + "</span>";
        html += "</div></div>";
      }
    } else {
      html += '<div class="shop-order-details-section shop-order-summary">';
      html += '<div class="shop-order-summary-title">\u0421\u0443\u043c\u043c\u044b:</div>';
      html += '<div class="shop-order-summary-total-row">';
      html += '<span class="shop-order-summary-total-label">\u0418\u0422\u041e\u0413\u041e</span>';
      html += '<span class="shop-order-summary-total-value">' + formatChatOrderAmount(resolveChatOrderTotal(source)) + "</span>";
      html += "</div></div>";
    }

    html += '<div class="shop-company-chat-order-footer-spacer"></div>';
    html += "</div>";
    return html;
  }

  function renderChatOrderDetailsContent(container, order) {
    container.innerHTML = "";
    const source = order && typeof order === "object" ? order : null;
    if (!source) {
      const empty = document.createElement("div");
      empty.className = "shop-company-chat-order-empty";
      empty.textContent = CHAT_ORDER_LOAD_ERROR_TEXT;
      container.appendChild(empty);
      return;
    }

    container.innerHTML = buildChatOrderDetailsHtml(source);

    if (typeof window.bindOrderSummaryDiscountToggles === "function") {
      try {
        window.bindOrderSummaryDiscountToggles(container);
      } catch (_err) {}
    }
    if (typeof window.bindRepeatOrderItemRows === "function") {
      try {
        const reopen = function () {
          const sourceOrderId = toPositiveOrderId(source.id);
          if (!sourceOrderId) return;
          void openChatOrderDetailsView(sourceOrderId);
        };
        window.bindRepeatOrderItemRows(container, Array.isArray(source.items) ? source.items : [], {
          onBack: reopen,
          enableSwipeActions: true,
        });
      } catch (_err) {}
    }

    renderChatOrderRepeatFooter(container, source);
  }

  async function openChatOrderDetailsView(orderId) {
    const safeOrderId = toPositiveOrderId(orderId);
    if (!safeOrderId) return;

    hideContextMenu();
    hideReactionBar();
    hideEmojiPopover();

    const detailsView = ensureChatOrderDetailsViewNode();
    const backBtn = ensureChatOrderBackButton();
    if (!detailsView || !backBtn) return;

    if (!chatOrderDetailsActive) {
      chatOrderDetailsPrevTitle = String(modalTitle.textContent || "").trim() || initialModalTitleText;
    }
    chatOrderDetailsActive = true;
    chatOrderDetailsId = safeOrderId;
    backBtn.classList.remove("hidden");
    modalTitle.textContent = CHAT_ORDER_DETAILS_TITLE;
    setChatOrderDetailsMode(true);
    detailsView.innerHTML =
      '<div class="shop-company-chat-order-empty">' + CHAT_ORDER_LOADING_TEXT + "</div>";

    try {
      const json = await chatApiJson(
        "/api/public/me/orders/" + encodeURIComponent(String(safeOrderId)) + "?_ts=" + Date.now()
      );
      if (!chatOrderDetailsActive || chatOrderDetailsId !== safeOrderId) return;
      const payload = json && json.data ? json.data : null;
      renderChatOrderDetailsContent(
        detailsView,
        payload || hotQuestionOrderCardsCache.get(safeOrderId) || null
      );
    } catch (_err) {
      if (!chatOrderDetailsActive || chatOrderDetailsId !== safeOrderId) return;
      const fallback = hotQuestionOrderCardsCache.get(safeOrderId) || null;
      if (fallback) {
        renderChatOrderDetailsContent(detailsView, fallback);
      } else {
        detailsView.innerHTML =
          '<div class="shop-company-chat-order-empty">' + CHAT_ORDER_LOAD_ERROR_TEXT + "</div>";
      }
    }
  }

  function hideChatOrderDetailsView() {
    if (!chatOrderDetailsActive && !chatOrderUiSnapshot) return;
    chatOrderDetailsActive = false;
    chatOrderDetailsId = 0;
    detachChatOrderFooterOutsideHandler();
    setChatOrderDetailsMode(false);
    if (chatOrderBackBtn && chatOrderBackBtn.isConnected) {
      chatOrderBackBtn.classList.add("hidden");
    }
    modalTitle.textContent = chatOrderDetailsPrevTitle || initialModalTitleText;
    updateScrollDownButton();
  }

  function renderHotQuestionOrderCard(button, preview, orderId) {
    const source = preview && typeof preview === "object"
      ? preview
      : {
          id: orderId,
          statusTitle: "\u041d\u0430\u0436\u043c\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c",
          totalPrice: Number.NaN,
          createdAt: "",
          photos: [],
        };
    const safeOrderId = toPositiveOrderId(source.id || orderId);
    const photos = Array.isArray(source.photos) ? source.photos.slice(0, HOT_QUESTION_ORDER_CARD_PHOTOS_MAX) : [];
    button.innerHTML = "";

    const head = document.createElement("div");
    head.className = "shop-company-chat-order-card__head";

    const title = document.createElement("div");
    title.className = "shop-company-chat-order-card__title";
    title.textContent = "\u0417\u0430\u043a\u0430\u0437 " + resolveChatOrderDisplayNumber(source);

    const status = document.createElement("div");
    status.className = "shop-company-chat-order-card__status";
    status.textContent = resolveChatOrderStatusTitle(source);

    head.appendChild(title);
    head.appendChild(status);
    button.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "shop-company-chat-order-card__meta";
    meta.textContent = formatHotQuestionOrderDateShort(resolveChatOrderCreatedAt(source));
    button.appendChild(meta);

    const total = document.createElement("div");
    total.className = "shop-company-chat-order-card__total";
    total.textContent = formatChatOrderAmount(resolveChatOrderTotal(source));
    button.appendChild(total);

    if (photos.length) {
      const photosRow = document.createElement("div");
      photosRow.className = "shop-company-chat-order-card__photos";
      photos.forEach(function (src) {
        const img = document.createElement("img");
        img.className = "shop-company-chat-order-card__photo";
        img.src = String(src || "");
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        photosRow.appendChild(img);
      });
      button.appendChild(photosRow);
    }

    if (!safeOrderId) button.disabled = true;
  }

  function createHotQuestionOrderCardNode(entry) {
    const resolvedList = resolveHotQuestionOrderCardPreviews(entry);
    if (!Array.isArray(resolvedList) || !resolvedList.length) return null;

    const strip = document.createElement("div");
    strip.className = "shop-company-chat-order-card-strip";

    resolvedList.forEach(function (resolved) {
      const orderId = toPositiveOrderId(resolved && resolved.orderId);
      if (!orderId) return;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "shop-company-chat-order-card";
      card.dataset.chatOrderCardId = String(orderId);
      card.setAttribute("aria-label", "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0437\u0430\u043a\u0430\u0437");

      renderHotQuestionOrderCard(card, resolved.preview, orderId);

      if (!resolved.preview) {
        ensureHotQuestionOrderCardPreview(orderId)
          .then(function (preview) {
            if (!card.isConnected || !preview) return;
            renderHotQuestionOrderCard(card, preview, orderId);
          })
          .catch(function () {});
      }

      strip.appendChild(card);
    });

    return strip.childElementCount > 0 ? strip : null;
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
      snippetName.textContent = String(reply.sender || "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435");
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
      img.src = getAttachmentImageSrc(imageAttachment);
      img.alt = String(imageAttachment.name || "\u0424\u043e\u0442\u043e");
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

    const orderCardNode = entry.role === "agent" ? createHotQuestionOrderCardNode(entry) : null;
    if (orderCardNode) {
      bubble.classList.add("shop-company-chat-bubble--order-card");
      bubble.appendChild(orderCardNode);
    }

    if (hasImageAttachment) {
      bubble.classList.add("has-attachment");
      if (!hasText) bubble.classList.add("has-attachment-only");
    }
    if (emojiOnlyInfo.isEmojiOnly && !reply && !hasImageAttachment && !orderCardNode) {
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
        statusEl.setAttribute("aria-label", status === "read" ? "\u041f\u0440\u043e\u0447\u0438\u0442\u0430\u043d\u043e" : status === "delivered" ? "\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e" : "\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e");
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
        reaction.title = itemReaction.actor === CHAT_REACTION_ACTOR ? "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0435\u0430\u043a\u0446\u0438\u044e" : "\u0420\u0435\u0430\u043a\u0446\u0438\u044f \u0441\u043e\u0431\u0435\u0441\u0435\u0434\u043d\u0438\u043a\u0430";
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
    renderTypingIndicator();
  }

  function hideReactionBar() {
    reactionBar.classList.add("hidden");
    setReactionBarExpanded(false);
    reactionBar.style.left = "";
    reactionBar.style.top = "";
    reactionMessageId = "";
  }

  function remountEmojiPopover(target) {
    if (!emojiPopover) return;
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    const canMountToAttachPreview = (
      normalizedTarget === "attach-preview"
      && attachPreviewOverlay
      && !attachPreviewOverlay.classList.contains("hidden")
    );
    const desiredParent = canMountToAttachPreview ? attachPreviewOverlay : emojiPopoverHomeParent;
    if (!desiredParent) return;
    if (emojiPopover.parentElement === desiredParent) return;
    desiredParent.appendChild(emojiPopover);
  }

  function updateEmojiPopoverViewportMode() {
    if (!emojiPopover) return;
    const useMobileSheet = isMobileChatViewport();
    emojiPopover.classList.toggle("is-mobile-sheet", useMobileSheet);
  }

  function setComposerEmojiButtonMode(isKeyboardMode) {
    if (!emojiBtn) return;
    const keyboardMode = isKeyboardMode === true;
    emojiBtn.classList.toggle("is-keyboard-mode", keyboardMode);
    emojiBtn.setAttribute(
      "aria-label",
      keyboardMode ? "\u041a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0430" : "\u042d\u043c\u043e\u0434\u0437\u0438"
    );
    const icon = emojiBtn.querySelector("i");
    if (!icon) return;
    icon.classList.remove("far", "fas", "fa-smile", "fa-keyboard");
    if (keyboardMode) {
      icon.classList.add("far", "fa-keyboard");
    } else {
      icon.classList.add("far", "fa-smile");
    }
  }

  function syncEmojiSheetOpenState() {
    if (!modalBody || !emojiPopover) return;
    const wasMobileSheetOpen = modalBody.classList.contains("is-emoji-sheet-open");
    const isMobileSheetOpen = (
      !emojiPopover.classList.contains("hidden")
      && emojiPopover.classList.contains("is-mobile-sheet")
      && !emojiPopover.classList.contains("is-attach-preview")
    );
    const feedBottomDistance = wasMobileSheetOpen !== isMobileSheetOpen
      ? getFeedBottomDistanceSnapshot()
      : null;
    modalBody.classList.toggle("is-emoji-sheet-open", isMobileSheetOpen);
    setComposerEmojiButtonMode(isMobileSheetOpen);
    if (feedBottomDistance != null) {
      stabilizeFeedBottomDistance(feedBottomDistance, CHAT_EMOJI_SHEET_SETTLE_MS);
    }
  }

  function setEmojiDefaultOpenCategory() {
    const categories = getEmojiCategoriesForRender();
    const recent = Array.isArray(categories.recent) ? categories.recent : [];
    if (recent.length > 0) {
      emojiActiveCategory = "recent";
      return;
    }
    const firstAvailable = EMOJI_CATEGORY_META
      .map(function (meta) { return meta.key; })
      .find(function (key) {
        const list = Array.isArray(categories[key]) ? categories[key] : [];
        return list.length > 0;
      });
    emojiActiveCategory = firstAvailable || "people";
  }

  function syncEmojiPickerViewportPosition() {
    if (!emojiPopover || emojiPopover.classList.contains("hidden")) return;
    const body = emojiPopover.querySelector(".shop-company-chat-emoji-body");
    if (!body) return;
    const sections = Array.from(body.querySelectorAll(".shop-company-chat-emoji-section"));
    if (!sections.length) return;
    const activeSection = sections.find(function (section) {
      return String(section.getAttribute("data-emoji-category") || "") === String(emojiActiveCategory || "");
    });
    const fallbackSection = sections[0];
    const targetSection = activeSection || fallbackSection;
    if (!targetSection) return;
    if (emojiPopover.classList.contains("is-mobile-sheet")) {
      body.scrollLeft = Math.max(0, targetSection.offsetLeft || 0);
      return;
    }
    body.scrollTop = Math.max(0, targetSection.offsetTop - 2);
  }

  function hideEmojiPopover() {
    stopEmojiSheetBottomDistanceStabilization();
    remountEmojiPopover("composer");
    emojiPopover.classList.add("hidden");
    emojiPopover.classList.remove("is-attach-preview");
    emojiPopover.classList.remove("is-mobile-sheet");
    emojiPopoverMode = "composer";
    emojiPopoverReactionMessageId = "";
    syncEmojiSheetOpenState();
  }

  function toggleEmojiPopover(target) {
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    if (shouldUseNativeMobileEmojiKeyboard()) {
      hideEmojiPopover();
      if (normalizedTarget === "attach-preview") {
        attachPreviewCaption.focus();
      } else if (!input.disabled) {
        input.focus();
      }
      return;
    }
    const isPreviewTarget = normalizedTarget === "attach-preview";
    const isOpen = !emojiPopover.classList.contains("hidden");
    const hasSameTarget = emojiPopover.classList.contains("is-attach-preview") === isPreviewTarget;
    const willOpen = !isOpen || !hasSameTarget;

    remountEmojiPopover(normalizedTarget);
    emojiPopover.classList.toggle("is-attach-preview", isPreviewTarget);
    updateEmojiPopoverViewportMode();
    emojiPopover.classList.toggle("hidden", !willOpen);
    if (!willOpen) {
      remountEmojiPopover("composer");
      emojiPopoverMode = "composer";
      emojiPopoverReactionMessageId = "";
      emojiPopover.classList.remove("is-mobile-sheet");
    }
    syncEmojiSheetOpenState();
    if (willOpen) {
      if (normalizedTarget !== "attach-preview") {
        emojiPopoverMode = "composer";
        emojiPopoverReactionMessageId = "";
        setEmojiDefaultOpenCategory();
      }
      renderEmojiPicker();
      ensureEmojiDatasetLoaded().catch(function () {});
      requestAnimationFrame(syncEmojiPickerViewportPosition);
    }
  }

  function showEmojiPopover(target, options) {
    const normalizedTarget = target === "attach-preview" ? "attach-preview" : "composer";
    const isPreviewTarget = normalizedTarget === "attach-preview";
    const opts = options && typeof options === "object" ? options : {};
    const mode = opts.mode === "reaction" ? "reaction" : "composer";
    const messageId = mode === "reaction" ? String(opts.messageId || "") : "";
    if (shouldUseNativeMobileEmojiKeyboard() && mode !== "reaction") {
      hideEmojiPopover();
      if (normalizedTarget === "attach-preview") {
        attachPreviewCaption.focus();
      } else if (!input.disabled) {
        input.focus();
      }
      return;
    }

    remountEmojiPopover(normalizedTarget);
    emojiPopover.classList.toggle("is-attach-preview", isPreviewTarget);
    updateEmojiPopoverViewportMode();
    emojiPopover.classList.remove("hidden");
    emojiPopoverMode = mode;
    emojiPopoverReactionMessageId = messageId;
    if (mode !== "reaction" && normalizedTarget !== "attach-preview") {
      setEmojiDefaultOpenCategory();
    }
    syncEmojiSheetOpenState();
    renderEmojiPicker();
    ensureEmojiDatasetLoaded().catch(function () {});
    requestAnimationFrame(syncEmojiPickerViewportPosition);
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
      const raw = String(item || "").trim().normalize("NFC");
      if (!raw) return;
      const graphemes = segmentGraphemes(raw).filter(Boolean);
      const emoji = emojiGraphemeSegmenter
        ? (graphemes.length === 1 ? String(graphemes[0] || "").trim().normalize("NFC") : "")
        : raw;
      if (!emoji || !isEmojiGrapheme(emoji)) return;
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
      const normalized = normalizeEmojiList(parsed).slice(0, 42);
      try {
        localStorage.setItem(EMOJI_RECENT_STORAGE_KEY, JSON.stringify(normalized));
      } catch {}
      return normalized;
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
    if (!EMOJI_REMOTE_DATASET_ENABLED) {
      if (!emojiDatasetPromise) emojiDatasetPromise = Promise.resolve();
      return emojiDatasetPromise;
    }
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

    const attachPreviewOpen = !attachPreviewOverlay.classList.contains("hidden");
    const attachPreviewTargetFocused = document.activeElement === attachPreviewCaption;
    const useAttachPreviewCaption = (
      attachPreviewOpen
      && (
        attachPreviewTargetFocused
        || emojiPopover.classList.contains("is-attach-preview")
      )
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
    handleComposerTypingActivity();
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
      empty.textContent = "\u041d\u0435\u0442 \u044d\u043c\u043e\u0434\u0437\u0438";
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
        if (emojiPopover.classList.contains("is-mobile-sheet")) {
          const left = Math.max(0, section.offsetLeft || 0);
          body.scrollTo({
            left: left,
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
      section.className = "shop-company-chat-emoji-section";
      section.setAttribute("data-emoji-category", category.key);
      if (emojiPopover.classList.contains("is-mobile-sheet")) {
        const mobileRows = 4;
        const mobileColWidth = 40;
        const mobileGap = 6;
        const columns = Math.max(1, Math.ceil(list.length / mobileRows));
        const computedWidth = (columns * mobileColWidth) + ((columns - 1) * mobileGap);
        section.style.width = String(computedWidth) + "px";
        section.style.minWidth = String(computedWidth) + "px";
        section.style.maxWidth = String(computedWidth) + "px";
        section.style.flex = "0 0 auto";
      } else {
        section.style.width = "";
        section.style.minWidth = "";
        section.style.maxWidth = "";
        section.style.flex = "";
      }

      const title = document.createElement("div");
      title.className = "shop-company-chat-emoji-title";
      title.textContent = category.label;
      if (emojiPopover.classList.contains("is-mobile-sheet")) {
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
      grid.className = "shop-company-chat-emoji-grid";
      if (emojiPopover.classList.contains("is-mobile-sheet")) {
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
          if (emojiPopoverMode === "reaction" && emojiPopoverReactionMessageId) {
            toggleReaction(emojiPopoverReactionMessageId, emoji);
            rememberRecentEmoji(emoji);
            hideEmojiPopover();
            return;
          }
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
      if (emojiPopover.classList.contains("is-mobile-sheet")) {
        const left = Math.max(0, body.scrollLeft || 0);
        let nextKey = emojiActiveCategory;
        visibleCategories.forEach(function (category) {
          const section = sectionByKey.get(category.key);
          if (!section) return;
          const sectionLeft = Math.max(0, section.offsetLeft || 0);
          if (sectionLeft <= (left + 8)) {
            nextKey = category.key;
          }
        });
        if (nextKey && nextKey !== emojiActiveCategory) {
          emojiActiveCategory = nextKey;
          updateActiveTabUi(emojiActiveCategory);
        }
        return;
      }
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
      if (emojiPopover.classList.contains("is-mobile-sheet")) {
        const activeSection = sectionByKey.get(emojiActiveCategory);
        body.scrollLeft = Math.max(0, activeSection ? (activeSection.offsetLeft || 0) : 0);
      } else {
        const activeSection = sectionByKey.get(emojiActiveCategory);
        if (!activeSection) return;
        body.scrollTop = Math.max(0, activeSection.offsetTop - 2);
      }
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

  function collectAllReactionEmojis() {
    const out = [];
    const seen = new Set();
    const push = function (value) {
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
    Array.from(reactionBar.querySelectorAll('[data-reaction-slot="extra-all"]')).forEach(function (node) {
      node.remove();
    });

    const toggleBtn = reactionBar.querySelector('[data-reaction="__toggle_more__"]');
    if (!toggleBtn) return;

    const skip = new Set();
    QUICK_REACTIONS.forEach(function (emoji) {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });
    EXTRA_REACTIONS.forEach(function (emoji) {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });

    const fragment = document.createDocumentFragment();
    collectAllReactionEmojis().forEach(function (emoji) {
      const key = normalizeReactionValue(emoji);
      if (!key || skip.has(key)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-company-chat-reaction-btn shop-company-chat-reaction-extra shop-company-chat-reaction-extra--dynamic";
      btn.setAttribute("data-reaction-slot", "extra-all");
      btn.setAttribute("data-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
      fragment.appendChild(btn);
    });

    toggleBtn.before(fragment);
  }

  function ensureContextMenuAllEmojiButtons(menuRoot) {
    if (!menuRoot) return;
    Array.from(menuRoot.querySelectorAll('[data-chat-msg-reaction-slot="extra-all"]')).forEach(function (node) {
      node.remove();
    });

    const toggleBtn = menuRoot.querySelector('[data-chat-msg-reaction="__toggle_more__"]');
    if (!toggleBtn) return;

    const skip = new Set();
    QUICK_REACTIONS.forEach(function (emoji) {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });
    EXTRA_REACTIONS.forEach(function (emoji) {
      const key = normalizeReactionValue(emoji);
      if (key) skip.add(key);
    });

    const fragment = document.createDocumentFragment();
    collectAllReactionEmojis().forEach(function (emoji) {
      const key = normalizeReactionValue(emoji);
      if (!key || skip.has(key)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-company-chat-context-reaction shop-company-chat-context-reaction--extra shop-company-chat-context-reaction--dynamic";
      btn.setAttribute("data-chat-msg-reaction-slot", "extra-all");
      btn.setAttribute("data-chat-msg-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
      fragment.appendChild(btn);
    });

    toggleBtn.before(fragment);
  }

  function normalizeContextMenuReactionButtons(menuRoot) {
    if (!menuRoot) return;

    const quickBtns = Array.from(menuRoot.querySelectorAll('[data-chat-msg-reaction-slot="quick"]'));
    quickBtns.forEach(function (btn, index) {
      const emoji = QUICK_REACTIONS[index] || QUICK_REACTIONS[QUICK_REACTIONS.length - 1];
      btn.setAttribute("data-chat-msg-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
    });

    const extraBtns = Array.from(menuRoot.querySelectorAll('[data-chat-msg-reaction-slot="extra"]'));
    extraBtns.forEach(function (btn, index) {
      const emoji = EXTRA_REACTIONS[index] || EXTRA_REACTIONS[EXTRA_REACTIONS.length - 1];
      btn.setAttribute("data-chat-msg-reaction", emoji);
      btn.setAttribute("aria-label", emoji);
      btn.title = emoji;
      setEmojiGlyph(btn, emoji, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--reaction");
    });
  }

  function setContextMenuReactionsExpanded(expanded) {
    if (!contextMenuEl) return;
    const isExpanded = !!expanded;
    if (isExpanded) {
      ensureContextMenuAllEmojiButtons(contextMenuEl);
      ensureEmojiDatasetLoaded().then(function () {
        if (!contextMenuEl || contextMenuEl.classList.contains("hidden")) return;
        if (!contextMenuEl.classList.contains("is-reactions-expanded")) return;
        ensureContextMenuAllEmojiButtons(contextMenuEl);
        refreshContextMenuReactionBoxPosition();
      }).catch(function () {});
    }
    contextMenuEl.classList.toggle("is-reactions-expanded", isExpanded);
    const toggleBtn = contextMenuEl.querySelector('[data-chat-msg-reaction="__toggle_more__"]');
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", isExpanded ? "Hide extra reactions" : "Show more reactions");
  }

  function refreshContextMenuReactionBoxPosition() {
    if (!contextMenuEl || contextMenuEl.classList.contains("hidden")) return;
    const left = Number.parseFloat(contextMenuEl.style.left || "");
    const top = Number.parseFloat(contextMenuEl.style.top || "");
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    positionFloatingBox(contextMenuEl, left, top, 8);
  }

  function setReactionBarExpanded(expanded) {
    const isExpanded = !!expanded;
    if (isExpanded) {
      ensureReactionBarAllEmojiButtons();
      ensureEmojiDatasetLoaded().then(function () {
        if (!reactionBar.classList.contains("is-expanded")) return;
        ensureReactionBarAllEmojiButtons();
        if (reactionMessageId) {
          const anchor = thread.querySelector('[data-message-id="' + cssEscape(reactionMessageId) + '"]');
          if (anchor) positionReactionBar(anchor);
        }
      }).catch(function () {});
    }
    reactionBar.classList.toggle("is-expanded", isExpanded);
    const toggleBtn = reactionBar.querySelector('[data-reaction="__toggle_more__"]');
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggleBtn.setAttribute("aria-label", isExpanded ? "\u0421\u043a\u0440\u044b\u0442\u044c \u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0440\u0435\u0430\u043a\u0446\u0438\u0438" : "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0435\u0449\u0451 \u0440\u0435\u0430\u043a\u0446\u0438\u0438");
  }

  function decorateComposerEmojiControls() {
    if (emojiBtn) {
      emojiBtn.classList.remove("has-emoji-content");
      emojiBtn.textContent = "";
      const smileIcon = document.createElement("i");
      smileIcon.className = "far fa-smile";
      smileIcon.setAttribute("aria-hidden", "true");
      emojiBtn.appendChild(smileIcon);
      emojiBtn.setAttribute("aria-label", "\u042d\u043c\u043e\u0434\u0437\u0438");
      emojiBtn.title = "\u042d\u043c\u043e\u0434\u0437\u0438";
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
    scheduleScrollDownComposerExtraOffsetSync();
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
        scheduleScrollDownComposerExtraOffsetSync();
        if (stickToBottom) scrollToBottom(true);
        return;
      }

      preview.classList.remove("hidden");
      input.classList.add("is-rich-emoji-preview");
      renderEmojiMessageText(preview, value, "shop-company-chat-emoji-glyph shop-company-chat-emoji-glyph--input-inline");
      preview.style.transform = "translate(" + (-Math.max(0, input.scrollLeft)) + "px, " + (-Math.max(0, input.scrollTop)) + "px)";
      scheduleScrollDownComposerExtraOffsetSync();

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
      const messageIdStr = String(messageId || "");
      enqueueSharedMutation(function () {
        return remotePatchSharedMessage(messageIdStr, {
          reaction: String(getEntryActorReaction(entry, CHAT_REACTION_ACTOR) || ""),
          reactions: ensureEntryReactions(entry),
        });
      });
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
      const messageIdStr = String(messageId || "");
      enqueueSharedMutation(function () {
        return remotePatchSharedMessage(messageIdStr, {
          deliveryStatus: String(entry.deliveryStatus || ""),
          deliveredAt: String(entry.deliveredAt || ""),
          readAt: String(entry.readAt || ""),
        });
      });
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
    if (isLoadingOlder) return;

    if (visibleStart > 0) {
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
      return;
    }

    if (sharedHistoryHasMore !== true || sharedHistoryLoading) return;

    isLoadingOlder = true;
    const prevHeight = feed.scrollHeight;
    const prevTop = feed.scrollTop;
    loadOlderSharedMessagesFromServer({
      limit: CHAT_THREAD_PAGE_SIZE,
      preserveHistory: true,
    })
      .then(function (changed) {
        if (!changed || keepScrollPosition !== true) return;
        const nextHeight = feed.scrollHeight;
        feed.scrollTop = Math.max(0, prevTop + (nextHeight - prevHeight));
        saveFeedScrollPosition({ force: true });
        updateScrollDownButton();
      })
      .catch(function () {})
      .finally(function () {
        isLoadingOlder = false;
      });
  }

  function isMobileChatViewport() {
    return typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 768px)").matches;
  }

  function shouldUseNativeMobileEmojiKeyboard() {
    if (!isMobileChatViewport()) return false;
    const hasTouchPoints = Number(navigator.maxTouchPoints || 0) > 0;
    const hasCoarsePointer = typeof window.matchMedia === "function"
      && window.matchMedia("(pointer: coarse)").matches;
    return hasTouchPoints || hasCoarsePointer;
  }

  function parseCssLengthPx(value) {
    const parsed = parseFloat(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getElementOuterHeightPx(node) {
    if (!node || !node.isConnected) return 0;
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    const marginTop = parseCssLengthPx(styles.marginTop);
    const marginBottom = parseCssLengthPx(styles.marginBottom);
    const height = Number(rect && rect.height || 0);
    if (!Number.isFinite(height) || height <= 0) return 0;
    return Math.max(0, height + marginTop + marginBottom);
  }

  function setScrollDownComposerExtraOffset(valuePx) {
    const raw = Number(valuePx || 0);
    const next = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
    const prev = Number(overlay.dataset.scrollDownComposerExtra || 0);
    if (prev === next) return;
    overlay.dataset.scrollDownComposerExtra = String(next);
    overlay.style.setProperty("--shop-chat-scroll-down-composer-extra", String(next) + "px");
  }

  function computeScrollDownComposerExtraOffset() {
    if (!overlay.classList.contains("is-open")) return 0;
    const selectionModeActive = (
      modalBody
      && modalBody.classList.contains("is-selection-mode")
      && !selectionToolbar.classList.contains("hidden")
    );
    const anchor = selectionModeActive ? selectionToolbar : composer;
    if (!anchor || anchor.classList.contains("hidden")) return 0;
    const outerHeight = getElementOuterHeightPx(anchor);
    if (!Number.isFinite(outerHeight) || outerHeight <= 0) return 0;
    const base = isMobileChatViewport() ? 60 : 72;
    return Math.max(0, outerHeight - base);
  }

  function syncScrollDownComposerExtraOffsetNow() {
    setScrollDownComposerExtraOffset(computeScrollDownComposerExtraOffset());
  }

  function scheduleScrollDownComposerExtraOffsetSync() {
    if (scrollDownComposerOffsetRaf) return;
    scrollDownComposerOffsetRaf = requestAnimationFrame(function () {
      scrollDownComposerOffsetRaf = 0;
      syncScrollDownComposerExtraOffsetNow();
    });
  }

  function setMobileKeyboardInset(valuePx) {
    const raw = Number(valuePx || 0);
    const rounded = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    const next = rounded < 8 ? 0 : rounded;
    const prev = Number(overlay.dataset.keyboardInset || 0);
    if (prev === next) {
      scheduleScrollDownComposerExtraOffsetSync();
      return;
    }
    overlay.dataset.keyboardInset = String(next);
    overlay.style.setProperty("--shop-chat-mobile-keyboard-inset", String(next) + "px");
    overlay.classList.toggle("is-mobile-keyboard-open", next > 0);
    scheduleScrollDownComposerExtraOffsetSync();
  }

  function hasFocusedChatTextInput() {
    const active = document.activeElement;
    return active === input || active === attachPreviewCaption;
  }

  function computeMobileKeyboardInset() {
    if (!overlay.classList.contains("is-open")) return 0;
    if (!shouldUseNativeMobileEmojiKeyboard()) return 0;
    if (!hasFocusedChatTextInput()) return 0;
    const viewport = window.visualViewport;
    if (!viewport) return 0;
    const viewportHeight = Number(viewport.height || 0);
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 0;
    const rect = overlay.getBoundingClientRect();
    const overlap = Number(rect && rect.bottom || 0) - viewportHeight;
    if (!Number.isFinite(overlap) || overlap <= 0) return 0;
    return overlap;
  }

  function syncMobileKeyboardInsetNow() {
    setMobileKeyboardInset(computeMobileKeyboardInset());
  }

  function scheduleMobileKeyboardInsetSync() {
    if (mobileKeyboardInsetSyncRaf) return;
    mobileKeyboardInsetSyncRaf = requestAnimationFrame(function () {
      mobileKeyboardInsetSyncRaf = 0;
      syncMobileKeyboardInsetNow();
    });
  }

  function scheduleMobileKeyboardInsetSyncBurst() {
    scheduleMobileKeyboardInsetSync();
    window.setTimeout(scheduleMobileKeyboardInsetSync, 60);
    window.setTimeout(scheduleMobileKeyboardInsetSync, 180);
    window.setTimeout(scheduleMobileKeyboardInsetSync, 320);
  }

  function bindMobileKeyboardViewportSync() {
    if (mobileKeyboardViewportSyncBound) return;
    mobileKeyboardViewportSyncBound = true;
    const viewport = window.visualViewport;
    if (viewport) {
      viewport.addEventListener("resize", scheduleMobileKeyboardInsetSync);
      viewport.addEventListener("scroll", scheduleMobileKeyboardInsetSync);
    }
    window.addEventListener("orientationchange", scheduleMobileKeyboardInsetSync);
  }

  function unbindMobileKeyboardViewportSync() {
    if (!mobileKeyboardViewportSyncBound) return;
    mobileKeyboardViewportSyncBound = false;
    const viewport = window.visualViewport;
    if (viewport) {
      viewport.removeEventListener("resize", scheduleMobileKeyboardInsetSync);
      viewport.removeEventListener("scroll", scheduleMobileKeyboardInsetSync);
    }
    window.removeEventListener("orientationchange", scheduleMobileKeyboardInsetSync);
    if (mobileKeyboardInsetSyncRaf) {
      cancelAnimationFrame(mobileKeyboardInsetSyncRaf);
      mobileKeyboardInsetSyncRaf = 0;
    }
    if (scrollDownComposerOffsetRaf) {
      cancelAnimationFrame(scrollDownComposerOffsetRaf);
      scrollDownComposerOffsetRaf = 0;
    }
    setScrollDownComposerExtraOffset(0);
    setMobileKeyboardInset(0);
  }

  function ensureTopVisibleEntryNotClipped() {
    if (!feed || !thread || !isMobileChatViewport()) return;
    const feedRect = feed.getBoundingClientRect();
    const topEdge = feedRect.top + 1;
    const children = Array.from(thread.children || []);
    if (!children.length) return;

    const currentTop = Math.max(0, Number(feed.scrollTop || 0));
    if (currentTop <= 56) {
      const firstRect = children[0].getBoundingClientRect();
      const firstItemClipped = firstRect.top < (topEdge - 1) || firstRect.bottom <= (topEdge + 1);
      if (firstItemClipped) {
        feed.scrollTop = 0;
        updateScrollDownButton();
        return;
      }
    }

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

  function scrollToBottom(smooth, fixTopClip, bottomGapPx) {
    const gapValue = Number(bottomGapPx);
    const gap = Number.isFinite(gapValue) && gapValue > 0 ? gapValue : 0;
    const target = Math.max(0, feed.scrollHeight - feed.clientHeight - gap);
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
    const shouldShow = hasPending || hiddenDistance >= CHAT_SCROLL_DOWN_SHOW_DISTANCE_PX;
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
    const messageId = String(
      opts.messageId || (Date.now() + "-" + messageSeq + "-" + Math.random().toString(36).slice(2, 7))
    );
    const message = {
      id: messageId,
      type: "message",
      role: role,
      day: formatDayLabelFromIso(createdAt),
      time: formatTimeFromIso(createdAt),
      text: trimmed,
      attachment: attachment,
      author: role === "agent"
        ? String(opts.author || resolveAgentAuthorNameByMessageId(messageId))
        : "",
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
    scrollToBottom(false);
    enqueueSharedMutation(function () {
      return remoteCreateSharedMessage(message);
    });

    if (role === "user") {
      scheduleOutgoingDeliveryProgress(message.id);
    }
  }

  function normalizeHotQuestionKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u0451/g, "\u0435")
      .replace(/[!?.,;:()[\]{}"'`~]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasHotQuestionAlias(aliasSet, normalizedText, options) {
    const text = String(normalizedText || "");
    if (!text) return false;
    const aliases = aliasSet instanceof Set ? Array.from(aliasSet) : [];
    const opts = options || {};
    const useIncludes = opts.includes === true;
    for (let idx = 0; idx < aliases.length; idx += 1) {
      const alias = String(aliases[idx] || "");
      if (!alias) continue;
      if (useIncludes) {
        if (text.includes(alias)) return true;
      } else if (text === alias) {
        return true;
      }
    }
    return false;
  }

  function isWhereIsOrderHotQuestion(normalizedText) {
    return hasHotQuestionAlias(hotQuestionAliases.order, normalizedText, { includes: true });
  }

  function formatHotQuestionOrderNumber(order) {
    const source = order && typeof order === "object" ? order : {};
    const orderId = toPositiveOrderId(source.id || source.orderId || source.order_id);
    if (orderId) return "#" + String(orderId);
    const publicId = String(source.public_id || "").trim();
    if (publicId) return "#" + publicId;
    return "#";
  }

  function formatHotQuestionOrderAmount(order) {
    const amount = Number(order && order.total_price);
    if (!Number.isFinite(amount) || amount <= 0) return "";
    return amount.toLocaleString("ru-RU") + " \u20bd";
  }

  function formatHotQuestionOrderLine(order) {
    const source = order && typeof order === "object" ? order : {};
    const numberLabel = formatHotQuestionOrderNumber(source);
    const statusLabel = String(source.status_title || HOT_QUESTION_ORDER_STATUS_UNKNOWN).trim();
    const amountLabel = formatHotQuestionOrderAmount(source);
    const parts = [numberLabel, statusLabel];
    if (amountLabel) parts.push(amountLabel);
    return "\u2022 " + parts.join(" - ");
  }

  function toPositiveOrderId(rawValue) {
    const id = Number(rawValue || 0);
    if (!Number.isFinite(id) || id <= 0) return 0;
    return Math.trunc(id);
  }

  function formatHotQuestionOrderDateShort(isoValue) {
    const date = new Date(String(isoValue || ""));
    if (Number.isNaN(date.getTime())) return "\u2014";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatHotQuestionOrderDateLong(isoValue) {
    const date = new Date(String(isoValue || ""));
    if (Number.isNaN(date.getTime())) return "\u2014";
    return date.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function collectHotQuestionOrderPreviewPhotos(items, maxPhotos) {
    const result = [];
    const limit = Math.max(1, Math.min(8, Number(maxPhotos || HOT_QUESTION_ORDER_CARD_PHOTOS_MAX)));

    const pushPhoto = function (rawPhoto) {
      if (result.length >= limit) return;
      const src = String(rawPhoto || "").trim();
      if (!src) return;
      result.push(src);
    };

    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (result.length >= limit) return;
      const source = item && typeof item === "object" ? item : {};
      const photos = Array.isArray(source.photos) ? source.photos : [];
      if (photos.length) {
        pushPhoto(photos[0]);
        return;
      }
      pushPhoto(source.photo || source.product_photo || "");
    });

    return result;
  }

  function mapHotQuestionOrderPreview(rawOrder) {
    const source = rawOrder && typeof rawOrder === "object" ? rawOrder : {};
    const id = toPositiveOrderId(source.id);
    if (!id) return null;
    const preview = {
      id: id,
      publicId: String(source.public_id || "").trim(),
      statusTitle: String(
        source.status_title || source.statusTitle || HOT_QUESTION_ORDER_STATUS_UNKNOWN
      ).trim() || HOT_QUESTION_ORDER_STATUS_UNKNOWN,
      totalPrice: Number(source.total_price ?? source.totalPrice ?? 0),
      createdAt: String(source.created_at || source.createdAt || ""),
      photos: collectHotQuestionOrderPreviewPhotos(source.items || source.orderItems, HOT_QUESTION_ORDER_CARD_PHOTOS_MAX),
      items: Array.isArray(source.items)
        ? source.items
        : (Array.isArray(source.orderItems) ? source.orderItems : []),
    };
    return preview;
  }

  function cacheHotQuestionOrderPreview(rawOrder) {
    const preview = mapHotQuestionOrderPreview(rawOrder);
    if (!preview) return null;
    hotQuestionOrderCardsCache.set(preview.id, preview);
    return preview;
  }

  function cacheHotQuestionOrderPreviews(rawOrders) {
    if (!Array.isArray(rawOrders)) return [];
    const out = [];
    rawOrders.forEach(function (order) {
      const preview = cacheHotQuestionOrderPreview(order);
      if (preview) out.push(preview);
    });
    return out;
  }

  function extractHotQuestionOrderIdsFromText(value) {
    const text = String(value || "");
    if (!text) return [];
    const found = [];
    const seen = new Set();
    const pattern = /#\s*(\d{1,12})/g;
    let match = pattern.exec(text);
    while (match) {
      const id = toPositiveOrderId(match[1]);
      if (id && !seen.has(id)) {
        seen.add(id);
        found.push(id);
      }
      match = pattern.exec(text);
    }
    return found;
  }

  function resolveHotQuestionOrderCardIdsByMessageId(messageId) {
    const id = String(messageId || "");
    if (!id) return [];
    const match = id.match(HOT_QUESTION_ORDER_CARD_MESSAGE_RE);
    if (!match) return [];
    const raw = String(match[1] || "");
    if (!raw) return [];
    const seen = new Set();
    return raw
      .split("_")
      .map(function (part) { return toPositiveOrderId(part); })
      .filter(function (orderId) {
        if (!orderId || seen.has(orderId)) return false;
        seen.add(orderId);
        return true;
      });
  }

  function resolveHotQuestionOrderCardPreviews(entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    const ids = [];
    const seen = new Set();

    resolveHotQuestionOrderCardIdsByMessageId(source.id).forEach(function (orderId) {
      if (!orderId || seen.has(orderId)) return;
      seen.add(orderId);
      ids.push(orderId);
    });
    if (!ids.length) return [];

    extractHotQuestionOrderIdsFromText(source.text).forEach(function (id) {
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });

    return ids.map(function (orderId) {
      return {
        orderId: orderId,
        preview: hotQuestionOrderCardsCache.get(orderId) || null,
      };
    });
  }

  async function fetchHotQuestionOrderPreviewById(orderId) {
    const safeOrderId = toPositiveOrderId(orderId);
    if (!safeOrderId) return null;
    const json = await chatApiJson(
      "/api/public/me/orders/" + encodeURIComponent(String(safeOrderId)) + "?_ts=" + Date.now()
    );
    const order = json && json.data ? json.data : null;
    return cacheHotQuestionOrderPreview(order);
  }

  async function ensureHotQuestionOrderCardPreview(orderId) {
    const safeOrderId = toPositiveOrderId(orderId);
    if (!safeOrderId) return null;
    if (hotQuestionOrderCardsCache.has(safeOrderId)) {
      return hotQuestionOrderCardsCache.get(safeOrderId) || null;
    }
    if (hotQuestionOrderCardsFetchInFlight.has(safeOrderId)) {
      return hotQuestionOrderCardsFetchInFlight.get(safeOrderId);
    }
    const pending = fetchHotQuestionOrderPreviewById(safeOrderId)
      .then(function (preview) {
        hotQuestionOrderCardsCache.set(safeOrderId, preview || null);
        return preview || null;
      })
      .catch(function () {
        hotQuestionOrderCardsCache.set(safeOrderId, null);
        return null;
      })
      .finally(function () {
        hotQuestionOrderCardsFetchInFlight.delete(safeOrderId);
      });
    hotQuestionOrderCardsFetchInFlight.set(safeOrderId, pending);
    return pending;
  }

  async function fetchActiveOrdersForHotQuestion() {
    const qs = new URLSearchParams({
      limit: "200",
      offset: "0",
      status_is_final: "0",
      _ts: String(Date.now()),
    });
    const json = await chatApiJson("/api/public/me/orders?" + qs.toString());
    const rows = Array.isArray(json && json.data) ? json.data : [];
    return rows;
  }

  async function fetchActiveOrdersByPhoneForHotQuestion(phone) {
    const normalizedPhone = normalizePhoneForHotQuestion(phone);
    if (!normalizedPhone) return [];
    const qs = new URLSearchParams({
      phone: normalizedPhone,
      limit: "200",
      _ts: String(Date.now()),
    });
    const json = await chatApiJson("/api/public/orders/by-phone?" + qs.toString());
    const rows = Array.isArray(json && json.data) ? json.data : [];
    return rows;
  }

  function normalizePhoneForHotQuestion(value) {
    const digits = String(value || "").replace(/\D+/g, "");
    if (!digits) return "";
    if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
      return "7" + digits.slice(1);
    }
    if (digits.length === 10) {
      return "7" + digits;
    }
    if (digits.length > 11) {
      const tail11 = digits.slice(-11);
      if (/^[78]\d{10}$/.test(tail11)) return "7" + tail11.slice(1);
      const tail10 = digits.slice(-10);
      if (/^\d{10}$/.test(tail10)) return "7" + tail10;
    }
    return digits.length >= 10 ? digits : "";
  }

  function extractPhoneCandidateFromHotQuestionText(value) {
    const source = String(value || "");
    if (!source) return "";
    const matches = source.match(HOT_QUESTION_PHONE_PATTERN) || [];
    for (let idx = 0; idx < matches.length; idx += 1) {
      const normalized = normalizePhoneForHotQuestion(matches[idx]);
      if (normalized) return normalized;
    }
    return normalizePhoneForHotQuestion(source);
  }

  function buildWhereIsOrderGuestReply() {
    return HOT_QUESTION_GUEST_PHONE_REPLY;
  }

  function buildWhereIsOrderReplyFromOrders(activeOrders) {
    if (!Array.isArray(activeOrders) || activeOrders.length === 0) {
      return getGenderedAssistantText(
        HOT_QUESTION_NO_ACTIVE_ORDERS_REPLY,
        HOT_QUESTION_NO_ACTIVE_ORDERS_REPLY_FEMALE
      );
    }
    return getGenderedAssistantText(
      HOT_QUESTION_ORDER_LIST_PREFIX,
      HOT_QUESTION_ORDER_LIST_PREFIX_FEMALE
    );
  }

  function buildWhereIsOrderReplyPayloadFromOrders(activeOrders) {
    const safeOrders = Array.isArray(activeOrders) ? activeOrders : [];
    const orderCards = cacheHotQuestionOrderPreviews(safeOrders);
    return {
      text: buildWhereIsOrderReplyFromOrders(safeOrders),
      orderCards: orderCards,
    };
  }

  async function buildWhereIsOrderAutoReplyPayload(options) {
    const opts = options && typeof options === "object" ? options : {};
    const phoneCandidate = normalizePhoneForHotQuestion(opts.phone);
    try {
      if (phoneCandidate) {
        const byPhoneOrders = await fetchActiveOrdersByPhoneForHotQuestion(phoneCandidate);
        return buildWhereIsOrderReplyPayloadFromOrders(byPhoneOrders);
      }

      if (chatClientProfile && chatClientProfile.isGuest === true) {
        return {
          text: buildWhereIsOrderGuestReply(),
          orderCards: [],
        };
      }
      const token = getCustomerToken();
      if (!token) {
        return {
          text: buildWhereIsOrderGuestReply(),
          orderCards: [],
        };
      }

      const activeOrders = await fetchActiveOrdersForHotQuestion();
      return buildWhereIsOrderReplyPayloadFromOrders(activeOrders);
    } catch (err) {
      const errText = String(err && err.message || "").toUpperCase();
      if (errText.includes("UNAUTHORIZED")) {
        return {
          text: buildWhereIsOrderGuestReply(),
          orderCards: [],
        };
      }
      return {
        text: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c " +
          "\u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043a\u0430\u0437\u0430. " +
          "\u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437 \u0447\u0443\u0442\u044c \u043f\u043e\u0437\u0436\u0435.",
        orderCards: [],
      };
    }
  }

  async function buildWhereIsOrderAutoReplyText(options) {
    const payload = await buildWhereIsOrderAutoReplyPayload(options);
    return String(payload && payload.text || "");
  }

  function pushAssistantAutoReply(activeClientId, text, idSuffix, options) {
    const opts = options && typeof options === "object" ? options : {};
    const readyText = String(text || "").trim();
    if (!readyText) return;
    if (String(getActiveChatClientId() || "") !== String(activeClientId || "")) return;
    let suffix = String(idSuffix || "msg");
    const orderIds = [];
    const seen = new Set();
    (Array.isArray(opts.orderCards) ? opts.orderCards : []).forEach(function (card) {
      const orderId = toPositiveOrderId(card && card.id);
      if (!orderId || seen.has(orderId)) return;
      seen.add(orderId);
      orderIds.push(orderId);
      cacheHotQuestionOrderPreview(card);
    });
    if (orderIds.length) {
      suffix += "-o" + orderIds.join("_");
    }
    pushLiveMessage("agent", readyText, {
      messageId: makeAssistantMessageId(suffix),
      author: String(chatRuntimeSettings.assistantName || DEFAULT_CHAT_ASSISTANT_NAME),
    });
  }

  function findMatchedCustomQuickQuestionConfig(normalizedText) {
    const key = String(normalizedText || "");
    if (!key) return null;
    const configList = Array.isArray(chatRuntimeSettings.quickQuestionsConfig)
      ? chatRuntimeSettings.quickQuestionsConfig
      : [];
    for (let idx = 0; idx < configList.length; idx += 1) {
      const item = configList[idx];
      if (!item || item.enabled === false) continue;
      const id = String(item.id || "").toLowerCase();
      const type = String(item.type || "").toLowerCase();
      if (id === CHAT_QUICK_ORDER_ID || type === "order") continue;
      const questionKey = normalizeHotQuestionKey(item.question);
      if (!questionKey) continue;
      if (key === questionKey || key.includes(questionKey)) return item;
    }
    return null;
  }

  function resolveConfiguredQuickQuestionReply(normalizedText) {
    const matched = findMatchedCustomQuickQuestionConfig(normalizedText);
    if (!matched) return null;
    const answer = normalizeChatQuickQuestionAnswer(matched.answer || "");
    if (!answer) return null;
    return {
      id: String(matched.id || ""),
      text: answer,
    };
  }

  function scheduleAssistantHotQuestionReply(userText) {
    const normalized = normalizeHotQuestionKey(userText);
    if (!normalized) return;

    const activeClientId = String(getActiveChatClientId() || "");
    if (!activeClientId) return;

    const phoneCandidate = extractPhoneCandidateFromHotQuestionText(userText);
    if (phoneCandidate) {
      window.setTimeout(function () {
        buildWhereIsOrderAutoReplyPayload({ phone: phoneCandidate })
          .then(function (payload) {
            pushAssistantAutoReply(
              activeClientId,
              String(payload && payload.text || ""),
              "phone-order",
              { orderCards: Array.isArray(payload && payload.orderCards) ? payload.orderCards : [] }
            );
          })
          .catch(function () {});
      }, 420);
      return;
    }

    if (isWhereIsOrderHotQuestion(normalized)) {
      window.setTimeout(function () {
        buildWhereIsOrderAutoReplyPayload()
          .then(function (payload) {
            pushAssistantAutoReply(
              activeClientId,
              String(payload && payload.text || ""),
              "where-order",
              { orderCards: Array.isArray(payload && payload.orderCards) ? payload.orderCards : [] }
            );
          })
          .catch(function () {});
      }, 420);
      return;
    }

    const quickReply = (
      chatRuntimeSettings.quickQuestionsEnabled === false
    )
      ? null
      : resolveConfiguredQuickQuestionReply(normalized);
    if (quickReply && quickReply.text) {
      const suffixSource = String(quickReply.id || "custom");
      const suffixSafe = suffixSource.replace(/[^\w-]+/g, "").slice(0, 32) || "custom";
      window.setTimeout(function () {
        pushAssistantAutoReply(activeClientId, quickReply.text, "quick-" + suffixSafe);
      }, 360);
      return;
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
    playOutgoingMessageSendTone();
    if (trimmed) {
      scheduleAssistantHotQuestionReply(trimmed);
    }
    stopLocalTypingSession({ flush: true });
    clearReplyDraft();
    return true;
  }

  function getAttachPreviewTitle(count) {
    const total = Number(count) || 0;
    if (total <= 1) return "1 \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u044f";
    if (total >= 2 && total <= 4) return String(total) + " \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438";
    return String(total) + " \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0439";
  }

  function clearAttachPreviewObjectUrls() {
    if (!Array.isArray(attachPreviewObjectUrls) || !attachPreviewObjectUrls.length) return;
    attachPreviewObjectUrls.forEach(function (url) {
      try { URL.revokeObjectURL(String(url || "")); } catch {}
    });
    attachPreviewObjectUrls = [];
  }

  function closeAttachPreview(options) {
    const opts = options || {};
    const clearItems = opts.clearItems !== false;
    const focusComposer = opts.focusComposer !== false;
    const clearCaption = opts.clearCaption !== false;

    attachPreviewOverlay.classList.add("hidden");
    attachPreviewOverlay.setAttribute("aria-hidden", "true");

    if (clearItems) {
      clearAttachPreviewObjectUrls();
      attachPreviewItems = [];
      attachPreviewActiveIndex = 0;
      attachPreviewSourceFiles = [];
      attachPreviewSending = false;
    }
    if (clearCaption) {
      attachPreviewCaption.value = "";
    }

    attachPreviewThumbs.innerHTML = "";
    attachPreviewThumbs.classList.add("hidden");
    attachPreviewSendBtn.disabled = false;
    if (emojiPopover.classList.contains("is-attach-preview")) hideEmojiPopover();
    attachInput.value = "";
    if (focusComposer && !input.disabled) input.focus();
  }

  function isMessageImageViewerOpen() {
    return !imageViewerOverlay.classList.contains("hidden");
  }

  function syncMessageImageViewerViewportMode() {
    if (!modal || !modal.classList) return;
    const useDesktopViewport = isMessageImageViewerOpen() && !isMobileChatViewport();
    modal.classList.toggle("is-image-viewer-open", useDesktopViewport);
  }

  function clearMessageImageViewerLayout() {
    imageViewerOverlay.style.removeProperty("--chat-image-viewer-max-width");
    imageViewerOverlay.style.removeProperty("--chat-image-viewer-max-height");
    imageViewerOverlay.style.removeProperty("--chat-image-viewer-target-width");
    imageViewerOverlay.style.removeProperty("--chat-image-viewer-target-height");
  }

  function updateMessageImageViewerLayout() {
    if (!isMessageImageViewerOpen()) return;
    if (!imageViewerOverlay || !imageViewerOverlay.isConnected) return;
    const naturalWidth = Number(imageViewerImage.naturalWidth || 0);
    const naturalHeight = Number(imageViewerImage.naturalHeight || 0);
    if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) return;

    const overlayRect = imageViewerOverlay.getBoundingClientRect();
    const overlayWidth = Number(overlayRect && overlayRect.width || 0);
    const overlayHeight = Number(overlayRect && overlayRect.height || 0);
    const viewportWidth = overlayWidth > 0
      ? overlayWidth
      : Math.max(
        Number(window.innerWidth || 0),
        Number(document.documentElement && document.documentElement.clientWidth || 0)
      );
    const viewportHeight = overlayHeight > 0
      ? overlayHeight
      : Math.max(
        Number(window.innerHeight || 0),
        Number(document.documentElement && document.documentElement.clientHeight || 0)
      );
    if (!viewportWidth || !viewportHeight) return;

    const compact = viewportWidth <= 640;
    const padding = compact ? 12 : 18;
    const closeButtonReserve = compact ? 18 : 24;
    const maxWidth = Math.max(220, viewportWidth - padding * 2);
    const maxHeight = Math.max(180, viewportHeight - padding * 2 - closeButtonReserve);
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    const targetWidth = Math.max(160, Math.round(naturalWidth * scale));
    const targetHeight = Math.max(120, Math.round(naturalHeight * scale));

    imageViewerOverlay.style.setProperty("--chat-image-viewer-max-width", maxWidth + "px");
    imageViewerOverlay.style.setProperty("--chat-image-viewer-max-height", maxHeight + "px");
    imageViewerOverlay.style.setProperty("--chat-image-viewer-target-width", targetWidth + "px");
    imageViewerOverlay.style.setProperty("--chat-image-viewer-target-height", targetHeight + "px");
  }

  function closeMessageImageViewer() {
    imageViewerOverlay.classList.add("hidden");
    imageViewerOverlay.setAttribute("aria-hidden", "true");
    imageViewerImage.removeAttribute("src");
    clearMessageImageViewerLayout();
    syncMessageImageViewerViewportMode();
  }

  function openMessageImageViewer(imageSrc, imageAlt) {
    const src = String(imageSrc || "").trim();
    if (!src) return false;
    clearMessageImageViewerLayout();
    imageViewerImage.src = src;
    imageViewerImage.alt = String(imageAlt || "Image preview");
    imageViewerOverlay.classList.remove("hidden");
    imageViewerOverlay.setAttribute("aria-hidden", "false");
    syncMessageImageViewerViewportMode();
    if (imageViewerImage.complete) {
      updateMessageImageViewerLayout();
    }
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

    imageViewerImage.addEventListener("load", function () {
      updateMessageImageViewerLayout();
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
      attachPreviewImage.src = getAttachmentImageSrc(active);
      attachPreviewImage.alt = String(active.name || "\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435");
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
        img.src = getAttachmentImageSrc(item);
        img.alt = String(item.name || ("\u0424\u043e\u0442\u043e " + String(idx + 1)));
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
    attachPreviewSending = false;
    attachPreviewSendBtn.disabled = false;
    attachPreviewCaption.value = String(opts.caption || "");

    renderAttachPreview();
    attachPreviewOverlay.classList.remove("hidden");
    attachPreviewOverlay.setAttribute("aria-hidden", "false");
    const shouldFocusCaption = (
      opts.focusCaption === true
      || (opts.focusCaption !== false && !shouldUseNativeMobileEmojiKeyboard())
    );
    if (shouldFocusCaption) {
      attachPreviewCaption.focus();
    } else {
      attachPreviewCaption.blur();
    }
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
      stopLocalTypingSession({ flush: true });
      hideContextMenu();
      hideReactionBar();
      hideEmojiPopover();
      clearReplyDraft();
      playOutgoingMessageSendTone();
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
    clearAttachPreviewObjectUrls();
    attachPreviewSourceFiles = [];

    const prepared = [];
    list.forEach(function (file) {
      if (!(file instanceof File)) return;
      if (!isLikelyImageFile(file)) return;
      const previewAttachment = buildLocalAttachPreviewItemFromFile(file);
      if (!previewAttachment) return;
      prepared.push({ file: file, attachment: previewAttachment });
    });

    if (!prepared.length) return false;
    attachPreviewSourceFiles = prepared.map(function (item) { return item.file; });
    const attachments = prepared.map(function (item) { return item.attachment; });
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
      if (shouldUseNativeMobileEmojiKeyboard()) {
        hideEmojiPopover();
        attachPreviewCaption.focus();
        return;
      }
      toggleEmojiPopover("attach-preview");
      attachPreviewCaption.focus();
    });

    attachPreviewSendBtn.addEventListener("click", async function () {
      if (attachPreviewSending) return;
      const caption = String(attachPreviewCaption.value || "");
      const sourceFiles = Array.isArray(attachPreviewSourceFiles)
        ? attachPreviewSourceFiles.filter(function (file) { return file instanceof File; })
        : [];
      attachPreviewSending = true;
      attachPreviewSendBtn.disabled = true;
      try {
        const sent = sourceFiles.length
          ? await sendImageAttachments(sourceFiles, { caption: caption })
          : sendPreparedImageAttachments(attachPreviewItems, { caption: caption });
        if (sent > 0) {
          closeAttachPreview({ clearCaption: true });
        }
      } finally {
        attachPreviewSending = false;
        if (!attachPreviewOverlay.classList.contains("hidden")) {
          attachPreviewSendBtn.disabled = false;
        }
      }
    });

    attachPreviewCaption.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      attachPreviewSendBtn.click();
    });

    attachPreviewCaption.addEventListener("focus", function () {
      scheduleMobileKeyboardInsetSyncBurst();
    });

    attachPreviewCaption.addEventListener("blur", function () {
      scheduleMobileKeyboardInsetSyncBurst();
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

  function startChatRuntime() {
    preloadEmojiAtlas();
    initMessageAlerts();
    bindEmojiPopoverGuard();
    initAttachPreviewModal();
    initFeedImageDrop();
    initFeedImagePaste();
    initMessageImageViewerModal();
    setupComposerRichPreview();
  // probeEmojiAssetsAvailability intentionally deferred until first chat open
    ensureChatBootstrapLoader();
    renderUnreadBadge(liveEntries);
    if (!chatRuntimeSettings.isEnabled) {
      stopSharedThreadPolling();
      stopUnreadPolling();
      return;
    }
    startUnreadPolling();
  }

  initChatRuntimeSettings({ fetchRemote: true, force: true, refreshUi: true })
    .catch(function () {})
    .finally(function () {
      startChatRuntime();
    });

  if ("serviceWorker" in navigator && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then(function () {
        if (!chatRuntimeSettings.isEnabled) return;
        if (!overlay.classList.contains("is-open")) return;
        queueWebPushSubscriptionSync({
          clientId: getActiveChatClientId(),
          immediate: true,
        });
      })
      .catch(function () {});
  }

  openBtn.addEventListener("click", function (event) {
    if (!chatRuntimeSettings.isEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    initChatRuntimeSettings({ fetchRemote: true, force: true, refreshUi: true }).catch(function () {});
    openCompanyChat();
  });

  closeBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
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
    stopUnreadPolling();
    startSharedThreadPolling();
    pullSharedThreadFromServer({ force: true })
      .catch(function () {
        syncVisibleChatReadState();
      });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") {
      stopSharedThreadPolling();
      stopLocalTypingSession({ flush: true, keepalive: true });
      if (!overlay.classList.contains("is-open")) {
        startUnreadPolling();
      }
      return;
    }
    if (overlay.classList.contains("is-open")) {
      syncReadOnForeground();
      return;
    }
    startUnreadPolling();
  });

  window.addEventListener("focus", function () {
    if (overlay.classList.contains("is-open")) {
      refreshChatClientProfileIfNeeded({ pull: false });
      queueWebPushSubscriptionSync({
        clientId: getActiveChatClientId(),
        immediate: true,
      });
      syncReadOnForeground();
      return;
    }
    startUnreadPolling();
  });

  window.addEventListener("pagehide", function () {
    stopSharedThreadPolling();
    stopUnreadPolling();
    stopLocalTypingSession({ flush: true, keepalive: true });
    if (overlay.classList.contains("is-open")) {
      saveFeedScrollPosition({ persist: true });
    } else {
      persistFeedScrollPositionSnapshot();
    }
    if (!overlay.classList.contains("is-open")) return;
    syncVisibleChatReadState({ force: true, flushRemote: true, preserveViewport: true });
  });

  window.addEventListener("beforeunload", function () {
    stopSharedThreadPolling();
    stopUnreadPolling();
    stopLocalTypingSession({ flush: true, keepalive: true });
    if (overlay.classList.contains("is-open")) {
      saveFeedScrollPosition({ persist: true });
    } else {
      persistFeedScrollPositionSnapshot();
    }
  });

  window.addEventListener("storage", function (event) {
    const key = String(event && event.key || "");
    if (key === "tenant") {
      initChatRuntimeSettings({ fetchRemote: false, refreshUi: true }).catch(function () {});
      if (!overlay.classList.contains("is-open")) {
        startUnreadPolling();
      }
      return;
    }
    if (key && key !== customerTokenKey && key !== customerCacheKey && key !== guestChatClientKey) return;
    refreshChatClientProfileIfNeeded({ pull: overlay.classList.contains("is-open") });
    if (!overlay.classList.contains("is-open")) {
      unreadStatePrimed = false;
      startUnreadPolling();
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

  function clearOrderCardMouseDrag(options) {
    const state = orderCardMouseDrag;
    if (!state) return;
    const opts = options || {};
    const strip = state.strip;
    if (strip && strip.classList) {
      strip.classList.remove("is-mouse-dragging");
    }
    if (opts.suppressClick === true && state.didDrag === true) {
      suppressTapUntil = Math.max(
        suppressTapUntil,
        Date.now() + ORDER_CARD_MOUSE_DRAG_SUPPRESS_CLICK_MS
      );
    }
    orderCardMouseDrag = null;
  }

  renderReplyDraftUi();

  composer.addEventListener("submit", function (event) {
    event.preventDefault();
    const done = sendUserMessage(input.value);
    if (!done) return;
    stopLocalTypingSession({ flush: true });
    input.value = "";
    syncComposerRichPreview({});
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const done = sendUserMessage(input.value);
      if (!done) return;
      stopLocalTypingSession({ flush: true });
      input.value = "";
      syncComposerRichPreview({});
      return;
    }

    if (event.key === "Escape" && editingMessageId) {
      event.preventDefault();
      cancelEditingMessage();
      input.value = "";
      stopLocalTypingSession({ flush: true });
      syncComposerRichPreview({});
      return;
    }

    if (event.key === "Escape" && replyDraft) {
      event.preventDefault();
      clearReplyDraft();
    }
  });

  input.addEventListener("input", function () {
    handleComposerTypingActivity();
  });

  input.addEventListener("focus", function () {
    scheduleMobileKeyboardInsetSyncBurst();
  });

  input.addEventListener("blur", function () {
    scheduleLocalTypingStop(CHAT_TYPING_BLUR_STOP_MS);
    scheduleMobileKeyboardInsetSyncBurst();
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
    if (shouldUseNativeMobileEmojiKeyboard()) {
      hideEmojiPopover();
      input.focus();
      return;
    }
    toggleEmojiPopover("composer");
    const isMobileSheetOpen = (
      isMobileChatViewport()
      && !emojiPopover.classList.contains("hidden")
      && emojiPopover.classList.contains("is-mobile-sheet")
    );
    if (isMobileSheetOpen) {
      input.blur();
    } else {
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

    const orderCardButton = event.target.closest("[data-chat-order-card-id]");
    if (orderCardButton) {
      const orderId = toPositiveOrderId(orderCardButton.getAttribute("data-chat-order-card-id"));
      if (orderId) {
        openChatOrderDetailsView(orderId).catch(function () {});
      }
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
    const inOrderCards =
      !!event.target.closest(".shop-company-chat-order-card-strip")
      || !!event.target.closest(".shop-company-chat-order-card")
      || bubble.classList.contains("shop-company-chat-bubble--order-card");
    if (inOrderCards) {
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

  thread.addEventListener("mousedown", function (event) {
    if (event.button !== 0) return;
    const targetEl = event.target && event.target.closest ? event.target : null;
    if (!targetEl) return;
    const orderStrip = targetEl.closest(".shop-company-chat-order-card-strip");
    if (!orderStrip) return;
    const maxLeft = Math.max(0, orderStrip.scrollWidth - orderStrip.clientWidth);
    if (maxLeft <= 0) return;

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

  document.addEventListener("mousemove", function (event) {
    const state = orderCardMouseDrag;
    if (!state || !state.strip || !state.strip.isConnected) return;

    const dx = Number(event.clientX || 0) - state.startX;
    const dy = Number(event.clientY || 0) - state.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!state.active) {
      if (absX < ORDER_CARD_MOUSE_DRAG_START_PX && absY < ORDER_CARD_MOUSE_DRAG_START_PX) return;
      if (absY > absX) {
        clearOrderCardMouseDrag();
        return;
      }
      state.active = true;
      state.strip.classList.add("is-mouse-dragging");
    }

    event.preventDefault();
    const maxLeft = Math.max(0, state.strip.scrollWidth - state.strip.clientWidth);
    const nextLeft = Math.max(0, Math.min(maxLeft, state.startLeft - dx));
    const prevLeft = Math.max(0, Number(state.strip.scrollLeft || 0));
    if (Math.abs(nextLeft - prevLeft) > 0.1) {
      state.strip.scrollLeft = nextLeft;
      state.didDrag = true;
    }
  });

  document.addEventListener("mouseup", function () {
    if (!orderCardMouseDrag) return;
    const shouldSuppressClick = orderCardMouseDrag.didDrag === true;
    clearOrderCardMouseDrag({ suppressClick: shouldSuppressClick });
  });

  thread.addEventListener("dragstart", function (event) {
    const targetEl = event.target && event.target.closest ? event.target : null;
    if (!targetEl) return;
    if (!targetEl.closest(".shop-company-chat-order-card-strip")) return;
    event.preventDefault();
  });

  thread.addEventListener("wheel", function (event) {
    const targetEl = event.target && event.target.closest ? event.target : null;
    if (!targetEl) return;
    const orderStrip = targetEl.closest(".shop-company-chat-order-card-strip");
    if (!orderStrip) return;

    const deltaX = Number(event.deltaX || 0);
    const deltaY = Number(event.deltaY || 0);
    if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) return;

    const prefersHorizontal = event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY);
    const horizontalDelta = prefersHorizontal
      ? (deltaX + (event.shiftKey ? deltaY : 0))
      : deltaY;

    if (Math.abs(horizontalDelta) >= 0.01) {
      const maxLeft = Math.max(0, orderStrip.scrollWidth - orderStrip.clientWidth);
      const prevLeft = Math.max(0, Number(orderStrip.scrollLeft || 0));
      const nextLeft = Math.max(0, Math.min(maxLeft, prevLeft + horizontalDelta));
      if (Math.abs(nextLeft - prevLeft) > 0.1) {
        orderStrip.scrollLeft = nextLeft;
        event.preventDefault();
        return;
      }
    }

    if (!prefersHorizontal) {
      const maxTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
      if (maxTop <= 0) return;
      const prevTop = Math.max(0, Number(feed.scrollTop || 0));
      const nextTop = Math.max(0, Math.min(maxTop, prevTop + deltaY));
      if (Math.abs(nextTop - prevTop) < 0.1) return;
      feed.scrollTop = nextTop;
      event.preventDefault();
    }
  }, { passive: false });

  reactionBar.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-reaction]");
    if (!btn) return;
    const reaction = String(btn.getAttribute("data-reaction") || "");
    if (!reaction) return;
    if (reaction === "__toggle_more__") {
      event.preventDefault();
      event.stopPropagation();
      hideContextMenu();
      const nextExpanded = !reactionBar.classList.contains("is-expanded");
      setReactionBarExpanded(nextExpanded);
      if (nextExpanded && reactionMessageId) {
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
    if (
      !emojiPopover.classList.contains("hidden")
      && !emojiPopover.classList.contains("is-mobile-sheet")
    ) {
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
    scheduleMobileKeyboardInsetSync();
    scheduleScrollDownComposerExtraOffsetSync();
    const feedBottomDistance = getFeedBottomDistanceSnapshot();
    hideContextMenu();
    hideReactionBar();
    const keepMobileEmojiSheetOpen = (
      isMobileChatViewport()
      && !emojiPopover.classList.contains("hidden")
      && emojiPopover.classList.contains("is-mobile-sheet")
      && !emojiPopover.classList.contains("is-attach-preview")
    );
    if (keepMobileEmojiSheetOpen) {
      requestAnimationFrame(function () {
        syncEmojiPickerViewportPosition();
        if (feedBottomDistance != null) stabilizeFeedBottomDistance(feedBottomDistance, 220);
      });
    } else {
      hideEmojiPopover();
    }
    clearTouchGesture();
    clearOrderCardMouseDrag();
    syncMessageImageViewerViewportMode();
    if (isMessageImageViewerOpen()) updateMessageImageViewerLayout();
    scheduleMobileKeyboardInsetSyncBurst();
    scheduleScrollDownComposerExtraOffsetSync();
  });

  window.addEventListener("blur", function () {
    clearOrderCardMouseDrag();
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

