import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { TaxRuleRepository } from '../ports/tax-rule.repository';
import type { TaxRule } from '../../domain/tax-rule.entity';
import { NotFoundError } from '../errors';
import { TaxRulesService } from './tax-rules.service';

const FAKE_DB = {} as Kysely<TenantDatabase>;

function makeTaxRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: 'tax-1',
    name: 'VAT',
    rate: 14,
    isActive: true,
    kind: 'vat',
    etaType: 'T1',
    etaSubtype: 'V009',
    scope: 'both',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMockRepository(): jest.Mocked<TaxRuleRepository> {
  return { list: jest.fn(), findById: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
}

describe('TaxRulesService', () => {
  let repository: jest.Mocked<TaxRuleRepository>;
  let service: TaxRulesService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new TaxRulesService(repository);
  });

  it('list() delegates to the repository', async () => {
    const rules = [makeTaxRule()];
    repository.list.mockResolvedValue(rules);
    await expect(service.list(FAKE_DB)).resolves.toBe(rules);
  });

  describe('getById()', () => {
    it('returns the rule when found', async () => {
      const rule = makeTaxRule();
      repository.findById.mockResolvedValue(rule);
      await expect(service.getById(FAKE_DB, 'tax-1')).resolves.toBe(rule);
    });

    it('throws NotFoundError when missing', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });
  });

  it('create() is a plain passthrough — this service has no unique constraint to guard', async () => {
    const rule = makeTaxRule();
    repository.create.mockResolvedValue(rule);
    await expect(service.create(FAKE_DB, { name: 'VAT', rate: 14 })).resolves.toBe(rule);
    expect(repository.create).toHaveBeenCalledWith(FAKE_DB, { name: 'VAT', rate: 14 });
  });

  describe('update()', () => {
    it('throws NotFoundError when the repository returns null', async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.update(FAKE_DB, 'missing', { rate: 15 })).rejects.toThrow(NotFoundError);
    });

    it('returns the updated rule on success', async () => {
      const rule = makeTaxRule({ rate: 15 });
      repository.update.mockResolvedValue(rule);
      await expect(service.update(FAKE_DB, 'tax-1', { rate: 15 })).resolves.toBe(rule);
    });
  });

  describe('delete()', () => {
    it('throws NotFoundError when nothing was deleted', async () => {
      repository.delete.mockResolvedValue(false);
      await expect(service.delete(FAKE_DB, 'missing')).rejects.toThrow(NotFoundError);
    });

    it('resolves when a row was deleted', async () => {
      repository.delete.mockResolvedValue(true);
      await expect(service.delete(FAKE_DB, 'tax-1')).resolves.toBeUndefined();
    });
  });
});
