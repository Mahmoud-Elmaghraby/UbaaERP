import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { TreasuryCategoryDto, TreasuryCategoryKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  useHasFeature,
} from '@erp-platform/ui';

import { useDeleteTreasuryCategory, useSaveTreasuryCategory, useTreasuryCategories } from '../api/queries';
import { ChartAccountSelect } from './chart-account-select';
import { useChartOfAccounts } from '../../accounting/api/chart-of-accounts/queries';
import { FEATURE_KEYS } from '../../../lib/feature-keys';
import { ApiError } from '../../../lib/api-client';

/** بنود المصروفات والإيرادات — what an expense / income voucher is booked against. */
export function TreasuryCategoriesPage() {
  const { t } = useTranslation();
  const { data: categories } = useTreasuryCategories();
  const accountingOn = useHasFeature(FEATURE_KEYS.ACCOUNTING);
  const remove = useDeleteTreasuryCategory();
  const [editing, setEditing] = useState<TreasuryCategoryDto | { kind: TreasuryCategoryKindDto } | null>(null);

  async function handleDelete(category: TreasuryCategoryDto) {
    if (!window.confirm(t('treasury.categories.deleteConfirm', { name: category.name }))) return;
    try {
      await remove.mutateAsync(category.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={t('treasury.categories.title')} description={t('treasury.categories.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-2">
        {(['expense', 'income'] as const).map((kind) => (
          <Card key={kind}>
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{t(`treasury.categories.kinds.${kind}`)}</h2>
                <Can permission="treasury.manage">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ kind })}>
                    <Plus />
                    {t('treasury.categories.new')}
                  </Button>
                </Can>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('treasury.categories.name')}</TableHead>
                    {accountingOn ? <TableHead>{t('treasury.chartAccount')}</TableHead> : null}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(categories ?? [])
                    .filter((c) => c.kind === kind)
                    .map((c) => (
                      <TableRow key={c.id} className={c.isActive ? '' : 'text-muted-foreground'}>
                        <TableCell>
                          {c.name} {c.isActive ? null : <Badge variant="neutral">{t('common.inactive')}</Badge>}
                        </TableCell>
                        {accountingOn ? <TableCell><AccountName id={c.chartOfAccountId} /></TableCell> : null}
                        <TableCell className="whitespace-nowrap text-end">
                          <Can permission="treasury.manage">
                            <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                              {t('common.edit')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(c)}>
                              {t('common.delete')}
                            </Button>
                          </Can>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
      <CategoryDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function AccountName({ id }: { id: string | null }) {
  const { t } = useTranslation();
  const { data: accounts } = useChartOfAccounts();
  if (!id) return <span className="text-xs text-muted-foreground">{t('treasury.categories.noAccount')}</span>;
  const account = accounts?.find((a) => a.id === id);
  return <span className="text-sm">{account ? `${account.code} — ${account.name}` : '…'}</span>;
}

function CategoryDialog({
  value,
  onClose,
}: {
  value: TreasuryCategoryDto | { kind: TreasuryCategoryKindDto } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveTreasuryCategory();
  const existing = value && 'id' in value ? value : null;
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setName(existing?.name ?? '');
    setAccountId(existing?.chartOfAccountId ?? null);
    setIsActive(existing?.isActive ?? true);
  }, [value]);

  async function submit() {
    if (!value) return;
    try {
      await save.mutateAsync(
        existing
          ? { id: existing.id, input: { name: name.trim(), chartOfAccountId: accountId, isActive } }
          : { input: { kind: value.kind, name: name.trim(), chartOfAccountId: accountId } },
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{value ? t(`treasury.categories.kinds.${value.kind}`) : ''}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('treasury.categories.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <ChartAccountSelect value={accountId} onChange={setAccountId} hint={t('treasury.categories.accountHint')} />
          {existing ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              {t('common.active')}
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={!name.trim() || save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
