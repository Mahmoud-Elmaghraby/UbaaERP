import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CurrencyDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  useFeatureChecker,
} from '@erp-platform/ui';

import { CurrencySelect } from '../../components/document/currency-select';
import { ApiError } from '../../lib/api-client';
import { FEATURE_KEYS } from '../../lib/feature-keys';
import { useCreateExchangeRate, useCurrencies, useExchangeRates, useSaveCurrency, useTenantSettings } from './queries';

/**
 * Settings › Currencies: the currencies the company works with (every
 * currency picker reads this list) and, with Multi-Currency on, their
 * exchange rates against the company currency — independent of Accounting.
 */
export function CurrenciesTab() {
  const { t } = useTranslation();
  const { data: currencies } = useCurrencies();
  const { data: tenant } = useTenantSettings();
  const hasFeature = useFeatureChecker();
  const save = useSaveCurrency();
  const [editing, setEditing] = useState<CurrencyDto | 'new' | null>(null);
  const companyCurrency = tenant?.currencyCode;

  async function toggle(currency: CurrencyDto, isActive: boolean) {
    try {
      await save.mutateAsync({ code: currency.code, input: { isActive } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{t('settings.currencies.title')}</CardTitle>
            <CardDescription>{t('settings.currencies.description')}</CardDescription>
          </div>
          <Can permission="settings.manage">
            <Button onClick={() => setEditing('new')}>{t('settings.currencies.add')}</Button>
          </Can>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.currencies.code')}</TableHead>
                <TableHead>{t('settings.currencies.name')}</TableHead>
                <TableHead>{t('settings.currencies.symbol')}</TableHead>
                <TableHead>{t('common.active')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(currencies ?? []).map((currency) => (
                <TableRow key={currency.code}>
                  <TableCell dir="ltr" className="text-end font-mono">
                    {currency.code}
                  </TableCell>
                  <TableCell>
                    {currency.name}{' '}
                    {currency.code === companyCurrency ? <Badge variant="secondary">{t('settings.currencies.company')}</Badge> : null}
                  </TableCell>
                  <TableCell>{currency.symbol}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={currency.isActive}
                      disabled={currency.code === companyCurrency}
                      onCheckedChange={(checked) => toggle(currency, checked === true)}
                      aria-label={t('common.active')}
                    />
                  </TableCell>
                  <TableCell>
                    <Can permission="settings.manage">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(currency)}>
                        {t('common.edit')}
                      </Button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {hasFeature(FEATURE_KEYS.MULTI_CURRENCY) ? (
        <ExchangeRatesCard companyCurrency={companyCurrency ?? ''} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('settings.currencies.ratesNeedMultiCurrency')}</p>
      )}

      <CurrencyDialog value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CurrencyDialog({ value, onClose }: { value: CurrencyDto | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveCurrency();
  const existing = value && value !== 'new' ? value : null;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [openedFor, setOpenedFor] = useState<typeof value>(null);
  if (value !== openedFor) {
    setOpenedFor(value);
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setSymbol(existing?.symbol ?? '');
  }

  async function submit() {
    try {
      await save.mutateAsync(
        existing ? { code: existing.code, input: { name, symbol } } : { input: { code: code.toUpperCase(), name, symbol } },
      );
      toast.success(t('settings.currencies.saved'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? t('common.edit') : t('settings.currencies.add')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('settings.currencies.code')}</Label>
              <Input dir="ltr" maxLength={3} value={code} disabled={Boolean(existing)} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KWD" />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label>{t('settings.currencies.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('settings.currencies.symbol')}</Label>
            <Input className="w-32" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={save.isPending || !/^[A-Z]{3}$/.test(code) || !name.trim() || !symbol.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExchangeRatesCard({ companyCurrency }: { companyCurrency: string }) {
  const { t } = useTranslation();
  const { data: rates } = useExchangeRates(true);
  const create = useCreateExchangeRate();
  const [from, setFrom] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));

  async function submit() {
    try {
      await create.mutateAsync({ fromCurrency: from, toCurrency: companyCurrency, rate: rate.trim(), rateDate: date });
      toast.success(t('settings.currencies.saved'));
      setRate('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const latest = (rates ?? []).slice(0, 30);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.currencies.ratesTitle')}</CardTitle>
        <CardDescription>{t('settings.currencies.ratesDescription', { currency: companyCurrency })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Can permission="settings.manage">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid w-56 gap-1.5">
              <Label>{t('settings.currencies.from')}</Label>
              <CurrencySelect value={from} onChange={setFrom} />
            </div>
            <div className="grid w-40 gap-1.5">
              <Label>{t('settings.currencies.rate', { currency: companyCurrency })}</Label>
              <Input dir="ltr" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="48.50" />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('settings.currencies.date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Button
              onClick={submit}
              disabled={create.isPending || !from || from === companyCurrency || !/^\d+(\.\d+)?$/.test(rate.trim()) || !date}
            >
              {t('settings.currencies.addRate')}
            </Button>
          </div>
        </Can>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('settings.currencies.date')}</TableHead>
              <TableHead>{t('settings.currencies.from')}</TableHead>
              <TableHead>{t('settings.currencies.rate', { currency: companyCurrency })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {latest.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.rateDate}</TableCell>
                <TableCell dir="ltr" className="text-end font-mono">
                  {r.fromCurrency}
                </TableCell>
                <TableCell dir="ltr" className="text-end tabular">
                  {r.rate}
                </TableCell>
              </TableRow>
            ))}
            {latest.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
