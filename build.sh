#!/usr/bin/env bash
# Build a distributable Linux app with PyInstaller (see intel_ai_studio.spec).
#
# The output is dist/Intel-AI-Studio/ (a portable folder with the bundled Python
# runtime) plus the Linux install/uninstall helpers copied in for the release
# tarball. Run scripts/smoke-test.sh afterwards to verify it.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[setup] creating venv..."
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
pip install -r requirements-dev.txt

python -m PyInstaller --noconfirm --clean \
  --workpath build/work --distpath dist \
  intel_ai_studio.spec

cp packaging/linux/install.sh packaging/linux/uninstall.sh \
   packaging/linux/intel-ai-studio.desktop.in dist/Intel-AI-Studio/
chmod +x dist/Intel-AI-Studio/Intel-AI-Studio dist/Intel-AI-Studio/install.sh \
         dist/Intel-AI-Studio/uninstall.sh

echo
echo "Done: dist/Intel-AI-Studio/Intel-AI-Studio"
echo "Tip: verify it with  scripts/smoke-test.sh dist/Intel-AI-Studio/Intel-AI-Studio"
echo "Tip: install it with dist/Intel-AI-Studio/install.sh"
