import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import type { ProductDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import {
  useDeleteProductImage,
  useProductImages,
  useSetPrimaryProductImage,
  useUploadProductImage,
} from '../../api/products/queries';
import { ApiError } from '../../../../lib/api-client';
import { prepareProductImage } from '../../../../lib/image-resize';
import { INV } from '../../../../lib/permissions';

/** صور الصنف: upload (resized in the browser), choose the main image, delete. */
export function ProductImagesDialog({ product, onClose }: { product: ProductDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const productId = product?.id ?? '';
  const { data: images, isLoading } = useProductImages(product?.id);
  const upload = useUploadProductImage(productId);
  const setPrimary = useSetPrimaryProductImage(productId);
  const remove = useDeleteProductImage(productId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].filter((file) => file.type.startsWith('image/'));
    setUploading(list.length);
    for (const file of list) {
      try {
        const prepared = await prepareProductImage(file);
        await upload.mutateAsync(prepared);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('inventory.images.uploadError', { name: file.name }));
      } finally {
        setUploading((count) => count - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={Boolean(product)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('inventory.images.title', { name: product?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        <Can permission={INV.productsManage}>
          <div
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFiles(e.dataTransfer.files);
            }}
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            <p>{t('inventory.images.dropHint')}</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void onFiles(e.target.files)}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading > 0}>
              {uploading > 0 ? t('inventory.images.uploading', { count: uploading }) : t('inventory.images.choose')}
            </Button>
          </div>
        </Can>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : (images ?? []).length === 0 ? (
          <EmptyState className="py-8" icon={<ImagePlus />} title={t('inventory.images.empty')} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(images ?? []).map((image) => (
              <figure key={image.id} className="group relative overflow-hidden rounded-lg border bg-muted/30">
                <button type="button" className="block w-full" onClick={() => setPreview(image.url)}>
                  <img
                    src={image.thumbnailUrl}
                    alt={product?.name ?? ''}
                    loading="lazy"
                    className="aspect-square w-full object-contain"
                  />
                </button>
                {image.isPrimary ? (
                  <Badge variant="brand" className="absolute start-2 top-2">
                    {t('inventory.images.primary')}
                  </Badge>
                ) : null}
                <Can permission={INV.productsManage}>
                  <figcaption className="flex justify-end gap-1 border-t bg-background/90 p-1">
                    {!image.isPrimary ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('inventory.images.makePrimary')}
                        title={t('inventory.images.makePrimary')}
                        onClick={() => run(() => setPrimary.mutateAsync(image.id))}
                      >
                        <Star />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('common.delete')}
                      onClick={() =>
                        window.confirm(t('inventory.images.deleteConfirm')) && run(() => remove.mutateAsync(image.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  </figcaption>
                </Can>
              </figure>
            ))}
          </div>
        )}
        {preview ? (
          <button
            type="button"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
            onClick={() => setPreview(null)}
            aria-label={t('common.close')}
          >
            <img src={preview} alt={product?.name ?? ''} className="max-h-full max-w-full rounded-lg object-contain" />
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
