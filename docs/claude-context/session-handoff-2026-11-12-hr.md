# Session handoff: the HR & payroll module (2026-11-11 → 11-12)

Everything built in the HR session, in enough detail to continue on another account with only the repo.
Read `START-HERE.md` first; the design and decisions are in `project-docs/hr-module-plan-2026-11-11.md`.

**Commits (all pushed to `Mahmoud-Elmaghraby/UbaaERP` `master`):**

| Step | Commit | What |
|---|---|---|
| 1 | `3897266` | Org structure + employee file (migration 0123) |
| 2 | `44322ce` | Salary components + salary history (0124) |
| 3 | `8a03f90` | Shifts, holidays, attendance import + daily sheet (0125) |
| 4 | `108b31a` | Leave types, balances, requests (0126) |
| 5 | `c6de92f` | Loans through the treasury, bonuses/penalties (0127) |
| 6 | `df0a680` | Monthly payroll run (0128) |
| 7 | `53bf415` | Payslip/register printing, HR overview, desktop 0.3.0 |
| docs | (this commit) | This handoff, START-HERE refresh, sandbox test harness copy |

---

## 1. Why and how it was decided
- HR was approved by the user (2026-11-10) as the first module for the **distribution client** (food distribution: chocolate/candy), and as a product **sellable on its own**.
- Competitor baseline: Daftra (HR, payroll, contracts, attendance/leave, requests, loans with treasury + journal entry), Odoo (HR apps; loans only via add-ons).
- User decisions (all recorded in the plan doc §8 and per-step notes):
  - Phase 1 scope approved as proposed (12 items).
  - Day rate basis is a **setting**: ÷30 (default) / ÷26 / actual working days.
  - Lateness/absence deductions are **suggestions** HR reviews before posting.
  - HR-only tenants still have treasuries (Treasury is a core module, not plan-gated).
  - Loans go **through the treasury** (asset 117, like Daftra) — option 1 of the discussion.
  - Payroll rules: lateness **by the minute after a monthly allowance** (setting, 60 min; late + early leave pooled); absence factor a **setting** (default 1 day per day); overtime **suggested automatically** × multiplier (1.5); **one run for everyone** with an optional branch/department filter.

## 2. Module shape
- API: `apps/api/src/modules/hr/` — `domain/` (pure, unit-tested), `application/` (services), `infrastructure/` (treasury movement sources, print registration), `presentation/` (controllers). Registered in `app.module.ts` as `HrModule`.
- Web: `apps/web/src/features/hr/` — `api/queries.ts`, `components/*`, `lib/minutes.ts`, `routes.tsx` (mounted in `app/router.tsx`). Sidebar group "الموظفين" (`nav.groups.people`) in `app/layout/nav-items.ts`.
- Contracts: `libs/contracts/src/hr/` — `org-structure`, `employee`, `salary`, `attendance`, `leave`, `loan`, `payroll`, `report`.
- Feature key **`hr`** (`shared/plans/feature-catalog.ts`): a **plan** key (not in `PLAN_EXEMPT_FEATURE_KEYS`) on every HR controller via `PlanFeatureGuard`; migration 0123 inserts `tenant_feature_toggles(hr=false)` so every tenant (existing and new) starts with HR **off** → Settings › Modules. On web/SaaS, re-run `db:seed-plans` so the core plan grants `hr`.
- Accounting is never called: money moves through outbox events listened to by `modules/accounting/infrastructure/events/accounting-hr-posting.listener.ts`.

## 3. Migrations (0123–0128)
| Migration | Tables / changes |
|---|---|
| `0123_hr_core` | `hr_departments` (tree, head), `hr_job_titles`, `employees`; attachments whitelist + `employee`; perms `hr.employees.view/manage`; `hr` toggle off |
| `0124_hr_salaries` | `hr_salary_components`, `hr_employee_salaries` (one revision per date, in force until the next), `hr_employee_salary_lines`; perms `hr.salaries.view/manage` |
| `0125_hr_attendance` | `hr_shifts` (seeded default 09:00–17:00, 15 min grace, Friday off; one default via partial unique index), `employees.shift_id/attendance_code`, `hr_public_holidays`, `hr_attendance_imports`, `hr_attendance_punches` (unique employee+minute), `hr_attendance_days`; perms `hr.attendance.view/manage` |
| `0126_hr_leaves` | `hr_leave_types` (seeded: اعتيادي 21; عارضة 6 inside اعتيادي; مرضي; بدون أجر 0%), `hr_leave_balances`, `hr_leave_requests`, `hr_attendance_days.leave_request_id`; perms `hr.leaves.view/manage/approve` |
| `0127_hr_loans_adjustments` | `hr_loans`, `hr_loan_installments`, `hr_loan_repayments`, `hr_pay_adjustments`; `accounting_settings.employee_advances_account_id (117) / salaries_expense_account_id (521) / salaries_payable_account_id (214)`; perms `hr.loans.view/manage/approve` |
| `0128_hr_payroll` | `hr_payroll_runs`, `hr_payroll_lines` (UNIQUE employee+pay_month), `hr_payroll_payments`; FK `hr_pay_adjustments.payroll_run_id`; perms `hr.payroll.view/manage/approve/pay` |

