import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createJournalEntrySchema,
  type CreateJournalEntryDto,
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

import { useBaseCurrency, useCustomFieldDefinitions } from '../../../settings/queries';
import { useCreateJournalEntry, useJournalEntry, useUpdateJournalEntry } from '../../api/journal-entries/queries';
import { minorUnitsToDecimalString } from '../../../../lib/money';
import { ApiError } from '../../../../lib/api-client';
import { todayIso } from '../../../../lib/format-date';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { createEmptyLine, JournalEntryLineItemsEditor, prepareLines, type JournalEntryLineDraft } from './journal-entry-line-items-editor';

const JOURNAL_ENTRY_ENTITY_TYPE = 'journal_entry';
type HeaderFormValues = Omit<CreateJournalEntryDto, 'lines'>;

function linesFromEntry(entry: JournalEntryWithLinesDto): JournalEntryLineDraft[] {
  return entry.lines.map((line) => ({
    key: line.id,
    accountId: line.accountId,
    debit: line.debitAmount.amountMinorUnits === '0' ? '' : minorUnitsToDecimalString(line.debitAmount.amountMinorUnits),
    credit: line.creditAmount.amountMinorUnits === '0' ? '' : minorUnitsToDecimalString(line.creditAmount.amountMinorUnits),
    description: line.description ?? '',
    costCenterId: line.costCenterId ?? undefined,
  }));
}

/** /accounting/journal-entries/new and /:id/edit — a manual entry as a full page. */
export function JournalEntryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: entry, isLoading } = useJournalEntry(id);
  const { isLoading: definitionsLoading } = useCustomFieldDefinitions(JOURNAL_ENTRY_ENTITY_TYPE);
  if ((id && isLoading) || definitionsLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <JournalEntryEditor entry={id ? entry : undefined} />;
}

function JournalEntryEditor({ entry }: { entry: JournalEntryWithLinesDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const baseCurrency = useBaseCurrency();
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const { data: definitions } = useCustomFieldDefinitions(JOURNAL_ENTRY_ENTITY_TYPE);
  const [lines, setLines] = useState<JournalEntryLineDraft[]>(() =>
    entry ? linesFromEntry(entry) : [createEmptyLine(), createEmptyLine()],
  );
  const [linesError, setLinesError] = useState<string | null>(null);
  const currency = entry?.currency ?? baseCurrency;

  const formSchema = useMemo(() => {
    const staticSchema = createJournalEntrySchema.omit({ lines: true, customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      entryDate: entry?.entryDate ?? todayIso(),
      description: entry?.description ?? '',
      notes: entry?.notes ?? '',
      customFields: entry?.customFields ?? {},
    },
  });

  const saving = createEntry.isPending || updateEntry.isPending;

  async function onSubmit(headerValues: HeaderFormValues) {
    setLinesError(null);
    const { lines: preparedLines, error } = prepareLines(lines, t);
    if (!preparedLines) {
      setLinesError(error);
      return;
    }
    try {
      const saved = entry
        ? await updateEntry.mutateAsync({ id: entry.id, input: { ...headerValues, lines: preparedLines } })
        : await createEntry.mutateAsync({ ...headerValues, lines: preparedLines });
      toast.success(t(entry ? 'accounting.journalEntries.updateSuccess' : 'accounting.journalEntries.createSuccess'));
      navigate(`/accounting/journal-entries/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.createError'));
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={entry ? `/accounting/journal-entries/${entry.id}` : '/accounting/journal-entries'}
          backLabel={t('accounting.tabs.journalEntries')}
          eyebrow={t('accounting.tabs.journalEntries')}
          title={entry ? t('accounting.journalEntries.editTitle', { number: entry.entryNumber }) : t('accounting.journalEntries.newTitle')}
          actions={
            <>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saving} title="Ctrl+S">
                {t('accounting.journalEntries.saveDraft')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard>
                <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
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
                          <Input {...field} value={field.value ?? ''} placeholder={t('accounting.journalEntries.descriptionPlaceholder')} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard title={t('accounting.journalEntries.lines')} description={t('accounting.journalEntries.linesHint')} flush>
                <JournalEntryLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
                {linesError ? <p className="px-5 pb-4 text-sm text-destructive">{linesError}</p> : null}
              </SectionCard>

              <SectionCard>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('accounting.journalEntries.notes')}</FormLabel>
                      <FormControl>
                        <Textarea rows={2} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {definitions && definitions.length > 0 ? (
                  <div className="mt-4">
                    <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
                  </div>
                ) : null}
              </SectionCard>
            </>
          }
        />
      </form>
    </Form>
  );
}
