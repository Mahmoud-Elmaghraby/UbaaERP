import { Module } from '@nestjs/common';
import { TENANT_SETTINGS_REPOSITORY } from './application/ports/tenant-settings.repository';
import { BRANCH_REPOSITORY } from './application/ports/branch.repository';
import { NUMBERING_SEQUENCE_REPOSITORY } from './application/ports/numbering-sequence.repository';
import { DOCUMENT_TEMPLATE_REPOSITORY } from './application/ports/document-template.repository';
import { TAX_RULE_REPOSITORY } from './application/ports/tax-rule.repository';
import { CUSTOM_FIELD_DEFINITION_REPOSITORY } from './application/ports/custom-field-definition.repository';

import { KyselyTenantSettingsRepository } from './infrastructure/persistence/kysely-tenant-settings.repository';
import { KyselyBranchRepository } from './infrastructure/persistence/kysely-branch.repository';
import { KyselyNumberingSequenceRepository } from './infrastructure/persistence/kysely-numbering-sequence.repository';
import { KyselyDocumentTemplateRepository } from './infrastructure/persistence/kysely-document-template.repository';
import { KyselyTaxRuleRepository } from './infrastructure/persistence/kysely-tax-rule.repository';
import { KyselyCustomFieldDefinitionRepository } from './infrastructure/persistence/kysely-custom-field-definition.repository';

import { TenantSettingsService } from './application/services/tenant-settings.service';
import { BranchesService } from './application/services/branches.service';
import { NumberingSequencesService } from './application/services/numbering-sequences.service';
import { DocumentTemplatesService } from './application/services/document-templates.service';
import { TaxRulesService } from './application/services/tax-rules.service';
import { CustomFieldDefinitionsService } from './application/services/custom-field-definitions.service';
import { FeatureTogglesService } from './application/services/feature-toggles.service';

import { SettingsController } from './presentation/settings.controller';
import { BranchesController } from './presentation/branches.controller';
import { NumberingSequencesController } from './presentation/numbering-sequences.controller';
import { DocumentTemplatesController } from './presentation/document-templates.controller';
import { TaxRulesController } from './presentation/tax-rules.controller';
import { CustomFieldDefinitionsController } from './presentation/custom-field-definitions.controller';
import { FeatureTogglesController } from './presentation/feature-toggles.controller';

/**
 * Settings module (CLAUDE.md §10: step 1, alongside Users & Permissions).
 * Plain CRUD (master doc §4) — Clean Architecture layering is still
 * enforced (controllers → services → repository ports ← Kysely
 * implementations), just without DDD aggregate ceremony.
 *
 * TenantConnectionManager comes from the global TenancyModule (see
 * ../../shared/tenancy/tenancy.module.ts) — not re-provided here.
 * FeatureTogglesService's two dependencies (TenantFeatureTogglesRepository,
 * PlanResolverService) similarly come from the global PlansModule (see
 * ../../shared/plans/plans.module.ts) — same treatment, not re-provided
 * here either. FeatureTogglesController is the "Modules" tab: Layer 2 of
 * claude/platform-flexibility-strategy.md.
 */
@Module({
  controllers: [
    SettingsController,
    BranchesController,
    NumberingSequencesController,
    DocumentTemplatesController,
    TaxRulesController,
    CustomFieldDefinitionsController,
    FeatureTogglesController,
  ],
  providers: [
    { provide: TENANT_SETTINGS_REPOSITORY, useClass: KyselyTenantSettingsRepository },
    { provide: BRANCH_REPOSITORY, useClass: KyselyBranchRepository },
    { provide: NUMBERING_SEQUENCE_REPOSITORY, useClass: KyselyNumberingSequenceRepository },
    { provide: DOCUMENT_TEMPLATE_REPOSITORY, useClass: KyselyDocumentTemplateRepository },
    { provide: TAX_RULE_REPOSITORY, useClass: KyselyTaxRuleRepository },
    { provide: CUSTOM_FIELD_DEFINITION_REPOSITORY, useClass: KyselyCustomFieldDefinitionRepository },
    TenantSettingsService,
    BranchesService,
    NumberingSequencesService,
    DocumentTemplatesService,
    TaxRulesService,
    CustomFieldDefinitionsService,
    FeatureTogglesService,
  ],
  // Exported narrowly, growing only as later modules actually need
  // something: NumberingSequencesService is the shared mechanism every
  // document-numbering module (Purchases, Sales, and now Accounting's
  // journal entries) allocates document numbers through — see Purchases'
  // migration 0030 and PurchaseRequisitionsService for the reasoning
  // (treated as a foundational/platform dependency, not a business-
  // module-to-business-module call under CLAUDE.md §2.6).
  // TenantSettingsService is exported starting with Accounting Stage 2
  // (Journal Entries) — the ledger's ONE base/functional currency for
  // every journal entry is tenant_settings.currencyCode
  // (JournalEntriesService reads it via TenantSettingsService.get()),
  // the same foundational-dependency reasoning as NumberingSequencesService
  // above, not a business-module call.
  exports: [NumberingSequencesService, TenantSettingsService],
})
export class SettingsModule {}
