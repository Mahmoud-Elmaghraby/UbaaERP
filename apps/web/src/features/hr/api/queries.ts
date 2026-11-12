import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeEmployeeStatusDto,
  EmployeeDto,
  EmployeeListQueryDto,
  EmployeeSummaryDto,
  HrDepartmentDto,
  AttendanceDayDto,
  CarryOverLeaveDto,
  CreatePayrollRunDto,
  PayPayrollDto,
  PayrollRunDto,
  PayrollRunQueryDto,
  PayrollRunSummaryDto,
  UpdatePayrollLineDto,
  CreateLoanDto,
  CreatePayAdjustmentsDto,
  DisburseLoanDto,
  LoanDto,
  LoanQueryDto,
  LoanSummaryDto,
  PayAdjustmentDto,
  PayAdjustmentQueryDto,
  RepayLoanDto,
  CreateLeaveRequestDto,
  DecideLeaveRequestDto,
  LeaveBalanceDto,
  LeaveBalanceQueryDto,
  LeavePreviewDto,
  LeaveRequestDto,
  LeaveRequestQueryDto,
  LeaveTypeDto,
  SaveLeaveBalanceDto,
  SaveLeaveTypeDto,
  AttendanceImportDto,
  AttendanceImportResultDto,
  AttendanceQueryDto,
  AttendanceSummaryRowDto,
  EmployeeSalaryHistoryDto,
  HrHolidayDto,
  HrShiftDto,
  RebuildAttendanceDto,
  RebuildAttendanceResultDto,
  SaveHrHolidaysDto,
  SaveHrShiftDto,
  UpdateAttendanceDayDto,
  HrJobTitleDto,
  SalaryComponentDto,
  SalaryRegisterDto,
  SalaryRegisterQueryDto,
  SaveEmployeeDto,
  SaveEmployeeSalaryDto,
  SaveSalaryComponentDto,
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

// ── salaries (hr.salaries.*) ──────────────────────────────────────────────

export function useSalaryComponents(enabled = true) {
  return useQuery({
    queryKey: ['hr', 'salary-components'],
    queryFn: () => apiGet<SalaryComponentDto[]>('/hr/salary-components'),
    staleTime: 60_000,
    enabled,
  });
}

export function useSaveSalaryComponent() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveSalaryComponentDto }) =>
      id ? apiPut<SalaryComponentDto>(`/hr/salary-components/${id}`, input) : apiPost<SalaryComponentDto>('/hr/salary-components', input),
    onSuccess: invalidate,
  });
}

export function useDeleteSalaryComponent() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/salary-components/${id}`), onSuccess: invalidate });
}

export function useEmployeeSalaries(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: ['hr', 'employee-salaries', employeeId],
    queryFn: () => apiGet<EmployeeSalaryHistoryDto>(`/hr/employees/${employeeId}/salaries`),
    enabled,
  });
}

export function useSaveEmployeeSalary(employeeId: string) {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveEmployeeSalaryDto }) =>
      id
        ? apiPut<EmployeeSalaryHistoryDto>(`/hr/employees/${employeeId}/salaries/${id}`, input)
        : apiPost<EmployeeSalaryHistoryDto>(`/hr/employees/${employeeId}/salaries`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEmployeeSalary(employeeId: string) {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: (id: string) => apiDelete<EmployeeSalaryHistoryDto>(`/hr/employees/${employeeId}/salaries/${id}`),
    onSuccess: invalidate,
  });
}

export function useSalaryRegister(query: SalaryRegisterQueryDto) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return useQuery({
    queryKey: ['hr', 'salary-register', query],
    queryFn: () => apiGet<SalaryRegisterDto>(`/hr/salaries/register?${params.toString()}`),
  });
}

// ── attendance (hr.attendance.*) ──────────────────────────────────────────

function toParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, String(value));
  return params.toString();
}

export function useShifts(enabled = true) {
  return useQuery({ queryKey: ['hr', 'shifts'], queryFn: () => apiGet<HrShiftDto[]>('/hr/shifts'), staleTime: 60_000, enabled });
}

export function useSaveShift() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveHrShiftDto }) =>
      id ? apiPut<HrShiftDto>(`/hr/shifts/${id}`, input) : apiPost<HrShiftDto>('/hr/shifts', input),
    onSuccess: invalidate,
  });
}

export function useDeleteShift() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/shifts/${id}`), onSuccess: invalidate });
}

