import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  ACCOUNTING_SETTINGS_REPOSITORY,
  type AccountingSettingsRepository,
} from '../ports/accounting-settings.repository';
import type { AccountingSettings, UpdateAccountingSettingsInput } from '../../domain/accounting-settings.entity';

@Injectable()
export class AccountingSettingsService {
  constructor(
    @Inject(ACCOUNTING_SETTINGS_REPOSITORY) private readonly repository: AccountingSettingsRepository,
  ) {}

  get(db: Kysely<TenantDatabase>): Promise<AccountingSettings> {
    return this.repository.getOrCreate(db);
  }

  update(db: Kysely<TenantDatabase>, input: UpdateAccountingSettingsInput): Promise<AccountingSettings> {
    return this.repository.update(db, input);
  }
}
