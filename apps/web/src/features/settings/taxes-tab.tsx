import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import {
  createTaxRuleSchema,
  updateTaxRuleSchema,
  type CreateTaxRuleDto,
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('settings.tabs.taxes')}</p>
        <Can permission="settings.manage">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>{t('settings.taxes.newTaxRule')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.taxes.newTaxRule')}</DialogTitle>
              </DialogHeader>
              <CreateTaxRuleForm onDone={() => setCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.taxes.name')}</TableHead>
              <TableHead>{t('settings.taxes.rate')}</TableHead>
              <TableHead>{t('settings.taxes.status')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(taxRules ?? []).map((taxRule) => (
              <TableRow key={taxRule.id}>
                <TableCell className="font-medium">{taxRule.name}</TableCell>
                <TableCell>{taxRule.rate}%</TableCell>
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
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editing ? <EditTaxRuleForm taxRule={editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateTaxRuleForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createTaxRule = useCreateTaxRule();

  const form = useForm<CreateTaxRuleDto>({
    resolver: zodResolver(createTaxRuleSchema),
    defaultValues: { name: '', rate: 0, isActive: true },
  });

  async function onSubmit(values: CreateTaxRuleDto) {
    try {
      await createTaxRule.mutateAsync(values);
      toast.success(t('settings.taxes.createSuccess'));
      onDone();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.taxes.createError'));
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
                  step="0.01"
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
        <Button type="submit" disabled={createTaxRule.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

function EditTaxRuleForm({ taxRule, onDone }: { taxRule: TaxRuleDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateTaxRule = useUpdateTaxRule();

  const form = useForm<UpdateTaxRuleDto>({
    resolver: zodResolver(updateTaxRuleSchema),
    defaultValues: { name: taxRule.name, rate: taxRule.rate, isActive: taxRule.isActive },
  });

  async function onSubmit(values: UpdateTaxRuleDto) {
    try {
      await updateTaxRule.mutateAsync({ id: taxRule.id, input: values });
      toast.success(t('settings.taxes.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.taxes.updateError'));
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
                  step="0.01"
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
        <Button type="submit" disabled={updateTaxRule.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
