import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PaperSizeDto, PayrollLineDto, PayrollRunDto, PrintLineDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { PrintRegistry } from '../../../shared/printing/print-registry';
import type { PrintDocumentBody, PrintProvider } from '../../../shared/printing/print-provider';
import { amountTotalsDto } from '../../../shared/printing/print-helpers';
import { entityNotFound } from '../../../shared/errors/entity-errors';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { HR_PERMISSIONS as HR } from '../../../shared/auth/hr-permissions';
import { PayrollService } from '../application/payroll.service';

const STATUS: Record<string, string> = { draft: 'مسودة', posted: 'معتمد', paid: 'اتصرف' };
const PAYROLL_PERMISSIONS = [HR.payrollView, HR.payrollManage, HR.payrollApprove, HR.payrollPay];

function money(minor: string, currency: string) {
  return { amountMinorUnits: minor, currency };
}

/** The payslip lines: what the month pays, then what it takes off. Zero lines are left out. */
export function payslipLines(line: PayrollLineDto, currency: string): PrintLineDto[] {
  const d = line.details as { components?: { name: string; kind: string; percent: number | null; valueMinorUnits: string }[] };
  const components = d.components ?? [];
  const earning = (description: string, minor: string, details?: string): PrintLineDto | null =>
    minor === '0' ? null : { description, details: details ?? 'استحقاق', amount: money(minor, currency) };
  const deduction = (description: string, minor: string): PrintLineDto | null =>
    minor === '0' ? null : { description, details: 'استقطاع', amount: money(`-${minor}`, currency) };
  const adjust = BigInt(line.manualAdjustmentMinorUnits);
  return [
    earning('الأساسي', line.basicMinorUnits),
    ...components.filter((c) => c.kind === 'earning').map((c) => earning(c.percent !== null ? `${c.name} (${c.percent}%)` : c.name, c.valueMinorUnits)),
    earning('وقت إضافي', line.overtimeMinorUnits),
    earning('مكافآت', line.bonusesMinorUnits),
    adjust > 0n ? earning('تعديل', adjust.toString(), line.manualAdjustmentNote ?? 'استحقاق') : null,
    ...components.filter((c) => c.kind === 'deduction').map((c) => deduction(c.name, c.valueMinorUnits)),
    deduction('غياب', line.absenceMinorUnits),
    deduction('تأخير وانصراف بدري', line.lateMinorUnits),
    deduction('إجازة بدون أجر', line.unpaidLeaveMinorUnits),
    deduction('جزاءات', line.penaltiesMinorUnits),
    deduction('قسط سلفة', line.loanMinorUnits),
    adjust < 0n ? deduction(line.manualAdjustmentNote ? `تعديل — ${line.manualAdjustmentNote}` : 'تعديل', (-adjust).toString()) : null,
  ].filter((x): x is PrintLineDto => x !== null);
}

/** قسيمة مرتب — one employee's month (id = the payroll line). */
class PayslipPrintProvider implements PrintProvider {
  readonly documentType = 'payslip';
  readonly label = 'قسيمة المرتب';
  readonly paperSizes: PaperSizeDto[] = ['a4'];
  readonly permissions = PAYROLL_PERMISSIONS;
  readonly feature = FEATURE_KEYS.HR;

  constructor(private readonly payroll: PayrollService) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const ref = await db.selectFrom('hr_payroll_lines').select('run_id').where('id', '=', id).executeTakeFirst();
    if (!ref) throw entityNotFound('HR_PAYROLL_LINE', id);
    const run = await this.payroll.get(db, ref.run_id);
    const line = run.lines.find((l) => l.id === id)!;
    const d = line.details as { absentDays?: number; lateMinutes?: number; overtimeMinutes?: number; employedDays?: number; monthDays?: number };
    const fields = [
      { label: 'الشهر', value: run.month },
      { label: 'الإدارة', value: line.departmentName ?? '—' },
      { label: 'أيام الغياب', value: String(d.absentDays ?? 0) },
      { label: 'دقائق التأخير', value: String(d.lateMinutes ?? 0) },
      { label: 'دقائق الإضافي', value: String(d.overtimeMinutes ?? 0) },
    ];
    if (d.employedDays !== undefined && d.employedDays !== d.monthDays) fields.push({ label: 'أيام العمل', value: `${d.employedDays} من ${d.monthDays}` });
    if (line.paymentMethod !== 'cash') fields.push({ label: 'يُحوَّل إلى', value: [line.bankName, line.bankAccount].filter(Boolean).join(' — ') });
    return {
      id,
      title: 'قسيمة مرتب',
      number: `${run.number}/${line.employeeCode}`,
      status: run.status,
      statusLabel: STATUS[run.status] ?? null,
      date: line.paidOn ?? `${run.month}-01`,
      currency: run.currency,
      party: { roleLabel: 'الموظف', name: line.employeeName, code: line.employeeCode },
      fields,
      lines: payslipLines(line, run.currency),
      totals: amountTotalsDto(Money.fromMinorUnits(BigInt(line.netMinorUnits), run.currency)),
      notes: null,
    };
  }
}

/** كشف المسير — every employee's gross, deductions and net (id = the run). */
class PayrollRegisterPrintProvider implements PrintProvider {
  readonly documentType = 'payroll_run';
  readonly label = 'كشف مسير الرواتب';
  readonly paperSizes: PaperSizeDto[] = ['a4'];
  readonly permissions = PAYROLL_PERMISSIONS;
  readonly feature = FEATURE_KEYS.HR;

  constructor(private readonly payroll: PayrollService) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const run: PayrollRunDto = await this.payroll.get(db, id);
    const fmt = (minor: string) => Money.fromMinorUnits(BigInt(minor), run.currency).toDecimalString();
    return {
      id,
      title: 'كشف مسير الرواتب',
      number: run.number,
      status: run.status,
      statusLabel: STATUS[run.status] ?? null,
      date: `${run.month}-01`,
      currency: run.currency,
      party: null,
      fields: [
        { label: 'الشهر', value: run.month },
        { label: 'النطاق', value: run.departmentName ?? run.branchName ?? 'كل الموظفين' },
        { label: 'عدد الموظفين', value: String(run.employeeCount) },
        { label: 'الإجمالي', value: fmt(run.totals.gross ?? '0') },
        { label: 'أقساط السلف', value: fmt(run.totals.loan ?? '0') },
      ],
      lines: run.lines.map((l) => {
        const deductions = (BigInt(l.grossMinorUnits) - BigInt(l.netMinorUnits) - BigInt(l.loanMinorUnits)).toString();
        return {
          description: l.employeeName,
          sku: l.employeeCode,
          details: `إجمالي ${fmt(l.grossMinorUnits)} — خصومات ${fmt(deductions)} — سلف ${fmt(l.loanMinorUnits)}`,
          amount: money(l.netMinorUnits, run.currency),
        };
      }),
      totals: amountTotalsDto(Money.fromMinorUnits(BigInt(run.totals.net ?? '0'), run.currency)),
      notes: run.notes,
    };
  }
}

@Injectable()
export class HrPrintRegistration implements OnModuleInit {
  constructor(
    private readonly registry: PrintRegistry,
    private readonly payroll: PayrollService,
  ) {}

  onModuleInit(): void {
    this.registry.register(new PayslipPrintProvider(this.payroll), new PayrollRegisterPrintProvider(this.payroll));
  }
}
