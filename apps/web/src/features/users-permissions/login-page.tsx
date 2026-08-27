import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AuthTokensDto } from '@erp-platform/contracts';
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

const loginFormSchema = z.object({
  tenantSchema: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});
type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setTenantSchema = useAuthStore((state) => state.setTenantSchema);
  const setSession = useAuthStore((state) => state.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { tenantSchema: '', email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitting(true);
    setFormError(null);
    setTenantSchema(values.tenantSchema);

    try {
      const tokens = await apiPost<AuthTokensDto>(
        '/auth/login',
        { email: values.email, password: values.password },
        { skipAuth: true },
      );
      setSession(tokens);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('auth.invalidCredentials'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-xl font-bold text-primary-foreground">
            أ
          </span>
          <p className="text-sm font-semibold tracking-tight text-muted-foreground">
            {t('app.name')}
          </p>
          <CardTitle>{t('auth.loginTitle')}</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.password')}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? t('auth.submitting') : t('auth.submit')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
