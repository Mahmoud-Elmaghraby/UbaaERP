import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createJournalEntrySchema,
  type CreateJournalEntryDto,
  type CreateJournalEntryLineDto,
  type JournalEntryWithLinesDto,
} from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  CustomFieldsFormSection,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useCreateJournalEntry, useUpdateJournalEntry } from '../../api/journal-entries/queries';
import { decimalToMinorUnits, formatMoney, minorUnitsToDecimalString } from '../../../../lib/money';
import { ApiError } from '../../../../lib/api-client';
import {
  createEmptyLine,
  JournalEntryLineItemsEditor,
  type JournalEntryLineDraft,
} from './journal-entry-line-items-editor';

const JOURNAL_ENTRY_ENTITY_TYPE = 'journal_entry';

/**
 * Header fields (entryDate, description, notes, customFields) go through
 * react-hook-form + zodResolver, exactly like every other multi-line entity in this
 * codebase — `lines` is plain useState, merged into the submitted DTO by hand. See
 * JournalEntryLineItemsEditor's class comment.
 */
type HeaderFormValues = Omit<CreateJournalEntryDto, 'lines'>;

/**
 * Converts the worksheet's decimal-string lines into the wire DTO, or returns null +
 * a translated error key if anything is invalid — mirrors the shape of every other
 * entity's own prepareLines() (see PurchaseRequisitionForm), extended with this
 * entity's own two extra invariants: exactly one side per line, and total debit must
 * equal total credit across the whole entry (JournalEntriesService re-validates both
 * server-side regardless — this is purely a fast client-side check using integer
 * minor-units comparison so no floating-point rounding can hide a real mismatch).
 */
function prepareLines(lines: JournalEntryLineDraft[], t: (key: string) => string): {
  lines: CreateJournalEntryLineDto[] | null;
  error: string | null;
} {
  const prepared: CreateJournalEntryLineDto[] = [];
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const line of lines) {
    const debitRaw = line.debit.trim();
    const creditRaw = line.credit.trim();
    const hasDebit = debitRaw !== '' && Number(debitRaw) > 0;
    const hasCredit = creditRaw !== '' && Number(creditRaw) > 0;
    if (!line.accountId || hasDebit === hasCredit) {
      return { lines: null, error: t('accounting.journalEntries.linesError') };
    }
    let debitMinorUnits: string;
    let creditMinorUnits: string;
    try {
      debitMinorUnits = hasDebit ? decimalToMinorUnits(debitRaw) : '0';
      creditMinorUnits = hasCredit ? decimalToMinorUnits(creditRaw) : '0';
    } catch {
      return { lines: null, error: t('accounting.journalEntries.linesError') };
    }
    totalDebit += BigInt(debitMinorUnits);
    totalCredit += BigInt(creditMinorUnits);
    prepared.push({
      accountId: line.accountId,
      debitAmountMinorUnits: debitMinorUnits,
      creditAmountMinorUnits: creditMinorUnits,
      description: line.description.trim() === '' ? undefined : line.description,
      costCenterId: line.costCenterId ?? undefined,
    });
  }
  if (prepared.length < 2) {
    return { lines: null, error: t('accounting.journalEntries.linesMinError') };
  }
  if (totalDebit !== totalCredit) {
    return { lines: null, error: t('accounting.journalEntries.linesUnbalancedError') };
  }
  return { lines: prepared, error: null };
}

function useLinesTotals(lines: JournalEntryLineDraft[]) {
  return useMemo(() => {
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const line of lines) {
      try {
        if (line.debit.trim() !== '') totalDebit += BigInt(decimalToMinorUnits(line.debit.trim()));
        if (line.credit.trim() !== '') totalCredit += BigInt(decimalToMinorUnits(line.credit.trim()));
      } catch {
        // Invalid partial input while typing — ignored for the live total, the real
        // validation happens in prepareLines() on submit.
      }
    }
    return { totalDebit, totalCredit };
  }, [lines]);
}

