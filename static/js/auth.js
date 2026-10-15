// ============================================
// Утилиты для работы с авторизацией
// ============================================

/**
 * Получить токен авторизации из localStorage
 */
function getAuthToken() {
  return localStorage.getItem('admin:logout-pending:v1') ? null : localStorage.getItem('authToken');
}
function captureAuthState() {
  const token = getAuthToken();
  const control = localStorage.getItem('admin:local-access:v1');
  const pending = localStorage.getItem('admin:logout-pending:v1');
  const access = window.AdminLocalRepository?.capture({ requireActive: false });
  return { isCurrent: () => token === getAuthToken() && control === localStorage.getItem('admin:local-access:v1')
    && pending === localStorage.getItem('admin:logout-pending:v1') && (!access || access.isCurrent()) };
}

let browserLogoutRequest = null;
async function finishBrowserLogout() {
  if (!localStorage.getItem('admin:logout-pending:v1')) return true;
  if (browserLogoutRequest) return browserLogoutRequest;
  const pending = localStorage.getItem('admin:logout-pending:v1');
  let token;
  try { token = JSON.parse(pending).token; } catch (_) { throw new Error('BROWSER_LOGOUT_STATE_INVALID'); }
  if (typeof token !== 'string' || !token) throw new Error('BROWSER_LOGOUT_STATE_INVALID');
  browserLogoutRequest = (async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store', keepalive: true,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'BROWSER_LOGOUT_FAILED');
    if (localStorage.getItem('admin:logout-pending:v1') === pending) {
      if (localStorage.getItem('authToken') === token) localStorage.removeItem('authToken');
      localStorage.removeItem('admin:logout-pending:v1');
    }
    if (result.revocation === 'legacy-expiry-only') console.warn('Legacy JWT remains valid until expiry; browser cookie cleared.');
    return !localStorage.getItem('admin:logout-pending:v1');
  })();
  try { return await browserLogoutRequest; } finally { browserLogoutRequest = null; }
}

// The single pending logout retains its old Bearer ONLY for server revocation, never application access.
// It is separate from a subsequently issued JWT; no session table or refresh-token protocol is introduced.
async function confirmServerAccessContext(context) {
  const token = getAuthToken();
  const repository = window.AdminLocalRepository;
  if (!token || !repository) return null;
  if (!/^[a-f0-9]{64}$/.test(context?.token_binding || '')) {
    repository.reset({ forget: true, broadcast: false, reason: 'server-refusal' });
    console.error('SERVER_CONTEXT_BINDING_REQUIRED');
    return null;
  }
  const ticket = repository.beginConfirmation();
  try {
    const confirmed = await repository.confirm({ ...context, metadata: { roles: context.roles, active_role: context.active_role,
      permissions: context.permissions, stores: context.stores } }, token, ticket);
    if (!confirmed || !repository.isActive() || token !== getAuthToken()) return null;
    if (Array.isArray(context.stores) && context.stores.length
      && !context.stores.some(store => String(store.id) === localStorage.getItem('activeStoreId'))) {
      localStorage.setItem('activeStoreId', String(context.stores[0].id));
    }
    if (context.user) localStorage.setItem('user', JSON.stringify(context.user));
    if (context.tenant) localStorage.setItem('tenant', JSON.stringify(context.tenant));
    window.AdminAccessContext = context;
    document.documentElement.setAttribute('data-local-access', 'active');
    sessionStorage.removeItem('admin:browser-session-attempt');
    return context;
  } catch (error) {
    if (error.message === 'LOCAL_SCOPE_CHANGED') return null;
    repository.reset({ forget: true, broadcast: false, reason: 'server-refusal' });
    if (error.message === 'LOCAL_SESSION_MISMATCH') {
      const next = new URL(window.location.pathname + (window.location.search || ''), 'https://local.invalid');
      for (const key of ['token', 'authToken', 'refresh_token']) next.searchParams.delete(key);
      window.location.replace('/login?connect-browser=1&next=' + encodeURIComponent(next.pathname + next.search));
    }
    console.error('SERVER_CONTEXT_CONFIRMATION_FAILED:', error.message);
    return null;
  }
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
  const token = localStorage.getItem('authToken');
  try {
    try {
      if (token && !localStorage.getItem('admin:logout-pending:v1')) {
        localStorage.setItem('admin:logout-pending:v1', JSON.stringify({ id: String(Date.now()) + ':' + Math.random().toString(36).slice(2), token }));
      }
    } finally {
      if (window.AdminLocalRepository) window.AdminLocalRepository.reset({ forget: true, reason: 'logout' });
    }
  } finally {
    if (window.AdminReferenceCache && typeof window.AdminReferenceCache.resetRuntime === 'function') {
      window.AdminReferenceCache.resetRuntime();
    }
    if (window.AdminPersistentCache && typeof window.AdminPersistentCache.resetRuntimeScope === 'function') {
      window.AdminPersistentCache.resetRuntimeScope();
    }
    finishBrowserLogout().catch(error => console.error('BROWSER_LOGOUT_PENDING:', error.message));
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    window.location.href = '/login';
  }
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
  if (String(url).startsWith('/api/admin/') && (!options.method || String(options.method).toUpperCase() === 'GET')
    && window.AdminLocalRepository && !await window.AdminLocalRepository.ready()) throw new Error('LOCAL_CONTEXT_UNAVAILABLE');
  const requestToken = getAuthToken();
  const requestAccess = window.AdminLocalRepository?.capture({ requireActive: false });
  const contextualHeaders = {};
  if (typeof document !== 'undefined' && document.body?.dataset?.adminActivePage === 'settings'
      && String(url || '').startsWith('/api/admin/')) {
    const section = String(document.body.getAttribute('data-settings-section') || 'tenant');
    const sectionNodes = {
      tenant: 'settings.company', stores: 'settings.stores', delivery: 'settings.delivery',
      site: 'settings.site', chats: 'settings.chat', api: 'settings.api', payments: 'settings.payments',
      'print-templates': 'settings.print_templates', 'production-zones': 'settings.production_zones',
      system: 'settings.system',
    };
    contextualHeaders['x-rbac-node'] = sectionNodes[section] || 'settings.company';
  }
  const headers = getAuthHeaders({ ...contextualHeaders, ...(options.headers || {}) });
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  if (requestToken !== getAuthToken() || (requestAccess && !requestAccess.isCurrent())) {
    throw new Error('LOCAL_SCOPE_CHANGED');
  }

  // Если не авторизован - перенаправляем на логин
  if (response.status === 401) {
    logout();
    throw new Error('UNAUTHORIZED');
  }
  if (response.status === 403) {
    const payload = await response.clone().json().catch(() => null);
    if (requestAccess && !requestAccess.isCurrent()) throw new Error('LOCAL_SCOPE_CHANGED');
    if (payload && ['USER_BLOCKED', 'USER_ARCHIVED', 'TENANT_BLOCKED', 'ACTIVE_ROLE_INVALID', 'ROLE_NOT_ASSIGNED'].includes(payload.error)) {
      logout();
      throw new Error(payload.error);
    }
    if (String(url).split('?')[0] === '/api/auth/me' && window.AdminLocalRepository) {
      window.AdminLocalRepository.reset({ forget: true, reason: 'server-refusal' });
    }
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
  window.addEventListener('online', () => { finishBrowserLogout().catch(error => console.error('BROWSER_LOGOUT_PENDING:', error.message)); });
  if (localStorage.getItem('admin:logout-pending:v1')) finishBrowserLogout().catch(error => console.error('BROWSER_LOGOUT_PENDING:', error.message));
  checkAuthOnPageLoad();
}
