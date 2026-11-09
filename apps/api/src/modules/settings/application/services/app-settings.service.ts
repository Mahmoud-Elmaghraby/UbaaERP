import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Kysely } from 'kysely';
import {
  APP_SETTINGS,
  APP_SETTING_KEYS,
  appSettingValueSchema,
  type AppSettingEntryDto,
  type AppSettingKey,
  type UpdateAppSettingsDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
import { BusinessRuleError } from '../../../../shared/errors/domain-errors';
import type { DomainEventPayload } from '../../../../shared/events/domain-event';

/**
 * Reads and writes the settings hub's options (APP_SETTINGS). Every change is validated against
 * its definition and recorded in the audit log with its old and new value
 * ('settings.app_setting.updated', one entry per key).
 */
@Injectable()
export class AppSettingsService {
  constructor(
    private readonly repository: AppSettingsRepository,
    private readonly emitter: EventEmitter2,
  ) {}

  async list(db: Kysely<TenantDatabase>): Promise<AppSettingEntryDto[]> {
    const stored = new Map((await this.repository.list(db)).map((row) => [row.key, row]));
    return APP_SETTING_KEYS.map((key) => {
      const row = stored.get(key);
      return {
        key,
        value: row ? row.value : APP_SETTINGS[key].default,
        isDefault: !row,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async update(
    db: Kysely<TenantDatabase>,
    schema: string,
    input: UpdateAppSettingsDto,
    actorUserId: string,
  ): Promise<AppSettingEntryDto[]> {
    const current = new Map((await this.list(db)).map((entry) => [entry.key, entry]));
    // Validate everything before writing anything.
    const changes: { key: AppSettingKey; value: number | boolean | string | null }[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (!APP_SETTING_KEYS.includes(key as AppSettingKey)) {
        throw new BusinessRuleError(`Unknown setting "${key}".`, { code: 'APP_SETTING.UNKNOWN', params: { key } });
      }
      const def = APP_SETTINGS[key as AppSettingKey];
      if (value !== null && !appSettingValueSchema(def).safeParse(value).success) {
        throw new BusinessRuleError(`Invalid value for "${key}".`, { code: 'APP_SETTING.INVALID', params: { key } });
      }
      changes.push({ key: key as AppSettingKey, value });
    }
    await db.transaction().execute(async (trx) => {
      for (const { key, value } of changes) {
        if (value === null) await this.repository.reset(trx, key);
        else await this.repository.set(trx, key, value, actorUserId);
      }
    });
    for (const { key, value } of changes) {
      const before = current.get(key)?.value;
      const after = value ?? APP_SETTINGS[key].default;
      if (before === after) continue;
      const payload: DomainEventPayload = {
        schema,
        entityType: 'app_setting',
        entityId: key,
        action: 'updated',
        actorUserId,
        metadata: { key, from: before, to: after, reset: value === null },
        occurredAt: new Date(),
      };
      this.emitter.emit('settings.app_setting.updated', payload);
    }
    return this.list(db);
  }
}
