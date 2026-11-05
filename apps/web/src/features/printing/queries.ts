import { useQuery } from '@tanstack/react-query';
import type { PrintableDocumentTypeDto, PrintResponseDto } from '@erp-platform/contracts';

import { apiFetch, apiGet } from '../../lib/api-client';

/** `query`: report-like documents' options (a statement's from / to / currency), forwarded as-is. */
export function usePrintDocument(documentType: string | undefined, id: string | undefined, query = '') {
  return useQuery({
    queryKey: ['print', documentType, id, query],
    queryFn: () => apiGet<PrintResponseDto>(`/print/${documentType}/${id}${query ? `?${query}` : ''}`),
    enabled: Boolean(documentType && id),
    staleTime: 0,
  });
}

export function usePrintDocumentTypes() {
  return useQuery({
    queryKey: ['print', 'document-types'],
    queryFn: () => apiGet<PrintableDocumentTypeDto[]>('/print/document-types'),
    staleTime: 5 * 60_000,
  });
}

/** A shared document by its signed public token — no login (skipAuth). */
export function usePublicDocument(token: string | undefined) {
  return useQuery({
    queryKey: ['public-document', token],
    queryFn: () => apiFetch<PrintResponseDto>(`/public/documents/${encodeURIComponent(token ?? '')}`, { skipAuth: true }),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });
}
