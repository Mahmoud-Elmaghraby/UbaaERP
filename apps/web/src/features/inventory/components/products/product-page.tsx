import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ProductVariantDto, ProductWithVariantsDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@erp-platform/ui';
import { BookOpen, Boxes, FileQuestion, Images, Layers, Pencil, Ruler, Tags, Trash2 } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useTaxRuleLookup } from '../../../settings/queries';
import { useDeleteProduct, useProduct, useProductImages } from '../../api/products/queries';
import { useCategoryOptions, useProductBrands } from '../../api/catalog/queries';
import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';
import { useStockLevels } from '../../api/stock/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { ApiError } from '../../../../lib/api-client';
import { INV } from '../../../../lib/permissions';
import { multiplyMinorUnits } from '../../../../lib/money';
import { formatQuantity } from '../../../../components/report/report-format';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { DocumentBody, DocumentHeaderBar, InfoGrid, PanelCard, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import type { LabelsPrefillState } from '../labels/labels-page';
import { ProductVariantsDialog } from './product-variants-dialog';
import { ProductUnitsDialog } from './product-units-dialog';
import { ProductImagesDialog } from './product-images-dialog';
import { PRODUCTS_PATH } from './product-paths';

/** "مقاس: M / لون: أحمر" from a variant's option values. */
function optionsText(variant: ProductVariantDto): string {
  return Object.entries(variant.attributeValues ?? {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' / ');
}

/** /inventory/products/:id — everything about one item: prices, variants with their stock, stock per warehouse, units, images. */
export function ProductPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useProduct(id);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !product) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('documents.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={PRODUCTS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }
  return <ProductDetails product={product} />;
}

function ProductDetails({ product }: { product: ProductWithVariantsDto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: levels, isLoading: levelsLoading } = useStockLevels({ productId: product.id });
  const { data: warehouses } = useWarehouses();
  const { data: units } = useUnitsOfMeasure();
  const { options: categoryOptions } = useCategoryOptions();
  const { data: brands } = useProductBrands();
  const { data: taxRules } = useTaxRuleLookup();
  const { data: images } = useProductImages(product.id);
  const deleteProduct = useDeleteProduct();
  const [dialog, setDialog] = useState<'variants' | 'units' | 'images' | null>(null);

  const isService = product.itemType === 'service';
  const unit = units?.find((u) => u.id === product.unitOfMeasureId);
  const category = categoryOptions.find((c) => c.id === product.categoryId)?.path;
  const brand = brands?.find((b) => b.id === product.brandId)?.name;
  const taxRule = taxRules?.find((r) => r.id === product.taxRuleId)?.name;

  const onHandByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const level of levels ?? []) map.set(level.productVariantId, (map.get(level.productVariantId) ?? 0) + level.quantityOnHand);
    return map;
  }, [levels]);

  const byWarehouse = useMemo(() => {
    const name = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
    const map = new Map<string, { name: string; quantity: number; value: bigint; hasCost: boolean }>();
    for (const level of levels ?? []) {
      const row = map.get(level.warehouseId) ?? { name: name.get(level.warehouseId) ?? '—', quantity: 0, value: 0n, hasCost: false };
      row.quantity += level.quantityOnHand;
      if (level.averageCost) {
        row.hasCost = true;
        row.value += BigInt(multiplyMinorUnits(level.averageCost.amountMinorUnits, String(level.quantityOnHand)));
      }
      map.set(level.warehouseId, row);
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity);
  }, [levels, warehouses]);

  const totalOnHand = [...onHandByVariant.values()].reduce((sum, q) => sum + q, 0);
  const totalValue = byWarehouse.reduce((sum, w) => sum + w.value, 0n);
  const showValue = byWarehouse.some((w) => w.hasCost);
  const activeVariants = product.variants.filter((v) => v.isActive);

  async function handleDelete() {
    if (!(await confirmDialog(t('inventory.products.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteProduct.mutateAsync(product.id);
      toast.success(t('inventory.products.deleteSuccess'));
      navigate(PRODUCTS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  /** Labels for every active variant: one copy each, or the stock on hand when there is some. */
  function printLabels() {
    const state: LabelsPrefillState = {
      labels: activeVariants.map((v) => ({
        variantId: v.id,
        copies: Math.max(1, Math.min(500, Math.round(onHandByVariant.get(v.id) ?? 1))),
      })),
    };
    navigate('/inventory/labels', { state });
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={PRODUCTS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('inventory.tabs.products')}
        title={product.name}
        status={
          <span className="flex items-center gap-1.5">
            <Badge variant={product.isActive ? 'success' : 'neutral'} dot>
              {product.isActive ? t('common.active') : t('common.inactive')}
            </Badge>
            {isService ? <Badge variant="info">{t('inventory.products.itemTypeService')}</Badge> : null}
          </span>
        }
        actions={
          <>
            {!isService ? (
              <Button variant="outline" asChild>
                <Link to={`/inventory/item-card?variant=${product.variants[0]?.id ?? ''}`}>
                  <BookOpen />
                  {t('inventory.products.itemCard')}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={printLabels} disabled={activeVariants.length === 0}>
              <Tags />
              {t('inventory.products.printLabels')}
            </Button>
            <Can permission={INV.productsManage}>
              <>
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={deleteProduct.isPending}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 />
                  {t('common.delete')}
                </Button>
                <Button asChild>
                  <Link to={`${PRODUCTS_PATH}/${product.id}/edit`}>
                    <Pencil />
                    {t('common.edit')}
                  </Link>
                </Button>
              </>
            </Can>
          </>
        }
      />

      <DocumentBody
        main={
          <>
            <SectionCard title={t('documents.info')}>
              <InfoGrid
                items={[
                  { label: t('inventory.products.code'), value: <span className="tabular" dir="ltr">{product.code}</span> },
                  { label: t('inventory.products.unit'), value: unit?.name ?? '—' },
                  { label: t('inventory.products.category'), value: category ?? '—' },
                  ...(brand ? [{ label: t('inventory.products.brand'), value: brand }] : []),
                  {
                    label: t('inventory.products.trackingType'),
                    value:
                      product.trackingType === 'lot'
                        ? t('inventory.products.trackingLot')
                        : product.trackingType === 'serial'
                          ? t('inventory.products.trackingSerial')
                          : t('inventory.products.trackingNone'),
                  },
                  ...(taxRule ? [{ label: t('inventory.products.tax'), value: taxRule }] : []),
                  ...(product.description ? [{ label: t('inventory.products.description'), value: product.description, wide: true }] : []),
                ]}
              />
            </SectionCard>

            <SectionCard
              title={t('inventory.products.variantsSection')}
              description={`${product.variants.length}`}
              actions={
                <Can permission={INV.productsManage}>
                  <Button variant="outline" size="sm" onClick={() => setDialog('variants')}>
                    <Layers />
                    {t('inventory.products.manageVariants')}
                  </Button>
                </Can>
              }
              flush
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('inventory.products.variant')}</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>{t('inventory.products.barcode')}</TableHead>
                      <TableHead className="text-end">{t('inventory.products.salePriceShort')}</TableHead>
                      {!isService ? <TableHead className="text-end">{t('inventory.products.onHand')}</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((variant) => {
                      const price = variant.salePrice ?? product.salePrice;
                      const onHand = onHandByVariant.get(variant.id) ?? 0;
                      return (
                        <TableRow key={variant.id} className={variant.isActive ? undefined : 'opacity-60'}>
                          <TableCell>
                            <span className="font-medium">{optionsText(variant) || t('inventory.products.singleVariant')}</span>
                            {!variant.isActive ? <Badge variant="neutral" className="ms-2">{t('common.inactive')}</Badge> : null}
                          </TableCell>
                          <TableCell className="tabular-nums" dir="ltr">{variant.sku}</TableCell>
                          <TableCell className="tabular-nums" dir="ltr">
                            {variant.barcode ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className={AMOUNT_CELL}>
                            {price ? <Amount value={price.amountMinorUnits} hideCurrency /> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          {!isService ? (
                            <TableCell className={`${AMOUNT_CELL} ${onHand <= 0 ? 'text-danger' : 'font-medium'}`}>
                              {levelsLoading ? '…' : formatQuantity(onHand)}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

            {!isService ? (
              <SectionCard title={t('inventory.products.stockByWarehouse')} flush>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('documents.warehouse')}</TableHead>
                      <TableHead className="text-end">{t('inventory.products.onHand')}</TableHead>
                      {showValue ? <TableHead className="text-end">{t('inventory.products.stockValue')}</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byWarehouse.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className={AMOUNT_CELL}>{formatQuantity(row.quantity)}</TableCell>
                        {showValue ? (
                          <TableCell className={AMOUNT_CELL}>
                            <Amount value={row.value.toString()} hideCurrency />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                    {!levelsLoading && byWarehouse.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                          {t('inventory.products.noStock')}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </SectionCard>
            ) : null}

            <PanelCard>
              <AttachmentsPanel entityType="product" entityId={product.id} />
            </PanelCard>
          </>
        }
        side={
          <>
            <TotalsPanel
              title={t('inventory.products.pricesSection')}
              rows={[
                {
                  label: t('inventory.products.purchasePriceShort'),
                  value: product.purchasePrice ? <Amount value={product.purchasePrice.amountMinorUnits} hideCurrency /> : '—',
                },
                ...(!isService ? [{ label: t('inventory.products.onHand'), value: formatQuantity(totalOnHand) }] : []),
                ...(!isService && showValue
                  ? [{ label: t('inventory.products.stockValue'), value: <Amount value={totalValue.toString()} hideCurrency /> }]
                  : []),
              ]}
              totalLabel={t('inventory.products.salePriceShort')}
              totalValue={product.salePrice ? <Amount value={product.salePrice.amountMinorUnits} hideCurrency /> : '—'}
              currency={product.salePrice?.currency}
            />
            <SectionCard
              title={t('inventory.images.menu')}
              actions={
                <Can permission={INV.productsManage}>
                  <Button variant="ghost" size="sm" onClick={() => setDialog('images')}>
                    <Images />
                  </Button>
                </Can>
              }
            >
              {images && images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {images.slice(0, 6).map((image) => (
                    <img key={image.id} src={image.url} alt={product.name} className="aspect-square w-full rounded-md border object-cover" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('inventory.products.noImages')}</p>
              )}
            </SectionCard>
            {!isService ? (
              <Can permission={INV.productsManage}>
                <SectionCard>
                  <div className="grid gap-2">
                    <Button variant="outline" onClick={() => setDialog('units')}>
                      <Ruler />
                      {t('inventory.productUnits.menu')}
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/inventory/stock">
                        <Boxes />
                        {t('inventory.products.stockMovements')}
                      </Link>
                    </Button>
                  </div>
                </SectionCard>
              </Can>
            ) : null}
            <DocumentHistory entityType="product" entityId={product.id} />
          </>
        }
      />

      <ProductVariantsDialog product={dialog === 'variants' ? product : null} onClose={() => setDialog(null)} />
      <ProductUnitsDialog product={dialog === 'units' ? product : null} onClose={() => setDialog(null)} />
      <ProductImagesDialog product={dialog === 'images' ? product : null} onClose={() => setDialog(null)} />
    </div>
  );
}
