import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
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
} from '@erp-platform/ui';

import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { useActiveCostCenters } from '../../hooks/use-active-cost-centers';

export interface JournalEntryLineDraft {
  /** Local React key only — never sent to the backend (lines have no client-assigned id). */
  key: string;
  accountId: string | undefined;
  /** Decimal-string form input, one of debit/credit — never both non-zero on the same
   * line, matching createJournalEntryLineSchema's own comment (the backend CHECK
   * constraint is the real enforcement; this is just the client-side worksheet shape). */
  debit: string;
  credit: string;
  description: string;
  /** Optional cost-center tag (Stage 4) — undefined means "no tag", never validated against the balance invariant. */
  costCenterId: string | undefined;
}

let nextKey = 0;
export function createEmptyLine(): JournalEntryLineDraft {
  nextKey += 1;
  return {
    key: `new-${nextKey}`,
    accountId: undefined,
    debit: '',
    credit: '',
    description: '',
    costCenterId: undefined,
  };
}

/**
 * Plain controlled-state line-items editor, same non-useFieldArray pattern as every
 * other multi-line entity in this codebase (see PurchaseRequisitionLineItemsEditor's
 * own class comment for the rationale — no working `tsc` in this session to check
 * useFieldArray's generics). A journal entry line has no product/variant — its picker
 * is the postable (leaf, active) chart-of-accounts list instead, plus a debit and a
 * credit decimal field side by side rather than one quantity/price pair, since a line
 * is either a debit or a credit, never both.
 */
export function JournalEntryLineItemsEditor({
  lines,
  onChange,
}: {
  lines: JournalEntryLineDraft[];
  onChange: (lines: JournalEntryLineDraft[]) => void;
}) {
  const { t } = useTranslation();
  const postableAccounts = usePostableAccounts();
  const activeCostCenters = useActiveCostCenters();

  const options = useMemo(
    () => postableAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [postableAccounts],
  );
  const costCenterOptions = useMemo(
    () => activeCostCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [activeCostCenters],
  );
  const NO_COST_CENTER = '__none__';

  function updateLine(key: string, patch: Partial<JournalEntryLineDraft>) {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  function addLine() {
    onChange([...lines, createEmptyLine()]);
  }

  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('accounting.journalEntries.lineAccount')}</TableHead>
              <TableHead className="w-32">{t('accounting.journalEntries.lineDebit')}</TableHead>
              <TableHead className="w-32">{t('accounting.journalEntries.lineCredit')}</TableHead>
              <TableHead>{t('accounting.journalEntries.lineDescription')}</TableHead>
              <TableHead>{t('accounting.journalEntries.lineCostCenter')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.key}>
                <TableCell>
                  <Select
                    value={line.accountId}
                    onValueChange={(value) => updateLine(line.key, { accountId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('accounting.journalEntries.selectAccount')} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={line.debit}
                    onChange={(e) => updateLine(line.key, { debit: e.target.value, credit: '' })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={line.credit}
                    onChange={(e) => updateLine(line.key, { credit: e.target.value, debit: '' })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={line.costCenterId ?? NO_COST_CENTER}
                    onValueChange={(value) =>
                      updateLine(line.key, { costCenterId: value === NO_COST_CENTER ? undefined : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('accounting.journalEntries.selectCostCenter')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COST_CENTER}>{t('accounting.journalEntries.noCostCenter')}</SelectItem>
                      {costCenterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={addLine}>
        <Plus className="me-1 h-4 w-4" />
        {t('accounting.journalEntries.addLine')}
      </Button>
    </div>
  );
}
