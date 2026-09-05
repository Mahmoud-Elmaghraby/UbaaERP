import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PurchaseRequisitionWithLinesDto } from '@erp-platform/contracts';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { useBranches } from '../../../settings/queries';
import { useUsers } from '../../../users-permissions/queries';
import { useVariantIndex } from '../../hooks/purchase-requisitions/use-variant-index';
import {
  PURCHASE_REQUISITION_STATUS_VARIANT,
  purchaseRequisitionStatusLabelKey,
} from './purchase-requisition-status';

/** Read-only header + lines view, same shape as Inventory's LandedCostAllocationsView. */
export function PurchaseRequisitionDetailsView({
  requisition,
}: {
  requisition: PurchaseRequisitionWithLinesDto;
}) {
  const { t } = useTranslation();
  const { data: branches } = useBranches();
  const { data: users } = useUsers();
  const variantIndex = useVariantIndex();

  const branchById = useMemo(() => new Map((branches ?? []).map((b) => [b.id, b])), [branches]);
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseRequisitions.requisitionNumber')}</p>
          <p className="font-medium">{requisition.requisitionNumber}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('common.status')}</p>
          <Badge variant={PURCHASE_REQUISITION_STATUS_VARIANT[requisition.status]}>
            {t(purchaseRequisitionStatusLabelKey(requisition.status))}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseRequisitions.requestedBy')}</p>
          <p className="font-medium">{userById.get(requisition.requestedBy)?.fullName ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseRequisitions.branch')}</p>
          <p className="font-medium">
            {requisition.branchId
              ? branchById.get(requisition.branchId)?.name ?? '—'
              : t('purchases.purchaseRequisitions.noBranch')}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">{t('purchases.purchaseRequisitions.neededByDate')}</p>
          <p className="font-medium">{requisition.neededByDate ?? '—'}</p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-muted-foreground">{t('purchases.purchaseRequisitions.notes')}</p>
          <p className="font-medium">{requisition.notes ?? '—'}</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('purchases.purchaseRequisitions.lineProduct')}</TableHead>
            <TableHead>{t('purchases.purchaseRequisitions.lineQuantity')}</TableHead>
            <TableHead>{t('purchases.purchaseRequisitions.lineNotes')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requisition.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>
                {variantIndex.get(line.productVariantId)?.productName ?? '—'} (
                {variantIndex.get(line.productVariantId)?.sku ?? '—'})
              </TableCell>
              <TableCell>{line.quantity}</TableCell>
              <TableCell>{line.notes ?? '—'}</TableCell>
            </TableRow>
          ))}
          {requisition.lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                {t('common.noResults')}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
