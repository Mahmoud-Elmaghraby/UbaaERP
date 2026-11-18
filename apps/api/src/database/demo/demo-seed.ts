import type { DemoApiClient } from "./demo-api-client";
import {
  DEMO_CATEGORIES,
  DEMO_CUSTOMERS,
  DEMO_EMPLOYEES,
  DEMO_PRODUCTS,
  DEMO_REPS,
  DEMO_SUPPLIERS,
  piecePrices,
  type DemoCategoryKey,
  type DemoProduct,
  type DemoSupplierKey,
} from "./demo-catalog";

/**
 * Fills a freshly provisioned tenant with a believable candy & chocolate distributor: master data,
 * then ~3 months of day-by-day activity ending yesterday, then today's POS shifts. Everything goes
 * through the API, so stock, lots (FEFO), balances and journal entries are all real.
 */

const CUR = "EGP";
const money = (minor: number) => ({
  amountMinorUnits: String(Math.round(minor)),
  currency: CUR,
});

interface Ctx {
  api: DemoApiClient;
  rand: () => number;
  ids: {
    piece: string;
    box: string;
    carton: string;
    branches: Record<"main" | "maadi" | "nasr", string>;
    warehouses: Record<"main" | "maadi" | "nasr", string>;
    treasuries: { main: string; bank: string; maadi: string; nasr: string };
    walkIn: string;
    expense: Record<string, string>;
  };
  products: (DemoProduct & {
    productId: string;
    variantId: string;
    prices: ReturnType<typeof piecePrices>;
  })[];
  suppliers: Record<DemoSupplierKey, string>;
  customers: { id: string; name: string; kind: "wholesale" | "retail" }[];
  /** Stock we put in each warehouse, in pieces, by variant — keeps every sale within stock. */
  stock: Record<"main" | "maadi" | "nasr", Map<string, number>>;
}

export async function runDemoSeed(
  api: DemoApiClient,
  opts: { companyName: string; login: () => Promise<void> },
): Promise<void> {
  const ctx = { api, rand: mulberry32(20261117) } as Ctx;
  ctx.stock = { main: new Map(), maadi: new Map(), nasr: new Map() };

  step("الإعدادات والموديولات");
  await setUpCompany(ctx, opts.companyName);
  await opts.login(); // the token carries the feature switches just changed

  step("الفروع والمخازن والخزائن");
  await setUpPlaces(ctx);

  step(`الأصناف (${DEMO_PRODUCTS.length})`);
  await setUpProducts(ctx);

  step("الموردين والعملاء والمناديب");
  await setUpParties(ctx);

  step("الموظفين والمرتبات");
  const hr = await setUpHr(ctx);

  step("الحركة اليومية (حوالي 3 شهور)");
  await runHistory(ctx, hr);

  step("نقطة البيع النهارده");
  await runTodayPos(ctx);
}

// ─────────────────────────── setup ───────────────────────────

async function setUpCompany(ctx: Ctx, companyName: string): Promise<void> {
  const { api } = ctx;
  await api.patch("/settings", {
    companyName: `شركة ${companyName} لتوزيع الحلويات والشوكولاتة`,
    address: "المنطقة الصناعية - مدينة العبور - القاهرة",
    phone: "0244880000",
    email: "info@alomda-sweets.demo",
    commercialRegister: "123456",
  });
  // The client works without taxes: switch every tax rule off so screens don't offer them.
  for (const rule of await api.get<{ id: string; isActive: boolean }[]>(
    "/tax-rules",
  )) {
    if (rule.isActive)
      await api.patch(`/tax-rules/${rule.id}`, { isActive: false });
  }
  // Direct invoicing (no orders / delivery notes / receipts as separate steps), POS, reps, HR on.
  const toggles: Record<string, boolean> = {
    "sales.quotations": false,
    "sales.sales_orders": false,
    "sales.deliveries": false,
    "purchases.rfq": false,
    "purchases.supplier_quotations": false,
    "purchases.purchase_orders": false,
    "purchases.goods_receipts": false,
    pos: true,
    "sales.reps": true,
    hr: true,
    cheques: true,
  };
  for (const [key, enabled] of Object.entries(toggles)) {
    await api.patch(`/feature-toggles/${encodeURIComponent(key)}`, { enabled });
  }
  const units =
    await api.get<{ id: string; name: string }[]>("/units-of-measure");
  const unit = async (name: string, symbol: string) =>
    units.find((u) => u.name === name)?.id ??
    (await api.post<{ id: string }>("/units-of-measure", { name, symbol })).id;
  ctx.ids = {
    piece: await unit("قطعة", "قطعة"),
    box: await unit("علبة", "علبة"),
    carton: await unit("كرتونة", "كرتونة"),
  } as Ctx["ids"];
}

