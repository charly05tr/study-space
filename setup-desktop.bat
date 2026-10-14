@echo off
rem One-time setup for desktop mode: Python venv + dependencies + frontend build.
setlocal
cd /d "%~dp0"

where python >nul 2>nul || (echo Python 3.12+ is required and was not found in PATH. & exit /b 1)
where pnpm >nul 2>nul || (echo pnpm is required and was not found in PATH. & exit /b 1)

if not exist "backend\.venv\Scripts\python.exe" (
    python -m venv backend\.venv || exit /b 1
)
call "backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements-desktop.txt || exit /b 1

pushd frontend
call pnpm install || (popd & exit /b 1)
call pnpm build:desktop || (popd & exit /b 1)
popd

pushd backend
call ".venv\Scripts\python.exe" install_shortcut.py || (popd & exit /b 1)
popd

echo.
echo Setup complete. Launch "Study Space" from the Start Menu, or run StudySpace.bat
