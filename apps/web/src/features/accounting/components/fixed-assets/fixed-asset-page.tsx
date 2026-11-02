import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ChartOfAccountDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
  Textarea,
  toast,
} from '@erp-platform/ui';
import { Ban, Trash2 } from 'lucide-react';

import {
  useDeleteFixedAsset,
  useDisposeFixedAsset,
  useFixedAsset,
  useSaveFixedAsset,
  type FixedAssetDetail,
} from '../../api/accounting-completion/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { DocumentBody, DocumentHeaderBar, SectionCard } from '../../../../components/document/document-layout';
import { useBaseCurrency } from '../../../settings/queries';
import { AccountPicker } from '../account-picker';
import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { useActiveCostCenters } from '../../hooks/use-active-cost-centers';
import { FIXED_ASSET_STATUS_VARIANT } from './fixed-asset-status';

const NO_COST_CENTER = '__none__';

function toMinor(text: string): string | null {
  if (text.trim() === '') return '0';
  try {
    return decimalToMinorUnits(text.trim());
  } catch {
    return null;
  }
}

function decimal(minor: string | undefined): string {
  return minor && minor !== '0' ? minorUnitsToDecimalString(minor) : '';
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** /accounting/fixed-assets/new and /:id — the asset card, its depreciation history and disposal. */
export function FixedAssetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useFixedAsset(id);
  if (id && isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <FixedAssetEditor key={data?.id ?? 'new'} asset={id ? data : undefined} />;
}

function FixedAssetEditor({ asset }: { asset: FixedAssetDetail | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currency = useBaseCurrency();
  const save = useSaveFixedAsset();
  const remove = useDeleteFixedAsset();
  const costCenters = useActiveCostCenters();
  const postable = usePostableAccounts();
  const assetAccounts = useMemo(() => postable.filter((a) => a.accountType === 'asset'), [postable]);
  const expenseAccounts = useMemo(() => postable.filter((a) => a.accountType === 'expense'), [postable]);

  const [code, setCode] = useState(asset?.code ?? '');
  const [name, setName] = useState(asset?.name ?? '');
  const [acquisitionDate, setAcquisitionDate] = useState(asset?.acquisitionDate ?? todayIso());
  const [depreciationStart, setDepreciationStart] = useState(asset?.depreciationStart ?? '');
  const [cost, setCost] = useState(decimal(asset?.costMinorUnits));
  const [salvage, setSalvage] = useState(decimal(asset?.salvageMinorUnits));
  const [opening, setOpening] = useState(decimal(asset?.openingAccumulatedMinorUnits));
  const [lifeMonths, setLifeMonths] = useState(asset ? String(asset.usefulLifeMonths) : '60');
  const [assetAccountId, setAssetAccountId] = useState(asset?.assetAccountId ?? '');
  const [accumulatedAccountId, setAccumulatedAccountId] = useState(asset?.accumulatedAccountId ?? '');
  const [expenseAccountId, setExpenseAccountId] = useState(asset?.expenseAccountId ?? '');
  const [costCenterId, setCostCenterId] = useState(asset?.costCenterId ?? NO_COST_CENTER);
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [disposing, setDisposing] = useState(false);
  const locked = asset !== undefined && (asset.depreciations.length > 0 || asset.status !== 'active');
  const readOnly = asset?.status === 'disposed';

  const preview = useMemo(() => {
    const c = toMinor(cost);
    const s = toMinor(salvage);
    const life = Number(lifeMonths);
    if (!c || !s || !Number.isInteger(life) || life <= 0) return null;
    const depreciable = BigInt(c) - BigInt(s);
    return depreciable > 0n ? (depreciable / BigInt(life)).toString() : null;
  }, [cost, salvage, lifeMonths]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (readOnly) return;
    setError(null);
    const costMinor = toMinor(cost);
    const salvageMinor = toMinor(salvage);
    const openingMinor = toMinor(opening);
    const life = Number(lifeMonths);
    if (!name.trim() || !costMinor || costMinor === '0' || !salvageMinor || !openingMinor || !Number.isInteger(life) || life <= 0) {
      setError(t('accounting.fixedAssets.formError'));
      return;
    }
    if (!assetAccountId || !accumulatedAccountId || !expenseAccountId) {
      setError(t('accounting.fixedAssets.accountsRequired'));
      return;
    }
    try {
      const saved = await save.mutateAsync({
        id: asset?.id ?? null,
        input: {
          code: code.trim() || undefined,
          name: name.trim(),
          acquisitionDate,
          depreciationStart: depreciationStart || undefined,
          costMinorUnits: costMinor,
          salvageMinorUnits: salvageMinor,
          openingAccumulatedMinorUnits: openingMinor,
          usefulLifeMonths: life,
          assetAccountId,
          accumulatedAccountId,
          expenseAccountId,
          costCenterId: costCenterId === NO_COST_CENTER ? null : costCenterId,
          notes: notes.trim() || null,
        },
      });
      toast.success(t('accounting.fixedAssets.saved'));
      if (!asset) navigate(`/accounting/fixed-assets/${saved.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function onDelete() {
    if (!asset || !(await confirmDialog(t('accounting.fixedAssets.deleteConfirm', { name: asset.name }), { tone: 'danger' }))) return;
    try {
      await remove.mutateAsync(asset.id);
      navigate('/accounting/fixed-assets');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const accountField = (label: string, value: string, set: (id: string) => void, list: readonly ChartOfAccountDto[], hint?: string) => (
    <Field label={label} hint={hint}>
      <AccountPicker value={value || null} onChange={(id) => set(id)} accounts={list.length > 0 ? list : undefined} className={locked ? 'pointer-events-none opacity-70' : undefined} />
    </Field>
  );

  return (
    <>
    <form onSubmit={submit}>
      <DocumentHeaderBar
        backTo="/accounting/fixed-assets"
        backLabel={t('accounting.tabs.fixedAssets')}
        eyebrow={asset ? asset.code : t('accounting.tabs.fixedAssets')}
        title={asset ? asset.name : t('accounting.fixedAssets.new')}
        status={
          asset ? (
            <Badge variant={FIXED_ASSET_STATUS_VARIANT[asset.status]} dot>
              {t(`accounting.fixedAssets.statuses.${asset.status}`)}
            </Badge>
          ) : null
        }
        actions={
          <Can permission="accounting.manage">
            {asset && !locked ? (
              <Button type="button" variant="ghost" onClick={onDelete} disabled={remove.isPending}>
                <Trash2 className="me-1 h-4 w-4" />
                {t('common.delete')}
              </Button>
            ) : null}
            {asset && asset.status !== 'disposed' ? (
              <Button type="button" variant="outline" onClick={() => setDisposing(true)}>
                <Ban className="me-1 h-4 w-4" />
                {t('accounting.fixedAssets.dispose')}
              </Button>
            ) : null}
            {!readOnly ? (
              <Button type="submit" disabled={save.isPending} title="Ctrl+S">
                {t('common.save')}
              </Button>
            ) : null}
          </Can>
        }
      />
      <DocumentBody
        main={
          <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5">
            <SectionCard title={t('accounting.fixedAssets.basics')}>
              <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                <Field label={t('accounting.fixedAssets.code')} htmlFor="fa-code">
                  <Input id="fa-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('common.autoCodePlaceholder')} />
                </Field>
                <Field label={t('accounting.fixedAssets.name')} htmlFor="fa-name">
                  <Input id="fa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accounting.fixedAssets.namePlaceholder')} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title={t('accounting.fixedAssets.valuation')} description={locked ? t('accounting.fixedAssets.lockedHint') : undefined}>
              <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-3">
                <Field label={t('accounting.fixedAssets.acquisitionDate')} htmlFor="fa-acq">
                  <Input id="fa-acq" type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
                </Field>
                <Field label={t('accounting.fixedAssets.depreciationStart')} htmlFor="fa-start" hint={t('accounting.fixedAssets.depreciationStartHint')}>
                  <Input id="fa-start" type="date" value={depreciationStart} onChange={(e) => setDepreciationStart(e.target.value)} />
                </Field>
                <Field label={t('accounting.fixedAssets.usefulLife')} htmlFor="fa-life" hint={t('accounting.fixedAssets.usefulLifeHint')}>
                  <Input id="fa-life" inputMode="numeric" dir="ltr" className="text-end" value={lifeMonths} onChange={(e) => setLifeMonths(e.target.value.replace(/\D/g, ''))} />
                </Field>
                <Field label={t('accounting.fixedAssets.cost')} htmlFor="fa-cost">
                  <Input id="fa-cost" inputMode="decimal" dir="ltr" className="text-end" value={cost} onChange={(e) => setCost(e.target.value)} />
                </Field>
                <Field label={t('accounting.fixedAssets.salvage')} htmlFor="fa-salvage">
                  <Input id="fa-salvage" inputMode="decimal" dir="ltr" className="text-end" value={salvage} onChange={(e) => setSalvage(e.target.value)} />
                </Field>
                <Field label={t('accounting.fixedAssets.openingAccumulated')} htmlFor="fa-opening" hint={t('accounting.fixedAssets.openingHint')}>
                  <Input id="fa-opening" inputMode="decimal" dir="ltr" className="text-end" value={opening} onChange={(e) => setOpening(e.target.value)} />
                </Field>
              </fieldset>
              {preview ? (
                <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm">
                  {t('accounting.fixedAssets.monthlyPreview')} <Amount value={preview} currency={currency} className="font-semibold" />
                </p>
              ) : null}
            </SectionCard>

            <SectionCard title={t('accounting.fixedAssets.accounts')}>
              <div className="grid gap-4 sm:grid-cols-2">
                {accountField(t('accounting.fixedAssets.assetAccount'), assetAccountId, setAssetAccountId, assetAccounts)}
                {accountField(t('accounting.fixedAssets.accumulatedAccount'), accumulatedAccountId, setAccumulatedAccountId, assetAccounts, t('accounting.fixedAssets.accumulatedAccountHint'))}
                {accountField(t('accounting.fixedAssets.expenseAccount'), expenseAccountId, setExpenseAccountId, expenseAccounts)}
                <Field label={t('accounting.fixedAssets.costCenter')}>
                  <Select value={costCenterId} onValueChange={setCostCenterId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COST_CENTER}>{t('accounting.fixedAssets.noCostCenter')}</SelectItem>
                      {costCenters.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-4">
                <Field label={t('accounting.journalEntries.notes')} htmlFor="fa-notes">
                  <Textarea id="fa-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </SectionCard>
          </fieldset>
        }
        side={
          asset ? (
            <>
              <SectionCard title={t('accounting.fixedAssets.summary')}>
                <dl className="grid gap-2.5 text-sm">
                  {[
                    { label: t('accounting.fixedAssets.cost'), value: <Amount value={asset.costMinorUnits} currency={currency} /> },
                    { label: t('accounting.fixedAssets.accumulated'), value: <Amount value={asset.accumulatedMinorUnits} currency={currency} /> },
                    { label: t('accounting.fixedAssets.bookValue'), value: <Amount value={asset.bookValueMinorUnits} currency={currency} className="font-semibold" /> },
                    { label: t('accounting.fixedAssets.monthly'), value: <Amount value={asset.monthlyDepreciationMinorUnits} currency={currency} /> },
                    { label: t('accounting.fixedAssets.depreciatedThrough'), value: asset.lastDepreciatedThrough ? formatDate(asset.lastDepreciatedThrough) : '—' },
                    ...(asset.disposedAt ? [{ label: t('accounting.fixedAssets.disposedAt'), value: formatDate(asset.disposedAt) }] : []),
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd className="tabular-nums">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>
              <SectionCard title={t('accounting.fixedAssets.history')} flush>
                {asset.depreciations.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-muted-foreground">{t('accounting.fixedAssets.noHistory')}</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('accounting.fixedAssets.month')}</TableHead>
                          <TableHead className="text-end">{t('accounting.fixedAssets.amount')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...asset.depreciations].reverse().map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="tabular-nums">
                              {d.journalEntryId ? (
                                <Link className="text-primary hover:underline" to={`/accounting/journal-entries/${d.journalEntryId}`}>
                                  {d.periodEnd.slice(0, 7)}
                                </Link>
                              ) : (
                                d.periodEnd.slice(0, 7)
                              )}
                            </TableCell>
                            <TableCell className={AMOUNT_CELL}>
                              <Amount value={d.amountMinorUnits} hideCurrency />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionCard>
            </>
          ) : undefined
        }
      />
    </form>
    {asset ? <DisposeDialog asset={asset} open={disposing} onOpenChange={setDisposing} /> : null}
    </>
  );
}

function DisposeDialog({ asset, open, onOpenChange }: { asset: FixedAssetDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const dispose = useDisposeFixedAsset();
  const [date, setDate] = useState(todayIso());
  const [proceeds, setProceeds] = useState('');
  const [proceedsAccountId, setProceedsAccountId] = useState('');
  const [gainLossAccountId, setGainLossAccountId] = useState('');

  async function confirm() {
    const proceedsMinor = toMinor(proceeds);
    if (!proceedsMinor || !gainLossAccountId || (proceedsMinor !== '0' && !proceedsAccountId)) {
      toast.error(t('accounting.fixedAssets.disposeFormError'));
      return;
    }
    try {
      await dispose.mutateAsync({
        id: asset.id,
        input: { date, proceedsMinorUnits: proceedsMinor, proceedsAccountId: proceedsAccountId || null, gainLossAccountId },
      });
      toast.success(t('accounting.fixedAssets.disposed'));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('accounting.fixedAssets.disposeTitle', { name: asset.name })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('accounting.fixedAssets.disposeHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('accounting.fixedAssets.disposeDate')} htmlFor="fa-dispose-date">
            <Input id="fa-dispose-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('accounting.fixedAssets.proceeds')} htmlFor="fa-proceeds" hint={t('accounting.fixedAssets.proceedsHint')}>
            <Input id="fa-proceeds" inputMode="decimal" dir="ltr" className="text-end" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
          </Field>
          <Field label={t('accounting.fixedAssets.proceedsAccount')}>
            <AccountPicker value={proceedsAccountId || null} onChange={(id) => setProceedsAccountId(id)} />
          </Field>
          <Field label={t('accounting.fixedAssets.gainLossAccount')}>
            <AccountPicker value={gainLossAccountId || null} onChange={(id) => setGainLossAccountId(id)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={dispose.isPending}>
            {t('accounting.fixedAssets.confirmDispose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
