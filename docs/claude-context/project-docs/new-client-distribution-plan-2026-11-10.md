# New key client (distribution company): plan, 2026-11-10

The full plan is in the Claude Doc "خطة العميل الجديد — ERP متكامل": https://claude.ai/artifact/9iZyHJSPXzeDBV1Y3PcC7c

## User decisions (2026-11-10)
- **Start with a complete HR module.** It must work on its own: it is a product we can sell to other customers by itself, even if this deal doesn't close. After HR, go step by step.
- **Hosting:** decided after the system is finished, when we pick a server for the client. Until then we test on a staging environment.
- **Transfers to shops are at cost,** but this may change. Build it as a setting: cost / cost + % / transfer price list.
- **Counts of reps, warehouses, shops and vehicles** are only needed for server sizing and pricing. They don't block development.
- **Don't build anything yet.** The user wants to discuss more first.

**What the client asked for**
- HR
- Inventory, purchases and accounting
- Wholesale and retail sales
- Sales reps on commission
- Shops run as POS, each with its own warehouse
- A delivery fleet: expenses, routes and depreciation
- Live map tracking of reps and their customer routes

## Client answers (2026-11-10)
- **Business:**
  - Food: chocolate, sweets and candy, with thousands of items.
  - So expiry dates, lots, first-expiry-first-out (FEFO) issuing and carton/box/piece units are key.
- **Users:** about 5 accountants; many reps and warehouses (exact counts still to come).
- **Reps:** they take orders and also sell straight from the van, so both flows are needed.
- **Commission:** on sales, as a fixed % or in tiers, with monthly targets.
- **Wholesale vs retail:** the difference is only the price, so the existing price lists are enough. Payment terms stay flexible per customer.
- **Phones:** reps use Android.
  - Proposal: web rep screens first, with a location stamp on each visit.
  - Then a native Android app, for live tracking and offline use.
- **Shops:**
  - Each shop is a warehouse, a POS and a treasury, supplied by transfers from the main warehouse.
  - No separate accounts, but each shop needs reports, and a cashier sees only their own shop.
- **Vehicles:**
  - Owned (fixed asset, depreciated) or rented (monthly rent as an expense).
  - Tracking comes from the driver's phone.
  - Fuel is paid from cash custody, settled against receipts.
- **Fingerprint machine:** model unknown, so we start with an Excel/CSV import.
- **Payroll:**
  - Monthly.
  - **No taxes are used anywhere in the system**, so payroll has no tax or insurance at first, and every screen must work with taxes switched off.
- **ETA:** the client isn't registered, so it is out of this client's plan.
- **Delivery:** in phases.

## Order (updated after the HR decision)
1. **HR, complete and standalone** — first.
2. Then the rest, one at a time:
   - foundation (shop restrictions, shop = warehouse + POS, payment methods and stock policy, expiry dates and lots, data import)
   - sales and shops (price tiers, commissions and targets, reports, web rep screens)
   - fleet and delivery
   - Android rep app with live map

**Waiting on**
- The discussion the user wants to have before any building.
- The user's approval for the fleet module and the Android app (HR itself is approved).
