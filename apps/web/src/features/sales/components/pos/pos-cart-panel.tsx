import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  Undo2,
  UserX,
  Wallet,
  X,
} from 'lucide-react';
import {
  paymentMethodSchema,
  type PosCheckoutDto,
  type PosCheckoutResultDto,
  type PosHeldCartDto,
  type PosSessionDto,
} from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  toast,
} from '@erp-platform/ui';

import { useCustomers } from '../../api/customers/queries';
import { useHoldPosCart, usePosCheckout, usePosExchange, usePosHeldCarts } from '../../api/pos/queries';
import { useVariantLookup, useVariantLookupMap } from '../../../inventory/api/products/queries';
import { useDocumentPriceList } from '../../api/price-lists/use-document-price-list';
import { PriceListSelect } from '../price-lists/price-list-select';
import { repricedValue } from '../../../../components/product/sale-pricing';
import { useInventorySettings } from '../../../inventory/api/catalog/queries';
import { resolveScan, searchVariants, variantDisplayName } from '../../../../components/product/variant-search';
import { LineUnitSelect } from '../../../../components/product/unit-select';
import { Amount } from '../../../../components/amount';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import {
  createEmptyDiscountDraft,
  DiscountFields,
  resolveDiscountInput,
  type DiscountDraft,
} from '../../lib/discount-fields';
import { CustomerPicker } from '../../lib/customer-picker';
import { cashRoundingMinor, previewDiscountedAmount, previewLineAmount } from './pos-totals';
import { openPrint } from '../../../../components/printing/print-button';
import { useTreasuryLookup } from '../../../treasury/api/queries';
import { fromHeldPayload, makeKey, toHeldPayload, type CartLine } from './pos-cart-state';
import { minorToInput, quickCashAmounts } from './pos-quick-cash';
import { isApprovalCancelled, useSupervisorApproval } from './use-supervisor-approval';
import { PosHeldCartsDialog } from './pos-held-carts-dialog';
import { PosReceiptsDialog } from './pos-receipts-dialog';
import { PosReturnDialog, type PosExchangeDraft } from './pos-return-dialog';
import { PosDrawerDialog } from './pos-drawer-dialog';
import { SALES } from '../../../../lib/permissions';
import { useAppSetting } from '../../../../lib/app-settings';
import { CASH_ROUNDING_STEPS, type CashRounding } from '@erp-platform/contracts';

const PAYMENT_METHODS = paymentMethodSchema.options;

/** Sentinel for "no customer explicitly chosen" — checkout() then resolves the
 * tenant's Walk-in Customer server-side (findSystemDefault(), Stage 3). */
const WALK_IN_SENTINEL = '__walk_in__';

interface TenderDraft {
  key: string;
  /** The treasury the money goes to; the payment method follows from its kind. */
  treasuryId: string | null;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  amount: string;
  referenceNumber: string;
}

function createEmptyTender(treasuryId: string | null = null): TenderDraft {
  return { key: makeKey('tender'), treasuryId, paymentMethod: 'cash', amount: '', referenceNumber: '' };
}

/** Cash box → cash; bank → card / transfer; e-wallet → other (the method only labels the receipt). */
function methodForKind(kind: string | undefined): TenderDraft['paymentMethod'] {
  return kind === 'bank' ? 'card' : kind === 'wallet' ? 'other' : 'cash';
}

/** Preview number (major units, float — display only) → minor-unit string for <Amount>. */
function previewMinor(value: number): string {
  return String(Math.round(value * 100));
}

/** One text field per line discount: "10%" = percentage, "5" = a fixed amount, empty = none. */
function discountText(d: DiscountDraft): string {
  if (d.discountType === 'percentage') return `${d.discountPercentage}%`;
  if (d.discountType === 'fixed') return d.discountFixedAmount;
  return '';
}
function parseDiscountText(text: string): DiscountDraft {
  const raw = text.trim();
  if (raw === '') return createEmptyDiscountDraft();
  if (raw.endsWith('%')) return { discountType: 'percentage', discountPercentage: raw.slice(0, -1).trim(), discountFixedAmount: '' };
  return { discountType: 'fixed', discountPercentage: '', discountFixedAmount: raw };
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="ms-1 hidden rounded border border-current px-1 font-mono text-[10px] leading-4 opacity-70 sm:inline">
      {children}
    </kbd>
  );
}

