@echo off
setlocal enabledelayedexpansion

echo ========================================
echo SynToSeis Application Starter
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Set Python path
set PYTHONPATH=.

REM Kill any existing processes
echo Stopping any existing servers...
taskkill /f /im python.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [1/2] Starting Backend Server on port 8001...
start "SynToSeis Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn server.main:app --port 8000"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Development Server...
start "SynToSeis Frontend" cmd /k "cd ui && npm run dev"

echo.
echo ========================================
echo SynToSeis is running!
echo.
echo Backend API:  http://localhost:8001
echo Frontend UI:  http://localhost:5173 (or next available port)
echo.
echo Close this window to stop servers.
echo ========================================
echo.

REM Keep running and show logs
:loop
timeout /t 5 /nobreak >nul
goto loop
