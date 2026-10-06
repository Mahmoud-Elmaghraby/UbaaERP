/**
 * Downloads rows as a CSV that Excel opens correctly in Arabic: UTF-8 with a
 * BOM (without it Excel guesses a legacy code page and shows mojibake), CRLF
 * line ends, every cell quoted.
 */
export function downloadCsv(fileName: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const text = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Splits text pasted from Excel / Google Sheets (tab-separated, or
 * comma/semicolon-separated when there are no tabs) into trimmed cells.
 * Blank lines are dropped.
 */
export function parsePastedTable(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const separator = lines.some((line) => line.includes('\t'))
    ? '\t'
    : lines.some((line) => line.includes(';'))
      ? ';'
      : ',';
  return lines.map((line) => line.split(separator).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1')));
}
