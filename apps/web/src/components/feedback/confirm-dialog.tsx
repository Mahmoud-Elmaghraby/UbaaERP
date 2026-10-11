import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@erp-platform/ui';

export interface ConfirmOptions {
  /** Defaults to "تأكيد". */
  title?: string;
  /** Label of the confirming button (defaults to "تأكيد"). */
  confirmLabel?: string;
  /** 'danger' for destructive actions (delete, cancel, reverse…): red button and a warning icon. */
  tone?: 'default' | 'danger';
}

interface Request extends ConfirmOptions {
  message: string;
  resolve: (ok: boolean) => void;
}

let show: ((request: Request) => void) | null = null;

/**
 * The app's confirmation prompt — a styled, RTL dialog in place of the
 * browser's window.confirm(). Awaitable from any handler:
 *   if (!(await confirmDialog(t('x.deleteConfirm'), { tone: 'danger' }))) return;
 * Rendered by <ConfirmDialogHost /> (mounted once in AppProviders); without
 * a host (tests) it falls back to window.confirm.
 */
export function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show!({ ...options, message, resolve }));
}

export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const [request, setRequest] = useState<Request | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (next) => setRequest((current) => {
      current?.resolve(false); // a newer prompt replaces an unanswered one
      return next;
    });
    return () => {
      show = null;
    };
  }, []);

  function close(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
  }

  const danger = request?.tone === 'danger';
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          confirmRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {danger ? <AlertTriangle className="size-5 text-danger" aria-hidden="true" /> : null}
            {request?.title ?? t('common.confirmTitle')}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line text-sm leading-6 text-foreground">{request?.message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => close(false)}>
            {t('common.back')}
          </Button>
          <Button ref={confirmRef} variant={danger ? 'destructive' : 'default'} onClick={() => close(true)}>
            {request?.confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
