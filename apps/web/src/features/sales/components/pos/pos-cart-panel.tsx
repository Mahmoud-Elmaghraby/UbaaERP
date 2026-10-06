import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { paymentMethodSchema, type PosCheckoutDto, type PosCheckoutResultDto, type PosSessionDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { usePosCheckout } from '../../api/pos/queries';
import { useVariantLookup } from '../../../inventory/api/products/queries';
import {
  defaultPriceText,
  findVariantByCode,
  searchVariants,
  variantDisplayName,
} from '../../../../components/product/variant-search';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, formatMoney } from '../../../../lib/money';
import {
  createEmptyDiscountDraft,
  DiscountFields,
  resolveDiscountInput,
  type DiscountDraft,
} from '../../lib/discount-fields';
import { formatPreviewAmount, previewDiscountedAmount, previewLineAmount } from './pos-totals';

const PAYMENT_METHODS = paymentMethodSchema.options;

/** Sentinel for "no customer explicitly chosen" — checkout() then resolves the
 * tenant's Walk-in Customer server-side (findSystemDefault(), Stage 3). Same
 * nullable-FK <Select> sentinel convention used across this codebase, except this
 * one maps to "field omitted from the request" rather than an explicit null. */
const WALK_IN_SENTINEL = '__walk_in__';

interface CartLine {
  key: string;
  productVariantId: string;
  label: string;
  quantity: string;
  unitPrice: string;
  discount: DiscountDraft;
}

interface TenderDraft {
  key: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  amount: string;
  referenceNumber: string;
}

let nextKey = 0;
function makeKey(prefix: string): string {
  nextKey += 1;
  return `${prefix}-${nextKey}`;
}

function createEmptyTender(): TenderDraft {
  return { key: makeKey('tender'), paymentMethod: 'cash', amount: '', referenceNumber: '' };
}

/**
 * POS Stage 4 (claude/sales-pos-research.md §4) — the actual checkout screen: product
 * search + cart, header discount, customer (optional), tenders, and the single
 * "checkout" action that calls PosSalesService.checkout() (Stage 3) — Sales Order →
 * Delivery → Sales Invoice → Payment(s) Received, atomically, in one call.
 *
 * Product search runs over the whole catalogue fetched once (useVariantLookup):
 * Arabic-spelling-tolerant name search plus SKU/code/barcode, and Enter adds the
 * exact barcode/code match (or the best result) — so a barcode scanner, which types
 * the code and presses Enter, adds the item straight to the cart. The line price starts at the
 * item's default sale price (when set, in the session currency) and stays editable.
 */
