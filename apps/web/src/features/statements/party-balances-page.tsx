import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import type { AgingBucketsDto, PartyKindDto } from '@erp-platform/contracts';
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { PARTY_CONFIG, usePartyBalances } from './queries';
import { formatAmount, minorUnitsToDecimalString } from '../../lib/money';
import { downloadXlsx } from '../../lib/xlsx';

const BUCKETS: (keyof Omit<AgingBucketsDto, 'total' | 'unappliedCredit'>)[] = [
  'current',
  'days1To30',
  'days31To60',
  'days61To90',
  'over90',
];

/**
 * أرصدة العملاء (receivables) / أرصدة الموردين (payables): every party's
 * balance as of a date, aged by how overdue it is, with a link to each
 * party's statement. Works without the Accounting module.
 */
export function PartyBalancesPage({ kind }: { kind: PartyKindDto }) {
  const { t } = useTranslation();
  const config = PARTY_CONFIG[kind];
  const [asOf, setAsOf] = useState('');
  const [nonZeroOnly, setNonZeroOnly] = useState(true);
  const [params, setParams] = useState<{ asOf?: string }>({});
  const { data: report, isLoading } = usePartyBalances(kind, { ...params, nonZeroOnly });

  const amount = (value: { amountMinorUnits: string }) =>
    value.amountMinorUnits === '0' ? '—' : formatAmount(value.amountMinorUnits);

  function exportXlsx() {
    if (!report) return;
    const n = (value: { amountMinorUnits: string }) => Number(minorUnitsToDecimalString(value.amountMinorUnits));
    downloadXlsx(
      `${t(`statements.balances.title.${kind}`)} ${report.asOf}`,
      [
        t('statements.balances.code'),
        t('statements.balances.name'),
        t('statements.balances.phone'),
        t('statements.balances.balance'),
        ...BUCKETS.map((bucket) => t(`statements.aging.${bucket}`)),
        t('statements.aging.unappliedCredit'),
        t('statements.balances.lastActivity'),
      ],
      report.rows.map((row) => [
        row.code,
        row.name,
        row.phone ?? '',
        n(row.balance),
        ...BUCKETS.map((bucket) => n(row.aging[bucket])),
        n(row.aging.unappliedCredit),
        row.lastActivityDate ?? '',
      ]),
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t(`statements.balances.title.${kind}`)}
        description={t(`statements.balances.subtitle.${kind}`)}
        actions={
          <Button variant="outline" onClick={exportXlsx} disabled={!report}>
            <Download />
            {t('statements.export')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label>{t('statements.balances.asOf')}</Label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <Button onClick={() => setParams({ asOf: asOf || undefined })}>{t('statements.show')}</Button>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={nonZeroOnly} onCheckedChange={(checked) => setNonZeroOnly(checked === true)} />
          {t('statements.balances.nonZeroOnly')}
        </label>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label={t('statements.balances.totalBalance')} value={amount(report.totals.balance)} currency={report.currency} strong />
            <Summary
              label={t('statements.balances.overdue')}
              value={formatAmount(
                (
                  BigInt(report.totals.days1To30.amountMinorUnits) +
                  BigInt(report.totals.days31To60.amountMinorUnits) +
                  BigInt(report.totals.days61To90.amountMinorUnits) +
                  BigInt(report.totals.over90.amountMinorUnits)
                ).toString(),
              )}
              currency={report.currency}
            />
            <Summary label={t('statements.aging.over90')} value={amount(report.totals.over90)} currency={report.currency} />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('statements.balances.name')}</TableHead>
                    <TableHead className="text-end">{t('statements.balances.balance')}</TableHead>
                    {BUCKETS.map((bucket) => (
                      <TableHead key={bucket} className="text-end">
                        {t(`statements.aging.${bucket}`)}
                      </TableHead>
                    ))}
                    <TableHead className="text-end">{t('statements.aging.unappliedCredit')}</TableHead>
                    <TableHead>{t('statements.balances.lastActivity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={BUCKETS.length + 4} className="py-8 text-center text-muted-foreground">
                        {t('statements.balances.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {report.rows.map((row) => (
                    <TableRow key={row.partyId}>
                      <TableCell>
                        <Link className="font-medium text-primary hover:underline" to={config.statementPath(row.partyId)}>
                          {row.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {[row.code, row.phone].filter(Boolean).join(' · ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-end font-semibold tabular-nums" dir="ltr">
                        {amount(row.balance)}
                      </TableCell>
                      {BUCKETS.map((bucket) => (
                        <TableCell
                          key={bucket}
                          className={`text-end tabular-nums ${bucket === 'over90' && row.aging.over90.amountMinorUnits !== '0' ? 'text-destructive' : ''}`}
                          dir="ltr"
                        >
                          {amount(row.aging[bucket])}
                        </TableCell>
                      ))}
                      <TableCell className="text-end tabular-nums" dir="ltr">
                        {amount(row.aging.unappliedCredit)}
                      </TableCell>
                      <TableCell className="tabular-nums" dir="ltr">
                        {row.lastActivityDate ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {report.rows.length > 0 ? (
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>{t('statements.total')}</TableCell>
                      <TableCell className="text-end tabular-nums" dir="ltr">
                        {amount(report.totals.balance)}
                      </TableCell>
                      {BUCKETS.map((bucket) => (
                        <TableCell key={bucket} className="text-end tabular-nums" dir="ltr">
                          {amount(report.totals[bucket])}
                        </TableCell>
                      ))}
                      <TableCell className="text-end tabular-nums" dir="ltr">
                        {amount(report.totals.unappliedCredit)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, currency, strong }: { label: string; value: string; currency: string; strong?: boolean }) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`tabular-nums ${strong ? 'text-xl font-bold' : 'text-lg font-semibold'}`} dir="ltr">
          {value} <span className="text-sm font-normal text-muted-foreground">{currency}</span>
        </span>
      </CardContent>
    </Card>
  );
}
