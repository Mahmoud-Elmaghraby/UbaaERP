# HR & Payroll module: design proposal (2026-11-11)

Status: **proposal for discussion** (CLAUDE.md §17.3 — new module). HR itself is approved by the user as the first module for the distribution client, complete and sellable on its own. Nothing is built until the open decisions in §8 are answered.

## 1. Goals
- A complete, **standalone** HR & payroll module: a tenant with only HR on must have a working menu, dashboard and reports, without Inventory/Sales.
- Works fully **offline on desktop** and on web, like every other module.
- **No taxes / social insurance in v1** (the distribution client uses none), but the design leaves a clean slot for them (Egyptian payroll tax + insurance) later.
- Generic and data-driven: nothing specific to one client.

## 2. Competitor baseline (what the market ships)
| Area | Daftra | Odoo | Notes for us |
|---|---|---|---|
| Org structure (departments, job titles, branches, manager) | ✓ | ✓ | v1 |
| Employee file + documents | ✓ | ✓ | v1 (reuse attachments) |
| Contracts / salary history | ✓ | ✓ | v1 (salary history with effective dates) |
| Shifts & attendance, device import | ✓ (machines + sheets) | ✓ | v1 = Excel/CSV import with column mapping; direct ZKTeco later |
| Leaves with balances & approvals | ✓ | ✓ (allocations) | v1 |
| Salary components & pay runs, payslips | ✓ | ✓ (structures/rules) | v1 |
| Loans / advances with installments | ✓ | add-on | v1 (very common in Egypt) |
| Employee requests / self-service | ✓ | ✓ | phase 2 |
| End-of-service settlement | ✓ | add-on | phase 2 |
| Payroll tax + social insurance | ✓ (KSA/EG) | localisations | phase 3, behind a switch |

Sources: daftra.com/en/hrm, /payroll, /attendance-leave-management, /requests; Odoo HR app pages.

## 3. Scope — Phase 1 (MVP, sellable)
1. **Org structure**: departments (tree), job titles, reuse existing `branches`, `reports_to` manager.
2. **Employee file**: code, name, national ID (+expiry), phone, address, birth date, hire date, branch/department/job, manager, status (active / suspended / terminated + date + reason), payment method (cash / bank / wallet + account no.), optional link to a system `user`, custom_fields, attachments.
3. **Salary setup**: salary-component catalog (earning / deduction; fixed amount or % of basic; recurring or one-off). Per-employee **salary record with effective date** (basic + recurring components) → full history.
4. **Work schedules**: shifts (start/end, grace minutes, hours/day), weekly days off (default Friday), public-holidays calendar.
5. **Attendance**: import Excel/CSV from any fingerprint machine (map columns: employee code, date-time, in/out), plus manual entry. Builds a daily sheet: present / absent / leave / holiday, late minutes, early leave, overtime. Edits are audited.
6. **Leaves**: leave types (annual, casual, sick, unpaid… defaults from Egyptian Labour Law: 21 days annual, 6 casual), yearly balances with carry-over cap, requests with the existing **linear approval** (employee → manager).
7. **Loans & advances (سلف)**: request → approve → disburse from treasury → monthly installments auto-deducted in payroll; early settlement.
8. **Bonuses & penalties (مكافآت وجزاءات)**: one-off entries in amount or days, tied to a period.
9. **Payroll run (monthly)**: per period, optionally per branch/department. States: draft → calculated → approved → posted → paid. Line per employee: basic, allowances, overtime, bonuses − absence, lateness, penalties, loan installment. Manual adjustment per line with a reason. Recalculate until approved; locked after.
10. **Payment**: pay from a treasury (cash/bank) in one batch or per employee, via `TreasuryMovementRegistry`.
11. **Accounting**: outbox events only — `hr.payroll_posted` (salaries expense / salaries payable, per department as cost centre), `hr.payroll_paid`, `hr.loan_disbursed`. No direct calls. If Accounting is off, nothing breaks.
12. **Printing & reports**: payslip, payroll register, bank transfer sheet (Excel), attendance summary, leave balances, outstanding loans, headcount. Reuse `shared/printing` and the Excel export.

