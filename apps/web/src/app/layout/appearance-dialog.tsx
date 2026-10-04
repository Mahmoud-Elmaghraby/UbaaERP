import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@erp-platform/ui';
import { Check, Monitor, Moon, Rows3, Rows4, Sun } from 'lucide-react';

import { ACCENT_PRESETS, DEFAULT_ACCENT, isValidHex } from '../theme/palette';
import { useUiPreferences, type ColorMode, type Density } from '../theme/ui-preferences-store';

interface AppearanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SegmentButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors [&_svg]:size-4',
        selected
          ? 'border-primary bg-accent text-accent-foreground'
          : 'border-input bg-card text-secondary-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

export function AppearanceDialog({ open, onOpenChange }: AppearanceDialogProps) {
  const { t } = useTranslation();
  const { accent, mode, density, setAccent, setMode, setDensity } = useUiPreferences();
  const [customHex, setCustomHex] = useState(accent);

  const modes: { value: ColorMode; icon: ReactNode }[] = [
    { value: 'light', icon: <Sun /> },
    { value: 'dark', icon: <Moon /> },
    { value: 'system', icon: <Monitor /> },
  ];
  const densities: { value: Density; icon: ReactNode }[] = [
    { value: 'comfortable', icon: <Rows3 /> },
    { value: 'compact', icon: <Rows4 /> },
  ];

  function applyCustom(value: string) {
    setCustomHex(value);
    if (isValidHex(value)) setAccent(value.startsWith('#') ? value : `#${value}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('appearance.title')}</DialogTitle>
          <DialogDescription>{t('appearance.subtitle')}</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3">
          <Label>{t('appearance.brandColor')}</Label>
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_PRESETS.map((preset) => {
              const selected = preset.hex.toLowerCase() === accent.toLowerCase();
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setAccent(preset.hex);
                    setCustomHex(preset.hex);
                  }}
                  title={t(`appearance.accents.${preset.key}`)}
                  aria-label={t(`appearance.accents.${preset.key}`)}
                  aria-pressed={selected}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-shadow',
                    selected ? 'ring-2 ring-foreground/70' : 'hover:ring-2 hover:ring-border',
                  )}
                  style={{ backgroundColor: preset.hex }}
                >
                  {selected ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-10 w-10 shrink-0 rounded-lg border"
              style={{ backgroundColor: isValidHex(customHex) ? (customHex.startsWith('#') ? customHex : `#${customHex}`) : accent }}
              aria-hidden="true"
            />
            <Input
              value={customHex}
              onChange={(event) => applyCustom(event.target.value)}
              dir="ltr"
              className="text-end font-mono"
              aria-label={t('appearance.customColor')}
              aria-invalid={!isValidHex(customHex)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('appearance.customColorHint')}</p>
        </section>

        <section className="flex flex-col gap-3">
          <Label>{t('appearance.mode')}</Label>
          <div className="flex gap-2">
            {modes.map((m) => (
              <SegmentButton key={m.value} selected={mode === m.value} onClick={() => setMode(m.value)}>
                {m.icon}
                {t(`appearance.modes.${m.value}`)}
              </SegmentButton>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Label>{t('appearance.density')}</Label>
          <div className="flex gap-2">
            {densities.map((d) => (
              <SegmentButton key={d.value} selected={density === d.value} onClick={() => setDensity(d.value)}>
                {d.icon}
                {t(`appearance.densities.${d.value}`)}
              </SegmentButton>
            ))}
          </div>
        </section>

        <div className="flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAccent(DEFAULT_ACCENT);
              setCustomHex(DEFAULT_ACCENT);
              setMode('light');
              setDensity('comfortable');
            }}
          >
            {t('appearance.reset')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
