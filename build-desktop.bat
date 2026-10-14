@echo off
rem Builds the Windows installer: frontend -> collectstatic -> PyInstaller -> Inno Setup.
rem Usage: build-desktop.bat [version]     (default version: 0.1.0)
rem Output: dist\StudySpace-Setup.exe (stable name; the landing links to it directly)
rem
rem Reuses backend\.venv (created by setup-desktop.bat) on purpose: the bundle is
rem built from the exact interpreter and packages the app is developed and tested with.
setlocal
cd /d "%~dp0"

set "APP_VERSION=%~1"
if "%APP_VERSION%"=="" set "APP_VERSION=0.1.0"

set "PY=%~dp0backend\.venv\Scripts\python.exe"
if not exist "%PY%" (
    echo [error] backend\.venv not found. Run setup-desktop.bat first.
    exit /b 1
)
where pnpm >nul 2>nul || (echo [error] pnpm was not found in PATH. & exit /b 1)

echo.
echo === [1/5] Frontend build ===
pushd frontend
call pnpm install --frozen-lockfile || (popd & echo [error] pnpm install failed. & exit /b 1)
call pnpm build:desktop || (popd & echo [error] Frontend build failed. & exit /b 1)
popd
if not exist "frontend\dist-desktop\index.html" (echo [error] frontend\dist-desktop\index.html is missing. & exit /b 1)

echo.
echo === [2/5] Build dependencies ===
"%PY%" -m pip install -q -r backend\requirements-build.txt || (echo [error] pip install failed. & exit /b 1)

echo.
echo === [3/5] collectstatic ===
pushd backend
if exist build\staticfiles rmdir /s /q build\staticfiles
set "DJANGO_SETTINGS_MODULE=config.settings.desktop"
set "STUDYSPACE_STATIC_ROOT=%~dp0backend\build\staticfiles"
rem Throwaway data dir so the build never touches the real user data.
set "STUDYSPACE_DATA_DIR=%~dp0backend\build\data"
"%PY%" manage.py collectstatic --noinput --verbosity 0 || (popd & echo [error] collectstatic failed. & exit /b 1)
set "STUDYSPACE_STATIC_ROOT="
set "STUDYSPACE_DATA_DIR="

echo.
echo === [4/5] PyInstaller ===
"%PY%" -m PyInstaller studyspace.spec --noconfirm --clean --workpath build\pyinstaller --distpath dist || (popd & echo [error] PyInstaller failed. & exit /b 1)
popd
if not exist "backend\dist\StudySpace\StudySpace.exe" (echo [error] backend\dist\StudySpace\StudySpace.exe was not produced. & exit /b 1)

echo.
echo === [5/5] Inno Setup ===
set "ISCC="
for %%P in (
    "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
    "%ProgramFiles%\Inno Setup 6\ISCC.exe"
    "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
) do if not defined ISCC if exist %%P set "ISCC=%%~P"
if not defined ISCC (
    echo [error] ISCC.exe not found. Install it with:
    echo         winget install --id JRSoftware.InnoSetup -e
    echo         The PyInstaller bundle is ready at backend\dist\StudySpace\
    exit /b 1
)
"%ISCC%" /Qp "/DAppVersion=%APP_VERSION%" installer\studyspace.iss || (echo [error] Inno Setup compilation failed. & exit /b 1)

echo.
echo Done: dist\StudySpace-Setup.exe (version %APP_VERSION%)
