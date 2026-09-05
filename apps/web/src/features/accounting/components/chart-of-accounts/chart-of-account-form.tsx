import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createChartOfAccountSchema,
  updateChartOfAccountSchema,
  type ChartOfAccountDto,
  type CreateChartOfAccountDto,
  type UpdateChartOfAccountDto,
} from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  Checkbox,
  CustomFieldsFormSection,
  Form,
  FormControl,
  FormDescription,
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
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import {
  useChartOfAccounts,
  useCreateChartOfAccount,
  useUpdateChartOfAccount,
} from '../../api/chart-of-accounts/queries';
import { ApiError } from '../../../../lib/api-client';

const CHART_OF_ACCOUNT_ENTITY_TYPE = 'chart_of_account';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;
const NORMAL_BALANCES = ['debit', 'credit'] as const;

/**
 * Create only — accountType/normalBalance/parentId/isGroup are all immutable after
 * creation (updateChartOfAccountSchema deliberately omits them — see that schema's own
 * comment: changing an account's type or place in the tree after it may already be in
 * use would silently corrupt reporting). `parentId` is preset and read-only when
 * opened as "add child account" from a group row in the tree; otherwise it defaults
 * to a top-level account (null), though in practice every non-root account needs a
 * group parent — ChartOfAccountsService enforces that server-side.
 */
export function CreateChartOfAccountForm({
  parentId,
  onDone,
}: {
  parentId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createAccount = useCreateChartOfAccount();
  const { data: accounts } = useChartOfAccounts();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    CHART_OF_ACCOUNT_ENTITY_TYPE,
  );

  const parent = useMemo(() => accounts?.find((a) => a.id === parentId) ?? null, [accounts, parentId]);
  const groupAccounts = useMemo(() => (accounts ?? []).filter((a) => a.isGroup), [accounts]);

  const formSchema = useMemo(() => {
    const staticSchema = createChartOfAccountSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<CreateChartOfAccountDto>({
    resolver: zodResolver(formSchema as z.ZodType<CreateChartOfAccountDto>),
    defaultValues: {
      code: '',
      name: '',
      accountType: parent?.accountType ?? 'asset',
      normalBalance: parent?.normalBalance ?? 'debit',
      parentId: parentId ?? null,
      isGroup: false,
      notes: '',
      customFields: {},
    },
  });

  async function onSubmit(values: CreateChartOfAccountDto) {
    try {
      await createAccount.mutateAsync({
        ...values,
        notes: values.notes || undefined,
      });
      toast.success(t('accounting.chartOfAccounts.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.chartOfAccounts.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        {parent ? (
          <p className="text-sm text-muted-foreground">
            {t('accounting.chartOfAccounts.parentAccount')}: {parent.code} — {parent.name}
          </p>
        ) : (
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.parentAccount')}</FormLabel>
                <Select
                  value={field.value ?? '__none__'}
                  onValueChange={(value) => field.onChange(value === '__none__' ? null : value)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">{t('accounting.chartOfAccounts.noParent')}</SelectItem>
                    {groupAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} — {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.code')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="accountType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.accountType')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`accounting.chartOfAccounts.accountTypeValue.${type}`)}
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
            name="normalBalance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.normalBalance')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {NORMAL_BALANCES.map((side) => (
                      <SelectItem key={side} value={side}>
                        {t(`accounting.chartOfAccounts.normalBalanceValue.${side}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="isGroup"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="grid gap-1 leading-none">
                <FormLabel>{t('accounting.chartOfAccounts.isGroup')}</FormLabel>
                <FormDescription>{t('accounting.chartOfAccounts.isGroupDescription')}</FormDescription>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.chartOfAccounts.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {definitions && definitions.length > 0 ? (
          <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
        ) : null}
        <Button type="submit" disabled={createAccount.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Edit only touches code/name/isActive/notes/customFields — everything else is
 * immutable, matching updateChartOfAccountSchema exactly (see its own comment).
 * The five system root accounts can never be deactivated (ChartOfAccountsService),
 * so isActive is hidden entirely for those rather than rendered-but-rejected.
 */
export function EditChartOfAccountForm({
  account,
  onDone,
}: {
  account: ChartOfAccountDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const updateAccount = useUpdateChartOfAccount();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    CHART_OF_ACCOUNT_ENTITY_TYPE,
  );

  const formSchema = useMemo(() => {
    const staticSchema = updateChartOfAccountSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<UpdateChartOfAccountDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateChartOfAccountDto>),
    defaultValues: {
      code: account.code,
      name: account.name,
      isActive: account.isActive,
      notes: account.notes ?? '',
      customFields: account.customFields,
    },
  });

  useEffect(() => {
    form.reset({
      code: account.code,
      name: account.name,
      isActive: account.isActive,
      notes: account.notes ?? '',
      customFields: account.customFields,
    });
  }, [account, form]);

  async function onSubmit(values: UpdateChartOfAccountDto) {
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        input: { ...values, notes: values.notes || undefined },
      });
      toast.success(t('accounting.chartOfAccounts.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.chartOfAccounts.updateError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.code')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} disabled={account.isSystem} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.chartOfAccounts.name')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {!account.isSystem ? (
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start gap-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel>{t('accounting.chartOfAccounts.isActive')}</FormLabel>
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.chartOfAccounts.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {definitions && definitions.length > 0 ? (
          <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
        ) : null}
        <Button type="submit" disabled={updateAccount.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
