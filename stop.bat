@echo off
echo ========================================
echo Stopping SynToSeis Servers
echo ========================================

echo Stopping Python/uvicorn processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im pythonw.exe >nul 2>&1

echo Stopping Node/npm processes...
taskkill /f /im node.exe >nul 2>&1

echo.
echo All servers stopped.
echo ========================================
pause
