import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { EmployeesController } from './presentation/employees.controller';
import { HrDepartmentsController, HrJobTitlesController } from './presentation/hr-org.controller';
import { EmployeesService } from './application/employees.service';
import { HrOrgService } from './application/hr-org.service';

/**
 * HR & payroll (الموارد البشرية) — docs/claude-context/project-docs/hr-module-plan-2026-11-11.md.
 * A sellable module of its own: plan-gated by the 'hr' feature key on every controller
 * (PlanFeatureGuard, CLAUDE.md §2.8) and switched on per tenant in Settings › Modules. Imports
 * nothing from Sales / Inventory / Accounting; payroll money will reach Treasury and Accounting
 * through events only (§2.6/§2.7).
 *
 * Step 1: organisation structure (departments, job titles) and the employee file.
 */
@Module({
  imports: [SettingsModule],
  controllers: [EmployeesController, HrDepartmentsController, HrJobTitlesController],
  providers: [EmployeesService, HrOrgService],
})
export class HrModule {}
