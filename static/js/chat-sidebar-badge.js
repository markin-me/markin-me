(function () {
  const navLink = document.getElementById("sidebarChatNavLink");
  const badge = document.getElementById("sidebarChatUnreadBadge");
  if (!navLink || !badge) return;

  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const CHAT_UNREAD_EVENT = "dashboard:chat-unread-changed";
  const FALLBACK_POLL_MS = 4000;
  const WAIT_TIMEOUT_MS = 25000;
  const WAIT_RETRY_MS = 1200;
  let timerId = 0;
  let inFlight = false;
  let waitLoopStarted = false;
  let waitLoopToken = 0;
  let waitSupported = true;
  let summariesUpdatedAt = "";

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

  function hideBadge() {
    badge.textContent = "";
    badge.classList.add("hidden");
    navLink.removeAttribute("data-unread-count");
  }

  function isChatPageActive() {
    try {
      if (navLink.classList.contains("active-nav")) return true;
      const path = String(window.location.pathname || "");
      if (/^\/dashboard\/chat(?:\/|$)/i.test(path)) return true;
      return document.body.classList.contains("page-chat");
    } catch {
      return false;
    }
  }

  function showBadge(totalUnread) {
    if (isChatPageActive()) {
      hideBadge();
      return;
    }
    const n = Number(totalUnread || 0);
    if (!Number.isFinite(n) || n <= 0) {
      hideBadge();
      return;
    }
    const text = n > 99 ? "99+" : String(Math.trunc(n));
    badge.textContent = text;
    badge.classList.remove("hidden");
    navLink.setAttribute("data-unread-count", text);
  }

  function getUnreadValue(row) {
    if (!row || typeof row !== "object") return 0;
    const raw = row.unread_count ?? row.unreadCount ?? row.unread ?? row.unread_messages ?? row.unreadMessages;
    const unread = Number(raw || 0);
    if (!Number.isFinite(unread) || unread <= 0) return 0;
    return unread;
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

  function getLatestUpdatedAt(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let latest = "";
    list.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      const value = String(row.updated_at ?? row.updatedAt ?? row.last_message_at ?? row.lastMessageAt ?? "").trim();
      if (!value) return;
      if (!latest || compareIsoDates(value, latest) > 0) {
        latest = value;
      }
    });
    return latest;
  }

  async function pullUnreadCount() {
    if (inFlight) return;
    inFlight = true;
    try {
      const headers = {
        "x-tenant-id": getTenantId(),
        "x-store-id": getStoreId(),
      };
      const token = localStorage.getItem("authToken");
      if (token) headers.Authorization = "Bearer " + token;

      const qs = new URLSearchParams({ _ts: String(Date.now()) });
      const res = await fetch(CHAT_TEMP_API_BASE + "/summaries?" + qs.toString(), {
        method: "GET",
        headers: headers,
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) hideBadge();
        return;
      }
      const json = await res.json().catch(function () { return null; });
      if (!json || json.ok !== true || !Array.isArray(json.data)) return;

      const total = json.data.reduce(function (sum, row) {
        return sum + getUnreadValue(row);
      }, 0);

      showBadge(total);
      const latestUpdatedAt = getLatestUpdatedAt(json.data);
      if (latestUpdatedAt || summariesUpdatedAt) {
        summariesUpdatedAt = latestUpdatedAt;
      }
    } catch {
      // keep last visible state on transient errors
    } finally {
      inFlight = false;
    }
  }

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
    });
  }

  async function waitForSummariesChange() {
    if (!waitSupported) {
      return {
        changed: false,
        updatedAt: summariesUpdatedAt,
      };
    }

    const headers = {
      "x-tenant-id": getTenantId(),
      "x-store-id": getStoreId(),
    };
    const token = localStorage.getItem("authToken");
    if (token) headers.Authorization = "Bearer " + token;

    const qs = new URLSearchParams({
      since: String(summariesUpdatedAt || ""),
      timeout_ms: String(Math.max(1000, WAIT_TIMEOUT_MS)),
      _ts: String(Date.now()),
    });

    const res = await fetch(CHAT_TEMP_API_BASE + "/summaries/wait?" + qs.toString(), {
      method: "GET",
      headers: headers,
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 401) {
        hideBadge();
        return {
          changed: false,
          updatedAt: summariesUpdatedAt,
        };
      }
      if (res.status === 404 || res.status === 405) {
        waitSupported = false;
        return {
          changed: false,
          updatedAt: summariesUpdatedAt,
        };
      }
      throw new Error("WAIT_HTTP_" + String(res.status || 0));
    }

    const json = await res.json().catch(function () { return null; });
    if (!json || json.ok !== true) {
      return {
        changed: false,
        updatedAt: summariesUpdatedAt,
      };
    }

    return {
      changed: json.data && json.data.changed === true,
      updatedAt: String((json.data && json.data.updated_at) || ""),
    };
  }

  function startWaitLoop() {
    if (waitLoopStarted) return;
    waitLoopStarted = true;
    waitLoopToken += 1;
    const loopToken = waitLoopToken;

    (async function runWaitLoop() {
      while (waitLoopStarted && loopToken === waitLoopToken) {
        if (!waitSupported) {
          await sleepMs(FALLBACK_POLL_MS);
          continue;
        }

        try {
          const waitResult = await waitForSummariesChange();
          if (!waitLoopStarted || loopToken !== waitLoopToken) break;
          if (typeof waitResult.updatedAt === "string") {
            summariesUpdatedAt = waitResult.updatedAt;
          }
          // Always refresh after wait returns. This avoids missed updates
          // when backend timestamp precision is coarser than message frequency.
          await pullUnreadCount();
        } catch {
          await sleepMs(WAIT_RETRY_MS);
        }
      }
    })().catch(function () {});
  }

  function startPolling() {
    pullUnreadCount().catch(function () {});
    startWaitLoop();
    if (!timerId) {
      timerId = window.setInterval(function () {
        pullUnreadCount().catch(function () {});
      }, FALLBACK_POLL_MS);
    }
  }

  startPolling();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      pullUnreadCount().catch(function () {});
    }
  });

  document.addEventListener("tenantStoreChanged", function () {
    summariesUpdatedAt = "";
    pullUnreadCount().catch(function () {});
  });

  document.addEventListener(CHAT_UNREAD_EVENT, function (event) {
    const totalUnread = Number(event?.detail?.totalUnread);
    if (Number.isFinite(totalUnread)) {
      showBadge(totalUnread);
      return;
    }
    pullUnreadCount().catch(function () {});
  });
})();
