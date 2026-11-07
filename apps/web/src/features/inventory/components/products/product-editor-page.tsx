import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, Skeleton } from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useProduct } from '../../api/products/queries';
import { DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { CreateProductForm, EditProductForm } from './product-form';
import { PRODUCTS_PATH } from './product-paths';

/** /inventory/products/new and /:id/edit — the product form as a full page (it used to be a dialog). */
export function ProductEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useProduct(id);

  if (id && isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && (isError || !product)) return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;

  const open = (productId: string) => navigate(`${PRODUCTS_PATH}/${productId}`, { replace: true });

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={product ? `${PRODUCTS_PATH}/${product.id}` : PRODUCTS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.products')}
        title={product ? t('inventory.products.editTitle', { name: product.name }) : t('inventory.products.newProduct')}
      />
      <div className="mx-auto w-full max-w-4xl">
        <SectionCard>
          <div className="pt-5">
            {product ? <EditProductForm product={product} onDone={open} /> : <CreateProductForm onDone={open} />}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
