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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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
  const { refreshToken, setSession, clearSession } = useAuthStore.getState();
  if (!refreshToken) return false;

  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify({ refreshToken }),
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
export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });
