@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Cai Node.js 18+ tu https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
node serve.js
pause
