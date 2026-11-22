@echo off
setlocal
cd /d "%~dp0"
echo KINEX AIR v0.4 - REAL WINDOWS CURSOR
where py >nul 2>nul
if %errorlevel%==0 (
  py server.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 not detected. Add it to PATH before running KINEX AIR.
  ) else (
    python server.py
  )
)
echo.
echo The local bridge closed or failed. Check the error above.
pause
endlocal
