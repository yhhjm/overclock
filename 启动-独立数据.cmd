@echo off
rem Isolated-data launch: uses %LOCALAPPDATA%\XingceTerm\profile instead of your everyday browser
rem profile, so it always gets the dark title bar and keeps study progress separate.
rem ASCII-only on purpose (see the main launcher).
setlocal
set XCTERM_ISOLATED=1
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
