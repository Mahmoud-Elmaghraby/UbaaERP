/**
 * HR permission keys (migration 0123). One place for the API; the web keeps the same literals in
 * apps/web/src/lib/permissions.ts. Later HR steps add salaries, attendance, leaves, loans and payroll.
 */
export const HR_PERMISSIONS = {
  employeesView: 'hr.employees.view',
  employeesManage: 'hr.employees.manage',
  salariesView: 'hr.salaries.view',
  salariesManage: 'hr.salaries.manage',
} as const;
