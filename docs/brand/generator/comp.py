import sys; sys.argv=['x','/home/claude/brand/out/ubaa-brand']
exec(open('build.py').read())
WM,WB,_=wordmark('/home/claude/brand/fonts/Montserrat%5Bwght%5D.ttf',700)
x0,y0,x1,y1=WB
# normalise wordmark to start at 0,0 by wrapping in a transform
W,H=x1-x0,y1-y0
pad=2; SX=verts[4][0]-pad; SY=3-pad; SW=verts[1][0]-verts[4][0]+2*pad; SH=94+2*pad
regs={k:REGIONS[k] for k in ('navy','blue','blue_fold','orange','orange_fold2')}
tsx=f'''import {{ useId }} from 'react';
import {{ cn }} from '@erp-platform/ui';

/**
 * The Ubaa brand mark and wordmark (approved 2026-11-17; master files and rules in
 * docs/brand/). Inline SVG so they ship offline and follow the theme:
 *  - `BrandMark` draws the hexagon ribbon in its exact colours. On dark surfaces pass `tile`: the mark
 *    then sits on a white rounded tile, so the navy band never melts into a navy background.
 *  - `BrandWordmark` is "Ubaa" outlined (Montserrat Bold) and paints with `currentColor`.
 * Generated from docs/brand/generator — edit the generator, not these paths.
 */

const MARK_COLORS = {{
  navy: '{NAVY}',
  blue: '{BLUE}',
  blueFold: '{BLUE_FOLD}',
  orange: '{ORANGE}',
  orangeFold: '{ORANGE_FOLD}',
}} as const;

const HEX = '{HEX}';
const TRIANGLE = '{TRI}';
const BANDS = [
  ['navy', '{regs["navy"]}'],
  ['blue', '{regs["blue"]}'],
  ['blueFold', '{regs["blue_fold"]}'],
  ['orange', '{regs["orange"]}'],
  ['orangeFold', '{regs["orange_fold2"]}'],
] as const;

interface BrandMarkProps {{
  className?: string;
  /** For navy / dark surfaces: draw the mark on a white rounded tile. */
  tile?: boolean;
  title?: string;
}}

export function BrandMark({{ className, tile = false, title }}: BrandMarkProps) {{
  const clipId = `ubaa-mark-${{useId().replace(/:/g, '')}}`;
  const svg = (
    <svg
      viewBox="{f(SX)} {f(SY)} {f(SW)} {f(SH)}"
      className={{tile ? 'h-[72%] w-[72%]' : cn('shrink-0', className)}}
      role={{title ? 'img' : undefined}}
      aria-label={{title}}
      aria-hidden={{title ? undefined : true}}
    >
      <clipPath id={{clipId}}>
        <path d={{HEX + TRIANGLE}} clipRule="evenodd" />
      </clipPath>
      <g clipPath={{`url(#${{clipId}})`}}>
        {{BANDS.map(([key, d]) => (
          // The same-colour hairline stroke closes the anti-aliasing seams between facets.
          <path key={{key}} d={{d}} fill={{MARK_COLORS[key]}} stroke={{MARK_COLORS[key]}} strokeWidth={{0.6}} strokeLinejoin="round" />
        ))}}
      </g>
    </svg>
  );
  if (!tile) return svg;
  return (
    <span className={{cn('flex shrink-0 items-center justify-center rounded-[22%] bg-white shadow-sm', className)}}>
      {{svg}}
    </span>
  );
}}

const WORDMARK = '{WM}';

export function BrandWordmark({{ className, title }}: {{ className?: string; title?: string }}) {{
  return (
    <svg
      viewBox="{f(x0)} {f(y0)} {f(W)} {f(H)}"
      className={{cn('shrink-0', className)}}
      role={{title ? 'img' : undefined}}
      aria-label={{title}}
      aria-hidden={{title ? undefined : true}}
    >
      <path d={{WORDMARK}} fill="currentColor" />
    </svg>
  );
}}
'''
open('/mnt/user-data/outputs/brand-mark.tsx','w').write(tsx)
print(len(tsx), f(W/H))
