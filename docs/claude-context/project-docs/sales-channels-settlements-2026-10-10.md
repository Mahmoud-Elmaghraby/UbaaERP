# Sales channels and marketplace settlements (2026-10-10)

Approved by the owner for a clothing brand that sells on Jumia, Noon and Amazon and also sells directly. The platform delivers and collects; every Monday it closes the period, Tuesday it wires the money, and Wednesday the money reaches the bank. The statement deducts ads and refunds of earlier orders.

## Model
- **Platform = a customer with a running account.** Each platform order is an invoice on that customer, tagged with `sales_channel_id` and `external_reference` (the platform order number).
- **`sales_channels`** (migration 0099):
  - kind `marketplace` or `direct`.
  - A marketplace channel has `customer_id` (the platform as a customer) and `treasury_id` (for example "حساب جوميا", where the money sits until it reaches the bank).
- **`channel_settlements` + lines:** kinds order / refund / fee (positive amounts; the kind gives the direction). Fee lines carry an expense item (`treasury_categories`).
  - On save, lines are matched to the channel's posted invoices of that customer by order number. Match states: matched, amount_mismatch, unmatched, already_paid.
  - On post, in one transaction:
    1. A `payments_received` from the platform for (orders − refunds), posted, into the channel treasury and allocated to the matched invoices up to what is open on each.
    2. The fees become a `marketplace_fees` treasury movement out of the channel treasury (Sales' movement source).
    3. Outbox `sales.channel_settlement.posted`, and the Accounting listener books Dr expense item / Cr channel treasury.
  - Blocked when refunds exceed orders.
  - A fee-heavy week can leave the channel treasury negative: that is real, the platform keeps it.
- **Bank arrival:** an ordinary treasury transfer from the channel treasury to the bank, on the arrival date.
- **Unpaid orders:** `GET /sales-channels/:id/unpaid-orders` lists the open channel invoices with their age.
- **Import:**
  - The web parses the platform's Excel/CSV.
  - The user picks the order#, type and amount columns once, and says what each transaction type is: order / refund / fee + expense item / ignore.
  - The mapping is remembered per channel in localStorage.
  - Lines are aggregated per order (orders, refunds) and per type+item (fees).
- Expense items "عمولات المنصات" and "رسوم شحن وتوصيل المنصات" are seeded (migration 0100, account 524).

## Not done yet / next
- Importing the daily platform orders file to create the invoices automatically (they are entered per order today).
- A profitability report per channel: sales − COGS − platform fees − channel marketing.
- Tagging general marketing expenses (for example the marketing company) with a channel.
- An expense bill on credit for the marketing company (today an expense voucher has to be paid).
- Real Jumia, Noon and Amazon statement samples, to pre-set the column mapping.
