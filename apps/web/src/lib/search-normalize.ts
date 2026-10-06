const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Western digits for Arabic-Indic / Persian digits — scanners and Arabic keyboards mix both. */
export function toWesternDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const index = ARABIC_INDIC_DIGITS.indexOf(digit);
    return String(index >= 0 ? index : EASTERN_ARABIC_DIGITS.indexOf(digit));
  });
}

/**
 * Folds the spelling variations Arabic users type interchangeably (أ/إ/آ/ا,
 * ة/ه, ى/ي, tatweel, diacritics) plus case and digits, so "اسمنت" finds
 * "أسمنت" and "١٢٣" finds "123".
 */
export function normalizeForSearch(value: string): string {
  return toWesternDigits(value)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}
