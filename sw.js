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

  if (isCourierHtmlRequest(request, requestUrl)) {
    event.respondWith(networkFirst(request, HTML_CACHE_NAME));
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
    self.registration.showNotification(title, {
      body: body,
      tag: tag,
      renotify: true,
      silent: false,
      vibrate: [140, 50, 140],
      data: { url: url },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification && event.notification.data ? event.notification.data : {};
  var targetUrl = data && data.url ? String(data.url) : "/shop";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i += 1) {
        var client = clientList[i];
        if (!client || !client.url) continue;
        if (client.url.indexOf(targetUrl) !== -1) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    })
  );
});

var SW_VERSION = "courier-screen-v1";
var CORE_CACHE_NAME = "core-" + SW_VERSION;
var HTML_CACHE_NAME = "html-" + SW_VERSION;
var FONT_CACHE_NAME = "font-" + SW_VERSION;
var ACTIVE_CACHE_NAMES = [CORE_CACHE_NAME, HTML_CACHE_NAME, FONT_CACHE_NAME];
var COURIER_SCREEN_PATH = "/dashboard/courier-screen";
var CORE_ASSETS = [
  "/manifest.json",
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
  return url.pathname === "/manifest.json" || url.pathname.indexOf("/static/") === 0;
}

function isFontAwesomeRequest(url) {
  return url && url.hostname === "cdnjs.cloudflare.com";
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
