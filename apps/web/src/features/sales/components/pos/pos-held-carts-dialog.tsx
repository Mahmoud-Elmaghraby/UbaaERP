import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PauseCircle, Play, Trash2 } from 'lucide-react';
import type { PosHeldCartDto } from '@erp-platform/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { Amount } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { ApiError } from '../../../../lib/api-client';
import { formatDateTime } from '../../../../lib/format-date';
import { usePosHeldCarts, useTakePosHeldCart } from '../../api/pos/queries';

/**
 * المعلّقة — the shift's parked sales. Resume takes the cart off the list
 * first (DELETE; a 404 means another till already took it) and only then
 * loads it, so one parked sale can never be rung up twice. With items in the
 * current cart, the cashier picks: park the current one first, or replace it.
 */
export function PosHeldCartsDialog({
  sessionId,
  open,
  onOpenChange,
  cartHasItems,
  onHoldCurrent,
  onResume,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartHasItems: boolean;
  /** Parks the current cart; resolves false when that failed. */
  onHoldCurrent: () => Promise<boolean>;
  onResume: (cart: PosHeldCartDto) => void;
}) {
  const { t } = useTranslation();
  const { data: carts, isLoading } = usePosHeldCarts(sessionId);
  const take = useTakePosHeldCart(sessionId);
  const [choosing, setChoosing] = useState<PosHeldCartDto | null>(null);

  async function takeCart(cart: PosHeldCartDto): Promise<boolean> {
    try {
      await take.mutateAsync(cart.id);
      return true;
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 404
          ? t('pos.held.alreadyTaken')
          : err instanceof ApiError
            ? err.message
            : t('common.error'),
      );
      return false;
    }
  }

  async function resume(cart: PosHeldCartDto, mode: 'direct' | 'holdFirst' | 'replace') {
    if (mode === 'direct' && cartHasItems) {
      setChoosing(cart);
      return;
    }
    setChoosing(null);
    if (mode === 'holdFirst' && !(await onHoldCurrent())) return;
    if (!(await takeCart(cart))) return;
    onResume(cart);
    onOpenChange(false);
  }

  async function discard(cart: PosHeldCartDto) {
    if (!(await confirmDialog(t('pos.held.discardConfirm'), { tone: 'danger' }))) return;
    if (await takeCart(cart)) toast.success(t('pos.held.discarded'));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setChoosing(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pos.held.title')}</DialogTitle>
          <DialogDescription>{t('pos.held.description')}</DialogDescription>
        </DialogHeader>

        {choosing ? (
          <div className="grid gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
            <p className="font-medium">{t('pos.held.cartNotEmpty')}</p>
            <div className="flex flex-wrap gap-2">
              <Button className="h-11" onClick={() => void resume(choosing, 'holdFirst')} disabled={take.isPending}>
                <PauseCircle />
                {t('pos.held.holdCurrentAndResume')}
              </Button>
              <Button variant="outline" className="h-11" onClick={() => void resume(choosing, 'replace')} disabled={take.isPending}>
                {t('pos.held.replaceCurrent')}
              </Button>
              <Button variant="ghost" className="h-11" onClick={() => setChoosing(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !carts || carts.length === 0 ? (
          <EmptyState icon={<PauseCircle />} title={t('pos.held.empty')} />
        ) : (
          <ul className="grid gap-2">
            {carts.map((cart) => (
              <li
                key={cart.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow-card"
              >
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-semibold">{cart.label || cart.customerName || t('pos.customer.walkIn')}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {cart.label && cart.customerName ? `${cart.customerName} · ` : ''}
                    {t('pos.held.items', { count: cart.itemCount })}
                    {cart.createdByName ? ` · ${cart.createdByName}` : ''} · {formatDateTime(cart.createdAt)}
                  </span>
                </div>
                <Amount value={cart.total.amountMinorUnits} currency={cart.total.currency} className="text-lg font-bold" />
                <div className="flex gap-1.5">
                  <Button className="h-11" onClick={() => void resume(cart, 'direct')} disabled={take.isPending}>
                    <Play />
                    {t('pos.held.resume')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-danger hover:bg-danger-soft hover:text-danger"
                    onClick={() => void discard(cart)}
                    disabled={take.isPending}
                    aria-label={t('pos.held.discard')}
                    title={t('pos.held.discard')}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
