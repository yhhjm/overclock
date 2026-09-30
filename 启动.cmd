@echo off
rem Portable launcher (XingceTerm). Keep this file ASCII-only:
rem cmd.exe mis-parses UTF-8 batch files, especially after chcp 65001.
rem All localized messages are printed by _launch.ps1 instead.
setlocal
where powershell >nul 2>nul
if errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0_launch.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_launch.ps1"
)
if errorlevel 1 (
  echo.
  echo [FAILED] See the message above. You can also open app\index.html directly.
  pause
)
exit /b 0
