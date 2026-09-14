# Settings / Users & Permissions / Platform Infra — Competitive Research

Date: 2026-09-12
Scope: Settings module, Users & Permissions module, cross-cutting platform infrastructure (multi-tenancy, Plan+self-service feature gating, dynamic custom fields, i18n/RTL).
Comparators: Odoo, SAP Business One (SAP B1), Microsoft Dynamics 365 Business Central (BC), NetSuite, ERPNext, Daftra, Wafeq.

Method note: findings come from public docs, vendor marketing pages, forums (Odoo/Frappe community, SAP community), and review sites, gathered via web search in Sept 2026. Daftra and Wafeq publish far less technical/architectural detail than the Tier-1 vendors, so several claims about them are inferred from pricing pages and help-center articles rather than confirmed engineering documentation — flagged explicitly below.

---

## 1. Settings Module

### 1.1 Parity gaps (confirmed/refined)

- **General company settings is genuinely thin today (currency only)** — this is a real, not-cosmetic gap, not something "everyone keeps minimal." Every comparator's company/general settings screen carries at minimum: legal company name, address, tax/VAT registration number, default currency, fiscal year start, and often logo + timezone, right in the base setup wizard:
  - Odoo's Companies settings and onboarding wizard collect company name, address, currency, and (per company) tax ID as very first-run steps.
  - SAP B1's "Company Details" (Administration → System Initialization) covers company name, address, base currency, fiscal year, local/foreign currency decimals, and multiple tax IDs — it's one of the most extensive of all comparators (reflecting SAP's on-prem/consultant-led implementation heritage).
  - Daftra's account setup explicitly walks users through Tax Number / C.R. (commercial registration) number display settings, logo, and tax settings as part of "Account Information and Settings" and a dedicated "General Accounting Settings" screen.
  - Wafeq's help docs treat company profile (name, tax number, currency, fiscal settings) as baseline, not optional/advanced.
  - **Conclusion: this platform's General tab (currency-only) is behind baseline expectation, not an acceptable minimalist norm.** It should be treated as a straightforward, non-differentiating fix (add company name/address/tax number/logo/timezone/fiscal-year-start) — this is table stakes, not something to spin as a strength.

- **No outbound email provider (console-only)** is a hard production blocker relative to every comparator — all of them send real transactional email (invoices, password resets, 2FA codes, approval notifications) out of the box. This needs to ship before general availability; it is not a differentiator gap, it's a readiness gap.

- **No visible timezone/locale-per-branch settings** — SAP B1 and BC support fiscal calendars and localization settings at a fairly granular level (BC in particular ships country-specific localization packs). Even Daftra exposes per-branch settings (branch-level tax registration, address) since branches are a paid tier feature for it. Given this platform already has real branches, branch-level settings (not just global company settings) should be checked for completeness — this wasn't explicitly enumerated but is worth an audit pass.

- **Document templates and numbering sequences** are already present and roughly match what Daftra/Wafeq offer (custom invoice templates, sequence numbering) — this is parity, not a gap.

### 1.2 Settings — differentiator candidates

1. **"Self-service module toggles, not a sales call" — TRUE TODAY.**
   The "Modules" self-service feature-toggle tab is a real, already-built capability. This directly contrasts with SAP B1 (adding a module/user typically means contacting the reseller/partner for a license change and often a consultant engagement) and, to a lesser extent, BC (module/add-on activation usually goes through a Microsoft partner or admin center with per-user license SKUs that need finance/procurement sign-off). Odoo Online lets you add apps yourself, so this isn't unique versus Odoo — but it *is* a real edge over SAP B1's and BC's partner-mediated model, which is exactly the "consultant tax" MENA SMBs resent. Marketing angle: "Turn on what you need this month, no reseller ticket, no waiting for a partner." Caveat: don't claim uniqueness against Odoo/ERPNext, both of which already have self-serve app enablement — position this specifically against the enterprise vendors (SAP B1/BC/NetSuite) and against Daftra/Wafeq's flat pricing-tier model (see §3).

2. **Recent security hardening bundle (TOTP 2FA + httpOnly refresh cookies + rate limiting + helmet) as a baseline claim — TRUE TODAY, but be careful how it's marketed.**
   TOTP-based 2FA is not confirmed as a Daftra feature in any public doc found (their docs/marketing don't mention it), and Wafeq's own user-permission docs make no mention of 2FA either. If true, this is a genuine, verifiable edge over the two direct regional competitors. However, 2FA is standard/expected in Odoo, SAP B1, BC, and NetSuite (all support MFA at minimum via SSO/Azure AD or platform-level MFA), so this only differentiates against Daftra/Wafeq specifically — do not market it as beating "all ERPs," only as beating the regional competitors on a security dimension SMB buyers increasingly ask about (especially now that Egypt's e-invoicing/e-receipt mandates put more financial data in these systems). **Confidence: MEDIUM** — could not confirm Daftra/Wafeq's 2FA status from outside; recommend the product owner verify directly (sign up for a Daftra/Wafeq trial) before publishing this claim, since a wrong claim about a named competitor is a real risk.

3. **Company settings completeness after the planned fix — BUILDABLE, small.**
   Once company name/address/tax number/logo/timezone are added (a small, overdue fix, see §1.1), the honest claim isn't "we have more settings than X" (everyone has this) — it's "your company profile, tax number, and branding sync automatically into every invoice/legal document and every branch," *if* that's actually wired end-to-end. That end-to-end wiring (one settings source of truth flowing into e-invoicing, PDF templates, and branch documents) is a real integration differentiator if built well, common failure point in SMB tools like Daftra where users report having to duplicate tax info per document type. Frame as a to-be-verified integration quality claim, not a feature-existence claim.

---

## 2. Users & Permissions Module

### 2.1 Parity gaps (confirmed/refined)

- **Granular, custom permission roles**: parity with ERPNext (role + role profile + field-level permission overrides), NetSuite (fully custom roles with per-record/per-field/per-subsidiary permissions — NetSuite's role system is actually one of the most granular in the market), SAP B1 (authorization levels: Full/Read/None per module/form, plus license-type-based ceilings), and Wafeq (fixed default roles — Owner/Admin/Accountant/Viewer/Employee — *plus* custom roles with granular page/data/report permissions). **This platform is at parity with the field, not ahead of it, on "granular permissions" alone** — don't market granular RBAC as a differentiator by itself; every serious competitor has it. Daftra's granular permission depth is less clear from public docs (their "Client Permissions Settings" doc is customer-portal-facing, not clearly about internal staff RBAC granularity) — flagged as unverified.

- **Approval chains**: this looks like a genuine area of relative strength. Public docs found no equivalent explicit "approval chain" workflow feature in Daftra's or Wafeq's documentation (Wafeq's permission docs show no workflow/approval-chain feature at all — confirmed absence in their user-facing docs, though absence-of-evidence is weaker than confirmed-absence). BC, NetSuite, and SAP B1 all have approval workflows, but they typically require add-on configuration (BC's approval workflows via Power Automate/workflow setup; NetSuite via SuiteFlow; SAP B1 via "Approval Procedures," which does exist out of the box but is often reported as clunky/rigid by implementers). If this platform's approval chains are simpler to configure than SAP B1's Approval Procedures and are just there by default (not requiring separate workflow-engine configuration), that is a real, marketable difference versus the regional competitors and a "less friction" story versus the Tier-1 vendors.

- **User-branch access scoping**: parity feature — Daftra gates branches by plan tier (see §3) but does support per-user branch access at the higher tiers; SAP B1 and BC support this via warehouse/location-level security. Not a differentiator, just expected functionality — but note Daftra makes you *pay more* to unlock more than 1 branch even on its top ("Premium") plan tier per the pricing page found, whereas branch access here is a data-model capability rather than a paid add-on gate — worth checking whether that's actually true in this platform's plan model, since if branches are ungated (or gated only by Plan tier, not nickel-and-dimed per branch) that's a real pricing-model differentiator (see §3).

- **Stable-code + Arabic-message error architecture**: this is an internal engineering quality improvement (consistent, localized error messages), not something competitors market about themselves, so it's not a *market-facing* differentiator on its own — but it is a precondition for a differentiator: "every error message in the product is native Arabic, not translated after the fact or a raw stack trace," which ties into the platform's broader Arabic-first claim (§4). Frame it as supporting evidence for that larger claim, not a standalone bullet.

### 2.2 Users & Permissions — differentiator candidates

4. **"Approval chains without a workflow engine to configure" — mostly TRUE TODAY (needs a UX/marketing check), differentiator strength MEDIUM-HIGH vs Daftra/Wafeq, MEDIUM vs SAP B1/BC/NetSuite.**
   If approval chains here are pre-built and admin-configurable without needing a separate workflow/automation module (unlike BC's Power Automate dependency or NetSuite's SuiteFlow, which need real configuration effort and often a partner), that's a genuine "it just works" story for SMB buyers who don't have an in-house workflow developer. Resonates in MENA because implementation cost/time is one of the top complaints about SAP B1/NetSuite/BC in this segment (long partner-led rollouts). Caveat: verify SAP B1's "Approval Procedures" (which does ship in the base product, contra assuming it needs an add-on) isn't already just as simple — the honest claim is about configuration friction, not feature presence.

5. **"Financial data isolation you can literally point to" (schema-per-tenant) tied together with RBAC — see Platform Infra §3 candidate 6, don't duplicate here.**

---

## 3. Platform Infrastructure

### 3.1 Parity gaps (confirmed/refined)

- **Multi-tenancy isolation model — important nuance found via research: "schema-per-tenant" is a real and legitimate differentiator, but the comparison set is more mixed than "we're isolated, they're not."**
  - **NetSuite is explicitly, proudly a *shared-database* true multi-tenant architecture** — NetSuite's own marketing states "running all customers on one instance of software and shared hardware" and frames this as a *strength* (cost savings, easy upgrades), not a weakness. This is the one case where this platform's stronger per-tenant isolation is a clean, honest, verifiable architectural difference from a named competitor, and it directly answers the objection some security-conscious buyers have about NetSuite's shared-everything model. **Use this one confidently.**
  - **ERPNext/Frappe Cloud is database-per-site** (each tenant gets its own database, not shared tables) per Frappe's own community forum — this is comparable to, arguably even stronger than, schema-per-tenant (separate DB > separate schema in same DB, in terms of blast-radius isolation). **Do not claim isolation superiority over ERPNext** — it's a wash; if anything ERPNext's model is a notch stronger in isolation terms, though schema-per-tenant is still strong operationally and much stronger than shared-table SaaS.
  - **Odoo Online (SaaS)** is described by Odoo itself as "multi-tenant"; the community forum consensus is that Odoo Online provisions a separate database per customer in practice (similar to ERPNext), while Odoo.sh offers an explicit dedicated-instance upgrade path. So Odoo is *also* not a shared-table architecture at the customer level — again, don't claim superiority here, this needs to be phrased as "as strong as the better SaaS ERPs, unlike NetSuite," not "uniquely strong."
  - **SAP B1** is traditionally single-tenant/on-prem per customer (own SQL/HANA database) or hosted by a partner in "multi-tenant cloud hosting" arrangements that vary by hosting partner (SAP's own Cloud Control Center language is about managing many separate tenant instances, not shared tables) — so SAP B1 customers already have strong per-customer isolation too, just achieved via heavier, more expensive infrastructure (a dedicated DB/instance per customer, often literally on separate VMs) rather than a lightweight schema-per-tenant model on shared Postgres.
  - **Daftra and Wafeq**: no public architecture disclosure found for either. Given their SMB-volume, low-price-point business model ($20-70/mo tiers for Daftra; tiered EGP/regional pricing for Wafeq), a shared-table, tenant_id-per-row architecture on a shared database is the far more likely and far more common pattern for that class of multi-tenant SaaS (it's cheaper to run at scale) — but **this is inference, not confirmed fact**, and should not be stated as fact in any external marketing claim. It's reasonable for internal positioning ("we likely have stronger isolation than the low-cost regional players") but should not be asserted publicly as a factual claim about Daftra/Wafeq's internals without evidence.
  - **Revised honest framing: "schema-per-tenant Postgres isolation, comparable to the strongest SaaS ERPs (Odoo, ERPNext) and stronger than NetSuite's shared-database model — likely stronger than low-cost regional competitors, though their architecture isn't publicly documented."**

- **Feature gating / pricing-tier mechanics**: Daftra and Wafeq both gate features (and, notably, *record counts and even branches* — Daftra bills extra per branch and per employee, Wafeq bills per user tier and gates inventory/payroll to higher tiers entirely) through classic SaaS pricing tiers, enforced presumably server-side but with no disclosed self-service admin-toggle layer *within* a tier — i.e., what you get is exactly what your subscription tier bundles, no tenant-side control over which of the bundle's modules are active or how they interact (e.g., no evidence either offers an "auto-absorb the skipped document into the next stage" behavior when a document type is turned off). ERPNext, being open-core/self-hosted-friendly, has toggles for individual doctypes and features (Selling Settings has flags like requiring a Sales Order or Delivery Note before invoicing) but these are per-installation admin config, not part of a two-layer commercial-plan-vs-tenant-toggle system with a single server-side guard — ERPNext doesn't have a "Plan" concept at all in the self-hosted product (Frappe Cloud's hosted plans are closer to Daftra/Wafeq's flat-tier model). SAP B1's module/user gating happens at the license level (per-user, per-module authorization tied to license type: Professional/Limited/Logistics/Financials, etc.), configured by a partner at implementation time, not touched by the tenant admin post-go-live. BC's licensing is per-user-per-role (Essentials/Premium tiers, plus per-app), managed through Microsoft admin center / partner, again not a tenant self-service toggle experience.
  **Conclusion: the two-layer Plan-ceiling + tenant-self-service-toggle model, enforced by a single server-side guard, does not have a clean match in any of the seven comparators' public documentation.** This is the strongest, most defensible platform-level differentiator candidate in the whole research set.

- **Custom fields**: SAP B1 (User-Defined Fields/UDFs), Odoo (Studio, a paid add-on/tier), BC (AL extensions — requires developer/partner, not self-service), NetSuite (custom fields/custom records — configurable by an admin without code, a genuinely flexible and well-regarded part of NetSuite), and ERPNext (Customize Form — free, admin-configurable, no code) **all already have custom-fields capability, most without requiring code.** This platform's "dynamic custom-fields engine" is therefore **not yet built** and, once built, will be *closing a gap*, not creating a novel category — the honest positioning is "custom fields without paying for a separate module" (contra Odoo Studio, which is gated to Odoo's top-tier "Custom" plan) and "custom fields without a partner/developer" (contra BC's AL extension model), not "nobody else has this."

### 3.2 Platform infra — differentiator candidates

6. **"True Postgres schema-per-tenant isolation" — TRUE TODAY, but scope the claim carefully.**
   Concrete, honest claim: *"Unlike NetSuite's shared-database multi-tenancy, every tenant's data lives in its own isolated Postgres schema."* This is verifiable and resonates strongly with Egyptian/MENA finance and IT decision-makers who increasingly ask about data residency/isolation given local data-protection rules and general distrust of "your data is mixed in with everyone else's" SaaS models. Do not extend the claim to "strongest in the industry" — Odoo and ERPNext are comparably strong on isolation; the honest comparison set where this platform is unambiguously ahead is NetSuite (shared DB, confirmed) and, with lower confidence, the low-cost regional SaaS tools (Daftra/Wafeq, unconfirmed architecture). A secondary, quieter benefit worth mentioning to technical buyers: schema-per-tenant makes per-tenant backup/restore and "point-in-time recovery for one customer without affecting others" operationally simpler than a shared-table model — a real operational argument, separate from the security-marketing one.

7. **"No reseller call to turn on a module" self-service + Plan-ceiling model, i.e., the two-layer feature gating system — BUILDABLE-to-TRUE-TODAY hybrid; the engineering is done, the marketing framing is the work.**
   This is the standout finding of the research: none of the seven comparators combine (a) a commercially-managed subscription ceiling with (b) tenant-admin self-service toggles within that ceiling, enforced by one server-side authorization check. Daftra/Wafeq give you a flat tier with no play inside it; SAP B1/BC/NetSuite give you partner-managed licensing with no tenant self-service at all; ERPNext gives you full config freedom but no commercial-plan concept baked into the product. The honest MENA-relevant pitch: *"Your plan sets the ceiling; your own admin decides what's actually turned on, today, without a support ticket — and every check happens on the server, so it's not just a hidden menu item."* That last clause is worth keeping in the marketing copy because it quietly signals engineering seriousness (PlanFeatureGuard server-side enforcement, not just UI hiding) to technical evaluators doing due diligence, which matters for the mid-market segment sizing up whether this is a "real" ERP or a website builder with invoices bolted on.

8. **"Invoice-takeover orchestration" for optional documents — TRUE TODAY (as built internally), BUT: could not find a documented equivalent at any comparator, so treat the "nobody does this" claim as provisional, not confirmed.**
   Research did not surface any public documentation of SAP B1, ERPNext, Odoo, BC, NetSuite, Daftra, or Wafeq automatically and transactionally auto-creating and confirming skipped intermediate documents when an optional document type is disabled. SAP B1's well-known behavior (AR Invoice can always be created directly, no Delivery/Order required) and ERPNext's well-known behavior (Selling Settings can require or not require a Sales Order/Delivery Note before invoicing) are both real and both confirmed as independent, per-document toggles rather than a "toggle off Sales Orders and the system silently creates+confirms an equivalent Delivery Note behind the scenes to preserve the inventory/accounting event chain" behavior. **This is plausibly a genuine "no MENA/global ERP does this exactly" claim, but it rests on the absence of public documentation, which is weak evidence for negative claims about closed-source competitors' internals (SAP B1, BC, NetSuite, Daftra, Wafeq could have similar internal behavior undocumented).** Recommend marketing this feature by *describing the mechanism and the benefit* ("skip whichever documents your business doesn't need — the accounting and inventory chain never breaks, because the system quietly closes the loop for you") rather than asserting "we're the only ones," which cannot be fully verified for closed competitors.

9. **Arabic-first/RTL from the ground up — TRUE TODAY, differentiator strength HIGH vs global vendors, LOW-MEDIUM vs Daftra/Wafeq (who are also Arabic-native).**
   Confirmed: Odoo's Arabic/RTL support has a long history of community complaints and third-party paid apps specifically to fix RTL layout issues (multiple marketplace listings exist purely to retrofit RTL onto Odoo's UI — "RTL-arabic-support," "Odoo Arabic (Right to Left) - RTL," "Odoo-RTL-Arabic," several different vendors selling essentially the same patch across many Odoo versions), which is itself evidence that Odoo's core RTL experience is treated as an add-on gap, not a first-class design constraint. SAP B1, BC, and NetSuite support Arabic as one of many localized languages but are fundamentally LTR-designed enterprise products with Arabic as a translation layer — normal for global Tier-1 vendors, but a real UX gap for Arabic-first daily users (report layouts, dashboards, and number/date formatting frequently still read LTR-first). **Important honesty check: this does NOT differentiate against Daftra or Wafeq**, both of which are Egyptian/Gulf-origin products built Arabic-first from day one — competing against them on "we support Arabic" would be an own-goal (they'd rightly call it a weak claim). The correct scope for this claim is: *"Arabic-native UX, unlike the retrofit-translation experience of Odoo/SAP B1/BC/NetSuite — and modern, Tailwind/shadcn-based UI quality, unlike [assess Daftra/Wafeq's UI polish directly before claiming this]."* The i18n-ready architecture (not hardcoded Arabic, but built to support other languages too) is a secondary point that could matter for tenants who eventually need English-speaking staff or GCC expansion — worth a line, not a headline.

---

## 4. Differentiator candidates — ranked summary

| # | Candidate | Status | Strongest against | Confidence |
|---|---|---|---|---|
| 7 | Two-layer Plan+self-service feature gating, server-enforced | TRUE TODAY | SAP B1, BC, NetSuite (partner-mediated licensing); Daftra/Wafeq (flat tiers, no in-tier control) | HIGH |
| 6 | Schema-per-tenant Postgres isolation | TRUE TODAY | NetSuite (confirmed shared-DB); Daftra/Wafeq (inferred, unconfirmed) | HIGH vs NetSuite, LOW-MEDIUM vs Daftra/Wafeq |
| 8 | Invoice-takeover orchestration for optional documents | TRUE TODAY (mechanism); "uniqueness" claim UNVERIFIED | All seven, provisionally | MEDIUM (mechanism confirmed internally; "nobody else does this" is an absence-of-evidence claim) |
| 9 | Arabic-first/RTL-native UX | TRUE TODAY | Odoo, SAP B1, BC, NetSuite (retrofit/translated) | HIGH vs global vendors; DO NOT use vs Daftra/Wafeq |
| 4 | Approval chains without a workflow-engine detour | TRUE TODAY (pending UX verification) | Daftra, Wafeq (no evidence of the feature); BC/NetSuite (present but heavier to configure) | MEDIUM |
| 2 | 2FA + modern security hardening bundle | TRUE TODAY | Daftra, Wafeq (unconfirmed absence) | MEDIUM — verify directly before publishing |
| 3 | Unified company-profile-to-document data flow | BUILDABLE (small, ties to the currency-only fix) | Daftra (users report duplicated tax-info entry) | LOW-MEDIUM until built and tested |

Not recommended as standalone differentiators (parity, not edge): granular RBAC/permissions alone (§2.1), custom fields existence once built (§3.1 — closes a gap, doesn't create one), general settings breadth (§1.1 — currently a gap to fix, not a strength).

---

## 5. What could not be verified with confidence

- **Daftra's and Wafeq's exact multi-tenancy/database architecture** — neither publishes this; all statements above about them are inference from pricing-tier granularity and general SaaS-economics reasoning, not confirmed fact. Do not make public claims of the form "we are more isolated than Daftra/Wafeq" without a disclaimer or without direct evidence (e.g., a security whitepaper from them, if one exists and wasn't surfaced by this search).
- **Daftra's and Wafeq's 2FA/MFA support** — not found in either's public docs/marketing in this research pass; absence of documentation is not proof of absence. Recommend a hands-on trial-account check before using this claim externally.
- **Daftra's internal staff permission granularity** (as opposed to their customer/client-portal permissions, which is what their public docs actually describe) — genuinely unclear from what's public.
- **SAP B1's exact behavior when hosted by third-party cloud partners** (multi-tenant hosting arrangements vary by partner/ISV — e.g., Vision33, Cloud4Partners — so "SAP B1 is single-tenant" is true of the classic on-prem deployment model but not a universal statement about every SAP B1 cloud hosting offering).
- **Whether any comparator has an internal, undocumented equivalent of the invoice-takeover orchestrator** — cannot be ruled out for closed-source products (SAP B1, BC, NetSuite, Daftra, Wafeq); the claim of novelty rests on absence of public documentation, which is inherently weaker evidence than for open-source ERPNext/Odoo where the relevant settings/checkboxes were directly found and are confirmed to be simple independent per-document toggles, not orchestrated take-over logic.

---

## Sources

- [Daftra Plans](https://www.daftra.com/en/plans)
- [Daftra Features](https://www.daftra.com/en/features/)
- [Daftra Branches Management](https://www.daftra.com/en/branches/)
- [Daftra General Accounting Settings Guide](https://docs.daftra.com/en/tutorial/general-accounting-settings-guide/)
- [Daftra Account Information and Settings](https://docs.daftra.com/en/user_manual/account-information-and-settings/)
- [Daftra Tax Settings](https://docs.daftra.com/en/user_manual/setting-up-the-tax-settings-in-the-system/)
- [Daftra Client Permissions Settings](https://docs.daftra.com/en/tutorial/client-permissions-settings/)
- [Wafeq — Inviting Users and Managing Permissions](https://www.wafeq.com/en/wafeq-help/account-settings/inviting-users-and-managing-users-permissions)
- [Wafeq Pricing Plans and Packages](https://help.wafeq.com/hc/en-sa/articles/22187364508700-What-are-your-pricing-plans-and-available-packages)
- [Wafeq — Egypt E-Invoicing System](https://www.wafeq.com/en-eg/tax-and-reporting/electronic-invoice-system)
- [Odoo Multi-Company Documentation (19.0)](https://www.odoo.com/documentation/19.0/applications/general/companies/multi_company.html)
- [Odoo Forum — Is Odoo multi-tenant or customer dedicated?](https://www.odoo.com/forum/help-1/is-odoo-multi-tenant-or-customer-dedicated-176614)
- [Odoo Studio product page](https://www.odoo.com/app/studio)
- [Odoo RTL-arabic-support app](https://apps.odoo.com/apps/modules/13.0/RTL-arabic-support)
- [Odoo Arabic (Right to Left) - RTL app](https://apps.odoo.com/apps/modules/12.0/tis_web_arabic)
- [Odoo-RTL-Arabic app](https://apps.odoo.com/apps/modules/14.0/Odoo-RTL-Arabic)
- [SAP Learning — Defining General Authorizations](https://learning.sap.com/courses/implementing-sap-business-one/defining-general-authorizations)
- [SAP B1 Blog — User License](https://sap-b1-blog.com/en/glossary/sap-business-one-user-licence/)
- [SAP Learning — Customizing User-Defined Fields, Tables, Objects, and Values](https://learning.sap.com/courses/implementing-sap-business-one/customizing-user-defined-fields-tables-objects-and-values)
- [SAP B1 Blog — UDF glossary](https://sap-b1-blog.com/en/glossary/user-defined-field-sap-business-one/)
- [SAP Help — SAP Business One Cloud / Cloud Control Center](https://help.sap.com/docs/SAP_BUSINESS_ONE_CLOUD)
- [Vision33 — What is a Multi-Tenant Environment?](https://blog.vision33.com/the-easiest-and-cheapest-way-to-get-the-power-of-sap-in-the-cloud)
- [NetSuite — Why Multi-Tenancy in the Cloud Matters](https://www.netsuite.com/portal/resource/articles/cloud-saas/why-multi-tenancy-in-the-cloud-matters.shtml)
- [NetSuite — Multi-Tenancy Defined](https://www.netsuite.com/portal/resource/articles/data-warehouse/multi-tenancy.shtml)
- [Salto — Customizing NetSuite Roles & Permissions](https://www.salto.io/blog-posts/netsuite-customizations-roles-permissions)
- [Frappe Forum — How does ERPNext handle multi-tenancy and data isolation?](https://discuss.frappe.io/t/how-does-erpnext-handle-multi-tenancy-and-data-isolation-in-cloud-deployments/158533)
- [ERPNext — Role and Role Profile](https://docs.erpnext.com/docs/user/manual/en/role-and-role-profile)
- [Frappe Docs — Role Based Permissions](https://docs.frappe.io/erpnext/role-based-permissions)
- [MSDynamicsWorld — Understanding Business Central Pricing (2026)](https://msdynamicsworld.com/blog-post/understanding-microsoft-dynamics-365-business-central-pricing-2026-guide)
- [ArcherPoint — Customizing Business Central via Extensions](https://archerpoint.com/customizing-microsoft-dynamics-business-central-premises-using-extensions/)
- [Encore Business Solutions — Add Fields to Pages in BC](https://www.encorebusiness.com/blog/add-fields-to-pages-in-d365-business-central/)
