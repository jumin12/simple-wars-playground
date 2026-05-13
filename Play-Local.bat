@echo off
cd /d "%~dp0"
if not exist "index.html" (
  echo ERROR: index.html not found in %cd%
  pause
  exit /b 1
)
echo.
echo Opening browser: http://127.0.0.1:8765/index.html
echo Keep this window open. Press Ctrl+C to stop.
echo.
start "" "http://127.0.0.1:8765/index.html"
py -3 -m http.server 8765 --bind 127.0.0.1
