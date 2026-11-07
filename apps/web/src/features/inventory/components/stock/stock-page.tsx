import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Plus, SlidersHorizontal, X } from 'lucide-react';
import { Button, Can, PageHeader } from '@erp-platform/ui';

import type { StockLevelFilters } from '../../api/stock/queries';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { INV } from '../../../../lib/permissions';
import { ProductVariantSelector, WarehouseLocationSelector } from './selectors';
import { StockLevelsView } from './stock-levels-view';
import { StockMovementsView } from './stock-movements-view';
import { StockLotsView } from './stock-lots-view';
import { STOCK_PATH } from './stock-paths';

const VIEWS = ['levels', 'movements', 'lots'] as const;
type View = (typeof VIEWS)[number];
const FILTER_KEYS = ['variant', 'warehouse', 'location'] as const;

/**
 * الأرصدة والحركات — one page, three views (levels / movements / lots). The view and every
 * filter live in the URL, so a warehouse or product page can link straight to a filtered view
 * (?view=movements&warehouse=…) and the browser back button restores what was on screen.
 */
export function StockPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view: View = VIEWS.includes(rawView as View) ? (rawView as View) : 'levels';
  const variantId = params.get('variant') ?? undefined;
  const warehouseId = params.get('warehouse') ?? undefined;
  const locationId = params.get('location') ?? undefined;

  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }

  const filters = useMemo<StockLevelFilters>(
    () => ({ warehouseId, locationId, productVariantId: variantId }),
    [warehouseId, locationId, variantId],
  );
  const hasFilters = FILTER_KEYS.some((key) => params.has(key));

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('inventory.tabs.stock')}
        description={t('inventory.stock.subtitle')}
        actions={
          <>
            <Can permission={INV.transfersManage}>
              <Button variant="outline" asChild>
                <Link to="/inventory/transfers/new">
                  <ArrowLeftRight className="me-1 h-4 w-4" />
                  {t('inventory.transfers.new')}
                </Link>
              </Button>
            </Can>
            <Can permission={INV.movementsManage}>
              <>
                <Button variant="outline" asChild>
                  <Link to="/inventory/adjustments/new">
                    <SlidersHorizontal className="me-1 h-4 w-4" />
                    {t('inventory.adjustments.new')}
                  </Link>
                </Button>
                <Button asChild>
                  <Link to={`${STOCK_PATH}/movements/new${warehouseId ? `?warehouse=${warehouseId}` : ''}`}>
                    <Plus className="me-1 h-4 w-4" />
                    {t('inventory.stock.recordMovement')}
                  </Link>
                </Button>
              </>
            </Can>
          </>
        }
      />

      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
          <ProductVariantSelector
            variantId={variantId}
            onProductChange={() => undefined}
            onVariantChange={(id) => update({ variant: id })}
            activeOnly={false}
          />
          <WarehouseLocationSelector
            warehouseId={warehouseId}
            locationId={locationId}
            onWarehouseChange={(id) => update({ warehouse: id, location: undefined })}
            onLocationChange={(id) => update({ location: id })}
          />
          {hasFilters ? (
            <Button variant="ghost" onClick={() => update({ variant: undefined, warehouse: undefined, location: undefined })}>
              <X />
              {t('inventory.stock.clearFilters')}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex">
        <StatusTabs
        tabs={VIEWS}
        value={view}
        onChange={(next) => update({ view: next === 'levels' ? undefined : next })}
        label={(key) => t(`inventory.stock.${key}`)}
        />
      </div>

      {view === 'levels' ? <StockLevelsView filters={filters} /> : null}
      {view === 'movements' ? <StockMovementsView filters={filters} /> : null}
      {view === 'lots' ? <StockLotsView productVariantId={variantId} /> : null}
    </div>
  );
}
