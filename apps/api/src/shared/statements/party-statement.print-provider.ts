import type { Kysely } from 'kysely';
import type { PaperSizeDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import type { PrintBuildOptions, PrintDocumentBody, PrintProvider } from '../printing/print-provider';
import { localIsoDate } from '../time/local-date';
import { getPartyStatement, type PartyLedgerSource } from './party-statements';
import type { PartyLedgerKind } from './account-statement';

const KIND_LABELS: Record<PartyLedgerKind, string> = {
  opening_balance: 'رصيد أول المدة',
  sales_invoice: 'فاتورة مبيعات',
  sales_credit_note: 'إشعار دائن',
  payment_received: 'سند قبض',
  purchase_invoice: 'فاتورة مشتريات',
  supplier_payment: 'سند صرف لمورد',
};

export function ledgerKindLabel(kind: PartyLedgerKind): string {
  return KIND_LABELS[kind];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * One print provider for both statements (customer / supplier): the central
 * print service renders it with the same A4 layout as every document, using
 * the `ledger` section instead of product lines. The period comes from the
 * print request's query string (?from=&to=&currency=).
 */
export class PartyStatementPrintProvider implements PrintProvider {
  readonly paperSizes: PaperSizeDto[] = ['a4'];

  constructor(
    private readonly source: PartyLedgerSource,
    readonly documentType: string,
    readonly label: string,
    readonly permissions: string[],
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string, options?: PrintBuildOptions): Promise<PrintDocumentBody> {
    const query = options?.query ?? {};
    const statement = await getPartyStatement(db, this.source, id, {
      from: query.from && DATE.test(query.from) ? query.from : undefined,
      to: query.to && DATE.test(query.to) ? query.to : undefined,
      currency: query.currency && CURRENCY.test(query.currency) ? query.currency : undefined,
    });
    const party = await this.source.findParty(db, id);
    const isCustomer = this.source.partyKind === 'customer';
    const closing = BigInt(statement.closingBalance.amountMinorUnits);
    const closingLabel = isCustomer
      ? closing >= 0n ? 'الرصيد المستحق على العميل' : 'رصيد دائن للعميل'
      : closing >= 0n ? 'الرصيد المستحق للمورد' : 'رصيد مدين على المورد';
    const period = [statement.from ? `من ${statement.from}` : null, statement.to ? `إلى ${statement.to}` : null]
      .filter(Boolean)
      .join(' ');

    return {
      id,
      title: 'كشف حساب',
      number: statement.party.code,
      status: null,
      statusLabel: null,
      date: localIsoDate(),
      currency: statement.currency,
      party: {
        roleLabel: isCustomer ? 'العميل' : 'المورد',
        name: statement.party.name,
        code: statement.party.code,
        phone: party?.phone ?? null,
      },
      fields: [
        { label: 'الفترة', value: period || 'كل الفترات' },
        { label: 'العملة', value: statement.currency },
      ],
      lines: [],
      totals: null,
      notes: null,
      ledger: {
        increaseLabel: isCustomer ? 'مدين (عليه)' : 'دائن (له)',
        decreaseLabel: isCustomer ? 'دائن (له)' : 'مدين (عليه)',
        openingBalance: statement.openingBalance,
        rows: statement.rows.map((row) => ({
          date: row.date,
          description: KIND_LABELS[row.kind],
          number: row.number,
          reference: row.reference,
          increase: BigInt(row.increase.amountMinorUnits) > 0n ? row.increase : null,
          decrease: BigInt(row.decrease.amountMinorUnits) > 0n ? row.decrease : null,
          balance: row.balance,
        })),
        totalIncrease: statement.totalIncrease,
        totalDecrease: statement.totalDecrease,
        closingBalance: statement.closingBalance,
        closingLabel,
      },
    };
  }
}