async function setUpPlaces(ctx: Ctx): Promise<void> {
  const { api, ids } = ctx;
  const branch = (name: string, code: string, address: string) =>
    api.post<{ id: string }>("/branches", { name, code, address });
  // Every tenant starts with its main branch (migration 0130): rename it to the head office.
  const existing = await api.get<{ id: string; isMain: boolean }[]>("/branches");
  const main = existing.find((b) => b.isMain)!;
  await api.patch(`/branches/${main.id}`, {
    name: "المركز الرئيسي - العبور",
    code: "HQ",
    address: "المنطقة الصناعية - العبور",
  });
  const maadi = await branch("فرع المعادي", "MAADI", "شارع 9 - المعادي");
  const nasr = await branch(
    "فرع مدينة نصر",
    "NASR",
    "شارع عباس العقاد - مدينة نصر",
  );
  ids.branches = { main: main.id, maadi: maadi.id, nasr: nasr.id };

  const wh = (name: string, code: string, branchId: string) =>
    api.post<{ id: string }>("/warehouses", { name, code, branchId });
  ids.warehouses = {
    main: (await wh("المخزن الرئيسي", "WH-MAIN", main.id)).id,
    maadi: (await wh("مخزن فرع المعادي", "WH-MAADI", maadi.id)).id,
    nasr: (await wh("مخزن فرع مدينة نصر", "WH-NASR", nasr.id)).id,
  };

  const start = isoDay(daysAgo(HISTORY_DAYS + 1));
  const treasuries =
    await api.get<{ id: string; isDefault: boolean }[]>("/treasuries");
  const mainCash = treasuries.find((t) => t.isDefault)!.id;
  await api.patch(`/treasuries/${mainCash}`, {
    openingBalanceMinorUnits: "15000000",
    openingBalanceDate: start,
  });
  const bank = await api.post<{ id: string }>("/treasuries", {
    code: "BANK-01",
    name: "البنك الأهلي المصري - حساب جاري",
    kind: "bank",
    currency: CUR,
    bankName: "البنك الأهلي المصري",
    accountNumber: "1203004500012",
    openingBalanceMinorUnits: "400000000",
    openingBalanceDate: start,
  });
  const cashbox = (code: string, name: string, branchId: string) =>
    api.post<{ id: string }>("/treasuries", {
      code,
      name,
      branchId,
      kind: "cash",
      currency: CUR,
      openingBalanceMinorUnits: "500000",
      openingBalanceDate: start,
    });
  ids.treasuries = {
    main: mainCash,
    bank: bank.id,
    maadi: (await cashbox("CASH-MAADI", "خزينة فرع المعادي", maadi.id)).id,
    nasr: (await cashbox("CASH-NASR", "خزينة فرع مدينة نصر", nasr.id)).id,
  };

  const customers =
    await api.get<{ id: string; isSystemDefault: boolean }[]>("/customers");
  ids.walkIn = customers.find((c) => c.isSystemDefault)!.id;

  const categories = await api.get<
    {
      id: string;
      kind: string;
      name: string;
      chartOfAccountId: string | null;
    }[]
  >("/treasury-categories");
  // A new expense item needs its own ledger account (under operating expenses, 52).
  const accounts =
    await api.get<{ id: string; code: string }[]>("/chart-of-accounts");
  const operating = accounts.find((a) => a.code === "52")!.id;
  const ensure = async (name: string, code?: string) => {
    const found = categories.find(
      (c) =>
        c.kind === "expense" && c.name.includes(name) && c.chartOfAccountId,
    );
    if (found) return found.id;
    const account = await api.post<{ id: string }>("/chart-of-accounts", {
      code: code!,
      name,
      accountType: "expense",
      normalBalance: "debit",
      parentId: operating,
    });
    const existing = categories.find(
      (c) => c.kind === "expense" && c.name === name,
    );
    if (existing) {
      await api.patch(`/treasury-categories/${existing.id}`, {
        chartOfAccountId: account.id,
      });
      return existing.id;
    }
    return (
      await api.post<{ id: string }>("/treasury-categories", {
        kind: "expense",
        name,
        chartOfAccountId: account.id,
      })
    ).id;
  };
  ids.expense = {
    rent: await ensure("إيجار"),
    utilities: await ensure("كهرباء ومياه"),
    fuel: await ensure("وقود ومصاريف سيارات", "5291"),
    internet: await ensure("إنترنت واتصالات", "5292"),
    maintenance: await ensure("صيانة", "5293"),
    hospitality: await ensure("ضيافة ونظافة", "5294"),
  };
}

