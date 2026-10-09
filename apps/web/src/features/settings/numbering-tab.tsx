import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import {
  createNumberingSequenceSchema,
  updateNumberingSequenceSchema,
  type CreateNumberingSequenceDto,
  type NumberingSequenceDto,
  type UpdateNumberingSequenceDto,
} from '@erp-platform/contracts';
import {
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import {
  useBranches,
  useCreateNumberingSequence,
  useDeleteNumberingSequence,
  useNumberingSequences,
  useUpdateNumberingSequence,
} from './queries';
import { ApiError } from '../../lib/api-client';

const TENANT_WIDE = '__tenant_wide__';

/** Document types by module, in the order the screen lists them (the API creates every one). */
const NUMBERING_GROUPS: { group: string; types: string[] }[] = [
  { group: 'master', types: ['product', 'customer', 'supplier'] },
  { group: 'sales', types: ['quotation', 'sales_order', 'delivery', 'sales_invoice', 'sales_return', 'sales_credit_note', 'payment_received'] },
  {
    group: 'purchases',
    types: ['purchase_requisition', 'request_for_quotation', 'purchase_order', 'goods_receipt', 'purchase_invoice', 'purchase_return', 'purchase_debit_note', 'supplier_payment'],
  },
  { group: 'inventory', types: ['stock_opening', 'stock_transfer', 'stock_adjustment', 'stock_count'] },
  { group: 'treasury', types: ['treasury_expense', 'treasury_income', 'treasury_transfer'] },
  { group: 'accounting', types: ['journal_entry'] },
];
const KNOWN_TYPES = NUMBERING_GROUPS.flatMap((g) => g.types);
/** Internal counters that aren't document numbers. */
const HIDDEN_TYPES = new Set(['product_barcode']);

function sample(sequence: NumberingSequenceDto): string {
  return `${sequence.prefix ?? ''}${String(sequence.nextNumber).padStart(sequence.paddingLength, '0')}`;
}

export function NumberingTab() {
  const { t } = useTranslation();
  const { data: sequences, isLoading } = useNumberingSequences();
  const { data: branches } = useBranches();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<NumberingSequenceDto | null>(null);
  const deleteSequence = useDeleteNumberingSequence();

  const typeLabel = (type: string) => t(`settings.numbering.types.${type}`, { defaultValue: type });
  const visible = (sequences ?? []).filter((sequence) => !HIDDEN_TYPES.has(sequence.documentType));
  const groups = [
    ...NUMBERING_GROUPS.map(({ group, types }) => ({
      group,
      rows: visible
        .filter((sequence) => types.includes(sequence.documentType))
        .sort((a, b) => types.indexOf(a.documentType) - types.indexOf(b.documentType)),
    })),
    { group: 'other', rows: visible.filter((sequence) => !KNOWN_TYPES.includes(sequence.documentType)) },
  ].filter((g) => g.rows.length > 0);

  const branchName = (branchId: string | null) =>
    branchId
      ? (branches?.find((b) => b.id === branchId)?.name ?? branchId)
      : t('settings.numbering.tenantWide');

  async function handleDelete(id: string) {
    if (!window.confirm(t('settings.numbering.deleteConfirm'))) return;
    try {
      await deleteSequence.mutateAsync(id);
      toast.success(t('settings.numbering.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-end">
        <Can permission="settings.manage">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>{t('settings.numbering.newSequence')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.numbering.newSequence')}</DialogTitle>
              </DialogHeader>
              <CreateSequenceForm onDone={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.numbering.documentType')}</TableHead>
                <TableHead>{t('settings.numbering.branch')}</TableHead>
                <TableHead>{t('settings.numbering.prefix')}</TableHead>
                <TableHead>{t('settings.numbering.nextNumber')}</TableHead>
                <TableHead>{t('settings.numbering.paddingLength')}</TableHead>
                <TableHead>{t('settings.numbering.sample')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.flatMap(({ group, rows }) => [
                <TableRow key={`g-${group}`} className="bg-subtle hover:bg-subtle">
                  <TableCell colSpan={7} className="py-2 text-xs font-semibold text-muted-foreground">
                    {t(`settings.numbering.groups.${group}`)}
                  </TableCell>
                </TableRow>,
                ...rows.map((sequence) => (
                <TableRow key={sequence.id}>
                  <TableCell className="font-medium">{typeLabel(sequence.documentType)}</TableCell>
                  <TableCell>{branchName(sequence.branchId)}</TableCell>
                  <TableCell dir="ltr" className="text-end font-mono text-xs">{sequence.prefix ?? '-'}</TableCell>
                  <TableCell>{sequence.nextNumber}</TableCell>
                  <TableCell>{sequence.paddingLength}</TableCell>
                  <TableCell dir="ltr" className="text-end font-mono text-xs">{sample(sequence)}</TableCell>
                  <TableCell>
                    <Can permission="settings.manage">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(sequence)}>
                            {t('common.edit')}
                          </DropdownMenuItem>
                          {/* A tenant-wide sequence would come back from 1 — only branch overrides are removable. */}
                          {sequence.branchId ? (
                            <DropdownMenuItem onSelect={() => handleDelete(sequence.id)}>
                              {t('common.delete')}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </TableCell>
                </TableRow>
                )),
              ])}
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editing ? <EditSequenceForm sequence={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateSequenceForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createSequence = useCreateNumberingSequence();
  const { data: branches } = useBranches();

  const form = useForm<CreateNumberingSequenceDto>({
    resolver: zodResolver(createNumberingSequenceSchema),
    defaultValues: {
      documentType: '',
      branchId: null,
      prefix: '',
      nextNumber: 1,
      paddingLength: 5,
    },
  });

  async function onSubmit(values: CreateNumberingSequenceDto) {
    try {
      await createSequence.mutateAsync(values);
      toast.success(t('settings.numbering.createSuccess'));
      onDone();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.numbering.createError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="documentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.numbering.documentType')}</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {KNOWN_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`settings.numbering.types.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.numbering.branch')}</FormLabel>
              <Select
                value={field.value ?? TENANT_WIDE}
                onValueChange={(value) => field.onChange(value === TENANT_WIDE ? null : value)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={TENANT_WIDE}>{t('settings.numbering.tenantWide')}</SelectItem>
                  {(branches ?? []).map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="prefix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.numbering.prefix')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} placeholder="INV-" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nextNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.numbering.nextNumber')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="paddingLength"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.numbering.paddingLength')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={createSequence.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

function EditSequenceForm({
  sequence,
  onDone,
}: {
  sequence: NumberingSequenceDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateSequence = useUpdateNumberingSequence();

  const form = useForm<UpdateNumberingSequenceDto>({
    resolver: zodResolver(updateNumberingSequenceSchema),
    defaultValues: {
      prefix: sequence.prefix,
      nextNumber: sequence.nextNumber,
      paddingLength: sequence.paddingLength,
    },
  });

  async function onSubmit(values: UpdateNumberingSequenceDto) {
    try {
      await updateSequence.mutateAsync({ id: sequence.id, input: values });
      toast.success(t('settings.numbering.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.numbering.updateError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="prefix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.numbering.prefix')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nextNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.numbering.nextNumber')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="paddingLength"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.numbering.paddingLength')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={updateSequence.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
