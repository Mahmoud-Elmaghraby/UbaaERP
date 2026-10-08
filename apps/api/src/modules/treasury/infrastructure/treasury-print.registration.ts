import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PaperSizeDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { PrintRegistry } from '../../../shared/printing/print-registry';
import type { PrintBuildOptions, PrintDocumentBody, PrintProvider } from '../../../shared/printing/print-provider';
import { amountTotalsDto, statusLabel } from '../../../shared/printing/print-helpers';
import { localIsoDate } from '../../../shared/time/local-date';
import { TreasuryVouchersService } from '../application/treasury-vouchers.service';
import { TreasuryStatementService } from '../application/treasury-statement.service';

const VOUCHER_TITLES = { expense: 'سند صرف', income: 'سند قبض', transfer: 'سند تحويل بين الخزائن' } as const;

const MOVEMENT_LABELS: Record<string, string> = {
  opening_balance: 'رصيد أول المدة',
  payment_received: 'تحصيل من عميل',
  supplier_payment: 'سداد لمورد',
  pos_variance: 'فرق جرد نقطة البيع',
  expense: 'مصروف',
  income: 'إيراد',
  transfer_in: 'تحويل وارد',
  transfer_out: 'تحويل صادر',
};

/** سند صرف / قبض / تحويل — A4 or the 80 mm roll. */
class TreasuryVoucherPrintProvider implements PrintProvider {
  readonly documentType = 'treasury_voucher';
  readonly label = 'سندات الخزينة (صرف / قبض / تحويل)';
  readonly paperSizes: PaperSizeDto[] = ['a4', 'thermal80'];
  readonly permissions = ['treasury.view', 'treasury.vouchers.manage'];

  constructor(private readonly vouchers: TreasuryVouchersService) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const v = await this.vouchers.getById(db, id);
    const amount = Money.fromMinorUnits(BigInt(v.amount.amountMinorUnits), v.amount.currency);
    const fields =
      v.kind === 'transfer'
        ? [
            { label: 'من خزينة', value: v.treasuryName },
            { label: 'إلى خزينة', value: v.toTreasuryName ?? '' },
          ]
        : [
            { label: v.kind === 'expense' ? 'صُرف من' : 'قُبض في', value: v.treasuryName },
            { label: 'البند', value: v.categoryName ?? '' },
          ];
    if (v.reference) fields.push({ label: 'مرجع', value: v.reference });
    return {
      id: v.id,
      title: VOUCHER_TITLES[v.kind],
      number: v.voucherNumber,
      status: v.status,
      statusLabel: v.status === 'cancelled' ? statusLabel('cancelled') : null,
      date: v.voucherDate,
      currency: v.amount.currency,
      party: v.counterparty
        ? { roleLabel: v.kind === 'expense' ? 'صُرف إلى' : v.kind === 'income' ? 'استُلم من' : 'الطرف', name: v.counterparty }
        : null,
      fields,
      lines: [{ description: v.description ?? (v.categoryName ?? VOUCHER_TITLES[v.kind]), amount: v.amount }],
      totals: amountTotalsDto(amount),
      notes: v.status === 'cancelled' && v.cancelReason ? `سبب الإلغاء: ${v.cancelReason}` : null,
    };
  }
}

/** حركة خزينة — the ledger section of the central A4 layout. */
class TreasuryStatementPrintProvider implements PrintProvider {
  readonly documentType = 'treasury_statement';
  readonly label = 'حركة خزينة';
  readonly paperSizes: PaperSizeDto[] = ['a4'];
  readonly permissions = ['treasury.view'];

  constructor(private readonly statements: TreasuryStatementService) {}

  async build(db: Kysely<TenantDatabase>, id: string, options?: PrintBuildOptions): Promise<PrintDocumentBody> {
    const q = options?.query ?? {};
    const date = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
    const s = await this.statements.getStatement(db, id, { from: date(q.from), to: date(q.to) });
    const period = [s.from ? `من ${s.from}` : null, s.to ? `إلى ${s.to}` : null].filter(Boolean).join(' ');
    const nonZero = (m: { amountMinorUnits: string; currency: string }) => (m.amountMinorUnits === '0' ? null : m);
    return {
      id,
      title: 'حركة خزينة',
      number: s.treasury.code,
      status: null,
      statusLabel: null,
      date: localIsoDate(),
      currency: s.treasury.currency,
      party: { roleLabel: 'الخزينة', name: s.treasury.name, code: s.treasury.code },
      fields: [
        { label: 'الفترة', value: period || 'كل الفترات' },
        { label: 'العملة', value: s.treasury.currency },
      ],
      lines: [],
      totals: null,
      notes: null,
      ledger: {
        increaseLabel: 'وارد',
        decreaseLabel: 'منصرف',
        openingBalance: s.openingBalance,
        rows: s.rows.map((r) => ({
          date: r.date,
          description: [MOVEMENT_LABELS[r.kind] ?? r.kind, r.counterparty].filter(Boolean).join(' — '),
          number: r.number,
          reference: r.description,
          increase: nonZero(r.moneyIn),
          decrease: nonZero(r.moneyOut),
          balance: r.balance,
        })),
        totalIncrease: s.totalIn,
        totalDecrease: s.totalOut,
        closingBalance: s.closingBalance,
        closingLabel: 'رصيد الخزينة',
      },
    };
  }
}

@Injectable()
export class TreasuryPrintRegistration implements OnModuleInit {
  constructor(
    private readonly registry: PrintRegistry,
    private readonly vouchers: TreasuryVouchersService,
    private readonly statements: TreasuryStatementService,
  ) {}

  onModuleInit(): void {
    this.registry.register(new TreasuryVoucherPrintProvider(this.vouchers), new TreasuryStatementPrintProvider(this.statements));
  }
}