export function useHolidays(year: number) {
  return useQuery({ queryKey: ['hr', 'holidays', year], queryFn: () => apiGet<HrHolidayDto[]>(`/hr/holidays?year=${year}`) });
}

export function useAddHolidays() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: SaveHrHolidaysDto) => apiPost<HrHolidayDto[]>('/hr/holidays', input), onSuccess: invalidate });
}

export function useDeleteHoliday() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/holidays/${id}`), onSuccess: invalidate });
}

export function useAttendance(query: AttendanceQueryDto) {
  return useQuery({ queryKey: ['hr', 'attendance', 'days', query], queryFn: () => apiGet<AttendanceDayDto[]>(`/hr/attendance?${toParams(query)}`) });
}

export function useAttendanceSummary(query: AttendanceQueryDto, enabled = true) {
  return useQuery({
    queryKey: ['hr', 'attendance', 'summary', query],
    queryFn: () => apiGet<AttendanceSummaryRowDto[]>(`/hr/attendance/summary?${toParams(query)}`),
    enabled,
  });
}

export function useImportAttendance() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: AttendanceImportDto) => apiPost<AttendanceImportResultDto>('/hr/attendance/import', input), onSuccess: invalidate });
}

export function useRebuildAttendance() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: RebuildAttendanceDto) => apiPost<RebuildAttendanceResultDto>('/hr/attendance/rebuild', input), onSuccess: invalidate });
}

export function useUpdateAttendanceDay() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAttendanceDayDto }) => apiPut<AttendanceDayDto>(`/hr/attendance/days/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useResetAttendanceDay() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiPost<AttendanceDayDto>(`/hr/attendance/days/${id}/reset`), onSuccess: invalidate });
}

// ── leaves (hr.leaves.*) ──────────────────────────────────────────────────

export function useLeaveTypes() {
  return useQuery({ queryKey: ['hr', 'leave-types'], queryFn: () => apiGet<LeaveTypeDto[]>('/hr/leave-types'), staleTime: 60_000 });
}

export function useSaveLeaveType() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SaveLeaveTypeDto }) =>
      id ? apiPut<LeaveTypeDto>(`/hr/leave-types/${id}`, input) : apiPost<LeaveTypeDto>('/hr/leave-types', input),
    onSuccess: invalidate,
  });
}

