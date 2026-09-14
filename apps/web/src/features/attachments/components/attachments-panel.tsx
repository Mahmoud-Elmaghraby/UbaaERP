import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AttachmentDownloadUrlDto, AttachmentDto, AttachmentEntityTypeDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';

import { useAttachments, useDeleteAttachment, useUploadAttachment } from '../api/queries';
import {
  ATTACHMENT_ACCEPT_ATTR,
  ATTACHMENT_ENTITY_PERMISSIONS,
  ATTACHMENT_MAX_SIZE_BYTES,
  isAttachmentAllowedMimeType,
} from '../domain/attachment-constants';
import { apiGet, ApiError } from '../../../lib/api-client';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reusable attachments section embedded in the 7 entity screens named in
 * claude/attachments-strategy.md (sales invoices/orders, purchase
 * invoices/orders, products, suppliers, customers). The whole panel is
 * gated behind the owning module's existing "manage" permission — no new
 * `attachments.manage` permission was introduced (confirmed design) — and
 * the backend's own GET /attachments enforces the identical permission per
 * entityType, so a user without it couldn't list attachments even if this
 * gate were bypassed.
 *
 * Downloads use a presigned MinIO URL (GET /attachments/:id/download-url,
 * 5-minute TTL) opened directly in a new tab rather than streamed through
 * the backend — the user's explicit choice, accepting that anyone with the
 * URL can use it until it expires with no mid-flight revocation.
 */
export function AttachmentsPanel({
  entityType,
  entityId,
}: {
  entityType: AttachmentEntityTypeDto;
  entityId: string;
}) {
  return (
    <Can permission={ATTACHMENT_ENTITY_PERMISSIONS[entityType]}>
      <AttachmentsPanelContent entityType={entityType} entityId={entityId} />
    </Can>
  );
}

function AttachmentsPanelContent({
  entityType,
  entityId,
}: {
  entityType: AttachmentEntityTypeDto;
  entityId: string;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: attachments, isLoading } = useAttachments(entityType, entityId);
  const uploadAttachment = useUploadAttachment(entityType, entityId);
  const deleteAttachment = useDeleteAttachment(entityType, entityId);

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
      toast.error(t('attachments.fileTooLarge'));
      return;
    }
    if (!isAttachmentAllowedMimeType(file.type)) {
      toast.error(t('attachments.invalidFileType'));
      return;
    }

    try {
      await uploadAttachment.mutateAsync(file);
      toast.success(t('attachments.uploadSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('attachments.uploadError'));
    }
  }

  async function handleDownload(id: string) {
    try {
      const { url } = await apiGet<AttachmentDownloadUrlDto>(`/attachments/${id}/download-url`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('attachments.downloadError'));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t('attachments.deleteConfirm'))) return;
    try {
      await deleteAttachment.mutateAsync(id);
      toast.success(t('attachments.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('attachments.deleteError'));
    }
  }

  return (
    <div className="grid gap-3">
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{t('attachments.title')}</p>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT_ATTR}
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadAttachment.isPending}
            onClick={handleUploadClick}
          >
            {uploadAttachment.isPending ? t('attachments.uploading') : t('attachments.upload')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('attachments.allowedTypesHint')}</p>

      {isLoading ? <Skeleton className="h-24 w-full" /> : null}

      {!isLoading && attachments && attachments.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('attachments.fileName')}</TableHead>
              <TableHead>{t('attachments.size')}</TableHead>
              <TableHead>{t('attachments.uploadedAt')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {attachments.map((attachment: AttachmentDto) => (
              <TableRow key={attachment.id}>
                <TableCell>{attachment.fileName}</TableCell>
                <TableCell>{formatFileSize(attachment.sizeBytes)}</TableCell>
                <TableCell>{new Date(attachment.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleDownload(attachment.id)}>
                      {t('attachments.download')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void handleDelete(attachment.id)}>
                      {t('attachments.delete')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {!isLoading && (!attachments || attachments.length === 0) ? (
        <p className="text-sm text-muted-foreground">{t('attachments.noAttachments')}</p>
      ) : null}
    </div>
  );
}
