import { Money } from '@erp-platform/shared-kernel';
import type { MoneyDto } from '@erp-platform/contracts';

export function moneyToDto(money: Money): MoneyDto {
  return { amountMinorUnits: money.toMinorUnits().toString(), currency: money.currency };
}

export function moneyFromDto(dto: MoneyDto): Money {
  return Money.fromMinorUnits(BigInt(dto.amountMinorUnits), dto.currency);
}
