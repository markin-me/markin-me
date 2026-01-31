
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

  async function apiJson(url, opts = {}) {
    // Получаем токен и store_id из localStorage
    const token = localStorage.getItem('authToken');
    const storeId = localStorage.getItem('activeStoreId') || '1';
    const headers = {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };

    // Добавляем токен авторизации, если он есть
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Добавляем ID выбранной Филиалы
    headers['x-store-id'] = storeId;
    
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    
    // Если 401 - перенаправляем на логин
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      window.location.href = '/login';
      throw new Error('UNAUTHORIZED');
    }
    
    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) {
      const err = json?.error || `API_ERROR (${res.status})`;
      throw new Error(err);
    }
    return json;
  }

  // -----------------------------
  // DOM
  // -----------------------------
  const elStagesList = $("#ordersStagesList");
  const elOrdersList = $("#ordersList");
  const elEmptyHint = $("#ordersEmptyHint");

  const infoEls = {
    empty: $$('[data-info="empty"]'),
    content: $$('[data-info="content"]'),
    title: $$('[data-info="order-title"]'),
    meta: $$('[data-info="order-meta"]'),
    status: $$('[data-info="order-status"]'),
    statusSelect: $$('[data-role="status-select"]'),
    courierSelect: $$('[data-role="courier-select"]'),

    clientAvatar: $$('[data-info="client-avatar"]'),
    clientName: $$('[data-info="client-name"]'),
    clientPhone: $$('[data-info="client-phone"]'),
    clientExtra: $$('[data-info="client-extra"]'),

    payMethod: $$('[data-info="payment-method"]'),
    payIcon: $$('[data-info="payment-icon"]'),
    changeFrom: $$('[data-info="change-from"]'),
    changeAmount: $$('[data-info="change-amount"]'),
    changeFromRow: $$('[data-info="change-from-row"]'),
    changeAmountRow: $$('[data-info="change-amount-row"]'),
    deliveryRow: $$('[data-info="delivery-row"]'),
    deliveryCost: $$('[data-info="delivery-cost"]'),
    total: $$('[data-info="order-total"]'),

    deliveryType: $$('[data-info="delivery-type"]'),
    deliveryQty: $$('[data-info="delivery-qty"]'),
    deliveryUrgent: $$('[data-info="delivery-urgent"]'),
    deliveryInterval: $$('[data-info="delivery-interval"]'),
    deliveryAddress: $$('[data-info="delivery-address"]'),
    deliveryComment: $$('[data-info="delivery-comment"]'),

    itemsList: $$('[data-info="items-list"]'),
  };

  const closeButtons = $$('[data-action="order-close"]');

  const sheet = $("#orderSheet");
  const backdrop = $("#sheetBackdrop");
  const closeBtn = $("#sheetClose");

  const dateBtn = $("#ordersDateBtn");
  const dateLabel = $("#ordersDateLabel");
  const datePopover = $("#ordersDatePopover");
  const dateGrid = $("#ordersDateGrid");
  const dateTitle = $("#ordersDateTitle");
  const datePrev = $("#ordersDatePrev");
  const dateNext = $("#ordersDateNext");
  const dateReset = $("#ordersDateReset");

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    statuses: [],
    activeStatusId: "all",
    orders: [],
    activeOrderId: null,
    draggingOrderId: null,
    lastEventId: null,
    storeTimezone: "+0",
    tenantSounds: {},
    date: {
      start: null,
      end: null,
      viewYear: null,
      viewMonth: null,
    },
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function formatTime(ts) {
    if (!ts) return "";
    // Время в базе уже в timezone филиала, просто парсим и показываем
    const dateStr = String(ts).replace(' ', 'T');
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDateTime(ts) {
    if (!ts) return "";
    // Время в базе уже в timezone филиала, просто парсим и показываем
    const dateStr = String(ts).replace(' ', 'T');
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";

    const day = String(d.getDate()).padStart(2, '0');
    const month = d.getMonth();
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    const monthNames = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${day} ${monthNames[month]} ${year}, ${hours}:${minutes}`;
  }

  function formatScheduleText(order, { includeTitle = true } = {}) {
    if (!order) return "";
    const title = String(order.time_option_title || "").trim();
    const scheduledAt = order.scheduled_at;
    if (!scheduledAt) return includeTitle ? title : "";

    const dateStr = String(scheduledAt).replace(' ', 'T');
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return includeTitle ? title : "";

    const code = String(order.time_option_code || "").trim();
    const storeNow = getStoreDateNow(state.storeTimezone || "+0");
    const isToday = toDateKey(d) === toDateKey(storeNow);
    const showDate = code === "on_date" ? true : code === "at_time" ? false : !isToday;
    const valueText = showDate ? formatDateTime(scheduledAt) : formatTime(scheduledAt);
    if (!valueText) return includeTitle ? title : "";
    if (includeTitle && title) return `${title}: ${valueText}`;
    return valueText;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    const first = parts[0][0] || "";
    const second = parts[1] ? parts[1][0] : "";
    return (first + second).toUpperCase();
  }

  function toDateKey(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Get current date in store's timezone
   * Returns a Date object that when accessed with local methods (.getFullYear(), .getDate(), etc.)
   * gives the correct date/time for the store's timezone
   */
  function getStoreDateNow(timezone) {
    const storeOffsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    // Browser offset in hours (positive for east of UTC)
    const browserOffsetHours = -now.getTimezoneOffset() / 60;
    // Difference between store and browser timezones
    const diffHours = storeOffsetHours - browserOffsetHours;
    // Adjust timestamp so that local methods return store's date/time
    return new Date(now.getTime() + diffHours * 60 * 60 * 1000);
  }

  function parseDateKey(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function totalQty(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((acc, it) => acc + Math.max(0, Number(it.qty || it.quantity || 0)), 0);
  }

  function itemsToHtml(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="muted">?</div>';

    return items
      .map((it, itemIdx) => {
        const name = escapeHtml(it.name || "Товар");
        const qty = Math.max(0, Number(it.qty || it.quantity || 0));
        const price = Number(it.price || 0);
        const lineTotal = Number(it.line_total || price * qty || 0);

        // Фото товара (массив из items или пустой)
        const photos = Array.isArray(it.photos) ? it.photos.filter(Boolean) : [];
        const hasPhotos = photos.length > 0;
        const uniqueId = `order-item-${itemIdx}-${Date.now()}`;

        // HTML для фото с листанием
        let photosHtml = "";
        if (hasPhotos) {
          photosHtml = `
            <div class="order-item-photos" data-item-photos="${uniqueId}">
              <div class="order-item-photo-main">
                <img class="order-item-photo-img" src="${escapeHtml(photos[0])}" alt="${escapeHtml(name)}" data-photo-idx="0" />
                ${photos.length > 1 ? `
                  <button class="order-item-photo-nav order-item-photo-prev" type="button" aria-label="Предыдущее фото">
                    <i class="fas fa-chevron-left"></i>
                  </button>
                  <button class="order-item-photo-nav order-item-photo-next" type="button" aria-label="Следующее фото">
                    <i class="fas fa-chevron-right"></i>
                  </button>
                ` : ""}
              </div>
              ${photos.length > 1 ? `
                <div class="order-item-photo-thumbs-wrapper">
                  <button class="order-item-thumbs-nav order-item-thumbs-prev" type="button" aria-label="Листать миниатюры влево">
                    <i class="fas fa-chevron-left"></i>
                  </button>
                  <div class="order-item-photo-thumbs" data-thumbs="${uniqueId}">
                    ${photos.map((photo, idx) => `
                      <button class="order-item-photo-thumb ${idx === 0 ? "is-active" : ""}" type="button" data-thumb-idx="${idx}">
                        <img src="${escapeHtml(photo)}" alt="" />
                      </button>
                    `).join("")}
                  </div>
                  <button class="order-item-thumbs-nav order-item-thumbs-next" type="button" aria-label="Листать миниатюры вправо">
                    <i class="fas fa-chevron-right"></i>
                  </button>
                </div>
              ` : ""}
            </div>
          `;
        }

        // Упрощенное фото 40×40 (только первое фото)
        const photoHtml = hasPhotos 
          ? `<div class="order-item-photo-small"><img src="${escapeHtml(photos[0])}" alt="${escapeHtml(name)}" /></div>`
          : "";

        // Отображаем варианты товара (первыми)
        // Формат: значение название_группы (например "200г порц")
        const variants = Array.isArray(it.variants) ? it.variants : [];
        const variantsHtml = variants.length
          ? `<div class="order-item-composition">
              ${variants.map((v) => {
                const groupTitle = escapeHtml(v.group_title || "Вариант");
                const variantValue = escapeHtml(v.label || v.value || "");
                // Проверяем, не заканчивается ли variantValue на groupTitle (чтобы избежать дублирования)
                // Например, если variantValue = "1 шт", а groupTitle = "шт", то не добавляем groupTitle
                const variantValueTrimmed = variantValue.trim();
                const groupTitleTrimmed = groupTitle.trim();
                let formatted;
                if (variantValueTrimmed && groupTitleTrimmed) {
                  const variantLower = variantValueTrimmed.toLowerCase();
                  const groupLower = groupTitleTrimmed.toLowerCase();
                  // Проверяем, заканчивается ли variantValue на пробел + groupTitle или просто на groupTitle
                  if (variantLower.endsWith(" " + groupLower) || variantLower.endsWith(groupLower)) {
                    // variantValue уже содержит единицу из groupTitle, не дублируем
                    formatted = variantValue;
                  } else {
                    // Формат: значение название_группы (например "200г порц" или "1шт порц")
                    formatted = `${variantValue} ${groupTitle}`.trim();
                  }
                } else {
                  // Если одно из значений пустое, просто объединяем
                  formatted = `${variantValue} ${groupTitle}`.trim();
                }
                return `<div class="order-item-composition-item">• ${formatted}</div>`;
              }).join("")}
            </div>`
          : "";

        // Отображаем ингредиенты товара (вторыми)
        // Формат: количествоединица название (например "150г картофельное пюре")
        const ingredients = Array.isArray(it.ingredients) ? it.ingredients : [];
        const ingredientsHtml = ingredients.length
          ? `<div class="order-item-composition">
              ${ingredients.map((ing) => {
                const ingName = escapeHtml(ing.name || "Ингредиент");
                const ingQty = Math.max(1, Number(ing.quantity || ing.qty || 1));
                // Получаем единицу из разных полей
                let ingUnit = escapeHtml(ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "");
                // Если единица не указана, определяем по количеству: если > 10, вероятно граммы
                if (!ingUnit) {
                  ingUnit = ingQty > 10 ? "г" : "шт";
                }
                // Формат: количествоединица название (например "150г картофельное пюре")
                const formatted = `${ingQty}${ingUnit} ${ingName}`;
                return `<div class="order-item-composition-item">• ${formatted}</div>`;
              }).join("")}
            </div>`
          : "";

        // Отображаем опции товара (третьими)
        // Формат: количествоединица название (например "1шт кола" или "300г Гречка с овощами")
        const options = Array.isArray(it.options) ? it.options : [];
        const optionsHtml = options.length
          ? `<div class="order-item-composition">
              ${options.map((opt) => {
                const optName = escapeHtml(opt.title || "Опция");
                // Если у опции есть вариант (variant_label), используем его вместо количества "шт"
                const variantLabel = escapeHtml((opt.variant_label || opt.variantLabel || "").trim());
                let formatted;
                if (variantLabel) {
                  // variant_label уже содержит значение с единицей (например "300 г")
                  formatted = `${variantLabel} ${optName}`;
                } else {
                  // Если варианта нет, используем стандартный формат с количеством
                  const optQty = Math.max(1, Number(opt.qty || 1));
                  // Формат: количествоединица название (например "1шт кола")
                  formatted = `${optQty}шт ${optName}`;
                }
                return `<div class="order-item-composition-item">• ${formatted}</div>`;
              }).join("")}
            </div>`
          : "";

        // Порядок: варианты → ингредиенты → опции
        const subHtml = variantsHtml + ingredientsHtml + optionsHtml;

        const base = `
          <div class="order-item-line" style="display: flex; align-items: flex-start; gap: 12px;">
            ${photoHtml}
            <div class="order-item-content" style="flex: 1;">
              <div class="order-item-name">${name} × ${qty} — ${money(lineTotal)}</div>
              ${subHtml}
            </div>
          </div>
        `;

        return `<div class="order-item" data-item-idx="${itemIdx}">${base}</div>`;
      })
      .join("");
  }

  // Инициализация листания фото для товаров в заказе
  function initOrderItemPhotos() {
    if (!infoEls.itemsList || !infoEls.itemsList.length) return;
    
    infoEls.itemsList.forEach((container) => {
      if (!container) return;
      
      // Обработчики для каждого товара (проверяем, что еще не инициализирован)
      container.querySelectorAll('[data-item-photos]:not([data-photos-initialized])').forEach((photoContainer) => {
        const uniqueId = photoContainer.getAttribute('data-item-photos');
        const mainImg = photoContainer.querySelector('.order-item-photo-img');
        const thumbsContainer = photoContainer.querySelector(`[data-thumbs="${uniqueId}"]`);
        const prevBtn = photoContainer.querySelector('.order-item-photo-prev');
        const nextBtn = photoContainer.querySelector('.order-item-photo-next');
        const thumbsPrevBtn = photoContainer.querySelector('.order-item-thumbs-prev');
        const thumbsNextBtn = photoContainer.querySelector('.order-item-thumbs-next');
        
        if (!mainImg) return;
        
        // Помечаем как инициализированный
        photoContainer.setAttribute('data-photos-initialized', 'true');
        
        // Получаем все фото из миниатюр
        const thumbs = thumbsContainer ? Array.from(thumbsContainer.querySelectorAll('.order-item-photo-thumb')) : [];
        const photos = thumbs.map(thumb => {
          const img = thumb.querySelector('img');
          return img ? img.src : null;
        }).filter(Boolean);
        
        if (photos.length <= 1) return;
        
        let currentIdx = 0;
        
        function setActivePhoto(idx) {
          if (idx < 0 || idx >= photos.length) return;
          currentIdx = idx;
          mainImg.src = photos[idx];
          mainImg.setAttribute('data-photo-idx', String(idx));
          
          // Обновляем активную миниатюру
          thumbs.forEach((thumb, i) => {
            thumb.classList.toggle('is-active', i === idx);
          });
          
          // Прокручиваем миниатюры к активной
          if (thumbsContainer && thumbs[idx]) {
            const thumb = thumbs[idx];
            const containerRect = thumbsContainer.getBoundingClientRect();
            const thumbRect = thumb.getBoundingClientRect();
            
            if (thumbRect.left < containerRect.left) {
              thumbsContainer.scrollLeft -= (containerRect.left - thumbRect.left + 10);
            } else if (thumbRect.right > containerRect.right) {
              thumbsContainer.scrollLeft += (thumbRect.right - containerRect.right + 10);
            }
          }
        }
        
        // Навигация стрелками на главном фото
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            setActivePhoto((currentIdx - 1 + photos.length) % photos.length);
          });
        }
        
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            setActivePhoto((currentIdx + 1) % photos.length);
          });
        }
        
        // Клик на миниатюру
        thumbs.forEach((thumb, idx) => {
          thumb.addEventListener('click', () => {
            setActivePhoto(idx);
          });
        });
        
        // Листание миниатюр стрелками
        if (thumbsPrevBtn && thumbsContainer) {
          thumbsPrevBtn.addEventListener('click', () => {
            thumbsContainer.scrollBy({ left: -80, behavior: 'smooth' });
          });
        }
        
        if (thumbsNextBtn && thumbsContainer) {
          thumbsNextBtn.addEventListener('click', () => {
            thumbsContainer.scrollBy({ left: 80, behavior: 'smooth' });
          });
        }
      });
    });
  }

  function paymentIcon(code) {
    if (!code) return "fa-credit-card";
    const c = String(code).toLowerCase();
    if (c.includes("cash")) return "fa-money-bill-wave";
    if (c.includes("card")) return "fa-credit-card";
    if (c.includes("online")) return "fa-globe";
    return "fa-credit-card";
  }

  function setTextAll(list, value) {
    list.forEach((el) => {
      if (!el) return;
      el.textContent = value;
    });
  }

  function setHtmlAll(list, value) {
    list.forEach((el) => {
      if (!el) return;
      el.innerHTML = value;
    });
  }

  function setHiddenAll(list, hidden) {
    list.forEach((el) => {
      if (!el) return;
      el.classList.toggle("hidden", hidden);
    });
  }

  function setAttrAll(list, name, value) {
    list.forEach((el) => {
      if (!el) return;
      if (value === null || value === undefined) {
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, value);
      }
    });
  }

  function showEmptyInfo() {
    setHiddenAll(infoEls.empty, false);
    setHiddenAll(infoEls.content, true);
  }

  function showOrderInfo() {
    setHiddenAll(infoEls.empty, true);
    setHiddenAll(infoEls.content, false);
  }

  function setInfo(order) {
    if (!order) {
      showEmptyInfo();
      setTextAll(infoEls.title, "Заказ не выбран");
      setTextAll(infoEls.meta, "Выберите заказ слева.");
      setTextAll(infoEls.status, "?");
      setTextAll(infoEls.clientName, "?");
      setTextAll(infoEls.clientPhone, "?");
      setTextAll(infoEls.clientAvatar, "?");
      setTextAll(infoEls.payMethod, "?");
      setTextAll(infoEls.total, "?");
      setTextAll(infoEls.deliveryType, "?");
      setTextAll(infoEls.deliveryQty, "0 шт.");
      setTextAll(infoEls.deliveryAddress, "?");
      setHtmlAll(infoEls.itemsList, '<div class="muted">?</div>');
      setHiddenAll(infoEls.deliveryUrgent, true);
      setHiddenAll(infoEls.deliveryInterval, true);
      setHiddenAll(infoEls.deliveryComment, true);
      setHiddenAll(infoEls.clientExtra, true);
      return;
    }

    showOrderInfo();

    setTextAll(infoEls.title, `Заказ #${order.id}`);
    setTextAll(infoEls.meta, formatDateTime(order.created_at));
    setTextAll(infoEls.status, order.status_title || "?");

    // Заполняем выпадающий список статусов
    infoEls.statusSelect.forEach((select) => {
      if (!select) return;
      select.innerHTML = "";
      
      // Добавляем текущий статус как первый вариант
      const currentStatus = state.statuses.find((s) => Number(s.id) === Number(order.status_id));
      if (currentStatus) {
        const option = document.createElement("option");
        option.value = String(currentStatus.id);
        option.textContent = currentStatus.title || "?";
        option.selected = true;
        select.appendChild(option);
      }
      
      // Добавляем остальные статусы
      state.statuses.forEach((status) => {
        if (Number(status.id) !== Number(order.status_id)) {
          const option = document.createElement("option");
          option.value = String(status.id);
          option.textContent = status.title || "?";
          select.appendChild(option);
        }
      });
    });

    const clientName = order.customer_name || "?";
    const clientPhone = order.customer_phone || "?";
    setTextAll(infoEls.clientName, clientName);
    setTextAll(infoEls.clientPhone, clientPhone);
    setTextAll(infoEls.clientAvatar, initials(clientName));
    setAttrAll(infoEls.clientPhone, "href", clientPhone && clientPhone !== "?" ? `tel:${clientPhone}` : null);

    const clientExtra = order.customer_comment || order.customer_source || "";
    setTextAll(infoEls.clientExtra, clientExtra);
    setHiddenAll(infoEls.clientExtra, !clientExtra);

    const payTitle = order.payment_title || "?";
    setTextAll(infoEls.payMethod, payTitle);
    const isDelivery = order.method_code === "delivery";
    const deliveryCost = Number(order.delivery_cost || 0);
    setTextAll(infoEls.deliveryCost, money(deliveryCost));
    setHiddenAll(infoEls.deliveryRow, !isDelivery);
    setTextAll(infoEls.total, money(order.total_price || 0));
    infoEls.payIcon.forEach((el) => {
      if (!el) return;
      el.innerHTML = `<i class="fas ${paymentIcon(order.payment_code)}"></i>`;
    });

    const changeFrom = order.change_from;
    const orderTotalNum = Number(order.total_price) || 0;
    const hasChange = changeFrom && changeFrom > orderTotalNum;
    const changeAmountVal = hasChange ? changeFrom - orderTotalNum : 0;
    setTextAll(infoEls.changeFrom, money(changeFrom || 0));
    setTextAll(infoEls.changeAmount, money(changeAmountVal));
    setHiddenAll(infoEls.changeFromRow, !changeFrom);
    setHiddenAll(infoEls.changeAmountRow, !changeFrom);

    const qty = totalQty(order.items || []);
    setTextAll(infoEls.deliveryQty, `${qty} шт.`);

    const methodTitle = order.method_title || (order.method_code === "pickup" ? "Самовывоз" : "Доставка");
    const deliverySectionTitle = order.method_code === "pickup" ? "Самовывоз:" : "Доставка:";
    setTextAll(infoEls.deliveryType, methodTitle || "?");

    const intervalText = formatScheduleText(order, { includeTitle: true });
    setTextAll(infoEls.deliveryInterval, intervalText);
    setHiddenAll(infoEls.deliveryInterval, !intervalText);

    const urgent = Boolean(order.is_urgent || order.urgent || order.time_option_code === "urgent");
    setHiddenAll(infoEls.deliveryUrgent, !urgent);

    // Для самовывоза показываем адрес точки, для доставки - адрес клиента
    let address = order.address;
    if (!address && order.pickup_store_address) {
      address = order.pickup_store_name
        ? `${order.pickup_store_name}, ${order.pickup_store_address}`
        : order.pickup_store_address;
    }
    setTextAll(infoEls.deliveryAddress, address || "?");

    const comment = order.comment || "";
    setTextAll(infoEls.deliveryComment, comment);
    setHiddenAll(infoEls.deliveryComment, !comment);

    setHtmlAll(infoEls.itemsList, itemsToHtml(order.items || []));
    
    // Инициализируем листание фото после рендеринга
    setTimeout(() => {
      initOrderItemPhotos();
    }, 0);
  }

  // -----------------------------
  // Sheet
  // -----------------------------
  function openSheet() {
    if (!sheet || !backdrop) return;
    sheet.classList.add("is-open");
    backdrop.classList.add("is-active");
    sheet.setAttribute("aria-hidden", "false");
    backdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    if (!sheet || !backdrop) return;
    sheet.classList.remove("is-open");
    backdrop.classList.remove("is-active");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("sheet-open");
  }

  // -----------------------------
  // Render: stages
  // -----------------------------
  function stageButton({ id, title, subtitle, icon, count }) {
    const btn = document.createElement("button");
    btn.className = "stage-item";
    btn.type = "button";
    btn.setAttribute("data-status-id", String(id));

    btn.innerHTML = `
      <span class="stage-icon"><i class="fas ${escapeHtml(icon)}"></i></span>
      <span class="stage-text">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(subtitle)}</small>
      </span>
      <span class="stage-count">${escapeHtml(count)}</span>
    `;

    btn.addEventListener("click", () => {
      state.activeStatusId = id;
      syncActiveStage();
      loadAndRenderOrders(false).catch(console.error);
    });

    return btn;
  }

  function syncActiveStage() {
    if (!elStagesList) return;
    $$(".stage-item", elStagesList).forEach((b) => {
      const id = b.getAttribute("data-status-id");
      const active = String(state.activeStatusId) === String(id);
      b.classList.toggle("is-active", active);
    });
  }

  function wireDragTargets() {
    if (!elStagesList) return;

    $$(".stage-item", elStagesList).forEach((stageBtn) => {
      stageBtn.addEventListener("dragover", (e) => {
        e.preventDefault();
        stageBtn.classList.add("is-dropover");
      });
      stageBtn.addEventListener("dragleave", () => {
        stageBtn.classList.remove("is-dropover");
      });
      stageBtn.addEventListener("drop", async (e) => {
        e.preventDefault();
        stageBtn.classList.remove("is-dropover");

        const statusIdRaw = stageBtn.getAttribute("data-status-id");
        const statusId = Number(statusIdRaw);

        if (!Number.isFinite(statusId) || statusId <= 0) return;

        let orderId = null;
        try { orderId = Number(e.dataTransfer.getData("text/plain")); } catch {}
        if (!Number.isFinite(orderId) || orderId <= 0) return;

        try {
          await apiJson(`/api/admin/orders/${orderId}/status`, {
            method: "PUT",
            body: { status_id: statusId },
          });

          await loadStatuses();
          renderStages();
          await loadAndRenderOrders(true);
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  function renderStages() {
    if (!elStagesList) return;
    elStagesList.innerHTML = "";

    const allCount = state.statuses.reduce((acc, s) => acc + Number(s.count || 0), 0);

    elStagesList.appendChild(stageButton({
      id: "all",
      title: "Все заказы",
      subtitle: "Все статусы",
      icon: "fa-layer-group",
      count: allCount,
    }));

    state.statuses
      .slice()
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
      .forEach((s) => {
        elStagesList.appendChild(stageButton({
          id: s.id,
          title: s.title,
          subtitle: s.subtitle || "",
          icon: s.icon || "fa-circle",
          count: Number(s.count || 0),
        }));
      });

    syncActiveStage();
    wireDragTargets();
  }

  // -----------------------------
  // Orders list
  // -----------------------------
  function orderMatchesFilters(order) {
    if (!order) return false;

    if (state.activeStatusId !== "all" && Number(order.status_id) !== Number(state.activeStatusId)) {
      return false;
    }

    if (state.date.start && state.date.end) {
      // Use scheduled_at if available, otherwise fall back to created_at
      const dateStr = order.scheduled_at || order.created_at;
      // Время в базе уже в timezone филиала
      const d = new Date(String(dateStr).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return false;

      // Сравниваем даты напрямую
      const key = toDateKey(d);
      const startKey = toDateKey(state.date.start);
      const endKey = toDateKey(state.date.end);

      if (key < startKey || key > endKey) return false;
    }

    return true;
  }

  function buildOrderRow(order) {
    const row = document.createElement("div");
    row.className = "order-row js-order";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("draggable", "true");
    row.setAttribute("data-order-id", String(order.id));

    updateOrderRow(row, order);

    row.addEventListener("dragstart", (e) => {
      state.draggingOrderId = Number(order.id) || null;
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(order.id));
      } catch {}
      row.classList.add("is-dragging");
    });

    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      state.draggingOrderId = null;
    });

    row.addEventListener("dragover", (e) => {
      if (state.activeStatusId === "all") return;
      e.preventDefault();
      row.classList.add("is-dropover");
    });

    row.addEventListener("dragleave", () => row.classList.remove("is-dropover"));

    row.addEventListener("drop", async (e) => {
      if (state.activeStatusId === "all") return;
      e.preventDefault();
      row.classList.remove("is-dropover");

      const draggedId = state.draggingOrderId;
      const targetId = Number(row.getAttribute("data-order-id"));
      if (!draggedId || !targetId || draggedId === targetId) return;

      const idxFrom = state.orders.findIndex((x) => Number(x.id) === Number(draggedId));
      const idxTo = state.orders.findIndex((x) => Number(x.id) === Number(targetId));
      if (idxFrom < 0 || idxTo < 0) return;

      const moved = state.orders.splice(idxFrom, 1)[0];
      state.orders.splice(idxTo, 0, moved);

      try {
        await apiJson(`/api/admin/orders/reorder`, {
          method: "PUT",
          body: {
            status_id: Number(state.activeStatusId),
            orderedIds: state.orders.map((x) => Number(x.id)),
          },
        });

        renderOrders();
      } catch (err) {
        console.error(err);
      }
    });

    return row;
  }

  function updateOrderRow(row, order) {
    row.setAttribute("data-order-id", String(order.id));

    const urgent = Boolean(order.is_urgent || order.urgent || order.time_option_code === "urgent" || order.time_option_code === "asap");
    const intervalText = formatScheduleText(order, { includeTitle: false });
    const hasScheduledTime = Boolean(
      intervalText && (order.scheduled_at || order.time_option_code === "at_time" || order.time_option_code === "on_date") && !urgent
    );
    const comment = order.comment || "Нет комментария";
    const courier = order.courier_name || null;
    const hasCourier = courier && courier !== "Не указан" && courier !== "Не назначен";
    const telegramId = order.telegram_user_id || null;
    const telegramDisplay = telegramId ? String(telegramId) : "Не указан";

    const payment = order.payment_title || "";
    const totalText = money(order.total_price || 0);
    const paymentCode = (order.payment_code || "").toLowerCase();
    const isCash = paymentCode.includes("cash");
    const isCard = paymentCode.includes("card") || (!isCash && paymentCode);

    row.innerHTML = `
      <div class="order-col order-id">
        <div class="order-id-num">${escapeHtml(order.id)}</div>
        <div class="order-id-time">${escapeHtml(formatTime(order.created_at))}</div>
      </div>

      <div class="order-col order-indicators">
        ${urgent ? `
          <span class="order-indicator urgent">⚡</span>
        ` : hasScheduledTime ? `
          <div class="order-indicator-time">
            <i class="fas fa-clock"></i>
            <span class="order-indicator-time-text">${escapeHtml(intervalText)}</span>
          </div>
        ` : ''}
      </div>

      <div class="order-col order-client">
        <div class="order-client-name"><i class="fas fa-user"></i> ${escapeHtml(order.customer_name || "?")}</div>
        <div class="order-client-phone muted"><i class="fas fa-phone"></i> ${escapeHtml(order.customer_phone || "?")}</div>
        <div class="order-client-telegram muted"><i class="fab fa-telegram-plane"></i> ${escapeHtml(telegramDisplay)}</div>
      </div>

      <div class="order-col order-address">
        <div class="order-address-line"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(
          order.address ||
          (order.pickup_store_address
            ? (order.pickup_store_name ? `${order.pickup_store_name}, ${order.pickup_store_address}` : order.pickup_store_address)
            : "?"
          )
        )}</div>
        <div class="order-address-comment muted"><i class="far fa-comment"></i> ${escapeHtml(comment)}</div>
        <div class="order-address-courier ${hasCourier ? "" : "order-courier-assign"}">
          <i class="fas fa-user"></i> 
          ${hasCourier ? escapeHtml(courier) : '<span data-action="assign-courier">Назначить курьера</span>'}
        </div>
      </div>

      <div class="order-col order-total">
        <button class="order-payment-btn ${isCash ? "order-payment-cash" : "order-payment-card"}" type="button">
          <i class="fas ${paymentIcon(order.payment_code)}"></i> ${escapeHtml(totalText)}
        </button>
      </div>
    `;

    if (state.activeOrderId && Number(state.activeOrderId) === Number(order.id)) {
      row.classList.add("is-active");
    } else {
      row.classList.remove("is-active");
    }
  }

  function renderOrders() {
    if (!elOrdersList) return;
    elOrdersList.innerHTML = "";

    const list = state.orders || [];
    const filtered = list.filter(orderMatchesFilters);
    if (!filtered.length) {
      if (elEmptyHint) elEmptyHint.classList.remove("hidden");
      setInfo(null);
      return;
    }
    if (elEmptyHint) elEmptyHint.classList.add("hidden");

    filtered.forEach((o) => {
      const row = buildOrderRow(o);
      elOrdersList.appendChild(row);
    });

    if (!state.activeOrderId) {
      setInfo(null);
    }
  }

  function upsertOrderRow(order) {
    if (!elOrdersList) return;
    const existingRow = $(`.order-row[data-order-id="${order.id}"]`, elOrdersList);
    const shouldRender = orderMatchesFilters(order);

    if (!shouldRender) {
      if (existingRow) existingRow.remove();
      return;
    }

    if (existingRow) {
      updateOrderRow(existingRow, order);
      return;
    }

    const row = buildOrderRow(order);
    elOrdersList.prepend(row);
  }

  function clearSelection() {
    state.activeOrderId = null;
    $$(".order-row.is-active").forEach((el) => el.classList.remove("is-active"));
    setInfo(null);
  }

  // -----------------------------
  // Data loading
  // -----------------------------
  async function loadStatuses() {
    const qs = new URLSearchParams();
    if (state.date.start && state.date.end) {
      qs.set("start_date", toDateKey(state.date.start));
      qs.set("end_date", toDateKey(state.date.end));
    }
    const json = await apiJson(`/api/admin/orders/statuses?${qs.toString()}`);
    state.statuses = Array.isArray(json.data) ? json.data : [];
  }

  async function loadOrders() {
    const qs = new URLSearchParams();
    if (state.activeStatusId !== "all") qs.set("status_id", String(state.activeStatusId));
    if (state.date.start && state.date.end) {
      qs.set("start_date", toDateKey(state.date.start));
      qs.set("end_date", toDateKey(state.date.end));
    }
    qs.set("limit", "500");
    qs.set("offset", "0");

    const json = await apiJson(`/api/admin/orders?${qs.toString()}`);
    state.orders = Array.isArray(json.data) ? json.data : [];
  }

  async function loadAndRenderOrders(keepSelection = false) {
    const prevActive = keepSelection ? state.activeOrderId : null;
    if (!keepSelection) {
      state.activeOrderId = null;
    }

    await loadOrders();
    renderOrders();

    if (keepSelection && prevActive) {
      const found = state.orders.find((o) => Number(o.id) === Number(prevActive));
      if (found) {
        state.activeOrderId = found.id;
        setInfo(found);
        $$(".order-row.is-active", document).forEach((el) => el.classList.remove("is-active"));
        const row = $(`.order-row[data-order-id="${found.id}"]`, elOrdersList);
        if (row) row.classList.add("is-active");
      } else {
        state.activeOrderId = null;
        setInfo(null);
      }
    }
  }

  // -----------------------------
  // Date filter
  // -----------------------------
  function formatDateLabel(start, end) {
    if (!start || !end) return "Сегодня";
    const s = start.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
    const e = end.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
    return s === e ? s : `${s} — ${e}`;
  }

  function updateDateLabel() {
    if (dateLabel) dateLabel.textContent = formatDateLabel(state.date.start, state.date.end);
  }

  function applyDateFilter(closePopover = true) {
    updateDateLabel();
    loadStatuses()
      .then(renderStages)
      .then(() => loadAndRenderOrders(false))
      .catch(console.error);

    if (closePopover) closeDatePopover();
  }

  function openDatePopover() {
    if (!datePopover) return;
    datePopover.classList.remove("hidden");
    dateBtn?.setAttribute("aria-expanded", "true");
  }

  function closeDatePopover() {
    if (!datePopover) return;
    datePopover.classList.add("hidden");
    dateBtn?.setAttribute("aria-expanded", "false");
  }

  function renderCalendar() {
    if (!dateGrid || !dateTitle) return;

    const year = state.date.viewYear;
    const month = state.date.viewMonth;
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    // Используем getStoreDateNow для определения "сегодня" в часовом поясе филиала
    const todayKey = toDateKey(getStoreDateNow(state.storeTimezone));

    const monthTitle = first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    dateTitle.textContent = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);

    const cells = [];
    for (let i = 0; i < offset; i += 1) {
      cells.push('<span class="date-empty"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const d = new Date(year, month, day);
      const key = toDateKey(d);
      const startKey = state.date.start ? toDateKey(state.date.start) : null;
      const endKey = state.date.end ? toDateKey(state.date.end) : null;

      const isStart = startKey && key === startKey;
      const isEnd = endKey && key === endKey;
      const isRange = startKey && endKey && key > startKey && key < endKey;
      const isToday = key === todayKey;

      const classes = [
        "date-cell",
        isStart ? "is-start" : "",
        isEnd ? "is-end" : "",
        isRange ? "is-in-range" : "",
        isToday ? "is-today" : "",
      ].filter(Boolean).join(" ");

      cells.push(`<button class="${classes}" type="button" data-date="${key}">${day}</button>`);
    }

    dateGrid.innerHTML = cells.join("");
  }


  let clickTimer = null;

  function onDateClick(dateKey) {
    const clicked = parseDateKey(dateKey);
    if (!clicked) return;

    // Если уже есть и start и end, сбрасываем и начинаем заново
    if (state.date.start && state.date.end) {
      state.date.start = clicked;
      state.date.end = null;
      renderCalendar();
      return;
    }

    // Первый клик - устанавливаем start
    if (!state.date.start) {
      state.date.start = clicked;
      state.date.end = null;
      renderCalendar();
      return;
    }

    // Второй клик - устанавливаем end и закрываем календарь
    if (state.date.start && !state.date.end) {
      state.date.end = clicked;
      if (state.date.end < state.date.start) {
        const tmp = state.date.start;
        state.date.start = state.date.end;
        state.date.end = tmp;
      }
      renderCalendar();
      applyDateFilter(true);
    }
  }

  function onDateDoubleClick(dateKey) {
    // Отменяем одиночный клик, если он был запланирован
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }

    const clicked = parseDateKey(dateKey);
    if (!clicked) return;

    // Двойной клик - выбираем один день (создаем новый объект Date для end)
    state.date.start = new Date(clicked);
    state.date.end = new Date(clicked);
    renderCalendar();
    applyDateFilter(true);
  }

  function resetDateFilter() {
    const today = getStoreDateNow(state.storeTimezone);
    state.date.start = today;
    state.date.end = today;
    state.date.viewYear = today.getFullYear();
    state.date.viewMonth = today.getMonth();
    renderCalendar();
    applyDateFilter(true);
  }

  // -----------------------------
  // SSE
  // -----------------------------
  let stageRefreshTimer = null;
  function scheduleStageRefresh() {
    if (stageRefreshTimer) return;
    stageRefreshTimer = setTimeout(async () => {
      stageRefreshTimer = null;
      try {
        await loadStatuses();
        renderStages();
      } catch (e) {
        console.error(e);
      }
    }, 200);
  }

  function playNotificationSound(url) {
    if (!url || document.visibilityState !== "visible") return;
    const audio = new Audio(url);
    audio.play().catch(() => {});
  }

  function handleOrderEvent(order) {
    if (!order || !order.id) return;

    const idx = state.orders.findIndex((o) => Number(o.id) === Number(order.id));
    const wasExisting = idx >= 0;
    if (wasExisting) {
      state.orders[idx] = { ...state.orders[idx], ...order };
    } else {
      state.orders.unshift(order);
    }

    upsertOrderRow(order);

    if (state.activeOrderId && Number(state.activeOrderId) === Number(order.id)) {
      setInfo(order);
    }

    scheduleStageRefresh();

    const statusCode = (order.status_code || "").toLowerCase();
    if (statusCode === "cancelled" || statusCode === "canceled") {
      const url = state.tenantSounds && state.tenantSounds.sound_order_cancelled_url;
      if (url) playNotificationSound(url);
    }
  }

  async function fetchChanges() {
    if (!state.lastEventId) {
      await loadAndRenderOrders(true);
      return;
    }

    try {
      const json = await apiJson(`/api/admin/orders/changes?since=${state.lastEventId}`);
      const changes = Array.isArray(json.data) ? json.data : [];
      if (!changes.length) return;
      changes.forEach((evt) => {
        state.lastEventId = evt.id || state.lastEventId;
        handleOrderEvent(evt.data);
      });
    } catch (e) {
      console.error(e);
      await loadAndRenderOrders(true);
    }
  }

  let sseEventSource = null;

  function initSse() {
    if (typeof EventSource === "undefined") return;

    if (sseEventSource) {
      sseEventSource.close();
      sseEventSource = null;
    }

    // EventSource не поддерживает кастомные заголовки — передаём токен и store_id через query
    const token = localStorage.getItem('authToken');
    const storeId = localStorage.getItem('activeStoreId') || '1';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('store_id', storeId);
    const url = `/api/admin/orders/events?${params.toString()}`;

    sseEventSource = new EventSource(url);

    sseEventSource.addEventListener("order.created", (e) => {
      if (e.lastEventId) state.lastEventId = e.lastEventId;
      try {
        const data = JSON.parse(e.data || "{}");
        handleOrderEvent(data);
        const soundUrl = state.tenantSounds && state.tenantSounds.sound_new_order_url;
        if (soundUrl) playNotificationSound(soundUrl);
      } catch (err) {
        console.error(err);
      }
    });

    sseEventSource.addEventListener("order.updated", (e) => {
      if (e.lastEventId) state.lastEventId = e.lastEventId;
      try {
        const data = JSON.parse(e.data || "{}");
        handleOrderEvent(data);
      } catch (err) {
        console.error(err);
      }
    });

    sseEventSource.addEventListener("error", () => {
      fetchChanges().catch(console.error);
    });
  }

  // -----------------------------
  // Click handlers
  // -----------------------------
  document.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (action && action.getAttribute("data-action") === "assign-courier") {
      e.stopPropagation();
      return;
    }
    if (action && action.getAttribute("data-action") === "order-extra") {
      e.stopPropagation();
      return;
    }

    // Не выбирать заказ при клике на кнопку оплаты
    if (e.target.closest(".order-payment-btn")) {
      e.stopPropagation();
      return;
    }

    const row = e.target.closest(".js-order");
    if (!row) return;

    $$(".order-row.is-active").forEach((el) => el.classList.remove("is-active"));
    row.classList.add("is-active");

    state.activeOrderId = Number(row.getAttribute("data-order-id")) || null;
    const order = state.orders.find((o) => Number(o.id) === Number(state.activeOrderId));
    setInfo(order || null);

    if (isMobile()) openSheet();
  });

  closeButtons.forEach((btn) => btn.addEventListener("click", clearSelection));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  if (closeBtn) closeBtn.addEventListener("click", closeSheet);
  if (backdrop) backdrop.addEventListener("click", closeSheet);

  window.addEventListener("resize", () => {
    if (!isMobile()) closeSheet();
  });

  if (dateBtn && datePopover) {
    dateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (datePopover.classList.contains("hidden")) {
        openDatePopover();
      } else {
        closeDatePopover();
      }
    });

    document.addEventListener("click", (e) => {
      if (!datePopover || datePopover.classList.contains("hidden")) return;
      if (e.target.closest("#ordersDatePopover") || e.target.closest("#ordersDateBtn")) return;
      closeDatePopover();
      if (state.date.start && !state.date.end) {
        state.date.end = state.date.start;
        applyDateFilter(true);
      }
    });
  }

  if (dateGrid) {
    dateGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-date]");
      if (!btn) return;
      
      // Используем таймер, чтобы отличить одиночный клик от двойного
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        onDateClick(btn.getAttribute("data-date"));
      }, 250);
    });

    dateGrid.addEventListener("dblclick", (e) => {
      const btn = e.target.closest("[data-date]");
      if (!btn) return;
      onDateDoubleClick(btn.getAttribute("data-date"));
    });
  }

  if (datePrev) {
    datePrev.addEventListener("click", () => {
      state.date.viewMonth -= 1;
      if (state.date.viewMonth < 0) {
        state.date.viewMonth = 11;
        state.date.viewYear -= 1;
      }
      renderCalendar();
    });
  }

  if (dateNext) {
    dateNext.addEventListener("click", () => {
      state.date.viewMonth += 1;
      if (state.date.viewMonth > 11) {
        state.date.viewMonth = 0;
        state.date.viewYear += 1;
      }
      renderCalendar();
    });
  }

  if (dateReset) {
    dateReset.addEventListener("click", () => resetDateFilter());
  }

  // Обработчик изменения статуса через выпадающий список
  infoEls.statusSelect.forEach((select) => {
    if (!select) return;
    select.addEventListener("change", async (e) => {
      const statusId = Number(e.target.value);
      if (!Number.isFinite(statusId) || statusId <= 0) return;

      const orderId = state.activeOrderId;
      if (!orderId) return;

      try {
        await apiJson(`/api/admin/orders/${orderId}/status`, {
          method: "PUT",
          body: { status_id: statusId },
        });

        // Обновляем данные заказа
        await loadStatuses();
        renderStages();
        await loadAndRenderOrders(true);
      } catch (err) {
        console.error(err);
        // Восстанавливаем предыдущее значение при ошибке
        const order = state.orders.find((o) => Number(o.id) === Number(orderId));
        if (order) {
          e.target.value = String(order.status_id || "");
        }
      }
    });
  });

  // Обработчик кнопки печати
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="order-print"]');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const orderId = state.activeOrderId;
    if (!orderId) return;
    
    const order = state.orders.find((o) => Number(o.id) === Number(orderId));
    if (!order) return;
    
    printOrderReceipt(order);
  });

  // Функция печати чека через системную печать браузера
  function printOrderReceipt(order) {
    // Создаем HTML для чека
    const receiptHtml = generateReceiptHTML(order);
    
    // Вычисляем размеры и позицию для центрирования окна
    const width = 400;
    const height = 600;
    const left = (screen.width / 2) - (width / 2);
    const top = (screen.height / 2) - (height / 2);
    
    // Открываем новое окно с чеком по центру экрана
    const printWindow = window.open('', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
    if (!printWindow) {
      alert('Пожалуйста, разрешите всплывающие окна для печати');
      return;
    }
    
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    
    // Ждем загрузки и вызываем печать
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
    
    // Закрываем окно после печати (после закрытия диалога печати)
    printWindow.addEventListener('afterprint', () => {
      printWindow.close();
    });
    
    // Также закрываем окно, если пользователь закрыл его вручную
    // или если диалог печати был отменен (fallback)
    const checkClosed = setInterval(() => {
      if (printWindow.closed) {
        clearInterval(checkClosed);
      }
    }, 100);
  }

  // Функция генерации HTML для чека
  function generateReceiptHTML(order) {
    // Время в базе уже в timezone филиала
    const createdAtStr = String(order.created_at).replace(' ', 'T');
    const date = new Date(createdAtStr);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    const dateStr = `${day}.${month}.${year}, ${hours}:${minutes}`;

    const methodTitle = order.method_title || (order.method_code === "pickup" ? "Самовывоз" : "Доставка");
    const deliverySectionTitle = order.method_code === "pickup" ? "Самовывоз:" : "Доставка:";
    let address = order.address;
    if (!address && order.pickup_store_address) {
      address = order.pickup_store_name
        ? `${order.pickup_store_name}, ${order.pickup_store_address}`
        : order.pickup_store_address;
    }
    const isUrgent = order.is_urgent || order.urgent || order.time_option_code === "urgent";
    const total = parseFloat(order.total_price || order.total || 0);
    const deliveryCost = Number(order.delivery_cost || 0);
    const changeFromRaw = order.change_from;
    const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
    const paymentTitle = order.payment_method_title || order.payment_title || "";
    const paymentCode = order.payment_code || "";
    const changeAmount = Math.max(0, changeFrom - total);
    const showChange = changeAmount > 0;
    const scheduleText = formatScheduleText(order, { includeTitle: true });

    let itemsHtml = '';
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        const name = escapeHtml(item.product_name || item.name || 'Товар');
        const qty = item.quantity || item.qty || 1;
        const basePrice = parseFloat(item.price || 0);
        const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? (basePrice * qty) ?? 0);
        const unitPrice = qty ? (lineTotal / qty) : basePrice;
        
        // Варианты товара (первыми)
        const variants = Array.isArray(item.variants) ? item.variants : [];
        let variantsHtml = '';
        if (variants.length) {
          variantsHtml = '<div class="receipt-composition">';
          variants.forEach((v) => {
            const groupTitle = escapeHtml(v.group_title || "Вариант");
            const variantValue = escapeHtml(v.label || v.value || "");
            const variantValueTrimmed = variantValue.trim();
            const groupTitleTrimmed = groupTitle.trim();
            let formatted;
            if (variantValueTrimmed && groupTitleTrimmed) {
              const variantLower = variantValueTrimmed.toLowerCase();
              const groupLower = groupTitleTrimmed.toLowerCase();
              if (variantLower.endsWith(" " + groupLower) || variantLower.endsWith(groupLower)) {
                formatted = variantValue;
              } else {
                formatted = `${variantValue} ${groupTitle}`.trim();
              }
            } else {
              formatted = `${variantValue} ${groupTitle}`.trim();
            }
            variantsHtml += `<div class="receipt-composition-item">• ${formatted}</div>`;
          });
          variantsHtml += '</div>';
        }
        
        // Ингредиенты товара (вторыми)
        const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
        let ingredientsHtml = '';
        if (ingredients.length) {
          ingredientsHtml = '<div class="receipt-composition">';
          ingredients.forEach((ing) => {
            const ingName = escapeHtml(ing.name || "Ингредиент");
            const ingQty = Math.max(1, Number(ing.quantity || ing.qty || 1));
            let ingUnit = escapeHtml(ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "");
            if (!ingUnit) {
              ingUnit = ingQty > 10 ? "г" : "шт";
            }
            const formatted = `${ingQty}${ingUnit} ${ingName}`;
            ingredientsHtml += `<div class="receipt-composition-item">• ${formatted}</div>`;
          });
          ingredientsHtml += '</div>';
        }
        
        // Опции товара (третьими)
        const options = Array.isArray(item.options) ? item.options : [];
        let optionsHtml = '';
        if (options.length) {
          optionsHtml = '<div class="receipt-composition">';
          options.forEach((opt) => {
            const optName = escapeHtml(opt.title || "Опция");
            const variantLabel = escapeHtml((opt.variant_label || opt.variantLabel || "").trim());
            let formatted;
            if (variantLabel) {
              formatted = `${variantLabel} ${optName}`;
            } else {
              const optQty = Math.max(1, Number(opt.qty || 1));
              formatted = `${optQty}шт ${optName}`;
            }
            optionsHtml += `<div class="receipt-composition-item">• ${formatted}</div>`;
          });
          optionsHtml += '</div>';
        }
        
        itemsHtml += `
          <div class="receipt-item">
            <div class="receipt-item-name">${name}</div>
            <div class="receipt-item-details">${qty} x ${unitPrice.toFixed(2)} = ${lineTotal.toFixed(2)}</div>
            ${variantsHtml}
            ${ingredientsHtml}
            ${optionsHtml}
          </div>
        `;
      });
    }

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек заказа #${order.id}</title>
  <style>
    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 5mm;
        font-family: 'Courier New', monospace;
        font-size: 11pt;
        line-height: 1.3;
        width: 70mm;
        max-width: 70mm;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 5mm;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
      line-height: 1.3;
      width: 70mm;
      max-width: 70mm;
      background: white;
    }
    .receipt-header {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 10px;
    }
    .receipt-date {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    .receipt-section {
      margin: 10px 0;
    }
    .receipt-section-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .receipt-item {
      margin: 5px 0;
    }
    .receipt-item-name {
      font-weight: bold;
    }
    .receipt-item-details {
      margin-left: 10px;
      font-size: 10pt;
    }
    .receipt-composition {
      margin: 3px 0 3px 15px;
      font-size: 9pt;
    }
    .receipt-composition-item {
      margin: 2px 0;
    }
    .receipt-total {
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 15px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 10px 0;
    }
    .receipt-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
    }
    .receipt-summary-label {
      flex: 1;
    }
    .receipt-summary-value {
      flex-shrink: 0;
      text-align: right;
    }
    .receipt-urgent {
      text-align: center;
      font-weight: bold;
      color: #d00;
      margin: 10px 0;
    }
    .receipt-divider {
      border-top: 1px dashed #000;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="receipt-header">ЗАКАЗ #${order.id}</div>
  <div class="receipt-date">${dateStr}</div>
  
  <div class="receipt-divider"></div>
  
  <div class="receipt-section">
    <div class="receipt-section-title">Клиент:</div>
    ${order.customer_name ? `<div>${escapeHtml(order.customer_name)}</div>` : ''}
    ${order.customer_phone ? `<div>${escapeHtml(order.customer_phone)}</div>` : ''}
  </div>
  
  <div class="receipt-section">
    <div class="receipt-section-title">${deliverySectionTitle}</div>
    <div>${escapeHtml(methodTitle || "—")}</div>
    <div>${escapeHtml(address || "—")}</div>
    ${scheduleText ? `<div>${escapeHtml(scheduleText)}</div>` : ''}
    ${isUrgent ? '<div class="receipt-urgent">⚡ СРОЧНО</div>' : ''}
  </div>
  
  ${order.comment ? `
  <div class="receipt-section">
    <div class="receipt-section-title">Комментарий:</div>
    <div>${escapeHtml(order.comment)}</div>
  </div>
  ` : ''}
  
  <div class="receipt-divider"></div>
  
  <div class="receipt-section">
    <div class="receipt-section-title">Товары:</div>
    ${itemsHtml}
  </div>
  
  <div class="receipt-divider"></div>

  <div class="receipt-section">
    <div class="receipt-section-title">Суммы:</div>
    ${paymentTitle ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Оплата</div><div class="receipt-summary-value">${escapeHtml(paymentTitle)}</div></div>` : ''}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача с</div><div class="receipt-summary-value">${money(changeFrom)}</div></div>` : ''}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача</div><div class="receipt-summary-value">${money(changeAmount)}</div></div>` : ''}
    <div class="receipt-summary-row"><div class="receipt-summary-label">Доставка</div><div class="receipt-summary-value">${money(deliveryCost)}</div></div>
    <div class="receipt-total">ИТОГО: ${money(total)}</div>
  </div>
  
  <div style="margin-top: 20px; text-align: center; font-size: 10pt;">
    <div>Спасибо за заказ!</div>
  </div>
</body>
</html>
    `;
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    try {
      // Load store timezone from API (not from localStorage)
      try {
        const response = await apiJson('/api/admin/tenant/current-time');
        if (response.ok && response.data) {
          state.storeTimezone = response.data.storeTimezone || "+0";
        } else {
          state.storeTimezone = "+0";
        }
      } catch (err) {
        console.error("Failed to load store timezone:", err);
        state.storeTimezone = "+0";
      }

      // Initialize date filter with store's current date
      const storeNow = getStoreDateNow(state.storeTimezone);
      state.date.start = storeNow;
      state.date.end = storeNow;
      state.date.viewYear = storeNow.getFullYear();
      state.date.viewMonth = storeNow.getMonth();

      renderCalendar();
      updateDateLabel();

      await loadStatuses();
      // По умолчанию выбран этап "Новые" (первый статус по сортировке)
      const sortedStatuses = [...state.statuses].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
      if (sortedStatuses.length) {
        state.activeStatusId = sortedStatuses[0].id;
      }
      renderStages();
      await loadAndRenderOrders(false);

      try {
        const tenantRes = await apiJson("/api/admin/tenant");
        if (tenantRes && tenantRes.tenant) {
          state.tenantSounds = {
            sound_new_order_url: tenantRes.tenant.sound_new_order_url || null,
            sound_order_cancelled_url: tenantRes.tenant.sound_order_cancelled_url || null,
            sound_new_message_url: tenantRes.tenant.sound_new_message_url || null
          };
        }
      } catch (err) {
        console.error(err);
      }

      initSse();
    } catch (e) {
      console.error(e);
    }
  }

  init();

  // Слушать изменение филиала: переподключить SSE к каналу нового филиала и перезагрузить заказы
  document.addEventListener('tenantStoreChanged', (event) => {
    console.log('Филиал изменен:', event.detail.store);
    loadAndRenderOrders(false);
    initSse();
  });
})();
