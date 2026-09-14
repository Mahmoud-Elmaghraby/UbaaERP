import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokensDto } from '@erp-platform/contracts';

import { decodeAccessToken } from './jwt';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
}

interface AuthState {
  /**
   * Tenant schema name, entered on the login screen. Required by the
   * backend's header-based tenant resolution for the pre-auth /auth/*
   * routes (see apps/api's TenantSchema decorator), which have no JWT yet
   * to source a tenant from. Kept around after login as a harmless no-op
   * for every other route: Settings and Users & Permissions controllers
   * both resolve the tenant from the JWT (CurrentTenantSchema) now, not
   * from this header.
   */
  tenantSchema: string | null;
  accessToken: string | null;
  user: AuthUser | null;
  permissions: string[];
  /** Layer 1 (Plan ceiling) feature keys — see FeaturesProvider's own comment. */
  features: string[];
  /** Layer 2 (tenant self-service) feature keys turned off. */
  disabledFeatures: string[];
  setTenantSchema: (schema: string) => void;
  setSession: (tokens: AuthTokensDto) => void;
  clearSession: () => void;
}

/**
 * The refresh token is deliberately NOT stored here anymore (claude/
 * settings-module-audit.md §2.2/Task 9). It never reaches this state at
 * all now — the backend sets it directly as an httpOnly cookie
 * (AuthController), which client-side JavaScript cannot read, closing
 * the XSS-exposure gap the previous localStorage-based storage had. Only
 * the short-lived access token (15m default) is still kept here, in
 * memory and in this store's own persisted localStorage entry — a much
 * smaller exposure window than a 30-day refresh token, and one every
 * other JWT-based SPA auth flow accepts as a standard trade-off.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      tenantSchema: null,
      accessToken: null,
      user: null,
      permissions: [],
      features: [],
      disabledFeatures: [],
      setTenantSchema: (schema) => set({ tenantSchema: schema }),
      setSession: (tokens) => {
        const decoded = decodeAccessToken(tokens.accessToken);
        set({
          accessToken: tokens.accessToken,
          user: tokens.user,
          permissions: decoded?.permissions ?? [],
          features: decoded?.features ?? [],
          disabledFeatures: decoded?.disabledFeatures ?? [],
        });
      },
      clearSession: () =>
        set({ accessToken: null, user: null, permissions: [], features: [], disabledFeatures: [] }),
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        tenantSchema: state.tenantSchema,
        accessToken: state.accessToken,
        user: state.user,
        permissions: state.permissions,
        features: state.features,
        disabledFeatures: state.disabledFeatures,
      }),
    },
  ),
);
