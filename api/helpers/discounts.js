/**
 * Модуль расчета скидок
 * Функции для работы со скидками из таблицы mkt_discounts
 */

/**
 * Проверить активность скидки (даты, расписание, лимиты)
 * @param {Object} discount - объект скидки
 * @returns {boolean}
 */
function isDiscountActive(discount) {
  if (!discount || !discount.is_active) return false;

  const now = new Date();

  // Проверка дат начала/окончания
  if (discount.starts_at && new Date(discount.starts_at) > now) return false;
  if (discount.ends_at && new Date(discount.ends_at) < now) return false;

  // Проверка расписания по дням недели
  if (discount.schedule_days) {
    const days = typeof discount.schedule_days === 'string' 
      ? JSON.parse(discount.schedule_days) 
      : discount.schedule_days;
    if (Array.isArray(days) && days.length > 0) {
      const currentDay = now.getDay(); // 0 = воскресенье
      if (!days.includes(currentDay)) return false;
    }
  }

  // Проверка расписания по времени
  if (discount.schedule_time_start || discount.schedule_time_end) {
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    if (discount.schedule_time_start) {
      const [h, m] = discount.schedule_time_start.split(':').map(Number);
      const startMinutes = h * 60 + m;
      if (currentTime < startMinutes) return false;
    }
    
    if (discount.schedule_time_end) {
      const [h, m] = discount.schedule_time_end.split(':').map(Number);
      const endMinutes = h * 60 + m;
      if (currentTime > endMinutes) return false;
    }
  }

  // Проверка общего лимита использований
  if (discount.usage_limit && discount.usage_count >= discount.usage_limit) {
    return false;
  }

  return true;
}

/**
 * Рассчитать сумму скидки
 * @param {number} price - исходная цена
 * @param {string} discountType - тип скидки (percent, fixed, special_price)
 * @param {number} discountValue - значение скидки
 * @param {number} maxDiscountAmount - максимальный размер скидки (опционально)
 * @returns {number} сумма скидки
 */
function calculateDiscount(price, discountType, discountValue, maxDiscountAmount = null) {
  if (!price || price <= 0 || !discountValue) return 0;

  let discountAmount = 0;

  switch (discountType) {
    case 'percent':
      discountAmount = price * (discountValue / 100);
      break;
    case 'fixed':
      discountAmount = discountValue;
      break;
    case 'special_price':
      // Специальная цена - скидка = разница между обычной ценой и специальной
      discountAmount = Math.max(0, price - discountValue);
      break;
    default:
      return 0;
  }

  // Ограничение максимальным размером скидки
  if (maxDiscountAmount && discountAmount > maxDiscountAmount) {
    discountAmount = maxDiscountAmount;
  }

  // Скидка не может быть больше цены
  if (discountAmount > price) {
    discountAmount = price;
  }

  return Math.round(discountAmount * 100) / 100;
}

/**
 * Получить активные скидки для товара
 * @param {Object} db - подключение к БД
 * @param {number} tenantId
 * @param {number} storeId
 * @param {number} productId
 * @param {number[]} categoryIds - массив ID категорий товара
 * @returns {Promise<Object[]>} массив активных скидок
 */
async function getActiveDiscountsForProduct(db, tenantId, storeId, productId, categoryIds = []) {
  // Скидки привязанные напрямую к товару
  const [directDiscounts] = await db.query(
    `SELECT d.* 
     FROM mkt_discounts d
     JOIN mkt_discount_products dp ON dp.discount_id = d.id AND dp.tenant_id = d.tenant_id
     WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_active = 1
       AND dp.product_id = ?`,
    [tenantId, storeId, productId]
  );

  // Скидки по категориям товара
  let categoryDiscounts = [];
  if (categoryIds.length > 0) {
    const [catDisc] = await db.query(
      `SELECT d.*
       FROM mkt_discounts d
       JOIN mkt_discount_products dp ON dp.discount_id = d.id AND dp.tenant_id = d.tenant_id
       WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_active = 1
         AND dp.category_id IN (?)`,
      [tenantId, storeId, categoryIds]
    );
    categoryDiscounts = catDisc;
  }

  // Объединяем и фильтруем активные
  const allDiscounts = [...directDiscounts, ...categoryDiscounts];
  const uniqueDiscounts = [];
  const seenIds = new Set();

  for (const discount of allDiscounts) {
    if (!seenIds.has(discount.id) && isDiscountActive(discount)) {
      uniqueDiscounts.push(discount);
      seenIds.add(discount.id);
    }
  }

  // Сортируем по приоритету (выше = важнее)
  uniqueDiscounts.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return uniqueDiscounts;
}

/**
 * Получить активные скидки для клиента
 * @param {Object} db - подключение к БД
 * @param {number} tenantId
 * @param {number} storeId
 * @param {number} customerId
 * @returns {Promise<Object[]>} массив активных скидок
 */
