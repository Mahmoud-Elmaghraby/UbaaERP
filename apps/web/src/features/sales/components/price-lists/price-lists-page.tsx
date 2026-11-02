import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

/** Sales › Price lists: wholesale, retail, distributors… each with its own prices. */
export function PriceListsPage() {
  const { t } = useTranslation();
  const { data: lists, isLoading } = usePriceLists();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('priceLists.title')}
        description={t('priceLists.subtitle')}
        actions={
          <Can permission="sales.manage">
            <Button asChild>
              <Link to="/sales/price-lists/new">{t('priceLists.add')}</Link>
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
              <TableHead>{t('priceLists.discountPercent')}</TableHead>
              <TableHead>{t('priceLists.itemCount')}</TableHead>
              <TableHead>{t('priceLists.customerCount')}</TableHead>
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
                <TableCell className="tabular">{Number(list.discountPercent) > 0 ? `${list.discountPercent}%` : '—'}</TableCell>
                <TableCell className="tabular">{list.itemCount}</TableCell>
                <TableCell className="tabular">{list.customerCount}</TableCell>
                <TableCell className="text-end">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/sales/price-lists/${list.id}`}>{t('common.edit')}</Link>
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
