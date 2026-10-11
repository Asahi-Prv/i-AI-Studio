"""Filesystem helpers."""
from __future__ import annotations

import os
import posixpath
import shutil
import stat
import tarfile
import time
import zipfile
from pathlib import Path

from .i18n import tr


def is_within(path: Path, root: Path) -> bool:
    """True if ``path`` resolves to a location inside ``root`` (traversal-safe)."""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (OSError, ValueError):
        return False


def extract_zip_safe(z: zipfile.ZipFile, dest: Path, lang: str | None = None) -> None:
    """Extract ``z`` into ``dest``, rejecting entries that escape it (Zip Slip)."""
    root = dest.resolve()
    for member in z.infolist():
        target = (root / member.filename).resolve()
        if not target.is_relative_to(root):
            raise RuntimeError(tr(lang, "err.unsafe_archive"))
        z.extract(member, root)


def tar_safe_filter(member: tarfile.TarInfo, dest_path: str):
    """Extraction filter: strict ``data`` semantics plus OVMS absolute symlinks.

    The official OVMS ``python_on`` Linux packages ship absolute symlinks built
    for the ``/ovms`` Docker layout, e.g.::

        ovms/lib/python/openvino_tokenizers/lib/libopenvino_tokenizers.so
            -> /ovms/lib/libopenvino_tokenizers.so

    Python's ``data`` filter rejects those (``AbsoluteLinkError``). Rewrite an
    absolute target to the equivalent path relative to the archive root, then
    delegate to ``data``, which still rejects traversal and links that would
    escape the destination.
    """
    if member.issym() and posixpath.isabs(member.linkname):
        target = member.linkname.replace("\\", "/").lstrip("/")
        member_dir = posixpath.dirname(member.name.replace("\\", "/"))
        relative = posixpath.relpath(target, member_dir)
        resolved = posixpath.normpath(posixpath.join(member_dir, relative))
        if resolved.startswith("..") or posixpath.isabs(resolved):
            raise tarfile.LinkOutsideDestinationError(member, dest_path)
        member.linkname = relative
    return tarfile.data_filter(member, dest_path)


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