function LinesBalanceSummary({ lines, currency }: { lines: JournalEntryLineDraft[]; currency: string }) {
  const { t } = useTranslation();
  const { totalDebit, totalCredit } = useLinesTotals(lines);
  const balanced = totalDebit === totalCredit;
  return (
    <p className={`text-sm ${balanced ? 'text-muted-foreground' : 'text-destructive'}`}>
      {t('accounting.journalEntries.totalDebit')}: {formatMoney(totalDebit.toString(), currency)} —{' '}
      {t('accounting.journalEntries.totalCredit')}: {formatMoney(totalCredit.toString(), currency)}
      {!balanced ? ` (${t('accounting.journalEntries.linesUnbalancedError')})` : ''}
    </p>
  );
}

export function CreateJournalEntryForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createEntry = useCreateJournalEntry();
  const { data: tenantSettings } = useTenantSettings();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    JOURNAL_ENTRY_ENTITY_TYPE,
  );
  const [lines, setLines] = useState<JournalEntryLineDraft[]>(() => [createEmptyLine(), createEmptyLine()]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createJournalEntrySchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: { entryDate: '', description: '', notes: '', customFields: {} },
  });

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const { lines: preparedLines, error } = prepareLines(lines, t);
    if (!preparedLines) {
      setLinesError(error);
      return;
    }
    try {
      await createEntry.mutateAsync({ ...headerValues, lines: preparedLines });
      toast.success(t('accounting.journalEntries.createSuccess'));
      form.reset();
      setLines([createEmptyLine(), createEmptyLine()]);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="entryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.entryDate')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.description')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-2">
          <JournalEntryLineItemsEditor lines={lines} onChange={setLines} />
          <LinesBalanceSummary lines={lines} currency={tenantSettings?.currencyCode ?? 'EGP'} />
          {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {definitions && definitions.length > 0 ? (
          <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
        ) : null}
        <Button type="submit" disabled={createEntry.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

/** Edit is draft-only (JournalEntriesService.update() — a posted entry is a ledger
 * fact, reversed rather than edited) and replaces the lines wholesale, same shape as
 * create (updateJournalEntrySchema mirrors createJournalEntrySchema exactly). Only
 * ever opened from the tab for a `draft` entry, matching every other status-gated
 * edit action in this codebase. */
export function EditJournalEntryForm({
  entry,
  onDone,
}: {
  entry: JournalEntryWithLinesDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateEntry = useUpdateJournalEntry();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    JOURNAL_ENTRY_ENTITY_TYPE,
  );
  const [lines, setLines] = useState<JournalEntryLineDraft[]>(() =>
    entry.lines.map((line) => ({
      key: line.id,
      accountId: line.accountId,
      debit: line.debitAmount.amountMinorUnits !== '0'
        ? minorUnitsToDecimalString(line.debitAmount.amountMinorUnits)
        : '',
      credit: line.creditAmount.amountMinorUnits !== '0'
        ? minorUnitsToDecimalString(line.creditAmount.amountMinorUnits)
        : '',
      description: line.description ?? '',
      costCenterId: line.costCenterId ?? undefined,
    })),
  );
  const [linesError, setLinesError] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createJournalEntrySchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      entryDate: entry.entryDate,
      description: entry.description ?? '',
      notes: entry.notes ?? '',
      customFields: entry.customFields,
    },
  });

  useEffect(() => {
    form.reset({
      entryDate: entry.entryDate,
      description: entry.description ?? '',
      notes: entry.notes ?? '',
      customFields: entry.customFields,
    });
  }, [entry, form]);

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const { lines: preparedLines, error } = prepareLines(lines, t);
    if (!preparedLines) {
      setLinesError(error);
      return;
    }
    try {
      await updateEntry.mutateAsync({ id: entry.id, input: { ...headerValues, lines: preparedLines } });
      toast.success(t('accounting.journalEntries.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.updateError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="entryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.entryDate')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.description')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-2">
          <JournalEntryLineItemsEditor lines={lines} onChange={setLines} />
          <LinesBalanceSummary lines={lines} currency={entry.currency} />
          {linesError ? <p className="text-sm text-destructive">{linesError}</p> : null}
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {definitions && definitions.length > 0 ? (
          <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
        ) : null}
        <Button type="submit" disabled={updateEntry.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
