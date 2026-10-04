import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resetPasswordSchema, type ResetPasswordDto } from '@erp-platform/contracts';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@erp-platform/ui';

import { AuthLayout } from './auth-layout';
import { apiPost, ApiError } from '../../lib/api-client';

/**
 * Handles BOTH "forgot password" links and "you've been invited" links —
 * both are just a token in the query string redeemed against the same
 * /auth/reset-password endpoint (AccountAccessService.consumeToken()).
 * The page doesn't need to know or care which one this is.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordDto>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: '' },
  });

  async function onSubmit(values: ResetPasswordDto) {
    setSubmitting(true);
    setFormError(null);
    try {
      await apiPost('/auth/reset-password', values, { skipAuth: true });
      navigate('/login', { replace: true, state: { resetSuccess: true } });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('auth.resetPasswordError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title={t('auth.resetPasswordTitle')}>
        <p className="text-sm text-destructive">{t('auth.resetPasswordMissingToken')}</p>
        <Link
          to="/forgot-password"
          className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
        >
          {t('auth.forgotPasswordTitle')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.resetPasswordTitle')} description={t('auth.resetPasswordSubtitle')}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <input type="hidden" {...form.register('token')} />
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('auth.newPassword')}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? t('auth.submitting') : t('auth.resetPasswordSubmit')}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
