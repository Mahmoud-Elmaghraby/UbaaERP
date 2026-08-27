/**
 * Decodes (does NOT verify) a JWT access token's payload, purely so the UI
 * can read the `permissions` array for hints (which menu items to show
 * via <Can>, etc.). Real enforcement always happens server-side
 * (PermissionsGuard) — a client that lies to itself about its own
 * permissions can only hide/show buttons, never bypass the API.
 */
export interface DecodedAccessToken {
  sub: string;
  schema: string;
  roleId: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export function decodeAccessToken(token: string): DecodedAccessToken | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as DecodedAccessToken;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(decoded: DecodedAccessToken | null): boolean {
  if (!decoded?.exp) return true;
  return Date.now() >= decoded.exp * 1000;
}
