import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createBranchSchema, type CreateBranchDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  buildCustomFieldsSchema,
  Can,
  CustomFieldsFormSection,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useBranches, useCreateBranch, useCustomFieldDefinitions } from './queries';
import { ApiError } from '../../lib/api-client';

const BRANCH_ENTITY_TYPE = 'branch';

export function BranchesTab() {
  const { t } = useTranslation();
  const { data: branches, isLoading } = useBranches();
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('settings.tabs.branches')}</p>
        <Can permission="settings.manage">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>{t('settings.branches.newBranch')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.branches.newBranch')}</DialogTitle>
              </DialogHeader>
              <CreateBranchForm onDone={() => setOpen(false)} />
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
              <TableHead>{t('settings.branches.name')}</TableHead>
              <TableHead>{t('settings.branches.code')}</TableHead>
              <TableHead>{t('settings.branches.address')}</TableHead>
              <TableHead>{t('settings.branches.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(branches ?? []).map((branch) => (
              <TableRow key={branch.id}>
                <TableCell className="font-medium">{branch.name}</TableCell>
                <TableCell>{branch.code}</TableCell>
                <TableCell>{branch.address ?? '-'}</TableCell>
                <TableCell>
                  <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                    {branch.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(branches ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Live consumer of the dynamic form engine (CLAUDE.md §7): the static
 * branch fields (name/code/address) come from createBranchSchema as
 * usual, while the custom_fields section is built entirely at runtime
 * from the backend's CustomFieldDefinitionDto[] for entityType="branch"
 * — no hardcoded knowledge here of what custom fields exist.
 */
function CreateBranchForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createBranch = useCreateBranch();
  const { data: definitions, isLoading: definitionsLoading } =
    useCustomFieldDefinitions(BRANCH_ENTITY_TYPE);

  const formSchema = useMemo(() => {
    const staticSchema = createBranchSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  // formSchema's customFields shape is only known at runtime (built from
  // the fetched definitions), so it can't structurally match
  // CreateBranchDto's `customFields: z.record(z.unknown())` at the type
  // level even though both validate the same data at runtime — hence the cast.
  const form = useForm<CreateBranchDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateBranchDto>),
    defaultValues: { name: '', code: '', address: '', isActive: true, customFields: {} },
  });

  async function onSubmit(values: CreateBranchDto) {
    try {
      await createBranch.mutateAsync(values);
      toast.success(t('settings.branches.createSuccess'));
      onDone();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.branches.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.branches.name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.branches.code')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.branches.address')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">
              {t('settings.branches.customFields')}
            </p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createBranch.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
