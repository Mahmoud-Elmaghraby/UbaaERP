import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@erp-platform/ui';

import type { StockLevelFilters } from '../../api/stock/queries';
import { ProductVariantSelector, WarehouseLocationSelector } from './selectors';
import { StockLevelsView } from './stock-levels-view';
import { StockMovementsView } from './stock-movements-view';
import { StockLotsView } from './stock-lots-view';
import { RecordMovementForm } from './record-movement-form';
import { TransferStockForm } from './transfer-stock-form';

export function StockTab() {
  const { t } = useTranslation();
  const [activeView, setActiveView] = useState('levels');
  const [filterProductId, setFilterProductId] = useState<string | undefined>();
  const [filterVariantId, setFilterVariantId] = useState<string | undefined>();
  const [filterWarehouseId, setFilterWarehouseId] = useState<string | undefined>();
  const [filterLocationId, setFilterLocationId] = useState<string | undefined>();
  const [movementOpen, setMovementOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const levelFilters = useMemo<StockLevelFilters>(
    () => ({
      warehouseId: filterWarehouseId,
      locationId: filterLocationId,
      productVariantId: filterVariantId,
    }),
    [filterWarehouseId, filterLocationId, filterVariantId],
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-md border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProductVariantSelector
            productId={filterProductId}
            variantId={filterVariantId}
            onProductChange={(id) => {
              setFilterProductId(id);
              setFilterVariantId(undefined);
            }}
            onVariantChange={setFilterVariantId}
            activeOnly={false}
          />
          <WarehouseLocationSelector
            warehouseId={filterWarehouseId}
            locationId={filterLocationId}
            onWarehouseChange={(id) => {
              setFilterWarehouseId(id);
              setFilterLocationId(undefined);
            }}
            onLocationChange={setFilterLocationId}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterVariantId || filterWarehouseId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterProductId(undefined);
                setFilterVariantId(undefined);
                setFilterWarehouseId(undefined);
                setFilterLocationId(undefined);
              }}
            >
              <X />
              {t('inventory.stock.clearFilters')}
            </Button>
          ) : null}
        <Can permission="inventory.manage">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMovementOpen(true)}>
              {t('inventory.stock.recordMovement')}
            </Button>
            <Button variant="outline" onClick={() => setTransferOpen(true)}>
              {t('inventory.stock.transfer')}
            </Button>
          </div>
        </Can>
        </div>
      </div>

      <Tabs value={activeView} onValueChange={setActiveView}>
        <div className="overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="levels">{t('inventory.stock.levels')}</TabsTrigger>
            <TabsTrigger value="movements">{t('inventory.stock.movements')}</TabsTrigger>
            <TabsTrigger value="lots">{t('inventory.stock.lots')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="levels">
          <StockLevelsView filters={levelFilters} />
        </TabsContent>
        <TabsContent value="movements">
          <StockMovementsView filters={levelFilters} />
        </TabsContent>
        <TabsContent value="lots">
          <StockLotsView productVariantId={filterVariantId} />
        </TabsContent>
      </Tabs>

      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('inventory.stock.recordMovement')}</DialogTitle>
          </DialogHeader>
          <RecordMovementForm onDone={() => setMovementOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('inventory.stock.transfer')}</DialogTitle>
          </DialogHeader>
          <TransferStockForm onDone={() => setTransferOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
