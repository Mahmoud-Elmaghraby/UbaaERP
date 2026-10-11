import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SalesChannelDto, SalesChannelKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
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

import { ApiError } from '../../lib/api-client';
import { formatAmount } from '../../lib/money';
import { useCustomers } from '../sales/api/customers/queries';
import { useTreasuryLookup } from '../treasury/api/queries';
import { useSalesChannels, useSaveSalesChannel, useUnpaidOrders } from './api';

const NONE = '__none__';

/** Sales › Channels: Jumia, Noon, the shop… and, per marketplace, the orders it hasn't paid yet. */
export function ChannelsPage() {
  const { t } = useTranslation();
  const { data: channels } = useSalesChannels();
  const [editing, setEditing] = useState<SalesChannelDto | 'new' | null>(null);
  const [unpaidFor, setUnpaidFor] = useState<SalesChannelDto | null>(null);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('channels.title')}
        description={t('channels.subtitle')}
        actions={
          <Can permission="sales.manage">
            <Button onClick={() => setEditing('new')}>{t('channels.add')}</Button>
          </Can>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('channels.code')}</TableHead>
              <TableHead>{t('channels.name')}</TableHead>
              <TableHead>{t('channels.kind')}</TableHead>
              <TableHead>{t('channels.customer')}</TableHead>
              <TableHead>{t('channels.treasury')}</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(channels ?? []).map((channel) => (
              <TableRow key={channel.id}>
                <TableCell dir="ltr" className="text-end font-mono text-xs">
                  {channel.code}
                </TableCell>
                <TableCell className="font-medium">
                  {channel.name} {!channel.isActive ? <Badge variant="neutral">{t('common.inactive')}</Badge> : null}
                </TableCell>
                <TableCell>{t(`channels.kinds.${channel.kind}`)}</TableCell>
                <TableCell>{channel.customerName ?? '—'}</TableCell>
                <TableCell>{channel.treasuryName ?? '—'}</TableCell>
                <TableCell className="flex justify-end gap-1">
                  {channel.kind === 'marketplace' ? (
                    <Button variant="outline" size="sm" onClick={() => setUnpaidFor(channel)}>
                      {t('channels.unpaid')}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(channel)}>
                    {t('common.edit')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(channels ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {t('channels.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <ChannelDialog value={editing} onClose={() => setEditing(null)} />
      <UnpaidOrdersDialog channel={unpaidFor} onClose={() => setUnpaidFor(null)} />
    </div>
  );
}

function ChannelDialog({ value, onClose }: { value: SalesChannelDto | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveSalesChannel();
  const { data: customers } = useCustomers();
  const { data: treasuries } = useTreasuryLookup();
  const existing = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({ code: '', name: '', kind: 'marketplace' as SalesChannelKindDto, customerId: '', treasuryId: '', isActive: true });
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setForm({
      code: existing?.code ?? '',
      name: existing?.name ?? '',
      kind: existing?.kind ?? 'marketplace',
      customerId: existing?.customerId ?? '',
      treasuryId: existing?.treasuryId ?? '',
      isActive: existing?.isActive ?? true,
    });
  }
  const marketplace = form.kind === 'marketplace';

  async function submit() {
    try {
      await save.mutateAsync({
        id: existing?.id,
        input: {
          code: form.code,
          name: form.name,
          kind: form.kind,
          customerId: marketplace ? form.customerId || null : null,
          treasuryId: marketplace ? form.treasuryId || null : null,
          isActive: form.isActive,
        },
      });
      toast.success(t('channels.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? t('common.edit') : t('channels.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('channels.code')}</Label>
              <Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="JUMIA" />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label>{t('channels.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="جوميا" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('channels.kind')}</Label>
            <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind: kind as SalesChannelKindDto })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="marketplace">{t('channels.kinds.marketplace')}</SelectItem>
                <SelectItem value="direct">{t('channels.kinds.direct')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {marketplace ? (
            <>
              <div className="grid gap-1.5">
                <Label>{t('channels.customer')}</Label>
                <Select value={form.customerId || NONE} onValueChange={(id) => setForm({ ...form, customerId: id === NONE ? '' : id })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('channels.choose')}</SelectItem>
                    {(customers ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('channels.customerHint')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('channels.treasury')}</Label>
                <Select value={form.treasuryId || NONE} onValueChange={(id) => setForm({ ...form, treasuryId: id === NONE ? '' : id })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('channels.choose')}</SelectItem>
                    {(treasuries ?? []).map((tr) => (
                      <SelectItem key={tr.id} value={tr.id}>
                        {tr.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('channels.treasuryHint')}</p>
              </div>
            </>
          ) : null}
          {existing ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v === true })} />
              {t('common.active')}
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submit}
              disabled={save.isPending || !form.code.trim() || !form.name.trim() || (marketplace && (!form.customerId || !form.treasuryId))}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UnpaidOrdersDialog({ channel, onClose }: { channel: SalesChannelDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: orders, isLoading } = useUnpaidOrders(channel?.id);
  const total = (orders ?? []).reduce((sum, o) => sum + BigInt(o.outstanding.amountMinorUnits), 0n);
  return (
    <Dialog open={channel !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('channels.unpaidTitle', { name: channel?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('channels.unpaidHint')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('channels.orderRef')}</TableHead>
              <TableHead>{t('channels.invoice')}</TableHead>
              <TableHead>{t('channels.date')}</TableHead>
              <TableHead>{t('channels.age')}</TableHead>
              <TableHead>{t('channels.outstanding')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orders ?? []).map((o) => (
              <TableRow key={o.salesInvoiceId}>
                <TableCell dir="ltr" className="text-end font-mono text-xs">
                  {o.externalReference ?? '—'}
                </TableCell>
                <TableCell>{o.invoiceNumber}</TableCell>
                <TableCell>{o.invoiceDate}</TableCell>
                <TableCell>
                  <Badge variant={o.ageDays > 14 ? 'danger' : o.ageDays > 7 ? 'warning' : 'neutral'}>{t('channels.days', { count: o.ageDays })}</Badge>
                </TableCell>
                <TableCell className="tabular">{formatAmount(o.outstanding.amountMinorUnits)}</TableCell>
              </TableRow>
            ))}
            {!isLoading && (orders ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t('channels.allPaid')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {(orders ?? []).length > 0 ? (
          <p className="text-sm font-medium">
            {t('channels.unpaidTotal')}: <span className="tabular">{formatAmount(total.toString())}</span>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
