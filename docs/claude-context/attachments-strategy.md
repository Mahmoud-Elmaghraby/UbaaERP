# استراتيجية بنية المرفقات المشتركة (Shared Attachments Infrastructure) — بحث + تصميم + تنفيذ Backend + Frontend

**الحالة:** ✅ **البند بالكامل (Backend + Frontend) منجز ومتحقَّق منه فعليًا على جهاز المستخدم** (2026-09-12). الـ Backend: `pnpm install`، `pnpm typecheck`، `pnpm --filter api test`، و`pnpm --filter web build` كلها نجحت، والـ migration `0071_create_attachments` اتطبقت بنجاح على كل الـ 6 تينانتس المحليين (`test_tenant`, `test_e2e_d521b93e82`, `test_integration_bd6519d738`, `demo`, `test_e2e_0242c856e3`, `test_integration_02788bd9b6`). الفرونت إند (`<AttachmentsPanel>`): `pnpm typecheck` و`pnpm --filter web build` نجحوا، والمستخدم جرّب رفع/تحميل/حذف ملف فعليًا في المتصفح. المستخدم أكّد الكل بـ "كله تمام" مرتين (مرة للـ backend، ومرة للفرونت إند). **لا حاجة لأي تحقق إضافي — هذا البند مغلق تمامًا.**

**السياق:** `claude/module-completeness-audit.md` رصد إن "رفع صورة المنتج عبر MinIO" (مذكورة في المستند الرئيسي كبند [مستقر] يبدأ مع موديول المخزون) أوسع بكتير من كونها خاصية خاصة بالمخزون — كل نظام ERP كبير بيتعامل مع "إرفاق ملف لأي سجل" كبنية تحتية أساسية مشتركة. المستخدم اختار هذا البند كخطوة تالية بعد إغلاق الثلاث خطوات الصغيرة (الإعدادات العامة، قائمة التدفقات النقدية، تناسق Outbox).

**ملاحظة مهمة اكتشفناها أثناء البحث:** `docker-compose.yml` في جذر المشروع بالفعل بيشغّل حاوية `minio` (بورت `9000`/`9001`). يعني MinIO مش قرار جديد نتخذه دلوقتي؛ هو أصلاً قرار [مستقر] في المستند الرئيسي، بس التكامل الفعلي معاه (كود يستخدمه) بدأ لأول مرة في هذه الخطوة.

## بحث تنافسي: إزاي أنظمة ERP الكبيرة بتبني ده

### Odoo — `ir.attachment`
جدول واحد عام، مرجع polymorphic بمفتاحين نصيين (`res_model` + `res_id`) بدل FK حقيقي — أي موديل يقدر يترفق له ملف من غير قائمة سماح (whitelist) على مستوى الداتابيز. تخزين الملفات الفعلي غالبًا على الـ filesystem تحت مسار مبني على اسم قاعدة البيانات نفسها، مفهرس بـ checksum (SHA1) عشان الملفات المتطابقة تتخزن مرة واحدة بس (dedup). دعم S3 مش أساسي في المنتج — بيجيله عن طريق إضافات مجتمعية (OCA).

### ERPNext / Frappe — `File` doctype
نفس نمط الـ polymorphic reference (`attached_to_doctype` + `attached_to_name`) + حقل `is_private`. التخزين المحلي على الـ disk افتراضيًا؛ دعم S3 برضه إضافة مجتمعية.

### SAP Business One
توثيق عام محدود جدًا — الإعداد بيتم من `Administration > System Initialization > General Settings > Path` (مسار مجلد مشترك على السيرفر). **غير مؤكد بما يكفي عشان نبني عليه قرار.**

### دوليبار (Dolibarr) — `llx_ecm_files`
ربط عن طريق شجرة مجلدات افتراضية (`fk_directory`) بدل مرجع مباشر، ملفات على الـ disk بمسار فعلي + checksum.

### أفضل الممارسات لعزل التخزين متعدد المستأجرين
ثلاث أنماط: (أ) bucket منفصل لكل تينانت — أقوى عزل، مش قابل للتوسع. (ب) bucket واحد مشترك + بادئة لكل تينانت — الأكثر شيوعًا في SaaS كبير. (ج) S3 Access Points — تعقيد إضافي مش لازم دلوقتي. **القرار المطبَّق: (ب)** — bucket واحد مشترك + بادئة = اسم schema التينانت في مفتاح الكائن.

### آلية تحميل الملفات (access control)
ثلاث طرق: proxy بالكامل، رابط presigned مؤقت، بوابة مصادقة منفصلة. **التوصية الأصلية كانت proxy، لكن المستخدم اختار presigned من الأول صراحةً** (انظر "القرارات المؤكَّدة" تحت).

