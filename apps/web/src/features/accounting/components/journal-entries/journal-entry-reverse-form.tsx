import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { reverseJournalEntrySchema, type ReverseJournalEntryDto } from '@erp-platform/contracts';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, toast } from '@erp-platform/ui';

import { useReverseJournalEntry } from '../../api/journal-entries/queries';
import { ApiError } from '../../../../lib/api-client';

/**
 * reverse() creates a brand-new draft entry with every line's debit/credit swapped
 * (JournalEntriesService.reverse(), see that method's own doc comment) — not a status
 * change on the entry being reversed, which is why this is its own small form rather
 * than a plain window.confirm() action like post()/cancel(). Both fields are optional
 * — an omitted reversalDate defaults to today server-side, an omitted description
 * defaults to a generated one referencing the original entry.
 */
export function ReverseJournalEntryForm({ entryId, onDone }: { entryId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const reverseEntry = useReverseJournalEntry();

  const form = useForm<ReverseJournalEntryDto>({
    resolver: zodResolver(reverseJournalEntrySchema),
    defaultValues: { reversalDate: '', description: '' },
  });

  async function onSubmit(values: ReverseJournalEntryDto) {
    try {
      await reverseEntry.mutateAsync({
        id: entryId,
        input: {
          reversalDate: values.reversalDate || undefined,
          description: values.description || undefined,
        },
      });
      toast.success(t('accounting.journalEntries.reverseSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.journalEntries.reverseError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <p className="text-sm text-muted-foreground">{t('accounting.journalEntries.reverseDescription')}</p>
        <FormField
          control={form.control}
          name="reversalDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.journalEntries.reversalDate')}</FormLabel>
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
        <Button type="submit" disabled={reverseEntry.isPending}>
          {t('accounting.journalEntries.reverse')}
        </Button>
      </form>
    </Form>
  );
}
