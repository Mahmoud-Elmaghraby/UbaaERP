import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RecurringEntryDto, RecurringFrequencyDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@erp-platform/ui';
import { Trash2 } from 'lucide-react';

import { useDeleteRecurringEntry, useRecurringEntries, useSaveRecurringEntry } from '../../api/accounting-completion/queries';
import { ApiError } from '../../../../lib/api-client';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { useBaseCurrency } from '../../../settings/queries';
import { DocumentBody, DocumentHeaderBar, InfoGrid, SectionCard } from '../../../../components/document/document-layout';
import {
  createEmptyLine,
  draftsFromLines,
  JournalEntryLineItemsEditor,
  prepareLines,
  type JournalEntryLineDraft,
} from '../journal-entries/journal-entry-line-items-editor';

const FREQUENCIES: RecurringFrequencyDto[] = ['monthly', 'quarterly', 'yearly'];

/** /accounting/recurring-entries/new and /:id. */
export function RecurringEntryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useRecurringEntries();
  if (id && isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  const entry = id ? data?.find((e) => e.id === id) : undefined;
  return <RecurringEntryEditor key={entry?.id ?? 'new'} entry={entry} />;
}

function RecurringEntryEditor({ entry }: { entry: RecurringEntryDto | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useBaseCurrency();
  const save = useSaveRecurringEntry();
  const remove = useDeleteRecurringEntry();
  const [name, setName] = useState(entry?.name ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequencyDto>(entry?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(entry?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(entry?.endDate ?? '');
  const [autoPost, setAutoPost] = useState(entry?.autoPost ?? false);
  const [isActive, setIsActive] = useState(entry?.isActive ?? true);
  const [lines, setLines] = useState<JournalEntryLineDraft[]>(() =>
    entry ? draftsFromLines(entry.lines) : [createEmptyLine(), createEmptyLine()],
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    if (name.trim() === '') {
      setError(t('accounting.recurring.nameRequired'));
      return;
    }
    const prepared = prepareLines(lines, t);
    if (!prepared.lines) {
      setError(prepared.error);
      return;
    }
    try {
      await save.mutateAsync({
        id: entry?.id ?? null,
        input: {
          name: name.trim(),
          description: description.trim() || null,
          frequency,
          startDate,
          endDate: endDate || null,
          autoPost,
          isActive,
          lines: prepared.lines,
        },
      });
      toast.success(t('accounting.recurring.saved'));
      navigate('/accounting/recurring-entries');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!entry || !(await confirmDialog(t('accounting.recurring.deleteConfirm', { name: entry.name }), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(entry.id);
      navigate('/accounting/recurring-entries');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <form onSubmit={submit}>
      <DocumentHeaderBar
        backTo="/accounting/recurring-entries"
        backLabel={t('accounting.tabs.recurring')}
        eyebrow={t('accounting.tabs.recurring')}
        title={entry ? entry.name : t('accounting.recurring.new')}
        actions={
          <Can permission="accounting.manage">
            {entry ? (
              <Button type="button" variant="ghost" onClick={onDelete} disabled={remove.isPending}>
                <Trash2 className="me-1 h-4 w-4" />
                {t('common.delete')}
              </Button>
            ) : null}
            <Button type="submit" disabled={save.isPending} title="Ctrl+S">
              {t('common.save')}
            </Button>
          </Can>
        }
      />
      <DocumentBody
        main={
          <>
            <SectionCard>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="re-name">{t('accounting.recurring.name')}</Label>
                  <Input id="re-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accounting.recurring.namePlaceholder')} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="re-desc">{t('accounting.journalEntries.description')}</Label>
                  <Input id="re-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t('accounting.recurring.frequency')}</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringFrequencyDto)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {t(`accounting.recurring.frequencies.${f}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="re-start">{t('accounting.recurring.startDate')}</Label>
                    <Input id="re-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="re-end">{t('accounting.recurring.endDate')}</Label>
                    <Input id="re-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={autoPost} onCheckedChange={(v) => setAutoPost(v === true)} />
                  {t('accounting.recurring.autoPost')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
                  {t('common.active')}
                </label>
              </div>
            </SectionCard>

            <SectionCard title={t('accounting.journalEntries.lines')} description={t('accounting.recurring.linesHint')} flush>
              <JournalEntryLineItemsEditor lines={lines} onChange={setLines} currency={currency} />
              {error ? <p className="px-5 pb-4 text-sm text-destructive">{error}</p> : null}
            </SectionCard>
          </>
        }
        side={
          entry ? (
            <SectionCard title={t('accounting.recurring.schedule')}>
              <InfoGrid
                items={[
                  { label: t('accounting.recurring.nextRun'), value: entry.isActive ? formatDate(entry.nextRunDate) : '—' },
                  { label: t('accounting.recurring.lastEntry'), value: entry.lastEntryId ? (
                    <Link className="text-primary hover:underline" to={`/accounting/journal-entries/${entry.lastEntryId}`}>
                      {t('accounting.recurring.openLastEntry')}
                    </Link>
                  ) : '—' },
                ]}
              />
            </SectionCard>
          ) : undefined
        }
      />
    </form>
  );
}
