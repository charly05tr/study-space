@echo off
rem Launches Study Space in desktop mode (no console window when pythonw is available).
setlocal
cd /d "%~dp0backend"

if exist ".venv\Scripts\pythonw.exe" (
    start "" ".venv\Scripts\pythonw.exe" desktop.py %*
    exit /b 0
)
where pythonw >nul 2>nul && (
    start "" pythonw desktop.py %*
    exit /b 0
)
python desktop.py %*