async function setUpProducts(ctx: Ctx): Promise<void> {
  const { api, ids } = ctx;
  const categoryIds = {} as Record<DemoCategoryKey, string>;
  for (const [key, name] of Object.entries(DEMO_CATEGORIES)) {
    categoryIds[key as DemoCategoryKey] = (
      await api.post<{ id: string }>("/product-categories", { name })
    ).id;
  }
  const brandIds = new Map<string, string>();
  for (const brand of new Set(DEMO_PRODUCTS.map((p) => p.brand))) {
    brandIds.set(
      brand,
      (await api.post<{ id: string }>("/product-brands", { name: brand })).id,
    );
  }

  ctx.products = [];
  const wholesaleItems: { productId: string; priceAmountMinorUnits: string }[] =
    [];
  let n = 0;
  for (const item of DEMO_PRODUCTS) {
    n++;
    const prices = piecePrices(item);
    const product = await api.post<{ id: string; variants?: { id: string }[] }>(
      "/products",
      {
        code: `CH-${String(n).padStart(4, "0")}`,
        name: item.name,
        unitOfMeasureId: ids.piece,
        trackingType: "lot",
        itemType: "stock",
        categoryId: categoryIds[item.category],
        brandId: brandIds.get(item.brand),
        salePrice: money(prices.retail),
        purchasePrice: money(prices.cost),
        defaultVariantBarcode: ean13(
          `622${String(1000000 + n * 7919).slice(-7)}${String(n).padStart(2, "0")}`,
        ),
      },
    );
    const variantId =
      product.variants?.[0]?.id ??
      (
        await api.get<{ id: string }[]>(
          `/product-variants?productId=${product.id}`,
        )
      )[0]!.id;
    // Box and carton: the distributor trades in these at wholesale prices.
    const cartonPieces = item.perBox * item.boxesPerCarton;
    const units = [];
    if (item.boxesPerCarton > 1) {
      units.push({
        unitOfMeasureId: ids.box,
        factor: item.perBox,
        salePrice: money(prices.wholesale * item.perBox),
        purchasePrice: money(prices.cost * item.perBox),
        isDefaultSale: true,
      });
    }
    units.push({
      unitOfMeasureId: ids.carton,
      factor: cartonPieces,
      salePrice: money(prices.wholesale * 0.98 * cartonPieces),
      purchasePrice: money(prices.cost * cartonPieces),
      isDefaultPurchase: true,
      isDefaultSale: item.boxesPerCarton === 1,
    });
    await api.put(`/products/${product.id}/units`, { units });
    ctx.products.push({ ...item, productId: product.id, variantId, prices });
    wholesaleItems.push({
      productId: product.id,
      priceAmountMinorUnits: String(prices.wholesale),
    });
  }

  const list = await api.post<{ id: string }>("/price-lists", {
    name: "أسعار الجملة",
    currency: CUR,
    items: wholesaleItems,
    notes: "لعملاء الجملة والسوبر ماركت",
  });
  (ctx as Ctx & { wholesaleList: string }).wholesaleList = list.id;
}

async function setUpParties(ctx: Ctx): Promise<void> {
  const { api } = ctx;
  ctx.suppliers = {} as Ctx["suppliers"];
  for (const [key, s] of Object.entries(DEMO_SUPPLIERS)) {
    const created = await api.post<{ id: string }>("/suppliers", {
      name: s.name,
      contactPerson: s.contact,
      phone: s.phone,
      defaultCurrency: CUR,
      paymentTermsDays: s.terms,
    });
    ctx.suppliers[key as DemoSupplierKey] = created.id;
  }
  const reps: string[] = [];
  for (const r of DEMO_REPS) {
    reps.push(
      (
        await api.post<{ id: string }>("/sales-reps", {
          code: r.code,
          name: r.name,
          phone: r.phone,
          commissionPercentage: r.commission,
        })
      ).id,
    );
  }
  const wholesaleList = (ctx as Ctx & { wholesaleList: string }).wholesaleList;
  ctx.customers = [];
  for (const [i, c] of DEMO_CUSTOMERS.entries()) {
    const created = await api.post<{ id: string }>("/customers", {
      name: c.name,
      customerType: "business",
      phone: `010${String(20000000 + i * 1373).padStart(8, "0")}`,
      address: c.area,
      defaultCurrency: CUR,
      paymentTermsDays: c.kind === "wholesale" ? 30 : 15,
      creditLimitMinorUnits: c.kind === "wholesale" ? "30000000" : "5000000",
      priceListId: c.kind === "wholesale" ? wholesaleList : null,
      salesRepId: reps[i % reps.length],
    });
    ctx.customers.push({ id: created.id, name: c.name, kind: c.kind });
  }
}

interface HrState {
  employees: string[];
}

