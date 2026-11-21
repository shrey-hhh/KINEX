@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
 start "KINEX local server" cmd /k "py -m http.server 8765 --bind 127.0.0.1"
) else (
 where python >nul 2>nul
 if errorlevel 1 (
  echo Python 3 is required. Install it from python.org and try again.
  pause
  exit /b 1
 )
 start "KINEX local server" cmd /k "python -m http.server 8765 --bind 127.0.0.1"
)
timeout /t 2 /nobreak >nul
start "" http://localhost:8765
