// Shared implementation used by the storefront and administrative order entry.
SharedProductRuntime.register(function (runtime) {
  "use strict";

function startComboGridRotation(cells) {
    const rotators = (Array.isArray(cells) ? cells : [])
      .map((entry) => {
        const cell = entry?.cell || null;
        const photos = runtime.normalizeComboGridPhotoUrls(entry?.photos || []);
        if (!cell || photos.length < 2) return null;
        cell.dataset.comboSlideDir = entry?.direction || "up";
        return {
          cell,
          photos,
          index: 0,
          isCriticalCard: !!entry?.isCriticalCard,
        };
      })
      .filter(Boolean);
    if (!rotators.length) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const intervalMs = 6800;
    runtime.preloadComboGridImagesInBackground(rotators.flatMap((entry) => entry.photos));
    let isSwitching = false;
    const timer = setInterval(async () => {
      if (isSwitching) return;
      const active = rotators.filter((entry) => entry.cell.isConnected);
      if (!active.length) {
        clearInterval(timer);
        return;
      }
      isSwitching = true;
      const candidates = active.map((entry) => {
        const current = entry.cell.querySelector(".sp-combo-grid__img.is-visible");
        let nextIndex = entry.index;
        if (entry.photos.length > 1) {
          nextIndex = Math.floor(Math.random() * entry.photos.length);
          if (nextIndex === entry.index) nextIndex = (nextIndex + 1) % entry.photos.length;
        }
        return {
          entry,
          cell: entry.cell,
          current,
          nextIndex,
          nextUrl: entry.photos[nextIndex],
        };
      });
      const readiness = await Promise.all(candidates.map((item) => runtime.waitForComboGridImage(item.nextUrl)));
      const nextEntries = candidates
        .filter((item, index) => readiness[index] && document.body.contains(item.cell))
        .map((item) => {
          item.entry.index = item.nextIndex;
          const next = runtime.createComboGridImageNode(item.nextUrl, item.entry.isCriticalCard);
          next.classList.remove("is-visible");
          next.classList.add("is-entering");
          return { ...item.entry, current: item.current, next };
        });
      runtime.preloadComboGridImagesInBackground(active.flatMap((entry) => entry.photos));
      if (!nextEntries.length) {
        isSwitching = false;
        return;
      }
      nextEntries.forEach(({ cell, next }) => {
        if (!document.body.contains(cell)) return;
        cell.appendChild(next);
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nextEntries.forEach(({ cell, current }) => {
            if (!document.body.contains(cell)) return;
            if (current) {
              current.classList.add("is-leaving");
              current.classList.remove("is-visible");
            }
          });
          setTimeout(() => {
            nextEntries.forEach(({ cell, current }) => {
              if (!document.body.contains(cell)) return;
              if (current && current.parentNode === cell) current.remove();
            });
            requestAnimationFrame(() => {
              nextEntries.forEach(({ cell, next }) => {
                if (!document.body.contains(cell)) return;
                next.classList.add("is-visible");
                next.classList.remove("is-entering");
              });
              setTimeout(() => {
                isSwitching = false;
              }, 920);
            });
          }, 920);
        });
      });
    }, intervalMs);
  }

function createComboGridImageNode(src, isCriticalCard = false) {
    return runtime.createOptimizedImage(src, {
      type: "product-grid",
      className: "sp-img sp-img-full sp-combo-grid__img is-visible",
      alt: "",
      priority: isCriticalCard,
    });
  }

