import { BusinessRuleError } from '../../../../shared/errors/domain-errors';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  TENANT_SETTINGS_REPOSITORY,
  type TenantSettingsRepository,
} from '../ports/tenant-settings.repository';
import type { TenantSettings, UpdateTenantSettingsInput } from '../../domain/tenant-settings.entity';

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly repository: TenantSettingsRepository,
  ) {}

  get(db: Kysely<TenantDatabase>): Promise<TenantSettings> {
    return this.repository.getOrCreate(db);
  }

  async update(db: Kysely<TenantDatabase>, input: UpdateTenantSettingsInput): Promise<TenantSettings> {
    // The company currency is picked from Settings › Currencies (migration 0098).
    if (input.currencyCode !== undefined) {
      const known = await db.selectFrom('currencies').select('is_active').where('code', '=', input.currencyCode).executeTakeFirst();
      if (!known?.is_active) {
        throw new BusinessRuleError(`Currency "${input.currencyCode}" is not an active currency.`, {
          code: 'CURRENCY.NOT_USABLE',
          params: { code: input.currencyCode },
        });
      }
    }
    return this.repository.update(db, input);
  }
}