Numbering types added (`modules/settings/domain/numbering-defaults.ts`, Settings › Numbering group "الموارد البشرية"): `employee` EMP-0001, `leave_request` LV-, `employee_loan` LN-, `loan_repayment` LR-, `payroll_run` PR-, `payroll_payment` PP-.

## 4. Permissions (all granted to the Owner role by the migrations)
`hr.employees.view/manage` · `hr.salaries.view/manage` (also bonuses/penalties) · `hr.attendance.view/manage` · `hr.leaves.view/manage/approve` · `hr.loans.view/manage/approve` · `hr.payroll.view/manage/approve/pay`.
API constants: `apps/api/src/shared/auth/hr-permissions.ts`; web: `HR` in `apps/web/src/lib/permissions.ts`. Role template "مسؤول شؤون العاملين" (`hrOfficer`) in `features/users-permissions/role-templates.ts`.
Salaries are never part of the employee DTO — only the salary/payroll endpoints (with their permissions) return money.

## 5. Domain rules (pure, `modules/hr/domain/`)
- `hierarchy.ts` — `wouldCreateCycle` (department tree, reporting line).
- `employee-status.ts` — active / suspended / terminated (needs a date ≥ hire date; re-hire clears it). A terminated file is read-only.
- `salary.ts` — `computeSalary` (Money VO): fixed or % of basic components; net floored at 0.
- `attendance.ts` — **times are whole minutes, never time zones**: shift start/end after midnight; a day's in/out after that work day's midnight (≥ 1440 = next morning). Punch window = shift start − 4h for 24h. Late counts from the start once past grace; early leave before shift end; overtime over `hr.minOvertimeMinutes`; weekend/holiday work is all overtime. One punch = present + `missingPunch`.
- `punch-parse.ts` — ISO, d/m/y, m/d/y, Excel serials, AM/PM and ص/م, Arabic digits, date+time in one or two cells.
- `leave.ts` — working days (shift days off and holidays excluded), half day = 0.5, balances, carry-over cap.
- `loan.ts` — schedule by count (last installment takes the remainder) or by amount; payments go to the oldest open installments; overpayment refused.
- `payroll.ts` — `computePayroll`: day rate = (basic + allowances) ÷ divisor; hour rate = day ÷ shift hours; proration by employed calendar days; absence × factor; late after monthly allowance; overtime × multiplier; unpaid leave × (1 − pay%); bonuses/penalties (amount or days); loan installments due ≤ month. Never negative: loan shrinks first (`LOAN_REDUCED`), then all pay deductions scale down in proportion (`DEDUCTIONS_CAPPED`). Books stay balanced: expense = net + loan.

## 6. API endpoints (all under `PlanFeatureGuard` + `hr`)
- Org & people: `/hr/departments`, `/hr/job-titles`, `/hr/employees` (+ `PATCH :id/status`).
- Salaries: `/hr/salary-components`, `/hr/employees/:id/salaries` (GET history+current, POST, PUT/DELETE `:salaryId`), `GET /hr/salaries/register?asOf=&departmentId=&includeTerminated=`.
- Attendance: `/hr/shifts`, `/hr/holidays?year=`, `/hr/attendance` (list), `/hr/attendance/summary`, `POST /hr/attendance/import`, `POST /hr/attendance/rebuild`, `PUT /hr/attendance/days/:id`, `POST /hr/attendance/days/:id/reset`.
- Leaves: `/hr/leave-types`, `/hr/leave-requests` (+ `preview`, `:id/approve|reject|cancel`), `/hr/leave-balances` (GET, PUT, `POST carry-over`).
- Loans & adjustments: `/hr/loans` (+ `:id/approve|reject|cancel|disburse|repay|postpone`), `/hr/pay-adjustments`.
- Payroll: `/hr/payroll-runs` (+ `:id/recalculate`, `PATCH :id/lines/:lineId`, `DELETE :id/lines/:lineId`, `:id/post`, `:id/pay`).
- Reports: `GET /hr/reports/overview?year=` (pay figures only with payroll/loans permissions).
- Printing: document types `payslip` (id = payroll line) and `payroll_run` via `/print/:documentType/:id`.

## 7. Money flows and accounting (outbox → `AccountingHrPostingListener`)
| Event | Entry |
|---|---|
| `hr.loan.disbursed` | Dr 117 عهد وسلف موظفين / Cr treasury account |
| `hr.loan.repaid` | Dr treasury / Cr 117 |
| `hr.payroll.posted` | Dr 521 رواتب وأجور (net + installments) / Cr 117 (installments) / Cr 214 رواتب مستحقة (net); dated the month's last day |
| `hr.payroll.paid` | Dr 214 / Cr treasury |