async function setUpHr(ctx: Ctx): Promise<HrState> {
  const { api, ids } = ctx;
  const depts = new Map<string, string>();
  for (const d of new Set(DEMO_EMPLOYEES.map((e) => e.dept)))
    depts.set(
      d,
      (await api.post<{ id: string }>("/hr/departments", { name: d })).id,
    );
  const jobs = new Map<string, string>();
  for (const j of new Set(DEMO_EMPLOYEES.map((e) => e.job)))
    jobs.set(
      j,
      (await api.post<{ id: string }>("/hr/job-titles", { name: j })).id,
    );
  const transport = await api.post<{ id: string }>("/hr/salary-components", {
    name: "بدل انتقال",
    kind: "earning",
    calculation: "fixed",
    defaultAmountMinorUnits: "50000",
  });
  const housing = await api.post<{ id: string }>("/hr/salary-components", {
    name: "بدل سكن",
    kind: "earning",
    calculation: "percent_of_basic",
    defaultPercent: 10,
  });

  const employees: string[] = [];
  for (const [i, e] of DEMO_EMPLOYEES.entries()) {
    const created = await api.post<{ id: string }>("/hr/employees", {
      fullName: e.name,
      gender: e.gender,
      phone: `0111${String(1000000 + i * 4111).slice(-7)}`,
      nationalId: `2${String(85010100000000 + i * 7777777).slice(0, 13)}`,
      branchId: ids.branches[e.branch],
      departmentId: depts.get(e.dept),
      jobTitleId: jobs.get(e.job),
      hireDate: e.hire,
      employmentType: "full_time",
      paymentMethod: e.pay,
      bankName: e.pay === "bank" ? "البنك الأهلي المصري" : null,
      bankAccount: e.pay === "bank" ? `12030045${String(1000 + i)}` : null,
    });
    await api.post(`/hr/employees/${created.id}/salaries`, {
      effectiveFrom: e.hire,
      basicMinorUnits: String(e.basic * 100),
      lines: [{ componentId: transport.id }, { componentId: housing.id }],
    });
    employees.push(created.id);
  }
  return { employees };
}

// ─────────────────────────── activity ───────────────────────────

const HISTORY_DAYS = 92;

async function runHistory(ctx: Ctx, hr: HrState): Promise<void> {
  const openSales: {
    id: string;
    customerId: string;
    open: number;
    date: string;
    delivery?: string;
  }[] = [];
  const openPurchases: {
    id: string;
    supplierId: string;
    open: number;
    date: string;
  }[] = [];

  // Opening stock: one big purchase per supplier on day one.
  const first = daysAgo(HISTORY_DAYS);
  for (const supplier of Object.keys(DEMO_SUPPLIERS) as DemoSupplierKey[]) {
    await purchase(ctx, supplier, isoDay(first), "opening", openPurchases);
  }
  await settle(ctx);

  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const date = daysAgo(d);
    const day = isoDay(date);
    const weekday = date.getDay(); // 5 = Friday (closed)
    if (weekday === 5) continue;

    // Restock low items every Sunday; a near-expiry promo lot ten days ago.
    if (weekday === 0 && d < HISTORY_DAYS - 2) {
      for (const supplier of Object.keys(DEMO_SUPPLIERS) as DemoSupplierKey[])
        await purchase(ctx, supplier, day, "restock", openPurchases);
      await settle(ctx);
    }
    if (d === 10) {
      await purchase(ctx, "mars", day, "near-expiry", openPurchases);
      await settle(ctx);
    }

    // Branches get stock every Saturday and Tuesday.
    if (weekday === 6 || weekday === 2) {
      await transfer(ctx, "maadi", day);
      await transfer(ctx, "nasr", day);
    }

    // Wholesale invoices from the main warehouse.
    const count = 4 + Math.floor(ctx.rand() * 3);
    for (let i = 0; i < count; i++) await wholesaleInvoice(ctx, day, openSales);

    // Branch counter sales (cash).
    for (const branch of ["maadi", "nasr"] as const) {
      const n = 2 + Math.floor(ctx.rand() * 2);
      for (let i = 0; i < n; i++) await branchCashSale(ctx, branch, day);
    }

    // Collections on Mondays and Wednesdays; supplier payments on the 1st and 15th.
    if (weekday === 1 || weekday === 3) await collect(ctx, day, openSales);
    if (date.getDate() === 1 || date.getDate() === 15)
      await paySuppliers(ctx, day, openPurchases);

    // A customer return now and then.
    if (d % 17 === 0) await salesReturn(ctx, day, openSales);

    await expenses(ctx, date, day);

    // Cash is banked twice a week: the cashboxes keep a float, the rest goes to the bank.
    if (weekday === 3 || weekday === 6) await depositCash(ctx, day);

    // Payroll: on the 1st, run, post and pay last month.
    if (date.getDate() === 1 && d < HISTORY_DAYS - 25) await payroll(ctx, date);
    if (d === HISTORY_DAYS - 20) await employeeLoan(ctx, hr, day, date);

    if (d % 10 === 0) console.log(`  … ${day}`);
  }
  await settle(ctx);
}

/**
 * Posted purchases reach stock (and every document reaches the ledger) through the API's outbox
 * worker, a few seconds later. Wait for it to drain before selling what was just bought.
 */
async function settle(ctx: Ctx): Promise<void> {
  for (let i = 0; i < 180; i++) {
    const s = await ctx.api.get<{
      pending: number;
      processing: number;
      failed: number;
    }>("/outbox-events/summary");
    if (s.failed > 0) {
      const failed = await ctx.api.get<unknown[]>(
        "/outbox-events?status=failed",
      );
      throw new Error(
        `Background posting failed: ${JSON.stringify(failed).slice(0, 1500)}`,
      );
    }
    if (s.pending + s.processing === 0) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    "The API did not finish its background postings in 3 minutes — is its outbox worker running?",
  );
}

function pick<T>(ctx: Ctx, items: T[]): T {
  return items[Math.floor(ctx.rand() * items.length)]!;
}

