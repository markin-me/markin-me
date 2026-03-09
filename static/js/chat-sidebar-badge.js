(function () {
  const targets = [
    {
      navLink: document.getElementById("sidebarChatNavLink"),
      badge: document.getElementById("sidebarChatUnreadBadge"),
    },
    {
      navLink: document.getElementById("mobileChatNavLink"),
      badge: document.getElementById("mobileChatUnreadBadge"),
    },
  ]
    .map(function (target) {
      if (!target.navLink || !target.badge) return null;
      return {
        navLink: target.navLink,
        badge: target.badge,
        navItem: target.navLink.closest("li") || target.navLink.closest(".admin-mobile-nav-item") || null,
      };
    })
    .filter(function (target) {
      return !!target;
    });

  if (!targets.length) return;

  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const CHAT_UNREAD_EVENT = "dashboard:chat-unread-changed";
  const TENANT_DATA_CHANGED_EVENT = "tenantDataChanged";
  const FALLBACK_POLL_MS = 45000;
  const WAIT_TIMEOUT_MS = 25000;
  const WAIT_RETRY_MS = 1200;
  const MESSAGE_ALERT_COOLDOWN_MS = 900;

  let timerId = 0;
  let inFlight = false;
  let waitLoopStarted = false;
  let waitLoopToken = 0;
  let waitSupported = true;

  let unreadTotal = 0;
  let unreadRevision = 0;
  let unreadUpdatedAt = "";
  let unreadPrimed = false;

  let messageAlertLastAt = 0;
  let messageAlertAudioCtx = null;
  let messageAlertAudioUnlocked = false;
  let pullAbortController = null;
  let waitAbortController = null;
  let chatWidgetEnabled = true;

  function normalizeChatWidgetEnabled(rawValue) {
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

  function getTenantChatWidgetEnabled() {
    try {
      const tenant = JSON.parse(localStorage.getItem("tenant") || "{}");
      return normalizeChatWidgetEnabled(tenant && tenant.chat_widget_enabled);
    } catch {
      return true;
    }
  }

  function setChatNavVisibility(enabled) {
    const hidden = enabled !== true;
    targets.forEach(function (target) {
      if (target.navItem) {
        target.navItem.classList.toggle("hidden", hidden);
      } else {
        target.navLink.classList.toggle("hidden", hidden);
      }
      target.navLink.setAttribute("aria-hidden", hidden ? "true" : "false");
    });
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

  function isChatPageActive() {
    try {
      const hasActiveNav = targets.some(function (target) {
        return target.navLink.classList.contains("active-nav")
          || target.navLink.classList.contains("is-active")
          || target.navLink.getAttribute("aria-current") === "page";
      });
      if (hasActiveNav) return true;
      const path = String(window.location.pathname || "");
      if (/^\/dashboard\/chat(?:\/|$)/i.test(path)) return true;
      return document.body.classList.contains("page-chat");
    } catch {
      return false;
    }
  }

  if (isChatPageActive()) {
    setChatNavVisibility(getTenantChatWidgetEnabled());
    hideBadge();
    return;
  }

  function hideBadge() {
    targets.forEach(function (target) {
      target.badge.textContent = "";
      target.badge.classList.add("hidden");
      target.navLink.removeAttribute("data-unread-count");
    });
  }

  function showBadge(totalUnread) {
    const n = Number(totalUnread || 0);
    if (!Number.isFinite(n) || n <= 0) {
      hideBadge();
      return;
    }
    const text = n > 99 ? "99+" : String(Math.trunc(n));
    targets.forEach(function (target) {
      target.badge.textContent = text;
      target.badge.classList.remove("hidden");
      target.navLink.setAttribute("data-unread-count", text);
    });
  }

  function isAbortError(err) {
    if (!err) return false;
    const name = String(err.name || "").toLowerCase();
    if (name === "aborterror") return true;
    const message = String(err.message || "").toLowerCase();
    return message.includes("aborted");
  }

  function resetUnreadState() {
    unreadTotal = 0;
    unreadRevision = 0;
    unreadUpdatedAt = "";
    unreadPrimed = false;
    waitSupported = true;
  }

  function stopPolling() {
    waitLoopStarted = false;
    waitLoopToken += 1;

    if (timerId) {
      window.clearInterval(timerId);
      timerId = 0;
    }
    if (pullAbortController) {
      try { pullAbortController.abort(); } catch {}
      pullAbortController = null;
    }
    if (waitAbortController) {
      try { waitAbortController.abort(); } catch {}
      waitAbortController = null;
    }
    inFlight = false;
  }

  function applyChatWidgetEnabledState(enabled) {
    const nextEnabled = enabled !== false;
    chatWidgetEnabled = nextEnabled;
    setChatNavVisibility(nextEnabled);
    if (!nextEnabled) {
      stopPolling();
      resetUnreadState();
      hideBadge();
      return;
    }
    startPolling();
  }

  function isTabForegroundActive() {
    if (document.visibilityState && document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return true;
  }

  function getTenantMessageSoundUrl() {
    try {
      const raw = localStorage.getItem("tenant");
      if (!raw) return "";
      const tenant = JSON.parse(raw);
      return String((tenant && tenant.sound_new_message_url) || "").trim();
    } catch {
      return "";
    }
  }

  function ensureAlertAudioContext() {
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

  function requestNotificationPermissionSafe() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try {
      const result = Notification.requestPermission();
      if (result && typeof result.then === "function") result.catch(function () {});
    } catch {}
  }

  function unlockAlertsOnce() {
    const soundUrl = getTenantMessageSoundUrl();
    if (soundUrl) {
      try {
        const audio = new Audio(soundUrl);
        audio.volume = 0.001;
        const unlockPromise = audio.play();
        if (unlockPromise && typeof unlockPromise.then === "function") {
          unlockPromise.then(function () {
            messageAlertAudioUnlocked = true;
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch {}
          }).catch(function () {});
        }
      } catch {}
    }

    const ctx = ensureAlertAudioContext();
    if (ctx) {
      if (ctx.state === "running") {
        messageAlertAudioUnlocked = true;
      } else {
        ctx.resume().then(function () {
          messageAlertAudioUnlocked = true;
        }).catch(function () {});
      }
    }

    requestNotificationPermissionSafe();
  }

  function playFallbackAlertTone() {
    const ctx = ensureAlertAudioContext();
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
            playFallbackAlertTone();
          });
        }
        return;
      } catch {}
    }
    playFallbackAlertTone();
  }

  function showMessageNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification(String(title || "Новое сообщение"), {
        body: String(body || "Откройте чаты, чтобы ответить."),
        silent: true,
      });
      n.onclick = function () {
        window.focus();
        n.close();
      };
    } catch {}
  }

  function maybeNotifyUnreadIncrease(nextTotal) {
    if (!unreadPrimed) return;
    if (!Number.isFinite(nextTotal) || nextTotal <= unreadTotal) return;

    const now = Date.now();
    if (now - messageAlertLastAt < MESSAGE_ALERT_COOLDOWN_MS) return;
    messageAlertLastAt = now;
    playMessageAlertSound();
  }

  function makeHeaders() {
    const headers = {
      "x-tenant-id": getTenantId(),
      "x-store-id": getStoreId(),
    };
    const token = localStorage.getItem("authToken");
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function normalizeUnreadPayload(json) {
    const data = json && json.data && typeof json.data === "object" ? json.data : {};
    const totalRaw = Number(data.unread_total ?? data.total ?? 0);
    const total = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.trunc(totalRaw) : 0;
    const revisionRaw = Number(data.revision || 0);
    const revision = Number.isFinite(revisionRaw) && revisionRaw > 0 ? Math.trunc(revisionRaw) : 0;
    return {
      total,
      revision,
      updatedAt: String(data.updated_at || ""),
      changed: data.changed === true,
      timeout: data.timeout === true,
    };
  }

  async function pullUnreadCount() {
    if (!chatWidgetEnabled) return;
    if (inFlight) return;
    inFlight = true;
    const pullAbort = new AbortController();
    pullAbortController = pullAbort;
    try {
      const qs = new URLSearchParams({ _ts: String(Date.now()) });
      const res = await fetch(CHAT_TEMP_API_BASE + "/unread?" + qs.toString(), {
        method: "GET",
        headers: makeHeaders(),
        cache: "no-store",
        signal: pullAbort.signal,
      });
      if (!res.ok) {
        if (res.status === 401) hideBadge();
        return;
      }
      const json = await res.json().catch(function () { return null; });
      if (!json || json.ok !== true) return;
      const payload = normalizeUnreadPayload(json);
      maybeNotifyUnreadIncrease(payload.total);
      unreadTotal = payload.total;
      unreadRevision = payload.revision;
      unreadUpdatedAt = payload.updatedAt;
      unreadPrimed = true;
      showBadge(payload.total);
    } catch (err) {
      if (isAbortError(err)) return;
      // Keep previous unread state on transient errors.
    } finally {
      if (pullAbortController === pullAbort) {
        pullAbortController = null;
      }
      inFlight = false;
    }
  }

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
    });
  }

  async function waitForUnreadChange() {
    if (!chatWidgetEnabled) {
      return {
        changed: false,
        timeout: true,
        total: unreadTotal,
        revision: unreadRevision,
        updatedAt: unreadUpdatedAt,
      };
    }
    if (!waitSupported) {
      return {
        changed: false,
        timeout: true,
        total: unreadTotal,
        revision: unreadRevision,
        updatedAt: unreadUpdatedAt,
      };
    }

    const qs = new URLSearchParams({
      since_total: String(Math.max(0, Number(unreadTotal || 0))),
      since_revision: String(Math.max(0, Number(unreadRevision || 0))),
      timeout_ms: String(Math.max(1000, WAIT_TIMEOUT_MS)),
      _ts: String(Date.now()),
    });

    const waitAbort = new AbortController();
    waitAbortController = waitAbort;
    const res = await fetch(CHAT_TEMP_API_BASE + "/unread/wait?" + qs.toString(), {
      method: "GET",
      headers: makeHeaders(),
      cache: "no-store",
      signal: waitAbort.signal,
    });
    if (waitAbortController === waitAbort) {
      waitAbortController = null;
    }

    if (!res.ok) {
      if (res.status === 401) {
        hideBadge();
        return {
          changed: false,
          timeout: true,
          total: unreadTotal,
          revision: unreadRevision,
          updatedAt: unreadUpdatedAt,
        };
      }
      if (res.status === 404 || res.status === 405) {
        waitSupported = false;
        return {
          changed: false,
          timeout: true,
          total: unreadTotal,
          revision: unreadRevision,
          updatedAt: unreadUpdatedAt,
        };
      }
      throw new Error("WAIT_HTTP_" + String(res.status || 0));
    }

    const json = await res.json().catch(function () { return null; });
    if (!json || json.ok !== true) {
      return {
        changed: false,
        timeout: true,
        total: unreadTotal,
        revision: unreadRevision,
        updatedAt: unreadUpdatedAt,
      };
    }

    return normalizeUnreadPayload(json);
  }

  function startWaitLoop() {
    if (waitLoopStarted) return;
    waitLoopStarted = true;
    waitLoopToken += 1;
    const loopToken = waitLoopToken;

    (async function runWaitLoop() {
      while (waitLoopStarted && loopToken === waitLoopToken) {
        if (!chatWidgetEnabled) break;
        if (!waitSupported) {
          await sleepMs(FALLBACK_POLL_MS);
          await pullUnreadCount().catch(function () {});
          continue;
        }

        try {
          const waitResult = await waitForUnreadChange();
          if (!waitLoopStarted || loopToken !== waitLoopToken) break;
          if (waitResult.changed) {
            maybeNotifyUnreadIncrease(waitResult.total);
            unreadTotal = waitResult.total;
            unreadRevision = waitResult.revision;
            unreadUpdatedAt = waitResult.updatedAt;
            unreadPrimed = true;
            showBadge(unreadTotal);
          }
        } catch (err) {
          if (isAbortError(err)) break;
          await sleepMs(WAIT_RETRY_MS);
        } finally {
          waitAbortController = null;
        }
      }
    })().catch(function () {});
  }

  function startPolling() {
    if (!chatWidgetEnabled) return;
    if (isChatPageActive()) return;
    pullUnreadCount().catch(function () {});
    startWaitLoop();
    if (!timerId) {
      timerId = window.setInterval(function () {
        pullUnreadCount().catch(function () {});
      }, FALLBACK_POLL_MS);
    }
  }

  applyChatWidgetEnabledState(getTenantChatWidgetEnabled());
  document.addEventListener("click", unlockAlertsOnce, { once: true, passive: true });
  document.addEventListener("touchstart", unlockAlertsOnce, { once: true, passive: true });
  document.addEventListener("keydown", unlockAlertsOnce, { once: true });

  document.addEventListener("visibilitychange", function () {
    if (!chatWidgetEnabled) return;
    if (document.visibilityState === "visible") {
      pullUnreadCount().catch(function () {});
    }
  });

  document.addEventListener("tenantStoreChanged", function () {
    applyChatWidgetEnabledState(getTenantChatWidgetEnabled());
    if (!chatWidgetEnabled) return;
    resetUnreadState();
    pullUnreadCount().catch(function () {});
  });

  document.addEventListener(TENANT_DATA_CHANGED_EVENT, function () {
    applyChatWidgetEnabledState(getTenantChatWidgetEnabled());
    if (!chatWidgetEnabled) return;
    resetUnreadState();
    pullUnreadCount().catch(function () {});
  });

  window.addEventListener("storage", function (event) {
    if (String(event && event.key || "") !== "tenant") return;
    const prevEnabled = chatWidgetEnabled;
    applyChatWidgetEnabledState(getTenantChatWidgetEnabled());
    if (!chatWidgetEnabled) return;
    if (!prevEnabled) {
      resetUnreadState();
    }
    pullUnreadCount().catch(function () {});
  });

  document.addEventListener(CHAT_UNREAD_EVENT, function (event) {
    if (!chatWidgetEnabled) return;
    const totalUnread = Number(event?.detail?.totalUnread);
    if (Number.isFinite(totalUnread)) {
      unreadTotal = totalUnread > 0 ? Math.trunc(totalUnread) : 0;
      showBadge(unreadTotal);
      return;
    }
    pullUnreadCount().catch(function () {});
  });
})();
