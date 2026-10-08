; ERP Platform — custom steps for electron-builder's NSIS installer.
;
; All real setup work lives in src/setup.ts (testable JS, run with the app's
; own executable as Node). This file only decides WHEN to call it:
;   install / update → setup.js install  (cluster, service, DB, backup, migrations)
;   update           → the old version's uninstaller runs first with --updated:
;                      only stop the database so its files can be replaced
;   uninstall        → stop + delete the service and firewall rule; the data
;                      folder is removed only if the user explicitly says so.

!define DB_SERVICE "ERPPlatformDB"
!define FIREWALL_RULE "ERP Platform (LAN)"
!define DATA_DIR_NAME "ERP Platform"

!macro stopDatabaseService
  nsExec::ExecToLog '"$SYSDIR\net.exe" stop ${DB_SERVICE}'
  Pop $0 ; non-zero when not installed / not running — fine
!macroend

!macro customInit
  ; Installing over an existing copy: the DB service runs binaries from the
  ; install folder, so stop it before any file is replaced.
  !insertmacro stopDatabaseService
!macroend

!macro customInstall
  DetailPrint "Preparing the database..."
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  nsExec::ExecToLog '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\resources\setup\setup.js" install --version "${VERSION}" --resources "$INSTDIR\resources" --app-exe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", n)'
  ${if} $0 != 0
    ReadEnvStr $1 PROGRAMDATA
    MessageBox MB_ICONSTOP|MB_OK "تعذّر تجهيز قاعدة البيانات (رمز الخطأ $0).$\r$\n$\r$\nالتفاصيل في الملف:$\r$\n$1\${DATA_DIR_NAME}\logs\setup.log$\r$\n$\r$\nأرسل هذا الملف للدعم الفني."
    SetErrorLevel 2
    Quit
  ${endif}
!macroend

!macro customUnInit
  !insertmacro stopDatabaseService
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::ExecToLog '"$SYSDIR\sc.exe" delete ${DB_SERVICE}'
    Pop $0
    nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule "name=${FIREWALL_RULE}"'
    Pop $0
    ${ifNot} ${Silent}
      ReadEnvStr $1 PROGRAMDATA
      MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "هل تريد حذف كل بيانات البرنامج أيضًا (قاعدة البيانات والملفات والنسخ الاحتياطية)؟$\r$\n$\r$\nاختر (لا) للاحتفاظ بها — ستعود كما هي لو ثبّتّ البرنامج مرة أخرى.$\r$\n$\r$\n$1\${DATA_DIR_NAME}" IDYES removeData IDNO keepData
      removeData:
        ${if} $1 != ""
          RMDir /r "$1\${DATA_DIR_NAME}"
        ${endIf}
      keepData:
    ${endIf}
  ${endIf}
!macroend
