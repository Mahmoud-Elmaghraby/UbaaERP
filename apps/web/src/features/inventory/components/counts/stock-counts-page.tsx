import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import type { StockCountKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCreateStockCount, useStockCounts } from '../../api/stock-counts/queries';
import { useWarehouses } from '../../api/warehouses/queries';
import { ApiError } from '../../../../lib/api-client';
import { COUNT_STATUS_VARIANT, COUNTS_PATH } from './count-status';

/** الجرد ورصيد أول المدة — list of both kinds, one tab each. */
export function StockCountsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const kind: StockCountKindDto = params.get('kind') === 'opening' ? 'opening' : 'stocktake';
  const { data: counts, isLoading } = useStockCounts(kind);
  const { data: warehouses } = useWarehouses();
  const warehouseName = new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.counts.title')}
        description={t('inventory.counts.description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {kind === 'opening' ? t('inventory.counts.newOpening') : t('inventory.counts.newStocktake')}
          </Button>
        }
      />
      <Tabs value={kind} onValueChange={(value) => setParams({ kind: value }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="stocktake">{t('inventory.counts.kinds.stocktake')}</TabsTrigger>
          <TabsTrigger value="opening">{t('inventory.counts.kinds.opening')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : (counts ?? []).length === 0 ? (
            <EmptyState
              className="py-12"
              icon={<ClipboardList />}
              title={kind === 'opening' ? t('inventory.counts.emptyOpening') : t('inventory.counts.emptyStocktake')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.counts.number')}</TableHead>
                  <TableHead>{t('documents.warehouse')}</TableHead>
                  <TableHead>{t('inventory.counts.date')}</TableHead>
                  <TableHead>{t('inventory.counts.status')}</TableHead>
                  <TableHead>{t('documents.notes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(counts ?? []).map((count) => (
                  <TableRow key={count.id}>
                    <TableCell className="font-medium">
                      <Link className="text-primary hover:underline" to={`${COUNTS_PATH}/${count.id}`}>
                        {count.countNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{warehouseName.get(count.warehouseId) ?? '—'}</TableCell>
                    <TableCell>{count.countDate ?? new Date(count.createdAt).toLocaleDateString('en-CA')}</TableCell>
                    <TableCell>
                      <Badge variant={COUNT_STATUS_VARIANT[count.status]} dot>
                        {t(`inventory.counts.statuses.${count.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{count.notes ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <CreateCountDialog kind={kind} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateCountDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: StockCountKindDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: warehouses } = useWarehouses();
  const create = useCreateStockCount();
  const [warehouseId, setWarehouseId] = useState('');
  const [countDate, setCountDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [notes, setNotes] = useState('');
  const selectedWarehouse = warehouseId || warehouses?.[0]?.id || '';

  async function submit() {
    if (!selectedWarehouse) return;
    try {
      const created = await create.mutateAsync({
        kind,
        warehouseId: selectedWarehouse,
        countDate: countDate || null,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
      navigate(`${COUNTS_PATH}/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.counts.createError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === 'opening' ? t('inventory.counts.newOpening') : t('inventory.counts.newStocktake')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('documents.warehouse')}</Label>
            <Select value={selectedWarehouse} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('inventory.counts.date')}</Label>
            <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('documents.notes')}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            {kind === 'opening' ? t('inventory.counts.openingHint') : t('inventory.counts.stocktakeHint')}
          </p>
          <Button onClick={submit} disabled={!selectedWarehouse || create.isPending}>
            {t('inventory.counts.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
