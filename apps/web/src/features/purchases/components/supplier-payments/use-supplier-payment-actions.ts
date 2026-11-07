import { useTranslation } from 'react-i18next';
import { toast } from '@erp-platform/ui';

import {
  useCancelSupplierPayment,
  useDeleteSupplierPayment,
  usePostSupplierPayment,
} from '../../api/supplier-payments/queries';
import { ApiError } from '../../../../lib/api-client';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';

/** Post / cancel / delete with confirmation + toasts — shared by the page and the editor. Each returns true on success. */
export function useSupplierPaymentActions() {
  const { t } = useTranslation();
  const postPayment = usePostSupplierPayment();
  const cancelPayment = useCancelSupplierPayment();
  const deletePayment = useDeleteSupplierPayment();

  async function run(
    action: () => Promise<unknown>,
    confirm: { key: string; danger?: boolean } | null,
    successKey: string,
    errorKey: string,
  ): Promise<boolean> {
    if (confirm && !(await confirmDialog(t(confirm.key), confirm.danger ? { tone: 'danger' } : undefined))) return false;
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
    isPending: postPayment.isPending || cancelPayment.isPending || deletePayment.isPending,
    post: (id: string, { confirm = true }: { confirm?: boolean } = {}) =>
      run(
        () => postPayment.mutateAsync(id),
        confirm ? { key: 'purchases.supplierPayments.postConfirm' } : null,
        'purchases.supplierPayments.postSuccess',
        'purchases.supplierPayments.postError',
      ),
    cancel: (id: string) =>
      run(
        () => cancelPayment.mutateAsync(id),
        { key: 'purchases.supplierPayments.cancelConfirm', danger: true },
        'purchases.supplierPayments.cancelSuccess',
        'purchases.supplierPayments.cancelError',
      ),
    remove: (id: string) =>
      run(
        () => deletePayment.mutateAsync(id),
        { key: 'purchases.supplierPayments.deleteConfirm', danger: true },
        'purchases.supplierPayments.deleteSuccess',
        'purchases.supplierPayments.deleteError',
      ),
  };
}
