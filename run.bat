@echo off
REM Development launcher: create a venv, install dependencies, start the app.
cd /d %~dp0
if not exist .venv (
  echo [setup] creating venv...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
python -c "import fastapi, httpx, huggingface_hub" 2>nul || pip install -r requirements.txt
python -m app.main
pause
