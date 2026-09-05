import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { updateEtaCredentialsSchema, type UpdateEtaCredentialsDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
  toast,
} from '@erp-platform/ui';

import { useEtaCredentials, useUpdateEtaCredentials } from '../../api/eta-credentials/queries';
import { ApiError } from '../../../../lib/api-client';

/**
 * Credential-storage readiness for Egypt's e-invoicing (ETA) integration — NOT the
 * submission engine itself. Per the master doc and this module's own status doc, the
 * actual ETA submission flow (building/signing/sending documents to ETA) is explicitly
 * out of scope and deliberately not built here; this screen only lets the tenant store
 * the credentials (client ID/secret, tax registration number, environment, document
 * version) that a future submission engine would read. Backed by
 * EtaCredentialsController — a GET+PATCH singleton, same shape as Settings' own
 * GeneralTab (currency), just owned by the Sales module and reached via a Sales route
 * (not nested under /settings) since it's Sales-specific config, not tenant-wide.
 *
 * clientSecret is write-only: the backend encrypts it at rest and never returns it back
 * (see EtaCredentialsDto.clientSecretConfigured — a boolean, not the secret itself), so
 * the field here always starts blank and blank-on-submit means "leave the stored secret
 * unchanged" (omitted from the PATCH body entirely, not sent as empty string).
 */
export function EtaCredentialsPage() {
  const { t } = useTranslation();
  const { data: credentials, isLoading } = useEtaCredentials();
  const updateCredentials = useUpdateEtaCredentials();

  // clientSecret is always a plain string in form state (blank means "leave the
  // stored secret unchanged" — see onSubmit below), unlike the wire schema's
  // nullable/optional shape, so the form uses its own narrower local schema for that
  // one field rather than the contract's updateEtaCredentialsSchema directly.
  const formSchema = updateEtaCredentialsSchema.omit({ clientSecret: true }).extend({ clientSecret: z.string() });

  const form = useForm<UpdateEtaCredentialsDto & { clientSecret: string }>({
    resolver: zodResolver(formSchema as z.ZodType<UpdateEtaCredentialsDto & { clientSecret: string }>),
    defaultValues: {
      clientId: '',
      clientSecret: '',
      taxRegistrationNumber: '',
      environment: 'preprod',
      documentVersion: '1.0',
      isEnabled: false,
    },
  });

  useEffect(() => {
    if (credentials) {
      form.reset({
        clientId: credentials.clientId ?? '',
        clientSecret: '',
        taxRegistrationNumber: credentials.taxRegistrationNumber ?? '',
        environment: credentials.environment,
        documentVersion: credentials.documentVersion,
        isEnabled: credentials.isEnabled,
      });
    }
  }, [credentials, form]);

  async function onSubmit(values: UpdateEtaCredentialsDto & { clientSecret: string }) {
    try {
      await updateCredentials.mutateAsync({
        clientId: values.clientId || undefined,
        // Blank means "leave unchanged" — omit entirely rather than sending "".
        clientSecret: values.clientSecret.trim() === '' ? undefined : values.clientSecret,
        taxRegistrationNumber: values.taxRegistrationNumber || undefined,
        environment: values.environment,
        documentVersion: values.documentVersion,
        isEnabled: values.isEnabled,
      });
      toast.success(t('sales.etaCredentials.saveSuccess'));
      form.setValue('clientSecret', '');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.etaCredentials.saveError'));
    }
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('sales.tabs.etaCredentials')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('sales.etaCredentials.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{t('sales.etaCredentials.notice')}</p>

          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-lg gap-4">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sales.etaCredentials.clientId')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sales.etaCredentials.clientSecret')}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        {credentials?.clientSecretConfigured
                          ? t('sales.etaCredentials.clientSecretConfiguredHint')
                          : t('sales.etaCredentials.clientSecretNotConfiguredHint')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxRegistrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sales.etaCredentials.taxRegistrationNumber')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="environment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sales.etaCredentials.environment')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="preprod">{t('sales.etaCredentials.environmentPreprod')}</SelectItem>
                          <SelectItem value="production">{t('sales.etaCredentials.environmentProduction')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="documentVersion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sales.etaCredentials.documentVersion')}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">{t('sales.etaCredentials.isEnabled')}</FormLabel>
                    </FormItem>
                  )}
                />
                {credentials ? (
                  <div>
                    <Badge variant={credentials.clientSecretConfigured ? 'default' : 'secondary'}>
                      {credentials.clientSecretConfigured
                        ? t('sales.etaCredentials.statusConfigured')
                        : t('sales.etaCredentials.statusNotConfigured')}
                    </Badge>
                  </div>
                ) : null}

                <Can permission="sales.manage">
                  <Button type="submit" disabled={updateCredentials.isPending} className="justify-self-start">
                    {t('common.save')}
                  </Button>
                </Can>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
