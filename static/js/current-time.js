(function () {
  if (typeof window !== "undefined" && window.__currentTimeModuleInitialized) return;
  if (typeof window !== "undefined") {
    window.__currentTimeModuleInitialized = true;
  }

  const CURRENT_TIME_CACHE_KEY = "admin:current-time-cache:v1";
  const CURRENT_TIME_CACHE_TTL_MS = 3 * 60 * 1000;

  function setStoreTimezone(tz) {
    window.state = window.state || {};
    window.state.storeTimezone = tz || "+0";
  }

  window.state = window.state || {};
  window.state.storeTimezone = window.state.storeTimezone || "+0";

  function formatTime(hours, minutes, seconds) {
    const h = String(hours).padStart(2, "0");
    const m = String(minutes).padStart(2, "0");
    const s = String(seconds).padStart(2, "0");
    return h + ":" + m + ":" + s;
  }

  function formatTimezone(offset) {
    if (!offset || offset === "+0" || offset === "0") return "UTC";
    return "UTC" + offset;
  }

  function readCurrentTimeCache() {
    try {
      const raw = sessionStorage.getItem(CURRENT_TIME_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed && parsed.ts || 0);
      if (!(ts > 0) || Date.now() - ts > CURRENT_TIME_CACHE_TTL_MS) return null;
      const data = parsed && parsed.data && typeof parsed.data === "object" ? parsed.data : null;
      if (!data) return null;
      const storeTimestamp = Number(data.storeTimestamp || 0);
      const storeTimezone = String(data.storeTimezone || "+0");
      if (!Number.isFinite(storeTimestamp) || storeTimestamp <= 0) return null;
      return {
        storeTimestamp,
        storeTimezone,
        ts,
      };
    } catch {
      return null;
    }
  }

  function writeCurrentTimeCache(data) {
    try {
      const storeTimestamp = Number(data && data.storeTimestamp || 0);
      if (!Number.isFinite(storeTimestamp) || storeTimestamp <= 0) return;
      sessionStorage.setItem(CURRENT_TIME_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        data: {
          storeTimestamp,
          storeTimezone: String(data && data.storeTimezone || "+0"),
        },
      }));
    } catch {}
  }

  function applyCachedStoreTime(cacheEntry) {
    if (!cacheEntry) return null;
    const storeTimezone = String(cacheEntry.storeTimezone || "+0");
    const storeTimestamp = Number(cacheEntry.storeTimestamp || 0);
    if (!Number.isFinite(storeTimestamp) || storeTimestamp <= 0) return null;
    setStoreTimezone(storeTimezone);
    return {
      storeTimezone,
      offsetMs: storeTimestamp - Date.now(),
    };
  }

  async function fetchCurrentTimePayload() {
    if (typeof authFetch !== "function") return null;
    const response = await authFetch("/api/admin/tenant/current-time");
    const data = await response.json();
    if (!data || !data.ok || !data.data) return null;
    const payload = {
      storeTimezone: String(data.data.storeTimezone || "+0"),
      storeTimestamp: Number(data.data.storeTimestamp || 0),
    };
    if (!Number.isFinite(payload.storeTimestamp) || payload.storeTimestamp <= 0) return null;
    writeCurrentTimeCache(payload);
    setStoreTimezone(payload.storeTimezone);
    return payload;
  }

  (function fetchStoreTimezoneOnce() {
    const cached = applyCachedStoreTime(readCurrentTimeCache());
    if (cached) return;
    fetchCurrentTimePayload().catch(function () {
      setStoreTimezone("+0");
    });
  })();

  window.CurrentTime = {
    startClock: function (element, onTick) {
      let intervalId = null;
      let syncInterval = null;
      let currentTimezone = window.state.storeTimezone || "+0";
      let offsetMs = 0;

      const cached = applyCachedStoreTime(readCurrentTimeCache());
      if (cached) {
        currentTimezone = cached.storeTimezone;
        offsetMs = cached.offsetMs;
      }

      async function fetchTimeAndUpdate(force) {
        const cacheEntry = !force ? applyCachedStoreTime(readCurrentTimeCache()) : null;
        if (cacheEntry) {
          currentTimezone = cacheEntry.storeTimezone;
          offsetMs = cacheEntry.offsetMs;
          updateDisplay();
          return;
        }

        try {
          const payload = await fetchCurrentTimePayload();
          if (!payload) return;
          currentTimezone = payload.storeTimezone;
          offsetMs = payload.storeTimestamp - Date.now();
          updateDisplay();
        } catch (err) {
          console.error("Failed to fetch current time:", err);
        }
      }

      function updateDisplay() {
        const now = Date.now() + offsetMs;
        const date = new Date(now);

        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();

        const timeStr = formatTime(hours, minutes, seconds);
        const tzStr = formatTimezone(currentTimezone);

        if (element) {
          element.textContent = timeStr + " " + tzStr;
        }

        if (onTick) {
          onTick(hours, minutes, seconds, currentTimezone);
        }
      }

      updateDisplay();
      fetchTimeAndUpdate(false);

      intervalId = setInterval(updateDisplay, 1000);
      syncInterval = setInterval(function () {
        if (document.visibilityState === "hidden") return;
        fetchTimeAndUpdate(false);
      }, 5 * 60 * 1000);

      return function stop() {
        if (intervalId) clearInterval(intervalId);
        if (syncInterval) clearInterval(syncInterval);
      };
    }
  };
})();