## 4. Later phases
- **Phase 2**: employee self-service (own payslips, leave/loan requests), end-of-service settlement, document/contract-expiry alerts, rotating shifts, richer overtime rules, **rep commissions → payroll** (feeds the distribution client's commission/targets work).
- **Phase 3**: Egyptian payroll tax + social insurance (switch), direct fingerprint-device sync, multi-step approvals (when the approval-chain redesign happens).

## 5. Architecture
- New backend module `apps/api/src/modules/hr` (4 layers). Payroll run + loans are financial → **aggregates with invariants** (DDD); org structure, leave types, shifts → plain CRUD.
- **Money VO** everywhere; daily/hourly rates derived from settings (§8 Q2).
- Settings in the central `APP_SETTINGS` registry (group `hr`): day-rate basis, lateness policy, overtime multiplier, payroll cut-off day, rounding.
- Feature keys: `hr` (plan-gated: it is a sellable module), plus activity switches `hr.attendance`, `hr.loans`. `PlanFeatureGuard` on every controller.
- Permissions: `hr.employees.view/manage`, `hr.salaries.view` (sensitive — salaries hidden without it), `hr.attendance.manage`, `hr.leaves.manage/approve`, `hr.loans.manage/approve`, `hr.payroll.manage/approve/pay`.
- Migrations from `0123_*`. Web: `apps/web/src/features/hr`, all text via i18n.
- Sales reps: `sales_reps` (0110) gets an optional `employee_id` later (phase 2) — no change now.

## 6. Delivery plan (each step shippable, tested, committed via commit-files.txt)
1. Org structure + employee file + permissions + feature key + menu.
2. Salary components + salary history.
3. Shifts, holidays, attendance import & daily sheet.
4. Leaves (types, balances, requests, approvals).
5. Loans/advances + bonuses/penalties.
6. Payroll run + payslip + payment via treasury + outbox events + accounting listener.
7. Reports, settings hub group, upgrade rehearsal test, desktop release.

## 7. Risks
- Fingerprint export formats vary → generic column-mapping importer, test with the client's real file as soon as we get one.
- Salary privacy → `hr.salaries.view` enforced in API responses, not only UI.
- Standalone HR tenant: must verify menu/dashboard/treasury work with Sales/Inventory off.

## 8. Decisions (user, 2026-11-11)
1. **Phase 1 scope approved as written.**
2. **Day-rate basis is a tenant setting**: ÷30 (default) / ÷26 / actual working days in the month.
3. **Lateness/absence deductions are suggestions**: computed by policy, shown in the payroll run, HR accepts or edits before approval.
4. **HR-only tenant gets a simplified treasury**: treasuries are enabled with HR so salary payments and loans are always recorded against a cash/bank account.

Status: **approved — building.**

## 9. Progress
- **Step 1 done (2026-11-11)** — migration `0123_hr_core`:
  - Tables `hr_departments` (tree + head), `hr_job_titles`, `employees` (file, status, end of service, payment method, custom_fields). Attachments accept `employee`.
  - Feature key `hr` (plan-gated, not exempt). **Starts OFF for every tenant** → turn on in الإعدادات › الموديولات. On web, re-run `db:seed-plans` so the core plan grants `hr`.
  - Permissions `hr.employees.view` / `hr.employees.manage` (Owner gets both) + role template "مسؤول شؤون العاملين".
  - API `apps/api/src/modules/hr` (`/hr/employees`, `/hr/departments`, `/hr/job-titles`, `PATCH /hr/employees/:id/status`); writes audited as `hr.*`. Employee code from numbering `employee` (EMP-0001).
  - Web `apps/web/src/features/hr`: employees list (status/department filters), employee file page (sections + status card + attachments + custom fields), departments, job titles; sidebar group "الموظفين".
  - Tests: unit (hierarchy, status) + integration `hr-core.int-spec.ts`; 34 suites / 184 int tests, 479 unit tests green.
  - Known gap: the branch list on the employee form needs `settings.manage` (`GET /branches` is admin-only); an HR user without it sees only the saved branch.
- **Step 2 done (2026-11-12)** — migration `0124_hr_salaries`:
  - `hr_salary_components` (earning / deduction; fixed amount or % of basic; suggested default). A component on salaries can't change type and can't be deleted (deactivate instead).
  - `hr_employee_salaries` (one revision per date, in force until the next — no gaps/overlaps by design) + `hr_employee_salary_lines` (amount or percent, defaults from the component).
  - Pure `domain/salary.ts` `computeSalary` (Money VO): earnings, deductions, gross, net (floored at 0). The payroll run (step 6) starts from it.
  - Permissions `hr.salaries.view` / `hr.salaries.manage`; salaries are never part of the employee DTO. Writes audited as `hr.salary.*` / `hr.salary_component.*`.
  - API: `/hr/salary-components`, `/hr/employees/:id/salaries` (GET history+current, POST, PUT/DELETE `:salaryId`), `GET /hr/salaries/register?asOf=&departmentId=&includeTerminated=`.
  - Web: البدلات والاستقطاعات page, salary card + revision dialog on the employee file, كشف المرتبات page with totals.
  - Revisions stay editable for now; the payroll run will lock paid months.
- **Step 3 done (2026-11-12)** — migration `0125_hr_attendance`:
  - Times are whole minutes, never time zones: shift start/end after midnight; a day's in/out after that work day's midnight (≥ 1440 = next morning, night shifts). Raw punches keep the device's wall clock (TIMESTAMP, read via to_char).
  - `hr_shifts` (start/end, grace, unpaid break, weekly days off; exactly one default, seeded 09:00–17:00, 15 min grace, Friday off); `employees.shift_id` (null = default) and `employees.attendance_code` (device number).
  - `hr_public_holidays`; `hr_attendance_imports` + `hr_attendance_punches` (unique per employee+minute → re-importing a file adds nothing); `hr_attendance_days` (the daily sheet, `is_manual` rows survive rebuilds).
  - Pure domain: `domain/attendance.ts` (punch window = shift start − 4h for 24h, late from start once past grace, early leave, overtime over `hr.minOvertimeMinutes`, weekend/holiday work = all overtime) and `domain/punch-parse.ts` (ISO, d/m/y, m/d/y, Excel serials, AM/PM and ص/م, Arabic digits). Device keys match the attendance code, then the employee code, ignoring zero-padding.
  - Settings hub section "الموارد البشرية": `hr.dayRateBasis` (÷30 default / ÷26 / working days), `hr.overtimeMultiplier` (1.5), `hr.minOvertimeMinutes` (30) — the first two are used by payroll (step 6).
  - Permissions `hr.attendance.view` / `hr.attendance.manage`.
  - API: `/hr/shifts`, `/hr/holidays`, `/hr/attendance` (list, `summary`, `import`, `rebuild`, `PUT days/:id`, `POST days/:id/reset`).
  - Web: الورديات, الإجازات الرسمية, الحضور والانصراف (daily + summary tabs, exceptions filter, hand-correction dialog), استيراد من البصمة (column mapping with guesses, preview, result report); shift + device number on the employee file.
  - Not yet: suspended employees get no days; leaves come in step 4 (status `leave` already exists).
- **Next: step 4** — leave types, yearly balances and leave requests with the linear approval (employee → manager); approved leaves mark the attendance days.
