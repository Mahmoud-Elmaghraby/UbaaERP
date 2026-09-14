import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, AttachmentEntityTypeDto } from '@erp-platform/contracts';

import { apiDelete, apiGet, apiUpload } from '../../../lib/api-client';

function attachmentsQueryKey(entityType: AttachmentEntityTypeDto, entityId: string) {
  return ['attachments', entityType, entityId] as const;
}

export function useAttachments(entityType: AttachmentEntityTypeDto, entityId: string) {
  return useQuery({
    queryKey: attachmentsQueryKey(entityType, entityId),
    queryFn: () =>
      apiGet<AttachmentDto[]>(
        `/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      ),
    enabled: Boolean(entityId),
  });
}

export function useUploadAttachment(entityType: AttachmentEntityTypeDto, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      return apiUpload<AttachmentDto>('/attachments', formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentsQueryKey(entityType, entityId) });
    },
  });
}

export function useDeleteAttachment(entityType: AttachmentEntityTypeDto, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/attachments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentsQueryKey(entityType, entityId) });
    },
  });
}