async function getActiveDiscountsForCustomer(db, tenantId, storeId, customerId) {
  if (!customerId) return [];

  // Скидки привязанные напрямую к клиенту
  const [directDiscounts] = await db.query(
    `SELECT d.*, 'direct' AS link_type
     FROM mkt_discounts d
     JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
     WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_active = 1
       AND dc.customer_id = ?`,
    [tenantId, storeId, customerId]
  );

  // Скидки по категориям клиента (target_type='all' или customer_category_id)
  // Упрощенная версия - берем все скидки с customer_category_id
  const [categoryDiscounts] = await db.query(
    `SELECT d.*, 'category' AS link_type
     FROM mkt_discounts d
     JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
     WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_active = 1
       AND dc.customer_category_id IS NOT NULL`,
    [tenantId, storeId]
  );

  // Объединяем и фильтруем активные
  const allDiscounts = [...directDiscounts, ...categoryDiscounts];
  const uniqueDiscounts = [];
  const seenIds = new Set();

  for (const discount of allDiscounts) {
    if (!seenIds.has(discount.id) && isDiscountActive(discount)) {
      uniqueDiscounts.push(discount);
      seenIds.add(discount.id);
    }
  }

  // Сортируем по приоритету
  uniqueDiscounts.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return uniqueDiscounts;
}

/**
 * Получить скидки на весь заказ для клиента
 * @param {Object} db - подключение к БД
 * @param {number} tenantId
 * @param {number} storeId
 * @param {number} customerId
 * @param {number} orderTotal - сумма заказа (для проверки min_order_amount)
 * @returns {Promise<Object[]>} массив активных скидок на заказ
 */
async function getOrderDiscounts(db, tenantId, storeId, customerId, orderTotal) {
  const customerDiscounts = await getActiveDiscountsForCustomer(db, tenantId, storeId, customerId);
  
  // Фильтруем только скидки на весь заказ
  const orderDiscounts = customerDiscounts.filter(d => d.apply_to === 'order');
  
  // Проверяем минимальную сумму заказа
  return orderDiscounts.filter(d => {
    if (d.min_order_amount && orderTotal < d.min_order_amount) {
      return false;
    }
    return true;
  });
}

/**
 * Записать использование скидки
 * @param {Object} db - подключение к БД
 * @param {number} tenantId
 * @param {number} discountId
 * @param {number} orderId
 * @param {number} customerId
 * @param {number} discountAmount - сумма скидки
 */
async function recordDiscountUsage(db, tenantId, discountId, orderId, customerId, discountAmount) {
  // Добавляем запись в mkt_discount_usage
  await db.query(
    `INSERT INTO mkt_discount_usage (tenant_id, discount_id, order_id, customer_id, discount_amount)
     VALUES (?, ?, ?, ?, ?)`,
    [tenantId, discountId, orderId, customerId || null, discountAmount]
  );

  // Увеличиваем счетчик использований
  await db.query(
    `UPDATE mkt_discounts SET usage_count = usage_count + 1 WHERE id = ? AND tenant_id = ?`,
    [discountId, tenantId]
  );
}

/**
 * Применить скидки к товару и вернуть лучшую (или сумму если stackable)
 * @param {Object[]} discounts - массив скидок
 * @param {number} price - цена товара
 * @returns {{totalDiscount: number, appliedDiscounts: Object[]}}
 */
function applyBestDiscounts(discounts, price) {
  if (!discounts || discounts.length === 0) {
    return { totalDiscount: 0, appliedDiscounts: [] };
  }

  let totalDiscount = 0;
  const appliedDiscounts = [];

  // Разделяем на stackable и non-stackable
  const stackable = discounts.filter(d => d.is_stackable);
  const nonStackable = discounts.filter(d => !d.is_stackable);

  // Находим лучшую non-stackable скидку
  let bestNonStackable = null;
  let bestNonStackableAmount = 0;
  for (const d of nonStackable) {
    const amount = calculateDiscount(price, d.discount_type, d.discount_value, d.max_discount_amount);
    if (amount > bestNonStackableAmount) {
      bestNonStackableAmount = amount;
      bestNonStackable = d;
    }
  }

  // Суммируем stackable скидки
  let stackableTotal = 0;
  const stackableApplied = [];
  for (const d of stackable) {
    const amount = calculateDiscount(price - stackableTotal, d.discount_type, d.discount_value, d.max_discount_amount);
    stackableTotal += amount;
    stackableApplied.push({ ...d, discountAmount: amount });
  }

  // Выбираем лучший вариант
  if (bestNonStackableAmount > stackableTotal) {
    totalDiscount = bestNonStackableAmount;
    appliedDiscounts.push({ ...bestNonStackable, discountAmount: bestNonStackableAmount });
  } else {
    totalDiscount = stackableTotal;
    appliedDiscounts.push(...stackableApplied);
  }

  // Ограничиваем скидку ценой
  if (totalDiscount > price) {
    totalDiscount = price;
  }

  return { totalDiscount, appliedDiscounts };
}

/**
 * Получить лучшую скидку для товара (для отображения в каталоге)
 * @param {Object[]} discounts - массив скидок
 * @returns {Object|null} лучшая скидка или null
 */
function getBestDiscount(discounts) {
  if (!discounts || discounts.length === 0) return null;
  
  // Возвращаем скидку с наивысшим приоритетом (уже отсортированы)
  return discounts[0];
}

module.exports = {
  isDiscountActive,
  calculateDiscount,
  getActiveDiscountsForProduct,
  getActiveDiscountsForCustomer,
  getOrderDiscounts,
  recordDiscountUsage,
  applyBestDiscounts,
  getBestDiscount,
};
