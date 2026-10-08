import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Download, Pencil, Printer } from 'lucide-react';
import type { PartyKindDto, PartyStatementRowDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Card,
  CardContent,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { PARTY_CONFIG, usePartyStatement, type StatementParams } from './queries';
import { OpeningBalanceDialog } from './opening-balance-dialog';
import { formatAmount, minorUnitsToDecimalString } from '../../lib/money';
import { downloadXlsx } from '../../lib/xlsx';
import { openPrint } from '../../components/printing/print-button';

/** Where a statement row's document opens (documents without a details page show their number only). */
const DOCUMENT_LINKS: Partial<Record<PartyStatementRowDto['kind'], (id: string) => string>> = {
  sales_invoice: (id) => `/sales/sales-invoices/${id}`,
  purchase_invoice: (id) => `/purchases/purchase-invoices/${id}`,
};

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/**
 * كشف حساب عميل / مورد — the same screen for both: period filter, opening
 * balance (editable), every document with its running balance, totals,
 * print (central print service, A4) and Excel export.
 */
export function PartyStatementPage({ kind }: { kind: PartyKindDto }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const config = PARTY_CONFIG[kind];
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState('');
  const [params, setParams] = useState<StatementParams>({ from: yearStart() });
  const [openingOpen, setOpeningOpen] = useState(false);
  const { data: statement, isLoading } = usePartyStatement(kind, id, params);

  const amount = (value: { amountMinorUnits: string }) => formatAmount(value.amountMinorUnits);
  const positive = (value: { amountMinorUnits: string }) => value.amountMinorUnits !== '0';
  const closing = statement ? BigInt(statement.closingBalance.amountMinorUnits) : 0n;

  function exportXlsx() {
    if (!statement) return;
    const n = (value: { amountMinorUnits: string }) => Number(minorUnitsToDecimalString(value.amountMinorUnits));
    downloadXlsx(
      `${t('statements.title')} ${statement.party.name}`,
      [
        t('statements.columns.date'),
        t('statements.columns.description'),
        t('statements.columns.number'),
        t('statements.columns.reference'),
        t(`statements.columns.increase.${kind}`),
        t(`statements.columns.decrease.${kind}`),
        t('statements.columns.balance'),
      ],
      [
        ['', t('statements.openingRow'), '', '', null, null, n(statement.openingBalance)],
        ...statement.rows.map((row) => [
          row.date,
          t(`statements.kinds.${row.kind}`),
          row.number,
          row.reference ?? '',
          positive(row.increase) ? n(row.increase) : null,
          positive(row.decrease) ? n(row.decrease) : null,
          n(row.balance),
        ]),
        ['', t('statements.total'), '', '', n(statement.totalIncrease), n(statement.totalDecrease), n(statement.closingBalance)],
      ],
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={statement ? `${t('statements.title')} — ${statement.party.name}` : t('statements.title')}
        description={statement ? `${t(`statements.party.${kind}`)} ${statement.party.code}` : undefined}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link to={config.listPath}>
                <ArrowRight />
                {t(`statements.balances.title.${kind}`)}
              </Link>
            </Button>
            <Can permission={config.permission}>
              <Button variant="outline" onClick={() => setOpeningOpen(true)} disabled={!statement}>
                <Pencil />
                {t('statements.opening.title')}
              </Button>
            </Can>
            <Button variant="outline" onClick={exportXlsx} disabled={!statement}>
              <Download />
              {t('statements.export')}
            </Button>
            <Button
              onClick={() => id && openPrint(config.printType, id, { params: { ...params } })}
              disabled={!statement}
            >
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
        {statement && statement.currencies.length > 1 ? (
          <div className="grid gap-1.5">
            <Label>{t('statements.currency')}</Label>
            <Select
              value={params.currency ?? statement.currency}
              onValueChange={(currency) => setParams((current) => ({ ...current, currency }))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statement.currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button onClick={() => setParams((current) => ({ ...current, from: from || undefined, to: to || undefined }))}>
          {t('statements.show')}
        </Button>
        <Button variant="ghost" onClick={() => { setFrom(''); setTo(''); setParams((c) => ({ currency: c.currency })); }}>
          {t('statements.allPeriods')}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}

      {statement ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label={t('statements.openingRow')} value={amount(statement.openingBalance)} currency={statement.currency} />
            <Summary label={t(`statements.columns.increase.${kind}`)} value={amount(statement.totalIncrease)} currency={statement.currency} />
            <Summary label={t(`statements.columns.decrease.${kind}`)} value={amount(statement.totalDecrease)} currency={statement.currency} />
            <Summary
              label={t(`statements.closing.${kind}.${closing >= 0n ? 'positive' : 'negative'}`)}
              value={formatAmount((closing < 0n ? -closing : closing).toString())}
              currency={statement.currency}
              strong
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">{t('statements.columns.date')}</TableHead>
                    <TableHead>{t('statements.columns.description')}</TableHead>
                    <TableHead>{t('statements.columns.number')}</TableHead>
                    <TableHead className="text-end">{t(`statements.columns.increase.${kind}`)}</TableHead>
                    <TableHead className="text-end">{t(`statements.columns.decrease.${kind}`)}</TableHead>
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
                      {amount(statement.openingBalance)}
                    </TableCell>
                  </TableRow>
                  {statement.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('statements.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {statement.rows.map((row, index) => {
                    const link = row.documentId ? DOCUMENT_LINKS[row.kind]?.(row.documentId) : undefined;
                    return (
                      <TableRow key={`${row.documentId ?? 'opening'}-${index}`}>
                        <TableCell className="tabular-nums" dir="ltr">
                          {row.date}
                        </TableCell>
                        <TableCell>
                          {t(`statements.kinds.${row.kind}`)}
                          {row.reference ? <span className="block text-xs text-muted-foreground">{row.reference}</span> : null}
                        </TableCell>
                        <TableCell dir="ltr" className="text-start">
                          {link ? (
                            <Link className="text-primary hover:underline" to={link}>
                              {row.number}
                            </Link>
                          ) : (
                            row.number
                          )}
                        </TableCell>
                        <TableCell className="text-end tabular-nums" dir="ltr">
                          {positive(row.increase) ? amount(row.increase) : ''}
                        </TableCell>
                        <TableCell className="text-end tabular-nums" dir="ltr">
                          {positive(row.decrease) ? amount(row.decrease) : ''}
                        </TableCell>
                        <TableCell className="text-end font-medium tabular-nums" dir="ltr">
                          {amount(row.balance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell />
                    <TableCell>{t('statements.total')}</TableCell>
                    <TableCell />
                    <TableCell className="text-end tabular-nums" dir="ltr">
                      {amount(statement.totalIncrease)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">
                      {amount(statement.totalDecrease)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">
                      {amount(statement.closingBalance)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {id ? (
            <OpeningBalanceDialog
              kind={kind}
              partyId={id}
              defaultCurrency={statement.currency}
              open={openingOpen}
              onOpenChange={setOpeningOpen}
            />
          ) : null}
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
