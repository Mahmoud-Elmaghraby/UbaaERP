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
  refreshToken: string | null;
  user: AuthUser | null;
  permissions: string[];
  setTenantSchema: (schema: string) => void;
  setSession: (tokens: AuthTokensDto) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      tenantSchema: null,
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: [],
      setTenantSchema: (schema) => set({ tenantSchema: schema }),
      setSession: (tokens) => {
        const decoded = decodeAccessToken(tokens.accessToken);
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: tokens.user,
          permissions: decoded?.permissions ?? [],
        });
      },
      clearSession: () =>
        set({ accessToken: null, refreshToken: null, user: null, permissions: [] }),
    }),
    {
      name: 'erp-auth',
      partialize: (state) => ({
        tenantSchema: state.tenantSchema,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        permissions: state.permissions,
      }),
    },
  ),
);
