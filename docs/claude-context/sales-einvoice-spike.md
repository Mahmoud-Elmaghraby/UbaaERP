# Sales Module — Egyptian E-Invoice (ETA) Spike

**Date:** 2026-08-30. Mandatory technical spike per CLAUDE.md §8 ("Mandatory technical spike before writing Sales module code... Do not skip or shortcut this spike"), done before any Sales module backend code is written, per CLAUDE.md §10 step 4's blocking note. This is desk research + architecture design, not a running prototype — see "What this spike could not do remotely" at the bottom for why, and what's needed from the user before a live prototype is possible.

## 1. What ETA e-invoicing actually is (legal/business shape)

- Legal basis: Article 35, VAT compliance. All VAT-registered businesses in Egypt must issue e-invoices; a threshold drop (EGP 500,000 → **EGP 250,000** annual revenue) newly mandates more businesses starting 2026, with a 31 March 2026 registration deadline and real financial penalties for late/non-compliance (tiered: warning → EGP 5,000/document capped at 50,000/month → EGP 10,000/document uncapped, effective 1 Jan 2026).
- Two document families, same underlying JSON/XML shape and signing requirement:
  - **E-invoice** — B2B, real-time "clearance" model: the document must be validated and accepted by the ETA portal *before* it's legally valid. Requires an electronic seal.
  - **E-receipt** — B2C, point-of-sale: sale can complete immediately at the till, reported to ETA within a 24–72 hour (max 3-day) window. Different submission channel/shape but the same signing/certificate infrastructure.
- Non-compliance consequence for the business: inability to claim VAT deductions/refunds, plus the tiered fines above.