function applyCardState(card, product, qty, dir, context = {}) {
    const media = runtime.$(".sp-media", card);
    const overlay = runtime.$(".sp-qtyOverlay", card);
    const qtyBox = runtime.$(".qty-carousel", card);

    const pill = runtime.$(".qty-pill", card);
    const btnMinus = runtime.$(".qty-pill__btn--minus", card);
    const btnPlus = runtime.$(".qty-pill__btn--plus", card);
    const center = runtime.$(".qty-pill__center", card);
    let mediaPill = media ? runtime.$("[data-media-pill]", media) : null;
    const stockAvailable = (context.isAvailable || runtime.isProductAvailable)(product);
    const pid = Number(product?.id || 0);
    const remaining = Number.isFinite(pid) && pid > 0 ? (context.getRemaining || runtime.getAvailableStock)(pid) : Infinity;
    const plusBlockedByLimit = stockAvailable && Number.isFinite(remaining) && remaining <= 0;
    const plusBlockedByIngredients =
      stockAvailable && Number.isFinite(pid) && pid > 0 ? (context.isIngredientBlocked || runtime.isProductBlockedByIngredientRequirements)(pid) : false;
    const availableForAdd = stockAvailable && !plusBlockedByLimit && !plusBlockedByIngredients
      && runtime.getProductPreorderInfo(product)?.isOpen !== false;

    const hasCartQty = Number(qty || 0) > 0;
    const unavailableOnly = !availableForAdd && !hasCartQty;

    card.setAttribute("data-qty", String(qty));
    card.classList.toggle("is-unavailable", unavailableOnly);

    if (hasCartQty) {
      card.classList.add("is-in-cart");
      if (overlay) overlay.classList.remove("hidden");
      if (qtyBox) {
        if (dir) runtime.animateNumber(qtyBox, qty, dir);
        else {
          qtyBox.textContent = String(qty);
          qtyBox.setAttribute("data-v", String(qty));
        }
      }
      if (media) media.classList.add("is-dim");
    } else {
      card.classList.remove("is-in-cart");
      if (overlay) overlay.classList.add("hidden");
      if (qtyBox) {
        qtyBox.textContent = "";
        qtyBox.setAttribute("data-v", "0");
      }
      if (media) media.classList.toggle("is-dim", unavailableOnly);
    }

    if (pill) {
      pill.classList.toggle("is-empty", qty <= 0);
      pill.classList.toggle("has-qty", qty > 0);
      pill.classList.toggle("qty-pill--muted", !stockAvailable);
      pill.classList.toggle("qty-pill--cart-unavailable", qty > 0 && !availableForAdd);
      pill.classList.toggle("qty-pill--no-action", qty <= 0 && !availableForAdd);
    }
    if (btnMinus) {
      const minusDisabled = qty <= 0;
      btnMinus.innerHTML = qty === 1 ? '<i class="fas fa-trash" aria-hidden="true"></i>' : "-";
      btnMinus.setAttribute("aria-label", qty === 1 ? "Удалить" : "Уменьшить");
      btnMinus.classList.toggle("is-disabled", minusDisabled);
      btnMinus.disabled = minusDisabled;
    }
    if (btnPlus) {
      const plusDisabled = !availableForAdd;
      btnPlus.classList.toggle("is-disabled", plusDisabled);
      btnPlus.disabled = plusDisabled;
    }
    if (center) {
      runtime.syncCatalogProductDiscountBadge(card, product, runtime.defaultPriceCache.get(product.id));
      const cachedPrice = runtime.defaultPriceCache.get(product.id);
      const cartAggregate = (context.getAggregate || runtime.getCatalogProductCartAggregate)(product);
      center.innerHTML = runtime.catalogCenterHtml(product, qty, cachedPrice, cartAggregate);
      runtime.syncCatalogUnitPriceLabel(pill, product, qty, cachedPrice);
    }
    if (media) {
      const mediaPillLabel = runtime.getCatalogMediaPillLabel(product, availableForAdd, qty);
      if (mediaPillLabel) {
        if (!mediaPill) {
          mediaPill = runtime.createCatalogMediaPill(product, availableForAdd);
          if (mediaPill) media.appendChild(mediaPill);
        } else {
          mediaPill.classList.toggle("is-sold-out", mediaPillLabel === "Раскупили");
          mediaPill.classList.toggle("is-preorder", runtime.getProductPreorderInfo(product)?.status === 'open' && availableForAdd);
          updateCatalogMediaPillContent(mediaPill, product, mediaPillLabel);
        }
      } else if (mediaPill) {
        mediaPill.remove();
      }
    }
  }

function createCatalogMediaPill(product, availableForAdd = true) {
    const label = runtime.getCatalogMediaPillLabel(product, availableForAdd);
    if (!label) return null;
    const pill = document.createElement("div");
    pill.className = "sp-media-pill";
    pill.setAttribute("data-media-pill", "1");
    pill.classList.toggle("is-sold-out", label === "Раскупили");
    pill.classList.toggle("is-preorder", runtime.getProductPreorderInfo(product)?.status === 'open' && availableForAdd);
    updateCatalogMediaPillContent(pill, product, label);
    return pill;
  }

