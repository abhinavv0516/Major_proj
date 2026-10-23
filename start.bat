@echo off
rem FraudX - starts the backend and frontend in their own windows, then opens the app.
rem Usage: double-click start.bat, or type  .\start.bat  in a terminal in this folder.
cd /d "%~dp0"
title FraudX launcher
echo Starting FraudX backend (port 8000) and frontend (port 5173)...

start "FraudX API" cmd /k venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --timeout-graceful-shutdown 2
start "FraudX UI" /d "%~dp0frontend" cmd /k npm.cmd run dev

set /a n=0
:waitapi
set /a n+=1
if %n% gtr 90 (
  echo The backend did not start. Look at the "FraudX API" window for the error.
  pause
  exit /b 1
)
curl -s -o nul http://127.0.0.1:8000/api/health && goto apiup
timeout /t 1 /nobreak >nul
goto waitapi
:apiup
echo Backend is up.

set /a n=0
:waitui
set /a n+=1
if %n% gtr 90 (
  echo The frontend did not start. Look at the "FraudX UI" window for the error.
  pause
  exit /b 1
)
curl -s -o nul http://localhost:5173 && goto uiup
timeout /t 1 /nobreak >nul
goto waitui
:uiup
echo Frontend is up. Opening http://localhost:5173 ...
start "" http://localhost:5173
echo.
echo FraudX is running. To stop it, close the "FraudX API" and "FraudX UI" windows.
timeout /t 8 >nul
