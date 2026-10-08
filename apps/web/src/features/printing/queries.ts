import { useQuery } from '@tanstack/react-query';
import type { PrintableDocumentTypeDto, PrintResponseDto } from '@erp-platform/contracts';

import { apiGet } from '../../lib/api-client';

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
