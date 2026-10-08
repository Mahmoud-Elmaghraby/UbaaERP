import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Download, Printer } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
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

import { useTreasuryStatement } from '../api/queries';
import { formatAmount, minorUnitsToDecimalString } from '../../../lib/money';
import { downloadXlsx } from '../../../lib/xlsx';
import { openPrint } from '../../../components/printing/print-button';

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** حركة الخزينة — every movement in / out (receipts, payments, vouchers, transfers) with a running balance. */
export function TreasuryStatementPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState('');
  const [params, setParams] = useState<{ from?: string; to?: string }>({ from: monthStart() });
  const { data: s, isLoading } = useTreasuryStatement(id, params);

  const amount = (m: { amountMinorUnits: string }) => (m.amountMinorUnits === '0' ? '' : formatAmount(m.amountMinorUnits));
  const label = (row: { kind: string; counterparty: string | null }) =>
    [t(`treasury.movements.${row.kind}`), row.counterparty].filter(Boolean).join(' — ');

  function exportXlsx() {
    if (!s) return;
    const n = (m: { amountMinorUnits: string }) => Number(minorUnitsToDecimalString(m.amountMinorUnits));
    downloadXlsx(
      `${t('treasury.statement')} ${s.treasury.name}`,
      [t('statements.columns.date'), t('statements.columns.description'), t('statements.columns.number'), t('treasury.notes'), t('treasury.in'), t('treasury.out'), t('statements.columns.balance')],
      [
        ['', t('statements.openingRow'), '', '', null, null, n(s.openingBalance)],
        ...s.rows.map((r) => [r.date, label(r), r.number, r.description ?? '', n(r.moneyIn) || null, n(r.moneyOut) || null, n(r.balance)]),
        ['', t('statements.total'), '', '', n(s.totalIn), n(s.totalOut), n(s.closingBalance)],
      ],
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={s ? `${t('treasury.statement')} — ${s.treasury.name}` : t('treasury.statement')}
        description={s ? `${t(`treasury.kinds.${s.treasury.kind}`)} · ${s.treasury.code} · ${s.treasury.currency}` : undefined}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link to="/treasury">
                <ArrowRight />
                {t('treasury.title')}
              </Link>
            </Button>
            <Button variant="outline" onClick={exportXlsx} disabled={!s}>
              <Download />
              {t('statements.export')}
            </Button>
            <Button onClick={() => id && openPrint('treasury_statement', id, { params })} disabled={!s}>
              <Printer />
              {t('printing.print')}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label>{t('statements.from')}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>{t('statements.to')}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button onClick={() => setParams({ from: from || undefined, to: to || undefined })}>{t('statements.show')}</Button>
        <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setParams({}); }}>
          {t('statements.allPeriods')}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label={t('statements.openingRow')} value={formatAmount(s.openingBalance.amountMinorUnits)} currency={s.treasury.currency} />
            <Summary label={t('treasury.in')} value={formatAmount(s.totalIn.amountMinorUnits)} currency={s.treasury.currency} />
            <Summary label={t('treasury.out')} value={formatAmount(s.totalOut.amountMinorUnits)} currency={s.treasury.currency} />
            <Summary label={t('treasury.closing')} value={formatAmount(s.closingBalance.amountMinorUnits)} currency={s.treasury.currency} strong />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">{t('statements.columns.date')}</TableHead>
                    <TableHead>{t('statements.columns.description')}</TableHead>
                    <TableHead>{t('statements.columns.number')}</TableHead>
                    <TableHead className="text-end">{t('treasury.in')}</TableHead>
                    <TableHead className="text-end">{t('treasury.out')}</TableHead>
                    <TableHead className="text-end">{t('statements.columns.balance')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell />
                    <TableCell className="font-medium">{t('statements.openingRow')}</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-end font-medium tabular-nums" dir="ltr">
                      {formatAmount(s.openingBalance.amountMinorUnits)}
                    </TableCell>
                  </TableRow>
                  {s.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('statements.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {s.rows.map((r, i) => (
                    <TableRow key={`${r.documentId ?? 'o'}-${r.kind}-${i}`}>
                      <TableCell className="tabular-nums" dir="ltr">{r.date}</TableCell>
                      <TableCell>
                        {label(r)}
                        {r.description ? <span className="block text-xs text-muted-foreground">{r.description}</span> : null}
                      </TableCell>
                      <TableCell dir="ltr" className="text-start">{r.number}</TableCell>
                      <TableCell className="text-end tabular-nums text-success" dir="ltr">{amount(r.moneyIn)}</TableCell>
                      <TableCell className="text-end tabular-nums text-destructive" dir="ltr">{amount(r.moneyOut)}</TableCell>
                      <TableCell className="text-end font-medium tabular-nums" dir="ltr">{formatAmount(r.balance.amountMinorUnits)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell />
                    <TableCell>{t('statements.total')}</TableCell>
                    <TableCell />
                    <TableCell className="text-end tabular-nums" dir="ltr">{formatAmount(s.totalIn.amountMinorUnits)}</TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{formatAmount(s.totalOut.amountMinorUnits)}</TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{formatAmount(s.closingBalance.amountMinorUnits)}</TableCell>
                  </TableRow>
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
