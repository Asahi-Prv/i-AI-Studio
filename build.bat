@echo off
REM Build a distributable app with PyInstaller (see intel_ai_studio.spec).
REM Builds under %TEMP% and then copies to .\dist (robocopy) so repeated builds
REM don't get blocked by OneDrive file locks inside the project folder.
cd /d %~dp0
if not exist .venv (
  echo [setup] creating venv...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r requirements-dev.txt

set BUILD=%TEMP%\intel-ai-studio-build
if exist "%BUILD%" rmdir /s /q "%BUILD%"

python -m PyInstaller --noconfirm --clean ^
  --workpath "%BUILD%\work" --distpath "%BUILD%\dist" ^
  intel_ai_studio.spec
if errorlevel 1 goto :error

robocopy "%BUILD%\dist\Intel-AI-Studio" ".\dist\Intel-AI-Studio" /E /PURGE /MT:8 /NFL /NDL /NJH /NJS
if errorlevel 8 goto :error
rmdir /s /q "%BUILD%"

echo.
echo Done: dist\Intel-AI-Studio\Intel-AI-Studio.exe
echo Tip: verify it with  powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
goto :eof

:error
echo BUILD FAILED
if not defined CI pause
exit /b 1
