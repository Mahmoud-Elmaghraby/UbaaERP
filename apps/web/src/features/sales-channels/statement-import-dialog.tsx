import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SettlementLineKindDto } from '@erp-platform/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { readSpreadsheet } from '../../lib/xlsx';
import { decimalToMinorUnits, formatAmount } from '../../lib/money';
import { useTreasuryCategories } from '../treasury/api/queries';

export interface ImportedLine {
  kind: SettlementLineKindDto;
  externalReference: string | null;
  description: string | null;
  amountMinor: bigint;
  categoryId: string | null;
}

type Treatment = 'order' | 'refund' | 'fee' | 'ignore';
interface Mapping {
  orderCol: number;
  typeCol: number;
  amountCol: number;
  types: Record<string, { treatment: Treatment; categoryId: string | null }>;
}

const NONE = '-1';
const storageKey = (channelId: string) => `settlement-import:${channelId}`;

function loadMapping(channelId: string): Mapping | null {
  try {
    const raw = localStorage.getItem(storageKey(channelId));
    return raw ? (JSON.parse(raw) as Mapping) : null;
  } catch {
    return null;
  }
}

function saveMapping(channelId: string, mapping: Mapping): void {
  try {
    localStorage.setItem(storageKey(channelId), JSON.stringify(mapping));
  } catch {
    /* private mode — the mapping just isn't remembered */
  }
}

