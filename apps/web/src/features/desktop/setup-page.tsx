import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { desktopSetupSchema, type LoginResponseDto } from '@erp-platform/contracts';
import { Button, Form, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from '@erp-platform/ui';

import { AuthLayout } from '../users-permissions/auth-layout';
import { apiPost, ApiError } from '../../lib/api-client';
import { useAuthStore } from '../../lib/auth-store';
import { runtimeInfoQueryKey, useRuntimeInfo } from '../../lib/runtime';

function buildSetupFormSchema(mismatchMessage: string) {
  return desktopSetupSchema
    .extend({ confirmPassword: z.string() })
    .refine((values) => values.password === values.confirmPassword, {
      path: ['confirmPassword'],
      message: mismatchMessage,
    });
}
type SetupFormValues = z.infer<ReturnType<typeof buildSetupFormSchema>>;

/**
 * First-run screen of the desktop build (POST /desktop/setup): the installer
 * ships no account, so whoever opens the app first creates the Owner and
 * names the company, then is signed straight in. Only reachable while the
 * API reports `needsSetup`; afterwards it redirects to the login page.
 */
export function DesktopSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: runtime, isPending } = useRuntimeInfo();
  const setTenantSchema = useAuthStore((state) => state.setTenantSchema);
  const setSession = useAuthStore((state) => state.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => buildSetupFormSchema(t('desktopSetup.passwordMismatch')), [t]);
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { companyName: '', ownerFullName: '', email: '', password: '', confirmPassword: '' },
  });

  if (isPending) return null;
  if (runtime?.mode !== 'desktop' || !runtime.needsSetup) return <Navigate to="/login" replace />;
  const tenantSchema = runtime.tenantSchema;

  async function onSubmit(formValues: SetupFormValues) {
    const values = {
      companyName: formValues.companyName,
      ownerFullName: formValues.ownerFullName,
      email: formValues.email,
      password: formValues.password,
    };
    setSubmitting(true);
    setFormError(null);
    setTenantSchema(tenantSchema);
    try {
      await apiPost('/desktop/setup', values, { skipAuth: true });
      await queryClient.invalidateQueries({ queryKey: runtimeInfoQueryKey });
      const result = await apiPost<LoginResponseDto>(
        '/auth/login',
        { email: values.email, password: values.password },
        { skipAuth: true },
      );
      if ('mfaRequired' in result) {
        navigate('/login', { replace: true });
        return;
      }
      setSession(result);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('desktopSetup.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  const fields: { name: keyof SetupFormValues; type?: string; autoComplete?: string }[] = [
    { name: 'companyName', autoComplete: 'organization' },
    { name: 'ownerFullName', autoComplete: 'name' },
    { name: 'email', type: 'email', autoComplete: 'username' },
    { name: 'password', type: 'password', autoComplete: 'new-password' },
    { name: 'confirmPassword', type: 'password', autoComplete: 'new-password' },
  ];

  return (
    <AuthLayout title={t('desktopSetup.title')} description={t('desktopSetup.subtitle')}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          {fields.map(({ name, type, autoComplete }) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(`desktopSetup.fields.${name}`)}</FormLabel>
                  <FormControl>
                    <Input type={type} autoComplete={autoComplete} {...field} />
                  </FormControl>
                  {name === 'password' ? (
                    <p className="text-xs text-muted-foreground">{t('desktopSetup.passwordHint')}</p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? t('desktopSetup.submitting') : t('desktopSetup.submit')}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
