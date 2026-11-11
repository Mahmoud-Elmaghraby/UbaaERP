/**
 * A USB barcode scanner "types" the code as key presses. When Windows is on the Arabic keyboard
 * layout, the letters of a code like "AB12x" arrive as Arabic characters ("ِلآ12ء") and nothing
 * matches — digits come through unchanged. This turns such text back into the keys that were
 * pressed (Arabic 101 layout), lower-case for unshifted keys and upper-case for shifted ones.
 */
const LAM_ALEF: [string, string][] = [
  ['لإ', 'T'],
  ['لأ', 'G'],
  ['لآ', 'B'],
  ['لا', 'b'],
  ['ﻹ', 'T'],
  ['ﻷ', 'G'],
  ['ﻵ', 'B'],
  ['ﻻ', 'b'],
];

const KEYS: Record<string, string> = {
  // Unshifted
  'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p',
  'ج': '[', 'د': ']', 'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k',
  'م': 'l', 'ك': ';', 'ط': "'", 'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'ى': 'n', 'ة': 'm', 'و': ',',
  'ز': '.', 'ظ': '/', 'ذ': '`',
  // Shifted
  'َ': 'Q', 'ً': 'W', 'ُ': 'E', 'ٌ': 'R', 'إ': 'Y', '‘': 'U', '÷': 'I', '×': 'O', '؛': 'P',
  'ِ': 'A', 'ٍ': 'S', 'أ': 'H', 'ـ': 'J', '،': 'K', 'ْ': 'X', 'آ': 'N', '’': 'M', '؟': '?',
};

const ARABIC = /[\u0600-\u06ff\ufe70-\ufeff\u2018\u2019\u00d7\u00f7]/;

/** The Latin keys behind text typed on the Arabic layout, or null when there's nothing Arabic in it. */
export function fromArabicKeyboard(text: string): string | null {
  if (!ARABIC.test(text)) return null;
  let out = text;
  for (const [pair, key] of LAM_ALEF) out = out.split(pair).join(key);
  out = Array.from(out, (char) => KEYS[char] ?? char).join('');
  // Arabic-Indic digits some layouts send.
  out = out.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  return out === text ? null : out;
}
