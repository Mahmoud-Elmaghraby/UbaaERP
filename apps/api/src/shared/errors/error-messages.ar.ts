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
  'PRODUCT.IN_USE': 'لا يمكن حذف المنتج لوجود حركات مخزون أو مستندات مرتبطة به — يمكنك إيقافه بدلًا من حذفه.',
  'PRODUCT.UNIT_LOCKED_BY_STOCK': 'لا يمكن تغيير وحدة القياس لمنتج له حركات مخزون مسجلة.',
  'PRODUCT.TRACKING_LOCKED_BY_STOCK': 'لا يمكن تغيير نوع التتبع (دفعات/أرقام تسلسلية) لمنتج له حركات مخزون مسجلة.',
  'UNIT_OF_MEASURE.IN_USE': 'لا يمكن حذف وحدة القياس لأنها مستخدمة في منتجات أو وحدات أخرى.',
  'WAREHOUSE.IN_USE': 'لا يمكن حذف المستودع لوجود مخزون أو مستندات مرتبطة به.',
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
  'STOCK_MOVEMENT.UNIT_COST_NEGATIVE': 'لا يمكن أن تكون تكلفة الوحدة في حركة المخزون بالسالب.',
  'STOCK_MOVEMENT.SERIAL_ALREADY_IN_STOCK': 'الرقم التسلسلي "{serialNumber}" موجود بالفعل في المخزون.',
  'STOCK_MOVEMENT.INSUFFICIENT_STOCK':
    'المخزون غير كافٍ: الكمية المطلوبة {requested}، والمتاح في هذا الموقع {available} فقط.',
  'STOCK_MOVEMENT.SERIAL_ISSUE_QTY_MUST_BE_ONE':
    'المنتجات ذات التتبع بالرقم التسلسلي يجب صرفها بكمية واحدة فقط (=1) لكل حركة.',
  'STOCK_MOVEMENT.INSUFFICIENT_LOT_STOCK':
    'المخزون غير كافٍ في الدُفعة المحددة: الكمية المطلوبة {requested}، والمتاح في هذا الموقع {available} فقط.',
  'STOCK_MOVEMENT.INSUFFICIENT_LOT_TRACKED_STOCK':
    'المخزون غير كافٍ عبر جميع الدُفعات: الكمية المطلوبة {requested}، والمتاح في هذا الموقع {available} فقط عبر كل الدُفعات.',

  // ---- Purchases module ----
  'SUPPLIER.DUPLICATE_CODE': 'يوجد مورّد آخر بنفس الرمز "{value}" بالفعل.',
  'RFQ.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي طلب عرض السعر (RFQ) على سطر واحد على الأقل.',
  'RFQ.AT_LEAST_ONE_SUPPLIER_REQUIRED': 'يجب دعوة مورّد واحد على الأقل لتقديم عرض سعر على طلب عرض السعر (RFQ).',
  'RFQ.SOURCE_REQUISITION_NOT_APPROVED':
    'طلب الشراء "{id}" في حالة "{status}"، وليس "معتمد" — لا يمكن إنشاء طلب عرض سعر إلا من طلب شراء معتمد.',
  'RFQ.LINE_OR_SUPPLIER_NOT_FOUND': 'أحد أنواع المنتجات أو الموردين المحددين غير موجود.',
  'RFQ.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لطلبات عروض الأسعار بعد. يرجى إنشاء تسلسل لنوع المستند "request_for_quotation" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'RFQ.NOT_EDITABLE': 'طلب عرض السعر "{id}" في حالة "{status}" ولم يعد قابلاً للتعديل.',
  'RFQ.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل طلب عرض السعر "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'RFQ.NOT_DELETABLE': 'طلب عرض السعر "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'RFQ.HAS_SUPPLIER_QUOTATIONS': 'لا يمكن حذف طلب عرض السعر "{id}" — توجد عروض أسعار من الموردين مرتبطة به بالفعل.',
  'SUPPLIER_QUOTATION.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي عرض سعر المورّد على سطر واحد على الأقل.',
  'SUPPLIER_QUOTATION.RFQ_NOT_SENT':
    'طلب عرض السعر "{rfqId}" في حالة "{status}"، وليس "مُرسل" — لا يمكن تسجيل عرض سعر إلا لطلب تم إرساله فعليًا للموردين.',
  'SUPPLIER_QUOTATION.SUPPLIER_NOT_INVITED':
    'المورّد "{supplierId}" لم تتم دعوته لتقديم عرض سعر على طلب عرض السعر "{rfqId}".',
  'SUPPLIER_QUOTATION.ALREADY_EXISTS_FOR_SUPPLIER':
    'المورّد "{supplierId}" لديه بالفعل عرض سعر مسجل على طلب عرض السعر "{rfqId}" — يرجى تعديله بدلاً من إنشاء عرض جديد.',
  'SUPPLIER_QUOTATION.NOT_EDITABLE': 'عرض سعر المورّد "{id}" في حالة "{status}" ولم يعد قابلاً للتعديل.',
  'SUPPLIER_QUOTATION.NOT_SELECTABLE':
    'عرض سعر المورّد "{id}" في حالة "{status}"، وليس "مستلم" — يمكن اختيار العروض المعلّقة فقط.',
  'SUPPLIER_QUOTATION.NOT_REJECTABLE':
    'عرض سعر المورّد "{id}" في حالة "{status}"، وليس "مستلم" — يمكن رفض العروض المعلّقة فقط.',
  'SUPPLIER_QUOTATION.NOT_DELETABLE': 'عرض سعر المورّد "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'PURCHASE_ORDER.AMBIGUOUS_SOURCE': 'يجب تحديد إما عرض سعر مصدر (sourceQuotationId) أو مورّد وسطور مباشرة — وليس كليهما معًا.',
  'PURCHASE_ORDER.SOURCE_QUOTATION_NOT_SELECTED':
    'عرض سعر المورد "{id}" في حالة "{status}"، وليس "مختار" — لا يمكن إنشاء أمر شراء إلا من عرض سعر تم اختياره.',
  'PURCHASE_ORDER.MISSING_SOURCE': 'يجب تحديد عرض سعر مصدر، أو مورّد مع سطر واحد على الأقل، لإنشاء أمر شراء.',
  'PURCHASE_ORDER.MULTIPLE_CURRENCIES': 'تعذّر إنشاء المستند: {reason}',
  'PURCHASE_ORDER.MULTI_CURRENCY_DISABLED':
    'لا يمكن استخدام عملة "{currency}" لأن عملة هذا المستأجر هي "{tenantCurrency}" — يجب تفعيل تعدد العملات من الإعدادات ← الموديولات أولًا.',
  'PURCHASE_ORDER.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لأوامر الشراء بعد. يرجى إنشاء تسلسل لنوع المستند "purchase_order" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'PURCHASE_ORDER.NOT_EDITABLE': 'أمر الشراء "{id}" في حالة "{status}" ولم يعد قابلاً للتعديل.',
  'PURCHASE_ORDER.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي أمر الشراء على سطر واحد على الأقل.',
  'PURCHASE_ORDER.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل أمر الشراء "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'PURCHASE_ORDER.NOT_DELETABLE': 'أمر الشراء "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'PURCHASE_REQUISITION.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي طلب الشراء على سطر واحد على الأقل.',
  'PURCHASE_REQUISITION.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لطلبات الشراء بعد. يرجى إنشاء تسلسل لنوع المستند "purchase_requisition" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'PURCHASE_REQUISITION.NOT_EDITABLE':
    'طلب الشراء "{id}" في حالة "{status}" ولم يعد قابلاً للتعديل — يمكن تعديل الطلبات في حالة المسودة فقط.',
  'PURCHASE_REQUISITION.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل طلب الشراء "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'PURCHASE_REQUISITION.NOT_DELETABLE':
    'طلب الشراء "{id}" في حالة "{status}" ولا يمكن حذفه — يمكن حذف الطلبات في حالة المسودة أو الملغاة فقط.',
  'PURCHASE_RETURN.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي مرتجع الشراء على سطر واحد على الأقل.',
  'PURCHASE_RETURN.GOODS_RECEIPT_NOT_CONFIRMED':
    'إذن الاستلام "{id}" في حالة "{status}" — لا يمكن إرجاع بضاعة إلا مقابل إذن استلام مؤكد (وصل فعليًا إلى المخزون).',
  'PURCHASE_RETURN.RECEIPT_LINE_NOT_FOUND': 'سطر إذن الاستلام "{lineId}" غير موجود ضمن إذن الاستلام "{goodsReceiptId}".',
  'PURCHASE_RETURN.QUANTITY_EXCEEDS_REMAINING':
    'لا يمكن إرجاع {quantityReturned} مقابل سطر إذن الاستلام "{lineId}" — المتبقي القابل للإرجاع {remaining} فقط (المستلم {quantityReceived}، تم إرجاع {returned} سابقًا).',
  'PURCHASE_RETURN.RECEIPT_OR_LINE_NOT_FOUND': 'إذن الاستلام أو سطره المحدد غير موجود.',
  'PURCHASE_RETURN.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لمرتجعات الشراء بعد. يرجى إنشاء تسلسل لنوع المستند "purchase_return" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'PURCHASE_RETURN.NOT_CONFIRMABLE': 'لا يمكن تأكيد مرتجع الشراء "{id}" من حالته الحالية "{status}" (متوقع "مسودة").',
  'PURCHASE_RETURN.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل مرتجع الشراء "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'PURCHASE_RETURN.NOT_DELETABLE': 'مرتجع الشراء "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'GOODS_RECEIPT.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي إذن استلام البضاعة على سطر واحد على الأقل.',
  'GOODS_RECEIPT.PURCHASE_ORDER_NOT_RECEIVABLE':
    'أمر الشراء "{id}" في حالة "{status}" — لا يمكن استلام بضاعة إلا مقابل أمر شراء مؤكد (أو مستلم جزئيًا).',
  'GOODS_RECEIPT.PURCHASE_ORDER_LINE_NOT_FOUND': 'سطر أمر الشراء "{lineId}" غير موجود ضمن أمر الشراء "{purchaseOrderId}".',
  'GOODS_RECEIPT.QUANTITY_EXCEEDS_REMAINING':
    'لا يمكن استلام {quantityReceived} مقابل سطر أمر الشراء "{lineId}" — المتبقي القابل للاستلام {remaining} فقط (الكمية المطلوبة {ordered}، تم استلام {received} سابقًا).',
  'GOODS_RECEIPT.PO_OR_LINE_OR_WAREHOUSE_NOT_FOUND': 'أمر الشراء أو سطر أمر الشراء أو المستودع المحدد غير موجود.',
  'GOODS_RECEIPT.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لأذون استلام البضاعة بعد. يرجى إنشاء تسلسل لنوع المستند "goods_receipt" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'GOODS_RECEIPT.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل إذن الاستلام "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'GOODS_RECEIPT.NOT_CONFIRMABLE': 'لا يمكن تأكيد إذن الاستلام "{id}" من حالته الحالية "{status}" (متوقع "مسودة").',
  'GOODS_RECEIPT.NOT_DELETABLE': 'إذن الاستلام "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'PURCHASE_INVOICE.MISSING_DIRECT_SOURCE':
    'يجب تحديد أمر شراء، أو مورّد مع سطر مباشر واحد على الأقل، لإنشاء فاتورة شراء.',
  'PURCHASE_INVOICE.AMBIGUOUS_SOURCE': 'يجب تحديد إما أمر شراء وسطوره أو مورّد وسطور مباشرة — وليس كليهما معًا.',
  'PURCHASE_INVOICE.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن تحتوي فاتورة الشراء على سطر واحد على الأقل.',
  'PURCHASE_INVOICE.PURCHASE_ORDERS_REQUIRED':
    'ميزة أوامر الشراء مفعّلة لهذا المستأجر — يجب إنشاء أمر شراء أولاً ثم إصدار الفاتورة عليه.',
  'PURCHASE_INVOICE.PURCHASE_ORDER_NOT_INVOICEABLE':
    'أمر الشراء "{id}" في حالة "{status}" — يمكن إصدار فاتورة فقط لأمر شراء مؤكد.',
  'PURCHASE_INVOICE.PURCHASE_ORDER_LINE_NOT_FOUND': 'سطر أمر الشراء "{lineId}" غير موجود ضمن أمر الشراء "{purchaseOrderId}".',
  'PURCHASE_INVOICE.QUANTITY_EXCEEDS_REMAINING':
    'لا يمكن إصدار فاتورة بكمية {quantityInvoiced} مقابل سطر أمر الشراء "{lineId}" — المتبقي القابل للفوترة {remaining} فقط (الكمية المطلوبة {ordered}، تم فوترة {invoiced} سابقًا).',
  'PURCHASE_INVOICE.MULTIPLE_CURRENCIES': 'تعذّر إنشاء المستند: {reason}',
  'PURCHASE_INVOICE.MULTI_CURRENCY_DISABLED':
    'لا يمكن استخدام عملة "{currency}" لأن عملة هذا المستأجر هي "{tenantCurrency}" — يجب تفعيل تعدد العملات من الإعدادات ← الموديولات أولًا.',
  'PURCHASE_INVOICE.WAREHOUSE_REQUIRED':
    'ميزة أذون استلام البضاعة معطّلة لهذا المستأجر، لذا يجب أن تسجّل هذه الفاتورة حركة المخزون التي كان سيسجلها إذن الاستلام — يرجى تحديد المستودع (warehouseId).',
  'PURCHASE_INVOICE.SOURCE_NOT_FOUND': 'أمر الشراء أو سطره أو المورّد أو المستودع المحدد غير موجود.',
  'PURCHASE_INVOICE.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لفواتير الشراء بعد. يرجى إنشاء تسلسل لنوع المستند "purchase_invoice" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'PURCHASE_INVOICE.NOT_POSTABLE': 'لا يمكن ترحيل فاتورة الشراء "{id}" من حالتها الحالية "{status}" (متوقع "مسودة").',
  'PURCHASE_INVOICE.NO_LINES': 'فاتورة الشراء "{id}" لا تحتوي على أي سطور ولا يمكن ترحيلها.',
  'PURCHASE_INVOICE.NOT_CANCELLABLE':
    'لا يمكن إلغاء فاتورة الشراء "{id}" من حالتها الحالية "{status}" (متوقع "مسودة") — الفاتورة المرحّلة مستند محاسبي نهائي؛ عكسها يتطلب قيدًا عكسيًا محاسبيًا حقيقيًا، لا إلغاءً بسيطًا.',
  'PURCHASE_INVOICE.NOT_DELETABLE': 'فاتورة الشراء "{id}" في حالة "{status}" ولا يمكن حذفها.',

  // ---- Sales module ----
  'CUSTOMER.DUPLICATE_CODE': 'يوجد عميل آخر بنفس الرمز "{value}" بالفعل.',
  'CUSTOMER.CANNOT_DELETE_SYSTEM_DEFAULT': 'العميل "{name}" هو عميل "زائر" الافتراضي في النظام ولا يمكن حذفه.',
  'ETA_CREDENTIALS.MISSING_REQUIRED_FIELDS': 'لا يمكن تفعيل الفوترة الإلكترونية (ETA): الحقول التالية ناقصة: {missing}.',
  'QUOTATION.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي عرض السعر على سطر واحد على الأقل.',
  'QUOTATION.MULTIPLE_CURRENCIES': 'تعذّر إنشاء المستند: {reason}',
  'QUOTATION.MULTI_CURRENCY_DISABLED':
    'لا يمكن استخدام عملة "{currency}" لأن عملة هذا المستأجر هي "{tenantCurrency}" — يجب تفعيل تعدد العملات من الإعدادات ← الموديولات أولًا.',
  'QUOTATION.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لعروض الأسعار بعد. يرجى إنشاء تسلسل لنوع المستند "quotation" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'QUOTATION.NOT_EDITABLE': 'عرض السعر "{id}" في حالة "{status}" ولم يعد قابلاً للتعديل.',
  'QUOTATION.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل عرض السعر "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'QUOTATION.NOT_DELETABLE': 'عرض السعر "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'SALES_ORDER.AMBIGUOUS_SOURCE':
    'يجب تحديد إما عرض سعر مصدر (sourceQuotationId) أو عميل وسطور مباشرة — وليس كليهما معًا.',
  'SALES_ORDER.SOURCE_QUOTATION_NOT_ACCEPTED':
    'عرض السعر "{id}" في حالة "{status}"، وليس "مقبول" — لا يمكن إنشاء أمر بيع إلا من عرض سعر مقبول.',
  'SALES_ORDER.MISSING_SOURCE': 'يجب تحديد عرض سعر مصدر، أو عميل مع سطر واحد على الأقل، لإنشاء أمر بيع.',
  'SALES_ORDER.MULTIPLE_CURRENCIES': 'تعذّر إنشاء المستند: {reason}',
  'SALES_ORDER.MULTI_CURRENCY_DISABLED':
    'لا يمكن استخدام عملة "{currency}" لأن عملة هذا المستأجر هي "{tenantCurrency}" — يجب تفعيل تعدد العملات من الإعدادات ← الموديولات أولًا.',
  'SALES_ORDER.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لأوامر البيع بعد. يرجى إنشاء تسلسل لنوع المستند "sales_order" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'SALES_ORDER.INVALID_DISCOUNT': 'تعذّر تطبيق الخصم: {reason}',
  'SALES_ORDER.NOT_EDITABLE': 'أمر البيع "{id}" في حالة "{status}" ولم يعد قابلاً للتعديل.',
  'SALES_ORDER.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي أمر البيع على سطر واحد على الأقل.',
  'SALES_ORDER.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل أمر البيع "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'SALES_ORDER.NOT_DELETABLE': 'أمر البيع "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'SALES_RETURN.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي مرتجع البيع على سطر واحد على الأقل.',
  'SALES_RETURN.DELIVERY_NOT_CONFIRMED':
    'إذن التسليم "{id}" في حالة "{status}" — لا يمكن إرجاع بضاعة إلا مقابل إذن تسليم مؤكد (تم شحنه فعليًا).',
  'SALES_RETURN.DELIVERY_LINE_NOT_FOUND': 'سطر إذن التسليم "{lineId}" غير موجود ضمن إذن التسليم "{deliveryId}".',
  'SALES_RETURN.QUANTITY_EXCEEDS_REMAINING':
    'لا يمكن إرجاع {quantityReturned} مقابل سطر إذن التسليم "{lineId}" — المتبقي القابل للإرجاع {remaining} فقط (تم تسليم {quantityDelivered}، تم إرجاع {returned} سابقًا).',
  'SALES_RETURN.DELIVERY_OR_LINE_NOT_FOUND': 'إذن التسليم أو سطره المحدد غير موجود.',
  'SALES_RETURN.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لمرتجعات البيع بعد. يرجى إنشاء تسلسل لنوع المستند "sales_return" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'SALES_RETURN.NOT_CONFIRMABLE': 'لا يمكن تأكيد مرتجع البيع "{id}" من حالته الحالية "{status}" (متوقع "مسودة").',
  'SALES_RETURN.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل مرتجع البيع "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'SALES_RETURN.NOT_DELETABLE': 'مرتجع البيع "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'DELIVERY.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي إذن التسليم على سطر واحد على الأقل.',
  'DELIVERY.SALES_ORDER_NOT_DELIVERABLE':
    'أمر البيع "{id}" في حالة "{status}" — يمكن تسليم البضاعة فقط مقابل أمر بيع مؤكد (أو مُسلَّم جزئيًا).',
  'DELIVERY.SALES_ORDER_LINE_NOT_FOUND': 'سطر أمر البيع "{lineId}" غير موجود ضمن أمر البيع "{salesOrderId}".',
  'DELIVERY.QUANTITY_EXCEEDS_REMAINING':
    'لا يمكن تسليم {quantityDelivered} مقابل سطر أمر البيع "{lineId}" — المتبقي القابل للتسليم {remaining} فقط (الكمية المطلوبة {ordered}، تم تسليم {delivered} سابقًا).',
  'DELIVERY.SALES_ORDER_OR_LINE_OR_WAREHOUSE_NOT_FOUND': 'أمر البيع أو سطره أو المستودع المحدد غير موجود.',
  'DELIVERY.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لأذون التسليم بعد. يرجى إنشاء تسلسل لنوع المستند "delivery" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'DELIVERY.INVALID_STATUS_TRANSITION':
    'لا يمكن نقل إذن التسليم "{id}" إلى الحالة "{to}" من حالته الحالية "{from}" (الحالات المتوقعة: {expected}).',
  'DELIVERY.NOT_CONFIRMABLE': 'لا يمكن تأكيد إذن التسليم "{id}" من حالته الحالية "{status}" (متوقع "مسودة").',
  'DELIVERY.NOT_DELETABLE': 'إذن التسليم "{id}" في حالة "{status}" ولا يمكن حذفه.',
  'SALES_CREDIT_NOTE.DELIVERY_LINE_NOT_FOUND':
    'سطر إذن التسليم "{lineId}" المرتبط بسطر مرتجع البيع "{returnLineId}" غير موجود.',
  'SALES_CREDIT_NOTE.SALES_ORDER_LINE_NOT_FOUND':
    'سطر أمر البيع "{lineId}" المرتبط بسطر إذن التسليم "{deliveryLineId}" غير موجود.',
  'SALES_CREDIT_NOTE.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن يحتوي إشعار الدائن على سطر واحد على الأقل.',
  'SALES_CREDIT_NOTE.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لإشعارات الدائن بعد. يرجى إنشاء تسلسل لنوع المستند "sales_credit_note" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'PAYMENT.ALLOCATION_CURRENCY_MISMATCH':
    'عملة التخصيص "{allocationCurrency}" لا تطابق عملة الدفعة نفسها "{paymentCurrency}" — لا يدعم هذا النظام تحويل العملات.',
  'PAYMENT.ALLOCATION_EXCEEDS_AVAILABLE':
    'إجمالي المبلغ المخصَّص ({requested}) يتجاوز المبلغ المتاح للتخصيص ({available}).',
  'PAYMENT.INVOICE_NOT_POSTED': 'فاتورة البيع "{id}" في حالة "{status}" — يمكن استلام دفعة فقط مقابل فاتورة مرحّلة.',
  'PAYMENT.INVOICE_CUSTOMER_MISMATCH': 'فاتورة البيع "{invoiceId}" لا تخص العميل "{customerId}".',
  'PAYMENT.INVOICE_CURRENCY_MISMATCH': 'عملة التخصيص "{requestedCurrency}" لا تطابق عملة فاتورة البيع "{invoiceCurrency}".',
  'PAYMENT.ALLOCATION_EXCEEDS_OUTSTANDING':
    'لا يمكن تخصيص {requested} لفاتورة البيع — المتبقي المستحق {outstanding} فقط (الإجمالي {total}، تم سداد {alreadyPaid} سابقًا).',
  'PAYMENT.CUSTOMER_OR_INVOICE_NOT_FOUND': 'العميل أو فاتورة البيع المحددة غير موجودة.',
  'PAYMENT.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد للدفعات المستلمة بعد. يرجى إنشاء تسلسل لنوع المستند "payment_received" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'PAYMENT.NOT_POSTABLE': 'لا يمكن ترحيل الدفعة "{id}" من حالتها الحالية "{status}" (متوقع "مسودة").',
  'PAYMENT.AT_LEAST_ONE_ALLOCATION_REQUIRED': 'يجب تحديد تخصيص واحد على الأقل.',
  'PAYMENT.NOT_ALLOCATABLE':
    'لا يمكن تخصيص الدفعة "{id}" — التخصيص متاح فقط للدفعات المرحّلة (الحالة الحالية "{status}").',
  'PAYMENT.NOT_CANCELLABLE':
    'لا يمكن إلغاء الدفعة "{id}" من حالتها الحالية "{status}" (متوقع "مسودة") — الدفعة المرحّلة مستند محاسبي نهائي؛ عكسها يتطلب قيدًا عكسيًا محاسبيًا حقيقيًا، لا إلغاءً بسيطًا.',
  'PAYMENT.NOT_DELETABLE': 'الدفعة "{id}" في حالة "{status}" ولا يمكن حذفها.',
  'POS_SESSION.CASHIER_ALREADY_HAS_OPEN_SESSION':
    'هذا الكاشير لديه بالفعل جلسة نقطة بيع مفتوحة ("{sessionId}"، فُتحت في {openedAt}). يجب إغلاقها قبل فتح جلسة جديدة.',
  'POS_SESSION.OPENING_CASH_NEGATIVE': 'لا يمكن أن يكون مبلغ النقدية الافتتاحي سالبًا.',
  'POS_SESSION.WAREHOUSE_REQUIRED':
    'يجب تحديد مستودع لفتح جلسة نقطة بيع (عملية البيع في المرحلة الثالثة تسحب المخزون منه).',
  'POS_SESSION.NOT_CLOSABLE': 'لا يمكن إغلاق جلسة نقطة البيع "{id}" — حالتها الحالية "{status}" بالفعل.',
  'POS_SESSION.COUNTED_CASH_NEGATIVE': 'لا يمكن أن يكون مبلغ النقدية المعدود سالبًا.',
  'POS_SALE.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن تحتوي عملية البيع على سطر واحد على الأقل.',
  'POS_SALE.AT_LEAST_ONE_TENDER_REQUIRED': 'يجب تحديد وسيلة دفع واحدة على الأقل لإتمام عملية البيع.',
  'POS_SALE.SESSION_NOT_OPEN':
    'جلسة نقطة البيع "{id}" في حالة "{status}" — يمكن إتمام عملية بيع فقط في جلسة مفتوحة.',
  'POS_SALE.SESSION_MISSING_WAREHOUSE':
    'جلسة نقطة البيع "{id}" ليس لها مستودع محدد ولا يمكن إتمام عملية بيع من خلالها. يرجى إغلاقها وفتح جلسة جديدة.',
  'POS_SALE.MULTIPLE_CURRENCIES': 'تعذّر إتمام عملية البيع: {reason}',
  'POS_SALE.INVALID_DISCOUNT': 'تعذّر تطبيق الخصم: {reason}',
  'POS_SALE.TENDERED_TOTAL_MISMATCH': 'المبلغ المدفوع ({tendered}) لا يطابق إجمالي عملية البيع ({total}).',
  'POS_SALE.NO_WALK_IN_CUSTOMER':
    'لا يوجد عميل "زائر" افتراضي مُعد لهذا المستأجر. يرجى تشغيل أمر db:seed-walk-in-customer، أو تحديد معرّف عميل (customerId) صراحةً.',
  'SALES_INVOICE.MISSING_DIRECT_SOURCE':
    'يجب تحديد أمر بيع، أو عميل مع سطر مباشر واحد على الأقل، لإنشاء فاتورة بيع.',
  'SALES_INVOICE.AMBIGUOUS_SOURCE': 'يجب تحديد إما أمر بيع وسطوره أو عميل وسطور مباشرة — وليس كليهما معًا.',
  'SALES_INVOICE.AT_LEAST_ONE_LINE_REQUIRED': 'يجب أن تحتوي فاتورة البيع على سطر واحد على الأقل.',
  'SALES_INVOICE.SALES_ORDERS_REQUIRED':
    'ميزة أوامر البيع مفعّلة لهذا المستأجر — يجب إنشاء أمر بيع أولاً ثم إصدار الفاتورة عليه.',
  'SALES_INVOICE.SALES_ORDER_NOT_INVOICEABLE':
    'أمر البيع "{id}" في حالة "{status}" — يمكن إصدار فاتورة فقط لأمر بيع مؤكد.',
  'SALES_INVOICE.SALES_ORDER_LINE_NOT_FOUND': 'سطر أمر البيع "{lineId}" غير موجود ضمن أمر البيع "{salesOrderId}".',
  'SALES_INVOICE.QUANTITY_EXCEEDS_REMAINING':
    'لا يمكن إصدار فاتورة بكمية {quantityInvoiced} مقابل سطر أمر البيع "{lineId}" — المتبقي القابل للفوترة {remaining} فقط (الكمية المطلوبة {ordered}، تم فوترة {invoiced} سابقًا).',
  'SALES_INVOICE.MULTIPLE_CURRENCIES': 'تعذّر إنشاء المستند: {reason}',
  'SALES_INVOICE.MULTI_CURRENCY_DISABLED':
    'لا يمكن استخدام عملة "{currency}" لأن عملة هذا المستأجر هي "{tenantCurrency}" — يجب تفعيل تعدد العملات من الإعدادات ← الموديولات أولًا.',
  'SALES_INVOICE.WAREHOUSE_REQUIRED':
    'ميزة أذون التسليم معطّلة لهذا المستأجر، لذا يجب أن تسجّل هذه الفاتورة حركة المخزون التي كان سيسجلها إذن التسليم — يرجى تحديد المستودع (warehouseId).',
  'SALES_INVOICE.SOURCE_NOT_FOUND': 'أمر البيع أو سطره أو العميل أو المستودع المحدد غير موجود.',
  'SALES_INVOICE.NO_NUMBERING_SEQUENCE':
    'لا يوجد تسلسل ترقيم مُعد لفواتير البيع بعد. يرجى إنشاء تسلسل لنوع المستند "sales_invoice" من الإعدادات ← تسلسلات الترقيم أولاً.',
  'SALES_INVOICE.NOT_POSTABLE': 'لا يمكن ترحيل فاتورة البيع "{id}" من حالتها الحالية "{status}" (متوقع "مسودة").',
  'SALES_INVOICE.NO_LINES': 'فاتورة البيع "{id}" لا تحتوي على أي سطور ولا يمكن ترحيلها.',
  'SALES_INVOICE.NOT_CANCELLABLE':
    'لا يمكن إلغاء فاتورة البيع "{id}" من حالتها الحالية "{status}" (متوقع "مسودة") — الفاتورة المرحّلة مستند محاسبي نهائي؛ عكسها يتطلب قيدًا عكسيًا محاسبيًا حقيقيًا، لا إلغاءً بسيطًا.',
  'SALES_INVOICE.NOT_DELETABLE': 'فاتورة البيع "{id}" في حالة "{status}" ولا يمكن حذفها.',

  // ---- Accounting module ----
  'CHART_OF_ACCOUNT.DUPLICATE_CODE': 'يوجد حساب آخر بنفس الرمز "{value}" بالفعل.',
  'CHART_OF_ACCOUNT.PARENT_NOT_GROUP': '"{code} — {name}" ليس حساب مجموعة (تجميعي) ولا يمكن أن يحتوي على حسابات فرعية.',
  'CHART_OF_ACCOUNT.CANNOT_DEACTIVATE_ROOT': '"{code} — {name}" هو أحد الحسابات الجذرية الخمسة ولا يمكن إلغاء تفعيله.',
  'CHART_OF_ACCOUNT.CANNOT_DELETE_ROOT': '"{code} — {name}" هو حساب جذري ولا يمكن حذفه.',
  'CHART_OF_ACCOUNT.HAS_CHILD_ACCOUNTS':
    '"{code} — {name}" لا يزال يحتوي على {count} حساب فرعي — يرجى نقلها أو حذفها أولاً.',
  'CHART_OF_ACCOUNT.REFERENCED_ELSEWHERE': '"{code} — {name}" مُستخدم في مكان آخر بالنظام ولا يمكن حذفه.',
  'CHART_OF_ACCOUNT.CANNOT_POST_TO_GROUP':
    '"{code} — {name}" هو حساب مجموعة (تجميعي) في دليل الحسابات ولا يمكن الترحيل إليه مباشرة — يرجى الترحيل إلى أحد حساباته الفرعية.',
  'CHART_OF_ACCOUNT.INACTIVE': '"{code} — {name}" غير مفعّل ولا يمكن الترحيل إليه.',
  'ACCOUNTING_PERIOD.ALREADY_CLOSED': 'الفترة المحاسبية "{name}" مغلقة بالفعل.',
  'ACCOUNTING_PERIOD.ALREADY_OPEN': 'الفترة المحاسبية "{name}" مفتوحة بالفعل.',
  'ACCOUNTING_PERIOD.NO_PERIOD_FOR_DATE':
    'لا توجد فترة محاسبية تغطي تاريخ {date} — يرجى إعداد سنة مالية تغطي هذا التاريخ أولاً.',
  'ACCOUNTING_PERIOD.CLOSED': 'الفترة المحاسبية "{name}" مغلقة — لا يمكن ترحيل قيد بتاريخ {date}.',
  'FISCAL_YEAR.END_BEFORE_START': 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.',
  'FISCAL_YEAR.DATE_RANGE_OVERLAPS': 'هذا النطاق الزمني يتداخل مع سنة مالية موجودة بالفعل.',
  'FISCAL_YEAR.ALREADY_CLOSED': 'السنة المالية "{name}" مغلقة بالفعل.',
  'FISCAL_YEAR.PERIODS_STILL_OPEN':
    'لا يمكن إغلاق السنة المالية "{name}" — {count} من فتراتها المحاسبية لا تزال مفتوحة. يرجى إغلاق كل فترة أولاً.',
  'FISCAL_YEAR.ALREADY_OPEN': 'السنة المالية "{name}" مفتوحة بالفعل.',
  'FISCAL_YEAR.CANNOT_DELETE_TOUCHED':
    'لا يمكن حذف السنة المالية "{name}" — تم إغلاقها هي أو إحدى فتراتها في وقت ما بالفعل.',
  'COST_CENTER.DUPLICATE_CODE': 'يوجد مركز تكلفة آخر بنفس الرمز "{value}" بالفعل.',
  'BANK_ACCOUNT.CHART_OF_ACCOUNT_ALREADY_LINKED':
    'يوجد حساب بنكي آخر مرتبط بالفعل بهذا الحساب في دليل الحسابات — كل حساب أستاذ عام يمكن أن يدعم حسابًا بنكيًا واحدًا فقط.',
  'BANK_ACCOUNT.LINE_NOT_ON_ACCOUNT': 'سطر القيد المحاسبي "{lineId}" ليس سطرًا مُرحّلاً على الحساب المرتبط بالحساب البنكي "{name}".',
  'JOURNAL_ENTRY.AT_LEAST_TWO_LINES_REQUIRED': 'يجب أن يحتوي القيد المحاسبي على سطرين على الأقل ليتوازن.',
  'JOURNAL_ENTRY.LINE_MUST_HAVE_ONE_SIDE':
    'يجب أن يحتوي كل سطر في القيد المحاسبي على مبلغ مدين أو دائن واحد فقط — وليس كليهما، ولا يجب أن يكونا فارغين.',
  'JOURNAL_ENTRY.NOT_BALANCED':
    'هذا القيد غير متوازن — إجمالي المدين {totalDebit} {currency}، وإجمالي الدائن {totalCredit} {currency}.',
  'JOURNAL_ENTRY.NOT_EDITABLE': 'القيد المحاسبي "{entryNumber}" في حالة "{status}" ولم يعد قابلاً للتعديل.',
  'JOURNAL_ENTRY.NOT_POSTABLE': 'القيد المحاسبي "{entryNumber}" في حالة "{status}" — يمكن ترحيل المسودات فقط.',
  'JOURNAL_ENTRY.POST_NOT_BALANCED': 'القيد المحاسبي "{entryNumber}" غير متوازن ولا يمكن ترحيله.',
  'JOURNAL_ENTRY.NOT_CANCELLABLE':
    'القيد المحاسبي "{entryNumber}" في حالة "{status}" — يمكن إلغاء المسودات فقط. القيد المرحّل حقيقة محاسبية نهائية؛ يجب عكسه بدلاً من إلغائه.',
  'JOURNAL_ENTRY.NOT_REVERSIBLE': 'القيد المحاسبي "{entryNumber}" في حالة "{status}" — يمكن عكس القيود المرحّلة فقط.',
  'JOURNAL_ENTRY.NOT_DELETABLE': 'القيد المحاسبي "{entryNumber}" في حالة "{status}" ولا يمكن حذفه.',
  'JOURNAL_ENTRY.AUTO_ALREADY_PROCESSED':
    'القيد المحاسبي "{entryNumber}" (المُنشأ تلقائيًا لـ {sourceReferenceType} "{sourceReferenceId}") في حالة "{status}" — لا يمكن ترحيله تلقائيًا مرة أخرى.',
  'EXCHANGE_RATE.NOT_FOUND': 'سعر الصرف غير موجود.',
  'EXCHANGE_RATE.INVALID_CURRENCY_CODE': 'يجب أن يتكون رمز العملة من ثلاثة أحرف إنجليزية كبيرة وفق معيار ISO 4217.',
  'EXCHANGE_RATE.SAME_CURRENCY': 'لا يمكن أن يكون لعملة سعر صرف مقابل نفسها.',
  'EXCHANGE_RATE.RATE_NOT_POSITIVE': 'يجب أن يكون سعر الصرف رقمًا موجبًا.',
  'EXCHANGE_RATE.DUPLICATE_FOR_DATE': 'يوجد بالفعل سعر صرف من {from} إلى {to} بتاريخ {date}.',
  'EXCHANGE_RATE.NOT_AVAILABLE': 'لا يوجد سعر صرف متاح لتحويل {from} إلى {to} بتاريخ {date}.',
  'EXCHANGE_RATE.MULTI_CURRENCY_DISABLED': 'تعدد العملات غير مفعّل لهذا المستأجر — يجب تفعيله من الإعدادات ← الموديولات أولًا.',

  // ---- Users & Permissions module ----
  'USER.DUPLICATE_EMAIL': 'يوجد مستخدم آخر بنفس البريد الإلكتروني "{value}" بالفعل.',
  'USER.PASSWORD_TOO_SHORT': 'يجب أن تتكون كلمة المرور من {minLength} أحرف على الأقل.',
  'USER.CANNOT_DEACTIVATE_SELF': 'لا يمكنك إلغاء تفعيل حسابك الخاص.',
  'USER.CURRENT_PASSWORD_INCORRECT': 'كلمة المرور الحالية غير صحيحة.',
  'USER.CANNOT_BE_OWN_MANAGER': 'لا يمكن أن يكون المستخدم مديرًا لنفسه.',
  'ROLE.DUPLICATE_NAME': 'يوجد دور آخر بنفس الاسم "{name}" بالفعل.',
  'ROLE.CANNOT_DELETE_SYSTEM': '"{name}" دور نظامي ولا يمكن حذفه.',
  'ROLE.STILL_ASSIGNED': 'الدور "{name}" لا يزال مُسندًا إلى مستخدم واحد أو أكثر ولا يمكن حذفه.',
  'USER_BRANCH_ACCESS.INVALID_BRANCH_IDS': 'واحد أو أكثر من معرّفات الفروع غير موجود.',
  'AUTH.INVALID_CREDENTIALS': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'AUTH.INVALID_MFA_SESSION': 'جلسة التحقق غير صالحة أو منتهية الصلاحية — يرجى تسجيل الدخول مرة أخرى.',
  'AUTH.INVALID_VERIFICATION_CODE': 'رمز التحقق غير صحيح.',
  'AUTH.INVALID_REFRESH_TOKEN': 'رمز تجديد الجلسة غير صالح أو منتهي الصلاحية.',
  'AUTH.INVALID_ACTION_TOKEN': 'الرمز غير صالح أو منتهي الصلاحية.',
  'TWO_FACTOR.ALREADY_ENABLED': 'التحقق بخطوتين مفعّل بالفعل لهذا الحساب.',
  'TWO_FACTOR.SETUP_NOT_IN_PROGRESS': 'لا يوجد إعداد جارٍ للتحقق بخطوتين لهذا الحساب — يرجى بدء الإعداد أولاً.',

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
