@echo off
title AutoReach Hub - Excel to WhatsApp & Email Automation
echo ==================================================
echo   Starting AutoReach Hub
echo   Excel to WhatsApp and Email Automation
echo ==================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python was not found on your system. Please install Python 3.9+ from https://python.org
    pause
    exit /b 1
)

if not exist ".venv" (
    echo Creating virtual environment (.venv)...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

echo Checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting application at http://127.0.0.1:8080
start "" http://127.0.0.1:8080


python main.py
pause
