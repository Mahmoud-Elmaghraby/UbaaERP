import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { StockAdjustmentReasonDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
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
  toast,
  useHasAnyPermission,
} from '@erp-platform/ui';

import {
  useAdjustmentReasons,
  useCreateAdjustmentReason,
  useDeleteAdjustmentReason,
  useUpdateAdjustmentReason,
} from '../../api/stock-documents/queries';
import { usePostableAccounts } from '../../../accounting/hooks/use-postable-accounts';
import { ApiError } from '../../../../lib/api-client';

const DEFAULT_ACCOUNT = '__default__';

/** أسباب تسوية المخزون — each reason may carry its own GL account (e.g. internal use → an expense). */
export function AdjustmentReasonsPage() {
  const { t } = useTranslation();
  const { data: reasons, isLoading } = useAdjustmentReasons();
  const canSeeAccounts = useHasAnyPermission(['accounting.manage']);
  const accounts = usePostableAccounts();
  const remove = useDeleteAdjustmentReason();
  const [editing, setEditing] = useState<StockAdjustmentReasonDto | 'new' | null>(null);
  const accountName = new Map(accounts.map((account) => [account.id, `${account.code} — ${account.name}`]));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('inventory.reasons.title')}
        description={t('inventory.reasons.description')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            {t('inventory.reasons.new')}
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Skeleton className="m-5 h-32" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inventory.reasons.name')}</TableHead>
                  <TableHead>{t('inventory.reasons.direction')}</TableHead>
                  <TableHead>{t('inventory.reasons.account')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reasons ?? []).map((reason) => (
                  <TableRow key={reason.id}>
                    <TableCell className="font-medium">{reason.name}</TableCell>
                    <TableCell>{t(`inventory.reasons.directions.${reason.direction}`)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {reason.accountId
                        ? (accountName.get(reason.accountId) ?? t('inventory.reasons.ownAccount'))
                        : t('inventory.reasons.defaultAccount')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={reason.isActive ? 'success' : 'neutral'} dot>
                        {reason.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.edit')}
                          onClick={() => setEditing(reason)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.delete')}
                          onClick={async () => {
                            if (!window.confirm(t('inventory.reasons.deleteConfirm', { name: reason.name }))) return;
                            try {
                              const result = await remove.mutateAsync(reason.id);
                              toast.success(result.deleted ? t('inventory.reasons.deleted') : t('inventory.reasons.deactivated'));
                            } catch (err) {
                              toast.error(err instanceof ApiError ? err.message : t('common.error'));
                            }
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {!canSeeAccounts ? <p className="text-xs text-muted-foreground">{t('inventory.reasons.accountsHidden')}</p> : null}
      {editing ? (
        <ReasonDialog reason={editing === 'new' ? null : editing} accounts={accounts} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function ReasonDialog({
  reason,
  accounts,
  onClose,
}: {
  reason: StockAdjustmentReasonDto | null;
  accounts: { id: string; code: string; name: string }[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAdjustmentReason();
  const update = useUpdateAdjustmentReason();
  const [name, setName] = useState(reason?.name ?? '');
  const [direction, setDirection] = useState<StockAdjustmentReasonDto['direction']>(reason?.direction ?? 'decrease');
  const [accountId, setAccountId] = useState<string | null>(reason?.accountId ?? null);
  const [isActive, setIsActive] = useState(reason?.isActive ?? true);

  async function submit() {
    if (!name.trim()) return;
    const input = { name: name.trim(), direction, accountId, isActive };
    try {
      if (reason) await update.mutateAsync({ id: reason.id, input });
      else await create.mutateAsync(input);
      toast.success(t('inventory.documents.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reason ? t('inventory.reasons.edit') : t('inventory.reasons.new')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t('inventory.reasons.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('inventory.reasons.direction')}</Label>
            <Select value={direction} onValueChange={(value) => setDirection(value as typeof direction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['decrease', 'increase', 'both'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`inventory.reasons.directions.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('inventory.reasons.account')}</Label>
            <Select
              value={accountId ?? DEFAULT_ACCOUNT}
              onValueChange={(value) => setAccountId(value === DEFAULT_ACCOUNT ? null : value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_ACCOUNT}>{t('inventory.reasons.defaultAccount')}</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('inventory.reasons.accountHint')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
            {t('common.active')}
          </label>
          <Button onClick={submit} disabled={!name.trim() || create.isPending || update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
