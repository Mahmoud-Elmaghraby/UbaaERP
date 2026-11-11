import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeEmployeeStatusDto,
  EmployeeDto,
  EmployeeListQueryDto,
  EmployeeSummaryDto,
  HrDepartmentDto,
  HrJobTitleDto,
  SaveEmployeeDto,
  SaveHrDepartmentDto,
  SaveHrJobTitleDto,
} from '@erp-platform/contracts';

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../../lib/api-client';

const KEYS = {
  employees: ['hr', 'employees'] as const,
  departments: ['hr', 'departments'] as const,
  jobTitles: ['hr', 'job-titles'] as const,
};

export function useEmployees(query: EmployeeListQueryDto = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return useQuery({
    queryKey: [...KEYS.employees, 'list', query],
    queryFn: () => apiGet<EmployeeSummaryDto[]>(`/hr/employees?${params.toString()}`),
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: [...KEYS.employees, 'detail', id],
    queryFn: () => apiGet<EmployeeDto>(`/hr/employees/${id}`),
    enabled: Boolean(id),
  });
}

/** Every write touches names shown on the org-structure pages too (manager, head counts). */
function useInvalidateHr() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['hr'] });
}

export function useSaveEmployee() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveEmployeeDto }) =>
      id ? apiPut<EmployeeDto>(`/hr/employees/${id}`, input) : apiPost<EmployeeDto>('/hr/employees', input),
    onSuccess: invalidate,
  });
}

export function useChangeEmployeeStatus() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChangeEmployeeStatusDto }) =>
      apiPatch<EmployeeDto>(`/hr/employees/${id}/status`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEmployee() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/employees/${id}`), onSuccess: invalidate });
}

export function useDepartments() {
  return useQuery({ queryKey: KEYS.departments, queryFn: () => apiGet<HrDepartmentDto[]>('/hr/departments'), staleTime: 60_000 });
}

export function useSaveDepartment() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveHrDepartmentDto }) =>
      id ? apiPut<HrDepartmentDto>(`/hr/departments/${id}`, input) : apiPost<HrDepartmentDto>('/hr/departments', input),
    onSuccess: invalidate,
  });
}

export function useDeleteDepartment() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/departments/${id}`), onSuccess: invalidate });
}

export function useJobTitles() {
  return useQuery({ queryKey: KEYS.jobTitles, queryFn: () => apiGet<HrJobTitleDto[]>('/hr/job-titles'), staleTime: 60_000 });
}

export function useSaveJobTitle() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveHrJobTitleDto }) =>
      id ? apiPut<HrJobTitleDto>(`/hr/job-titles/${id}`, input) : apiPost<HrJobTitleDto>('/hr/job-titles', input),
    onSuccess: invalidate,
  });
}

export function useDeleteJobTitle() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/job-titles/${id}`), onSuccess: invalidate });
}
