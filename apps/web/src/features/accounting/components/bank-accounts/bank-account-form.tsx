import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  type BankAccountDto,
  type CreateBankAccountDto,
  type UpdateBankAccountDto,
} from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  Checkbox,
  CustomFieldsFormSection,
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
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions, useTenantSettings } from '../../../settings/queries';
import { useCreateBankAccount, useUpdateBankAccount } from '../../api/bank-accounts/queries';
import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { ApiError } from '../../../../lib/api-client';

const BANK_ACCOUNT_ENTITY_TYPE = 'bank_account';

/** Create-time-only shape: openingBalance is entered as a decimal string in this
 * form and converted to minor units on submit (never floating-point arithmetic on
 * the amount itself — decimalToMinorUnits does the same BigInt-safe conversion
 * every other money input in this codebase uses). */
// openingBalance and openingBalanceDate are both plain strings at the form layer,
// deliberately excluded from the Zod-validated shape below (rather than validated
// against openingBalanceMinorUnits' integer-string regex or isoDate's YYYY-MM-DD
// regex) — an empty string is a valid "not provided" for both, and RHF's default
// value for an untouched optional field is always '' (never undefined), which would
// otherwise fail those regexes at zodResolver validation time before onSubmit ever
// runs. Converted to the real DTO shape by hand in onSubmit instead, same as every
// other optional-money-or-date field in this codebase.
type CreateFormValues = Omit<CreateBankAccountDto, 'openingBalanceMinorUnits' | 'openingBalanceDate'> & {
  openingBalance: string;
  openingBalanceDate: string;
};

/**
 * Create only touches chartOfAccountId/currency — both immutable after creation (see
 * UpdateBankAccountInput's own comment: repointing which GL account or currency a
 * bank account represents after real ledger activity may exist would silently corrupt
 * the register/reconciliation history). The GL account picker is restricted to
 * postable accounts, same rule the backend itself enforces via
 * ChartOfAccountsService.assertPostable() in BankAccountsService.create().
 */
export function CreateBankAccountForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createBankAccount = useCreateBankAccount();
  const postableAccounts = usePostableAccounts();
  const { data: tenantSettings } = useTenantSettings();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    BANK_ACCOUNT_ENTITY_TYPE,
  );

  const formSchema = useMemo(() => {
    const staticSchema = createBankAccountSchema
      .omit({ customFields: true, openingBalanceMinorUnits: true, openingBalanceDate: true })
      .extend({ openingBalance: z.string(), openingBalanceDate: z.string() });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<CreateFormValues>),
    defaultValues: {
      name: '',
      bankName: '',
      accountNumber: '',
      iban: '',
      currency: tenantSettings?.currencyCode ?? 'EGP',
      chartOfAccountId: '',
      openingBalance: '',
      openingBalanceDate: '',
      notes: '',
      customFields: {},
    },
  });

  async function onSubmit(values: CreateFormValues) {
    let openingBalanceMinorUnits: string | undefined;
    try {
      openingBalanceMinorUnits = values.openingBalance.trim() === '' ? undefined : decimalToMinorUnits(values.openingBalance);
    } catch {
      form.setError('openingBalance', { message: t('accounting.bankAccounts.openingBalanceError') });
      return;
    }
    try {
      await createBankAccount.mutateAsync({
        ...values,
        iban: values.iban || undefined,
        notes: values.notes || undefined,
        openingBalanceDate: values.openingBalanceDate || undefined,
        openingBalanceMinorUnits,
      });
      toast.success(t('accounting.bankAccounts.createSuccess'));
      form.reset();
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.bankAccounts.createError'));
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.bankName')}</FormLabel>
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
            name="accountNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.accountNumber')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="iban"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.iban')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="chartOfAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.chartOfAccount')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('accounting.journalEntries.selectAccount')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {postableAccounts.map((account) => (
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
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.currency')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={3} className="uppercase" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="openingBalance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.openingBalance')}</FormLabel>
                <FormControl>
                  <Input type="number" min={0} step="any" inputMode="decimal" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="openingBalanceDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.openingBalanceDate')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.bankAccounts.notes')}</FormLabel>
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
        <Button type="submit" disabled={createBankAccount.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}

/** Edit only touches name/bankName/accountNumber/iban/isActive/notes/customFields —
 * chartOfAccountId/currency/openingBalance are all immutable after creation (see
 * updateBankAccountSchema's own comment). */
export function EditBankAccountForm({ bankAccount, onDone }: { bankAccount: BankAccountDto; onDone: () => void }) {
  const { t } = useTranslation();
  const updateBankAccount = useUpdateBankAccount();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    BANK_ACCOUNT_ENTITY_TYPE,
  );

  const formSchema = useMemo(() => {
    const staticSchema = updateBankAccountSchema.omit({ customFields: true });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<UpdateBankAccountDto>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateBankAccountDto>),
    defaultValues: {
      name: bankAccount.name,
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      iban: bankAccount.iban ?? '',
      isActive: bankAccount.isActive,
      notes: bankAccount.notes ?? '',
      customFields: bankAccount.customFields,
    },
  });

  useEffect(() => {
    form.reset({
      name: bankAccount.name,
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      iban: bankAccount.iban ?? '',
      isActive: bankAccount.isActive,
      notes: bankAccount.notes ?? '',
      customFields: bankAccount.customFields,
    });
  }, [bankAccount, form]);

  async function onSubmit(values: UpdateBankAccountDto) {
    try {
      await updateBankAccount.mutateAsync({
        id: bankAccount.id,
        input: { ...values, iban: values.iban || undefined, notes: values.notes || undefined },
      });
      toast.success(t('accounting.bankAccounts.updateSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.bankAccounts.updateError'));
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.name')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.bankName')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="accountNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.accountNumber')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="iban"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('accounting.bankAccounts.iban')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('accounting.bankAccounts.chartOfAccount')}: {bankAccount.currency} —{' '}
          {t('accounting.bankAccounts.openingBalance')}:{' '}
          {minorUnitsToDecimalString(bankAccount.openingBalance.amountMinorUnits)} {bankAccount.currency}
        </p>
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value ?? true} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel>{t('accounting.bankAccounts.isActive')}</FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounting.bankAccounts.notes')}</FormLabel>
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
        <Button type="submit" disabled={updateBankAccount.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
