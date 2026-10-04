/**
 * Derives the whole brand palette from ONE accent color (claude/ui-redesign-plan.md:
 * "the brand color can be changed easily at any time"). Every brand-dependent CSS
 * variable in src/index.css (--primary, --ring, --accent, --sidebar-accent*, --brand-50
 * … --brand-900) is recomputed here and written onto <html> by ThemeProvider, so
 * changing a single hex value recolors the entire app.
 *
 * Neutral grays and status colors (success/warning/info/danger) intentionally do NOT
 * depend on the accent — they must keep their meaning whatever brand is chosen.
 */

export const DEFAULT_ACCENT = '#0E6B5C';

export interface AccentPreset {
  /** i18n key under `appearance.accents.*` */
  key: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { key: 'teal', hex: '#0E6B5C' },
  { key: 'indigo', hex: '#3E4FB8' },
  { key: 'blue', hex: '#1F5FBF' },
  { key: 'navy', hex: '#1F3A5F' },
  { key: 'plum', hex: '#7A3E8E' },
  { key: 'rust', hex: '#A4432A' },
];

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = DEFAULT_ACCENT.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as Rgb;
}

/** "H S% L%" — the space-separated form every token in index.css uses. */
function toHslToken([r, g, b]: Rgb): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const DARK_SURFACE: Rgb = [17, 22, 29];

export function isValidHex(value: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** Returns CSS custom-property name → value (without the leading `--`). */
export function buildBrandTokens(accentHex: string, dark: boolean): Record<string, string> {
  const base = hexToRgb(accentHex);

  const scale: Record<string, Rgb> = {
    'brand-50': mix(base, WHITE, 0.94),
    'brand-100': mix(base, WHITE, 0.86),
    'brand-200': mix(base, WHITE, 0.7),
    'brand-300': mix(base, WHITE, 0.5),
    'brand-400': mix(base, WHITE, 0.25),
    'brand-500': base,
    'brand-600': mix(base, BLACK, 0.12),
    'brand-700': mix(base, BLACK, 0.28),
    'brand-800': mix(base, BLACK, 0.45),
    'brand-900': mix(base, BLACK, 0.62),
  };

  const tokens: Record<string, string> = {};
  for (const [name, rgb] of Object.entries(scale)) tokens[name] = toHslToken(rgb);

  if (!dark) {
    // Very light accents would make white text unreadable on buttons.
    const onPrimary = relativeLuminance(base) > 0.45 ? mix(base, BLACK, 0.8) : WHITE;
    const soft = mix(base, WHITE, 0.9);
    tokens.primary = toHslToken(base);
    tokens['primary-foreground'] = toHslToken(onPrimary);
    tokens.ring = toHslToken(base);
    tokens.accent = toHslToken(soft);
    tokens['accent-foreground'] = toHslToken(mix(base, BLACK, 0.25));
    tokens['sidebar-accent'] = toHslToken(soft);
    tokens['sidebar-accent-foreground'] = toHslToken(mix(base, BLACK, 0.18));
  } else {
    const bright = mix(base, WHITE, 0.3);
    const soft = mix(base, DARK_SURFACE, 0.78);
    tokens.primary = toHslToken(bright);
    tokens['primary-foreground'] = toHslToken(mix(base, BLACK, 0.8));
    tokens.ring = toHslToken(bright);
    tokens.accent = toHslToken(soft);
    tokens['accent-foreground'] = toHslToken(mix(base, WHITE, 0.55));
    tokens['sidebar-accent'] = toHslToken(soft);
    tokens['sidebar-accent-foreground'] = toHslToken(mix(base, WHITE, 0.6));
  }

  return tokens;
}
