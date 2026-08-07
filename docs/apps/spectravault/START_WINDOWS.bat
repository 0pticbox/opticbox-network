@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found.
  echo You can still double-click index.html, but microphone and desktop audio may require localhost.
  pause
  start "" index.html
  exit /b
)
start "SPECTRAVAULT" http://localhost:8080
python -m http.server 8080
endlocal
