import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@erp-platform/ui';

import { useChartOfAccounts } from '../../api/chart-of-accounts/queries';
import { DocumentBody, DocumentHeaderBar, InfoGrid, SectionCard } from '../../../../components/document/document-layout';
import { CreateChartOfAccountForm, EditChartOfAccountForm } from './chart-of-account-form';

/**
 * /accounting/chart-of-accounts/new?parent=… and /:id/edit — an account as a
 * page (room for its custom fields and notes) instead of a cramped dialog.
 */
export function ChartOfAccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { data: accounts, isLoading } = useChartOfAccounts();
  const back = () => navigate('/accounting/chart-of-accounts');

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  const account = id ? accounts?.find((a) => a.id === id) : undefined;
  const parentId = params.get('parent');
  const parentRef = account?.parentId ?? parentId;
  const parent = parentRef ? accounts?.find((a) => a.id === parentRef) : undefined;

  return (
    <div>
      <DocumentHeaderBar
        backTo="/accounting/chart-of-accounts"
        backLabel={t('accounting.tabs.chartOfAccounts')}
        eyebrow={t('accounting.tabs.chartOfAccounts')}
        title={account ? `${account.code} — ${account.name}` : t('accounting.chartOfAccounts.newAccount')}
      />
      <DocumentBody
        main={
          <SectionCard>
            {account ? (
              <EditChartOfAccountForm account={account} onDone={back} />
            ) : (
              <CreateChartOfAccountForm parentId={parentId} onDone={back} />
            )}
          </SectionCard>
        }
        side={
          account || parent ? (
            <SectionCard title={t('accounting.chartOfAccounts.placeInTree')}>
              <InfoGrid
                items={[
                  { label: t('accounting.chartOfAccounts.parentAccount'), value: parent ? `${parent.code} — ${parent.name}` : '—' },
                  ...(account
                    ? [
                        { label: t('accounting.chartOfAccounts.accountType'), value: t(`accounting.chartOfAccounts.accountTypeValue.${account.accountType}`) },
                        { label: t('accounting.chartOfAccounts.normalBalance'), value: t(`accounting.chartOfAccounts.normalBalanceValue.${account.normalBalance}`) },
                      ]
                    : []),
                ]}
              />
            </SectionCard>
          ) : undefined
        }
      />
    </div>
  );
}
