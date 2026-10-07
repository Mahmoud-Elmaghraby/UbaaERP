import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import {
  createTaxRuleSchema,
  taxKindSchema,
  taxRuleScopeSchema,
  type CreateTaxRuleDto,
  type TaxKindDto,
  type TaxRuleDto,
  type UpdateTaxRuleDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Checkbox,
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

import { useCreateTaxRule, useDeleteTaxRule, useTaxRules, useUpdateTaxRule } from './queries';
import { ApiError } from '../../lib/api-client';

export function TaxesTab() {
  const { t } = useTranslation();
  const { data: taxRules, isLoading } = useTaxRules();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRuleDto | null>(null);
  const deleteTaxRule = useDeleteTaxRule();

  async function handleDelete(id: string) {
    if (!window.confirm(t('settings.taxes.deleteConfirm'))) return;
    try {
      await deleteTaxRule.mutateAsync(id);
      toast.success(t('settings.taxes.deleteSuccess'));
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
              <Button>{t('settings.taxes.newTaxRule')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.taxes.newTaxRule')}</DialogTitle>
              </DialogHeader>
              <TaxRuleForm onDone={() => setCreateOpen(false)} />
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
                <TableHead>{t('settings.taxes.name')}</TableHead>
                <TableHead>{t('settings.taxes.kind')}</TableHead>
                <TableHead>{t('settings.taxes.rate')}</TableHead>
                <TableHead>{t('settings.taxes.scope')}</TableHead>
                <TableHead>{t('settings.taxes.etaCode')}</TableHead>
                <TableHead>{t('settings.taxes.status')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(taxRules ?? []).map((taxRule) => (
                <TableRow key={taxRule.id}>
                  <TableCell className="font-medium">{taxRule.name}</TableCell>
                  <TableCell>{t(`settings.taxes.kinds.${taxRule.kind}`)}</TableCell>
                  <TableCell>{taxRule.rate}%</TableCell>
                  <TableCell>{t(`settings.taxes.scopes.${taxRule.scope}`)}</TableCell>
                  <TableCell dir="ltr" className="font-mono text-xs">
                    {[taxRule.etaType, taxRule.etaSubtype].filter(Boolean).join(' / ') || '—'}
                  </TableCell>
                  <TableCell>
                    {taxRule.isActive ? (
                      <Badge>{t('common.active')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('common.inactive')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Can permission="settings.manage">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(taxRule)}>
                            {t('common.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleDelete(taxRule.id)}>
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
              {(taxRules ?? []).length === 0 ? (
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
          {editing ? <TaxRuleForm taxRule={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const KINDS = taxKindSchema.options;
const SCOPES = taxRuleScopeSchema.options;
/** Suggested ETA codes per kind — the field stays free text. */
const ETA_TYPE_BY_KIND: Record<TaxKindDto, string> = { vat: 'T1', table: 'T2', withholding: 'T4' };

/** One form for create and edit (the edit form just starts from the rule). */
function TaxRuleForm({ taxRule, onDone }: { taxRule?: TaxRuleDto; onDone: () => void }) {
  const { t } = useTranslation();
  const createTaxRule = useCreateTaxRule();
  const updateTaxRule = useUpdateTaxRule();
  const pending = createTaxRule.isPending || updateTaxRule.isPending;

  const form = useForm<CreateTaxRuleDto>({
    resolver: zodResolver(createTaxRuleSchema),
    defaultValues: {
      name: taxRule?.name ?? '',
      rate: taxRule?.rate ?? 14,
      isActive: taxRule?.isActive ?? true,
      kind: taxRule?.kind ?? 'vat',
      scope: taxRule?.scope ?? 'both',
      etaType: taxRule?.etaType ?? 'T1',
      etaSubtype: taxRule?.etaSubtype ?? 'V009',
    },
  });

  async function onSubmit(values: CreateTaxRuleDto) {
    const input = { ...values, etaType: values.etaType || null, etaSubtype: values.etaSubtype || null };
    try {
      if (taxRule) {
        await updateTaxRule.mutateAsync({ id: taxRule.id, input: input as UpdateTaxRuleDto });
        toast.success(t('settings.taxes.updateSuccess'));
      } else {
        await createTaxRule.mutateAsync(input);
        toast.success(t('settings.taxes.createSuccess'));
        form.reset();
      }
      onDone();
    } catch (err) {
      const fallback = taxRule ? 'settings.taxes.updateError' : 'settings.taxes.createError';
      toast.error(err instanceof ApiError ? err.message : t(fallback));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.taxes.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.taxes.kind')}</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    form.setValue('etaType', ETA_TYPE_BY_KIND[value as TaxKindDto]);
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {t(`settings.taxes.kinds.${kind}`)}
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
            name="rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.taxes.rate')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.001"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="scope"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.taxes.scope')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SCOPES.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {t(`settings.taxes.scopes.${scope}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="etaType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.taxes.etaType')}</FormLabel>
                <FormControl>
                  <Input dir="ltr" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="etaSubtype"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.taxes.etaSubtype')}</FormLabel>
                <FormControl>
                  <Input dir="ltr" placeholder="V009 / W010" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">{t('settings.taxes.status')}</FormLabel>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
