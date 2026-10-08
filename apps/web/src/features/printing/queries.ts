import { useQuery } from '@tanstack/react-query';
import type { PrintableDocumentTypeDto, PrintResponseDto } from '@erp-platform/contracts';

import { apiGet } from '../../lib/api-client';

export function usePrintDocument(documentType: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: ['print', documentType, id],
    queryFn: () => apiGet<PrintResponseDto>(`/print/${documentType}/${id}`),
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
