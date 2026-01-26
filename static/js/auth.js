// ============================================
// Утилиты для работы с авторизацией
// ============================================

/**
 * Получить токен авторизации из localStorage
 */
function getAuthToken() {
  return localStorage.getItem('authToken');
}

/**
 * Получить данные пользователя из localStorage
 */
function getAuthUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * Получить данные магазина (tenant) из localStorage
 */
function getAuthTenant() {
  const tenantStr = localStorage.getItem('tenant');
  if (!tenantStr) return null;
  try {
    return JSON.parse(tenantStr);
  } catch {
    return null;
  }
}

function getActiveStoreId() {
  if (typeof window === 'undefined') return 1;
  const stored = localStorage.getItem('activeStoreId');
  const n = Number(stored);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Проверить, авторизован ли пользователь
 */
function isAuthenticated() {
  return !!getAuthToken();
}

/**
 * Выход из системы
 */
function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('tenant');
  window.location.href = '/login';
}

/**
 * Получить заголовки для API запросов с авторизацией
 */
function getAuthHeaders(additionalHeaders = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    'x-store-id': String(getActiveStoreId()),
    ...additionalHeaders
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Обёртка для fetch с автоматической авторизацией
 * При ошибке 401 перенаправляет на страницу логина
 */
async function authFetch(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  // Если не авторизован - перенаправляем на логин
  if (response.status === 401) {
    logout();
    throw new Error('UNAUTHORIZED');
  }

  return response;
}

/**
 * Проверить авторизацию при загрузке страницы
 * Если не авторизован и находимся на защищённой странице - перенаправляем
 */
function checkAuthOnPageLoad() {
  const protectedPaths = ['/dashboard/', '/api/admin/'];
  const currentPath = window.location.pathname;
  
  const isProtected = protectedPaths.some(path => currentPath.startsWith(path));
  
  if (isProtected && !isAuthenticated()) {
    window.location.href = '/login';
  }
}

// Автоматическая проверка при загрузке
if (typeof window !== 'undefined') {
  checkAuthOnPageLoad();
}
