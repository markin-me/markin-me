import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiConfig } from './config';

export { apiConfig } from './config';

export type AdminSession = {
  tenant?: Record<string, unknown>;
  token: string;
  user?: Record<string, unknown>;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

const SESSION_KEY = `mobile_admin_session_v1_t${apiConfig.tenantId}_s${apiConfig.storeId}`;

function buildUrl(path: string) {
  const base = apiConfig.baseUrl.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

async function requestData<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers || undefined);
  headers.set('x-tenant-id', String(apiConfig.tenantId));
  headers.set('x-store-id', String(apiConfig.storeId));
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body !== 'undefined' && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(buildUrl(path), { ...init, headers });
  const text = await response.text();
  const json = text ? JSON.parse(text) as ApiEnvelope<T> : {};
  if (!response.ok || json.ok === false) throw new Error(String(json.error || `HTTP_${response.status}`));
  return (Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json) as T;
}

export async function loginAdmin(email: string, password: string) {
  const data = await requestData<AdminSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await saveAdminSession(data);
  return data;
}

export async function readAdminSession() {
  const raw = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AdminSession;
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveAdminSession(session: AdminSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearAdminSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function adminApi<T>(token: string, path: string, init?: RequestInit) {
  return requestData<T>(path, init || {}, token);
}

export function resolveAssetUrl(url?: string | null) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || /^data:image\//i.test(raw) || /^file:\/\//i.test(raw)) return raw;
  return `${apiConfig.baseUrl.replace(/\/+$/, '')}${raw.startsWith('/') ? raw : `/${raw}`}`;
}
