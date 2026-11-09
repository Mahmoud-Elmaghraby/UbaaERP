import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@erp-platform/ui';
import { Eye, EyeOff, Wand2 } from 'lucide-react';

/** A strong password that passes the shared rule (lower, upper, digit, 12 chars). */
export function generatePassword(): string {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789'];
  const all = sets.join('');
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0]! % chars.length]!;
  const chars = [...sets.map(pick), ...Array.from({ length: 9 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

/** Password field with show/hide and "generate" — generating shows the value so it can be handed over. */
export function PasswordInput({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pe-9"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={visible ? t('users.hidePassword') : t('users.showPassword')}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onChange(generatePassword());
          setVisible(true);
        }}
      >
        <Wand2 />
        {t('users.generatePassword')}
      </Button>
    </div>
  );
}
