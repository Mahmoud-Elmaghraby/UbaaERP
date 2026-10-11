import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Can, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@erp-platform/ui';

import { formatAmount } from '../../lib/money';
import { useChannelSettlements } from './api';

export const SETTLEMENTS_PATH = '/sales/settlements';

/** Sales › Marketplace settlements: every weekly statement, drafts first in line to be checked and posted. */
export function SettlementsPage() {
  const { t } = useTranslation();
  const { data: settlements, isLoading } = useChannelSettlements();
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('settlements.title')}
        description={t('settlements.subtitle')}
        actions={
          <Can permission="sales.manage">
            <Button asChild>
              <Link to={`${SETTLEMENTS_PATH}/new`}>{t('settlements.new')}</Link>
            </Button>
          </Can>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settlements.number')}</TableHead>
              <TableHead>{t('settlements.channel')}</TableHead>
              <TableHead>{t('settlements.statementDate')}</TableHead>
              <TableHead>{t('settlements.orders')}</TableHead>
              <TableHead>{t('settlements.refunds')}</TableHead>
              <TableHead>{t('settlements.fees')}</TableHead>
              <TableHead>{t('settlements.net')}</TableHead>
              <TableHead>{t('settlements.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(settlements ?? []).map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <Link className="text-primary hover:underline" to={`${SETTLEMENTS_PATH}/${s.id}`}>
                    {s.settlementNumber}
                  </Link>
                </TableCell>
                <TableCell>{s.salesChannelName}</TableCell>
                <TableCell>{s.statementDate}</TableCell>
                <TableCell className="tabular">{formatAmount(s.ordersTotal.amountMinorUnits)}</TableCell>
                <TableCell className="tabular">{formatAmount(s.refundsTotal.amountMinorUnits)}</TableCell>
                <TableCell className="tabular">{formatAmount(s.feesTotal.amountMinorUnits)}</TableCell>
                <TableCell className="tabular font-semibold">{formatAmount(s.netPayout.amountMinorUnits)}</TableCell>
                <TableCell>
                  <Badge variant={s.status === 'posted' ? 'success' : s.status === 'draft' ? 'warning' : 'neutral'} dot>
                    {t(`settlements.statuses.${s.status}`)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (settlements ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {t('settlements.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
