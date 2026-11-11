import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { EmployeesController } from './presentation/employees.controller';
import { HrDepartmentsController, HrJobTitlesController } from './presentation/hr-org.controller';
import { EmployeesService } from './application/employees.service';
import { HrOrgService } from './application/hr-org.service';
import { EmployeeSalariesController, SalaryComponentsController } from './presentation/salaries.controller';
import { SalaryComponentsService } from './application/salary-components.service';
import { EmployeeSalariesService } from './application/employee-salaries.service';

/**
 * HR & payroll (الموارد البشرية) — docs/claude-context/project-docs/hr-module-plan-2026-11-11.md.
 * A sellable module of its own: plan-gated by the 'hr' feature key on every controller
 * (PlanFeatureGuard, CLAUDE.md §2.8) and switched on per tenant in Settings › Modules. Imports
 * nothing from Sales / Inventory / Accounting; payroll money will reach Treasury and Accounting
 * through events only (§2.6/§2.7).
 *
 * Step 1: organisation structure (departments, job titles) and the employee file.
 * Step 2: salary components and each employee's salary history (hr.salaries.* — salaries stay
 * private to those permissions, never part of the employee DTO).
 */
@Module({
  imports: [SettingsModule],
  controllers: [EmployeesController, HrDepartmentsController, HrJobTitlesController, SalaryComponentsController, EmployeeSalariesController],
  providers: [EmployeesService, HrOrgService, SalaryComponentsService, EmployeeSalariesService],
})
export class HrModule {}