### شكل جدول المرفقات المعتاد
الأعمدة الشائعة: `id`, نوع الكيان + معرّفه (polymorphic), اسم الملف, mime type, الحجم, مفتاح التخزين, مين رفعه, تاريخ الرفع. **مفيش نظام من التلاتة بيفرض whitelist لأنواع الكيانات** — نظامنا يتفوق عليهم بقائمة سماح صريحة (enum) مفروضة في الكود وكـ CHECK constraint في الداتابيز.

## القرارات المؤكَّدة من المستخدم (2026-09-12)

1. **النطاق:** كل السبع كيانات من النسخة الأولى: `sales_invoice`, `purchase_invoice`, `sales_order`, `purchase_order`, `product`, `supplier`, `customer`.
2. **آلية التحميل: روابط presigned، مش proxy.** الرفع (`POST /attachments`) بيعدي على الباكيند عادي (multipart، فحص صلاحية، رفع لـ MinIO، تسجيل ميتاداتا). التحميل (`GET /attachments/:id/download-url`) بيتحقق من الصلاحية ثم بيرجّع رابط presigned GET من MinIO، TTL = 5 دقايق (300 ثانية). **مقايضة مقبولة:** أي حد معاه الرابط قبل انتهائه يقدر يستخدمه من غير فحص صلاحية تاني.
3. **الصلاحيات:** إعادة استخدام صلاحية الموديول صاحب الكيان — `sales.manage` لـ sales_invoice/sales_order/customer، `purchases.manage` لـ purchase_invoice/purchase_order/supplier، `inventory.manage` لـ product. **مفيش صلاحية جديدة `attachments.manage`.**
4. **حدود الملف:** 10 ميجابايت كحد أقصى، `application/pdf` + `image/jpeg` + `image/png` + `image/webp` بس.

## ✅ منجز ومتحقَّق منه — الـ Backend بالكامل (2026-09-12)

### الملفات الجديدة (موديول `apps/api/src/modules/attachments/`)
- `domain/attachment.entity.ts` — `ATTACHMENT_ENTITY_TYPES` (المصدر الوحيد للحقيقة)، `ATTACHMENT_ENTITY_PERMISSIONS`، `ATTACHMENT_MAX_SIZE_BYTES`، `ATTACHMENT_ALLOWED_MIME_TYPES`، `ATTACHMENT_DOWNLOAD_URL_TTL_SECONDS`.
- `application/ports/attachment.repository.ts` + `attachment-storage.repository.ts` (بورتات Clean Architecture).
- `application/errors.ts` (إعادة تصدير من `shared/errors/domain-errors.ts`، نفس نمط كل موديول).
- `application/services/attachments.service.ts` — upload (فحص الحجم/النوع، بناء المفتاح، تنظيف الكائن اليتيم في MinIO لو فشلت كتابة الصف)، list، getById، getDownloadUrl، delete.
- `infrastructure/persistence/kysely-attachment.repository.ts` — Kysely، نفس نمط `KyselySupplierRepository`.
- `infrastructure/storage/minio-client.provider.ts` + `minio-attachment-storage.repository.ts` — أول تكامل فعلي مع MinIO في الكودبيز؛ `ensureBucketExists()` بتتنفذ في `onModuleInit()` (تحذير في الـ log لو MinIO مش متاح وقت الإقلاع، من غير ما توقف الإقلاع).
- `presentation/attachments.controller.ts` — `GET /attachments`، `POST /attachments` (multipart، `FileInterceptor`)، `GET /attachments/:id/download-url`، `DELETE /attachments/:id`. فحص الصلاحية إمبراطوري (`user.permissions.includes(...)`) لأن الصلاحية المطلوبة تعتمد على `entityType` وقت التشغيل — `PermissionsGuard` الثابت (Reflector-based) مش قادر يعبّر عن ده. **مفيش `PlanFeatureGuard`** — المرفقات بنية تحتية أساسية زي المخزون، مش موديول اختياري. **ملاحظة مهمة:** `GET /attachments` (list) بيفحص نفس الصلاحية برضه — يعني حتى عرض المرفقات محتاج الصلاحية، مش بس الرفع/الحذف.
- `attachments.module.ts` — مسجّل مباشرة في `AppModule` (مش تابع لموديول تجاري واحد).

### migration + عمود جديد
- `apps/api/src/database/tenant/migrations/0071_create_attachments.ts` — جدول `attachments` بـ CHECK constraints على `entity_type` (whitelist)، `mime_type` (whitelist)، `size_bytes` (0 < x ≤ 10MB)، وفهرس على `(entity_type, entity_id)`. **مفيش صلاحية جديدة تتضاف** (إعادة استخدام صلاحيات موجودة، قرار المستخدم رقم 3). **اتطبقت بنجاح على كل الـ 6 تينانتس المحليين.**
- `apps/api/src/database/tenant/kysely-client.ts` — أُضيف `AttachmentsTable` + دخوله في `TenantDatabase`.

