(function () {
  if (typeof window !== "undefined" && window.__currentTimeModuleInitialized) return;
  if (typeof window !== "undefined") {
    window.__currentTimeModuleInitialized = true;
  }

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

  function applyCachedStoreTime(cacheEntry) {
    if (!cacheEntry) return null;
    const storeTimezone = String(cacheEntry.storeTimezone || "+0");
    const storeTimestamp = Number(cacheEntry.storeTimestamp || 0);
    const fetchedAt = Number(cacheEntry.fetchedAt || 0);
    if (!Number.isFinite(storeTimestamp) || storeTimestamp <= 0 || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return null;
    setStoreTimezone(storeTimezone);
    return {
      storeTimezone,
      offsetMs: storeTimestamp - fetchedAt,
    };
  }

  async function fetchCurrentTimePayload() {
    if (typeof authFetch !== "function") return null;
    const response = await authFetch("/api/admin/tenant/current-time");
    if (!response.ok) throw new Error("CURRENT_TIME_FETCH_FAILED");
    const data = await response.json();
    if (!data || !data.ok || !data.data) return null;
    const payload = {
      storeTimezone: String(data.data.storeTimezone || "+0"),
      storeTimestamp: Number(data.data.storeTimestamp || 0),
      fetchedAt: Date.now(),
    };
    if (!Number.isFinite(payload.storeTimestamp) || payload.storeTimestamp <= 0) return null;
    return payload;
  }

  function loadCurrentTimeReference(onUpdate) {
    if (!window.AdminReferenceCache) return fetchCurrentTimePayload();
    return window.AdminReferenceCache.getOrLoadReference("store-time", {
      load: fetchCurrentTimePayload,
      validate: function (value) {
        return !!value && Number(value.storeTimestamp) > 0 && Number(value.fetchedAt) > 0;
      },
      onUpdate: onUpdate,
    });
  }

  (function fetchStoreTimezoneOnce() {
    loadCurrentTimeReference(function (payload) { applyCachedStoreTime(payload); })
      .then(function (payload) { applyCachedStoreTime(payload); })
      .catch(function () {
      setStoreTimezone("+0");
    });
  })();

  window.CurrentTime = {
    startClock: function (element, onTick) {
      let intervalId = null;
      let syncInterval = null;
      let currentTimezone = window.state.storeTimezone || "+0";
      let offsetMs = 0;

      async function fetchTimeAndUpdate() {
        try {
          const applyPayload = function (payload) {
            const cacheEntry = applyCachedStoreTime(payload);
            if (!cacheEntry) return;
            currentTimezone = cacheEntry.storeTimezone;
            offsetMs = cacheEntry.offsetMs;
            updateDisplay();
          };
          const payload = await loadCurrentTimeReference(applyPayload);
          if (!payload) return;
          applyPayload(payload);
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
      fetchTimeAndUpdate();

      intervalId = setInterval(updateDisplay, 1000);
      syncInterval = setInterval(function () {
        if (document.visibilityState === "hidden") return;
        fetchTimeAndUpdate();
      }, 5 * 60 * 1000);

      return function stop() {
        if (intervalId) clearInterval(intervalId);
        if (syncInterval) clearInterval(syncInterval);
      };
    }
  };
})();
