import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@erp-platform/ui';

import { apiPost, ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../lib/auth-store';

const forgotPasswordFormSchema = z.object({
  tenantSchema: z.string().min(1),
  email: z.string().email(),
});
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

/**
 * Same tenantSchema-header requirement as the login page — pre-auth
 * routes have no JWT yet to resolve a tenant from (see
 * auth.controller.ts's class comment). The response is always the same
 * generic success message regardless of whether the email matched a
 * real account (AccountAccessService.requestPasswordReset()'s own
 * anti-enumeration reasoning) — this page never reveals which.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const setTenantSchema = useAuthStore((state) => state.setTenantSchema);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { tenantSchema: '', email: '' },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setSubmitting(true);
    setFormError(null);
    setTenantSchema(values.tenantSchema);
    try {
      await apiPost('/auth/forgot-password', { email: values.email }, { skipAuth: true });
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('auth.forgotPasswordError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle>{t('auth.forgotPasswordTitle')}</CardTitle>
          <CardDescription>{t('auth.forgotPasswordSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-sm text-muted-foreground">{t('auth.forgotPasswordSent')}</p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <FormField
                  control={form.control}
                  name="tenantSchema"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.tenantSchema')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('auth.tenantSchemaPlaceholder')} {...field} />
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
                      <FormLabel>{t('auth.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
                <Button type="submit" disabled={submitting} className="mt-2">
                  {submitting ? t('auth.submitting') : t('auth.forgotPasswordSubmit')}
                </Button>
              </form>
            </Form>
          )}
          <Link to="/login" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
