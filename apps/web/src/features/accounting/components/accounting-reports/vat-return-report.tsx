import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VatReturnRowDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';
import { Download } from 'lucide-react';

import { useVatReturnReport } from '../../api/accounting-reports/queries';
import { formatAmount, minorUnitsToDecimalString } from '../../../../lib/money';
import { downloadXlsx } from '../../../../lib/xlsx';

function monthBounds(offsetMonths = 0): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}

/**
 * إقرار ضريبة القيمة المضافة — what the monthly VAT return needs: VAT on sales
 * (credit notes deducted) by rate, VAT on purchases, the net to pay or carry
 * forward, and the withholding totals (customers' certificates to collect,
 * and what we withheld from suppliers and must pay to the tax authority).
 */
export function VatReturnReport() {
  const { t } = useTranslation();
  const initial = monthBounds(-1);
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [runParams, setRunParams] = useState<{ fromDate: string | undefined; toDate: string | undefined }>({
    fromDate: undefined,
    toDate: undefined,
  });
  const { data: report, isLoading } = useVatReturnReport(runParams);

  const kindLabel = (row: VatReturnRowDto) => t(`settings.taxes.kinds.${row.kind}`);

  function exportXlsx() {
    if (!report) return;
    downloadXlsx(
      `${t('accounting.reports.vatReturn')} ${report.from} ${report.to}`,
      [
        t('accounting.reports.vat.direction'),
        t('settings.taxes.kind'),
        t('settings.taxes.name'),
        t('settings.taxes.rate'),
        t('settings.taxes.etaCode'),
        t('accounting.reports.vat.base'),
        t('accounting.reports.vat.amount'),
        t('accounting.reports.vat.documents'),
        t('accounting.reports.vat.currency'),
      ],
      report.rows.map((row) => [
        t(`accounting.reports.vat.${row.direction}`),
        kindLabel(row),
        row.name,
        Number(row.rate),
        [row.etaType, row.etaSubtype].filter(Boolean).join(' / '),
        Number(minorUnitsToDecimalString(row.baseMinorUnits)),
        Number(minorUnitsToDecimalString(row.amountMinorUnits)),
        row.documentCount,
        row.currency,
      ]),
    );
  }

  const net = report ? BigInt(report.netVatPayableMinorUnits) : 0n;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.fromDate')}</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('accounting.reports.toDate')}</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Button
          onClick={() => setRunParams({ fromDate: fromDate || undefined, toDate: toDate || undefined })}
          disabled={!fromDate || !toDate}
        >
          {t('accounting.reports.run')}
        </Button>
        {report ? (
          <Button variant="outline" onClick={exportXlsx}>
            <Download />
            {t('accounting.reports.vat.export')}
          </Button>
        ) : null}
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label={t('accounting.reports.vat.outputVat')} value={report.outputVatMinorUnits} currency={report.currency} />
            <Summary label={t('accounting.reports.vat.inputVat')} value={report.inputVatMinorUnits} currency={report.currency} />
            <Summary
              label={net >= 0n ? t('accounting.reports.vat.netPayable') : t('accounting.reports.vat.netCredit')}
              value={(net >= 0n ? net : -net).toString()}
              currency={report.currency}
              strong
            />
            <Summary label={t('taxes.totals.table')} value={report.tableTaxMinorUnits} currency={report.currency} />
            <Summary
              label={t('accounting.reports.vat.withholdingByCustomers')}
              value={report.withholdingByCustomersMinorUnits}
              currency={report.currency}
            />
            <Summary
              label={t('accounting.reports.vat.withholdingFromSuppliers')}
              value={report.withholdingFromSuppliersMinorUnits}
              currency={report.currency}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('accounting.reports.vat.direction')}</TableHead>
                <TableHead>{t('settings.taxes.name')}</TableHead>
                <TableHead>{t('settings.taxes.etaCode')}</TableHead>
                <TableHead className="text-end">{t('accounting.reports.vat.base')}</TableHead>
                <TableHead className="text-end">{t('accounting.reports.vat.amount')}</TableHead>
                <TableHead className="text-end">{t('accounting.reports.vat.documents')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={`${row.direction}-${row.taxRuleId}-${row.rate}-${row.currency}`}>
                  <TableCell>
                    <Badge variant={row.direction === 'output' ? 'default' : 'secondary'}>
                      {t(`accounting.reports.vat.${row.direction}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.name} <span className="text-xs text-muted-foreground">· {kindLabel(row)}</span>
                  </TableCell>
                  <TableCell dir="ltr" className="font-mono text-xs">
                    {[row.etaType, row.etaSubtype].filter(Boolean).join(' / ') || '—'}
                  </TableCell>
                  <TableCell className="text-end">
                    {formatAmount(row.baseMinorUnits)} {row.currency !== report.currency ? row.currency : ''}
                  </TableCell>
                  <TableCell className="text-end font-semibold">{formatAmount(row.amountMinorUnits)}</TableCell>
                  <TableCell className="text-end">{row.documentCount}</TableCell>
                </TableRow>
              ))}
              {report.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t('accounting.reports.vat.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, currency, strong }: { label: string; value: string; currency: string; strong?: boolean }) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={strong ? 'text-xl font-bold text-primary' : 'text-lg font-semibold'}>
          <bdi dir="ltr">{formatAmount(value)}</bdi> <span className="text-xs text-muted-foreground">{currency}</span>
        </span>
      </CardContent>
    </Card>
  );
}
