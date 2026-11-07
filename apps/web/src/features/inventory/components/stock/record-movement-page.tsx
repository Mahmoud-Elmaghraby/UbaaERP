import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { RecordMovementForm } from './record-movement-form';
import { STOCK_PATH } from './stock-paths';

/** /inventory/stock/movements/new — a direct stock movement (in / out / adjustment) as a full page. */
export function RecordMovementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialWarehouseId = params.get('warehouse') ?? undefined;

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={STOCK_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.stock')}
        title={t('inventory.stock.recordMovement')}
      />
      <div className="mx-auto w-full max-w-3xl">
        <SectionCard description={t('inventory.stock.recordMovementHint')}>
          <div className="pt-5">
            <RecordMovementForm
              initialWarehouseId={initialWarehouseId}
              onDone={(warehouseId) =>
                navigate(`${STOCK_PATH}?view=movements${warehouseId ? `&warehouse=${warehouseId}` : ''}`, { replace: true })
              }
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