export function useDeleteLeaveType() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/leave-types/${id}`), onSuccess: invalidate });
}

export function useLeaveRequests(query: LeaveRequestQueryDto) {
  return useQuery({ queryKey: ['hr', 'leave-requests', query], queryFn: () => apiGet<LeaveRequestDto[]>(`/hr/leave-requests?${toParams(query)}`) });
}

/** Live "how many days / what's left" while the request form is filled in. */
export function useLeavePreview(input: CreateLeaveRequestDto | null) {
  return useQuery({
    queryKey: ['hr', 'leave-preview', input],
    queryFn: () => apiPost<LeavePreviewDto>('/hr/leave-requests/preview', input),
    enabled: input !== null,
    retry: false,
  });
}

export function useCreateLeaveRequest() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: CreateLeaveRequestDto) => apiPost<LeaveRequestDto>('/hr/leave-requests', input), onSuccess: invalidate });
}

export function useDecideLeaveRequest() {
  const invalidate = useInvalidateHr();
  return useMutation({
    mutationFn: ({ id, action, input }: { id: string; action: 'approve' | 'reject' | 'cancel'; input: DecideLeaveRequestDto }) =>
      apiPost<LeaveRequestDto>(`/hr/leave-requests/${id}/${action}`, input),
    onSuccess: invalidate,
  });
}

export function useLeaveBalances(query: LeaveBalanceQueryDto) {
  return useQuery({ queryKey: ['hr', 'leave-balances', query], queryFn: () => apiGet<LeaveBalanceDto[]>(`/hr/leave-balances?${toParams(query)}`) });
}

export function useSaveLeaveBalance() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: SaveLeaveBalanceDto) => apiPut<LeaveBalanceDto>('/hr/leave-balances', input), onSuccess: invalidate });
}

export function useCarryOverLeave() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: CarryOverLeaveDto) => apiPost<{ updated: number }>('/hr/leave-balances/carry-over', input), onSuccess: invalidate });
}

// ── loans (hr.loans.*) and bonuses / penalties ────────────────────────────

export function useLoans(query: LoanQueryDto) {
  return useQuery({ queryKey: ['hr', 'loans', query], queryFn: () => apiGet<LoanSummaryDto[]>(`/hr/loans?${toParams(query)}`) });
}

export function useLoan(id: string | null) {
  return useQuery({ queryKey: ['hr', 'loans', 'detail', id], queryFn: () => apiGet<LoanDto>(`/hr/loans/${id}`), enabled: Boolean(id) });
}

/** Loan money moves treasuries too. */
function useInvalidateHrAndTreasury() {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: ['hr'] }), queryClient.invalidateQueries({ queryKey: ['treasury'] })]);
}

export function useCreateLoan() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: CreateLoanDto) => apiPost<LoanDto>('/hr/loans', input), onSuccess: invalidate });
}

export type LoanAction =
  | { action: 'approve' | 'reject' | 'cancel'; input: { note?: string | null } }
  | { action: 'disburse'; input: DisburseLoanDto }
  | { action: 'repay'; input: RepayLoanDto }
  | { action: 'postpone'; input: { month: string } };

export function useLoanAction() {
  const invalidate = useInvalidateHrAndTreasury();
  return useMutation({
    mutationFn: ({ id, ...rest }: { id: string } & LoanAction) => apiPost<LoanDto>(`/hr/loans/${id}/${rest.action}`, rest.input),
    onSuccess: invalidate,
  });
}

export function usePayAdjustments(query: PayAdjustmentQueryDto) {
  return useQuery({ queryKey: ['hr', 'pay-adjustments', query], queryFn: () => apiGet<PayAdjustmentDto[]>(`/hr/pay-adjustments?${toParams(query)}`) });
}

export function useCreatePayAdjustments() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: CreatePayAdjustmentsDto) => apiPost<{ created: number }>('/hr/pay-adjustments', input), onSuccess: invalidate });
}

export function useDeletePayAdjustment() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/pay-adjustments/${id}`), onSuccess: invalidate });
}

// ── payroll (hr.payroll.*) ────────────────────────────────────────────────

export function usePayrollRuns(query: PayrollRunQueryDto) {
  return useQuery({ queryKey: ['hr', 'payroll', 'list', query], queryFn: () => apiGet<PayrollRunSummaryDto[]>(`/hr/payroll-runs?${toParams(query)}`) });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery({ queryKey: ['hr', 'payroll', 'detail', id], queryFn: () => apiGet<PayrollRunDto>(`/hr/payroll-runs/${id}`), enabled: Boolean(id) });
}

export function useCreatePayrollRun() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (input: CreatePayrollRunDto) => apiPost<PayrollRunDto>('/hr/payroll-runs', input), onSuccess: invalidate });
}

export type PayrollAction =
  | { action: 'recalculate' }
  | { action: 'post' }
  | { action: 'pay'; input: PayPayrollDto }
  | { action: 'updateLine'; lineId: string; input: UpdatePayrollLineDto }
  | { action: 'removeLine'; lineId: string };

export function usePayrollAction(runId: string) {
  const invalidate = useInvalidateHrAndTreasury();
  return useMutation({
    mutationFn: (a: PayrollAction) => {
      const base = `/hr/payroll-runs/${runId}`;
      switch (a.action) {
        case 'recalculate':
          return apiPost<PayrollRunDto>(`${base}/recalculate`);
        case 'post':
          return apiPost<PayrollRunDto>(`${base}/post`);
        case 'pay':
          return apiPost<PayrollRunDto>(`${base}/pay`, a.input);
        case 'updateLine':
          return apiPatch<PayrollRunDto>(`${base}/lines/${a.lineId}`, a.input);
        case 'removeLine':
          return apiDelete<PayrollRunDto>(`${base}/lines/${a.lineId}`);
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeletePayrollRun() {
  const invalidate = useInvalidateHr();
  return useMutation({ mutationFn: (id: string) => apiDelete<void>(`/hr/payroll-runs/${id}`), onSuccess: invalidate });
}
