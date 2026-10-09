"""GitHub release update checks and one-click self-update for packaged builds.

Only assets from the configured repository's release downloads are accepted, and
the downloaded zip is verified against the release's ``SHA256SUMS.txt`` before it
is staged. Applying an update is delegated to a small PowerShell script that
waits for this process to exit, replaces ``Intel-AI-Studio.exe`` and
``_internal`` (the user's ``data`` folder is never touched), and restarts the app.
"""
from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path

import httpx

from . import ovms, tasks
from .config import APP_VERSION, DATA_DIR, load_config, save_config
from .fsutil import extract_zip_safe, rmtree
from .i18n import tr
from .procutil import subprocess_flags

DEFAULT_REPO = "Asahi-Prv/i-AI-Studio"
ASSET_NAME = "Intel-AI-Studio-windows-x64.zip"
CHECKSUMS_NAME = "SHA256SUMS.txt"
CHECK_TTL = 24 * 3600
_UA = {"User-Agent": "intel-ai-studio", "Accept": "application/vnd.github+json"}


def repo() -> str:
    return str(load_config().get("update_repo") or DEFAULT_REPO)


def parse_version(text: str | None) -> tuple[int, ...]:
    """Parse ``v1.2.3`` / ``1.2`` into a comparable tuple (empty when unparsable)."""
    match = re.match(r"v?(\d+(?:\.\d+)*)", (text or "").strip())
    if match is None:
        return ()
    return tuple(int(part) for part in match.group(1).split("."))


def is_newer(latest: str | None, current: str | None) -> bool:
    latest_parts, current_parts = parse_version(latest), parse_version(current)
    if not latest_parts or not current_parts:
        return False
    width = max(len(latest_parts), len(current_parts))
    return latest_parts + (0,) * (width - len(latest_parts)) > current_parts + (0,) * (width - len(current_parts))


def is_allowed_url(url: str) -> bool:
    return bool(url) and url.startswith(f"https://github.com/{repo()}/releases/download/")


def _cached_result(cached: dict) -> dict:
    result = dict(cached)
    result["current"] = APP_VERSION
    result["available"] = is_newer(result.get("latest"), APP_VERSION)
    return result


def check_for_update(force: bool = False, lang: str | None = None) -> dict:
    """Return release info, using the on-disk cache for up to ``CHECK_TTL``."""
    cfg = load_config()
    cached = cfg.get("update_latest")
    now = time.time()
    if not force and cached and now - float(cfg.get("last_update_check") or 0) < CHECK_TTL:
        return _cached_result(cached)

    repository = repo()
    with httpx.Client(timeout=30, headers=_UA) as client:
        response = client.get(f"https://api.github.com/repos/{repository}/releases/latest")
        response.raise_for_status()
        release = response.json()

    tag = str(release.get("tag_name") or "")
    latest = tag.lstrip("v")
    assets = {a.get("name"): a for a in release.get("assets") or []}
    zip_asset = assets.get(ASSET_NAME) or {}
    sums_asset = assets.get(CHECKSUMS_NAME) or {}
    info = {
        "current": APP_VERSION,
        "latest": latest,
        "tag": tag,
        "available": bool(latest) and is_newer(latest, APP_VERSION),
        "html_url": release.get("html_url") or "",
        "name": release.get("name") or tag,
        "published_at": release.get("published_at") or "",
        "notes": (release.get("body") or "")[:4000],
        "asset_url": zip_asset.get("browser_download_url") or "",
        "asset_size": int(zip_asset.get("size") or 0),
        "checksums_url": sums_asset.get("browser_download_url") or "",
        "checked_at": now,
    }
    save_config({"last_update_check": now, "update_latest": info})
    return info


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checksum_for(text: str, name: str) -> str | None:
    """Return the lowercase hex digest for ``name`` from a SHA256SUMS file."""
    for line in (text or "").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].lstrip("*") == name:
            candidate = parts[0].strip().lower()
            if re.fullmatch(r"[0-9a-f]{64}", candidate):
                return candidate
    return None


def _download(url: str, dest: Path, tid: str, lang: str | None) -> None:
    with httpx.stream("GET", url, headers={"User-Agent": _UA["User-Agent"]},
                      follow_redirects=True, timeout=120) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length") or 0)
        done = 0
        with dest.open("wb") as f:
            for chunk in response.iter_bytes(1 << 16):
                if not tasks.is_running(tid):
                    raise RuntimeError(tr(lang, "err.cancelled"))
                f.write(chunk)
                done += len(chunk)
                tasks.set_progress(tid, done, total)


