import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { updateTenantSettingsSchema, type UpdateTenantSettingsDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCompanyLogo, useTenantSettings, useUpdateTenantSettings } from './queries';
import { resizeImage } from '../../lib/image-resize';
import { ApiError } from '../../lib/api-client';

/**
 * The "General" tab (master doc §9.2 lists currency alongside branches/
 * numbering/templates/taxes as one tabbed Settings screen). Until now,
 * currencyCode was the ONLY field on tenant_settings (see
 * domain/tenant-settings.entity.ts). Competitive research (2026-09-12,
 * claude/competitive-differentiation-strategy.md) confirmed a currency-only
 * General tab is genuinely below the baseline every comparator ships
 * (company name/address/tax number are day-one setup fields elsewhere) —
 * migration 0070 added companyName/address/taxRegistrationNumber to close
 * that gap. All three are optional: a tenant shouldn't be blocked from
 * using the product while nobody's typed the tax number in yet.
 */
export function GeneralTab() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();

  const form = useForm<UpdateTenantSettingsDto>({
    resolver: zodResolver(updateTenantSettingsSchema),
    defaultValues: {
      currencyCode: '',
      companyName: '',
      address: '',
      taxRegistrationNumber: '',
      commercialRegister: '',
      phone: '',
      email: '',
      website: '',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        currencyCode: settings.currencyCode,
        companyName: settings.companyName ?? '',
        address: settings.address ?? '',
        taxRegistrationNumber: settings.taxRegistrationNumber ?? '',
        commercialRegister: settings.commercialRegister ?? '',
        phone: settings.phone ?? '',
        email: settings.email ?? '',
        website: settings.website ?? '',
      });
    }
  }, [settings, form]);

  async function onSubmit(values: UpdateTenantSettingsDto) {
    try {
      await updateSettings.mutateAsync({
        ...values,
        // Empty strings mean "not provided" here, not a literal blank
        // value worth persisting — store null so an unfilled field reads
        // as genuinely unset, not as a company named "".
        companyName: values.companyName?.trim() ? values.companyName.trim() : null,
        address: values.address?.trim() ? values.address.trim() : null,
        taxRegistrationNumber: values.taxRegistrationNumber?.trim()
          ? values.taxRegistrationNumber.trim()
          : null,
        commercialRegister: values.commercialRegister?.trim() || null,
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
        website: values.website?.trim() || null,
      });
      toast.success(t('settings.general.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.general.saveError'));
    }
  }

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.general.title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <CompanyLogoField logoUrl={settings?.logoUrl ?? null} />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-lg gap-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.general.companyName')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
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
                  <FormLabel>{t('settings.general.address')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxRegistrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.general.taxRegistrationNumber')}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="commercialRegister"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.general.commercialRegister')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} dir="auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.general.phone')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} dir="auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.general.email')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} dir="auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.general.website')}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} dir="auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="currencyCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.general.currencyCode')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={3} className="uppercase" placeholder="EGP" />
                  </FormControl>
                  <FormDescription>{t('settings.general.currencyCodeHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Can permission="settings.manage">
              <Button type="submit" disabled={updateSettings.isPending} className="justify-self-start">
                {t('common.save')}
              </Button>
            </Can>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

/** The logo printed on every document header (PNG / JPEG / WebP, ≤ 1 MB, resized in the browser). */
function CompanyLogoField({ logoUrl }: { logoUrl: string | null }) {
  const { t } = useTranslation();
  const { upload, remove } = useCompanyLogo();

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const resized = await resizeImage(file, 600, 0.92);
      await upload.mutateAsync(new File([resized], 'logo', { type: resized.type }));
      toast.success(t('settings.general.logoSaved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.general.saveError'));
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-40 items-center justify-center rounded-lg border bg-muted/30">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="max-h-16 max-w-36 object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">{t('settings.general.noLogo')}</span>
        )}
      </div>
      <Can permission="settings.manage">
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            {t('settings.general.uploadLogo')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          {logoUrl ? (
            <Button type="button" variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t('settings.general.removeLogo')}
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">{t('settings.general.logoHint')}</span>
        </div>
      </Can>
    </div>
  );
}
