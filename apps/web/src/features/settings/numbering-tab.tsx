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

export function NumberingTab() {
  const { t } = useTranslation();
  const { data: sequences, isLoading } = useNumberingSequences();
  const { data: branches } = useBranches();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<NumberingSequenceDto | null>(null);
  const deleteSequence = useDeleteNumberingSequence();

  const branchName = (branchId: string | null) =>
    branchId ? branches?.find((b) => b.id === branchId)?.name ?? branchId : t('settings.numbering.tenantWide');

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('settings.tabs.numbering')}</p>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.numbering.documentType')}</TableHead>
              <TableHead>{t('settings.numbering.branch')}</TableHead>
              <TableHead>{t('settings.numbering.prefix')}</TableHead>
              <TableHead>{t('settings.numbering.nextNumber')}</TableHead>
              <TableHead>{t('settings.numbering.paddingLength')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sequences ?? []).map((sequence) => (
              <TableRow key={sequence.id}>
                <TableCell className="font-medium">{sequence.documentType}</TableCell>
                <TableCell>{branchName(sequence.branchId)}</TableCell>
                <TableCell>{sequence.prefix ?? '-'}</TableCell>
                <TableCell>{sequence.nextNumber}</TableCell>
                <TableCell>{sequence.paddingLength}</TableCell>
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
                        <DropdownMenuItem onSelect={() => handleDelete(sequence.id)}>
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
            {(sequences ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
    defaultValues: { documentType: '', branchId: null, prefix: '', nextNumber: 1, paddingLength: 5 },
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
              <FormControl>
                <Input {...field} placeholder="sales_invoice" />
              </FormControl>
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