function have(
  ctx: Ctx,
  wh: "main" | "maadi" | "nasr",
  variantId: string,
): number {
  return ctx.stock[wh].get(variantId) ?? 0;
}
function move(
  ctx: Ctx,
  wh: "main" | "maadi" | "nasr",
  variantId: string,
  pieces: number,
): void {
  ctx.stock[wh].set(variantId, have(ctx, wh, variantId) + pieces);
}

async function purchase(
  ctx: Ctx,
  supplier: DemoSupplierKey,
  day: string,
  kind: "opening" | "restock" | "near-expiry",
  openPurchases: {
    id: string;
    supplierId: string;
    open: number;
    date: string;
  }[],
): Promise<void> {
  const items = ctx.products.filter((p) => p.supplier === supplier);
  const lines = [];
  let total = 0;
  for (const item of kind === "near-expiry" ? items.slice(0, 4) : items) {
    const cartonPieces = item.perBox * item.boxesPerCarton;
    let cartons: number;
    if (kind === "opening")
      cartons = Math.max(4, Math.ceil(1400 / cartonPieces));
    else if (kind === "near-expiry")
      cartons = Math.max(2, Math.ceil(600 / cartonPieces));
    else {
      if (have(ctx, "main", item.variantId) > 700) continue;
      cartons = Math.max(2, Math.ceil(1200 / cartonPieces));
    }
    const pieces = cartons * cartonPieces;
    const expiry = new Date(`${day}T00:00:00Z`);
    if (kind === "near-expiry") expiry.setUTCDate(expiry.getUTCDate() + 35);
    else expiry.setUTCMonth(expiry.getUTCMonth() + item.shelfMonths);
    lines.push({
      productVariantId: item.variantId,
      unitOfMeasureId: ctx.ids.carton,
      quantityInvoiced: cartons,
      unitPrice: money(item.prices.cost * cartonPieces),
      lots: [
        {
          lotNumber: `L${day.replace(/-/g, "").slice(2)}-${item.productId.slice(0, 4).toUpperCase()}`,
          expiryDate: isoDay(expiry),
          quantity: cartons,
        },
      ], // lot quantity is in the line's unit
    });
    total += item.prices.cost * pieces;
    move(ctx, "main", item.variantId, pieces);
  }
  if (!lines.length) return;
  const invoice = await ctx.api.post<{ id: string }>("/purchase-invoices", {
    supplierId: ctx.suppliers[supplier],
    directLines: lines,
    warehouseId: ctx.ids.warehouses.main,
    // Unique per supplier even when a restock and a promo lot land on the same day.
    supplierInvoiceNumber: `S-${day.replace(/-/g, "")}-${supplier.slice(0, 3).toUpperCase()}${kind === "near-expiry" ? "-P" : ""}`,
    invoiceDate: day,
    notes: kind === "near-expiry" ? "دفعة عرض بتاريخ صلاحية قريب" : null,
  });
  await ctx.api.post(`/purchase-invoices/${invoice.id}/post`);
  openPurchases.push({
    id: invoice.id,
    supplierId: ctx.suppliers[supplier],
    open: total,
    date: day,
  });
}

async function transfer(
  ctx: Ctx,
  branch: "maadi" | "nasr",
  day: string,
): Promise<void> {
  const lines = [];
  for (const item of ctx.products) {
    const target = 120 + Math.floor(ctx.rand() * 80);
    const need = target - have(ctx, branch, item.variantId);
    if (need < 24) continue;
    const boxes = Math.ceil(need / item.perBox);
    const pieces = boxes * item.perBox;
    if (have(ctx, "main", item.variantId) - pieces < 200) continue;
    lines.push({ productVariantId: item.variantId, quantity: pieces });
    move(ctx, "main", item.variantId, -pieces);
    move(ctx, branch, item.variantId, pieces);
  }
  if (!lines.length) return;
  const t = await ctx.api.post<{ id: string }>("/stock-transfers", {
    fromWarehouseId: ctx.ids.warehouses.main,
    toWarehouseId: ctx.ids.warehouses[branch],
    transferDate: day,
    notes: "تغذية الفرع",
    lines,
  });
  await postStockTransfer(ctx, t.id);
}

async function postStockTransfer(ctx: Ctx, id: string): Promise<void> {
  await ctx.api.post(`/stock-transfers/${id}/post`);
}

