import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
  toast,
} from '@erp-platform/ui';
import { UserPlus } from 'lucide-react';

import { ApiError } from '../../lib/api-client';
import { normalizeForSearch } from '../../lib/search-normalize';

/** What a customer or a supplier has in common for picking one. */
export interface PickableParty {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  contactPerson: string | null;
  isActive: boolean;
}

export interface PartyPickerLabels {
  placeholder: string;
  search: string;
  new: string;
  name: string;
  phone: string;
  created: (name: string) => string;
  moreLater: string;
}

/** Code / phone first (what a cashier types), then name. */
function searchParties<T extends PickableParty>(items: readonly T[], query: string): T[] {
  const raw = query.trim();
  const needle = normalizeForSearch(raw);
  const digits = raw.replace(/\D/g, '');
  const exact = items.filter(
    (p) => p.code === raw || (digits.length >= 4 && (p.phone ?? '').replace(/\D/g, '').endsWith(digits)),
  );
  const rest = items.filter(
    (p) => !exact.includes(p) && normalizeForSearch(`${p.code} ${p.name} ${p.phone ?? ''} ${p.contactPerson ?? ''}`).includes(needle),
  );
  return [...exact, ...rest];
}

/**
 * The shared party field behind CustomerPicker (sales) and SupplierPicker (purchases): searchable
 * by code, name and phone, active parties only (plus the current value), and an optional
 * "+ new" that creates one with just a name and a phone without leaving the document.
 */
export function PartyPicker<T extends PickableParty>({
  items,
  value,
  onChange,
  labels,
  onCreate,
  className,
  disabled,
}: {
  items: readonly T[] | undefined;
  value: string | null | undefined;
  onChange: (id: string, party: T) => void;
  labels: PartyPickerLabels;
  /** Quick create; omitted (e.g. no permission) hides the "+" button. */
  onCreate?: (input: { name: string; phone: string | null }) => Promise<T>;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const active = (items ?? []).filter((p) => p.isActive || p.id === value);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Combobox
        items={active}
        value={value}
        onValueChange={(id, party) => onChange(id, party)}
        getValue={(p) => p.id}
        getLabel={(p) => p.name}
        search={searchParties}
        renderItem={(p) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{p.code}</span>
            <span className="truncate">{p.name}</span>
            {p.phone ? <span dir="ltr" className="ms-auto shrink-0 text-xs text-muted-foreground">{p.phone}</span> : null}
          </span>
        )}
        placeholder={labels.placeholder}
        searchPlaceholder={labels.search}
        emptyText={t('common.noResults')}
        disabled={disabled}
        aria-label={labels.placeholder}
      />
      {onCreate && !disabled ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          title={labels.new}
          onClick={() => setCreating(true)}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      ) : null}
      {onCreate ? (
        <QuickPartyDialog
          open={creating}
          onOpenChange={setCreating}
          labels={labels}
          onCreate={onCreate}
          onCreated={(party) => onChange(party.id, party)}
        />
      ) : null}
    </div>
  );
}

function QuickPartyDialog<T extends PickableParty>({
  open,
  onOpenChange,
  labels,
  onCreate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: PartyPickerLabels;
  onCreate: (input: { name: string; phone: string | null }) => Promise<T>;
  onCreated: (party: T) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const party = await onCreate({ name: name.trim(), phone: phone.trim() || null });
      toast.success(labels.created(party.name));
      onCreated(party);
      setName('');
      setPhone('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{labels.new}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="quick-party-name">{labels.name}</Label>
            <Input id="quick-party-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="quick-party-phone">{labels.phone}</Label>
            <Input id="quick-party-phone" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{labels.moreLater}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