Sources: [vatit.com Egypt e-invoicing guide](https://vatit.com/e-invoicing-guide/egypt/), [VATupdate briefing](https://www.vatupdate.com/2026/02/23/briefing-document-podcast-e-invoicing-e-reporting-in-egypt/), [ClearTax Egypt guide](https://www.cleartax.com/eg/en/e-invoicing-egypt), [OrchidaTax FAQ](https://orchidatax.com/eta-e-invoicing-egypt-faq/).

## 2. Environments

| Service | Production | Pre-production (sandbox) |
|---|---|---|
| SDK / docs | `sdk.invoicing.eta.gov.eg` | `sdk.preprod.invoicing.eta.gov.eg` |
| Identity portal | `profile.eta.gov.eg` | `profile.preprod.eta.gov.eg` |
| Invoicing portal | `invoicing.eta.gov.eg` | `preprod.invoicing.eta.gov.eg` |
| OAuth token endpoint | `id.eta.gov.eg` | `id.preprod.eta.gov.eg` |
| ERP/document API | `api.invoicing.eta.gov.eg` | `api.preprod.invoicing.eta.gov.eg` |

Source: [ETA SDK links PDF](https://www.eta.gov.eg/sites/default/files/2021-09/SDK%20links_0.pdf), cross-checked against the [official SDK site](https://sdk.invoicing.eta.gov.eg/) and the [public Postman collection](https://github.com/celikonline/Egypteinvoice/blob/master/Egyptian%20e-Invoicing%20SDK.postman_collection.json).

**Important de-risking fact for this spike:** preprod uses document schema **v0.9 with signature validation disabled**. That means the whole submission/status/accept-reject flow can be built and tested against preprod *without* a real HSM/USB token — only the move to production (schema v1.0) requires real signing hardware. This significantly lowers the cost of building and testing the integration early.

## 3. Authentication & document submission flow (confirmed from the public Postman collection)

- **OAuth2 Client Credentials grant.** `POST {idSrvBaseUrl}/connect/token` with `client_id` / `client_secret` / `scope=Mcs.Invoicing.Api` → Bearer access token, cached for its ~60-minute lifetime (not refetched per call).
- **Submit:** `POST /api/v1/documentsubmissions` — body `{ documents: [{ issuer, receiver, documentType, documentTypeVersion, dateTimeIssued, taxActivityCode, internalID, poReference, references, invoiceLines, totalSales, totalDiscount, netAmount, taxTotals, totalAmount, signatures }] }`. Returns **HTTP 202** (accepted for async processing) plus a `submissionUUID` — this is not a synchronous accept/reject.
- **Poll:** `GET /api/v1.0/documentSubmissions/{submissionUUID}` until ETA finishes async validation → each document resolves to a `documentUUID` (26 chars) + `longId` (42 chars), status `valid`/`invalid`.
- **Cancel (issuer) / Reject (recipient):** `PUT /api/v1.0/documents/state/{documentUUID}/state`.
- Supporting reads: document types/versions, recent documents, raw document, PDF printout, taxpayer notifications (`GET /api/v1/notifications/taxpayer`).
- Common error codes worth designing around: `400 BadStructure` (schema mismatch), `403 IncorrectSubmitter` (client_id ≠ issuer TIN), `422 DuplicateSubmission` (same doc resubmitted within ~10 min), `429/503` (rate limit/overload — retryable).

Every product/service line must carry a **GS1 GTIN or an ETA "EGS" code** — this is a hard schema requirement, not optional metadata. GS1 codes are a paid subscription (activate within 24h); EGS codes are free but need GPC classification + ETA approval (~15 days). **This directly touches the Inventory module's `product_variants` table**, which currently has no such field — a nullable `gs1_code`/`egs_code` column will need to be added when Sales integration actually starts, which is forward-compatible (an additive, nullable migration) and does not require reopening any [مستقر] decision. Not proposing to add it yet — flagging it as a known, small, unavoidable Inventory touch for when Sales work begins.

Sources: [Postman collection](https://github.com/celikonline/Egypteinvoice/blob/master/Egyptian%20e-Invoicing%20SDK.postman_collection.json), [ETA toolkit token API](https://sdk.invoicing.eta.gov.eg/toolkitapi/02-token/), [GS1 Egypt e-invoice guide](https://gs1eg.org/en/egypt-einvoice-guide/).

## 4. Signing / certificates — the genuinely hard part

- Production submissions must be digitally signed with an **X.509 electronic seal**, issued by an ETA-accredited certificate authority, held on either:
  - a **USB cryptographic token** — fine for low volume, but requires a token physically present wherever the signing happens (a real operational constraint for a server-side ERP), or
  - an **HSM (Hardware Security Module)** or a **cloud e-signature/PSP service** (e.g. providers like OrchidaTax act as a signing intermediary) — the realistic option for automated, high-volume signing from a backend service with no human clicking a USB dongle.
- The exact signing algorithm and canonical-JSON serialization rules needed to produce a valid signature are **not published on the public SDK portal** — they're only available once a business completes ETA's own onboarding/integration-toolkit process (a Docker/NuGet/CLI toolkit ETA hands out during preprod onboarding). This is a real gap this spike cannot close from open documentation alone.
- Practical implication: production-grade signing is very unlikely to be built fully in-house without either (a) going through ETA's own onboarding toolkit directly, or (b) using a third-party PSP/middleware that already handles the signing and exposes a simpler REST API to us. This is a genuine build-vs-buy decision, not an architecture detail — see "Decisions needed from the user" below.

Sources: [OrchidaTax FAQ](https://orchidatax.com/eta-e-invoicing-egypt-faq/), [Ecosire Odoo module docs](https://docs.ecosire.com/odoo-modules/egypt-eta-einvoicing) (the most concrete practical integration write-up found — describes exactly this HSM/PSP split and an Odoo module's real submission state machine).

## 5. Accept/reject/cancel cycle — the state machine

Confirmed timing (cross-checked across two independent sources):

- **Issuer cancel:** up to **7 days** after issuance, but requires the buyer's approval in-portal. If approved → status `Canceled`. If rejected or no response in time → the invoice stays valid and a **credit note** is required instead.
- **Recipient reject:** up to **3 days** to reject an incorrect B2B invoice via "Reject Document." After acceptance or after the window closes, rejection is no longer possible — only credit/debit notes referencing the original UUID.
- **E-receipts (B2C):** report within 24–72 hours (max 3 days) of sale; corrections via "return receipts" (negative receipts) or credit notes, not edits.
- After all windows close, the document is final and legally binding — any change is a new, linked document (credit/debit note), never a mutation of the original. This maps cleanly onto the same "no edit, only a new linked document" shape Purchase Invoices already established for `cancel()`/no-`update()`.

A realistic internal state machine (independently converged on by this research and the Ecosire/Odoo implementation) is:

```
draft → built → submitted → cleared | rejected
                     ↓ (on transient failure)
                pending_retry → dead_letter (after N attempts)
```

Sources: [VATupdate briefing](https://www.vatupdate.com/2026/02/23/briefing-document-podcast-e-invoicing-e-reporting-in-egypt/), [Ecosire Odoo module docs](https://docs.ecosire.com/odoo-modules/egypt-eta-einvoicing).

## 6. Proposed architecture (design only — not built yet)

Grounded directly in the Outbox Pattern infrastructure Purchases already built (`apps/api/src/shared/outbox/`, verified live in the repo: `outbox-writer.service.ts`, `outbox-dispatcher.service.ts`, `kysely-outbox-event.repository.ts`, `outbox-event.entity.ts`), not invented from scratch:

1. **`SalesInvoicesService.post()`** (mirrors `PurchaseInvoicesService.post()`) writes the status flip *and* an outbox row (`sales.sales_invoice.posted`) in the same DB transaction — per CLAUDE.md §2.7 [مستقر]. This part is a straight reuse of existing shared infrastructure, zero new architecture.
2. **New, Sales-scoped `EInvoiceSubmissionListener`**, `@OnEvent('sales.sales_invoice.posted')` (delivered via the outbox dispatcher's `emitAsync()`, same as every other outbox consumer) — does **not** call the ETA API synchronously inside the listener. It only writes a new `eta_submissions` row (`sales_invoice_id`, `status: 'draft'`, tenant schema) — keeping the listener itself fast and side-effect-free beyond that one insert, consistent with how `GoodsReceiptStockListener`/`PurchaseReturnStockListener` stay thin.
3. **New background service, `EtaSubmissionProcessorService`** (own polling loop, same shape as `OutboxDispatcherService` — `setInterval`/`OnModuleInit`, claims rows via `SELECT ... FOR UPDATE SKIP LOCKED`): builds the ETA JSON document from the sales invoice, calls the signing port, submits, and drives `eta_submissions.status` through the state machine in §5, polling `GET /documentSubmissions/{id}` until `cleared`/`rejected`, with the retry/dead-letter handling ETA's own async model requires. This is genuinely new infrastructure (nothing like it exists yet), but it's a sibling of the existing outbox dispatcher, not a new pattern.
4. **New port, `ESealSigner`** (application layer interface, infrastructure-layer implementation) — abstracts "sign this document" behind an interface so the actual signing mechanism (USB token / HSM / third-party PSP — see the open decision below) is swappable without touching application logic. This is the one piece of real uncertainty: the interface is easy to design, but its concrete implementation depends on the build-vs-buy decision in §4.
5. **New tenant-schema table, `eta_credentials`** — per-tenant `client_id`/`client_secret` (encrypted at rest — this project has no established secrets-encryption convention yet; flagging as a real gap, not deciding it here), TIN/RIN, environment (`preprod`/`production`), document schema version. Scoped inside the Sales module (or its own small `einvoice` sub-module under Sales), not the shared kernel — it's not a genuinely cross-module concept.
6. **Inventory touch (forward-compatible, not built now):** an additive nullable `gs1_code`/`egs_code` column on `product_variants`, needed once real submissions start — flagged per §3.

This keeps every [مستقر] rule intact: Clean Architecture layering, Event Bus + Outbox for the financial event, no direct module-to-module calls, Money VO for all amounts, PlanFeatureGuard still applicable to gating the e-invoice feature itself once plans exist.

## 7. What this spike could not do remotely

This was desk research from documentation, not a live end-to-end test — and it genuinely can't be, from this environment, for a structural reason: **ETA preprod credentials (client_id/client_secret, TIN/RIN) can only be issued to a real registered Egyptian taxpayer entity going through ETA's own onboarding**, which is the user's business, not something I can self-register. So while the request/response shapes above are confirmed from ETA's own public Postman collection and cross-checked across independent sources, none of it has been exercised against a live sandbox call yet.

## Decisions needed from the user before Sales implementation begins

1. **Signing strategy (build vs. buy) — the one decision that meaningfully changes the architecture.** In-house HSM/USB-token integration requires ETA's own private onboarding toolkit (undocumented publicly); a third-party PSP (e.g. OrchidaTax or similar ETA-accredited providers) trades a recurring vendor cost for a much simpler REST integration and no cryptography to maintain in-house. Recommend deciding this before `ESealSigner`'s concrete implementation is built — the interface itself can be designed either way.
2. **Who registers for ETA preprod access** (portal registration, client credentials, TIN/RIN) — needed before any live technical prototype (as opposed to this documentation-based design) can happen. This is outside what I can do from here.
3. **Secrets-at-rest convention** — `eta_credentials.client_secret` needs an encryption approach; the project has no established pattern for this yet (first secret stored in a tenant schema beyond hashed passwords). Worth deciding once, since Accounting/Sales/future integrations will likely need the same answer.

## Next

Per CLAUDE.md §10, once these three decisions are made (or the user explicitly says to proceed with reasonable defaults), Sales module backend implementation can begin, following the same stage-by-stage build discipline as Purchases (research pass already partly folded into this doc — a dedicated §17.2 competitor-feature pass for Sales itself, e.g. POS mode, still hasn't been done and should happen alongside/before the first Sales entity, per standing process).
