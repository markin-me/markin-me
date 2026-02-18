(function () {
  const navLink = document.getElementById("sidebarChatNavLink");
  const badge = document.getElementById("sidebarChatUnreadBadge");
  if (!navLink || !badge) return;

  const CHAT_TEMP_API_BASE = "/api/chat-temp";
  const POLL_MS = 4000;
  let timerId = 0;
  let inFlight = false;

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

  function showBadge(totalUnread) {
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

      const res = await fetch(CHAT_TEMP_API_BASE + "/summaries", { method: "GET", headers: headers });
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
    } catch {
      // keep last visible state on transient errors
    } finally {
      inFlight = false;
    }
  }

  function startPolling() {
    pullUnreadCount().catch(function () {});
    if (!timerId) {
      timerId = window.setInterval(function () {
        pullUnreadCount().catch(function () {});
      }, POLL_MS);
    }
  }

  startPolling();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      pullUnreadCount().catch(function () {});
    }
  });

  document.addEventListener("tenantStoreChanged", function () {
    pullUnreadCount().catch(function () {});
  });
})();
