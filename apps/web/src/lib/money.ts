/**
 * Decimal-string <-> minor-unit helpers for the MoneyDto contract shape
 * (`{ amountMinorUnits: string, currency: string }`, see @erp-platform/contracts).
 *
 * The frontend never does monetary arithmetic itself — the backend's Money Value
 * Object (libs/shared-kernel) owns that. These helpers only convert between what a
 * human types into a form field (a decimal string like "12.50") and what the API
 * sends/expects (an integer minor-unit string like "1250"), using BigInt exclusively
 * so no floating-point rounding ever touches a monetary value (CLAUDE.md §3).
 *
 * Decimal places default to 2, matching every currency currently supported by the
 * backend's Money.toDecimalString() — there is no per-currency decimal-count concept
 * anywhere in the codebase yet, so this mirrors that (documented assumption, not a
 * silent one).
 */

const DEFAULT_DECIMALS = 2;

function assertValidDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`عدد الخانات العشرية غير صالح: ${decimals}`);
  }
}

/**
 * يحوّل نصًا عشريًا أدخله المستخدم (مثل "12.5" أو "-3" أو "0") إلى أصغر وحدة نقدية
 * كسلسلة نصية (مثل "1250")، بما يطابق شكل MoneyDto.amountMinorUnits.
 *
 * يرمي خطأ واضحًا إذا كانت القيمة غير رقمية أو تحتوي على خانات عشرية أكثر من
 * المسموح — يُفترض أن يتم التحقق مسبقًا عبر Zod، وهذا خط دفاع إضافي فقط.
 */
export function decimalToMinorUnits(input: string, decimals: number = DEFAULT_DECIMALS): string {
  assertValidDecimals(decimals);

  const trimmed = input.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`قيمة عشرية غير صالحة: "${input}"`);
  }

  const [, sign, wholePart, fractionPartRaw = ''] = match;
  if (fractionPartRaw.length > decimals) {
    throw new Error(`لا يمكن أن يحتوي المبلغ على أكثر من ${decimals} خانة عشرية`);
  }

  const fractionPart = fractionPartRaw.padEnd(decimals, '0');
  const magnitude = BigInt(wholePart + (fractionPart || '0'));
  const value = sign && magnitude !== 0n ? -magnitude : magnitude;
  return value.toString();
}

/**
 * يحوّل قيمة بأصغر وحدة نقدية (كما ترد من الـ API في MoneyDto.amountMinorUnits)
 * إلى نص عشري صالح لعرضه أو تعديله في حقل إدخال (مثل "12.50").
 */
export function minorUnitsToDecimalString(
  amountMinorUnits: string,
  decimals: number = DEFAULT_DECIMALS,
): string {
  assertValidDecimals(decimals);

  const trimmed = amountMinorUnits.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`قيمة أصغر وحدة نقدية غير صالحة: "${amountMinorUnits}"`);
  }

  const value = BigInt(trimmed);
  const negative = value < 0n;
  const absoluteValue = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const wholePart = absoluteValue / divisor;
  const fractionPart = (absoluteValue % divisor).toString().padStart(decimals, '0');

  const body = decimals > 0 ? `${wholePart}.${fractionPart}` : wholePart.toString();
  return negative && absoluteValue !== 0n ? `-${body}` : body;
}

/**
 * ينسّق مبلغًا ماليًا (بأصغر وحدة نقدية + رمز العملة) كنص واحد جاهز للعرض
 * (مثل "1250" + "EGP" -> "12.50 EGP"). دالة عرض بسيطة فقط — لا تُستخدم لأي
 * حساب مالي، والمصدر الوحيد للحقيقة في الحسابات يبقى Money Value Object
 * على الباك‑إند (CLAUDE.md §3). كانت مكررة بنفس التعريف في كل من
 * features/inventory/components/stock و components/landed-costs؛ نُقلت هنا
 * كنقطة مشتركة واحدة لأنها عامة وليست خاصة بأي كيان (entity) بعينه، وستحتاجها
 * موديولات لاحقة (Purchases/Sales) بنفس الشكل.
 */
export function formatMoney(amountMinorUnits: string, currency: string): string {
  return `${formatAmount(amountMinorUnits)} ${currency}`;
}

/**
 * نفس minorUnitsToDecimalString لكن بفاصل الآلاف للعرض فقط ("123456789" -> "1,234,567.89").
 * لا تُستخدم كقيمة لحقل إدخال (الحقول تتوقع الرقم بدون فواصل).
 */
export function formatAmount(amountMinorUnits: string, decimals: number = DEFAULT_DECIMALS): string {
  const plain = minorUnitsToDecimalString(amountMinorUnits, decimals);
  const negative = plain.startsWith('-');
  const body = negative ? plain.slice(1) : plain;
  const [whole = '0', fraction] = body.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/**
 * سعر الوحدة (بأصغر وحدة نقدية) × كمية (قد تكون كسرية) — بحساب صحيح بالكامل عبر BigInt
 * بدون أي float، مع تقريب نصف لأعلى لأقرب أصغر وحدة. للعرض والمعاينة في الواجهة فقط؛
 * الإجمالي الرسمي دائمًا ما يحسبه الباك‑إند.
 */
export function multiplyMinorUnits(amountMinorUnits: string, quantity: number | string): string {
  const qtyText = typeof quantity === 'number' ? quantity.toString() : quantity.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(qtyText);
  if (!match) return '0';
  const [, whole, fraction = ''] = match;
  const scale = 10n ** BigInt(fraction.length);
  const qtyScaled = BigInt(whole + fraction);
  const product = BigInt(amountMinorUnits) * qtyScaled;
  const negative = product < 0n;
  const abs = negative ? -product : product;
  const rounded = (abs + scale / 2n) / scale;
  return (negative ? -rounded : rounded).toString();
}

/** Sum of minor-unit amounts (BigInt, exact). */
export function sumMinorUnits(amounts: string[]): string {
  return amounts.reduce((total, value) => total + BigInt(value), 0n).toString();
}
