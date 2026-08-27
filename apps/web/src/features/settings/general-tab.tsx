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
  toast,
} from '@erp-platform/ui';

import { useTenantSettings, useUpdateTenantSettings } from './queries';
import { ApiError } from '../../lib/api-client';

/**
 * The "General" tab (master doc §9.2 lists currency alongside branches/
 * numbering/templates/taxes as one tabbed Settings screen). Only
 * currencyCode exists on tenant_settings today (see
 * domain/tenant-settings.entity.ts) — this form reflects exactly that,
 * not a larger settings surface that doesn't exist on the backend yet.
 */
export function GeneralTab() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();

  const form = useForm<UpdateTenantSettingsDto>({
    resolver: zodResolver(updateTenantSettingsSchema),
    defaultValues: { currencyCode: '' },
  });

  useEffect(() => {
    if (settings) form.reset({ currencyCode: settings.currencyCode });
  }, [settings, form]);

  async function onSubmit(values: UpdateTenantSettingsDto) {
    try {
      await updateSettings.mutateAsync(values);
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
        <CardTitle>{t('settings.general.currency')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-sm gap-4">
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
