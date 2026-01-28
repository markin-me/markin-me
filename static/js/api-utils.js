/**
 * API Utilities
 * Централизованные функции для работы с API
 */

/**
 * Получить заголовки для API запросов
 * Автоматически добавляет токен авторизации и ID выбранной Филиалы
 */
function getApiHeaders() {
  const token = localStorage.getItem('authToken');
  const storeId = localStorage.getItem('activeStoreId') || '1';

  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  headers['x-store-id'] = storeId;

  return headers;
}

/**
 * Обертка для fetch с автоматической установкой заголовков
 * @param {string} url - URL для запроса
 * @param {object} options - опции fetch (method, body, и т.д.)
 * @returns {Promise<Response>}
 */
async function apiFetch(url, options = {}) {
  const headers = {
    ...getApiHeaders(),
    ...(options.headers || {})
  };

  return fetch(url, { ...options, headers });
}
