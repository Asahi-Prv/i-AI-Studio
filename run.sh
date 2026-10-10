#!/usr/bin/env bash
# Development launcher: create a venv, install dependencies, start the app.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[setup] creating venv..."
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
python -c "import fastapi, httpx, huggingface_hub" 2>/dev/null || pip install -r requirements.txt
python -m app.main
