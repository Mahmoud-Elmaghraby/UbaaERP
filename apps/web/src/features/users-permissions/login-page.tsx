import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AuthTokensDto, LoginResponseDto } from '@erp-platform/contracts';
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

const twoFactorFormSchema = z.object({
  code: z.string().min(6).max(12),
});
type TwoFactorFormValues = z.infer<typeof twoFactorFormSchema>;

/**
 * Two-step login when the account has TOTP 2FA enabled
 * (claude/settings-module-audit.md §2.5/Task 8): POST /auth/login can
 * come back as either a real session (AuthTokensDto) or a challenge
 * (`{ mfaRequired: true, challengeToken }`) — this component tracks
 * which "stage" it's in locally rather than as two separate routes,
 * since the challengeToken only ever makes sense as the direct
 * continuation of a just-submitted password, not as its own bookmarkable
 * URL a user could land on cold.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setTenantSchema = useAuthStore((state) => state.setTenantSchema);
  const setSession = useAuthStore((state) => state.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  const credentialsForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { tenantSchema: '', email: '', password: '' },
  });

  const twoFactorForm = useForm<TwoFactorFormValues>({
    resolver: zodResolver(twoFactorFormSchema),
    defaultValues: { code: '' },
  });

  async function onSubmitCredentials(values: LoginFormValues) {
    setSubmitting(true);
    setFormError(null);
    setTenantSchema(values.tenantSchema);

    try {
      const result = await apiPost<LoginResponseDto>(
        '/auth/login',
        { email: values.email, password: values.password },
        { skipAuth: true },
      );

      if ('mfaRequired' in result) {
        setChallengeToken(result.challengeToken);
        return;
      }

      setSession(result);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('auth.invalidCredentials'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitTwoFactor(values: TwoFactorFormValues) {
    if (!challengeToken) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const tokens = await apiPost<AuthTokensDto>(
        '/auth/login/verify-2fa',
        { challengeToken, code: values.code },
        { skipAuth: true },
      );
      setSession(tokens);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('auth.invalidTwoFactorCode'));
    } finally {
      setSubmitting(false);
    }
  }

  function backToCredentials() {
    setChallengeToken(null);
    setFormError(null);
    twoFactorForm.reset();
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
          <CardTitle>{challengeToken ? t('auth.twoFactorTitle') : t('auth.loginTitle')}</CardTitle>
          <CardDescription>
            {challengeToken ? t('auth.twoFactorSubtitle') : t('auth.loginSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {challengeToken ? (
            <Form {...twoFactorForm}>
              <form onSubmit={twoFactorForm.handleSubmit(onSubmitTwoFactor)} className="grid gap-4">
                <FormField
                  control={twoFactorForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.twoFactorCode')}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="one-time-code"
                          autoFocus
                          placeholder={t('auth.twoFactorCodePlaceholder')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError ? <p className="text-sm font-medium text-destructive">{formError}</p> : null}
                <Button type="submit" disabled={submitting} className="mt-2">
                  {submitting ? t('auth.submitting') : t('auth.submit')}
                </Button>
                <Button type="button" variant="ghost" onClick={backToCredentials}>
                  {t('auth.backToLogin')}
                </Button>
              </form>
            </Form>
          ) : (
            <>
              <Form {...credentialsForm}>
                <form onSubmit={credentialsForm.handleSubmit(onSubmitCredentials)} className="grid gap-4">
                  <FormField
                    control={credentialsForm.control}
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
                    control={credentialsForm.control}
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
                    control={credentialsForm.control}
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
              <Link
                to="/forgot-password"
                className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
              >
                {t('auth.forgotPasswordLink')}
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