/**
 * The till (POS Stage 4 + migration 0113): product search / barcode + cart on
 * one side; customer, totals, tenders with quick-cash and the pay button on
 * the other. Around it: park / resume sales, the shift's receipts (reprint,
 * return), cash in / out of the drawer. Checkout calls PosSalesService.checkout()
 * (order → delivery → invoice → payments, atomically); a discount above the
 * cashier's limit asks for a supervisor PIN and retries the same checkoutId.
 *
 * Shortcuts: F2 search · F4 park · F6 parked · F7 receipts · F9 pay · Esc closes.
 * A barcode scanner types the code + Enter into the (auto-focused) search box.
 */
export function PosCartPanel({ session }: { session: PosSessionDto }) {
  const { t } = useTranslation();
  const currency = session.openingCashAmount.currency;
  const { data: customers } = useCustomers();
  const { data: catalogue } = useVariantLookup();
  const { data: inventorySettings } = useInventorySettings();
  const checkout = usePosCheckout();
  const exchangeSale = usePosExchange();
  // استبدال in progress: the returned items pay for this cart (sent as one exchange).
  const [exchange, setExchange] = useState<PosExchangeDraft | null>(null);
  const holdCart = useHoldPosCart(session.id);
  const { data: heldCarts } = usePosHeldCarts(session.id);
  const approval = useSupervisorApproval();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>(WALK_IN_SENTINEL);
  const variants = useVariantLookupMap();
  const walkInCustomer = (customers ?? []).find((c) => c.isSystemDefault);
  // The walk-in sentinel stands for the tenant's Walk-in Customer, whose list applies too.
  const pricedCustomer = customerId === WALK_IN_SENTINEL ? walkInCustomer : (customers ?? []).find((c) => c.id === customerId);
  const { priceListId, setPriceListId, pricer } = useDocumentPriceList<CartLine>({
    partyPriceListId: pricedCustomer?.priceListId,
    partyId: customerId,
    currency,
    variants,
    setLines,
  });
  const [headerDiscount, setHeaderDiscount] = useState<DiscountDraft>(() => createEmptyDiscountDraft());
  const [tenders, setTenders] = useState<TenderDraft[]>(() => [createEmptyTender(session.treasuryId)]);
  const { data: treasuryLookup } = useTreasuryLookup();
  const tenderTreasuries = (treasuryLookup ?? []).filter((tr) => tr.currency === currency);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PosCheckoutResultDto | null>(null);
  const { get: getSetting } = useAppSetting();
  const [moreOpen, setMoreOpen] = useState(false);
  // One id per sale, kept across retries (a timeout + retry must not sell twice); new after each sale.
  const [checkoutId, setCheckoutId] = useState(() => crypto.randomUUID());

  // Dialogs around the till.
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [returnState, setReturnState] = useState<{ open: boolean; number: string }>({ open: false, number: '' });

  // A resumed cart's own price list, applied once the customer's default has settled.
  const restoreList = useRef<{ listId: string | null; expected: string | null } | null>(null);
  const [restoreTick, setRestoreTick] = useState(0);
  useEffect(() => {
    const pending = restoreList.current;
    if (!pending || priceListId !== pending.expected) return;
    restoreList.current = null;
    if (pending.listId !== priceListId) setPriceListId(pending.listId);
  }, [priceListId, customerId, restoreTick, setPriceListId]);

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

  function focusSearch() {
    window.setTimeout(() => searchRef.current?.focus(), 50);
  }

  /** Dialog open/close that hands the focus back to the search box (for the scanner). */
  function dialogSetter(set: (open: boolean) => void) {
    return (open: boolean) => {
      set(open);
      if (!open) focusSearch();
    };
  }

  /**
   * Enter in the search box: a scanned code first — primary barcode, pack barcode
   * (a carton adds its 12 pieces), SKU/code, or a weighing-scale barcode with the
   * weight inside — else the top search result.
   */
  function addFromSearch() {
    const scan = resolveScan(sellable, search, inventorySettings);
    if (scan) {
      // A carton barcode whose count matches one of the item's own units adds 1 carton, not 12 pieces.
      const packUnit = scan.fromScale ? undefined : scan.variant.units.find((unit) => unit.factor === scan.quantity);
      addToCart(
        scan.variant.id,
        `${variantDisplayName(scan.variant)} — ${scan.variant.sku}`,
        packUnit ? 1 : scan.quantity,
        packUnit ? packUnit.unitOfMeasureId : null,
      );
      return;
    }
    const first = searchResults[0];
    if (first) addToCart(first.productVariantId, first.label);
    else if (search.trim() !== '') toast.error(t('pos.cart.notFound'));
  }

  function addToCart(productVariantId: string, label: string, quantity = 1, unitOfMeasureId: string | null = null) {
    const variant = sellable.find((entry) => entry.id === productVariantId);
    const defaultPrice = variant ? pricer(variant, unitOfMeasureId, String(quantity)) : null;
    setLines((prev) => {
      const existing = prev.find(
        (l) => l.productVariantId === productVariantId && l.unitOfMeasureId === unitOfMeasureId,
      );
      if (existing) {
        const nextQuantity = String(Math.round(((Number(existing.quantity) || 0) + quantity) * 1000) / 1000);
        // A quantity break may now apply (price lists); a typed price is kept.
        const price = repricedValue(existing, variants, { pricer }, pricer, { quantity: nextQuantity });
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: nextQuantity, ...(price ? { unitPrice: price } : {}) } : l,
        );
      }
      return [
        ...prev,
        {
          key: makeKey('line'),
          productVariantId,
          unitOfMeasureId,
          label,
          quantity: String(quantity),
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

  function changeQuantity(line: CartLine, quantity: string) {
    const price = repricedValue(line, variants, { pricer }, pricer, { quantity });
    updateLine(line.key, { quantity, ...(price ? { unitPrice: price } : {}) });
  }

  function stepQuantity(line: CartLine, delta: number) {
    const next = Math.round(((Number(line.quantity) || 0) + delta) * 1000) / 1000;
    if (next <= 0) return;
    changeQuantity(line, String(next));
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

  const grossPreview = lines.reduce((sum, line) => sum + previewLineAmount(line.unitPrice, line.quantity), 0);
  const cartSubtotalPreview = lines.reduce(
    (sum, line) => sum + previewDiscountedAmount(previewLineAmount(line.unitPrice, line.quantity), line.discount),
    0,
  );
  const unroundedTotalPreview = previewDiscountedAmount(cartSubtotalPreview, headerDiscount);
  const discountPreview = Math.max(0, grossPreview - unroundedTotalPreview);
  // Cash rounding (settings hub): only while every tender is cash, and not on top of a % discount.
  const roundingStep = CASH_ROUNDING_STEPS[getSetting('pos.cashRounding') as CashRounding] ?? 0;
  const roundingMinor =
    roundingStep > 0 && headerDiscount.discountType !== 'percentage' && tenders.every((tender) => tender.paymentMethod === 'cash')
      ? cashRoundingMinor(BigInt(Math.max(0, Math.round(unroundedTotalPreview * 100))), BigInt(Math.round(roundingStep * 100)))
      : 0n;
  const cartTotalPreview = unroundedTotalPreview - Number(roundingMinor) / 100;
  const tenderedPreview = tenders.reduce((sum, tender) => sum + (Number(tender.amount) || 0), 0);
  const exchangeCredit = exchange ? Number(exchange.creditMinorUnits) / 100 : 0;
  /** What the customer still owes after an exchange's credit (negative = they get money back). */
  const duePreview = cartTotalPreview - exchangeCredit;
  const remainingPreview = duePreview - tenderedPreview;
  const itemsCount = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const quickCash = quickCashAmounts(BigInt(Math.max(0, Math.round(duePreview * 100))));

  /** Quick cash: the amount goes on the cash tender (the only one, or the first cash one). */
  function applyQuickCash(amountMinor: bigint) {
    const amount = minorToInput(amountMinor);
    setTenders((prev) => {
      const target = prev.length === 1 ? prev[0] : prev.find((tender) => tender.paymentMethod === 'cash');
      if (!target) return [...prev, { ...createEmptyTender(session.treasuryId), amount }];
      return prev.map((tender) =>
        tender.key === target.key
          ? { ...tender, amount, treasuryId: session.treasuryId ?? tender.treasuryId, paymentMethod: 'cash' }
          : tender,
      );
    });
  }

  function resetCart() {
    setLines([]);
    setExchange(null);
    setCustomerId(WALK_IN_SENTINEL);
    setHeaderDiscount(createEmptyDiscountDraft());
    setTenders([createEmptyTender(session.treasuryId)]);
    setNotes('');
    setError(null);
    setCheckoutId(crypto.randomUUID());
  }

  /** Parks the current cart; resolves false when there was nothing to park or it failed. */
  async function parkCart(label: string | null): Promise<boolean> {
    if (lines.length === 0) {
      toast.error(t('pos.cart.emptyError'));
      return false;
    }
    try {
      await holdCart.mutateAsync({
        label: label?.trim() || null,
        customerId: customerId === WALK_IN_SENTINEL ? null : customerId,
        payload: toHeldPayload({
          lines,
          customerId: customerId === WALK_IN_SENTINEL ? null : customerId,
          priceListId,
          headerDiscount,
          notes,
        }) as unknown as Record<string, unknown>,
        total: { amountMinorUnits: previewMinor(Math.max(0, cartTotalPreview)), currency },
        itemCount: lines.length,
      });
      toast.success(t('pos.held.parked'));
      resetCart();
      focusSearch();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      return false;
    }
  }

  function resumeCart(cart: PosHeldCartDto) {
    const state = fromHeldPayload(cart.payload);
    if (!state) {
      toast.error(t('pos.held.unreadable'));
      return;
    }
    const nextCustomer = state.customerId ?? WALK_IN_SENTINEL;
    const nextCustomerRow =
      nextCustomer === WALK_IN_SENTINEL ? walkInCustomer : (customers ?? []).find((c) => c.id === nextCustomer);
    // Once the customer change settles the list on the customer's default, put back the cart's own list.
    restoreList.current = {
      listId: state.priceListId,
      expected: nextCustomer === customerId ? priceListId : (nextCustomerRow?.priceListId ?? null),
    };
    setRestoreTick((n) => n + 1);
    setCustomerId(nextCustomer);
    setLines(state.lines);
    setHeaderDiscount(state.headerDiscount);
    setNotes(state.notes);
    setTenders([createEmptyTender(session.treasuryId)]);
    setError(null);
    setLastResult(null);
    setCheckoutId(crypto.randomUUID());
    toast.success(t('pos.held.resumed'));
    focusSearch();
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
        unitOfMeasureId: line.unitOfMeasureId,
        quantity,
        unitPrice: { amountMinorUnits, currency },
        ...resolvedDiscount,
      });
    }

    const typedHeaderDiscount = resolveDiscountInput(headerDiscount, currency);
    if (typedHeaderDiscount === 'invalid') {
      setError(t('sales.salesOrders.discountError'));
      return;
    }
    // The cash rounding rides on the sale's fixed discount.
    const resolvedHeaderDiscount =
      roundingMinor > 0n && typedHeaderDiscount.discountType !== 'percentage'
        ? {
            discountType: 'fixed' as const,
            discountPercentage: null,
            discountFixedAmount: {
              amountMinorUnits: (BigInt(typedHeaderDiscount.discountFixedAmount?.amountMinorUnits ?? '0') + roundingMinor).toString(),
              currency,
            },
          }
        : typedHeaderDiscount;

    // Nothing to collect: a free sale, or an exchange whose credit covers the new items.
    const freeSale = duePreview <= 0.004;
    if (tenders.length === 0 && !freeSale) {
      setError(t('pos.tenders.emptyError'));
      return;
    }
    const preparedTenders: PosCheckoutDto['tenders'] = [];
    for (const tender of freeSale ? [] : tenders) {
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
        treasuryId: tender.paymentMethod === 'cash' ? null : tender.treasuryId,
        amount: { amountMinorUnits, currency },
        referenceNumber: tender.referenceNumber.trim() === '' ? undefined : tender.referenceNumber,
      });
    }

    const payload: PosCheckoutDto = {
      customerId: customerId === WALK_IN_SENTINEL ? undefined : customerId,
      lines: preparedLines,
      tenders: preparedTenders,
      notes: notes.trim() === '' ? undefined : notes,
      checkoutId,
      ...resolvedHeaderDiscount,
    };

    try {
      // A discount above the cashier's limit (or the exchange's return) → supervisor PIN, same checkoutId.
      const result = await approval.run(async (approvalPin) => {
        const input = { ...payload, approvalPin: approvalPin ?? null };
        if (!exchange) return checkout.mutateAsync({ posSessionId: session.id, input });
        const done = await exchangeSale.mutateAsync({
          sessionId: session.id,
          input: { return: { deliveryId: exchange.deliveryId, lines: exchange.lines, notes: exchange.notes }, sale: input },
        });
        return done.sale;
      });
      setLastResult(result);
      toast.success(t('pos.checkout.success'));
      if (getSetting('pos.autoPrintReceipt')) openPrint('sales_invoice', result.salesInvoice.id, { paper: 'thermal80', autoprint: true });
      resetCart();
      focusSearch();
    } catch (err) {
      if (isApprovalCancelled(err)) return;
      toast.error(err instanceof ApiError ? err.message : t('pos.checkout.error'));
    }
  }

  // Keyboard shortcuts — read through a ref so the listener always sees the latest cart.
  const shortcuts = useRef<Record<string, () => void>>({});
  shortcuts.current = {
    F2: () => searchRef.current?.focus(),
    F4: () => (lines.length > 0 ? setHoldOpen(true) : toast.error(t('pos.cart.emptyError'))),
    F6: () => setHeldOpen(true),
    F7: () => setReceiptsOpen(true),
    F9: () => {
      if (!checkout.isPending) void onCheckout();
    },
  };
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = shortcuts.current[event.key];
      if (!action) return;
      event.preventDefault();
      // Another dialog (PIN, confirm…) is on top: leave it alone.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      action();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const walkIn = customerId === WALK_IN_SENTINEL;
  const heldCount = heldCarts?.length ?? 0;

  return (
    <div className="grid gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" onClick={() => setHoldOpen(true)} disabled={lines.length === 0}>
          <PauseCircle />
          {t('pos.held.hold')}
          <Kbd>F4</Kbd>
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setHeldOpen(true)}>
          {t('pos.held.list')}
          {heldCount > 0 ? <Badge variant="warning">{heldCount}</Badge> : null}
          <Kbd>F6</Kbd>
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setReceiptsOpen(true)}>
          <Receipt />
          {t('pos.receipts.title')}
          <Kbd>F7</Kbd>
        </Button>
        <Can permission={SALES.posUse}>
          <Button variant="outline" className="h-11" onClick={() => setReturnState({ open: true, number: '' })}>
            <Undo2 />
            {t('pos.return.action')}
          </Button>
        </Can>
        <Button variant="outline" className="h-11" onClick={() => setDrawerOpen(true)}>
          <Wallet />
          {t('pos.drawer.title')}
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Products + cart */}
        <section className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFromSearch();
                } else if (e.key === 'Escape' && search) {
                  e.preventDefault();
                  setSearch('');
                }
              }}
              placeholder={t('pos.cart.searchPlaceholder')}
              className="h-14 rounded-xl ps-12 pe-14 text-lg shadow-card"
              autoFocus
              aria-label={t('pos.cart.searchTitle')}
            />
            <kbd className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 rounded border px-1.5 font-mono text-xs text-muted-foreground">
              F2
            </kbd>
            {searchResults.length > 0 ? (
              <div className="absolute inset-x-0 top-full z-20 mt-1 grid max-h-80 gap-0.5 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                {searchResults.map((result, index) => (
                  <button
                    key={result.productVariantId}
                    type="button"
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-lg px-3 text-start text-sm hover:bg-accent',
                      index === 0 && 'bg-accent/60',
                    )}
                    onClick={() => {
                      addToCart(result.productVariantId, result.label);
                      searchRef.current?.focus();
                    }}
                  >
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{result.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="h-4 w-4" />
                {t('pos.cart.title')}
                <Badge variant="secondary">{lines.length}</Badge>
              </span>
              {lines.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => {
                    setLines([]);
                    focusSearch();
                  }}
                >
                  <X />
                  {t('pos.cart.clear')}
                </Button>
              ) : null}
            </div>
            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-muted-foreground">
                <ShoppingCart className="h-10 w-10 opacity-40" />
                <p>{t('pos.cart.empty')}</p>
                <p className="text-xs">{t('pos.cart.scanHint')}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {lines.map((line) => {
                  const variant = sellable.find((entry) => entry.id === line.productVariantId);
                  return (
                    <li key={line.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="grid min-w-0 gap-1">
                        <span className="truncate font-medium">{line.label}</span>
                        <LineUnitSelect
                          className="h-8 w-40 text-xs"
                          variant={variant}
                          value={line.unitOfMeasureId}
                          onChange={(unitOfMeasureId) => {
                            const price = variant ? pricer(variant, unitOfMeasureId, line.quantity) : null;
                            updateLine(line.key, { unitOfMeasureId, ...(price ? { unitPrice: price } : {}) });
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center" dir="ltr">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-e-none"
                            onClick={() => stepQuantity(line, -1)}
                            disabled={(Number(line.quantity) || 0) <= 1}
                            aria-label="-1"
                          >
                            <Minus />
                          </Button>
                          <Input
                            inputMode="decimal"
                            className="h-10 w-16 rounded-none border-x-0 text-center tabular-nums"
                            value={line.quantity}
                            onChange={(e) => changeQuantity(line, e.target.value)}
                            aria-label={t('sales.salesOrders.lineQuantity')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-s-none"
                            onClick={() => stepQuantity(line, 1)}
                            aria-label="+1"
                          >
                            <Plus />
                          </Button>
                        </div>
                        <Input
                          inputMode="decimal"
                          placeholder="0.00"
                          className="h-10 w-24 tabular-nums"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                          aria-label={t('sales.salesOrders.lineUnitPrice', { currency })}
                          title={t('sales.salesOrders.lineUnitPrice', { currency })}
                        />
                        <Input
                          placeholder={t('pos.cart.discountPlaceholder')}
                          className="h-10 w-20 tabular-nums"
                          value={discountText(line.discount)}
                          onChange={(e) => updateLine(line.key, { discount: parseDiscountText(e.target.value) })}
                          aria-label={t('sales.salesOrders.lineDiscount')}
                          title={t('pos.cart.discountHint')}
                        />
                        <Amount
                          value={previewMinor(
                            previewDiscountedAmount(previewLineAmount(line.unitPrice, line.quantity), line.discount),
                          )}
                          hideCurrency
                          className="w-24 text-end text-base font-semibold"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                          onClick={() => removeLine(line.key)}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Checkout side */}
        <aside className="grid gap-3 lg:sticky lg:top-4">
          {lastResult ? (
            <div className="grid gap-2 rounded-xl border border-success/40 bg-success-soft p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  {t('pos.checkout.lastSaleTitle')} · <span className="tabular-nums">{lastResult.salesInvoice.invoiceNumber}</span>
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => setLastResult(null)} aria-label={t('common.close')}>
                  <X />
                </Button>
              </div>
              {lastResult.changeAmount.amountMinorUnits !== '0' ? (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm">{t('pos.tenders.changeDue')}</span>
                  <Amount
                    value={lastResult.changeAmount.amountMinorUnits}
                    currency={lastResult.changeAmount.currency}
                    className="text-3xl font-bold text-success"
                  />
                </div>
              ) : null}
              <Button
                variant="outline"
                className="h-11 bg-card"
                onClick={() => openPrint('sales_invoice', lastResult.salesInvoice.id, { paper: 'thermal80', autoprint: true })}
              >
                <Printer />
                {t('printing.printReceipt')}
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-card">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t('pos.customer.label')}</span>
              <div className="flex items-center gap-1.5">
                <CustomerPicker
                  className="min-w-0 flex-1"
                  value={walkIn ? (walkInCustomer?.id ?? null) : customerId}
                  onChange={(id, customer) => setCustomerId(customer.isSystemDefault ? WALK_IN_SENTINEL : id)}
                />
                {!walkIn ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setCustomerId(WALK_IN_SENTINEL)}
                    title={t('pos.customer.walkIn')}
                    aria-label={t('pos.customer.walkIn')}
                  >
                    <UserX />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('pos.cart.itemsCount')}</span>
                <span className="tabular-nums">{Math.round(itemsCount * 1000) / 1000}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('sales.salesOrders.subtotalAmount')}</span>
                <Amount value={previewMinor(grossPreview)} hideCurrency />
              </div>
              {discountPreview > 0.004 ? (
                <div className="flex justify-between text-danger">
                  <span>{t('pos.cart.discountTotal')}</span>
                  <Amount value={previewMinor(-discountPreview)} hideCurrency />
                </div>
              ) : null}
              {exchange ? (
                <div className="flex items-center justify-between text-success">
                  <span className="flex items-center gap-1">
                    {t('pos.exchange.credit', { number: exchange.saleNumber })}
                    <Button variant="ghost" size="icon-sm" onClick={() => setExchange(null)} aria-label={t('pos.exchange.cancel')}>
                      <X />
                    </Button>
                  </span>
                  <Amount value={`-${exchange.creditMinorUnits}`} hideCurrency />
                </div>
              ) : null}
              {roundingMinor > 0n ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t('pos.cart.cashRounding')}</span>
                  <Amount value={(-roundingMinor).toString()} hideCurrency />
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between border-t pt-2">
                <span className="text-base font-semibold">
                  {exchange ? t(duePreview < 0 ? 'pos.exchange.giveBack' : 'pos.exchange.due') : t('sales.salesOrders.totalAmount')}
                </span>
                <Amount value={previewMinor(exchange ? Math.abs(duePreview) : cartTotalPreview)} currency={currency} className="text-4xl font-bold text-primary" />
              </div>
            </div>

            <button
              type="button"
              className="flex items-center justify-between rounded-md text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
            >
              <span>
                {t('pos.cart.moreOptions')}
                {headerDiscount.discountType !== 'none' ? (
                  <Badge variant="info" className="ms-2">
                    {t('sales.salesOrders.discountSectionTitle')}
                  </Badge>
                ) : null}
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} />
            </button>
            {moreOpen ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t('sales.salesOrders.discountSectionTitle')}</span>
                  <DiscountFields value={headerDiscount} onChange={setHeaderDiscount} currency={currency} />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t('priceLists.field')}</span>
                  <PriceListSelect value={priceListId} onChange={setPriceListId} currency={currency} />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">{t('pos.notes')}</span>
                  <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-card">
            <span className="text-sm font-medium">{t('pos.tenders.title')}</span>
            {tenders.map((tender) => (
              <div key={tender.key} className="grid gap-2 rounded-lg border p-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  {tenderTreasuries.length > 0 ? (
                    <Select
                      value={tender.treasuryId ?? undefined}
                      onValueChange={(id) => {
                        const kind = tenderTreasuries.find((tr) => tr.id === id)?.kind;
                        // Cash always lands in this session's cash box (it is counted at closing).
                        const method =
                          id === session.treasuryId ? 'cash' : methodForKind(kind) === 'cash' ? 'other' : methodForKind(kind);
                        updateTender(tender.key, { treasuryId: id, paymentMethod: method });
                      }}
                    >
                      <SelectTrigger className="h-11" aria-label={t('pos.tenders.treasury')}>
                        <SelectValue placeholder={t('treasury.select.placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {tenderTreasuries.map((tr) => (
                          <SelectItem key={tr.id} value={tr.id}>
                            {tr.name}
                            {tr.id === session.treasuryId ? ` — ${t('pos.tenders.sessionCash')}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={tender.paymentMethod}
                      onValueChange={(value) => updateTender(tender.key, { paymentMethod: value as TenderDraft['paymentMethod'] })}
                    >
                      <SelectTrigger className="h-11">
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
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    onClick={() => removeTender(tender.key)}
                    disabled={tenders.length <= 1}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-12 text-xl font-semibold tabular-nums"
                  value={tender.amount}
                  onChange={(e) => updateTender(tender.key, { amount: e.target.value })}
                  aria-label={t('pos.tenders.amount', { currency })}
                />
                {tender.paymentMethod !== 'cash' ? (
                  <Input
                    className="h-9"
                    value={tender.referenceNumber}
                    onChange={(e) => updateTender(tender.key, { referenceNumber: e.target.value })}
                    placeholder={t('pos.tenders.referenceNumber')}
                  />
                ) : null}
              </div>
            ))}

            {quickCash.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {quickCash.map((amount, index) => (
                  <Button
                    key={amount.toString()}
                    type="button"
                    variant={index === 0 ? 'default' : 'outline'}
                    className={cn('h-12 text-base tabular-nums', index === 0 && 'col-span-3')}
                    onClick={() => applyQuickCash(amount)}
                  >
                    {index === 0 ? (
                      <>
                        <Banknote />
                        {t('pos.tenders.exact')}
                        <Amount value={amount.toString()} hideCurrency className="ms-1" />
                      </>
                    ) : (
                      <Amount value={amount.toString()} hideCurrency />
                    )}
                  </Button>
                ))}
              </div>
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setTenders((prev) => [...prev, createEmptyTender(session.treasuryId)])}
            >
              <Plus className="h-4 w-4" />
              {t('pos.tenders.addTender')}
            </Button>

            <div className="grid gap-1 border-t pt-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('pos.tenders.totalTendered')}</span>
                <Amount value={previewMinor(tenderedPreview)} hideCurrency />
              </div>
              <div className="flex items-baseline justify-between">
                <span className={cn('font-medium', remainingPreview > 0.004 ? 'text-danger' : 'text-success')}>
                  {remainingPreview > 0.004 ? t('pos.tenders.remainingDue') : t('pos.tenders.changeDue')}
                </span>
                <Amount
                  value={previewMinor(Math.abs(remainingPreview))}
                  currency={currency}
                  className={cn('text-2xl font-bold', remainingPreview > 0.004 ? 'text-danger' : 'text-success')}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              size="lg"
              onClick={() => void onCheckout()}
              disabled={checkout.isPending || exchangeSale.isPending || lines.length === 0}
              className="h-16 text-lg font-bold"
            >
              {t('pos.checkout.submit')}
              <Amount value={previewMinor(cartTotalPreview)} hideCurrency className="ms-2" />
              <Kbd>F9</Kbd>
            </Button>
          </div>
        </aside>
      </div>

      <HoldDialog open={holdOpen} onOpenChange={dialogSetter(setHoldOpen)} busy={holdCart.isPending} onHold={parkCart} />
      <PosHeldCartsDialog
        sessionId={session.id}
        open={heldOpen}
        onOpenChange={dialogSetter(setHeldOpen)}
        cartHasItems={lines.length > 0}
        onHoldCurrent={() => parkCart(null)}
        onResume={resumeCart}
      />
      <PosReceiptsDialog
        sessionId={session.id}
        open={receiptsOpen}
        onOpenChange={dialogSetter(setReceiptsOpen)}
        onReturn={(number) => {
          setReceiptsOpen(false);
          setReturnState({ open: true, number });
        }}
      />
      <PosReturnDialog
        session={session}
        open={returnState.open}
        initialNumber={returnState.number}
        onExchange={(draft) => {
          setExchange(draft);
          toast.success(t('pos.exchange.started'));
          focusSearch();
        }}
        onOpenChange={dialogSetter((open) => setReturnState((prev) => ({ ...prev, open })))}
      />
      <PosDrawerDialog session={session} open={drawerOpen} onOpenChange={dialogSetter(setDrawerOpen)} />
      {approval.dialog}
    </div>
  );
}

/** تعليق — parks the cart under an optional label (e.g. the customer's name). */
function HoldDialog({
  open,
  onOpenChange,
  busy,
  onHold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onHold: (label: string | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');

  async function submit() {
    if (await onHold(label)) {
      setLabel('');
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('pos.held.holdTitle')}</DialogTitle>
          <DialogDescription>{t('pos.held.holdDescription')}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          className="h-11"
          maxLength={80}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t('pos.held.labelPlaceholder')}
        />
        <Button className="h-12" onClick={() => void submit()} disabled={busy}>
          <PauseCircle />
          {t('pos.held.hold')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
