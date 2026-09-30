@echo off
rem Fullscreen (borderless) launch: no browser title bar at all. F11 toggles, Alt+F4 quits.
rem ASCII-only on purpose (see the main launcher).
setlocal
set XCTERM_FULL=1
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
