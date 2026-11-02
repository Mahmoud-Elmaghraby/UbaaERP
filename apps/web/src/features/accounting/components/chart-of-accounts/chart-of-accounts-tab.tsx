import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronsDownUp, ChevronsUpDown, MoreHorizontal, Plus } from 'lucide-react';
import type { ChartOfAccountDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  cn,
  toast,
} from '@erp-platform/ui';

import { useChartOfAccounts, useDeleteChartOfAccount } from '../../api/chart-of-accounts/queries';
import { useTrialBalanceReport } from '../../api/accounting-reports/queries';
import { ApiError } from '../../../../lib/api-client';
import { todayIso } from '../../../../lib/format-date';
import { normalizeForSearch } from '../../../../lib/search-normalize';
import { Amount } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';

const ROOT = '__root__';

/**
 * دليل الحسابات as a tree grid: code, name, type and today's balance (a
 * group shows the sum of its accounts), search that keeps each match's
 * parents, expand/collapse all. A posting account opens its ledger; a
 * group's menu adds a child account under it.
 */
export function ChartOfAccountsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: accounts, isLoading } = useChartOfAccounts();
  const today = todayIso();
  const { data: trialBalance } = useTrialBalanceReport(today);
  const deleteAccount = useDeleteChartOfAccount();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ChartOfAccountDto[]>();
    for (const account of accounts ?? []) {
      const key = account.parentId ?? ROOT;
      map.set(key, [...(map.get(key) ?? []), account]);
    }
    for (const list of map.values()) list.sort((a, b) => a.code.localeCompare(b.code));
    return map;
  }, [accounts]);

  // Balance per account; a group = Σ of its descendants.
  const balances = useMemo(() => {
    const own = new Map((trialBalance?.rows ?? []).map((row) => [row.accountId, BigInt(row.balance.amountMinorUnits)]));
    const total = new Map<string, bigint>();
    const sum = (account: ChartOfAccountDto): bigint => {
      const children = childrenByParent.get(account.id) ?? [];
      const value = children.length ? children.reduce((acc, child) => acc + sum(child), 0n) : (own.get(account.id) ?? 0n);
      total.set(account.id, value);
      return value;
    };
    for (const root of childrenByParent.get(ROOT) ?? []) sum(root);
    return total;
  }, [trialBalance, childrenByParent]);

  // With a search: the matches plus every ancestor, all expanded.
  const visibleIds = useMemo(() => {
    const needle = normalizeForSearch(search);
    if (!needle || !accounts) return null;
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const ids = new Set<string>();
    for (const account of accounts) {
      if (!account.code.startsWith(search.trim()) && !normalizeForSearch(account.name).includes(needle)) continue;
      let current: ChartOfAccountDto | undefined = account;
      while (current && !ids.has(current.id)) {
        ids.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    return ids;
  }, [search, accounts]);

  const groupIds = useMemo(() => (accounts ?? []).filter((a) => (childrenByParent.get(a.id) ?? []).length > 0).map((a) => a.id), [accounts, childrenByParent]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(account: ChartOfAccountDto) {
    if (!(await confirmDialog(t('accounting.chartOfAccounts.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteAccount.mutateAsync(account.id);
      toast.success(t('accounting.chartOfAccounts.deleteSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.chartOfAccounts.deleteError'));
    }
  }

  function renderRows(parentKey: string, depth: number): React.ReactNode[] {
    return (childrenByParent.get(parentKey) ?? [])
      .filter((account) => !visibleIds || visibleIds.has(account.id))
      .flatMap((account) => {
        const children = childrenByParent.get(account.id) ?? [];
        const expanded = visibleIds ? true : !collapsed.has(account.id);
        const isParent = children.length > 0;
        // Debit − credit, shown on the account's natural side (a supplier balance reads positive).
        const raw = balances.get(account.id) ?? 0n;
        const balance = account.normalBalance === 'credit' ? -raw : raw;
        const row = (
          <div
            key={account.id}
            role="row"
            className={cn(
              'group grid grid-cols-[minmax(0,1fr)_140px_160px_40px] items-center border-b text-sm last:border-b-0',
              isParent ? 'bg-muted/25 font-semibold' : 'cursor-pointer hover:bg-accent/50',
              !account.isActive && 'text-muted-foreground',
            )}
            onClick={isParent ? () => toggle(account.id) : () => navigate(`/accounting/reports/general-ledger?account=${account.id}&from=${today.slice(0, 4)}-01-01&to=${today}`)}
          >
            <div className="flex min-w-0 items-center gap-2 py-2" style={{ paddingInlineStart: 12 + depth * 22 }}>
              {isParent ? (
                expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="w-14 shrink-0 tabular-nums font-normal text-muted-foreground">{account.code}</span>
              <span className="truncate">{account.name}</span>
              {!account.isActive ? (
                <Badge variant="neutral" className="font-normal">
                  {t('accounting.chartOfAccounts.inactive')}
                </Badge>
              ) : null}
            </div>
            <div className="text-xs font-normal text-muted-foreground">
              {t(`accounting.chartOfAccounts.accountTypeValue.${account.accountType}`)}
            </div>
            <div className="pe-3 text-end">
              <Amount value={balance.toString()} hideCurrency zeroAsDash />
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <Can permission="accounting.manage">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="opacity-60 group-hover:opacity-100" aria-label={t('common.actions')}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {account.isGroup ? (
                      <DropdownMenuItem onSelect={() => navigate(`/accounting/chart-of-accounts/new?parent=${account.id}`)}>
                        {t('accounting.chartOfAccounts.addChildAccount')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => navigate(`/accounting/chart-of-accounts/${account.id}/edit`)}>{t('common.edit')}</DropdownMenuItem>
                    {!account.isSystem ? (
                      <DropdownMenuItem onSelect={() => handleDelete(account)}>{t('common.delete')}</DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Can>
            </div>
          </div>
        );
        return expanded ? [row, ...renderRows(account.id, depth + 1)] : [row];
      });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            className="h-9 w-72"
            placeholder={t('accounting.chartOfAccounts.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())} title={t('common.expand')}>
            <ChevronsUpDown className="me-1 h-4 w-4" />
            {t('accounting.chartOfAccounts.expandAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set(groupIds))} title={t('common.collapse')}>
            <ChevronsDownUp className="me-1 h-4 w-4" />
            {t('accounting.chartOfAccounts.collapseAll')}
          </Button>
        </div>
        <Can permission="accounting.manage">
          <Button onClick={() => navigate('/accounting/chart-of-accounts/new')}>
            <Plus className="me-1 h-4 w-4" />
            {t('accounting.chartOfAccounts.newAccount')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div role="table" className="overflow-hidden rounded-xl border bg-card">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,1fr)_140px_160px_40px] border-b bg-muted/50 py-2 text-xs font-medium text-muted-foreground"
          >
            <div className="ps-3">{t('accounting.chartOfAccounts.name')}</div>
            <div>{t('accounting.chartOfAccounts.accountType')}</div>
            <div className="pe-3 text-end">
              {t('accounting.chartOfAccounts.balanceToday')}
              {trialBalance ? ` (${trialBalance.currency})` : ''}
            </div>
            <div />
          </div>
          {(() => {
            const rows = renderRows(ROOT, 0);
            return rows.length ? rows : <p className="p-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>;
          })()}
        </div>
      )}

    </div>
  );
}
