(function () {
  // Format time as HH:MM:SS
  function formatTime(hours, minutes, seconds) {
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  // Format timezone offset for display (e.g., "+3" -> "UTC+3")
  function formatTimezone(offset) {
    if (!offset || offset === '+0' || offset === '0') return 'UTC';
    // offset уже содержит знак
    return 'UTC' + offset;
  }

  window.CurrentTime = {
    /**
     * Start a clock that updates every second
     * @param {HTMLElement} element - Element to update with time
     * @param {Function} onTick - Optional callback called on each tick with (hours, minutes, seconds, timezone)
     * @returns {Function} - Stop function to clear the interval
     */
    startClock: function (element, onTick) {
      let intervalId = null;
      let currentTimezone = '+0';
      let offsetMs = 0;

      async function fetchTimeAndUpdate() {
        try {
          const response = await authFetch('/api/admin/tenant/current-time');
          const data = await response.json();

          if (data.ok && data.data) {
            // Получаем timezone филиала
            currentTimezone = data.data.storeTimezone || '+0';

            // Получаем время филиала с сервера
            const storeTime = data.data.storeTimestamp;
            const clientTime = Date.now();

            // Вычисляем разницу между временем филиала и браузером
            offsetMs = storeTime - clientTime;

            updateDisplay();
          }
        } catch (err) {
          console.error('Failed to fetch current time:', err);
        }
      }

      function updateDisplay() {
        // Get current local time with offset
        const now = Date.now() + offsetMs;
        const date = new Date(now);

        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();

        const timeStr = formatTime(hours, minutes, seconds);
        const tzStr = formatTimezone(currentTimezone);

        if (element) {
          element.textContent = timeStr + ' ' + tzStr;
        }

        if (onTick) {
          onTick(hours, minutes, seconds, currentTimezone);
        }
      }

      // Initial fetch
      fetchTimeAndUpdate();

      // Update display every second
      intervalId = setInterval(updateDisplay, 1000);

      // Re-sync with server every 5 minutes
      const syncInterval = setInterval(fetchTimeAndUpdate, 5 * 60 * 1000);

      // Return stop function
      return function stop() {
        if (intervalId) clearInterval(intervalId);
        if (syncInterval) clearInterval(syncInterval);
      };
    }
  };
})();