function getPreorderWeekdaysHtml(weekdays) {
    const days = Array.isArray(weekdays)
      ? [...new Set(weekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
      : [];
    const showDays = days.length > 0 && days.length < 7;
    let daysLabel = '';
    if (showDays) {
      const names = ['\u041f\u043d', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041f\u0442', '\u0421\u0431', '\u0412\u0441'];
      const groups = [];
      for (const day of days) {
        const last = groups[groups.length - 1];
        if (last && last[last.length - 1] + 1 === day) last.push(day);
        else groups.push([day]);
      }
      const isRange = groups.length === 1 && groups[0].length >= 3;
      daysLabel = isRange
        ? `${days[0] === 1 || days[0] === 2 ? '\u0441\u043e' : '\u0441'} ${names[days[0]]} \u043f\u043e ${names[days[days.length - 1]]}`
        : `\u043d\u0430 ${groups.map(group => group.length >= 3
          ? `${names[group[0]]}\u2013${names[group[group.length - 1]]}`
          : group.map(day => names[day]).join(', ')).join(', ')}`;
    }
    const daysHtml = showDays ? runtime.escapeHtml(daysLabel).replace(/\u041f\u043d|\u0412\u0442|\u0421\u0440|\u0427\u0442|\u041f\u0442|\u0421\u0431|\u0412\u0441/g, day => `<strong>${day}</strong>`) : '';
    return daysHtml;
  }

function updateCatalogMediaPillContent(pill, product, label) {
    const weekdays = runtime.getProductPreorderInfo(product)?.settings?.receipt?.weekdays;
    const daysHtml = pill.classList.contains('is-preorder') ? getPreorderWeekdaysHtml(weekdays) : '';
    const showDays = Boolean(daysHtml);
    pill.classList.toggle('has-preorder-weekdays', showDays);
    const chevron = ['Выбрать вариант', 'Изменить состав', 'Выбрать опции', 'Вариант и состав', 'Варианты и опции', 'Состав и опции', 'Настроить товар'].includes(label) ? '<span class="sp-media-pill__chevron" aria-hidden="true">\u203a</span>' : '';
    pill.innerHTML = `<span class="sp-media-pill__text">${runtime.escapeHtml(label)}${showDays ? ` ${daysHtml}` : ''}</span>${chevron}`;
  }

function getCatalogMediaPillLabel(product, availableForAdd = true, qty = 0) {
    const preorder = runtime.getProductPreorderInfo(product);
    if (preorder && !preorder.isOpen) return preorder.label;
    if (!availableForAdd) return Number(qty || 0) > 0 ? "Больше нет" : "Раскупили";
    if (preorder) return preorder.label;
    if (!runtime.isCatalogProductConfigurable(product)) return "";
    const hasOptions = Boolean(product?.blocks_config?.options || Number(product?.has_options || 0) === 1
      || (Array.isArray(product?.options) && product.options.length));
    const hasVariants = Boolean(product?.blocks_config?.variants || (Array.isArray(product?.variants) && product.variants.length));
    const hasIngredients = Boolean(product?.blocks_config?.ingredients || (Array.isArray(product?.ingredients) && product.ingredients.length));
    if (hasVariants && hasIngredients && hasOptions) return "Настроить товар";
    if (hasVariants && hasOptions) return "Варианты и опции";
    if (hasIngredients && hasOptions) return "Состав и опции";
    if (hasVariants && hasIngredients) return "Вариант и состав";
    if (hasOptions) return "Выбрать опции";
    return hasVariants ? "Выбрать вариант" : "Изменить состав";
  }

function getProductPreorderInfo(product) {
    if (runtime.showPreorderMediaLabel !== true || product?.sale_mode !== 'preorder') return null;
    let settings = product.preorder_settings_json;
    try { if (typeof settings === 'string') settings = JSON.parse(settings); }
    catch (error) { console.error('Invalid preorder settings',product.id,error); }
    const today = runtime.getPreorderToday?.();
    const acceptance = settings?.acceptance;
    if (!today || !['any','period'].includes(acceptance?.mode)) return { settings, status:'invalid', isOpen:false, label:'Предзаказ недоступен' };
    if (acceptance.mode === 'period') {
      if (!acceptance.start || !acceptance.end) return { settings, status:'invalid', isOpen:false, label:'Предзаказ недоступен' };
      if (today < acceptance.start) return { settings, status:'upcoming', isOpen:false, label:`Предзаказ с ${acceptance.start.slice(8,10)}.${acceptance.start.slice(5,7)}` };
      if (today > acceptance.end) return { settings, status:'closed', isOpen:false, label:'Приём завершён' };
    }
    return { settings, status:'open', isOpen:true, label:'По предзаказу' };
  }

function getProductPreorderDescription(product) {
    const info = runtime.getProductPreorderInfo(product);
    if (!info?.settings?.receipt) return [];
    const settings = info.settings, receipt = settings.receipt;
    const today = runtime.getPreorderToday?.();
    const formatDate = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('ru-RU', { day:'numeric',month:'long',timeZone:'UTC', ...(value.slice(0,4) !== today?.slice(0,4) ? {year:'numeric'} : {}) });
    const formatPeriod = (start, end) => start.slice(0,7) === end.slice(0,7)
      ? `${Number(start.slice(8))}–${formatDate(end)}` : `${formatDate(start)} — ${formatDate(end)}`;
    const lines = [];
    if (settings.acceptance.mode === 'period') {
      lines.push(`Приём предзаказов: ${formatPeriod(settings.acceptance.start, settings.acceptance.end)}`);
    }
    if (receipt.mode === 'period') {
      lines.push(`Период получения: ${formatPeriod(receipt.start, receipt.end)}`);
    } else if (receipt.mode === 'dates') {
      const dates = [...new Set(receipt.dates)].sort().filter(date => !receipt.weekdays.length || receipt.weekdays.includes((new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7));
      lines.push(dates.length ? `Получение: ${dates.map(formatDate).join(', ')}` : 'Нет доступных дат получения');
    } else lines.push('Получение по предзаказу');
    const days = [...new Set(receipt.weekdays || [])].sort((a,b)=>a-b);
    if (days.length && receipt.mode !== 'dates') {
      const plural = ['понедельникам','вторникам','средам','четвергам','пятницам','субботам','воскресеньям'];
      const from = ['с понедельника','со вторника','со среды','с четверга','с пятницы','с субботы','с воскресенья'];
      const until = ['понедельник','вторник','среду','четверг','пятницу','субботу','воскресенье'];
      const groups = [];
      for (const day of days) {
        const last = groups[groups.length-1];
        if (last && last[last.length-1]+1 === day) last.push(day); else groups.push([day]);
      }
      const parts = groups.map(group => group.length >= 3 ? `${from[group[0]]} по ${until[group[group.length-1]]}` : `по ${group.map(day=>plural[day]).join(' и ')}`);
      const text = parts.join(' и ');
      if (receipt.mode === 'period') lines[lines.length-1] += ` (${text})`;
      else lines[lines.length-1] = `Получение: ${text}`;
    }
    const hours = settings.lead_hours;
    const hourWord = hours%100 >= 11 && hours%100 <= 14 ? 'часов' : hours%10 === 1 ? 'час' : hours%10 >= 2 && hours%10 <= 4 ? 'часа' : 'часов';
    lines.push(`Оформляйте минимум за ${hours} ${hourWord} до получения`);
    if (hours < 24) lines.push('Получение — начиная с завтрашнего дня');
    return lines;
  }

function isCatalogProductConfigurable(product) {
    const cfg = product?.blocks_config && typeof product.blocks_config === "object"
      ? product.blocks_config
      : null;
    return Boolean(
      cfg?.variants ||
      cfg?.options ||
      cfg?.ingredients ||
      (Array.isArray(product?.variants) && product.variants.length) ||
      (Array.isArray(product?.options) && product.options.length) ||
      (Array.isArray(product?.ingredients) && product.ingredients.length)
    );
  }

function syncCatalogUnitPriceLabel(pill, product, qty, calculatedPrice = null) {
    if (!pill) return;
    let label = pill.querySelector(".sp-unit-price-label");
    const shouldShow = Number(qty || 0) > 0;
    if (!shouldShow) {
      if (label) label.remove();
      return;
    }
    if (!label) {
      label = document.createElement("div");
      label.className = "sp-unit-price-label";
      pill.appendChild(label);
    }
    const price = calculatedPrice != null
      ? calculatedPrice
      : (product?.display_price != null ? Number(product.display_price) : Number(product?.price || 0));
    label.textContent = `${runtime.catalogMoneyNoKopeks(price)} ₽`;
  }

function catalogMoneyNoKopeks(value) {
    const n = Number(value || 0);
    return runtime.moneyNoSign(Number.isFinite(n) ? Math.round(n) : 0);
  }

function catalogCenterHtml(product, qty, calculatedPrice = null, cartAggregate = null) {
    const old = Number(product.old_price || 0);
    let price = calculatedPrice != null
      ? calculatedPrice
      : (product.display_price != null ? Number(product.display_price) : Number(product.price || 0));
    const scaledOld = runtime.scaleProductBasePriceForCurrentUnit(product, price, old);
    let showOld = scaledOld > 0 && scaledOld > price;

    // Обработка скидок из API (бейдж теперь на картинке, здесь только цена)
    if (product.discount && product.discount.discount_amount > 0) {
      const originalPrice = Number(product.original_price || price);
      const discountedPrice = Number(product.discounted_price || price);
      
      // Отображаем старую цену зачёркнутой
      if (!showOld && originalPrice > discountedPrice) {
        showOld = true;
        price = discountedPrice;
      }
    }

    if (qty > 0) {
      const aggregate = cartAggregate && typeof cartAggregate === "object"
        ? cartAggregate
        : runtime.getCatalogProductCartAggregate(product);
      const total = Number(aggregate?.total || 0);
      const displayTotal = total > 0 ? total : price;
      const oldTotal = Number(aggregate?.oldTotal || 0);
      const totalText = `${runtime.catalogMoneyNoKopeks(displayTotal)} ₽`;
      const totalClass = String(Math.round(displayTotal)).length > 5 ? " sp-cart-total--compact" : "";
      if (oldTotal > displayTotal) {
        const oldTotalText = `${runtime.catalogMoneyNoKopeks(oldTotal)} ₽`;
        return `<span class="sp-cart-total-stack${totalClass}"><span class="sp-cart-old-total">${runtime.escapeHtml(oldTotalText)}</span><span class="sp-cart-total">${runtime.escapeHtml(totalText)}</span></span>`;
      }
      return `<span class="sp-cart-total${totalClass}">${runtime.escapeHtml(totalText)}</span>`;
    }
    if (showOld) {
      const oldPrice = product.discount ? Number(product.original_price) : scaledOld;
      return `<span class="sp-price-stack"><span class="sp-old-price">${runtime.catalogMoneyNoKopeks(oldPrice)} ₽</span><span class="sp-current-price">${runtime.catalogMoneyNoKopeks(price)} ₽</span></span>`;
    }
    return `<span class="sp-current-price">${runtime.catalogMoneyNoKopeks(price)} ₽</span>`;
  }

function syncCatalogProductDiscountBadge(card, product, calculatedPrice = null) {
    if (!card || !product) return;
    const media = runtime.$(".sp-media", card);
    if (!media) return;
    const badgeText = runtime.getCatalogProductDiscountBadge(product, calculatedPrice);
    const currentBadge = media.querySelector(".sp-card-discount-badge");
    if (!badgeText) {
      if (currentBadge) currentBadge.remove();
      return;
    }
    if (currentBadge) {
      currentBadge.textContent = badgeText;
      return;
    }
    const badge = runtime.createCatalogDiscountBadge(badgeText);
    if (badge) media.appendChild(badge);
  }

function getCatalogProductDiscountBadge(product, calculatedPrice = null) {
    if (!product || typeof product !== "object") return "";

    const apiDiscount = product.discount;
    const apiDiscountAmount = runtime.roundPrice(Number(apiDiscount?.discount_amount || 0));
    if (apiDiscount && apiDiscountAmount > 0) {
      const discountType = runtime.str(apiDiscount.discount_type || "").trim().toLowerCase();
      const discountValue = Number(apiDiscount.discount_value || 0);
      if (discountType === "percent" && discountValue > 0) {
        return `-${Math.round(discountValue)}%`;
      }
      return runtime.formatCatalogDiscountBadgeAmount(apiDiscountAmount);
    }

    const currentPriceRaw = calculatedPrice != null
      ? Number(calculatedPrice)
      : (product.display_price != null ? Number(product.display_price) : Number(product.price || 0));
    const currentPrice = runtime.roundPrice(Number.isFinite(currentPriceRaw) ? currentPriceRaw : 0);
    const originalPriceRaw = product.original_price != null
      ? Number(product.original_price)
      : runtime.scaleProductBasePriceForCurrentUnit(product, currentPrice, Number(product.old_price || 0));
    const originalPrice = runtime.roundPrice(Number.isFinite(originalPriceRaw) ? originalPriceRaw : 0);
    if (!(originalPrice > currentPrice && currentPrice >= 0)) return "";

    const percent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    if (percent > 0) return `-${percent}%`;
    return runtime.formatCatalogDiscountBadgeAmount(originalPrice - currentPrice);
  }

function formatCatalogDiscountBadgeAmount(amount) {
    const value = runtime.roundPrice(Number(amount || 0));
    if (!(value > 0)) return "";
    return `-${runtime.moneyNoSign(value)} ₽`;
  }

function animateNumber(el, newValue, dir) {
    const prev = el.getAttribute("data-v") || el.textContent.trim() || "0";
    const next = String(newValue);
    el.setAttribute("data-v", next);

    if (!prev || prev === next) {
      el.textContent = next;
      return;
    }

    el.innerHTML = "";
    const oldSpan = document.createElement("span");
    oldSpan.className = "qty-num qty-old";
    oldSpan.textContent = prev;

    const newSpan = document.createElement("span");
    newSpan.className = "qty-num qty-new";
    newSpan.textContent = next;

    el.appendChild(oldSpan);
    el.appendChild(newSpan);

    oldSpan.style.transform = "translateX(0)";
    oldSpan.style.opacity = "1";
    newSpan.style.transform = "translateX(0) scale(0.8)";
    newSpan.style.opacity = "0";

    void el.offsetWidth;

    requestAnimationFrame(() => {
      oldSpan.style.transform = dir === "inc" ? "translateX(-105%) scale(0.9)" : "translateX(105%) scale(0.9)";
      oldSpan.style.opacity = "0";
      newSpan.style.transform = "translateX(0) scale(1)";
      newSpan.style.opacity = "1";
    });

    setTimeout(() => {
      el.innerHTML = "";
      el.textContent = next;
    }, 320);
  }

function createCatalogComboCard(combo, options = {}) {
    const comboId = Number(combo.id);
    const onOpen = options.onOpen || runtime.openComboDetails;
    let preorder = runtime.getProductPreorderInfo(combo);
    let canOrder = preorder?.isOpen !== false && combo.is_available !== false && Number(combo.is_available ?? 1) !== 0;
    const card = document.createElement("article");
    card.className = "sp-card sp-card--combo";
    card.setAttribute("data-combo-id", String(comboId));

    const media = document.createElement("div");
    media.className = "sp-media sp-media--combo";

    const gridPhotos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];
    const gridThumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
    const singleImage = (combo.image_url || "").trim();
    const singleImageThumb = (combo.image_thumb || "").trim();
    // ??????? ???? ? ????? 2?2: ?????? 0,1,2,3 ? ???? 1, 3, 4, 2 (??????? 0, 2, 3, 1)
    const comboGridOrder = [0, 2, 3, 1];
    const isCriticalCard = options.isCriticalCard === true;

    if (singleImage) {
      const finalImage = singleImageThumb || singleImage;
      const previewUrl = combo.image_lqip || finalImage;
      if (isCriticalCard) {
        runtime.preloadImageOnce(finalImage, { fetchPriority: 'high' });
      }

      const imgPreview = runtime.createOptimizedImage(previewUrl, {
        type: "product-grid",
        className: "sp-img sp-img-lqip",
        alt: "",
        priority: isCriticalCard,
      });
      media.appendChild(imgPreview);

      const imgFull = runtime.createOptimizedImage(finalImage, {
        type: "product-grid",
        className: "sp-img sp-img-full",
        alt: "",
        priority: isCriticalCard,
      });
      const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
      if (fullImgEl) {
        fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
        fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
      }
      media.appendChild(imgFull);
      if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");
    } else if (gridPhotos.length > 0) {
      const grid = document.createElement("div");
      grid.className = "sp-combo-grid";
      const gridPhotoSets = Array.isArray(combo.grid_photo_sets) ? combo.grid_photo_sets : [];
      const comboSlideDirections = ["up", "right", "left", "down"];
      const comboGridRotators = [];
      for (let i = 0; i < 4; i++) {
        const cell = document.createElement("div");
        cell.className = "sp-combo-grid__cell";
        const src = gridPhotos[comboGridOrder[i]] || "";
        const thumb = gridThumbs[comboGridOrder[i]] || "";
        const finalSrc = thumb || src;
        if (finalSrc) {
          if (isCriticalCard) {
            runtime.preloadImageOnce(finalSrc, { fetchPriority: 'high' });
          }
          const imgFull = runtime.createComboGridImageNode(finalSrc, isCriticalCard);
          const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
          if (fullImgEl) {
            fullImgEl.addEventListener("load", () => cell.classList.add("is-loaded"));
            fullImgEl.addEventListener("error", () => cell.classList.add("is-loaded"));
          }
          cell.appendChild(imgFull);
          if (fullImgEl && fullImgEl.complete) cell.classList.add("is-loaded");
          const alternatives = Array.isArray(gridPhotoSets[comboGridOrder[i]])
            ? gridPhotoSets[comboGridOrder[i]]
            : [];
          comboGridRotators.push({
            cell,
            photos: [finalSrc, ...alternatives],
            direction: comboSlideDirections[i],
            isCriticalCard,
          });
        } else {
          cell.classList.add("sp-combo-grid__cell--empty");
        }
        grid.appendChild(cell);
      }
      runtime.startComboGridRotation(comboGridRotators);
      media.appendChild(grid);
    } else {
      const imgPreview = runtime.createOptimizedImage("/static/img/placeholder.png", {
        type: "product-grid",
        className: "sp-img sp-img-lqip",
        alt: "",
        priority: isCriticalCard,
      });
      media.appendChild(imgPreview);

      const imgFull = runtime.createOptimizedImage("/static/img/placeholder.png", {
        type: "product-grid",
        className: "sp-img sp-img-full",
        alt: "",
        priority: isCriticalCard,
      });
      const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
      if (fullImgEl) {
        fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
        fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
      }
      media.appendChild(imgFull);
      if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");
    }

    const comboDiscountBadge = runtime.createCatalogDiscountBadge(runtime.getCatalogComboDiscountBadge(combo));
    if (comboDiscountBadge) media.appendChild(comboDiscountBadge);
    const comboMediaPill = document.createElement("div");
    comboMediaPill.className = "sp-media-pill";
    if (preorder) {
      comboMediaPill.classList.toggle("is-preorder", preorder.status === "open");
      updateCatalogMediaPillContent(comboMediaPill, combo, preorder.label);
    }
    if (!preorder) comboMediaPill.innerHTML = '<span class="sp-media-pill__text">Собрать комбо</span><span class="sp-media-pill__chevron" aria-hidden="true">›</span>';
    media.appendChild(comboMediaPill);

    card.appendChild(media);

    const info = document.createElement("div");
    info.className = "sp-info";

    const title = document.createElement("div");
    title.className = "sp-title sp-title--two-lines";
    title.textContent = runtime.str(combo.title);
    info.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "sp-sub sp-sub--one-line";
    sub.textContent = runtime.str(combo.description || "");
    info.appendChild(sub);

    const bottom = document.createElement("div");
    bottom.className = "sp-bottom";
    const minPrice = Number(combo.min_price) || 0;
    const { pill, btnPlus } = runtime.createQtyPill({
      variant: "buy",
      centerHtml: `<span class="sp-current-price">от ${runtime.catalogMoneyNoKopeks(minPrice)} ₽</span>`,
      minusEnabled: false,
      plusEnabled: canOrder,
    });
    pill.classList.add("is-empty", "sp-combo-pill");
    bottom.appendChild(pill);
    info.appendChild(bottom);
    card.appendChild(info);
    const syncPreorderState = () => {
      preorder = runtime.getProductPreorderInfo(combo);
      canOrder = preorder?.isOpen !== false && combo.is_available !== false && Number(combo.is_available ?? 1) !== 0;
      btnPlus.disabled = !canOrder;
      btnPlus.classList.toggle('is-disabled', !canOrder);
      if (preorder) {
        comboMediaPill.classList.toggle('is-preorder', preorder.status === 'open');
        updateCatalogMediaPillContent(comboMediaPill, combo, preorder.label);
      }
    };
    card.__syncPreorderState = syncPreorderState;
    syncPreorderState();


    btnPlus.addEventListener("click", (e) => {
      e.stopPropagation();
      syncPreorderState();
      if (canOrder) onOpen(comboId);
    });
    card.addEventListener("click", (e) => {
      if (!e.target.closest(".qty-pill")) {
        syncPreorderState();
      if (canOrder) onOpen(comboId);
      }
    });
    const warmComboDetailsOnIntent = () => {
      if (runtime.isKsoCatalogCache || options.onOpen) return;
      runtime.scheduleComboDetailsPrefetch([comboId], { limit: 1, delayMs: 0 });
    };
    card.addEventListener("pointerenter", warmComboDetailsOnIntent, { passive: true, once: true });
    card.addEventListener("touchstart", warmComboDetailsOnIntent, { passive: true, once: true });
    btnPlus.addEventListener("focus", warmComboDetailsOnIntent, { once: true });

    return card;
  }

function getCatalogComboDiscountBadge(combo) {
    const discountPercent = Number(combo?.discount_percent || 0) || 0;
    if (!(discountPercent > 0)) return "";
    return `-${Math.round(discountPercent)}%`;
  }

function createCatalogProductCard(p, overrides = {}) {
    const context = {
      getQty: runtime.cartQty,
      isAvailable: runtime.isProductAvailable,
      getRemaining: runtime.getAvailableStock,
      isIngredientBlocked: runtime.isProductBlockedByIngredientRequirements,
      getAggregate: runtime.getCatalogProductCartAggregate,
      onAdd: async (product) => { await runtime.addUpsellToCart(product, runtime.elCartList); runtime.syncAllProductCardsFromCart(); },
      onRemove: (product) => runtime.changeQty(Number(product.id), -1),
      onOpen: (product) => runtime.openProductDetails(Number(product.id)),
      ...overrides,
    };
    const id = Number(p.id);
    const qty = context.getQty(id);
    const available = context.isAvailable(p) && runtime.getProductPreorderInfo(p)?.isOpen !== false;
    const photos = runtime.safePhotos(p);
    const mainPhoto = photos[0] || "";
    const gridPhoto = p.photo_thumb || mainPhoto || "";
    const previewPhoto = p.photo_lqip || p.photo_thumb || mainPhoto || "/static/img/placeholder.png";
    const isCriticalCard = overrides.isCriticalCard === true;
    const card = document.createElement("article");
    card.className = "sp-card";
    card.setAttribute("data-product-id", String(id));
    card.setAttribute("data-qty", String(qty));
    if (qty > 0) card.classList.add("is-in-cart");

    const media = document.createElement("div");
    media.className = "sp-media";

    if (isCriticalCard) {
      runtime.preloadImageOnce(gridPhoto || mainPhoto || "/static/img/placeholder.png", { fetchPriority: 'high' });
    }

    // LQIP-?????? (????? ???????????? ????????? previewPhoto, ???? ?????? ??? ??????)
    const imgPreview = runtime.createOptimizedImage(previewPhoto, {
      type: 'product-grid',
      className: 'sp-img sp-img-lqip',
      alt: '',
      usePicture: false,
      priority: isCriticalCard,
    });
    media.appendChild(imgPreview);

    // ??????????? ??????????? ?????? (createOptimizedImage ????? ??????? <picture> ??? .webp)
    const imgFull = runtime.createOptimizedImage(gridPhoto || mainPhoto || "/static/img/placeholder.png", {
      type: 'product-grid',
      className: 'sp-img sp-img-full',
      alt: '',
      usePicture: true,
      priority: isCriticalCard,
    });
    const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
    if (fullImgEl) {
      fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
      fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
    }
    media.appendChild(imgFull);
    if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");

    const overlay = document.createElement("div");
    overlay.className = "sp-qtyOverlay";
    if (qty <= 0) overlay.classList.add("hidden");

    const qBox = document.createElement("div");
    qBox.className = "qty-carousel";
    qBox.textContent = String(qty || "");
    qBox.setAttribute("data-v", String(qty || 0));

    overlay.appendChild(qBox);
    media.appendChild(overlay);

    const productDiscountBadge = runtime.createCatalogDiscountBadge(runtime.getCatalogProductDiscountBadge(p));
    if (productDiscountBadge) media.appendChild(productDiscountBadge);
    const productBuyXGetYBadge = runtime.createCatalogBuyXGetYBadge(p);
    if (productBuyXGetYBadge) media.appendChild(productBuyXGetYBadge);
    const mediaPill = runtime.createCatalogMediaPill(p, available);
    if (mediaPill) media.appendChild(mediaPill);

    card.appendChild(media);

    const info = document.createElement("div");
    info.className = "sp-info";

    const title = document.createElement("div");
    title.className = "sp-title";
    title.textContent = runtime.getCatalogProductTitle(p);
    info.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "sp-sub";
    const defaultLines = runtime.getCatalogProductDefaultLines(p);
    if (defaultLines.length) {
      sub.classList.add("sp-sub--defaults");
      defaultLines.forEach((lineText) => {
        const line = document.createElement("div");
        line.className = "sp-sub-line";
        line.textContent = "\u2022 " + lineText;
        sub.appendChild(line);
      });
    } else {
      sub.textContent = runtime.str(p.description_short || "");
    }
    info.appendChild(sub);

    const bottom = document.createElement("div");
    bottom.className = "sp-bottom";

    const cartAggregate = context.getAggregate(p);
    const { pill, btnMinus, btnPlus, center } = runtime.createQtyPill({
      variant: available ? "buy" : "muted",
      centerHtml: runtime.catalogCenterHtml(p, qty, null, cartAggregate),
      minusEnabled: qty > 0,
      plusEnabled: available,
    });
    runtime.syncCatalogUnitPriceLabel(pill, p, qty);

    if (qty <= 0) pill.classList.add("is-empty");
    else pill.classList.add("has-qty");
    if (!available && qty > 0) pill.classList.add("qty-pill--cart-unavailable");
    if (!available && qty <= 0) pill.classList.add("qty-pill--no-action");
    if (!available) card.classList.add("is-unavailable");

    bottom.appendChild(pill);
    info.appendChild(bottom);
    card.appendChild(info);

    btnPlus.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (btnPlus.disabled) return;
      btnPlus.disabled = true;
      btnPlus.classList.add("is-disabled");
      let added = false;
      try { added = (await context.onAdd(p, card)) !== false; }
      catch (error) {
        if (context.onError) context.onError(error);
        else throw error;
      }
      finally { runtime.applyCardState(card, p, context.getQty(id), added ? "inc" : null, context); }
    });
    btnMinus.addEventListener("click", (e) => {
      e.stopPropagation();
      context.onRemove(p);
      runtime.applyCardState(card, p, context.getQty(id), null, context);
    });
    card.addEventListener("click", () => context.onOpen(p));
    runtime.applyCardState(card, p, qty, null, context);
    return card;
  }

function getCatalogProductDefaultLines(product) {
    return (Array.isArray(product?.catalog_default_lines) ? product.catalog_default_lines : [])
      .map((line) => runtime.str(line || "").trim())
      .filter(Boolean)
      .slice(0, 2);
  }

function getCatalogProductTitle(product) {
    const name = runtime.str(product?.name || "").trim();
    const variantLabel = runtime.str(product?.default_variant?.variant_label || "").trim();
    return [variantLabel, name].filter(Boolean).join(" ") || name;
  }

  return { getPreorderWeekdaysHtml, startComboGridRotation, createComboGridImageNode, applyCardState, createCatalogMediaPill, getCatalogMediaPillLabel, getProductPreorderInfo, getProductPreorderDescription, isCatalogProductConfigurable, syncCatalogUnitPriceLabel, catalogMoneyNoKopeks, catalogCenterHtml, syncCatalogProductDiscountBadge, getCatalogProductDiscountBadge, formatCatalogDiscountBadgeAmount, animateNumber, createCatalogComboCard, getCatalogComboDiscountBadge, createCatalogProductCard, getCatalogProductDefaultLines, getCatalogProductTitle };
});
