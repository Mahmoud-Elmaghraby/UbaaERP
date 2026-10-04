import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { changePasswordSchema, type ChangePasswordDto } from '@erp-platform/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  toast,
  PageHeader,
} from '@erp-platform/ui';

import { useAuthStore } from '../../lib/auth-store';
import { useChangeOwnPassword, useRevokeOwnSessions } from './queries';
import { ApiError } from '../../lib/api-client';
import { TwoFactorCard } from './two-factor-card';

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  return (
    <div className="grid gap-6">
      <div>
        <PageHeader title={t('profile.title')} />
        <p className="text-sm text-muted-foreground">{user?.fullName} — {user?.email}</p>
      </div>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>{t('profile.changePassword')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>{t('profile.sessionSecurity')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RevokeSessionsAction />
        </CardContent>
      </Card>

      <TwoFactorCard />
    </div>
  );
}

function RevokeSessionsAction() {
  const { t } = useTranslation();
  const clearSession = useAuthStore((state) => state.clearSession);
  const revokeSessions = useRevokeOwnSessions();

  async function handleRevoke() {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('profile.revokeSessionsConfirm'))) return;
    try {
      await revokeSessions.mutateAsync();
      toast.success(t('profile.revokeSessionsSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.revokeSessionsError'));
      return;
    }
    // This device's own session is revoked too (see useRevokeOwnSessions'
    // comment) — clear local state immediately rather than waiting for
    // the next failed silent refresh to discover it.
    clearSession();
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{t('profile.sessionSecurityDescription')}</p>
      <Button
        type="button"
        variant="destructive"
        disabled={revokeSessions.isPending}
        onClick={() => void handleRevoke()}
      >
        {t('profile.revokeSessions')}
      </Button>
    </div>
  );
}

function ChangePasswordForm() {
  const { t } = useTranslation();
  const changePassword = useChangeOwnPassword();

  const form = useForm<ChangePasswordDto>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  async function onSubmit(values: ChangePasswordDto) {
    try {
      await changePassword.mutateAsync(values);
      toast.success(t('profile.changeSuccess'));
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.changeError'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('profile.currentPassword')}</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('profile.newPassword')}</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={changePassword.isPending} className="mt-2">
          {t('profile.changePassword')}
        </Button>
      </form>
    </Form>
  );
}
