# Jumia Seller Center account statement — real format (from the clothing client, 2026-10-14)

CSV, UTF-8. Columns:
- Transaction Date, Transaction Type, Transaction Number, Transaction State (APPROVED)
- Details (product name), Seller SKU, Jumia SKU, **Amount** (signed)
- **Statement Start Date / Statement End Date** (weekly, Sun 21:00 to the next Sun 20:59 local)
- **Paid Status** (PAID / OPEN)
- **Order No.**, Order Item No., Order Item Status (DELIVERED / RETURNED / empty for ads)
- Shipping Provider, Tracking Number, Comment, Local Exchange rate, Country Code
- **Statement Number** (for example PS261005EG3QO2Z)

One export can hold several weekly statements, including the current OPEN one.

## Transaction types → settlement treatment (built-in preset, commit after 39dea2b)
| Type | Sign | Treatment |
|---|---|---|
| Item Price Credit | + | paid order (per Order No.) |
| Item Price | − | refund of an earlier paid item (return) |
| Commission | − | fee → "عمولات المنصات" |
| Commission Credit | + | commission given back on a return; nets inside the commission line |
| Shipping & Processing Fee | − | fee → "رسوم شحن وتوصيل المنصات" (per item) |
| Shipping & Processing Fee Credit | + | given back on a return; nets inside the shipping line |
| Sponsored Products | − | ads → "تسويق وإعلان" (no order number) |

Check on the sample: statement PS261005EG3QO2Z:
- orders 17,855.00
- refunds 770.00
- fees 4,562.75 (commission 2,678.25 − 115.50, shipping 615 − 15, ads 1,400)
- **net 12,522.25**, the same as the statement's own sum.

## Notes
- A RETURNED item can still show an Item Price Credit (paid), with its refund ("Item Price" −) coming in a later statement.
- Seller SKU is present per item. It could later be used to create the invoices automatically from the statement for orders not entered daily (not built).
