import { useTranslation } from 'react-i18next';
import { toast } from '@erp-platform/ui';

import {
  useCancelPaymentReceived,
  useDeletePaymentReceived,
  usePostPaymentReceived,
} from '../../api/payments-received/queries';
import { ApiError } from '../../../../lib/api-client';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';

/** Post / cancel / delete with confirmation + toasts — shared by the list, the page and the editor. Each returns true on success. */
export function usePaymentReceivedActions() {
  const { t } = useTranslation();
  const postPayment = usePostPaymentReceived();
  const cancelPayment = useCancelPaymentReceived();
  const deletePayment = useDeletePaymentReceived();

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
        confirm ? { key: 'sales.paymentsReceived.postConfirm' } : null,
        'sales.paymentsReceived.postSuccess',
        'sales.paymentsReceived.postError',
      ),
    cancel: (id: string) =>
      run(
        () => cancelPayment.mutateAsync(id),
        { key: 'sales.paymentsReceived.cancelConfirm', danger: true },
        'sales.paymentsReceived.cancelSuccess',
        'sales.paymentsReceived.cancelError',
      ),
    remove: (id: string) =>
      run(
        () => deletePayment.mutateAsync(id),
        { key: 'sales.paymentsReceived.deleteConfirm', danger: true },
        'sales.paymentsReceived.deleteSuccess',
        'common.error',
      ),
  };
}
