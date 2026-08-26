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

  update(db: Kysely<TenantDatabase>, input: UpdateTenantSettingsInput): Promise<TenantSettings> {
    return this.repository.update(db, input);
  }
}
