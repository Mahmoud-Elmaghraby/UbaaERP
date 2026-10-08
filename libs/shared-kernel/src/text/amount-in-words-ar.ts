/**
 * التفقيط — an amount written in Arabic words, the way Egyptian invoices,
 * receipts and cheques print it:
 *   10260 minor units EGP → "فقط مائة واثنان جنيه مصري وستون قرشاً لا غير"
 * Integer-only (minor units), shared by every printed document.
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** 1..999 */
function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest) {
    if (rest < 10) parts.push(ONES[rest]!);
    else if (rest < 20) parts.push(TEENS[rest - 10]!);
    else {
      const ones = rest % 10;
      const tens = Math.floor(rest / 10);
      parts.push(ones ? `${ONES[ones]} و${TENS[tens]}` : TENS[tens]!);
    }
  }
  return parts.join(' و');
}

/** [singular, dual, plural (3-10), accusative singular (11+)] */
const SCALES: [bigint, [string, string, string, string]][] = [
  [1_000_000_000n, ['مليار', 'ملياران', 'مليارات', 'ملياراً']],
  [1_000_000n, ['مليون', 'مليونان', 'ملايين', 'مليوناً']],
  [1_000n, ['ألف', 'ألفان', 'آلاف', 'ألفاً']],
];

function scaled(count: number, forms: [string, string, string, string]): string {
  if (count === 1) return forms[0];
  if (count === 2) return forms[1];
  if (count >= 3 && count <= 10) return `${belowThousand(count)} ${forms[2]}`;
  // 11..99 take the accusative singular; round hundreds (100, 200…) the plain singular.
  const lastTwo = count % 100;
  return `${belowThousand(count)} ${lastTwo >= 11 ? forms[3] : forms[0]}`;
}

/** A non-negative whole number in Arabic words ("صفر" for 0). */
export function numberToArabicWords(value: bigint | number): string {
  let n = BigInt(value);
  if (n < 0n) throw new Error('numberToArabicWords: negative numbers are not supported.');
  if (n === 0n) return 'صفر';
  const parts: string[] = [];
  for (const [size, forms] of SCALES) {
    const count = n / size;
    if (count > 0n) {
      parts.push(scaled(Number(count), forms));
      n %= size;
    }
  }
  if (n > 0n) parts.push(belowThousand(Number(n)));
  return parts.join(' و');
}

const CURRENCIES: Record<string, { main: string; fraction: string; fractionDigits: number }> = {
  EGP: { main: 'جنيه مصري', fraction: 'قرشاً', fractionDigits: 2 },
  USD: { main: 'دولار أمريكي', fraction: 'سنتاً', fractionDigits: 2 },
  EUR: { main: 'يورو', fraction: 'سنتاً', fractionDigits: 2 },
  SAR: { main: 'ريال سعودي', fraction: 'هللة', fractionDigits: 2 },
  AED: { main: 'درهم إماراتي', fraction: 'فلساً', fractionDigits: 2 },
  KWD: { main: 'دينار كويتي', fraction: 'فلساً', fractionDigits: 3 },
};

/** "فقط ... لا غير" for an amount in minor units of a currency. */
export function amountInWordsAr(minorUnits: bigint | string | number, currency: string): string {
  const amount = BigInt(minorUnits);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const info = CURRENCIES[currency] ?? { main: currency, fraction: '', fractionDigits: 2 };
  const divisor = 10n ** BigInt(info.fractionDigits);
  const main = absolute / divisor;
  const fraction = absolute % divisor;
  let text = `${numberToArabicWords(main)} ${info.main}`;
  if (fraction > 0n) text += ` و${numberToArabicWords(fraction)} ${info.fraction}`.trimEnd();
  return `فقط ${negative ? 'سالب ' : ''}${text} لا غير`;
}
