import { useTranslation } from 'react-i18next';
import { Percent } from 'lucide-react';
import type { TaxRuleDto } from '@erp-platform/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@erp-platform/ui';

import { useTaxRuleLookup } from '../../features/settings/queries';
import { usableForScope, type TaxScope } from './use-document-taxes';

/**
 * The taxes on one document line. One rule per kind (the ETA accepts one
 * VAT, one table tax and one withholding per line), so ticking a second VAT
 * replaces the first.
 */
export function LineTaxPicker({
  scope,
  value,
  onChange,
}: {
  scope: TaxScope;
  value: readonly string[];
  onChange: (taxRuleIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const { data } = useTaxRuleLookup();
  const rules = (data ?? []).filter((rule) => usableForScope(rule, scope));
  const chosen = rules.filter((rule) => value.includes(rule.id));

  function toggle(rule: TaxRuleDto, checked: boolean) {
    const others = value.filter((id) => id !== rule.id);
    if (!checked) return onChange(others);
    const sameKind = new Set(rules.filter((candidate) => candidate.kind === rule.kind).map((candidate) => candidate.id));
    onChange([...others.filter((id) => !sameKind.has(id)), rule.id]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 max-w-40 justify-start gap-1 px-2 text-xs">
          <Percent className="size-3 shrink-0" />
          <span className="truncate">
            {chosen.length === 0 ? (
              t('taxes.untaxed')
            ) : (
              <bdi dir="ltr">
                {chosen.map((rule) => `${rule.kind === 'withholding' ? '−' : '+'}${rule.rate}%`).join(' ')}
              </bdi>
            )}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {(['vat', 'table', 'withholding'] as const).map((kind) => {
          const ofKind = rules.filter((rule) => rule.kind === kind);
          if (ofKind.length === 0) return null;
          return (
            <div key={kind}>
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t(`settings.taxes.kinds.${kind}`)}</DropdownMenuLabel>
              {ofKind.map((rule) => (
                <DropdownMenuCheckboxItem
                  key={rule.id}
                  checked={value.includes(rule.id)}
                  onCheckedChange={(checked) => toggle(rule, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {rule.name}
                </DropdownMenuCheckboxItem>
              ))}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
