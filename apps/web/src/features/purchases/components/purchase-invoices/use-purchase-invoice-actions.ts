import { useTranslation } from 'react-i18next';
import { toast } from '@erp-platform/ui';

import {
  useCancelPurchaseInvoice,
  useDeletePurchaseInvoice,
  usePostPurchaseInvoice,
} from '../../api/purchase-invoices/queries';
import { ApiError } from '../../../../lib/api-client';

/**
 * Post / cancel / delete with confirmation + toasts — shared by the invoices list and
 * the invoice details page so both behave identically. Each returns true on success.
 */
export function usePurchaseInvoiceActions() {
  const { t } = useTranslation();
  const postInvoice = usePostPurchaseInvoice();
  const cancelInvoice = useCancelPurchaseInvoice();
  const deleteInvoice = useDeletePurchaseInvoice();

  async function run(
    action: () => Promise<unknown>,
    confirmKey: string | null,
    successKey: string,
    errorKey: string,
  ): Promise<boolean> {
    if (confirmKey && !window.confirm(t(confirmKey))) return false;
    try {
      await action();
      toast.success(t(successKey));
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t(errorKey));
      return false;
    }
  }

  return {
    isPending: postInvoice.isPending || cancelInvoice.isPending || deleteInvoice.isPending,
    post: (id: string, { confirm = true }: { confirm?: boolean } = {}) =>
      run(
        () => postInvoice.mutateAsync(id),
        confirm ? 'purchases.purchaseInvoices.postConfirm' : null,
        'purchases.purchaseInvoices.postSuccess',
        'purchases.purchaseInvoices.postError',
      ),
    cancel: (id: string) =>
      run(
        () => cancelInvoice.mutateAsync(id),
        'purchases.purchaseInvoices.cancelConfirm',
        'purchases.purchaseInvoices.cancelSuccess',
        'purchases.purchaseInvoices.cancelError',
      ),
    remove: (id: string) =>
      run(
        () => deleteInvoice.mutateAsync(id),
        'purchases.purchaseInvoices.deleteConfirm',
        'purchases.purchaseInvoices.deleteSuccess',
        'common.error',
      ),
  };
}
