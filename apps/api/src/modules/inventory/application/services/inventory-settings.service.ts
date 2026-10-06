import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  INVENTORY_SETTINGS_REPOSITORY,
  type InventorySettingsRepository,
} from '../ports/inventory-settings.repository';
import type { InventorySettings, UpdateInventorySettingsInput } from '../../domain/inventory-settings.entity';
import { BusinessRuleError } from '../errors';

/** Plain settings CRUD (CLAUDE.md §2.1 — no aggregate ceremony for a settings row). */
@Injectable()
export class InventorySettingsService {
  constructor(@Inject(INVENTORY_SETTINGS_REPOSITORY) private readonly repository: InventorySettingsRepository) {}

  get(db: Kysely<TenantDatabase>): Promise<InventorySettings> {
    return this.repository.get(db);
  }

  update(db: Kysely<TenantDatabase>, input: UpdateInventorySettingsInput): Promise<InventorySettings> {
    if (input.barcodePrefix !== undefined && !/^[0-9]{1,7}$/.test(input.barcodePrefix)) {
      throw new BusinessRuleError('Barcode prefix must be 1 to 7 digits.', {
        code: 'INVENTORY_SETTINGS.INVALID_BARCODE_PREFIX',
      });
    }
    return this.repository.update(db, input);
  }
}
