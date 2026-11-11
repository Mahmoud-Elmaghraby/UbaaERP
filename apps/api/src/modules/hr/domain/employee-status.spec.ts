import { BusinessRuleError } from '../../../shared/errors/domain-errors';
import { planStatusChange } from './employee-status';

describe('planStatusChange', () => {
  const hire = '2025-01-10';

  it('suspends and reactivates, clearing end-of-service data', () => {
    expect(planStatusChange('active', hire, { status: 'suspended' })).toEqual({
      status: 'suspended',
      termination_date: null,
      termination_reason: null,
    });
    expect(planStatusChange('terminated', hire, { status: 'active' })).toEqual({
      status: 'active',
      termination_date: null,
      termination_reason: null,
    });
  });

  it('ends service with a date and a trimmed reason', () => {
    expect(planStatusChange('active', hire, { status: 'terminated', terminationDate: '2026-06-30', terminationReason: '  استقالة ' })).toEqual({
      status: 'terminated',
      termination_date: '2026-06-30',
      termination_reason: 'استقالة',
    });
  });

  it('refuses an end date before hire, a missing date, and no change', () => {
    expect(() => planStatusChange('active', hire, { status: 'terminated', terminationDate: '2024-12-31' })).toThrow(BusinessRuleError);
    expect(() => planStatusChange('active', hire, { status: 'terminated' })).toThrow(BusinessRuleError);
    expect(() => planStatusChange('active', hire, { status: 'active' })).toThrow(/already active/);
  });
});