def _ps_quote(text) -> str:
    return "'" + str(text).replace("'", "''") + "'"


def write_update_script(staged_app_dir: Path, app_dir: Path, exe_name: str,
                        base_dir: Path, script_path: Path) -> None:
    """Write the detached updater script.

    The script waits until the running executable is no longer locked. Waiting on
    the process id alone is not reliable because Windows reuses PIDs.
    """
    exe_path = app_dir / exe_name
    script_path.write_text(
        "$ErrorActionPreference = 'SilentlyContinue'\n"
        "# Wait until the app's executable is no longer locked (PID-reuse safe).\n"
        f"$exe = {_ps_quote(exe_path)}\n"
        "$deadline = (Get-Date).AddSeconds(120)\n"
        "while ((Get-Date) -lt $deadline) {\n"
        "    try { $fs = [System.IO.File]::Open($exe, 'Open', 'ReadWrite', 'None'); $fs.Close(); break }\n"
        "    catch { Start-Sleep -Milliseconds 500 }\n"
        "}\n"
        "Start-Sleep -Milliseconds 800\n"
        f"robocopy {_ps_quote(staged_app_dir)} {_ps_quote(app_dir)} "
        "/E /NFL /NDL /NJH /NJS /R:10 /W:1 | Out-Null\n"
        f"Start-Process -FilePath $exe -WorkingDirectory {_ps_quote(app_dir)}\n"
        "Start-Sleep -Milliseconds 500\n"
        f"Remove-Item -LiteralPath {_ps_quote(base_dir)} -Recurse -Force\n"
        "Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force\n",
        encoding="utf-8",
    )


def apply_update(staged_app_dir: Path, lang: str | None = None) -> None:
    """Spawn the detached updater script and exit so it can replace this build."""
    if not getattr(sys, "frozen", False):
        raise RuntimeError(tr(lang, "err.update_source_mode"))

    app_dir = Path(sys.executable).resolve().parent
    exe_name = Path(sys.executable).name
    base_dir = staged_app_dir.parent.parent  # .../updates/<tag>
    script_path = base_dir.parent / f"apply-{base_dir.name}.ps1"
    write_update_script(staged_app_dir, app_dir, exe_name, base_dir, script_path)
    subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
         "-WindowStyle", "Hidden", "-File", str(script_path)],
        creationflags=subprocess_flags(), close_fds=True, cwd=str(DATA_DIR),
    )

    def _exit_soon() -> None:
        time.sleep(1.5)
        os._exit(0)

    threading.Thread(target=_exit_soon, daemon=True).start()


def update_worker(tid: str, info: dict) -> None:
    lang = tasks.lang_of(tid)
    base_dir = DATA_DIR / "updates" / re.sub(r"[^\w.\-]+", "_", str(info.get("tag") or "update"))
    try:
        asset_url = str(info.get("asset_url") or "")
        checksums_url = str(info.get("checksums_url") or "")
        if not is_allowed_url(asset_url):
            raise RuntimeError(tr(lang, "err.update_no_asset"))
        if not is_allowed_url(checksums_url):
            raise RuntimeError(tr(lang, "err.update_checksums"))

        if base_dir.exists():
            rmtree(base_dir, lang=lang)
        base_dir.mkdir(parents=True, exist_ok=True)
        zip_path = base_dir / ASSET_NAME

        tasks.set_message(tid, "task.update_downloading")
        _download(asset_url, zip_path, tid, lang)

        tasks.set_message(tid, "task.verifying")
        tasks.update(tid, progress=None)
        with httpx.Client(timeout=30, headers=_UA, follow_redirects=True) as client:
            sums_text = client.get(checksums_url).text
        expected = checksum_for(sums_text, ASSET_NAME)
        if not expected or _sha256(zip_path) != expected:
            raise RuntimeError(tr(lang, "err.sha_mismatch"))

        tasks.set_message(tid, "task.extracting")
        staged_parent = base_dir / "staged"
        staged_parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as archive:
            extract_zip_safe(archive, staged_parent, lang=lang)
        staged_app = staged_parent / "Intel-AI-Studio"
        if not (staged_app / "Intel-AI-Studio.exe").is_file():
            raise RuntimeError(tr(lang, "err.update_no_asset"))

        tasks.finish(tid, "task.update_ready")
        time.sleep(1.0)
        try:
            ovms.server.stop()  # release the loaded model's memory before restarting
        except Exception:
            pass
        apply_update(staged_app, lang=lang)
    except Exception as e:
        if not tasks.is_running(tid):
            try:
                rmtree(base_dir, attempts=2, lang=lang)
            except Exception:
                pass
        tasks.fail(tid, e)
