import type { LineTaxDto } from '@erp-platform/contracts';

import { formatAmount } from '../../lib/money';

/** "VAT 14%: 140.00 · WHT 1%: (10.00)" under a document line's amount. */
export function LineTaxesNote({ taxes }: { taxes: readonly LineTaxDto[] }) {
  if (taxes.length === 0) return null;
  return (
    <div className="flex flex-col text-[11px] font-normal text-muted-foreground">
      {taxes.map((tax) => (
        <span key={tax.taxRuleId}>
          {tax.name}:{' '}
          <bdi dir="ltr">
            {tax.kind === 'withholding' ? `(${formatAmount(tax.amountMinorUnits)})` : formatAmount(tax.amountMinorUnits)}
          </bdi>
        </span>
      ))}
    </div>
  );
}
