import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GenerateSalesInvoiceInstallmentsDto,
  InstallmentDueRowDto,
  PlannedInstallmentDto,
  ReplaceSalesInvoiceInstallmentsDto,
  SalesInvoiceInstallmentScheduleDto,
} from '@erp-platform/contracts';

import { apiGet, apiPost, apiPut } from '../../../../lib/api-client';

/** Installment schedule (التقسيط) of one invoice, with each installment's computed status. */
export function useInvoiceInstallments(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ['sales-invoices', invoiceId, 'installments'],
    queryFn: () => apiGet<SalesInvoiceInstallmentScheduleDto>(`/sales-invoices/${invoiceId}/installments`),
    enabled: Boolean(invoiceId),
  });
}

export function useReplaceInvoiceInstallments(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceSalesInvoiceInstallmentsDto) =>
      apiPut<SalesInvoiceInstallmentScheduleDto>(`/sales-invoices/${invoiceId}/installments`, input),
    onSuccess: (data) => {
      queryClient.setQueryData(['sales-invoices', invoiceId, 'installments'], data);
      // The register's due date / overdue follow the schedule.
      queryClient.invalidateQueries({ queryKey: ['sales-invoices', 'register'] });
      queryClient.invalidateQueries({ queryKey: ['sales-installments'] });
    },
  });
}

/** Equal installments for the invoice total — a preview, nothing is saved. */
export function useGenerateInstallmentsPreview(invoiceId: string) {
  return useMutation({
    mutationFn: (input: GenerateSalesInvoiceInstallmentsDto) =>
      apiPost<PlannedInstallmentDto[]>(`/sales-invoices/${invoiceId}/installments/generate`, input),
  });
}

export interface InstallmentsDueFilters {
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  status?: string;
}

/** Open installments across customers (the "installments due" report). */
export function useInstallmentsDue(filters: InstallmentsDueFilters) {
  return useQuery({
    queryKey: ['sales-installments', filters],
    queryFn: () => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      const qs = query.toString();
      return apiGet<InstallmentDueRowDto[]>(`/sales-installments${qs ? `?${qs}` : ''}`);
    },
  });
}
