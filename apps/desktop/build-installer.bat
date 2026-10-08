@echo off
REM Builds the Windows installer:  apps\desktop\release\ERP Platform-Setup-<version>.exe
REM Run from anywhere (no admin needed). First run downloads PostgreSQL (~300 MB zip, cached).
REM If the download is blocked, download the zip yourself and run:
REM   build-installer.bat --pg-zip C:\path\to\postgresql-17.x-1-windows-x64-binaries.zip
setlocal
cd /d "%~dp0\..\.."

echo [1/3] Installing dependencies...
call pnpm install --frozen-lockfile || goto :error

echo [2/3] Building and staging (API, web, PostgreSQL)...
call node apps\desktop\scripts\stage.mjs %* || goto :error

echo [3/3] Packaging the installer...
cd apps\desktop
call pnpm exec electron-builder --win --x64 --publish never || goto :error

echo.
echo Done:  apps\desktop\release\
dir /b release\*.exe
exit /b 0

:error
echo.
echo BUILD FAILED - see the messages above.
exit /b 1
