"""Subprocess helpers."""
from __future__ import annotations

import os
import subprocess


def subprocess_flags() -> int:
    """``creationflags`` that keep child processes from opening a console window.

    OVMS and its bundled python.exe are console applications; when this app runs
    without a console (windowed PyInstaller / WebView2 build), Windows would give
    every child a new console window without these flags.
    """
    if os.name != "nt":
        return 0
    return subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
