import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import {
  confirmTotpSchema,
  disableTotpSchema,
  type ConfirmTotpDto,
  type DisableTotpDto,
} from '@erp-platform/contracts';
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
} from '@erp-platform/ui';

import { ApiError } from '../../lib/api-client';
import {
  useConfirmTwoFactor,
  useDisableTwoFactor,
  useSetupTwoFactor,
  useTwoFactorStatus,
} from './queries';

/**
 * Optional TOTP two-factor authentication (claude/settings-module-
 * audit.md §2.5, Task 8) — a self-contained card on the profile page,
 * mirroring RevokeSessionsAction/ChangePasswordForm's colocation
 * convention in this same feature. Deliberately does NOT render a QR
 * code image: adding a QR-generation library is a real dependency
 * decision (CLAUDE.md §12 asks new dependencies to be justified) that
 * wasn't part of this task's scope — the secret and otpauth URI are
 * shown as plain, selectable text instead, which every mainstream
 * authenticator app also accepts via its own "enter code manually" /
 * "paste a setup link" option. A QR image would be a reasonable follow-up
 * once that dependency is explicitly approved.
 */
export function TwoFactorCard() {
  const { t } = useTranslation();
  const { data: status, isLoading } = useTwoFactorStatus();

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>{t('profile.twoFactor.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('profile.twoFactor.loading')}</p>
        ) : status?.enabled ? (
          <DisableTwoFactorFlow />
        ) : (
          <EnableTwoFactorFlow />
        )}
      </CardContent>
    </Card>
  );
}

type EnableStage =
  | { step: 'idle' }
  | { step: 'confirming'; secret: string; otpauthUri: string }
  | { step: 'backupCodes'; codes: string[] };

function EnableTwoFactorFlow() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<EnableStage>({ step: 'idle' });
  const setup = useSetupTwoFactor();
  const confirm = useConfirmTwoFactor();

  const confirmForm = useForm<ConfirmTotpDto>({
    resolver: zodResolver(confirmTotpSchema),
    defaultValues: { code: '' },
  });

  async function handleStart() {
    try {
      const result = await setup.mutateAsync();
      setStage({ step: 'confirming', secret: result.secret, otpauthUri: result.otpauthUri });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.twoFactor.setupError'));
    }
  }

  async function handleConfirm(values: ConfirmTotpDto) {
    try {
      const result = await confirm.mutateAsync(values);
      setStage({ step: 'backupCodes', codes: result.backupCodes });
      confirmForm.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.twoFactor.confirmError'));
    }
  }

  if (stage.step === 'idle') {
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">{t('profile.twoFactor.disabledDescription')}</p>
        <Button type="button" disabled={setup.isPending} onClick={() => void handleStart()}>
          {t('profile.twoFactor.enable')}
        </Button>
      </div>
    );
  }

  if (stage.step === 'confirming') {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{t('profile.twoFactor.scanInstructions')}</p>
        <div className="grid gap-1 rounded-md border bg-muted/40 p-3">
          <span className="text-xs text-muted-foreground">{t('profile.twoFactor.secretLabel')}</span>
          <code className="break-all text-sm font-medium" dir="ltr">
            {stage.secret}
          </code>
        </div>
        <Form {...confirmForm}>
          <form onSubmit={confirmForm.handleSubmit(handleConfirm)} className="grid gap-4">
            <FormField
              control={confirmForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('profile.twoFactor.codeLabel')}</FormLabel>
                  <FormControl>
                    <Input autoComplete="one-time-code" dir="ltr" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={confirm.isPending}>
              {t('profile.twoFactor.confirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStage({ step: 'idle' })}>
              {t('common.cancel')}
            </Button>
          </form>
        </Form>
      </div>
    );
  }

  // stage.step === 'backupCodes'
  return (
    <div className="grid gap-4">
      <p className="text-sm font-medium text-destructive">{t('profile.twoFactor.backupCodesWarning')}</p>
      <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3" dir="ltr">
        {stage.codes.map((code) => (
          <code key={code} className="text-sm">
            {code}
          </code>
        ))}
      </div>
      <Button type="button" onClick={() => setStage({ step: 'idle' })}>
        {t('profile.twoFactor.backupCodesDone')}
      </Button>
    </div>
  );
}

function DisableTwoFactorFlow() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const disable = useDisableTwoFactor();

  const form = useForm<DisableTotpDto>({
    resolver: zodResolver(disableTotpSchema),
    defaultValues: { password: '' },
  });

  async function onSubmit(values: DisableTotpDto) {
    try {
      await disable.mutateAsync(values);
      toast.success(t('profile.twoFactor.disableSuccess'));
      setShowForm(false);
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.twoFactor.disableError'));
    }
  }

  if (!showForm) {
    return (
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">{t('profile.twoFactor.enabledDescription')}</p>
        <Button type="button" variant="destructive" onClick={() => setShowForm(true)}>
          {t('profile.twoFactor.disable')}
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('profile.twoFactor.confirmPasswordLabel')}</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="destructive" disabled={disable.isPending}>
          {t('profile.twoFactor.disable')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
          {t('common.cancel')}
        </Button>
      </form>
    </Form>
  );
}
