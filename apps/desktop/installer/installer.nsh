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

; electron-builder's common.nsh hides the details list (nevershow). Show it,
; like Nabgha's installer: every step (and setup.js output via ExecToLog)
; is visible, so a failure on a customer's PC can be read off the screen.
!macro customHeader
  ShowInstDetails show
  !ifdef BUILD_UNINSTALLER
    ShowUninstDetails show
  !endif
!macroend

!macro stopDatabaseService
  nsExec::ExecToLog '"$SYSDIR\net.exe" stop ${DB_SERVICE}'
  Pop $0 ; non-zero when not installed / not running — fine
!macroend

!macro customInit
  ; Installing over an existing copy: the DB service runs binaries from the
  ; install folder, so stop it before any file is replaced.
  !insertmacro stopDatabaseService
!macroend

!macro ensureVcRuntime
  ; PostgreSQL needs the Visual C++ 2015-2022 runtime (VCRUNTIME140.dll); a
  ; clean Windows does not have it. Install it silently only when missing.
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  SetRegView lastused
  ${if} $0 != 1
    DetailPrint "جارٍ تثبيت Microsoft Visual C++ Runtime..."
    ExecWait '"$INSTDIR\resources\vcredist\vc_redist.x64.exe" /install /quiet /norestart' $0
    ; 0 ok, 3010 ok (reboot later), 1638 a newer version is already there
    ${if} $0 != 0
    ${andif} $0 != 3010
    ${andif} $0 != 1638
      MessageBox MB_ICONSTOP|MB_OK "تعذّر تثبيت Microsoft Visual C++ Runtime (رمز الخطأ $0).$\r$\nثبّته يدويًا من الملف:$\r$\n$INSTDIR\resources\vcredist\vc_redist.x64.exe$\r$\nثم شغّل برنامج التثبيت مرة أخرى."
      SetErrorLevel 2
      Quit
    ${endif}
  ${endif}
!macroend

!macro writeRepairScript
  ; Nabgha lesson: on a customer's PC the only reliable diagnosis was running
  ; the failing step by hand in a console and reading the real error. This
  ; ships that as one double-click: re-runs the database setup (idempotent:
  ; backup, start DB, pending migrations) with the output on screen.
  FileOpen $9 "$INSTDIR\repair.cmd" w
  FileWrite $9 '@echo off$\r$\n'
  FileWrite $9 'chcp 65001 >nul$\r$\n'
  FileWrite $9 'net session >nul 2>&1 || (echo Run this file as Administrator. & pause & exit /b 1)$\r$\n'
  FileWrite $9 'cd /d "%~dp0"$\r$\n'
  FileWrite $9 'set ELECTRON_RUN_AS_NODE=1$\r$\n'
  FileWrite $9 '"%~dp0${APP_EXECUTABLE_FILENAME}" "%~dp0resources\setup\setup.js" install --version "${VERSION}" --resources "%~dp0resources" --app-exe "%~dp0${APP_EXECUTABLE_FILENAME}"$\r$\n'
  FileWrite $9 'echo.$\r$\n'
  FileWrite $9 'echo Exit code: %errorlevel%   Log: %ProgramData%\${DATA_DIR_NAME}\logs$\r$\n'
  FileWrite $9 'pause$\r$\n'
  FileClose $9
!macroend

!macro customInstall
  !insertmacro ensureVcRuntime
  !insertmacro writeRepairScript
  DetailPrint "جارٍ تجهيز قاعدة البيانات..."
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")'
  nsExec::ExecToLog '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\resources\setup\setup.js" install --version "${VERSION}" --resources "$INSTDIR\resources" --app-exe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", n)'
  ${if} $0 != 0
    ReadEnvStr $1 PROGRAMDATA
    MessageBox MB_ICONSTOP|MB_OK "تعذّر تجهيز قاعدة البيانات (رمز الخطأ $0).$\r$\n$\r$\nالتفاصيل في الملف:$\r$\n$1\${DATA_DIR_NAME}\logs\setup.log$\r$\n$\r$\nأرسل هذا الملف للدعم الفني.$\r$\n$\r$\nلإعادة المحاولة وعرض الخطأ: شغّل repair.cmd من مجلد البرنامج كمسؤول (Run as administrator)."
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
