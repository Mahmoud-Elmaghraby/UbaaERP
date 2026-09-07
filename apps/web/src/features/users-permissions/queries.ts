import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditLogDto,
  ChangePasswordDto,
  ConfirmTotpDto,
  CreateRoleDto,
  CreateUserDto,
  DisableTotpDto,
  PermissionDto,
  RoleDto,
  SetBranchAccessDto,
  SetManagerDto,
  TotpEnabledResponseDto,
  TotpSetupResponseDto,
  TotpStatusResponseDto,
  UpdateRoleDto,
  UserDto,
} from '@erp-platform/contracts';

import { apiGet, apiPatch, apiPost } from '../../lib/api-client';

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiGet<UserDto[]>('/users') });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserDto) => apiPost<UserDto>('/users', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** Sends an invite so the user can set their own password — see
 * AccountAccessService.sendInvite()'s comment for why this exists
 * alongside (not instead of) the password field on create. */
export function useSendUserInvite() {
  return useMutation({
    mutationFn: (userId: string) => apiPost<void>(`/users/${userId}/invite`),
  });
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: () => apiGet<RoleDto[]>('/roles') });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => apiGet<PermissionDto[]>('/permissions'),
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleDto) => apiPost<RoleDto>('/roles', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleDto }) =>
      apiPatch<RoleDto>(`/roles/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

export function useAuditLogs(filters: AuditLogFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();

  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiGet<AuditLogDto[]>(`/audit-logs${query ? `?${query}` : ''}`),
  });
}

// --- Branch access -----------------------------------------------------------

export function useUserBranchAccess(userId: string) {
  return useQuery({
    queryKey: ['user-branch-access', userId],
    queryFn: () => apiGet<{ branchIds: string[] }>(`/users/${userId}/branch-access`),
    enabled: !!userId,
  });
}

export function useSetUserBranchAccess(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetBranchAccessDto) =>
      apiPatch<{ branchIds: string[] }>(`/users/${userId}/branch-access`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['user-branch-access', userId] }),
  });
}

// --- Manager / approval chain -------------------------------------------------

export function useUserManager(userId: string) {
  return useQuery({
    queryKey: ['user-manager', userId],
    queryFn: () => apiGet<{ managerId: string | null }>(`/users/${userId}/manager`),
    enabled: !!userId,
  });
}

export function useSetUserManager(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetManagerDto) =>
      apiPatch<{ managerId: string | null }>(`/users/${userId}/manager`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-manager', userId] }),
  });
}

// --- Own password change ------------------------------------------------------

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordDto) => apiPost<void>('/users/me/change-password', input),
  });
}

// --- Optional TOTP two-factor authentication ---------------------------------
// Self-service only, no admin-managed equivalent — see UsersController's
// own comment on why. Setup is two calls on purpose: `useSetupTwoFactor`
// only generates+stores a pending secret; `useConfirmTwoFactor` is what
// actually enables it, after the user proves they scanned/entered it
// correctly (see TwoFactorService's class comment).

export function useTwoFactorStatus() {
  return useQuery({
    queryKey: ['two-factor-status'],
    queryFn: () => apiGet<TotpStatusResponseDto>('/users/me/2fa/status'),
  });
}

export function useSetupTwoFactor() {
  return useMutation({
    mutationFn: () => apiPost<TotpSetupResponseDto>('/users/me/2fa/setup'),
  });
}

export function useConfirmTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmTotpDto) => apiPost<TotpEnabledResponseDto>('/users/me/2fa/confirm', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['two-factor-status'] }),
  });
}

export function useDisableTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DisableTotpDto) => apiPost<void>('/users/me/2fa/disable', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['two-factor-status'] }),
  });
}

// --- Session management ("log out everywhere" / admin force-logout) ---------

/**
 * Revokes every refresh token the caller currently has issued —
 * including the one this device is using. There is deliberately no
 * "except this device" exclusion (the backend endpoint takes no body to
 * identify "this" token) — see UsersController.revokeOwnSessions()'s
 * comment. Callers must clear local session state immediately after a
 * successful call, since the current session's ability to silently
 * refresh is gone too, even though its still-valid access token keeps
 * working until it naturally expires.
 */
export function useRevokeOwnSessions() {
  return useMutation({
    mutationFn: () => apiPost<void>('/users/me/revoke-sessions'),
  });
}

/** Admin action: force-logout a DIFFERENT user without deactivating them. */
export function useRevokeUserSessions() {
  return useMutation({
    mutationFn: (userId: string) => apiPost<void>(`/users/${userId}/revoke-sessions`),
  });
}

// --- Logout --------------------------------------------------------------

/**
 * Calls the real /auth/logout endpoint to revoke this device's refresh
 * token server-side before clearing local session state. Takes no
 * argument: the refresh token now travels only as an httpOnly cookie
 * (see auth-store.ts and api-client.ts's own comments) that the browser
 * attaches automatically (credentials: 'include', set globally in
 * apiFetch) — this call no longer has (or needs) access to the token
 * value at all. skipAuth mirrors /auth/refresh — this endpoint doesn't
 * require (or use) the Authorization header.
 */
export function useLogout() {
  return useMutation({
    mutationFn: () => apiPost<void>('/auth/logout', undefined, { skipAuth: true }),
  });
}
