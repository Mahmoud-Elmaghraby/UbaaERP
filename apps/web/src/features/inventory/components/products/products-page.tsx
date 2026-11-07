import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import type { ProductDto } from '@erp-platform/contracts';
import { Badge, Button, Can, Combobox, DataTable, PageHeader } from '@erp-platform/ui';
import { Plus, Upload } from 'lucide-react';

import { useProducts } from '../../api/products/queries';
import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { useCategoryOptions } from '../../api/catalog/queries';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { ProductThumb } from '../../../../components/product/product-thumb';
import { INV } from '../../../../lib/permissions';
import { PRODUCTS_PATH } from './product-paths';

const STATUS_TABS = ['all', 'active', 'inactive'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

/** الأصناف — search, category (with sub-categories) and status filters; a row opens the item's page. */
export function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: StatusTab = STATUS_TABS.includes(rawStatus as StatusTab) ? (rawStatus as StatusTab) : 'all';
  const { data: products, isLoading } = useProducts();
  const { data: units } = useUnitsOfMeasure();
  const { options: categoryOptions } = useCategoryOptions();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const unitName = useMemo(() => new Map((units ?? []).map((u) => [u.id, u.name])), [units]);
  const categoryById = useMemo(() => new Map(categoryOptions.map((option) => [option.id, option])), [categoryOptions]);

  const inCategory = useMemo(() => {
    if (!categoryFilter) return products ?? [];
    const selected = categoryById.get(categoryFilter);
    if (!selected) return products ?? [];
    const ids = new Set(
      categoryOptions
        .filter((option) => option.id === selected.id || option.path.startsWith(`${selected.path} › `))
        .map((option) => option.id),
    );
    return (products ?? []).filter((product) => product.categoryId && ids.has(product.categoryId));
  }, [products, categoryFilter, categoryById, categoryOptions]);

  const counts = useMemo(() => {
    const active = inCategory.filter((p) => p.isActive).length;
    return { all: inCategory.length, active, inactive: inCategory.length - active };
  }, [inCategory]);

  const visible = useMemo(
    () => inCategory.filter((p) => (status === 'all' ? true : status === 'active' ? p.isActive : !p.isActive)),
    [inCategory, status],
  );

  const columns = useMemo<ColumnDef<ProductDto>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('inventory.products.code'),
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground" dir="ltr">{row.original.code}</span>,
      },
      {
        accessorKey: 'name',
        header: t('inventory.products.name'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <ProductThumb url={row.original.imageUrl} name={row.original.name} />
            <span className="font-medium">{row.original.name}</span>
            {row.original.itemType === 'service' ? <Badge variant="info">{t('inventory.products.itemTypeService')}</Badge> : null}
          </span>
        ),
      },
      {
        id: 'category',
        header: t('inventory.products.category'),
        accessorFn: (row) => (row.categoryId ? (categoryById.get(row.categoryId)?.path ?? '') : ''),
        cell: ({ getValue }) => (getValue<string>() ? getValue<string>() : <span className="text-muted-foreground">—</span>),
      },
      {
        id: 'unit',
        header: t('inventory.products.unit'),
        accessorFn: (row) => unitName.get(row.unitOfMeasureId) ?? '—',
      },
      {
        id: 'purchasePrice',
        header: () => <div className="text-end">{t('inventory.products.purchasePriceShort')}</div>,
        accessorFn: (row) => (row.purchasePrice ? Number(row.purchasePrice.amountMinorUnits) : -1),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.purchasePrice?.amountMinorUnits} hideCurrency />
          </div>
        ),
      },
      {
        id: 'salePrice',
        header: () => <div className="text-end">{t('inventory.products.salePriceShort')}</div>,
        accessorFn: (row) => (row.salePrice ? Number(row.salePrice.amountMinorUnits) : -1),
        cell: ({ row }) => (
          <div className={AMOUNT_CELL}>
            <Amount value={row.original.salePrice?.amountMinorUnits} hideCurrency />
          </div>
        ),
      },
      {
        id: 'isActive',
        header: t('common.status'),
        accessorFn: (row) => (row.isActive ? t('common.active') : t('common.inactive')),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
    ],
    [t, unitName, categoryById],
  );

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('inventory.tabs.products')}
        description={t('inventory.products.subtitle')}
        actions={
          <Can permission={INV.productsManage}>
            <>
              <Button variant="outline" asChild>
                <Link to="/inventory/import">
                  <Upload className="me-1 h-4 w-4" />
                  {t('inventory.products.import')}
                </Link>
              </Button>
              <Button asChild>
                <Link to={`${PRODUCTS_PATH}/new`}>
                  <Plus className="me-1 h-4 w-4" />
                  {t('inventory.products.newProduct')}
                </Link>
              </Button>
            </>
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoading}
        searchable
        searchPlaceholder={t('inventory.products.search')}
        onRowClick={(product) => navigate(`${PRODUCTS_PATH}/${product.id}`)}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <StatusTabs
              tabs={STATUS_TABS}
              value={status}
              onChange={(tab) => setParams(tab === 'all' ? {} : { status: tab }, { replace: true })}
              label={(tab) => (tab === 'all' ? t('common.all') : tab === 'active' ? t('common.active') : t('common.inactive'))}
              counts={products ? counts : undefined}
            />
            <div className="w-full max-w-xs">
              <Combobox
                items={categoryOptions}
                value={categoryFilter}
                onValueChange={(id) => setCategoryFilter(id)}
                getValue={(option) => option.id}
                getLabel={(option) => option.path}
                placeholder={t('inventory.products.allCategories')}
                searchPlaceholder={t('common.search')}
                emptyText={t('common.noResults')}
                className="h-9"
              />
            </div>
            {categoryFilter ? (
              <Button variant="ghost" size="sm" onClick={() => setCategoryFilter(null)}>
                {t('inventory.stock.clearFilters')}
              </Button>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
