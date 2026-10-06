import { useTranslation } from 'react-i18next';
import { toast } from '@erp-platform/ui';

import {
  useCancelSalesInvoice,
  useDeleteSalesInvoice,
  usePostSalesInvoice,
} from '../../api/sales-invoices/queries';
import { ApiError } from '../../../../lib/api-client';

/**
 * Post / cancel / delete with confirmation + toasts — shared by the invoices list and
 * the invoice details page so both behave identically. Each returns true on success.
 */
export function useSalesInvoiceActions() {
  const { t } = useTranslation();
  const postInvoice = usePostSalesInvoice();
  const cancelInvoice = useCancelSalesInvoice();
  const deleteInvoice = useDeleteSalesInvoice();

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
        confirm ? 'sales.salesInvoices.postConfirm' : null,
        'sales.salesInvoices.postSuccess',
        'sales.salesInvoices.postError',
      ),
    cancel: (id: string) =>
      run(
        () => cancelInvoice.mutateAsync(id),
        'sales.salesInvoices.cancelConfirm',
        'sales.salesInvoices.cancelSuccess',
        'sales.salesInvoices.cancelError',
      ),
    remove: (id: string) =>
      run(
        () => deleteInvoice.mutateAsync(id),
        'sales.salesInvoices.deleteConfirm',
        'sales.salesInvoices.deleteSuccess',
        'common.error',
      ),
  };
}
