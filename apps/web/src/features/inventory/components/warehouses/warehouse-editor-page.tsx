import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, Skeleton } from '@erp-platform/ui';
import { FileQuestion } from 'lucide-react';

import { useWarehouses } from '../../api/warehouses/queries';
import { DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { CreateWarehouseForm, EditWarehouseForm } from './warehouse-form';
import { WAREHOUSES_PATH } from './warehouse-paths';

/** /inventory/warehouses/new and /:id/edit — the warehouse form as a full page. */
export function WarehouseEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: warehouses, isLoading } = useWarehouses();
  const warehouse = id ? warehouses?.find((w) => w.id === id) : undefined;

  if (id && isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (id && !warehouse) return <EmptyState icon={<FileQuestion />} title={t('documents.notFound')} />;

  const open = (warehouseId: string) => navigate(`${WAREHOUSES_PATH}/${warehouseId}`, { replace: true });

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={warehouse ? `${WAREHOUSES_PATH}/${warehouse.id}` : WAREHOUSES_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.warehouses')}
        title={warehouse ? t('inventory.warehouses.editTitle', { name: warehouse.name }) : t('inventory.warehouses.newWarehouse')}
      />
      <div className="mx-auto w-full max-w-3xl">
        <SectionCard>
          <div className="pt-5">
            {warehouse ? <EditWarehouseForm warehouse={warehouse} onDone={open} /> : <CreateWarehouseForm onDone={open} />}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
