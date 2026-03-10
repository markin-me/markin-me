(function () {
  const navLink = document.getElementById("sidebarOrdersNavLink");
  const badge = document.getElementById("sidebarOrdersUnreadBadge");
  if (!navLink || !badge) return;

  const API_BASE = "/api/admin/orders";
  const FALLBACK_POLL_MS = 5000;
  const WAIT_TIMEOUT_MS = 20000;
  const WAIT_RETRY_MS = 1200;

  let inFlight = false;
  let waitLoopStarted = false;
  let waitLoopToken = 0;
  let waitSupported = true;
  let cursor = 0;
  let unreadPrimed = false;
  let currentNewCount = 0;
  let audioUnlocked = false;

  function money(value) {
    const n = Number(value || 0);
    const safe = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(safe) + " ₽";
  }

  function getTenantId() {
    const meta = document.querySelector('meta[name="tenant_id"]');
    if (meta && meta.content) {
      const n = Number(meta.content);
      if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
    }
    try {
      const tenant = JSON.parse(localStorage.getItem("tenant") || "{}");
      const n = Number(tenant && tenant.id);
      if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
    } catch {}
    return "1";
  }

  function getStoreId() {
    const n = Number(localStorage.getItem("activeStoreId") || "1");
    return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : "1";
  }

  function getHeaders() {
    const headers = {
      "x-tenant-id": getTenantId(),
      "x-store-id": getStoreId(),
    };
    const token = localStorage.getItem("authToken");
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function getTenantOrderSoundUrl() {
    try {
      const raw = localStorage.getItem("tenant");
      if (!raw) return "";
      const tenant = JSON.parse(raw);
      return String((tenant && tenant.sound_new_order_url) || "").trim();
    } catch {
      return "";
    }
  }

  function requestNotificationPermissionSafe() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try {
      const p = Notification.requestPermission();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch {}
  }

  function unlockAlertsOnce() {
    const soundUrl = getTenantOrderSoundUrl();
    if (soundUrl) {
      try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.001;
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            audioUnlocked = true;
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch {}
          }).catch(() => {});
        }
      } catch {}
    }
    requestNotificationPermissionSafe();
  }

  function playNewOrderSound() {
    const soundUrl = getTenantOrderSoundUrl();
    if (!soundUrl || !audioUnlocked) return;
    try {
      const audio = new Audio(soundUrl);
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  function showNewOrderNotification(orders) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!Array.isArray(orders) || orders.length <= 0) return;
    const inc = Math.max(1, Number(orders.length || 1));
    const first = orders[0] || {};
    const orderId = Number(first.id || first.order_id || 0);
    const total = Number(first.total_price || first.total || 0);
    const title = "Новый заказ";
    const body = inc === 1
      ? (orderId > 0 ? `Заказ #${orderId} — ${money(total)}` : "Поступил новый заказ")
      : `${inc} новых заказов`;
    try {
      const n = new Notification(title, { body, silent: true });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    } catch {}
  }

  function updateNewOrdersCount(nextCount) {
    const n = Math.max(0, Number(nextCount || 0));
    if (!unreadPrimed) {
      unreadPrimed = true;
      currentNewCount = n;
      return;
    }
    currentNewCount = n;
  }

  function hideBadge() {
    badge.textContent = "";
    badge.classList.add("hidden");
    navLink.removeAttribute("data-unread-count");
  }

  function showBadge(totalNew) {
    const n = Number(totalNew || 0);
    if (!Number.isFinite(n) || n <= 0) {
      hideBadge();
      return;
    }
    const text = n > 99 ? "99+" : String(Math.trunc(n));
    badge.textContent = text;
    badge.classList.remove("hidden");
    navLink.setAttribute("data-unread-count", text);
  }

  function sleepMs(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
    });
  }

  async function pullNewOrdersCount() {
    if (inFlight) return;
    inFlight = true;
    try {
      const qs = new URLSearchParams({ _ts: String(Date.now()) });
      const res = await fetch(API_BASE + "/new-count?" + qs.toString(), {
        method: "GET",
        headers: getHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) hideBadge();
        return;
      }
      const json = await res.json().catch(() => null);
      const total = Number(json?.data?.total || 0);
      updateNewOrdersCount(total);
      showBadge(total);
    } catch {
      // keep last state on transient errors
    } finally {
      inFlight = false;
    }
  }

  async function waitForOrdersChange() {
    if (!waitSupported) return { changed: false, cursor };
    const qs = new URLSearchParams({
      since: String(Number(cursor || 0)),
      timeout_ms: String(Math.max(1000, WAIT_TIMEOUT_MS)),
      _ts: String(Date.now()),
    });
    const res = await fetch(API_BASE + "/changes/wait?" + qs.toString(), {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 405 || res.status === 410) {
        waitSupported = false;
        return { changed: false, cursor };
      }
      if (res.status === 401) {
        hideBadge();
        return { changed: false, cursor };
      }
      throw new Error("WAIT_HTTP_" + String(res.status || 0));
    }
    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) return { changed: false, cursor };
    const nextCursor = Number(json?.data?.cursor || 0);
    return {
      changed: json?.data?.changed === true,
      cursor: Number.isFinite(nextCursor) && nextCursor > 0 ? nextCursor : cursor,
      resetRequired: json?.data?.reset_required === true,
      reason: String(json?.data?.reason || "").trim() || null,
    };
  }

  async function fetchOrdersChanges(sinceCursor) {
    const since = Number(sinceCursor || 0);
    const qs = new URLSearchParams({
      since: String(Number.isFinite(since) && since > 0 ? since : 0),
      _ts: String(Date.now()),
    });
    const res = await fetch(API_BASE + "/changes?" + qs.toString(), {
      method: "GET",
      headers: getHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 405 || res.status === 410) {
        waitSupported = false;
      }
      if (res.status === 401) {
        hideBadge();
      }
      return {
        events: [],
        cursor,
        resetRequired: false,
        reason: null,
      };
    }
    const json = await res.json().catch(() => null);
    const events = Array.isArray(json?.data) ? json.data : [];
    const nextCursor = Number(json?.cursor || 0);
    return {
      events,
      cursor: Number.isFinite(nextCursor) && nextCursor > 0 ? nextCursor : cursor,
      resetRequired: json?.reset_required === true,
      reason: String(json?.reason || "").trim() || null,
    };
  }

  async function fetchCreatedOrdersSince(sinceCursor) {
    const payload = await fetchOrdersChanges(sinceCursor);
    if (payload.resetRequired) return payload;
    return {
      ...payload,
      orders: payload.events
        .filter((evt) => String(evt?.event || "").toLowerCase() === "order.created")
        .map((evt) => evt?.data)
        .filter(Boolean),
    };
  }

  async function bootstrapBadgeState() {
    const bootstrap = await fetchOrdersChanges(0);
    if (!bootstrap.resetRequired) {
      cursor = Number(bootstrap.cursor || 0);
    }
    await pullNewOrdersCount();
    return bootstrap;
  }

  function startWaitLoop() {
    if (waitLoopStarted) return;
    waitLoopStarted = true;
    waitLoopToken += 1;
    const token = waitLoopToken;

    (async function runWaitLoop() {
      try {
        await bootstrapBadgeState();
      } catch {}
      while (waitLoopStarted && token === waitLoopToken) {
        if (!waitSupported) {
          await sleepMs(WAIT_RETRY_MS);
          continue;
        }
        try {
          const prevCursor = Number(cursor || 0);
          const waited = await waitForOrdersChange();
          if (!waitLoopStarted || token !== waitLoopToken) break;
          if (waited.resetRequired) {
            await bootstrapBadgeState();
            continue;
          }
          cursor = Number(waited.cursor || cursor || 0);
          if (waited.changed) {
            try {
              const payload = await fetchCreatedOrdersSince(prevCursor);
              if (payload.resetRequired) {
                await bootstrapBadgeState();
                continue;
              }
              cursor = Number(payload.cursor || cursor || 0);
              const createdOrders = Array.isArray(payload.orders) ? payload.orders : [];
              if (createdOrders.length) {
                playNewOrderSound();
                showNewOrderNotification(createdOrders);
              }
            } catch {}
            await pullNewOrdersCount();
          }
        } catch {
          await sleepMs(WAIT_RETRY_MS);
        }
      }
    })().catch(() => {});
  }

  function restartWaitLoop() {
    waitLoopStarted = false;
    waitLoopToken += 1;
    waitSupported = true;
    startWaitLoop();
  }

  startWaitLoop();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      pullNewOrdersCount().catch(() => {});
    }
  });

  document.addEventListener("tenantStoreChanged", function () {
    cursor = 0;
    unreadPrimed = false;
    currentNewCount = 0;
    hideBadge();
    restartWaitLoop();
  });

  document.addEventListener("click", unlockAlertsOnce, { once: true, passive: true });
  document.addEventListener("touchstart", unlockAlertsOnce, { once: true, passive: true });
  document.addEventListener("keydown", unlockAlertsOnce, { once: true });
})();
