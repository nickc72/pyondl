@echo off
title PyonDL - Manga & Gallery Downloader & Reader
cd /d "%~dp0"

echo ==============================================================
echo   PyonDL - Manga & Gallery Downloader & Reader
echo ==============================================================
echo.

if not exist ".venv" (
    echo [INFO] Virtual environment not found. Setting up .venv...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment. Ensure Python 3 is installed and in your PATH.
        pause
        exit /b 1
    )
    echo [INFO] Installing required dependencies...
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\pip.exe" install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
    echo [INFO] Setup complete!
    echo.
)

echo Starting PyonDL...
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" run.py
) else (
    python run.py
)

pause
