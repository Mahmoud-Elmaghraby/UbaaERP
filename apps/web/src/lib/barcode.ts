/**
 * Barcode symbol encoding for printed labels — EAN-13 for numeric retail
 * codes, Code 128 (set B) for everything else ASCII (SKUs like "TS-001").
 * Kept dependency-free on purpose: both symbologies are small, fixed tables,
 * and labels only need the module pattern to draw <rect>s.
 *
 * Output is a string of '1' (bar) / '0' (space) modules, quiet zones excluded.
 */

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
/** Which of L/G encodes each left-half digit, chosen by the (unprinted) first digit. */
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function encodeEan13(code: string): string {
  if (!isValidEan13(code)) throw new Error(`Not a valid EAN-13: ${code}`);
  const digits = code.split('').map(Number);
  const parity = EAN_PARITY[digits[0]];
  let modules = '101';
  for (let i = 1; i <= 6; i += 1) modules += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[digits[i]];
  modules += '01010';
  for (let i = 7; i <= 12; i += 1) modules += EAN_R[digits[i]];
  return `${modules}101`;
}

/** Code 128 bar/space widths for symbol values 0–106 (106 = stop, 7 elements). */
const CODE128_WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const CODE128_START_B = 104;
const CODE128_STOP = 106;

function widthsToModules(widths: string): string {
  let modules = '';
  for (let i = 0; i < widths.length; i += 1) modules += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
  return modules;
}

/** Printable ASCII (32–126) only — Arabic text can't be carried by Code 128. */
export function canEncodeCode128(text: string): boolean {
  return text.length > 0 && /^[\x20-\x7e]+$/.test(text);
}

export function encodeCode128(text: string): string {
  if (!canEncodeCode128(text)) throw new Error('Code 128 (set B) supports printable ASCII only.');
  const values = [CODE128_START_B, ...text.split('').map((char) => char.charCodeAt(0) - 32)];
  const checksum = values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
  return [...values, checksum, CODE128_STOP].map((value) => widthsToModules(CODE128_WIDTHS[value])).join('');
}

export interface EncodedBarcode {
  format: 'EAN-13' | 'CODE128';
  modules: string;
  text: string;
}

/** Picks the symbology for a value: EAN-13 when it is a valid 13-digit (or 12-digit + computed) code, else Code 128. */
export function encodeBarcode(value: string): EncodedBarcode | null {
  const trimmed = value.trim();
  if (/^\d{12}$/.test(trimmed)) {
    const full = `${trimmed}${ean13CheckDigit(trimmed)}`;
    return { format: 'EAN-13', modules: encodeEan13(full), text: full };
  }
  if (isValidEan13(trimmed)) return { format: 'EAN-13', modules: encodeEan13(trimmed), text: trimmed };
  if (canEncodeCode128(trimmed)) return { format: 'CODE128', modules: encodeCode128(trimmed), text: trimmed };
  return null;
}
