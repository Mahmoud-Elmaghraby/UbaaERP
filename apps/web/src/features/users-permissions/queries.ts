import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditLogDto,
  ChangePasswordDto,
  CreateRoleDto,
  CreateUserDto,
  PermissionDto,
  RoleDto,
  SetBranchAccessDto,
  SetManagerDto,
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

