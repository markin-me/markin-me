(function () {
  const STORAGE_KEY = 'activeStoreId';

  function getActiveStoreIdFromStorage() {
    if (typeof window === 'undefined') return 1;
    const stored = localStorage.getItem(STORAGE_KEY);
    const n = Number(stored);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function setActiveStoreIdToStorage(id) {
    if (typeof window === 'undefined') return;
    if (!Number.isFinite(id)) return;
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('headerCityButton');
    const dropdown = document.getElementById('headerCityDropdown');
    const nameEl = document.getElementById('headerCityName');
    const wrapper = document.getElementById('headerCitySelector');
    if (!button || !dropdown || !nameEl || !wrapper) return;

    const metaTenant = document.querySelector('meta[name="tenant_id"]');
    const tenantId = metaTenant ? Number(metaTenant.content) : null;
    if (!tenantId) return;

    let stores = [];
    let currentStoreId = getActiveStoreIdFromStorage();

    button.disabled = true;

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        wrapper.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
      } else {
        collapseDropdown();
      }
    });

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) {
        collapseDropdown();
      }
    });

    async function loadStores() {
      try {
        const response = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload?.error || 'STORE_FETCH_FAILED');
        }

        stores = Array.isArray(payload.stores) ? payload.stores : [];
        if (!stores.length) {
          nameEl.textContent = '—';
          button.disabled = true;
          return;
        }

        const matched = stores.find((item) => Number(item.id) === currentStoreId);
        const selected = matched || stores[0];
        currentStoreId = Number(selected.id) || currentStoreId || 1;
        setActiveStoreIdToStorage(currentStoreId);
        updateCityLabel(selected);
        renderOptions();
        button.disabled = false;
      } catch (err) {
        console.error('Не удалось загрузить города точек продаж:', err);
        nameEl.textContent = '—';
        button.disabled = true;
      }
    }

    function updateCityLabel(store) {
      if (!store) return;
      const label = store.city || '—';
      nameEl.textContent = label;
    }

    function renderOptions() {
      dropdown.innerHTML = '';

      // Группировка точек по городам
      const citiesMap = new Map();
      stores.forEach((store) => {
        const city = store.city || '—';
        if (!citiesMap.has(city)) {
          citiesMap.set(city, []);
        }
        citiesMap.get(city).push(store);
      });

      // Для каждого города показываем одну опцию
      citiesMap.forEach((cityStores, cityName) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'header-city-option';

        // Проверяем, активен ли какой-то из магазинов этого города
        const isActive = cityStores.some((s) => Number(s.id) === currentStoreId);
        if (isActive) {
          btn.classList.add('is-active');
        }

        const cityText = escapeHtml(cityName);
        btn.innerHTML = `<span class="header-city-option-city">${cityText}</span>`;

        btn.addEventListener('click', (event) => {
          event.stopPropagation();

          // Если уже выбран этот город, просто закрываем
          if (isActive) {
            collapseDropdown();
            return;
          }

          // Выбираем первую точку из этого города
          const selectedStore = cityStores[0];
          currentStoreId = Number(selectedStore.id);
          updateCityLabel(selectedStore);
          setActiveStoreIdToStorage(currentStoreId);
          renderOptions();
          dispatchStoreChanged(selectedStore);
          collapseDropdown();
        });

        dropdown.appendChild(btn);
      });
    }

    function collapseDropdown() {
      if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        wrapper.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
      }
    }

    function dispatchStoreChanged(store) {
      const event = new CustomEvent('tenantStoreChanged', { detail: { store } });
      document.dispatchEvent(event);
      window.dispatchEvent(event);
    }

    loadStores();
  });
})();
