import { BusinessRuleError } from '../../../shared/errors/domain-errors';

export type EmployeeStatus = 'active' | 'suspended' | 'terminated';

export interface EmployeeStatusChange {
  status: EmployeeStatus;
  terminationDate?: string | null;
  terminationReason?: string | null;
}

export interface EmployeeStatusColumns {
  status: EmployeeStatus;
  termination_date: string | null;
  termination_reason: string | null;
}

/**
 * Moving an employee between active / suspended / terminated (end of service).
 *  - Ending service needs a date on or after the hire date; the reason is kept.
 *  - Leaving 'terminated' (re-hiring) clears the end-of-service date and reason.
 *  - Asking for the status the employee already has is refused (nothing to record).
 */
export function planStatusChange(current: EmployeeStatus, hireDate: string, change: EmployeeStatusChange): EmployeeStatusColumns {
  if (change.status === current) {
    throw new BusinessRuleError(`The employee is already ${current}.`, { code: 'EMPLOYEE.STATUS_UNCHANGED' });
  }
  if (change.status !== 'terminated') {
    return { status: change.status, termination_date: null, termination_reason: null };
  }
  const date = change.terminationDate;
  if (!date) {
    throw new BusinessRuleError('An end-of-service date is required.', { code: 'EMPLOYEE.TERMINATION_BEFORE_HIRE' });
  }
  if (date < hireDate) {
    throw new BusinessRuleError('The end-of-service date is before the hire date.', { code: 'EMPLOYEE.TERMINATION_BEFORE_HIRE' });
  }
  return { status: 'terminated', termination_date: date, termination_reason: change.terminationReason?.trim() || null };
}
