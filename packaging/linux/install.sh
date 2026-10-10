#!/bin/sh
# Per-user installer for Intel AI Studio (no root required).
#
# Copies the packaged app into ~/.local/share/intel-ai-studio, adds a launcher in
# ~/.local/bin and an application-menu entry, so it behaves like an installed app.
# Mirrors the Windows installer; runs on any distro (portable tarball, not a
# system package).
#
#   ./install.sh            install (or update in place)
#   ./uninstall.sh          remove the app, keeping user data
#   ./uninstall.sh --purge  remove the app and all user data
set -eu

APP_ID="intel-ai-studio"
APP_NAME="Intel AI Studio"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_DIR="$DATA_HOME/$APP_ID"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$DATA_HOME/applications"

if [ ! -x "$SRC_DIR/Intel-AI-Studio" ]; then
  echo "Intel-AI-Studio executable not found in $SRC_DIR" >&2
  echo "Run install.sh from the extracted release folder." >&2
  exit 1
fi

echo "Installing $APP_NAME to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
cp -a "$SRC_DIR"/. "$INSTALL_DIR"/

# Command-line launcher.
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/Intel-AI-Studio" "$BIN_DIR/$APP_ID"

# Application-menu entry (absolute Exec path baked in at install time).
mkdir -p "$APPS_DIR"
sed "s|@INSTALL_DIR@|$INSTALL_DIR|g" \
  "$INSTALL_DIR/intel-ai-studio.desktop.in" > "$APPS_DIR/$APP_ID.desktop"
chmod +x "$APPS_DIR/$APP_ID.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi

echo "Done."
echo "  Launch from the app menu, or run: $APP_ID"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "  Note: add $BIN_DIR to your PATH to use the '$APP_ID' command." ;;
esac