- Treasury movement sources: `HrLoanMovements` (kinds `employee_loan`, `employee_loan_repayment`), `HrPayrollMovements` (`payroll`). A cash box can't go below zero (`assertCanWithdraw`).
- The three mappings show in Accounting settings under "المرتبات والسلف". Journal entries of `hr_payroll` link back to `/hr/payroll/:id`.
- Posting a run also: settles that month's bonuses/penalties (`payroll_run_id`), pays installments oldest-first (closes repaid loans), and **locks salary revisions** of paid months (`HR_SALARY.LOCKED_BY_PAYROLL`).

## 8. Settings added (Settings hub › "الموارد البشرية", `APP_SETTINGS` section `hr`)
`hr.dayRateBasis` (days30 | days26 | workingDays), `hr.overtimeMultiplier` (1.5), `hr.minOvertimeMinutes` (30), `hr.monthlyLateAllowanceMinutes` (60), `hr.absenceDeductionDays` (1). Section editable by `settings.manage`, `hr.salaries.manage` or `hr.attendance.manage`.

## 9. Cross-cutting changes outside the HR folder
- `shared/printing`: `PrintProvider.feature` — the print endpoint refuses a document whose plan module the tenant lacks (passes `user.features`).
- `shared/treasury/treasury-movements.ts` + `libs/contracts/src/treasury/treasury.contract.ts`: movement kinds `employee_loan`, `employee_loan_repayment`, `payroll` (labels in `treasury-print.registration.ts` and `ar.json treasury.movements`).
- `DomainAuditListener` listens to `hr.**`; controllers use `@AuditChanges('hr', …)`. Audit-log page has an "الموارد البشرية" module filter (`components/audit/audit-format.ts`).
- `attachments`: entity type `employee` (domain list, contract enum, web constants, DB whitelist).
- Accounting settings entity/repository/contract/UI: the three payroll mappings; three listener specs updated.
- Upgrade rehearsal (`test/integration/upgrade-rehearsal.int-spec.ts`, 0101 → latest) checks HR starts off with its defaults and no invented data.
- `apps/desktop/package.json` → **0.3.0**.

## 10. Tests (as of `53bf415`)
- Unit: **514 passing** (+2 Prisma suites that fail only in the cloud sandbox). HR specs: `domain/*.spec.ts` (hierarchy, status, salary, attendance + punch parsing, leave, loan, payroll) and `accounting-hr-posting.listener.spec.ts`.
- Integration (real Postgres 16): **39 suites / 193 tests**. HR suites: `hr-core`, `hr-salaries`, `hr-attendance` (a real-shaped device export for a week incl. a night shift), `hr-leaves`, `hr-loans`, `hr-payroll` (a full month end to end, numbers checked by hand: net 8,993.12 after HR forgave the absence; payslip lines sum to net; overview permissions).
- HR integration suites share one schema: each cleans up **only its own rows** (names carry a random suffix).
- Typecheck, lint (whole `apps/api` and `apps/web`) and `vite build` clean. **The screens were never exercised in a browser** (the cloud sandbox can't run the API without Prisma) — the user is to test a full month on his PC.

## 11. Known gaps (phase 2 candidates)
- Reversing / reopening a posted payroll run (today: correct next month with a hand adjustment).
- Salary change in the middle of a month (the run uses the revision in force on the employee's last day).
- A payroll cut-off day other than the calendar month (e.g. 26th–25th).
- Employee self-service (own payslips, leave/loan requests) and a manager deciding only for their own team (today: anyone with `hr.leaves.approve` / `hr.loans.approve`, never for themselves).
- End-of-service settlement; rep commissions into payroll; payroll tax + social insurance (behind a switch); direct fingerprint-device sync (ZKTeco); a per-tenant switch `hr.attendance`.
- Suspended employees get no attendance days and are left out of payroll runs.
- The branch list on the employee form and the payroll "one branch" scope need `settings.manage` (`GET /branches` is admin-only).
- Cancelling a cash loan repayment isn't supported.

## 12. Lessons from this session (the user's PC)
- After any change in `libs/`, run `pnpm --filter @erp-platform/contracts build` (and shared-kernel / ui if touched) **on the PC** before `pnpm start:dev`, or the API fails with "has no exported member".
- `pnpm db:migrate` needs Docker Desktop running (`docker compose up -d`; dev DB on port 5434).
- `listen EACCES 0.0.0.0:4000`: Windows reserved the port (WinNAT). Fix as admin: `net stop winnat && net start winnat`, or move `PORT` (api `.env`) and `VITE_API_BASE_URL` (web `.env.local`) to another port.
- `device_commit_files` cannot write inside `.git/`; write `commit-files.txt` / `msg-code.txt` with `device_bash` (`cp` from `.claude-tmp`).
- Python edits of CRLF files must keep CRLF (open with `newline=''`), or git shows whole-file diffs.
- Delete permission was not granted in this session: `.claude-tmp/` on the device still holds the step tarballs — the user may delete it.
