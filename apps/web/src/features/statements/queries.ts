import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OpeningBalanceDto,
  PartyBalancesReportDto,
  PartyKindDto,
  PartyStatementDto,
  SetOpeningBalanceDto,
} from '@erp-platform/contracts';

import { apiGet, apiPut } from '../../lib/api-client';
import { PURCH, SALES } from '../../lib/permissions';

/** API paths and print type of each party kind — the only place they differ. */
export const PARTY_CONFIG: Record<
  PartyKindDto,
  { base: string; balances: string; printType: string; permission: string; listPath: string; statementPath: (id: string) => string }
> = {
  customer: {
    base: '/customers',
    balances: '/customer-balances',
    printType: 'customer_statement',
    permission: SALES.view,
    listPath: '/sales/receivables',
    statementPath: (id) => `/sales/customers/${id}/statement`,
  },
  supplier: {
    base: '/suppliers',
    balances: '/supplier-balances',
    printType: 'supplier_statement',
    permission: PURCH.view,
    listPath: '/purchases/payables',
    statementPath: (id) => `/purchases/suppliers/${id}/statement`,
  },
};

function toQuery(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : '';
}

export interface StatementParams {
  from?: string;
  to?: string;
  currency?: string;
}

export function usePartyStatement(kind: PartyKindDto, id: string | undefined, params: StatementParams) {
  return useQuery({
    queryKey: ['party-statement', kind, id, params],
    queryFn: () => apiGet<PartyStatementDto>(`${PARTY_CONFIG[kind].base}/${id}/statement${toQuery({ ...params })}`),
    enabled: Boolean(id),
  });
}

export function usePartyBalances(kind: PartyKindDto, params: { asOf?: string; currency?: string; nonZeroOnly?: boolean }) {
  return useQuery({
    queryKey: ['party-balances', kind, params],
    queryFn: () =>
      apiGet<PartyBalancesReportDto>(
        `${PARTY_CONFIG[kind].balances}${toQuery({
          asOf: params.asOf,
          currency: params.currency,
          nonZeroOnly: params.nonZeroOnly === false ? 'false' : undefined,
        })}`,
      ),
  });
}

export function useOpeningBalance(kind: PartyKindDto, id: string | undefined) {
  return useQuery({
    queryKey: ['opening-balance', kind, id],
    queryFn: () => apiGet<OpeningBalanceDto>(`${PARTY_CONFIG[kind].base}/${id}/opening-balance`),
    enabled: Boolean(id),
  });
}

export function useSetOpeningBalance(kind: PartyKindDto, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetOpeningBalanceDto) =>
      apiPut<OpeningBalanceDto>(`${PARTY_CONFIG[kind].base}/${id}/opening-balance`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['opening-balance', kind, id] });
      void queryClient.invalidateQueries({ queryKey: ['party-statement', kind, id] });
      void queryClient.invalidateQueries({ queryKey: ['party-balances', kind] });
    },
  });
}
