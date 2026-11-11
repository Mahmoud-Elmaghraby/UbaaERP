# New prospect: marble/tile engraving workshop — discovery (2026-10-16)

Status: discovery. Nothing built. Waiting on the user to interview the customer.

- **Question sheet:**
  - Live doc: https://claude.ai/code/artifact/9189a6ff-9f62-479d-bbd7-1e4ff15450dc
  - Repo copy: `docs/customers/engraving/customer-interview-questions.md` (not committed yet).
- **Working hypothesis (not approved):** a lightweight make-to-order **Job Orders** module rather than full MRP/BOM:
  - A job order linked to the quotation or sales order.
  - Configurable stages.
  - Material issue from inventory, with scrap tracking.
  - Machine and labour time costing.
  - WIP→COGS via the outbox.
  - Profitability per job.
- **Generic add-ons:**
  - Dimension-based lines (L×W→m²).
  - Customer deposits/advances. Verify whether these already exist.
  - A workshop job sheet print without prices.
- Per CLAUDE.md: a new module and a new financial flow need user approval, plus competitor research (Odoo MRP, Daftra) before building.
- The clothing priorities in the handoff (barcode labels, reports) are paused, not dropped.