### العقود (`libs/contracts/src/attachments/`)
`attachmentSchema`, `createAttachmentSchema`, `listAttachmentsQuerySchema`, `attachmentDownloadUrlSchema` — Zod، مع أنواع `AttachmentDto`, `AttachmentEntityTypeDto`, `CreateAttachmentDto`, `ListAttachmentsQueryDto`, `AttachmentDownloadUrlDto`. **قرار معماري تم حسمه أثناء التنفيذ:** بدل ما نستورد whitelist الكيانات من الدومين في `apps/api` (ممنوع أصلاً — قاعدة ESLint `boundaries` بتمنع `libs/*` من استيراد `apps/*`)، أو نضيفها في `libs/shared-kernel` (كنا هنحتاج نضيف dependency جديدة `contracts → shared-kernel` مفيش لها سابقة في الكودبيز — `money.contract.ts` نفسه بيعيد تعريف شكل مواز مستقل لـ `Money` بدل ما يستورد الكلاس)، **اتبعنا نفس نمط `money.contract.ts` القائم بالفعل:** نسخة Zod مستقلة من قائمة الكيانات في العقد، متزامنة يدويًا مع نسخة الدومين — موثّق في تعليق الملفين.

### إعدادات البيئة
`apps/api/.env.example` و`apps/api/src/shared/config/env.validation.ts` — أُضيفت متغيرات MinIO اختيارية (بنفس افتراضيات `docker-compose.yml`): `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_ATTACHMENTS_BUCKET`.

### dependencies جديدة
أُضيفت في `apps/api/package.json` مباشرة (تعذّر تشغيل `pnpm add` من الجلسة السحابية — `device_bash` كان معطل بسبب تحديث Windows)، وثبّتها المستخدم بنجاح عبر `pnpm install`:
- `minio` (^8.0.1) — dependency.
- `@types/multer` (^1.4.12) — devDependency (مطلوبة مباشرة كـ direct dependency بسبب عزل pnpm الصارم، حتى إن `@nestjs/platform-express` بيعتمد على `multer` نفسه transitively بالفعل).

### تعديلات على ملفات مشتركة
`entity-errors.ts` (`ATTACHMENT: 'Attachment'`)، `error-messages.ar.ts` (`ATTACHMENT.NOT_FOUND`, `ATTACHMENT.FILE_TOO_LARGE`, `ATTACHMENT.MIME_TYPE_NOT_ALLOWED`)، `app.module.ts` (تسجيل `AttachmentsModule`).

### قيود معروفة (موثقة، مش أخطاء)
- رفع ملف أكبر من الحد المسموح ممكن يتوقف عند `multer`/`FileInterceptor` نفسه (قبل ما يوصل لفحص الخدمة) برسالة خطأ إنجليزية خام مش مترجمة — فحص الخدمة (`ATTACHMENT.FILE_TOO_LARGE`) هو شبكة أمان تانية (defense in depth)، مش المسار الوحيد. تحسين رسالة خطأ multer نفسها (exception filter مخصص) خارج نطاق هذه الخطوة.
- مفيش فحص إن `entityId` بيشاور فعلاً على سجل موجود (نفس الاتفاقية غير المفروضة في Odoo/ERPNext لنفس العلاقة) — موثّق كمخاطرة مقبولة في تعليق الـ migration.

### التحقق — ✅ ناجح بالكامل على جهاز المستخدم (2026-09-12)
1. فحص syntax لكل الـ 19 ملف (جديد ومُعدَّل) عبر `ts.transpileModule` — زيرو أخطاء.
2. كتابة كل الملفات فعليًا على جهاز المستخدم عبر `device_commit_files` — 21 ملف، صفر مرفوض.
3. `pnpm install` — نجح، ثبّت `minio` و`@types/multer`.
4. `pnpm typecheck` — نجح.
5. `pnpm --filter api test` — نجح.
6. `pnpm --filter web build` — نجح (تحذير حجم chunk فقط، مش خطأ).
7. `pnpm --filter api db:migrate` — نجح على كل الـ 6 تينانتس، `0071_create_attachments` applied في كل واحد.

المستخدم أكّد الكل بـ "كل حاجة تمام".

## ✅ منجز ومتحقَّق منه — الفرونت إند `<AttachmentsPanel>` بالكامل (2026-09-12)

نفس جلسة إنجاز الـ Backend اتكمّلت بمكوّن الفرونت إند مباشرة، بناءً على طلب المستخدم الصريح ("تمام يلا بينا نشتغل علي طول").

