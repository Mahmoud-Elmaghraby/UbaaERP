import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomerDto } from '@erp-platform/contracts';
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
  useHasPermission,
} from '@erp-platform/ui';
import { UserPlus } from 'lucide-react';

import { useCreateCustomer, useCustomers } from '../api/customers/queries';
import { useBaseCurrency } from '../../settings/queries';
import { ApiError } from '../../../lib/api-client';
import { normalizeForSearch } from '../../../lib/search-normalize';

/** Code / phone first (what a cashier types), then name. */
function searchCustomers(items: readonly CustomerDto[], query: string): CustomerDto[] {
  const raw = query.trim();
  const needle = normalizeForSearch(raw);
  const digits = raw.replace(/\D/g, '');
  const exact = items.filter((c) => c.code === raw || (digits.length >= 4 && (c.phone ?? '').replace(/\D/g, '').endsWith(digits)));
  const rest = items.filter(
    (c) => !exact.includes(c) && normalizeForSearch(`${c.code} ${c.name} ${c.phone ?? ''} ${c.contactPerson ?? ''}`).includes(needle),
  );
  return [...exact, ...rest];
}

/**
 * THE customer field of every sales document: searchable (code, name, phone),
 * active customers only, and a "+ new customer" that creates one with just a
 * name and a phone without leaving the document.
 */
export function CustomerPicker({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (customerId: string, customer: CustomerDto) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: customers } = useCustomers();
  const canCreate = useHasPermission('sales.manage');
  const [creating, setCreating] = useState(false);
  const active = (customers ?? []).filter((c) => c.isActive || c.id === value);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Combobox
        items={active}
        value={value}
        onValueChange={(id, customer) => onChange(id, customer)}
        getValue={(c) => c.id}
        getLabel={(c) => c.name}
        search={searchCustomers}
        renderItem={(c) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{c.code}</span>
            <span className="truncate">{c.name}</span>
            {c.phone ? <span dir="ltr" className="ms-auto shrink-0 text-xs text-muted-foreground">{c.phone}</span> : null}
          </span>
        )}
        placeholder={t('sales.customerPicker.placeholder')}
        searchPlaceholder={t('sales.customerPicker.search')}
        emptyText={t('common.noResults')}
        disabled={disabled}
        aria-label={t('sales.customerPicker.placeholder')}
      />
      {canCreate && !disabled ? (
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" title={t('sales.customerPicker.new')} onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" />
        </Button>
      ) : null}
      <QuickCustomerDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(customer) => onChange(customer.id, customer)}
      />
    </div>
  );
}

function QuickCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: CustomerDto) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateCustomer();
  const currency = useBaseCurrency();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  async function submit() {
    if (!name.trim()) return;
    try {
      const customer = await create.mutateAsync({ name: name.trim(), phone: phone.trim() || null, defaultCurrency: currency });
      toast.success(t('sales.customerPicker.created', { name: customer.name }));
      onCreated(customer);
      setName('');
      setPhone('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sales.customerPicker.new')}</DialogTitle>
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
            <Label htmlFor="quick-customer-name">{t('sales.customerPicker.name')}</Label>
            <Input id="quick-customer-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="quick-customer-phone">{t('sales.customerPicker.phone')}</Label>
            <Input id="quick-customer-phone" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{t('sales.customerPicker.moreLater')}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
