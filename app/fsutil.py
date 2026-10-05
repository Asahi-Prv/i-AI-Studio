"""Filesystem helpers."""
from __future__ import annotations

import os
import shutil
import stat
import time
from pathlib import Path

from .i18n import tr


def is_within(path: Path, root: Path) -> bool:
    """True if ``path`` resolves to a location inside ``root`` (traversal-safe)."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (OSError, ValueError):
        return False


def _on_error(func, path, _exc):
    try:
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    except OSError:
        pass
    func(path)


def rmtree(d: Path, attempts: int = 6, delay: float = 0.6, lang: str | None = None) -> None:
    """Robust rmtree: clears read-only flags and retries (OneDrive sync locks)."""
    last: Exception | None = None
    for _ in range(attempts):
        try:
            shutil.rmtree(d, onexc=_on_error)
            return
        except FileNotFoundError:
            return
        except OSError as e:
            last = e
            time.sleep(delay)
    raise RuntimeError(tr(lang, "err.delete_failed", path=d)) from last