/** "1,234.50", "(60.00)", "-60" → minor units (signed). Null when not a number. */
function parseAmount(raw: string): bigint | null {
  let text = raw.trim().replace(/[,\s]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  text = text.replace(/[^\d.]/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const minor = BigInt(decimalToMinorUnits(text));
  return negative ? -minor : minor;
}

/**
 * Turns a platform statement file (Excel / CSV exported from Jumia / Noon /
 * Amazon seller centres) into settlement lines. The user points at three
 * columns once — order number, transaction type, amount — and says what each
 * transaction type is (paid order, refund, or a fee with its expense item);
 * the choice is remembered per channel, so next week's file is one click.
 */
export function StatementImportDialog({
  open,
  onOpenChange,
  channelId,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  onImport: (lines: ImportedLine[]) => void;
}) {
  const { t } = useTranslation();
  const { data: expenseItems } = useTreasuryCategories('expense');
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ orderCol: -1, typeCol: -1, amountCol: -1, types: {} });
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const sheet = (await readSpreadsheet(file)).filter((row) => row.some((cell) => String(cell ?? '').trim()));
      if (sheet.length < 2) throw new Error('empty');
      setRows(sheet.map((row) => row.map((cell) => String(cell ?? ''))));
      const remembered = loadMapping(channelId);
      setMapping(remembered && remembered.amountCol < sheet[0]!.length ? remembered : guessMapping(sheet[0]!));
    } catch {
      toast.error(t('settlements.import.unreadable'));
    }
  }

  const typeValues = useMemo(() => {
    if (mapping.amountCol < 0) return [];
    const seen = new Map<string, { count: number; sum: bigint }>();
    for (const row of body) {
      const type = mapping.typeCol >= 0 ? (row[mapping.typeCol] ?? '').trim() || '—' : '—';
      const amount = parseAmount(row[mapping.amountCol] ?? '');
      if (amount === null) continue;
      const entry = seen.get(type) ?? { count: 0, sum: 0n };
      entry.count += 1;
      entry.sum += amount;
      seen.set(type, entry);
    }
    return [...seen.entries()].map(([type, info]) => ({ type, ...info }));
  }, [body, mapping.amountCol, mapping.typeCol]);

  const treatmentOf = (type: string, sum: bigint) =>
    mapping.types[type] ?? { treatment: (sum >= 0n ? 'order' : 'fee') as Treatment, categoryId: null };

  function build(): ImportedLine[] | null {
    const orders = new Map<string, bigint>();
    const refunds = new Map<string, bigint>();
    const fees = new Map<string, { amount: bigint; description: string; categoryId: string }>();
    for (const row of body) {
      const amount = parseAmount(row[mapping.amountCol] ?? '');
      if (amount === null || amount === 0n) continue;
      const type = mapping.typeCol >= 0 ? (row[mapping.typeCol] ?? '').trim() || '—' : '—';
      const info = typeValues.find((v) => v.type === type);
      const rule = treatmentOf(type, info?.sum ?? amount);
      const ref = mapping.orderCol >= 0 ? (row[mapping.orderCol] ?? '').trim() : '';
      const abs = amount < 0n ? -amount : amount;
      if (rule.treatment === 'ignore') continue;
      if (rule.treatment === 'fee') {
        if (!rule.categoryId) return null;
        const key = `${rule.categoryId}|${type}`;
        // A fee row with a positive amount is a fee given back (reduces the fee).
        const entry = fees.get(key) ?? { amount: 0n, description: type, categoryId: rule.categoryId };
        entry.amount += -amount;
        fees.set(key, entry);
      } else {
        const target = rule.treatment === 'order' ? orders : refunds;
        target.set(ref, (target.get(ref) ?? 0n) + (rule.treatment === 'order' ? amount : abs));
      }
    }
    const lines: ImportedLine[] = [];
    for (const [ref, amount] of orders) if (amount > 0n) lines.push({ kind: 'order', externalReference: ref || null, description: null, amountMinor: amount, categoryId: null });
    for (const [ref, amount] of refunds) if (amount > 0n) lines.push({ kind: 'refund', externalReference: ref || null, description: null, amountMinor: amount, categoryId: null });
    for (const fee of fees.values()) if (fee.amount > 0n) lines.push({ kind: 'fee', externalReference: null, description: fee.description, amountMinor: fee.amount, categoryId: fee.categoryId });
    return lines;
  }

  function apply() {
    const lines = build();
    if (!lines) {
      toast.error(t('settlements.import.feeNeedsItem'));
      return;
    }
    saveMapping(channelId, mapping);
    onImport(lines);
    onOpenChange(false);
    setRows([]);
  }

  const column = (value: number, onChange: (v: number) => void, label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {header.map((name, index) => (
            <SelectItem key={index} value={String(index)}>
              {name || `#${index + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('settlements.import.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('settlements.import.hint')}</p>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm" />
        {rows.length > 0 ? (
          <div className="grid gap-4">
            <p className="text-sm">{t('settlements.import.rows', { count: body.length })}</p>
            <div className="grid grid-cols-3 gap-3">
              {column(mapping.orderCol, (v) => setMapping({ ...mapping, orderCol: v }), t('settlements.import.orderCol'))}
              {column(mapping.typeCol, (v) => setMapping({ ...mapping, typeCol: v }), t('settlements.import.typeCol'))}
              {column(mapping.amountCol, (v) => setMapping({ ...mapping, amountCol: v }), t('settlements.import.amountCol'))}
            </div>
            {typeValues.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settlements.import.type')}</TableHead>
                    <TableHead>{t('settlements.import.count')}</TableHead>
                    <TableHead>{t('settlements.import.sum')}</TableHead>
                    <TableHead>{t('settlements.import.treatment')}</TableHead>
                    <TableHead>{t('settlements.category')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeValues.map(({ type, count, sum }) => {
                    const rule = treatmentOf(type, sum);
                    const set = (patch: Partial<typeof rule>) =>
                      setMapping({ ...mapping, types: { ...mapping.types, [type]: { ...rule, ...patch } } });
                    return (
                      <TableRow key={type}>
                        <TableCell className="font-medium">{type}</TableCell>
                        <TableCell>{count}</TableCell>
                        <TableCell dir="ltr" className="text-end tabular">
                          {formatAmount(sum.toString())}
                        </TableCell>
                        <TableCell>
                          <Select value={rule.treatment} onValueChange={(v) => set({ treatment: v as Treatment })}>
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['order', 'refund', 'fee', 'ignore'] as const).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {t(`settlements.treatments.${k}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {rule.treatment === 'fee' ? (
                            <Select value={rule.categoryId ?? NONE} onValueChange={(v) => set({ categoryId: v === NONE ? null : v })}>
                              <SelectTrigger className="h-8 w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>—</SelectItem>
                                {(expenseItems ?? []).filter((c) => c.isActive).map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={apply} disabled={mapping.amountCol < 0}>
                {t('settlements.import.apply')}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** First guess from the header names (Arabic / English seller-centre exports). */
function guessMapping(header: string[]): Mapping {
  const find = (patterns: RegExp[]) => header.findIndex((h) => patterns.some((p) => p.test(h)));
  return {
    orderCol: find([/order/i, /أوردر|طلب/]),
    typeCol: find([/transaction type|type|description/i, /نوع|بيان|وصف/]),
    amountCol: find([/amount|value|total/i, /مبلغ|قيمة|إجمالي/]),
    types: {},
  };
}