async function wholesaleInvoice(
  ctx: Ctx,
  day: string,
  openSales: { id: string; customerId: string; open: number; date: string }[],
): Promise<void> {
  const customer = pick(ctx, ctx.customers);
  const lineCount = 3 + Math.floor(ctx.rand() * 5);
  const chosen = new Set<number>();
  const lines = [];
  let total = 0;
  for (let i = 0; i < lineCount * 3 && lines.length < lineCount; i++) {
    const idx = Math.floor(ctx.rand() * ctx.products.length);
    if (chosen.has(idx)) continue;
    chosen.add(idx);
    const item = ctx.products[idx]!;
    const byCarton = item.boxesPerCarton === 1;
    const unitPieces = byCarton
      ? item.perBox * item.boxesPerCarton
      : item.perBox;
    const qty =
      customer.kind === "wholesale"
        ? 2 + Math.floor(ctx.rand() * 6)
        : 1 + Math.floor(ctx.rand() * 3);
    const pieces = qty * unitPieces;
    if (have(ctx, "main", item.variantId) - pieces < 50) continue;
    const unitPrice =
      (customer.kind === "wholesale"
        ? item.prices.wholesale
        : Math.round(item.prices.retail * 0.93)) * unitPieces;
    lines.push({
      productVariantId: item.variantId,
      unitOfMeasureId: byCarton ? ctx.ids.carton : ctx.ids.box,
      quantity: qty,
      unitPrice: money(unitPrice),
    });
    total += unitPrice * qty;
    move(ctx, "main", item.variantId, -pieces);
  }
  if (!lines.length) return;
  const due = new Date(`${day}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + (customer.kind === "wholesale" ? 30 : 15));
  const invoice = await ctx.api.post<{ id: string }>("/sales-invoices", {
    customerId: customer.id,
    directLines: lines,
    warehouseId: ctx.ids.warehouses.main,
    invoiceDate: day,
    dueDate: isoDay(due),
  });
  await ctx.api.post(`/sales-invoices/${invoice.id}/post`);
  openSales.push({
    id: invoice.id,
    customerId: customer.id,
    open: total,
    date: day,
  });
}

async function branchCashSale(
  ctx: Ctx,
  branch: "maadi" | "nasr",
  day: string,
): Promise<void> {
  const lines = [];
  let total = 0;
  const chosen = new Set<number>();
  const want = 2 + Math.floor(ctx.rand() * 5);
  for (let i = 0; i < want * 3 && lines.length < want; i++) {
    const idx = Math.floor(ctx.rand() * ctx.products.length);
    if (chosen.has(idx)) continue;
    chosen.add(idx);
    const item = ctx.products[idx]!;
    const qty = 1 + Math.floor(ctx.rand() * 6);
    if (have(ctx, branch, item.variantId) - qty < 5) continue;
    lines.push({
      productVariantId: item.variantId,
      unitOfMeasureId: ctx.ids.piece,
      quantity: qty,
      unitPrice: money(item.prices.retail),
    });
    total += item.prices.retail * qty;
    move(ctx, branch, item.variantId, -qty);
  }
  if (!lines.length) return;
  const invoice = await ctx.api.post<{ id: string }>("/sales-invoices", {
    customerId: ctx.ids.walkIn,
    directLines: lines,
    warehouseId: ctx.ids.warehouses[branch],
    invoiceDate: day,
    dueDate: day,
  });
  await ctx.api.post(`/sales-invoices/${invoice.id}/post`);
  await receipt(ctx, {
    customerId: ctx.ids.walkIn,
    amount: money(total),
    paymentMethod: "cash",
    paymentDate: day,
    treasuryId: ctx.ids.treasuries[branch],
    allocations: [
      { salesInvoiceId: invoice.id, allocatedAmount: money(total) },
    ],
  });
}

/** A customer receipt is saved as a draft, then posted (money into the treasury, allocations applied). */
async function receipt(ctx: Ctx, body: Record<string, unknown>): Promise<void> {
  const created = await ctx.api.post<{ id: string }>(
    "/payments-received",
    body,
  );
  await ctx.api.post(`/payments-received/${created.id}/post`);
}

async function collect(
  ctx: Ctx,
  day: string,
  openSales: { id: string; customerId: string; open: number; date: string }[],
): Promise<void> {
  const today = new Date(`${day}T00:00:00Z`).getTime();
  const byCustomer = new Map<string, typeof openSales>();
  for (const inv of openSales) {
    if (inv.open <= 0) continue;
    const age =
      (today - new Date(`${inv.date}T00:00:00Z`).getTime()) / 86_400_000;
    if (age < 10) continue;
    byCustomer.set(inv.customerId, [
      ...(byCustomer.get(inv.customerId) ?? []),
      inv,
    ]);
  }
  for (const [customerId, invoices] of byCustomer) {
    if (ctx.rand() < 0.45) continue;
    // Pays the older invoices; sometimes only part of the last one.
    const allocations = [];
    let amount = 0;
    for (const inv of invoices.slice(0, 3)) {
      const part = ctx.rand() < 0.25 ? Math.round(inv.open * 0.5) : inv.open;
      if (part <= 0) continue;
      allocations.push({
        salesInvoiceId: inv.id,
        allocatedAmount: money(part),
      });
      amount += part;
      inv.open -= part;
    }
    if (!allocations.length) continue;
    const bank = ctx.rand() < 0.4;
    await receipt(ctx, {
      customerId,
      amount: money(amount),
      paymentMethod: bank ? "bank_transfer" : "cash",
      paymentDate: day,
      treasuryId: bank ? ctx.ids.treasuries.bank : ctx.ids.treasuries.main,
      referenceNumber: bank
        ? `TRX-${day.replace(/-/g, "")}-${Math.floor(ctx.rand() * 9000 + 1000)}`
        : null,
      allocations,
    });
  }
}

async function paySuppliers(
  ctx: Ctx,
  day: string,
  openPurchases: {
    id: string;
    supplierId: string;
    open: number;
    date: string;
  }[],
): Promise<void> {
  const today = new Date(`${day}T00:00:00Z`).getTime();
  const bySupplier = new Map<string, typeof openPurchases>();
  for (const inv of openPurchases) {
    const age =
      (today - new Date(`${inv.date}T00:00:00Z`).getTime()) / 86_400_000;
    if (inv.open > 0 && age >= 12)
      bySupplier.set(inv.supplierId, [
        ...(bySupplier.get(inv.supplierId) ?? []),
        inv,
      ]);
  }
  for (const [supplierId, invoices] of bySupplier) {
    const allocations = invoices.map((inv) => ({
      purchaseInvoiceId: inv.id,
      allocatedAmount: money(inv.open),
    }));
    const amount = invoices.reduce((s, inv) => s + inv.open, 0);
    invoices.forEach((inv) => (inv.open = 0));
    const payment = await ctx.api.post<{ id: string }>("/supplier-payments", {
      supplierId,
      amount: money(amount),
      paymentMethod: "bank_transfer",
      paymentDate: day,
      treasuryId: ctx.ids.treasuries.bank,
      referenceNumber: `OUT-${day.replace(/-/g, "")}`,
      allocations,
    });
    await ctx.api.post(`/supplier-payments/${payment.id}/post`);
  }
}

async function salesReturn(
  ctx: Ctx,
  day: string,
  openSales: { id: string; customerId: string; open: number; date: string }[],
): Promise<void> {
  const candidates = openSales.filter((s) => s.open > 0).slice(-15);
  if (!candidates.length) return;
  const inv = pick(ctx, candidates);
  // A direct invoice is backed by an order and a delivery note behind the scenes: return against that.
  const invoice = await ctx.api.get<{ salesOrderId: string | null }>(
    `/sales-invoices/${inv.id}`,
  );
  if (!invoice.salesOrderId) return;
  const [deliveryRow] = await ctx.api.get<{ id: string }[]>(
    `/deliveries?salesOrderId=${invoice.salesOrderId}`,
  );
  if (!deliveryRow) return;
  const delivery = await ctx.api.get<{ lines: { id: string }[] }>(
    `/deliveries/${deliveryRow.id}`,
  );
  const line = delivery.lines[0];
  if (!line) return;
  const created = await ctx.api.post<{ id: string }>("/sales-returns", {
    deliveryId: deliveryRow.id,
    returnDate: day,
    notes: "مرتجع - تلف في العبوة",
    lines: [
      { deliveryLineId: line.id, quantityReturned: 1, reason: "عبوة تالفة" },
    ],
  });
  await ctx.api.post(`/sales-returns/${created.id}/confirm`);
}

async function depositCash(ctx: Ctx, day: string): Promise<void> {
  const { treasuries } = ctx.ids;
  const floats: [string, number][] = [
    [treasuries.main, 15_000_000],
    [treasuries.maadi, 1_500_000],
    [treasuries.nasr, 1_500_000],
  ];
  const balances =
    await ctx.api.get<{ id: string; balance: { amountMinorUnits: string } }[]>(
      "/treasuries",
    );
  for (const [id, float] of floats) {
    const balance = Number(
      balances.find((t) => t.id === id)?.balance.amountMinorUnits ?? 0,
    );
    const amount = Math.floor((balance - float) / 100_000) * 100_000; // whole thousands
    if (amount <= 0) continue;
    await ctx.api.post("/treasury-vouchers", {
      kind: "transfer",
      voucherDate: day,
      treasuryId: id,
      toTreasuryId: treasuries.bank,
      amountMinorUnits: String(amount),
      description: "إيداع نقدية بالبنك",
    });
  }
}

async function expenses(ctx: Ctx, date: Date, day: string): Promise<void> {
  const { ids } = ctx;
  const voucher = (
    treasuryId: string,
    categoryId: string,
    amountEgp: number,
    description: string,
    counterparty?: string,
    // The branch the expense counts for when paid from another branch's treasury.
    branchId?: string,
  ) =>
    ctx.api.post("/treasury-vouchers", {
      kind: "expense",
      voucherDate: day,
      treasuryId,
      categoryId,
      branchId: branchId ?? null,
      amountMinorUnits: String(Math.round(amountEgp * 100)),
      description,
      counterparty: counterparty ?? null,
    });
  if (date.getDate() === 2) {
    await voucher(
      ids.treasuries.bank,
      ids.expense.rent!,
      45000,
      "إيجار المخزن الرئيسي",
      "شركة العبور للعقارات",
    );
    await voucher(
      ids.treasuries.maadi,
      ids.expense.rent!,
      3000,
      "إيجار فرع المعادي (دفعة نقدية)",
    );
    await voucher(
      ids.treasuries.bank,
      ids.expense.rent!,
      15000,
      "إيجار فرع المعادي",
      "م. فؤاد شاكر",
      ids.branches.maadi,
    );
    await voucher(
      ids.treasuries.bank,
      ids.expense.rent!,
      17000,
      "إيجار فرع مدينة نصر",
      "أ. ليلى حمدي",
      ids.branches.nasr,
    );
  }
  if (date.getDate() === 5) {
    await voucher(
      ids.treasuries.main,
      ids.expense.utilities!,
      6200 + Math.round(ctx.rand() * 1500),
      "فاتورة الكهرباء - المخزن الرئيسي",
    );
    await voucher(
      ids.treasuries.main,
      ids.expense.internet!,
      1450,
      "باقة الإنترنت والتليفونات",
    );
  }
  if (date.getDay() === 6)
    await voucher(
      ids.treasuries.main,
      ids.expense.fuel!,
      2800 + Math.round(ctx.rand() * 900),
      "سولار عربيات التوزيع",
    );
  if (date.getDate() === 20)
    await voucher(
      ids.treasuries.main,
      ids.expense.maintenance!,
      1800 + Math.round(ctx.rand() * 2500),
      "صيانة عربية توزيع",
    );
  if (date.getDay() === 0)
    await voucher(
      ids.treasuries.main,
      ids.expense.hospitality!,
      350,
      "مشروبات ومستلزمات نظافة",
    );
}

async function payroll(ctx: Ctx, date: Date): Promise<void> {
  const prev = new Date(Date.UTC(date.getFullYear(), date.getMonth() - 1, 1));
  const month = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const run = await ctx.api.post<{ id: string }>("/hr/payroll-runs", {
    month,
    notes: `مرتبات ${month}`,
  });
  await ctx.api.post(`/hr/payroll-runs/${run.id}/post`);
  await ctx.api.post(`/hr/payroll-runs/${run.id}/pay`, {
    treasuryId: ctx.ids.treasuries.bank,
    date: isoDay(date),
  });
}

async function employeeLoan(
  ctx: Ctx,
  hr: HrState,
  day: string,
  date: Date,
): Promise<void> {
  const next = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1));
  const firstMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  const loan = await ctx.api.post<{ id: string }>("/hr/loans", {
    employeeId: hr.employees[8]!,
    amountMinorUnits: "600000",
    installmentCount: 6,
    firstMonth,
    reason: "سلفة ظروف عائلية",
  });
  await ctx.api.post(`/hr/loans/${loan.id}/approve`, {});
  await ctx.api.post(`/hr/loans/${loan.id}/disburse`, {
    treasuryId: ctx.ids.treasuries.main,
    date: day,
  });
}

async function runTodayPos(ctx: Ctx): Promise<void> {
  for (const branch of ["maadi", "nasr"] as const) {
    const session = await ctx.api.post<{ id: string }>("/pos-sessions", {
      openingCashAmount: money(50000),
      warehouseId: ctx.ids.warehouses[branch],
      treasuryId: ctx.ids.treasuries[branch],
    });
    let cash = 50000;
    for (let s = 0; s < 6; s++) {
      const lines: {
        productVariantId: string;
        quantity: number;
        unitPrice: ReturnType<typeof money>;
      }[] = [];
      let total = 0;
      for (let i = 0; i < 1 + Math.floor(ctx.rand() * 4); i++) {
        const item = pick(ctx, ctx.products);
        const qty = 1 + Math.floor(ctx.rand() * 3);
        if (
          lines.some((l) => l.productVariantId === item.variantId) ||
          have(ctx, branch, item.variantId) - qty < 3
        )
          continue;
        lines.push({
          productVariantId: item.variantId,
          quantity: qty,
          unitPrice: money(item.prices.retail),
        });
        total += item.prices.retail * qty;
        move(ctx, branch, item.variantId, -qty);
      }
      if (!lines.length) continue;
      const card = s % 3 === 2;
      await ctx.api.post(`/pos-sessions/${session.id}/checkout`, {
        lines,
        tenders: [
          card
            ? {
                paymentMethod: "card",
                amount: money(total),
                treasuryId: ctx.ids.treasuries.bank,
              }
            : { paymentMethod: "cash", amount: money(total) },
        ],
      });
      if (!card) cash += total;
    }
    if (branch === "maadi")
      await ctx.api.post(`/pos-sessions/${session.id}/close`, {
        countedCashAmount: money(cash),
        notes: "وردية الصبح",
      });
  }
  await settle(ctx);
}

// ─────────────────────────── helpers ───────────────────────────

function step(label: string): void {
  console.log(`[demo-seed] ${label}…`);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Deterministic PRNG so every run builds the same company. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A valid EAN-13 from 12 digits. */
function ean13(twelve: string): string {
  const digits = twelve.slice(0, 12).split("").map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0);
  return `${digits.join("")}${(10 - (sum % 10)) % 10}`;
}