export function PosCartPanel({ session }: { session: PosSessionDto }) {
  const { t } = useTranslation();
  const currency = session.openingCashAmount.currency;
  const { data: customers } = useCustomers();
  const { data: catalogue } = useVariantLookup();
  const checkout = usePosCheckout();

  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>(WALK_IN_SENTINEL);
  const [headerDiscount, setHeaderDiscount] = useState<DiscountDraft>(() => createEmptyDiscountDraft());
  const [tenders, setTenders] = useState<TenderDraft[]>(() => [createEmptyTender()]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PosCheckoutResultDto | null>(null);

  const sellable = useMemo(
    () => (catalogue ?? []).filter((variant) => variant.isActive && variant.productIsActive),
    [catalogue],
  );

  const searchResults = useMemo(() => {
    if (search.trim() === '') return [];
    return searchVariants(sellable, search)
      .slice(0, 20)
      .map((variant) => ({ productVariantId: variant.id, label: `${variantDisplayName(variant)} — ${variant.sku}` }));
  }, [sellable, search]);

  /** Enter in the search box: exact barcode/SKU/code first (scanner), else the top result. */
  function addFromSearch() {
    const exact = findVariantByCode(sellable, search);
    if (exact) {
      addToCart(exact.id, `${variantDisplayName(exact)} — ${exact.sku}`);
      return;
    }
    const first = searchResults[0];
    if (first) addToCart(first.productVariantId, first.label);
    else if (search.trim() !== '') toast.error(t('pos.cart.notFound'));
  }

  function addToCart(productVariantId: string, label: string) {
    const variant = sellable.find((entry) => entry.id === productVariantId);
    const defaultPrice = variant ? defaultPriceText(variant, 'sale', currency) : null;
    setLines((prev) => {
      const existing = prev.find((l) => l.productVariantId === productVariantId);
      if (existing) {
        const nextQuantity = (Number(existing.quantity) || 0) + 1;
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: String(nextQuantity) } : l));
      }
      return [
        ...prev,
        {
          key: makeKey('line'),
          productVariantId,
          label,
          quantity: '1',
          unitPrice: defaultPrice ?? '',
          discount: createEmptyDiscountDraft(),
        },
      ];
    });
    setSearch('');
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateTender(key: string, patch: Partial<TenderDraft>) {
    setTenders((prev) => prev.map((t2) => (t2.key === key ? { ...t2, ...patch } : t2)));
  }

  function removeTender(key: string) {
    setTenders((prev) => prev.filter((t2) => t2.key !== key));
  }

  const cartSubtotalPreview = lines.reduce(
    (sum, line) => sum + previewDiscountedAmount(previewLineAmount(line.unitPrice, line.quantity), line.discount),
    0,
  );
  const cartTotalPreview = previewDiscountedAmount(cartSubtotalPreview, headerDiscount);
  const tenderedPreview = tenders.reduce((sum, tender) => sum + (Number(tender.amount) || 0), 0);
  const remainingPreview = cartTotalPreview - tenderedPreview;

  function resetCart() {
    setLines([]);
    setCustomerId(WALK_IN_SENTINEL);
    setHeaderDiscount(createEmptyDiscountDraft());
    setTenders([createEmptyTender()]);
    setNotes('');
    setError(null);
  }

  async function onCheckout() {
    setError(null);
    if (lines.length === 0) {
      setError(t('pos.cart.emptyError'));
      return;
    }

    const preparedLines: PosCheckoutDto['lines'] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(t('pos.cart.lineError'));
        return;
      }
      let amountMinorUnits: string;
      try {
        amountMinorUnits = decimalToMinorUnits(line.unitPrice);
      } catch {
        setError(t('pos.cart.lineError'));
        return;
      }
      const resolvedDiscount = resolveDiscountInput(line.discount, currency);
      if (resolvedDiscount === 'invalid') {
        setError(t('sales.salesOrders.discountError'));
        return;
      }
      preparedLines.push({
        productVariantId: line.productVariantId,
        quantity,
        unitPrice: { amountMinorUnits, currency },
        ...resolvedDiscount,
      });
    }

    const resolvedHeaderDiscount = resolveDiscountInput(headerDiscount, currency);
    if (resolvedHeaderDiscount === 'invalid') {
      setError(t('sales.salesOrders.discountError'));
      return;
    }

    if (tenders.length === 0) {
      setError(t('pos.tenders.emptyError'));
      return;
    }
    const preparedTenders: PosCheckoutDto['tenders'] = [];
    for (const tender of tenders) {
      let amountMinorUnits: string;
      try {
        amountMinorUnits = decimalToMinorUnits(tender.amount);
      } catch {
        setError(t('pos.tenders.amountError'));
        return;
      }
      if (BigInt(amountMinorUnits) <= 0n) {
        setError(t('pos.tenders.amountError'));
        return;
      }
      preparedTenders.push({
        paymentMethod: tender.paymentMethod,
        amount: { amountMinorUnits, currency },
        referenceNumber: tender.referenceNumber.trim() === '' ? undefined : tender.referenceNumber,
      });
    }

    const payload: PosCheckoutDto = {
      customerId: customerId === WALK_IN_SENTINEL ? undefined : customerId,
      lines: preparedLines,
      tenders: preparedTenders,
      notes: notes.trim() === '' ? undefined : notes,
      ...resolvedHeaderDiscount,
    };

    try {
      const result = await checkout.mutateAsync({ posSessionId: session.id, input: payload });
      setLastResult(result);
      toast.success(t('pos.checkout.success'));
      resetCart();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('pos.checkout.error'));
    }
  }

  return (
    <div className="grid gap-4">
      {lastResult ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('pos.checkout.lastSaleTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">{t('pos.checkout.invoiceNumber')}</p>
              <p className="font-medium">{lastResult.salesInvoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('sales.salesOrders.totalAmount')}</p>
              <p className="font-medium">
                {formatMoney(
                  lastResult.salesInvoice.totalAmount.amountMinorUnits,
                  lastResult.salesInvoice.totalAmount.currency,
                )}
              </p>
            </div>
            <Button variant="outline" onClick={() => setLastResult(null)}>
              {t('pos.checkout.newSale')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('pos.cart.searchTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addFromSearch();
              }
            }}
            placeholder={t('pos.cart.searchPlaceholder')}
            autoFocus
          />
          {searchResults.length > 0 ? (
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-1">
              {searchResults.map((result) => (
                <Button
                  key={result.productVariantId}
                  type="button"
                  variant="ghost"
                  className="justify-start"
                  onClick={() => addToCart(result.productVariantId, result.label)}
                >
                  <Plus className="me-2 h-4 w-4" />
                  {result.label}
                </Button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('pos.cart.title')} <Badge variant="secondary">{lines.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('pos.cart.empty')}</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sales.salesOrders.lineProduct')}</TableHead>
                    <TableHead className="w-24">{t('sales.salesOrders.lineQuantity')}</TableHead>
                    <TableHead className="w-32">{t('sales.salesOrders.lineUnitPrice', { currency })}</TableHead>
                    <TableHead className="w-40">{t('sales.salesOrders.lineDiscount')}</TableHead>
                    <TableHead className="w-28">{t('pos.cart.lineTotal')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.key}>
                      <TableCell>{line.label}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1">
                          <Select
                            value={line.discount.discountType}
                            onValueChange={(next) =>
                              updateLine(line.key, {
                                discount: { ...line.discount, discountType: next as DiscountDraft['discountType'] },
                              })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t('sales.salesOrders.discountTypeNone')}</SelectItem>
                              <SelectItem value="percentage">{t('sales.salesOrders.discountTypePercentage')}</SelectItem>
                              <SelectItem value="fixed">{t('sales.salesOrders.discountTypeFixed')}</SelectItem>
                            </SelectContent>
                          </Select>
                          {line.discount.discountType === 'percentage' ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="any"
                              inputMode="decimal"
                              placeholder="%"
                              className="h-8"
                              value={line.discount.discountPercentage}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  discount: { ...line.discount, discountPercentage: e.target.value },
                                })
                              }
                            />
                          ) : null}
                          {line.discount.discountType === 'fixed' ? (
                            <Input
                              inputMode="decimal"
                              placeholder="0.00"
                              className="h-8"
                              value={line.discount.discountFixedAmount}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  discount: { ...line.discount, discountFixedAmount: e.target.value },
                                })
                              }
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatPreviewAmount(
                          previewDiscountedAmount(previewLineAmount(line.unitPrice, line.quantity), line.discount),
                          currency,
                        )}
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.key)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('pos.checkout.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:max-w-sm">
            <label className="text-sm font-medium">{t('pos.customer.label')}</label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WALK_IN_SENTINEL}>{t('pos.customer.walkIn')}</SelectItem>
                {(customers ?? [])
                  .filter((c) => !c.isSystemDefault)
                  .map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />
          <p className="text-sm font-medium text-muted-foreground">{t('sales.salesOrders.discountSectionTitle')}</p>
          <DiscountFields value={headerDiscount} onChange={setHeaderDiscount} currency={currency} />

          <Separator />
          <div className="grid gap-2">
            <p className="text-sm font-medium text-muted-foreground">{t('pos.tenders.title')}</p>
            {tenders.map((tender) => (
              <div key={tender.key} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">{t('sales.paymentsReceived.paymentMethod')}</label>
                  <Select
                    value={tender.paymentMethod}
                    onValueChange={(value) =>
                      updateTender(tender.key, { paymentMethod: value as TenderDraft['paymentMethod'] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {t(`sales.paymentsReceived.paymentMethodValue.${method}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">{t('pos.tenders.amount', { currency })}</label>
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={tender.amount}
                    onChange={(e) => updateTender(tender.key, { amount: e.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">{t('pos.tenders.referenceNumber')}</label>
                  <Input
                    value={tender.referenceNumber}
                    onChange={(e) => updateTender(tender.key, { referenceNumber: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTender(tender.key)}
                  disabled={tenders.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() => setTenders((prev) => [...prev, createEmptyTender()])}
            >
              <Plus className="me-1 h-4 w-4" />
              {t('pos.tenders.addTender')}
            </Button>
          </div>

          <Separator />
          <div className="grid gap-2">
            <label className="text-sm font-medium">{t('pos.notes')}</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Separator />
          <div className="grid gap-1 text-sm sm:max-w-xs sm:justify-self-end">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('sales.salesOrders.subtotalAmount')}</span>
              <span>{formatPreviewAmount(cartSubtotalPreview, currency)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>{t('sales.salesOrders.totalAmount')}</span>
              <span>{formatPreviewAmount(cartTotalPreview, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pos.tenders.totalTendered')}</span>
              <span>{formatPreviewAmount(tenderedPreview, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {remainingPreview > 0 ? t('pos.tenders.remainingDue') : t('pos.tenders.changeDue')}
              </span>
              <span>{formatPreviewAmount(Math.abs(remainingPreview), currency)}</span>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={onCheckout} disabled={checkout.isPending} className="mt-2">
            {t('pos.checkout.submit')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
