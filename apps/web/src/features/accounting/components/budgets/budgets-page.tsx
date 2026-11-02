import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@erp-platform/ui';
import { ChevronLeft, PiggyBank, Plus } from 'lucide-react';

import { useBudgets, useSaveBudget } from '../../api/accounting-completion/queries';
import { useFiscalYears } from '../../api/fiscal-years/queries';
import { ApiError } from '../../../../lib/api-client';

/** الموازنات التقديرية — one card per budget, grouped by fiscal year. */
export function BudgetsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: budgets, isLoading } = useBudgets();
  const { data: years } = useFiscalYears();
  const [creating, setCreating] = useState(false);
  const yearName = (id: string) => years?.find((y) => y.id === id)?.name ?? '—';

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('accounting.tabs.budgets')}
        description={t('accounting.budgets.subtitle')}
        actions={
          <Can permission="accounting.manage">
            <Button onClick={() => setCreating(true)}>
              <Plus className="me-1 h-4 w-4" />
              {t('accounting.budgets.new')}
            </Button>
          </Can>
        }
      />
      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !budgets || budgets.length === 0 ? (
        <EmptyState icon={<PiggyBank />} title={t('accounting.budgets.emptyTitle')} description={t('accounting.budgets.emptyHint')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((budget) => (
            <button
              key={budget.id}
              type="button"
              onClick={() => navigate(`/accounting/budgets/${budget.id}`)}
              className="group flex items-center justify-between rounded-xl border bg-card px-5 py-4 text-start shadow-card transition-colors hover:border-primary/40"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{budget.name}</span>
                <span className="text-[13px] text-muted-foreground">{yearName(budget.fiscalYearId)}</span>
              </span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
            </button>
          ))}
        </div>
      )}
      <NewBudgetDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function NewBudgetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: years } = useFiscalYears();
  const save = useSaveBudget();
  const [name, setName] = useState('');
  const [fiscalYearId, setFiscalYearId] = useState('');

  async function create() {
    if (!name.trim() || !fiscalYearId) {
      toast.error(t('accounting.budgets.formError'));
      return;
    }
    try {
      const budget = await save.mutateAsync({ id: null, input: { name: name.trim(), fiscalYearId, lines: [] } });
      onOpenChange(false);
      navigate(`/accounting/budgets/${budget.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('accounting.budgets.new')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="budget-name">{t('accounting.budgets.name')}</Label>
            <Input id="budget-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accounting.budgets.namePlaceholder')} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('accounting.budgets.fiscalYear')}</Label>
            <Select value={fiscalYearId} onValueChange={setFiscalYearId}>
              <SelectTrigger>
                <SelectValue placeholder={t('accounting.budgets.chooseYear')} />
              </SelectTrigger>
              <SelectContent>
                {(years ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={create} disabled={save.isPending}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
