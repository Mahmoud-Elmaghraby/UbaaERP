import { useTranslation } from 'react-i18next';
import { Combobox } from '@erp-platform/ui';

import { Amount } from '../amount';
import { formatDate } from '../../lib/format-date';
import { normalizeForSearch } from '../../lib/search-normalize';

export interface PickableDocument {
  id: string;
  number: string;
  date?: string | null;
  /** Customer / supplier name. */
  party?: string | null;
  /** Total in minor units, for the row. */
  amountMinorUnits?: string | null;
  currency?: string | null;
}

/**
 * Searchable picker for a source document (an order to deliver, a delivery to
 * return, an invoice to collect): number, date, party and amount on each row.
 */
export function DocumentPicker({
  documents,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  documents: readonly PickableDocument[];
  value: string | null | undefined;
  onChange: (id: string, document: PickableDocument) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Combobox
      items={documents}
      value={value}
      onValueChange={onChange}
      getValue={(d) => d.id}
      getLabel={(d) => (d.party ? `${d.number} — ${d.party}` : d.number)}
      search={(items, query) => {
        const needle = normalizeForSearch(query);
        return items.filter((d) => normalizeForSearch(`${d.number} ${d.party ?? ''}`).includes(needle));
      }}
      renderItem={(d) => (
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 font-medium tabular-nums">{d.number}</span>
          {d.date ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate(d.date)}</span> : null}
          <span className="truncate text-muted-foreground">{d.party ?? ''}</span>
          {d.amountMinorUnits ? <Amount value={d.amountMinorUnits} currency={d.currency ?? undefined} className="ms-auto shrink-0 text-xs" /> : null}
        </span>
      )}
      placeholder={placeholder ?? t('documents.pickDocument')}
      searchPlaceholder={t('documents.searchDocument')}
      emptyText={t('common.noResults')}
      maxResults={80}
      disabled={disabled}
      className={className}
    />
  );
}
