# Purchase debit notes, cash-box overdraft guard, hiding unused taxes (2026-10-09, commit 399e301)

## Purchase debit note (إشعار خصم مورد)
- Migration 0096: `purchase_debit_notes` and `purchase_debit_note_lines`. Number prefix `DBN-`.
- Created automatically when a purchase return is confirmed (`PurchaseDebitNotesService.issueForReturn`, in the same transaction).
- It covers only the **invoiced** part of each purchase-order line: min(returned, invoiced − already debited).
  - It uses the posted invoices' own net amount and tax rates, scaled pro rata.
  - Goods returned before invoicing get no note, because the receipt and the return cancel out in GRNI.
- Supplier statement and aging show it as a negative entry with kind `purchase_debit_note`.
- Outbox event `purchases.purchase_debit_note.issued` uses the same metadata shape as the invoice-posted event. Accounting posts the exact reverse (Dr AP / Cr GRNI or expense, plus VAT/table/withholding reversed).
- Known limitation: if goods are returned before they are invoiced, the later invoice can still bill the full order quantity. The invoice does not deduct returns yet.

## Cash boxes can't go negative
- `TreasuryMovementRegistry.assertCanWithdraw(trx, treasuryId, amount)` is the central check:
  - It locks the treasury row and computes opening balance + all movements.
  - It throws `TREASURY.INSUFFICIENT_BALANCE`, which has an Arabic message.
- Applies to cash and wallet treasuries only. Banks are exempt, since an overdraft is real there.
- Called from:
  - expense and transfer vouchers;
  - cancelling an income voucher or a transfer (on the receiving treasury);
  - posting a supplier payment.

## Taxes hidden when unused
- `useTaxesInUse(scope)` / `<WhenTaxesInUse>`: when the tenant has no active tax rule, these are hidden:
  - line tax pickers;
  - the "prices include tax" option;
  - withholding fields on customers and suppliers;
  - the product tax rule field;
  - tax total rows.
- Adding a rule in Settings brings everything back. There is no toggle.

Deployment: `pnpm --filter api db:migrate` (0096).
