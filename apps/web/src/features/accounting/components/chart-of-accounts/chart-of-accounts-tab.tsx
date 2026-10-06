import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import type { ChartOfAccountDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { useChartOfAccounts, useDeleteChartOfAccount } from '../../api/chart-of-accounts/queries';
import { ApiError } from '../../../../lib/api-client';
import { CreateChartOfAccountForm, EditChartOfAccountForm } from './chart-of-account-form';

/**
 * A true tree view, not a <DataTable> — the chart of accounts is small (a few dozen
 * rows for the seeded default template) and its parent/child structure is the whole
 * point of the screen, so a flat sortable/paginated table would actively work against
 * it. Built as a plain recursive render over a parentId -> children[] map rather than
 * a dedicated tree-view primitive (none exists in libs/ui yet), collapsed state kept
 * in a local Set of expanded ids, expanded-by-default since the whole tree is small.
 */
export function ChartOfAccountsTab() {
  const { t } = useTranslation();
  const { data: accounts, isLoading } = useChartOfAccounts();
  const deleteAccount = useDeleteChartOfAccount();

  const [createParentId, setCreateParentId] = useState<string | null | undefined>(undefined);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccountDto | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ChartOfAccountDto[]>();
    for (const account of accounts ?? []) {
      const key = account.parentId ?? '__root__';
      const list = map.get(key) ?? [];
      list.push(account);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.code.localeCompare(b.code));
    }
    return map;
  }, [accounts]);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(account: ChartOfAccountDto) {
    if (!window.confirm(t('accounting.chartOfAccounts.deleteConfirm'))) return;
    try {
      await deleteAccount.mutateAsync(account.id);
      toast.success(t('accounting.chartOfAccounts.deleteSuccess'));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t('accounting.chartOfAccounts.deleteError'),
      );
    }
  }

  function renderRow(account: ChartOfAccountDto, depth: number) {
    const children = childrenByParent.get(account.id) ?? [];
    const isExpanded = !collapsed.has(account.id);
    return (
      <div key={account.id}>
        <div
          className="flex items-center gap-2 border-b py-2"
          style={{ paddingInlineStart: depth * 20 }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(account.id)}
              className="text-muted-foreground"
              aria-label={isExpanded ? t('common.collapse') : t('common.expand')}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="font-mono text-sm text-muted-foreground">{account.code}</span>
          <span className={account.isGroup ? 'font-semibold' : ''}>{account.name}</span>
          {account.isGroup ? (
            <Badge variant="outline">{t('accounting.chartOfAccounts.group')}</Badge>
          ) : null}
          {!account.isActive ? (
            <Badge variant="secondary">{t('accounting.chartOfAccounts.inactive')}</Badge>
          ) : null}
          <Badge variant="outline">
            {t(`accounting.chartOfAccounts.accountTypeValue.${account.accountType}`)}
          </Badge>
          <div className="flex-1" />
          <Can permission="accounting.manage">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {account.isGroup ? (
                  <DropdownMenuItem onSelect={() => setCreateParentId(account.id)}>
                    {t('accounting.chartOfAccounts.addChildAccount')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => setEditingAccount(account)}>
                  {t('common.edit')}
                </DropdownMenuItem>
                {!account.isSystem ? (
                  <DropdownMenuItem onSelect={() => handleDelete(account)}>
                    {t('common.delete')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </Can>
        </div>
        {isExpanded ? children.map((child) => renderRow(child, depth + 1)) : null}
      </div>
    );
  }

  const roots = childrenByParent.get('__root__') ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Can permission="accounting.manage">
          <Button size="sm" onClick={() => setCreateParentId(null)}>
            {t('accounting.chartOfAccounts.newAccount')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-md border">
          {roots.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
          ) : (
            roots.map((account) => renderRow(account, 0))
          )}
        </div>
      )}

      <Dialog
        open={createParentId !== undefined}
        onOpenChange={(open) => !open && setCreateParentId(undefined)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('accounting.chartOfAccounts.newAccount')}</DialogTitle>
          </DialogHeader>
          {createParentId !== undefined ? (
            <CreateChartOfAccountForm
              parentId={createParentId}
              onDone={() => setCreateParentId(undefined)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingAccount !== null}
        onOpenChange={(open) => !open && setEditingAccount(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('common.edit')}</DialogTitle>
          </DialogHeader>
          {editingAccount ? (
            <EditChartOfAccountForm
              account={editingAccount}
              onDone={() => setEditingAccount(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
