@echo off
setlocal

rem Default port from first arg, fallback to 5173
set "PORT=%~1"
if "%PORT%"=="" set "PORT=5173"

rem Switch to script directory
cd /d "%~dp0"

rem Check npx availability
where npx >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npx not found. Please install Node.js and ensure npm is in PATH: https://nodejs.org/
  echo You can alternatively run: python -m http.server %PORT%
  pause
  exit /b 1
)

echo Starting http-server on port %PORT% ...
start "svg-dash-animator server" cmd /k npx http-server . -p %PORT% -c-1 --cors

rem Give the server a moment
timeout /t 1 /nobreak >nul

set "URL=http://localhost:%PORT%"
echo Opening %URL% ...
start "" "%URL%"

echo If the page looks cached, press Ctrl+F5 in the browser.
endlocal