import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Badge, Button, Input } from '@erp-platform/ui';

import { useVariantOptionSuggestions } from '../../api/products/queries';

export interface VariantOption {
  name: string;
  values: string[];
}

/** Offered on an empty tenant (nothing used yet); afterwards the tenant's own options lead. */
const STARTER_NAMES = ['المقاس', 'اللون'];
const PREVIEW_LIMIT = 12;
/** Above this many combinations the per-row price list is replaced by a preview (prices then via the variants screen). */
const MAX_PRICED_ROWS = 200;

/** Option name → values, only the complete ones (a name and at least one value). */
export function variantOptionsToRecord(options: readonly VariantOption[]): Record<string, string[]> {
  return Object.fromEntries(
    options.filter((option) => option.name.trim() && option.values.length > 0).map((option) => [option.name.trim(), option.values]),
  );
}

function combinationCount(options: readonly VariantOption[]): number {
  const complete = Object.values(variantOptionsToRecord(options));
  return complete.length === 0 ? 0 : complete.reduce((count, values) => count * values.length, 1);
}

/**
 * The options of a new product (size, colour, material, weight… — any
 * activity) and their values, right in the product form: every combination
 * becomes a variant when the product is saved. No options → a simple item.
 * Names and values the shop already used are one click away, so its size
 * ranges work as ready templates.
 */
export function VariantOptionsEditor({
  value,
  onChange,
  prices,
  onPricesChange,
  basePrice,
}: {
  value: VariantOption[];
  onChange: (options: VariantOption[]) => void;
  /** Sale price text per combination key (see variantCombinations); empty = the product's price. */
  prices: Record<string, string>;
  onPricesChange: (prices: Record<string, string>) => void;
  /** The product's sale price (placeholder of every row). */
  basePrice: string;
}) {
  const { t } = useTranslation();
  const { data: suggestions } = useVariantOptionSuggestions();
  const known = suggestions ?? [];
  const usedNames = new Set(value.map((option) => option.name.trim()));
  const nameChoices = [...new Set([...known.map((s) => s.name), ...STARTER_NAMES])].filter((name) => !usedNames.has(name)).slice(0, 6);
  const total = combinationCount(value);

  const update = (index: number, patch: Partial<VariantOption>) =>
    onChange(value.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  const add = (name = '') => onChange([...value, { name, values: [] }]);

  const combinations = variantCombinations(value);
  const [uniform, setUniform] = useState('');

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('inventory.products.options.title')}</p>
          <p className="text-xs text-muted-foreground">{t('inventory.products.options.hint')}</p>
        </div>
      </div>

      {value.map((option, index) => {
        const knownValues = known.find((s) => s.name === option.name.trim())?.values ?? [];
        const missing = knownValues.filter((v) => !option.values.includes(v));
        return (
          <div key={index} className="grid gap-2 rounded-md bg-subtle p-2.5">
            <div className="flex items-start gap-2">
              <Input
                className="h-9 w-36 shrink-0"
                value={option.name}
                placeholder={t('inventory.products.options.namePlaceholder')}
                aria-label={t('inventory.products.options.namePlaceholder')}
                onChange={(e) => update(index, { name: e.target.value })}
              />
              <ValuesInput values={option.values} onChange={(values) => update(index, { values })} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label={t('common.delete')}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {missing.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 ps-[9.5rem]">
                <span className="text-xs text-muted-foreground">{t('inventory.products.options.used')}</span>
                {missing.slice(0, 30).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-xs hover:bg-background"
                    onClick={() => update(index, { values: [...option.values, v] })}
                  >
                    + {v}
                  </button>
                ))}
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => update(index, { values: [...option.values, ...missing] })}
                >
                  {t('inventory.products.options.addAll')}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        {nameChoices.map((name) => (
          <Button key={name} type="button" variant="outline" size="sm" onClick={() => add(name)}>
            <Plus className="h-3.5 w-3.5" />
            {name}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => add()}>
          <Plus className="h-3.5 w-3.5" />
          {t('inventory.products.options.other')}
        </Button>
      </div>

      {total > 0 ? (
        <div className="grid gap-2 border-t pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{t('inventory.products.options.willCreate', { count: total })}</p>
            {total <= MAX_PRICED_ROWS ? (
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 w-28 text-end"
                  dir="ltr"
                  inputMode="decimal"
                  value={uniform}
                  onChange={(e) => setUniform(e.target.value)}
                  placeholder={basePrice || '0.00'}
                  aria-label={t('inventory.products.options.uniformPrice')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!uniform.trim()}
                  onClick={() => onPricesChange(Object.fromEntries(combinations.map((c) => [c.key, uniform.trim()])))}
                >
                  {t('inventory.products.options.applyToAll')}
                </Button>
              </div>
            ) : null}
          </div>
          {total <= MAX_PRICED_ROWS ? (
            <div className="scrollbar-thin grid max-h-72 gap-1 overflow-y-auto">
              {combinations.map((combo) => (
                <div key={combo.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-subtle">
                  <span className="text-sm">{combo.label}</span>
                  <Input
                    className="h-8 w-28 text-end"
                    dir="ltr"
                    inputMode="decimal"
                    value={prices[combo.key] ?? ''}
                    onChange={(e) => onPricesChange({ ...prices, [combo.key]: e.target.value })}
                    placeholder={basePrice || t('inventory.products.options.productPrice')}
                    aria-label={`${t('inventory.products.salePrice')} ${combo.label}`}
                  />
                </div>
              ))}
              <p className="px-2 text-xs text-muted-foreground">{t('inventory.products.options.priceHint')}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {combinations.slice(0, PREVIEW_LIMIT).map((combo) => (
                <Badge key={combo.key} variant="secondary" className="font-normal">
                  {combo.label}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground">+{total - PREVIEW_LIMIT}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Every combination of the complete options, in order: its key (stable), label and option → value map. */
export function variantCombinations(options: readonly VariantOption[]): { key: string; label: string; values: Record<string, string> }[] {
  const record = variantOptionsToRecord(options);
  const names = Object.keys(record);
  if (names.length === 0) return [];
  let combos: Record<string, string>[] = [{}];
  for (const name of names) combos = combos.flatMap((combo) => record[name]!.map((v) => ({ ...combo, [name]: v })));
  return combos.map((values) => {
    const parts = names.map((n) => values[n]!);
    return { key: parts.join('\u0000'), label: parts.join(' / '), values };
  });
}

/** Values as chips; Enter, "," or "،" adds what was typed (pasting "S، M، L" adds all three). */
function ValuesInput({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  function commit(raw: string) {
    const parts = raw.split(/[,،]/).map((part) => part.trim()).filter(Boolean);
    const next = [...values];
    for (const part of parts) if (!next.includes(part)) next.push(part);
    if (next.length !== values.length) onChange(next);
    setText('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(text);
    } else if (event.key === 'Backspace' && text === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1">
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="gap-1 font-normal">
          {v}
          <button type="button" aria-label={t('common.delete')} onClick={() => onChange(values.filter((x) => x !== v))}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        className="w-16 min-w-0 flex-1 bg-transparent text-sm outline-none"
        value={text}
        placeholder={values.length === 0 ? t('inventory.products.options.valuesPlaceholder') : ''}
        onChange={(e) => {
          const next = e.target.value;
          if (/[,،]/.test(next)) commit(next);
          else setText(next);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && commit(text)}
      />
    </div>
  );
}
