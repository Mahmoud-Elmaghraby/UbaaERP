/**
 * Every user-facing string of the desktop shell (tray, dialogs, splash) in
 * one keyed table — the main-process counterpart of apps/web's ar.json
 * (CLAUDE.md §9.1: no hard-coded UI text; Arabic only today).
 */
export const t = {
  appName: 'ERP Platform',
  splashTitle: 'جاري تشغيل البرنامج',
  statusDatabase: 'جاري تشغيل قاعدة البيانات...',
  statusMigrations: 'جاري تجهيز البيانات...',
  statusServer: 'جاري تشغيل الخادم...',
  startFailed: 'تعذّر تشغيل البرنامج.',
  notInstalled: 'البرنامج غير مثبّت بشكل صحيح — أعد تشغيل برنامج التثبيت.',
  apiKeepsCrashing: 'الخادم الداخلي يتوقف بشكل متكرر.',
  logsAt: 'ملفات السجل في:',
  open: 'فتح البرنامج',
  lanAccess: 'السماح بالدخول من أجهزة الشبكة',
  copyLink: 'نسخ الرابط',
  lanToggleFailed: 'تعذّر تغيير إعداد الشبكة.',
  backupNow: 'نسخة احتياطية الآن',
  backupDone: 'تم حفظ النسخة الاحتياطية.',
  backupFailed: 'فشل أخذ النسخة الاحتياطية.',
  openBackups: 'فتح مجلد النسخ الاحتياطية',
  openLogs: 'فتح مجلد السجلات',
  quit: 'إغلاق البرنامج',
  stillRunning: 'البرنامج ما زال يعمل لأجهزة الشبكة — أغلقه من أيقونة شريط المهام.',
} as const;
