self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function () {});

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
