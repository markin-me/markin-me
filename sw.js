self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    var coreCache = await caches.open(CORE_CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map(function (assetUrl) {
      return coreCache.add(assetUrl);
    }));
    await warmCourierScreenHtml();
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (key) {
      if (ACTIVE_CACHE_NAMES.indexOf(key) === -1) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (!request || request.method !== "GET") return;

  var requestUrl;
  try {
    requestUrl = new URL(request.url);
  } catch (err) {
    return;
  }

  if (isCacheableImageRequest(requestUrl, request)) {
    event.respondWith(cacheImageRequest(request));
    return;
  }

  if (isCourierHtmlRequest(request, requestUrl)) {
    event.respondWith(networkFirst(request, HTML_CACHE_NAME));
    return;
  }

  if (requestUrl.pathname === "/manifest.json") {
    event.respondWith(fetch(request));
    return;
  }

  if (isStaticAssetRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, CORE_CACHE_NAME));
    return;
  }

  if (isFontAwesomeRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE_NAME));
  }
});

self.addEventListener("push", function (event) {
  var payload = {};
  try {
    payload = event && event.data ? event.data.json() : {};
  } catch (e1) {
    try {
      payload = { body: event && event.data ? event.data.text() : "" };
    } catch (e2) {
      payload = {};
    }
  }
  var title = String((payload && payload.title) || "\u041d\u043e\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435");
  var body = String((payload && payload.body) || "");
  var tag = String((payload && payload.tag) || "chat-message");
  var url = String((payload && payload.url) || "/shop");
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
      body: body,
      tag: tag,
      renotify: true,
      silent: false,
      vibrate: [140, 50, 140],
      data: {
        url: url,
        type: String((payload && payload.type) || ""),
        client_id: normalizeNotificationClientId(payload && payload.client_id),
        message_id: String((payload && payload.message_id) || "").trim().slice(0, 120),
        open_chat: payload && payload.open_chat === true,
        important_message_id: normalizeImportantMessageId(payload && payload.important_message_id),
        store_id: normalizeImportantMessageId(payload && payload.store_id),
        open_important_messages: payload && payload.open_important_messages === true,
      },
      }),
      notifyImportantMessageClients(payload),
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification && event.notification.data ? event.notification.data : {};
  var targetUrl = buildNotificationTargetUrl(data);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      var matchedClient = findNotificationClientByPath(clientList, targetUrl);
      if (matchedClient) {
        return Promise.resolve(
          typeof matchedClient.focus === "function" ? matchedClient.focus() : matchedClient
        ).then(function (client) {
          var targetClient = client || matchedClient;
          try {
            if (targetClient && typeof targetClient.postMessage === "function") {
              targetClient.postMessage(buildNotificationPostMessageData(data));
            }
          } catch {}
          return targetClient;
        });
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    })
  );
});

function normalizeNotificationClientId(value) {
  var n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.trunc(n));
}

function normalizeImportantMessageId(value) {
  var n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.trunc(n));
}

function notifyImportantMessageClients(payload) {
  var importantMessageId = normalizeImportantMessageId(payload && payload.important_message_id);
  var isImportantMessage = !!(payload && payload.open_important_messages === true)
    || String((payload && payload.type) || "").trim().toLowerCase() === "important_message"
    || !!importantMessageId;
  if (!isImportantMessage) return Promise.resolve();
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
    var data = {
      type: "important-message-notification-received",
      payload: {
        important_message_id: importantMessageId,
        store_id: normalizeImportantMessageId(payload && payload.store_id),
      },
    };
    clientList.forEach(function (client) {
      try {
        if (client && typeof client.postMessage === "function") client.postMessage(data);
      } catch {}
    });
  });
}

