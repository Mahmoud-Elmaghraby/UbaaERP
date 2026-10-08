import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Banknote, Building2, MoreHorizontal, Plus, Smartphone, Star } from 'lucide-react';
import type { TreasuryDto, TreasuryKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { useDeleteTreasury, useTreasuries } from '../api/queries';
import { TreasuryFormDialog } from './treasury-form-dialog';
import { useTenantSettings } from '../../settings/queries';
import { formatAmount, sumMinorUnits } from '../../../lib/money';
import { ApiError } from '../../../lib/api-client';

const KIND_ICONS: Record<TreasuryKindDto, typeof Banknote> = { cash: Banknote, bank: Building2, wallet: Smartphone };

/** الخزائن — every cash box, bank account and e-wallet with its current balance. */
export function TreasuriesPage() {
  const { t } = useTranslation();
  const { data: treasuries, isLoading } = useTreasuries();
  const { data: tenantSettings } = useTenantSettings();
  const remove = useDeleteTreasury();
  const [editing, setEditing] = useState<TreasuryDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const currencies = [...new Set((treasuries ?? []).filter((x) => x.isActive).map((x) => x.currency))];

  async function handleDelete(treasury: TreasuryDto) {
    if (!window.confirm(t('treasury.deleteConfirm', { name: treasury.name }))) return;
    try {
      await remove.mutateAsync(treasury.id);
      toast.success(t('treasury.deleted'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('treasury.title')}
        description={t('treasury.subtitle')}
        actions={
          <Can permission="treasury.manage">
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              {t('treasury.new')}
            </Button>
          </Can>
        }
      />

      {currencies.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {currencies.map((currency) => (
            <Card key={currency}>
              <CardContent className="grid gap-1 p-4">
                <span className="text-sm text-muted-foreground">{t('treasury.totalBalance')}</span>
                <span className="text-xl font-bold tabular-nums" dir="ltr">
                  {formatAmount(
                    sumMinorUnits(
                      (treasuries ?? []).filter((x) => x.isActive && x.currency === currency).map((x) => x.balance.amountMinorUnits),
                    ),
                  )}{' '}
                  <span className="text-sm font-normal text-muted-foreground">{currency}</span>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(treasuries ?? []).map((treasury) => {
          const Icon = KIND_ICONS[treasury.kind];
          const negative = treasury.balance.amountMinorUnits.startsWith('-');
          return (
            <Card key={treasury.id} className={treasury.isActive ? '' : 'opacity-60'}>
              <CardContent className="grid gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <Link to={`/treasury/${treasury.id}`} className="font-semibold hover:underline">
                        {treasury.name}
                      </Link>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {[treasury.code, treasury.bankName, treasury.accountNumber].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {treasury.isDefault ? (
                      <Badge variant="brand">
                        <Star className="h-3 w-3" />
                        {t('treasury.default')}
                      </Badge>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/treasury/${treasury.id}`}>{t('treasury.statement')}</Link>
                        </DropdownMenuItem>
                        <Can permission="treasury.manage">
                          <>
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(treasury);
                                setFormOpen(true);
                              }}
                            >
                              {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleDelete(treasury)}>{t('common.delete')}</DropdownMenuItem>
                          </>
                        </Can>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <Badge variant="neutral">{t(`treasury.kinds.${treasury.kind}`)}</Badge>
                  <span className={`text-lg font-bold tabular-nums ${negative ? 'text-destructive' : ''}`} dir="ltr">
                    {formatAmount(treasury.balance.amountMinorUnits)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">{treasury.currency}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TreasuryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        treasury={editing}
        defaultCurrency={tenantSettings?.currencyCode ?? 'EGP'}
      />
    </div>
  );
}
