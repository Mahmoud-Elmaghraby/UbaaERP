import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import type { PosPinStatusDto, RemovePosPinDto, SetPosPinDto } from '@erp-platform/contracts';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, toast } from '@erp-platform/ui';

import { ApiError, apiGet, apiPost } from '../../lib/api-client';
import { confirmDialog } from '../../components/feedback/confirm-dialog';

const PIN_KEY = ['users', 'me', 'pos-pin'];

function usePosPinStatus() {
  return useQuery({ queryKey: PIN_KEY, queryFn: () => apiGet<PosPinStatusDto>('/users/me/pos-pin') });
}

function useSetPosPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetPosPinDto) => apiPost<void>('/users/me/pos-pin', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PIN_KEY }),
  });
}

function useRemovePosPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RemovePosPinDto) => apiPost<void>('/users/me/pos-pin/remove', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PIN_KEY }),
  });
}

const PIN_RE = /^\d{4,6}$/;

/**
 * رقم المشرف السري (PIN) — what a supervisor types on a cashier's till to
 * approve a big discount, a return or cash out (migration 0113). Shown only
 * to users who may supervise (pos.supervise); setting or removing it asks for
 * the account password.
 */
export function PosPinCard() {
  const { t } = useTranslation();
  const { data: status } = usePosPinStatus();
  const setPin = useSetPosPin();
  const removePin = useRemovePosPin();
  const [editing, setEditing] = useState(false);
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!status?.canSupervise) return null;

  function reset() {
    setEditing(false);
    setPinValue('');
    setConfirm('');
    setPassword('');
    setError(null);
  }

  async function save() {
    setError(null);
    if (!PIN_RE.test(pin)) return setError(t('profile.posPin.formatError'));
    if (pin !== confirm) return setError(t('profile.posPin.mismatch'));
    if (!password) return setError(t('profile.posPin.passwordRequired'));
    try {
      await setPin.mutateAsync({ pin, currentPassword: password });
      toast.success(t('profile.posPin.saved'));
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function remove() {
    setError(null);
    if (!password) return setError(t('profile.posPin.passwordRequired'));
    if (!(await confirmDialog(t('profile.posPin.removeConfirm'), { tone: 'danger' }))) return;
    try {
      await removePin.mutateAsync({ currentPassword: password });
      toast.success(t('profile.posPin.removed'));
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t('profile.posPin.title')}
          <Badge variant={status.hasPin ? 'success' : 'neutral'} dot>
            {status.hasPin ? t('profile.posPin.set') : t('profile.posPin.notSet')}
          </Badge>
        </CardTitle>
        <CardDescription>{t('profile.posPin.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {editing ? (
          <>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="pos-pin">{t('profile.posPin.newPin')}</label>
              <Input
                id="pos-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                value={pin}
                onChange={(e) => setPinValue(digits(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="pos-pin-confirm">{t('profile.posPin.confirmPin')}</label>
              <Input
                id="pos-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
                value={confirm}
                onChange={(e) => setConfirm(digits(e.target.value))}
              />
            </div>
          </>
        ) : null}
        {editing || status.hasPin ? (
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="pos-pin-password">{t('profile.currentPassword')}</label>
            <Input
              id="pos-pin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button onClick={() => void save()} disabled={setPin.isPending}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" onClick={reset}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setEditing(true)}>{status.hasPin ? t('profile.posPin.change') : t('profile.posPin.setup')}</Button>
              {status.hasPin ? (
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => void remove()}
                  disabled={removePin.isPending}
                >
                  {t('profile.posPin.remove')}
                </Button>
              ) : null}
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('profile.posPin.hint')}</p>
      </CardContent>
    </Card>
  );
}