function parseSameOriginNotificationUrl(urlValue) {
  try {
    var parsed = new URL(String(urlValue || ""), self.location.origin);
    if (parsed.origin !== self.location.origin) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function buildNotificationTargetUrl(data) {
  var baseUrl = data && data.url ? String(data.url) : "/shop";
  var parsed = parseSameOriginNotificationUrl(baseUrl);
  if (!parsed) return baseUrl;
  var type = String((data && data.type) || "").trim().toLowerCase();
  var shouldOpenChat = !!(data && data.open_chat === true && type === "chat_message");
  var importantMessageId = normalizeImportantMessageId(data && data.important_message_id);
  var importantStoreId = normalizeImportantMessageId(data && data.store_id);
  var shouldOpenImportant = !!(data && data.open_important_messages === true)
    || type === "important_message"
    || !!importantMessageId;
  if (shouldOpenChat) {
    parsed.searchParams.set("open_chat", "1");
    parsed.searchParams.set("chat_source", "push");
    var clientId = normalizeNotificationClientId(data && data.client_id);
    if (clientId) parsed.searchParams.set("chat_client_id", clientId);
    var messageId = String((data && data.message_id) || "").trim();
    if (messageId) parsed.searchParams.set("chat_message_id", messageId.slice(0, 120));
  }
  if (shouldOpenImportant) {
    parsed.searchParams.set("open_important_messages", "1");
    if (importantMessageId) parsed.searchParams.set("important_message_id", importantMessageId);
    if (importantStoreId) parsed.searchParams.set("important_store_id", importantStoreId);
  }
  return parsed.pathname + parsed.search + parsed.hash;
}

function findNotificationClientByPath(clientList, targetUrl) {
  var targetParsed = parseSameOriginNotificationUrl(targetUrl);
  var targetPath = targetParsed ? String(targetParsed.pathname || "") : "";
  if (!targetPath) return null;
  for (var i = 0; i < clientList.length; i += 1) {
    var client = clientList[i];
    if (!client || !client.url) continue;
    var clientParsed = parseSameOriginNotificationUrl(client.url);
    if (!clientParsed) continue;
    if (String(clientParsed.pathname || "") === targetPath) {
      return client;
    }
  }
  return null;
}

function buildNotificationPostMessageData(data) {
  var importantMessageId = normalizeImportantMessageId(data && data.important_message_id);
  var isImportantMessage = !!(data && data.open_important_messages === true)
    || String((data && data.type) || "").trim().toLowerCase() === "important_message"
    || !!importantMessageId;
  return {
    type: isImportantMessage ? "important-message-notification-click" : "chat-notification-click",
    payload: {
      type: String((data && data.type) || ""),
      open_chat: data && data.open_chat === true,
      chat_source: "push",
      chat_client_id: normalizeNotificationClientId(data && data.client_id),
      chat_message_id: String((data && data.message_id) || "").trim().slice(0, 120),
      open_important_messages: isImportantMessage,
      important_message_id: importantMessageId,
      store_id: normalizeImportantMessageId(data && data.store_id),
      url: String((data && data.url) || ""),
    },
  };
}

var SW_VERSION = "courier-screen-v1";
var CORE_CACHE_NAME = "core-" + SW_VERSION;
var HTML_CACHE_NAME = "html-" + SW_VERSION;
var FONT_CACHE_NAME = "font-" + SW_VERSION;
var IMAGE_CACHE_NAME = "markinme-images-v1";
var ACTIVE_CACHE_NAMES = [CORE_CACHE_NAME, HTML_CACHE_NAME, FONT_CACHE_NAME, IMAGE_CACHE_NAME];
var COURIER_SCREEN_PATH = "/dashboard/courier-screen";
var CORE_ASSETS = [
  "/static/css/style.css",
  "/static/js/auth.js",
  "/static/js/current-time.js",
  "/static/js/theme.js",
  "/static/js/sidebar.js",
  "/static/js/admin-mobile-nav.js",
  "/static/js/chat-sidebar-badge.js",
  "/static/js/appModal.js",
  "/static/js/shared-order-panel.js",
  "/static/js/shared-order-payment.js",
  "/static/js/new-order.js",
  "/static/js/courier-screen.js",
  "/static/js/orders.js",
];

function isSameOrigin(url) {
  return url && url.origin === self.location.origin;
}

function isCourierHtmlRequest(request, url) {
  return request.mode === "navigate"
    && isSameOrigin(url)
    && url.pathname === COURIER_SCREEN_PATH;
}

function isStaticAssetRequest(url) {
  if (!isSameOrigin(url)) return false;
  return url.pathname.indexOf("/static/") === 0;
}

function isFontAwesomeRequest(url) {
  return url && url.hostname === "cdnjs.cloudflare.com";
}

function isCacheableImageRequest(requestUrl, request) {
  if (!requestUrl || !request) return false;
  if (request.method !== "GET") return false;
  if (request.destination !== "image") return false;
  if (!isSameOrigin(requestUrl)) return false;
  return /\/(?:uploads|static\/uploads)\//i.test(requestUrl.pathname);
}

async function cacheImageRequest(request) {
  var cache = await caches.open(IMAGE_CACHE_NAME);
  var cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  var networkResponse = await fetch(request);
  if (
    networkResponse
    && networkResponse.status === 200
    && networkResponse.type === "basic"
  ) {
    cache.put(request, networkResponse.clone()).catch(function () {});
  }
  return networkResponse;
}

async function networkFirst(request, cacheName) {
  var cache = await caches.open(cacheName);
  try {
    var networkResponse = await fetch(request);
    if (shouldCacheResponse(networkResponse)) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    var cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  var cache = await caches.open(cacheName);
  var cachedResponse = await cache.match(request);
  var networkPromise = fetch(request)
    .then(function (networkResponse) {
      if (shouldCacheResponse(networkResponse)) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(function () {
      return null;
    });

  if (cachedResponse) {
    return cachedResponse;
  }

  var networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  return fetch(request);
}

function shouldCacheResponse(response) {
  if (!response) return false;
  if (response.type === "opaque") return true;
  // Cache API does not support storing partial content responses (206).
  return response.status === 200;
}

async function warmCourierScreenHtml() {
  var htmlCache = await caches.open(HTML_CACHE_NAME);
  try {
    var response = await fetch(COURIER_SCREEN_PATH, { credentials: "same-origin" });
    if (response && response.ok && response.redirected !== true) {
      await htmlCache.put(COURIER_SCREEN_PATH, response.clone());
    }
  } catch (error) {
    return null;
  }
  return null;
}
