import { useMemo } from 'react';

import { encodeBarcode } from '../../lib/barcode';

/**
 * A scannable barcode drawn as SVG rects (EAN-13 or Code 128, see lib/barcode).
 * Bars are merged into runs so the SVG stays small; `crispEdges` keeps
 * printers from anti-aliasing bar edges. Renders the human-readable text
 * under the bars; returns null when the value can't be encoded (e.g. Arabic).
 */
export function BarcodeSvg({
  value,
  height = 40,
  showText = true,
  className,
}: {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}) {
  const encoded = useMemo(() => encodeBarcode(value), [value]);
  if (!encoded) return null;

  const quiet = 10;
  const width = encoded.modules.length + quiet * 2;
  const textHeight = showText ? 11 : 0;
  const runs: { x: number; w: number }[] = [];
  for (let i = 0; i < encoded.modules.length; i += 1) {
    if (encoded.modules[i] !== '1') continue;
    const last = runs[runs.length - 1];
    if (last && last.x + last.w === i + quiet) last.w += 1;
    else runs.push({ x: i + quiet, w: 1 });
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height + textHeight}`}
      className={className}
      role="img"
      aria-label={encoded.text}
      shapeRendering="crispEdges"
      style={{ direction: 'ltr' }}
    >
      <rect width={width} height={height + textHeight} fill="#fff" />
      {runs.map((run) => (
        <rect key={run.x} x={run.x} y={0} width={run.w} height={height} fill="#000" />
      ))}
      {showText ? (
        <text
          x={width / 2}
          y={height + textHeight - 1}
          textAnchor="middle"
          fontSize={10}
          fontFamily="ui-monospace, monospace"
          fill="#000"
        >
          {encoded.text}
        </text>
      ) : null}
    </svg>
  );
}
