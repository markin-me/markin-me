(function () {
  "use strict";

  function str(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return str(value).replace(/[&<>"']/g, function (char) {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }

  function toFiniteNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function toPositiveNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }

  function roundMoney(value) {
    return Math.round(toFiniteNumber(value) * 100) / 100;
  }

  function defaultMoney(value) {
    var normalized = roundMoney(value);
    return normalized.toLocaleString("ru-RU") + " \u20bd";
  }

  function moneyOf(value, money) {
    if (typeof money === "function") {
      try {
        return String(money(value));
      } catch (_) {}
    }
    return defaultMoney(value);
  }

  function getItemQty(item) {
    var qty = Number(item && (item.qty != null ? item.qty : item.quantity));
    return Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.trunc(qty)) : 1;
  }

  function isGiftRewardItem(item) {
    return Number(item && item.is_gift_reward || 0) === 1;
  }

  function isAutoAddItem(item) {
    if (Number(item && item.auto_add || 0) === 1) return true;
    var name = str(item && (item.product_name || item.name) || "").trim().toLowerCase();
    return name === "\u043f\u0440\u0438\u0431\u043e\u0440\u044b";
  }

  function sortAutoAddToEnd(items) {
    return (Array.isArray(items) ? items : [])
      .map(function (item, index) {
        return { item: item, index: index };
      })
      .sort(function (left, right) {
        var leftAuto = isAutoAddItem(left.item);
        var rightAuto = isAutoAddItem(right.item);
        if (leftAuto && !rightAuto) return 1;
        if (!leftAuto && rightAuto) return -1;
        return left.index - right.index;
      })
      .map(function (entry) {
        return entry.item;
      });
  }

  function cleanPhotos(value, maxItems) {
    return (Array.isArray(value) ? value : [])
      .map(function (src) {
        return str(src).trim();
      })
      .filter(Boolean)
      .slice(0, maxItems || 4);
  }

  function normalizeVariantUnitLabel(unitRaw) {
    var raw = str(unitRaw).trim();
    if (!raw) return "";
    var key = raw.toLowerCase();
    var map = {
      "\u0448\u0442\u0443\u043a": "\u0448\u0442",
      "\u0448\u0442\u0443\u043a\u0430": "\u0448\u0442",
      "\u0448\u0442": "\u0448\u0442",
      "\u0433\u0440\u0430\u043c\u043c": "\u0433",
      "\u0433\u0440\u0430\u043c\u043c\u0430": "\u0433",
      "\u0433\u0440": "\u0433",
      "\u0433": "\u0433",
      "\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c": "\u043a\u0433",
      "\u043a\u0438\u043b\u043e\u0433\u0440\u0430\u043c\u043c\u0430": "\u043a\u0433",
      "\u043a\u0433": "\u043a\u0433",
      "\u043c\u0438\u043b\u043b\u0438\u043b\u0438\u0442\u0440": "\u043c\u043b",
      "\u043c\u0438\u043b\u043b\u0438\u043b\u0438\u0442\u0440\u0430": "\u043c\u043b",
      "\u043c\u043b": "\u043c\u043b",
      "\u043b\u0438\u0442\u0440": "\u043b",
      "\u043b\u0438\u0442\u0440\u0430": "\u043b",
      "\u043b": "\u043b"
    };
    return map[key] || raw;
  }

  function extractVariantUnitFromGroupTitle(groupTitleRaw) {
    var groupTitle = str(groupTitleRaw).trim();
    if (!groupTitle) return "";
    var match = groupTitle.match(/\(([^)]+)\)\s*$/);
    if (!match) return "";
    return normalizeVariantUnitLabel(str(match[1]).trim());
  }

  function mergeVariantUnit(labelRaw, unitRaw) {
    var label = str(labelRaw).trim();
    var unit = str(unitRaw).trim();
    if (!label) return unit;
    if (!unit) return label;

    var escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var measureMatch = label.match(new RegExp("^\\s*([\\d.,]+\\s*" + escapedUnit + ")(?:\\b|\\s|$)", "i"));
    if (measureMatch && str(measureMatch[1]).trim()) {
      return str(measureMatch[1]).trim();
    }

    var labelLower = label.toLowerCase();
    var unitLower = unit.toLowerCase();
    if (labelLower === unitLower || labelLower.endsWith(" " + unitLower)) {
      return label;
    }
    return (label + " " + unit).trim();
  }

  function buildVariantDisplayLine(labelRaw, unitRaw, groupTitleRaw) {
    var label = str(labelRaw).trim();
    if (label.indexOf(":") !== -1) {
      var valueOnly = str(label.split(":").slice(1).join(":")).trim();
      label = valueOnly || label;
    }
    var unit = str(unitRaw).trim() || extractVariantUnitFromGroupTitle(groupTitleRaw);
    return mergeVariantUnit(label, unit);
  }

  function formatQtyUnitName(qtyRaw, unitRaw, nameRaw) {
    var qtyNum = Number(qtyRaw);
    var qtyText = Number.isFinite(qtyNum)
      ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
      : str(qtyRaw).trim();
    var unitText = str(unitRaw).trim();
    var nameText = str(nameRaw).trim();
    return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
  }

  function formatIngredientLine(ingredient) {
    if (!ingredient || typeof ingredient !== "object") return "";
    var qty = ingredient.qty != null ? ingredient.qty : ingredient.quantity;
    var qtyNum = Number(qty);
    if (Number.isFinite(qtyNum) && qtyNum <= 0) return "";
    return formatQtyUnitName(
      qty,
      ingredient.unit_label || ingredient.unit || ingredient.unitLabel || ingredient.unit_short_title || ingredient.unit_title || "",
      ingredient.ingredient_name || ingredient.name || ""
    );
  }

  function formatOptionLine(option) {
    if (!option || typeof option !== "object") return "";
    var qty = Number(option.qty != null ? option.qty : option.quantity);
    if (Number.isFinite(qty) && qty <= 0) return "";
    var variantLine = mergeVariantUnit(
      option.variant_label || option.variantLabel || "",
      option.variant_unit || option.variantUnit || option.unit || ""
    );
    var title = str(option.title || option.name || "").trim();
    if (variantLine && title) return (variantLine + " " + title).trim();
    if (variantLine) return variantLine;
    return formatQtyUnitName(Number.isFinite(qty) && qty > 0 ? qty : 1, "", title);
  }

  function getItemLineTotal(item) {
    if (isGiftRewardItem(item)) return 0;
    var lineTotal = Number(item && (item.line_total != null ? item.line_total : (item.total != null ? item.total : item.total_price)));
    if (Number.isFinite(lineTotal)) return roundMoney(Math.max(0, lineTotal));
    return roundMoney(Math.max(0, toFiniteNumber(item && item.price) * getItemQty(item)));
  }

  function getOrderItemDisplayPricing(item) {
    var qty = getItemQty(item);
    var currentTotal = getItemLineTotal(item);
    var explicitOriginal = toPositiveNumber(item && item.discount && item.discount.original_line_total);
    var oldLineTotal = toPositiveNumber(item && item.old_line_total);
    var oldPrice = toPositiveNumber(item && item.old_price);
    var originalFromUnit = oldPrice > 0 ? roundMoney(oldPrice * qty) : 0;

    var originalTotal = Math.max(explicitOriginal, oldLineTotal, originalFromUnit);
    if (!(originalTotal > currentTotal) || isGiftRewardItem(item)) {
      originalTotal = 0;
    }

    var discountPercent = toPositiveNumber(
      item && item.discount && item.discount.percent != null
        ? item.discount.percent
        : (item && (item.discount_percent != null ? item.discount_percent : item.discountPercent))
    );
    if (!(discountPercent > 0) && originalTotal > currentTotal && originalTotal > 0) {
      discountPercent = Math.round(((originalTotal - currentTotal) / originalTotal) * 100);
    }
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || !(originalTotal > currentTotal)) {
      discountPercent = 0;
    }
    if (discountPercent > 100) discountPercent = 100;

    return {
      currentTotal: currentTotal,
      originalTotal: originalTotal,
      showOld: originalTotal > currentTotal,
      discountPercent: discountPercent
    };
  }

  function distributeDisplayDiscountAcrossLines(entries, extraOrderDiscount) {
    var eligible = (Array.isArray(entries) ? entries : [])
      .map(function (entry, index) {
        return {
          index: index,
          amountCents: Math.max(0, Math.round(Number(entry && entry.baseTotal || 0) * 100))
        };
      })
      .filter(function (entry) {
        return entry.amountCents > 0;
      });

    var discountsByIndex = new Map();
    if (!eligible.length) return discountsByIndex;

    var totalDiscountCents = Math.max(0, Math.round(roundMoney(extraOrderDiscount) * 100));
    if (!(totalDiscountCents > 0)) return discountsByIndex;

    var baseTotalCents = eligible.reduce(function (sum, entry) {
      return sum + entry.amountCents;
    }, 0);
    if (!(baseTotalCents > 0)) return discountsByIndex;

    var cappedDiscountCents = Math.min(totalDiscountCents, baseTotalCents);
    var prepared = eligible.map(function (entry) {
      var exact = cappedDiscountCents * (entry.amountCents / baseTotalCents);
      var floorValue = Math.min(entry.amountCents, Math.floor(exact));
      return {
        index: entry.index,
        amountCents: entry.amountCents,
        exact: exact,
        floorValue: floorValue,
        fraction: exact - floorValue
      };
    });

    var distributedCents = prepared.reduce(function (sum, entry) {
      return sum + entry.floorValue;
    }, 0);
    var remainderCents = Math.max(0, cappedDiscountCents - distributedCents);

    prepared
      .slice()
      .sort(function (left, right) {
        return (
          right.fraction - left.fraction
          || right.amountCents - left.amountCents
          || left.index - right.index
        );
      })
      .forEach(function (entry) {
        if (!(remainderCents > 0)) return;
        if (entry.floorValue >= entry.amountCents) return;
        entry.floorValue += 1;
        remainderCents -= 1;
      });

    prepared.forEach(function (entry) {
      discountsByIndex.set(entry.index, roundMoney(entry.floorValue / 100));
    });

    return discountsByIndex;
  }

  function buildReadonlyOrderDisplayPricingList(items, opts) {
    var normalizedItems = Array.isArray(items) ? items : [];
    var prepared = normalizedItems.map(function (item) {
      var pricing = getOrderItemDisplayPricing(item);
      return {
        baseTotal: roundMoney(Number(pricing.currentTotal || 0)),
        originalTotal: roundMoney(Math.max(Number(pricing.originalTotal || 0), Number(pricing.currentTotal || 0))),
      };
    });

    var itemLevelDiscountTotal = roundMoney(prepared.reduce(function (sum, entry) {
      return sum + Math.max(0, Number(entry.originalTotal || 0) - Number(entry.baseTotal || 0));
    }, 0));

    var totalDiscount = roundMoney(Math.max(
      0,
      Number(opts && opts.discountAmount != null
        ? opts.discountAmount
        : (opts && opts.order ? opts.order.discount_amount : 0))
    ));
    var extraOrderDiscount = roundMoney(Math.max(0, totalDiscount - itemLevelDiscountTotal));
    var allocatedByIndex = distributeDisplayDiscountAcrossLines(prepared, extraOrderDiscount);

    return prepared.map(function (entry, index) {
      var allocatedDiscount = roundMoney(Number(allocatedByIndex.get(index) || 0));
      var currentTotal = roundMoney(Math.max(0, Number(entry.baseTotal || 0) - allocatedDiscount));
      var originalTotal = roundMoney(Math.max(Number(entry.originalTotal || 0), Number(entry.baseTotal || 0), currentTotal));
      var discountPercent = 0;
      if (originalTotal > currentTotal && originalTotal > 0) {
        discountPercent = Math.round(((originalTotal - currentTotal) / originalTotal) * 100);
      }
      if (!Number.isFinite(discountPercent) || discountPercent <= 0) discountPercent = 0;
      if (discountPercent > 100) discountPercent = 100;

      return {
        currentTotal: currentTotal,
        originalTotal: originalTotal > currentTotal ? originalTotal : currentTotal,
        showOld: originalTotal > currentTotal,
        discountPercent: discountPercent
      };
    });
  }

  function renderPriceGroup(pricing, opts) {
    var currentHtml = escapeHtml(moneyOf(pricing.currentTotal, opts && opts.money));
    var oldHtml = pricing.showOld ? escapeHtml(moneyOf(pricing.originalTotal, opts && opts.money)) : "";
    var badgeText = pricing.discountPercent > 0 ? ("-" + Math.round(pricing.discountPercent) + "%") : "";

    return (
      '<div class="cart-price-group">' +
        '<div class="cart-price-stack">' +
          '<div class="cart-price">' + currentHtml + "</div>" +
          '<div class="cart-old' + (pricing.showOld ? "" : " hidden") + '">' + oldHtml + "</div>" +
        "</div>" +
        '<span class="cart-discount-badge' + (badgeText ? "" : " hidden") + '">' + (badgeText ? escapeHtml(badgeText) : "") + "</span>" +
      "</div>"
    );
  }

  function renderComboThumbHtml(item, opts) {
    var selections = Array.isArray(item && item.selections) ? item.selections : [];
    var selectionPhotos = selections
      .map(function (selection) {
        return str(selection && selection.product_photo).trim();
      })
      .filter(Boolean);
    var photos = (selectionPhotos.length ? selectionPhotos : cleanPhotos(item && item.photos, 4)).slice(0, 4);
    var photoOrder = [0, 2, 3, 1];

    return (
      '<div class="cart-combo-thumb">' +
        photoOrder.map(function (index) {
          var photo = photos[index] || "";
          if (!photo) {
            return '<div class="cart-combo-thumb__cell cart-combo-thumb__cell--empty"></div>';
          }
          return (
            '<div class="cart-combo-thumb__cell">' +
              '<img class="cart-thumb" src="' + escapeHtml(photo) + '" alt="" />' +
            "</div>"
          );
        }).join("") +
      "</div>"
    );
  }

  function renderProductThumbHtml(item, opts) {
    var photos = cleanPhotos(item && item.photos, 4);
    var placeholder = str(opts && opts.placeholderImage).trim() || "/static/img/placeholder.png";
    var mainPhoto = photos[0] || placeholder;
    return '<img class="cart-thumb" src="' + escapeHtml(mainPhoto) + '" alt="" />';
  }

  function renderDetailLines(lines) {
    if (!Array.isArray(lines) || !lines.length) return "";
    return (
      '<div class="cart-sub-container">' +
        '<div class="cart-sub-details">' +
          lines.map(function (line) {
            return '<div class="cart-sub-detail-item">&bull; ' + escapeHtml(line) + "</div>";
          }).join("") +
        "</div>" +
      "</div>"
    );
  }

  function renderComboDetails(item) {
    var selections = Array.isArray(item && item.selections) ? item.selections : [];
    if (!selections.length) return "";

    var blocks = selections.map(function (selection) {
      var productName = str(selection && selection.product_name).trim();
      var variantLine = buildVariantDisplayLine(
        selection && selection.variant_label,
        selection && selection.variant_unit,
        selection && selection.variant_group_title
      );
      var primaryLine = [variantLine, productName].filter(Boolean).join(" ").trim() || productName || "\u0422\u043e\u0432\u0430\u0440";
      var ingredientLines = (Array.isArray(selection && selection.ingredients_display) ? selection.ingredients_display : [])
        .map(formatIngredientLine)
        .filter(Boolean);

      return (
        '<div class="cart-combo-detail-block">' +
          '<div class="cart-combo-detail-name">1 x ' + escapeHtml(primaryLine) + "</div>" +
          (ingredientLines.length
            ? '<div class="cart-sub-details">' +
                ingredientLines.map(function (line) {
                  return '<div class="cart-sub-detail-item">&bull; ' + escapeHtml(line) + "</div>";
                }).join("") +
              "</div>"
            : "") +
        "</div>"
      );
    }).join("");

    return '<div class="cart-sub-container cart-combo-details">' + blocks + "</div>";
  }

  function renderProductDetails(item) {
    var variants = Array.isArray(item && item.variants) ? item.variants : [];
    var variantLines = [];

    variants.forEach(function (variant) {
      var line = buildVariantDisplayLine(
        variant && (variant.label || variant.value),
        variant && (variant.unit || variant.unit_short_title || variant.unitLabel || variant.unit_title),
        variant && (variant.group_title || variant.groupTitle)
      );
      if (line) variantLines.push(line);
    });

    if (!variantLines.length) {
      var fallbackLine = buildVariantDisplayLine(
        item && (item.variant_label || item.variantLabel),
        item && (item.variant_unit || item.variantUnit),
        item && (item.variant_group_title || item.variantGroupTitle)
      );
      if (fallbackLine) variantLines.push(fallbackLine);
    }

    var detailLines = variantLines.slice(1);

    (Array.isArray(item && item.ingredients) ? item.ingredients : []).forEach(function (ingredient) {
      var line = formatIngredientLine(ingredient);
      if (line) detailLines.push(line);
    });

    (Array.isArray(item && item.options) ? item.options : []).forEach(function (option) {
      var line = formatOptionLine(option);
      if (line) detailLines.push(line);
    });

    return {
      primaryVariantLine: variantLines[0] || "",
      detailsHtml: renderDetailLines(detailLines)
    };
  }

  function isComboItem(item) {
    return str(item && item.type).toLowerCase() === "combo"
      || Number(item && item.combo_id || 0) > 0
      || (Array.isArray(item && item.selections) && item.selections.length > 0);
  }

  function renderReadonlyOrderItem(item, opts) {
    if (!item || typeof item !== "object") return "";

    var qty = getItemQty(item);
    var pricing = opts && opts.displayPricing
      ? opts.displayPricing
      : getOrderItemDisplayPricing(item);
    var priceHtml = renderPriceGroup(pricing, opts || {});
    var rowClasses = ["cart-row", "cart-row--readonly-order"];
    var thumbHtml = "";
    var titleText = "";
    var detailsHtml = "";

    if (isComboItem(item)) {
      rowClasses.push("cart-row--combo");
      thumbHtml = renderComboThumbHtml(item, opts);
      titleText = str(item.name || item.combo_title || "\u041a\u043e\u043c\u0431\u043e").trim() || "\u041a\u043e\u043c\u0431\u043e";
      detailsHtml = renderComboDetails(item);
    } else {
      thumbHtml = renderProductThumbHtml(item, opts);
      var details = renderProductDetails(item);
      var productName = str(item.product_name || item.name || "\u0422\u043e\u0432\u0430\u0440").trim() || "\u0422\u043e\u0432\u0430\u0440";
      var titleBase = [details.primaryVariantLine, productName].filter(Boolean).join(" ").trim() || productName;
      titleText = isGiftRewardItem(item) ? (titleBase + " (\u041f\u043e\u0434\u0430\u0440\u043e\u043a)") : titleBase;
      detailsHtml = details.detailsHtml;
    }

    return (
      '<div class="' + rowClasses.join(" ") + '">' +
        thumbHtml +
        '<div class="cart-mid">' +
          '<div class="cart-title">' + escapeHtml(String(qty) + " x " + titleText) + "</div>" +
          detailsHtml +
        "</div>" +
        '<div class="cart-right">' + priceHtml + "</div>" +
      "</div>"
    );
  }

  function renderReadonlyOrderItems(items, opts) {
    var normalized = opts && opts.sortAutoAdd ? sortAutoAddToEnd(items) : (Array.isArray(items) ? items : []);
    var pricingList = buildReadonlyOrderDisplayPricingList(normalized, opts || {});
    return normalized.map(function (item, index) {
      var itemOpts = Object.assign({}, opts || {}, {
        displayPricing: pricingList[index] || getOrderItemDisplayPricing(item)
      });
      return renderReadonlyOrderItem(item, itemOpts);
    }).join("");
  }

  window.SharedOrderItems = Object.assign({}, window.SharedOrderItems, {
    getOrderItemDisplayPricing: getOrderItemDisplayPricing,
    buildReadonlyOrderDisplayPricingList: buildReadonlyOrderDisplayPricingList,
    renderReadonlyOrderItem: renderReadonlyOrderItem,
    renderReadonlyOrderItems: renderReadonlyOrderItems
  });
})();
