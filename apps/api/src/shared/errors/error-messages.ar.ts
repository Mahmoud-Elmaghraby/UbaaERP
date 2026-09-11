/**
 * Arabic message catalog for every domain-error `code` thrown across the
 * API (CLAUDE.md refactor, 2026-09: errors were previously English-only,
 * unexplained "raw" text with no code a client could branch on).
 * DomainExceptionFilter looks a thrown error's `code` up here and returns
 * the Arabic text to the client; the error's own `message` (English) stays
 * internal, for logs and tests only.
 *
 * Keep this file DATA, not logic — a translator or reviewer should be able
 * to scan it without reading TypeScript. `{placeholder}` tokens are
 * replaced by formatArMessage() from the error's `params`. A code missing
 * here falls back to a generic message instead of throwing — a missing
 * translation must never itself crash the request.
 *
 * NOT_FOUND messages deliberately do NOT interpolate the id: showing a
 * raw UUID to an end user is not useful in any language. DUPLICATE
 * messages DO interpolate the offending value (a code/name/sku/email is
 * human-meaningful and helps the user fix the conflict).
 */
export const AR_MESSAGES: Record<string, string> = {
  // ---- entity "not found" (see entity-errors.ts: entityNotFound) ----
  'BRANCH.NOT_FOUND': 'لم يتم العثور على الفرع المطلوب.',
  'WAREHOUSE.NOT_FOUND': 'لم يتم العثور على المستودع المطلوب.',
  'WAREHOUSE_LOCATION.NOT_FOUND': 'لم يتم العثور على موقع التخزين المطلوب داخل المستودع.',
  'PRODUCT.NOT_FOUND': 'لم يتم العثور على المنتج المطلوب.',
  'PRODUCT_VARIANT.NOT_FOUND': 'لم يتم العثور على نوع المنتج (variant) المطلوب.',
  'UNIT_OF_MEASURE.NOT_FOUND': 'لم يتم العثور على وحدة القياس المطلوبة.',
  'STOCK_LEVEL.NOT_FOUND': 'لم يتم العثور على مستوى مخزون مطابق.',
  'STOCK_MOVEMENT.NOT_FOUND': 'لم يتم العثور على حركة المخزون المطلوبة.',
  'LANDED_COST.NOT_FOUND': 'لم يتم العثور على التكلفة الإضافية (Landed Cost) المطلوبة.',
  'FISCAL_YEAR.NOT_FOUND': 'لم يتم العثور على السنة المالية المطلوبة.',
  'CHART_OF_ACCOUNT.NOT_FOUND': 'لم يتم العثور على الحساب المحاسبي المطلوب.',
  'BANK_ACCOUNT.NOT_FOUND': 'لم يتم العثور على الحساب البنكي المطلوب.',
  'JOURNAL_ENTRY.NOT_FOUND': 'لم يتم العثور على القيد المحاسبي المطلوب.',
  'JOURNAL_ENTRY_LINE.NOT_FOUND': 'لم يتم العثور على سطر القيد المحاسبي المطلوب.',
  'COST_CENTER.NOT_FOUND': 'لم يتم العثور على مركز التكلفة المطلوب.',
  'ACCOUNTING_PERIOD.NOT_FOUND': 'لم يتم العثور على الفترة المحاسبية المطلوبة.',
  'PURCHASE_REQUISITION.NOT_FOUND': 'لم يتم العثور على طلب الشراء المطلوب.',
  'PURCHASE_ORDER.NOT_FOUND': 'لم يتم العثور على أمر الشراء المطلوب.',
  'PURCHASE_INVOICE.NOT_FOUND': 'لم يتم العثور على فاتورة الشراء المطلوبة.',
  'SUPPLIER_QUOTATION.NOT_FOUND': 'لم يتم العثور على عرض سعر المورد المطلوب.',
  'RFQ.NOT_FOUND': 'لم يتم العثور على طلب عرض السعر (RFQ) المطلوب.',
  'SUPPLIER.NOT_FOUND': 'لم يتم العثور على المورد المطلوب.',
  'GOODS_RECEIPT.NOT_FOUND': 'لم يتم العثور على إذن استلام البضاعة المطلوب.',
  'PURCHASE_RETURN.NOT_FOUND': 'لم يتم العثور على مرتجع الشراء المطلوب.',
  'SALES_ORDER.NOT_FOUND': 'لم يتم العثور على أمر البيع المطلوب.',
  'SALES_INVOICE.NOT_FOUND': 'لم يتم العثور على فاتورة البيع المطلوبة.',
  'SALES_RETURN.NOT_FOUND': 'لم يتم العثور على مرتجع البيع المطلوب.',
  'SALES_CREDIT_NOTE.NOT_FOUND': 'لم يتم العثور على إشعار الدائن المطلوب.',
  'QUOTATION.NOT_FOUND': 'لم يتم العثور على عرض السعر المطلوب.',
  'CUSTOMER.NOT_FOUND': 'لم يتم العثور على العميل المطلوب.',
  'DELIVERY.NOT_FOUND': 'لم يتم العثور على إذن التسليم المطلوب.',
  'PAYMENT.NOT_FOUND': 'لم يتم العثور على الدفعة المطلوبة.',
  'POS_SESSION.NOT_FOUND': 'لم يتم العثور على جلسة نقطة البيع المطلوبة.',
  'CUSTOM_FIELD_DEFINITION.NOT_FOUND': 'لم يتم العثور على الحقل المخصص المطلوب.',
  'NUMBERING_SEQUENCE.NOT_FOUND': 'لم يتم العثور على تسلسل الترقيم المطلوب.',
  'DOCUMENT_TEMPLATE.NOT_FOUND': 'لم يتم العثور على قالب المستند المطلوب.',
  'TAX_RULE.NOT_FOUND': 'لم يتم العثور على القاعدة الضريبية المطلوبة.',
  'USER.NOT_FOUND': 'لم يتم العثور على المستخدم المطلوب.',
  'ROLE.NOT_FOUND': 'لم يتم العثور على الدور (Role) المطلوب.',

  // ---- Settings module ----
  'BRANCH.DUPLICATE_CODE': 'يوجد فرع آخر بنفس الرمز "{value}" بالفعل.',
  'CUSTOM_FIELD_DEFINITION.DUPLICATE_FIELD_KEY':
    'يوجد حقل مخصص بنفس المعرّف "{fieldKey}" على نوع العنصر "{entityType}" بالفعل.',
  'DOCUMENT_TEMPLATE.DUPLICATE_DEFAULT_ON_CREATE':
    'يوجد بالفعل قالب افتراضي لنوع المستند "{documentType}" — يجب إلغاء تعيين القالب الافتراضي الحالي أولاً قبل تعيين قالب آخر.',
  'DOCUMENT_TEMPLATE.DUPLICATE_DEFAULT_ON_UPDATE':
    'يوجد بالفعل قالب آخر مُعيَّن كافتراضي لهذا النوع من المستندات.',
  'NUMBERING_SEQUENCE.DUPLICATE': 'يوجد بالفعل تسلسل ترقيم لنوع المستند "{documentType}".',
  'FEATURE_TOGGLES.UNKNOWN_FEATURE_KEY': 'مفتاح الميزة "{featureKey}" غير معروف.',
  'FEATURE_TOGGLES.NOT_GRANTED_BY_PLAN':
    'لا يمكن تفعيل ميزة "{featureKey}" — باقة الاشتراك الحالية لا تشمل هذه الميزة.',

  // ---- Inventory module ----
  'PRODUCT.DUPLICATE_CODE_OR_VARIANT_SKU':
    'يوجد منتج آخر بنفس الرمز "{code}" (أو رمز الوحدة الافتراضي) بالفعل.',
  'PRODUCT.DUPLICATE_CODE': 'يوجد منتج آخر بنفس الرمز "{value}" بالفعل.',
  'PRODUCT_VARIANT.DUPLICATE_SKU': 'يوجد نوع منتج آخر بنفس رمز الصنف (SKU) "{value}" بالفعل.',
  'WAREHOUSE.DUPLICATE_CODE': 'يوجد مستودع آخر بنفس الرمز "{value}" بالفعل.',
  'WAREHOUSE_LOCATION.DUPLICATE_CODE_IN_WAREHOUSE':
    'يوجد موقع تخزين آخر بنفس الرمز "{code}" داخل هذا المستودع بالفعل.',
  'WAREHOUSE_LOCATION.HAS_STOCK': 'لا يمكن حذف موقع تخزين يحتوي على مخزون مسجل.',
  'UNIT_OF_MEASURE.DUPLICATE_NAME': 'توجد وحدة قياس أخرى بنفس الاسم "{name}" بالفعل.',
  'UNIT_OF_MEASURE.CANNOT_BE_OWN_BASE_UNIT': 'لا يمكن أن تكون وحدة القياس هي الوحدة الأساسية لنفسها.',
  'UNIT_OF_MEASURE.BASE_UNIT_ITSELF_DERIVED':
    'الوحدة "{name}" مشتقة من وحدة أخرى، ولا يمكن استخدامها كوحدة أساسية (سلاسل التحويل المتعددة غير مدعومة).',
  'UNIT_OF_MEASURE.CONVERSION_FAILED': 'تعذّر تحويل الكمية بين وحدتي القياس: {reason}',
  'LANDED_COST.TOTAL_MUST_BE_POSITIVE': 'يجب أن يكون إجمالي التكلفة الإضافية (Landed Cost) مبلغًا موجبًا.',
  'LANDED_COST.AT_LEAST_ONE_MOVEMENT_REQUIRED':
    'يجب اختيار حركة مخزون واحدة على الأقل لتوزيع التكلفة الإضافية عليها.',
  'LANDED_COST.DUPLICATE_MOVEMENT_IDS':
    'لا يمكن تكرار نفس حركة المخزون أكثر من مرة في عملية توزيع واحدة للتكلفة الإضافية.',
  'LANDED_COST.NO_STOCK_ON_HAND':
    'لا يمكن تطبيق التكلفة الإضافية على هذه الحركة: لا يوجد مخزون متاح حاليًا في هذا الموقع (تم استهلاكه بالكامل).',
  'LANDED_COST.MOVEMENT_NOT_INCOMING':
    'لا يمكن تطبيق التكلفة الإضافية إلا على حركات مخزون "وارد"؛ الحركة المحددة من نوع "{movementType}".',
  'LANDED_COST.MOVEMENT_MISSING_UNIT_COST':
    'حركة المخزون المحددة لا تحتوي على تكلفة وحدة مسجلة لاستخدامها في توزيع التكلفة الإضافية.',
  'LANDED_COST.ZERO_TOTAL_WEIGHT': 'لا يمكن توزيع التكلفة الإضافية على حركات مجموع كمياتها/قيمتها يساوي صفرًا.',
  'LANDED_COST.TOTAL_TOO_SMALL_TO_SPLIT':
    'إجمالي التكلفة الإضافية صغير جدًا بحيث لا يمكن توزيعه على جميع الحركات المحددة — يجب أن يحصل كل سطر على مبلغ موجب.',
  'STOCK_MOVEMENT.QUANTITY_MUST_BE_POSITIVE': 'يجب أن تكون كمية حركة المخزون رقمًا موجبًا.',
  'STOCK_MOVEMENT.INCOMING_REQUIRES_UNIT_COST': 'حركة المخزون الواردة تتطلب تحديد تكلفة الوحدة.',
  'STOCK_MOVEMENT.UNSUPPORTED_TYPE': 'نوع حركة المخزون "{type}" غير مدعوم.',
  'STOCK_MOVEMENT.TRANSFER_QUANTITY_MUST_BE_POSITIVE': 'يجب أن تكون كمية تحويل المخزون رقمًا موجبًا.',
  'STOCK_MOVEMENT.TRANSFER_SAME_LOCATION': 'لا يمكن تحويل المخزون إلى نفس الموقع.',
  'STOCK_MOVEMENT.TRANSFER_REQUIRES_LOT_ID':
    'تحويل منتج يخضع لتتبع الدُفعات/الأرقام التسلسلية يتطلب تحديد الدُفعة (lotId) المراد تحويلها.',
  'STOCK_MOVEMENT.UNIT_COST_REQUIRED_NO_EXISTING_STOCK':
    'تحديد تكلفة الوحدة مطلوب: لا يوجد مخزون سابق لهذا الصنف في هذا الموقع للاعتماد عليه.',
  'STOCK_MOVEMENT.CURRENCY_MISMATCH':
    'تعارض في العملة: المخزون الحالي مُقيَّم بعملة "{existing}"، بينما الحركة تستخدم عملة "{used}". التقييم متعدد العملات غير مدعوم.',
  'STOCK_MOVEMENT.SERIAL_RECEIVE_QTY_MUST_BE_ONE':
    'المنتجات ذات التتبع بالرقم التسلسلي يجب استلامها بكمية واحدة فقط (=1) لكل رقم تسلسلي.',
  'STOCK_MOVEMENT.TRACKING_LABEL_REQUIRED': 'هذا المنتج يخضع للتتبع، ويجب إدخال {trackingLabel}.',
  'STOCK_MOVEMENT.INSUFFICIENT_STOCK':
    'المخزون غير كافٍ: الكمية المطلوبة {requested}، والمتاح في هذا الموقع {available} فقط.',
  'STOCK_MOVEMENT.SERIAL_ISSUE_QTY_MUST_BE_ONE':
    'المنتجات ذات التتبع بالرقم التسلسلي يجب صرفها بكمية واحدة فقط (=1) لكل حركة.',
  'STOCK_MOVEMENT.INSUFFICIENT_LOT_STOCK':
    'المخزون غير كافٍ في الدُفعة المحددة: الكمية المطلوبة {requested}، والمتاح في هذا الموقع {available} فقط.',
  'STOCK_MOVEMENT.INSUFFICIENT_LOT_TRACKED_STOCK':
    'المخزون غير كافٍ عبر جميع الدُفعات: الكمية المطلوبة {requested}، والمتاح في هذا الموقع {available} فقط عبر كل الدُفعات.',

  // ---- generic fallbacks ----
  'VALIDATION.INVALID_INPUT': 'البيانات المُدخلة غير صحيحة. يرجى مراجعة الحقول والمحاولة مرة أخرى.',
  'UNEXPECTED.INTERNAL_ERROR': 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني.',
};

/** Fallback text for a `code` with no catalog entry — see file header. */
const FALLBACK_MESSAGE = AR_MESSAGES['UNEXPECTED.INTERNAL_ERROR'];

export function formatArMessage(code: string, params: Record<string, string | number> = {}): string {
  const template = AR_MESSAGES[code] ?? FALLBACK_MESSAGE;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}