### الملفات الجديدة (`apps/web/src/features/attachments/`)
- `domain/attachment-constants.ts` — نسخة فرونت إند مستقلة من `ATTACHMENT_ENTITY_PERMISSIONS`/`ATTACHMENT_MAX_SIZE_BYTES`/`ATTACHMENT_ALLOWED_MIME_TYPES` (نفس اتفاقية "نسخة مستقلة متزامنة يدويًا" المطبَّقة في العقد نفسه — الفرونت إند مينفعش يستورد من `apps/api`). بتُستخدم لفحص الملف قبل الرفع (حجم/نوع) ولتحديد صلاحية `<Can>` المطلوبة حسب `entityType`.
- `api/queries.ts` — `useAttachments(entityType, entityId)` (React Query)، `useUploadAttachment(entityType, entityId)`، `useDeleteAttachment(entityType, entityId)` — كلهم بينعملهم invalidate على نفس الـ query key بعد النجاح.
- `components/attachments-panel.tsx` — `<AttachmentsPanel entityType entityId />`: مكوّن قابل لإعادة الاستخدام، الكل ملفوف جوه `<Can permission={ATTACHMENT_ENTITY_PERMISSIONS[entityType]}>` (لأن الـ backend بيفرض نفس الصلاحية حتى على الـ list، فمفيش داعي نجيب البيانات أصلاً لمستخدم من غيرها). قائمة بسيطة (اسم الملف، الحجم، تاريخ الرفع، زرار تحميل، زرار حذف) + زرار رفع مع `<input type="file">` مخفي، فحص الحجم/النوع قبل الإرسال.

### تعديلات على `apps/web/src/lib/api-client.ts`
أُضيفت `apiUpload<T>(path, formData)` — دالة منفصلة عن `apiFetch` لأن دي بتاخد `FormData` بدل JSON: بتسيب المتصفح يحدد `Content-Type` (بالـ boundary) لوحده، وبتكرر نفس منطق `apiFetch` لفشل الشبكة وإعادة المحاولة مرة واحدة بعد تجديد الـ session لو رجع 401.

### التضمين في الشاشات السبعة
- **شاشات "المستندات" (details view جوه Dialog):** `PurchaseInvoiceDetailsView`، `SalesInvoiceDetailsView`، `SalesOrderDetailsView`، `PurchaseOrderDetailsView` — `<AttachmentsPanel>` مضاف بعد جدول البنود مباشرة.
- **شاشات "البيانات الأساسية" (Edit form بس، مش Create):** `EditSupplierForm`، `EditCustomerForm`، `EditProductForm` — `<AttachmentsPanel>` مضاف بعد زرار الحفظ، جوه نفس `<Form>` (اللي هو `FormProvider` من react-hook-form، بيقبل أكتر من child عادي).

### i18n
مفتاح جديد بالكامل `attachments.*` في `apps/web/src/i18n/locales/ar.json` (قبل `validation` مباشرة): العنوان، الرفع، لا توجد مرفقات، اسم الملف، الحجم، تاريخ الرفع، تحميل، حذف، رسائل النجاح/الخطأ، ورسالتين لفحص الحجم/النوع.

### التحقق — ✅ ناجح بالكامل على جهاز المستخدم (2026-09-12)
1. فحص syntax لكل الـ 12 ملف (3 جديد + 9 مُعدَّل، شامل ملف الـ JSON) عبر `ts.transpileModule` (مع `jsx: ReactJSX` للملفات `.tsx`) — زيرو أخطاء. فحص الـ JSON عبر `python3 -m json.load` — صالح.
2. كتابة كل الـ 12 ملف على جهاز المستخدم عبر `device_commit_files` (بحراسة `expectedMtimeMs` على كل ملف موجود مسبقًا) — 12 ملف، صفر مرفوض.
3. `pnpm typecheck` — نجح.
4. `pnpm --filter web build` — نجح.
5. تجربة يدوية فعلية في المتصفح (رفع ملف، تحميله، حذفه) — نجحت.

المستخدم أكّد الكل بـ "كله تمام" — **هذا البند مغلق تمامًا، لا حاجة لأي تحقق إضافي.**

### قيود معروفة (موثقة، مش أخطاء)
- مفيش اختبارات مكتوبة لهذا المكوّن (نفس الفجوة القياسية الموثقة في `claude/next-steps-backlog.md` بند 6) — لا للفرونت إند ولا للباكيند.

## الخلاصة

بند "بنية المرفقات المشتركة" (Backend + Frontend) **مغلق بالكامل ومتحقَّق منه فعليًا على جهاز المستخدم** اعتبارًا من 2026-09-12. لو ظهرت الحاجة لاحقًا لإضافة كيانات جديدة (مثلاً journal entries أو employees) أو ميزات إضافية (نسخ متعددة من نفس الملف، تصنيفات، معاينة مباشرة)، ده هيبقى امتداد منفصل يُبنى على نفس الأساس الموجود.
