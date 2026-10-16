@echo off
setlocal

echo ========================================
echo SynToSeis Application Starter
echo ========================================
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

REM Set Python path
set PYTHONPATH=.

echo [1/2] Starting Backend Server on port 8000...
start "SynToSeis Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn server.main:app --port 8000 --reload"

REM Wait for backend to start
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Development Server...
start "SynToSeis Frontend" cmd /k "cd ui && npm run dev"

echo.
echo ========================================
echo SynToSeis is starting!
echo.
echo Backend API:  http://localhost:8000
echo Frontend UI:  http://localhost:5173 (or next available port)
echo.
echo Press any key to stop all servers...
echo ========================================
pause >nul

taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo Servers stopped.
