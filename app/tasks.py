"""In-memory background task registry (downloads, installs)."""
from __future__ import annotations

import threading
import time
import uuid

from . import i18n

_lock = threading.Lock()
_tasks: dict[str, dict] = {}
_KEEP_FINISHED_SEC = 3600


def create(kind: str, title: str, lang: str | None = None) -> str:
    tid = uuid.uuid4().hex[:12]
    lng = i18n.normalize(lang)
    with _lock:
        _tasks[tid] = {
            "id": tid,
            "kind": kind,
            "title": title,
            "lang": lng,
            "status": "running",  # running / done / error
            "created_at": time.time(),
            "finished_at": None,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "progress": None,  # 0..1 or None (indeterminate)
            "message": i18n.tr(lng, "task.preparing"),
            "error": None,
        }
    return tid


def lang_of(tid: str) -> str:
    with _lock:
        t = _tasks.get(tid)
    return t["lang"] if t else i18n.DEFAULT_LANG


def update(tid: str, **kw) -> None:
    with _lock:
        t = _tasks.get(tid)
        if t is not None:
            t.update(kw)


def set_message(tid: str, key: str, **fmt) -> None:
    """Update the status message using a catalog key in the task's language."""
    with _lock:
        t = _tasks.get(tid)
        if t is not None:
            t["message"] = i18n.tr(t["lang"], key, **fmt)


def finish(tid: str, key: str = "task.done", **fmt) -> None:
    with _lock:
        t = _tasks.get(tid)
        if t is not None and t["status"] == "running":
            t.update(status="done", finished_at=time.time(),
                     message=i18n.tr(t["lang"], key, **fmt), progress=1.0)


def fail(tid: str, error) -> None:
    with _lock:
        t = _tasks.get(tid)
        if t is not None and t["status"] == "running":
            t.update(status="error", finished_at=time.time(), error=str(error),
                     message=i18n.tr(t["lang"], "task.failed"))


def cancel(tid: str) -> bool:
    """Mark a running task as cancelled; workers stop at their next checkpoint."""
    with _lock:
        t = _tasks.get(tid)
        if t is None or t["status"] != "running":
            return False
        t.update(status="cancelled", finished_at=time.time(),
                 message=i18n.tr(t["lang"], "task.cancelled"), progress=None)
        return True


def set_progress(tid: str, downloaded: int, total: int) -> None:
    with _lock:
        t = _tasks.get(tid)
        if not t:
            return
        t["downloaded_bytes"] = int(downloaded)
        t["total_bytes"] = int(total)
        _recalc(t)


def _recalc(t: dict) -> None:
    if t["total_bytes"] > 0:
        t["progress"] = max(0.0, min(0.999, t["downloaded_bytes"] / t["total_bytes"]))
    else:
        t["progress"] = None


def is_running(tid: str) -> bool:
    with _lock:
        t = _tasks.get(tid)
        return bool(t) and t["status"] == "running"


def list_all() -> list[dict]:
    now = time.time()
    with _lock:
        # prune old finished tasks
        for tid in [tid for tid, t in _tasks.items()
                    if t["finished_at"] and now - t["finished_at"] > _KEEP_FINISHED_SEC]:
            _tasks.pop(tid, None)
        return [dict(t) for t in sorted(_tasks.values(), key=lambda t: t["created_at"], reverse=True)]
