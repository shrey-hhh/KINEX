@echo off
setlocal
title KINEX AIR - Windows Cursor Bridge
pushd "%~dp0"
if errorlevel 1 (
  echo ERROR: Cannot open the launcher folder.
  echo Extract the full GitHub ZIP to a regular folder and try again.
  pause
  exit /b 1
)
echo KINEX AIR - REAL WINDOWS CURSOR
echo.
if not exist "%~dp0server.py" (
  echo ERROR: server.py was not found next to START_WINDOWS.bat.
  echo.
  echo Your launcher is in:
  echo   %~dp0
  echo.
  echo FIX:
  echo 1. Download the complete KINEX repository ZIP from GitHub.
  echo 2. Choose "Extract All"; do NOT run the batch file inside the ZIP.
  echo 3. Open the extracted KINEX-AIR folder.
  echo 4. Make sure server.py and START_WINDOWS.bat are in that folder.
  echo 5. Run START_WINDOWS.bat there.
  echo.
  echo Repository: https://github.com/shrey-hhh/KINEX
  pause
  popd
  exit /b 1
)
if not exist "%~dp0index.html" (
  echo ERROR: index.html is missing. Please extract the COMPLETE KINEX-AIR folder.
  pause
  popd
  exit /b 1
)
where py >nul 2>nul
if not errorlevel 1 (
  py "%~dp0server.py"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Python 3 was not found on PATH.
    echo Install Python 3 or enable its launcher, then retry.
  ) else (
    python "%~dp0server.py"
  )
)
echo.
echo The local bridge closed or failed. Review the message above.
pause
popd
endlocal
