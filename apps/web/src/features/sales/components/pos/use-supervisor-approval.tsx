import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, ShieldCheck } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@erp-platform/ui';

import { ApiError } from '../../../../lib/api-client';

/** Thrown by run() when the cashier closes the PIN prompt — callers just stop, no error toast. */
export class ApprovalCancelledError extends Error {
  constructor() {
    super('approval cancelled');
    this.name = 'ApprovalCancelledError';
  }
}

export function isApprovalCancelled(err: unknown): boolean {
  return err instanceof ApprovalCancelledError;
}

function errorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { code?: unknown } | null;
  return body && typeof body.code === 'string' ? body.code : null;
}

interface PromptState {
  open: boolean;
  error: string | null;
  busy: boolean;
  attempt: number;
}

/**
 * Supervisor approval on the till (migration 0113). `run(fn)` calls `fn()`
 * once without a PIN; when the API answers POS_APPROVAL.REQUIRED it asks for
 * a supervisor's PIN and retries the SAME request with it (a wrong PIN keeps
 * the prompt open with the error; POS_APPROVAL.LOCKED and any other error
 * reject as usual, so the caller toasts err.message). Users holding
 * pos.supervise are never asked — the API simply never answers REQUIRED.
 *
 *   const approval = useSupervisorApproval();
 *   await approval.run((pin) => api.post(..., { ...body, approvalPin: pin }));
 *   return <>{...}{approval.dialog}</>;
 */
export function useSupervisorApproval(): {
  run: <T>(fn: (approvalPin?: string) => Promise<T>) => Promise<T>;
  dialog: ReactNode;
} {
  const [state, setState] = useState<PromptState>({ open: false, error: null, busy: false, attempt: 0 });
  const pending = useRef<((pin: string | null) => void) | null>(null);

  const ask = useCallback((error: string | null) => {
    return new Promise<string | null>((resolve) => {
      pending.current = resolve;
      setState((prev) => ({ open: true, error, busy: false, attempt: prev.attempt + 1 }));
    });
  }, []);

  const answer = useCallback((pin: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    if (pin === null) setState((prev) => ({ ...prev, open: false, error: null, busy: false }));
    else setState((prev) => ({ ...prev, busy: true }));
    resolve?.(pin);
  }, []);

  const run = useCallback(
    async <T,>(fn: (approvalPin?: string) => Promise<T>): Promise<T> => {
      try {
        return await fn(undefined);
      } catch (err) {
        if (errorCode(err) !== 'POS_APPROVAL.REQUIRED') throw err;
      }
      let error: string | null = null;
      for (;;) {
        const pin = await ask(error);
        if (pin === null) throw new ApprovalCancelledError();
        try {
          const result = await fn(pin);
          setState((prev) => ({ ...prev, open: false, error: null, busy: false }));
          return result;
        } catch (err) {
          const code = errorCode(err);
          if (code === 'POS_APPROVAL.INVALID_PIN' || code === 'POS_APPROVAL.PIN_FORMAT') {
            error = (err as ApiError).message;
            continue;
          }
          setState((prev) => ({ ...prev, open: false, error: null, busy: false }));
          throw err;
        }
      }
    },
    [ask],
  );

  const dialog = (
    <SupervisorPinDialog
      open={state.open}
      error={state.error}
      attempt={state.attempt}
      busy={state.busy}
      onSubmit={(pin) => answer(pin)}
      onCancel={() => answer(null)}
    />
  );

  return { run, dialog };
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

function SupervisorPinDialog({
  open,
  error,
  attempt,
  busy,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  error: string | null;
  attempt: number;
  busy: boolean;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const valid = /^\d{4,6}$/.test(pin);

  // A fresh prompt (or a wrong PIN) starts from an empty field.
  const [lastKey, setLastKey] = useState<string>('');
  const key = `${open}|${attempt}`;
  if (key !== lastKey) {
    setLastKey(key);
    setPin('');
  }

  function press(k: (typeof KEYPAD)[number]) {
    if (k === 'clear') setPin('');
    else if (k === 'back') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < 6 ? p + k : p));
  }

  function submit() {
    if (valid && !busy) onSubmit(pin);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {t('pos.approval.title')}
          </DialogTitle>
          <DialogDescription>{t('pos.approval.description')}</DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          dir="ltr"
          className="h-14 text-center text-2xl tracking-[0.5em]"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          aria-label={t('pos.approval.pin')}
        />
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {KEYPAD.map((k) => (
            <Button
              key={k}
              type="button"
              variant={k === 'clear' || k === 'back' ? 'ghost' : 'outline'}
              className="h-12 text-lg tabular-nums"
              onClick={() => press(k)}
              aria-label={k === 'back' ? t('pos.approval.backspace') : k === 'clear' ? t('pos.approval.clear') : k}
            >
              {k === 'back' ? <Delete className="h-5 w-5" /> : k === 'clear' ? 'C' : k}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button className="h-11" onClick={submit} disabled={!valid || busy}>
            {t('pos.approval.approve')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
