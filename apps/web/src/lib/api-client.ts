import type { AuthTokensDto } from '@erp-platform/contracts';

import { useAuthStore } from './auth-store';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip attaching the Authorization header — used only by /auth/* calls. */
  skipAuth?: boolean;
  /** Internal: prevents infinite refresh loops. */
  _retried?: boolean;
}

function buildHeaders(skipAuth: boolean): HeadersInit {
  const { tenantSchema, accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Sent on every request: required by /auth/* (pre-auth), which has no
  // JWT yet to source a tenant from (see auth-store.ts). Every other
  // route — Settings and Users & Permissions alike — resolves the tenant
  // from the JWT (CurrentTenantSchema) now, so this header is a harmless
  // no-op there.
  if (tenantSchema) {
    headers['x-tenant-schema'] = tenantSchema;
  }

  if (!skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function refreshSession(): Promise<boolean> {
  const { setSession, clearSession } = useAuthStore.getState();

  // No body, no refreshToken to read from local state — the refresh
  // token itself now lives only in the httpOnly cookie the browser
  // attaches automatically (credentials: 'include' below), never in
  // JS-reachable storage. See auth-store.ts's own comment on why that
  // field was removed entirely.
  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: buildHeaders(true),
    credentials: 'include',
  });

  if (!response.ok) {
    clearSession();
    return false;
  }

  const tokens = (await parseBody(response)) as AuthTokensDto;
  setSession(tokens);
  return true;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false, _retried = false } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: buildHeaders(skipAuth),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Required so the browser sends/accepts the httpOnly refresh-token
      // cookie on every call to this (cross-origin, in dev) API — without
      // it, fetch() silently drops Set-Cookie on the response and never
      // attaches the cookie on the next request. Safe to set globally:
      // it's a no-op for endpoints that don't touch the cookie at all.
      credentials: 'include',
    });
  } catch {
    // fetch() itself throws for network failures AND for CORS blocks (the
    // browser refuses to hand back any response at all in that case) — a
    // real, previously-hit case: the API without CORS enabled looked
    // identical to "invalid credentials" to every caller, since this used
    // to be unhandled and every catch block below only special-cased
    // ApiError. Wrapping it here means every caller gets a real ApiError
    // with an honest message instead of guessing.
    throw new ApiError('تعذر الاتصال بالخادم — تحقق من تشغيل الـ API وإعدادات CORS', 0, null);
  }

  if (response.status === 401 && !skipAuth && !_retried) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _retried: true });
    }
  }

  if (!response.ok) {
    const errorBody = await parseBody(response);
    const message =
      (errorBody && typeof errorBody === 'object' && 'message' in errorBody
        ? String((errorBody as { message: unknown }).message)
        : null) ?? `طلب فشل بالحالة ${response.status}`;
    throw new ApiError(message, response.status, errorBody);
  }

  return (await parseBody(response)) as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiFetch<T>(path, { ...options, method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body });
export const apiPut = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PUT', body });
export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });

/**
 * multipart/form-data upload (used by the Attachments feature's
 * POST /attachments). Deliberately separate from apiFetch: that function
 * always JSON.stringifies its body and forces Content-Type: application/json,
 * neither of which works for FormData — the browser must set its own
 * Content-Type (with the multipart boundary) when a FormData body is sent, so
 * we don't set that header ourselves here at all. Mirrors apiFetch's own
 * network-failure wrapping and single-retry-after-refresh 401 handling.
 */
async function doUpload<T>(path: string, formData: FormData, retried: boolean): Promise<T> {
  const { tenantSchema, accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (tenantSchema) {
    headers['x-tenant-schema'] = tenantSchema;
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('تعذر الاتصال بالخادم — تحقق من تشغيل الـ API وإعدادات CORS', 0, null);
  }

  if (response.status === 401 && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return doUpload<T>(path, formData, true);
    }
  }

  if (!response.ok) {
    const errorBody = await parseBody(response);
    const message =
      (errorBody && typeof errorBody === 'object' && 'message' in errorBody
        ? String((errorBody as { message: unknown }).message)
        : null) ?? `طلب فشل بالحالة ${response.status}`;
    throw new ApiError(message, response.status, errorBody);
  }

  return (await parseBody(response)) as T;
}

export const apiUpload = <T>(path: string, formData: FormData) => doUpload<T>(path, formData, false);
