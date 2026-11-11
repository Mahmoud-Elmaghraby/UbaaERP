import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PriceListKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { usePriceLists } from '../../api/price-lists/queries';
import { PRICE_LIST_KINDS } from '../../api/price-lists/price-list-kind';

/** Price lists: sales (wholesale, retail, distributors…) or, with kind 'purchase', supplier price lists. */
export function PriceListsPage({ kind = 'sale' }: { kind?: PriceListKindDto }) {
  const { t } = useTranslation();
  const { data: lists, isLoading } = usePriceLists(kind);
  const config = PRICE_LIST_KINDS[kind];
  const purchase = kind === 'purchase';

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t(purchase ? 'priceLists.purchaseTitle' : 'priceLists.title')}
        description={t(purchase ? 'priceLists.purchaseSubtitle' : 'priceLists.subtitle')}
        actions={
          <Can permission={config.permission}>
            <Button asChild>
              <Link to={`${config.path}/new`}>{t('priceLists.add')}</Link>
            </Button>
          </Can>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('priceLists.name')}</TableHead>
              <TableHead>{t('priceLists.currency')}</TableHead>
              <TableHead>{t('priceLists.adjust.label')}</TableHead>
              <TableHead>{t('priceLists.itemCount')}</TableHead>
              <TableHead>{t(purchase ? 'priceLists.supplierCount' : 'priceLists.customerCount')}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lists ?? []).map((list) => (
              <TableRow key={list.id}>
                <TableCell className="font-medium">
                  {list.name} {!list.isActive ? <Badge variant="neutral">{t('common.inactive')}</Badge> : null}
                </TableCell>
                <TableCell dir="ltr" className="text-end">
                  {list.currency}
                </TableCell>
                <TableCell className="tabular">{Number(list.adjustPercent) ? `${Number(list.adjustPercent) > 0 ? '+' : ''}${list.adjustPercent}%` : '—'}</TableCell>
                <TableCell className="tabular">{list.itemCount}</TableCell>
                <TableCell className="tabular">{purchase ? list.supplierCount : list.customerCount}</TableCell>
                <TableCell className="text-end">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`${config.path}/${list.id}`}>{t('common.edit')}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (lists ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {t('priceLists.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
