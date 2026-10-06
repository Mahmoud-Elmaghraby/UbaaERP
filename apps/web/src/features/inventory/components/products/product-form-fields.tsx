import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductTrackingTypeDto } from '@erp-platform/contracts';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useUnitsOfMeasure } from '../../api/units-of-measure/queries';

export function UnitOfMeasureField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const { data: units } = useUnitsOfMeasure();
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={t('inventory.products.selectUnit')} />
      </SelectTrigger>
      <SelectContent>
        {(units ?? []).map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name} ({u.symbol})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TrackingTypeField({
  value,
  onChange,
}: {
  value: ProductTrackingTypeDto;
  onChange: (value: ProductTrackingTypeDto) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ProductTrackingTypeDto)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t('inventory.products.trackingNone')}</SelectItem>
        <SelectItem value="lot">{t('inventory.products.trackingLot')}</SelectItem>
        <SelectItem value="serial">{t('inventory.products.trackingSerial')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Splits on Latin "," and Arabic "،" commas; trims, drops blanks and duplicates. */
function parseAttributes(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[,،]/)) {
    const trimmed = part.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Comma-separated attribute names (e.g. "المقاس، اللون"). Keeps the raw text the user
 * is typing in local state — re-rendering from the parsed array used to swallow a comma
 * the instant it was typed, so a second attribute could never be entered.
 */
export function AttributesInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[] | undefined;
  onChange: (attributes: string[]) => void;
  placeholder?: string;
}) {
  const attributes = value ?? [];
  const [text, setText] = useState(() => attributes.join('، '));
  const key = attributes.join('\u0000');

  useEffect(() => {
    // Only resync when the value changed from outside (e.g. form reset), not from typing.
    setText((current) => (parseAttributes(current).join('\u0000') === key ? current : attributes.join('، ')));
  }, [key]);

  return (
    <Input
      placeholder={placeholder}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseAttributes(event.target.value));
      }}
    />
  );
}
