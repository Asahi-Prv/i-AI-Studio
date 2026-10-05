"""Model downloads (Hugging Face / direct URL) and library management."""
from __future__ import annotations

import json
import re
import shutil
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

import httpx

from . import tasks
from .config import MODELS_DIR
from .fsutil import is_within, rmtree
from .i18n import tr

_UA = {"User-Agent": "intel-ai-studio"}
_META = ".ovmsui.json"

HF_API = "https://huggingface.co/api/models"
HF_SEARCH_SORTS = ("downloads", "likes", "lastModified")
HF_SEARCH_LIMIT_MAX = 50

# Weight formats skipped by "IR only" downloads. Configs, tokenizers and chat
# templates are kept so the downloaded folder stays loadable by OVMS.
IR_IGNORE_PATTERNS = (
    "*.safetensors",
    "*.pth",
    "*.pt",
    "*.onnx",
    "*.msgpack",
    "*.h5",
    "*.tflite",
    "*.ot",
    "*.gguf",
    "*.ckpt",
    "*.mlmodel",
    "*pytorch_model*.bin",
    "*tf_model*.h5",
    "*flax_model*.msgpack",
)


def is_ov_ir(files: list[str]) -> bool:
    """True when a repo contains an OpenVINO IR pair (.xml + .bin)."""
    names = [str(f).lower() for f in files]
    return any(n.endswith(".xml") for n in names) and any(n.endswith(".bin") for n in names)


def search_hf_ir(query: str, limit: int = 30, sort: str = "downloads",
                 token: str | None = None) -> list[dict]:
    """Search Hugging Face for models tagged ``openvino`` that actually ship IR files.

    Repos without an .xml/.bin pair (or without the tag) are filtered out, so the
    result is restricted to OpenVINO IR models.
    """
    params = {
        "search": query,
        "filter": "openvino",
        "sort": sort if sort in HF_SEARCH_SORTS else HF_SEARCH_SORTS[0],
        "direction": -1,
        "limit": max(1, min(int(limit), HF_SEARCH_LIMIT_MAX)),
        "full": "true",
    }
    headers = dict(_UA)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with httpx.Client(timeout=30, headers=headers) as c:
        r = c.get(HF_API, params=params)
        r.raise_for_status()
        models = r.json()
    out = []
    for m in models if isinstance(models, list) else []:
        files = [str(s.get("rfilename") or "") for s in (m.get("siblings") or [])]
        if not is_ov_ir(files):
            continue
        out.append({
            "repo_id": m.get("id") or m.get("modelId") or "",
            "downloads": int(m.get("downloads") or 0),
            "likes": int(m.get("likes") or 0),
            "last_modified": m.get("lastModified") or "",
            "gated": bool(m.get("gated")),
            "pipeline_tag": m.get("pipeline_tag") or "",
            "library_name": m.get("library_name") or "",
            "files": len(files),
        })
    return out


def _safe_name(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|]+', "-", s).strip(". ")
    return s or "model"


def _unique_dir(base: str) -> Path:
    base = _safe_name(base)
    d = MODELS_DIR / base
    n = 1
    while d.exists():
        d = MODELS_DIR / f"{base}-{n}"
        n += 1
    return d


def _dir_size(d: Path) -> int:
    total = 0
    for p in d.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def detect_kind(d: Path) -> str:
    """Heuristic: GenAI task / 'classic' (IR/ONNX single model) / 'unknown'.
    embeddings/rerank/speech can't be told apart from files; user picks manually."""
    try:
        names = {p.name.lower() for p in d.iterdir() if p.is_file()}
    except OSError:
        return "unknown"
    if "model_index.json" in names:
        return "image_generation"  # diffusers-style layout
    llm_markers = {"openvino_tokenizer.xml", "openvino_detokenizer.xml", "tokenizer.json",
                   "generation_config.json", "graph.pbtxt"}
    if names & llm_markers:
        return "text_generation"
    xmls = [n for n in names if n.endswith(".xml") and not n.startswith("openvino_")]
    if xmls or any(n.endswith(".onnx") for n in names):
        return "classic"
    # look one level down (e.g. zip extracted into a subfolder)
    for p in d.iterdir():
        if p.is_dir() and not p.name.startswith("."):
            k = detect_kind(p)
            if k != "unknown":
                return k
    return "unknown"


def model_size_bytes(name: str) -> int:
    d = MODELS_DIR / name
    return _dir_size(d) if d.is_dir() else 0


def scan() -> list[dict]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for d in sorted(MODELS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not d.is_dir():
            continue
        meta = {}
        mj = d / _META
        if mj.exists():
            try:
                meta = json.loads(mj.read_text(encoding="utf-8"))
            except Exception:
                pass
        n_files = sum(1 for p in d.rglob("*") if p.is_file())
        out.append({
            "name": d.name,
            "size": _dir_size(d),
            "files": n_files,
            "kind": detect_kind(d),
            "source": meta.get("source", ""),
            "origin": meta.get("origin", ""),
            "downloaded_at": meta.get("downloaded_at", 0),
        })
    return out


def delete(name: str, lang: str | None = None) -> None:
    d = MODELS_DIR / name
    if not is_within(d, MODELS_DIR) or not d.is_dir():
        raise RuntimeError(tr(lang, "err.model_not_found_id", name=name))
    rmtree(d, lang=lang)


def _write_meta(d: Path, source: str, origin: str) -> None:
    try:
        (d / _META).write_text(json.dumps(
            {"source": source, "origin": origin, "downloaded_at": time.time()},
            ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _hf_expected_bytes(repo_id: str, revision: str | None,
                       allow_patterns: list[str] | None, token: str | None,
                       ignore_patterns: list[str] | None = None) -> int:
    """Best-effort total size for progress display (0 = unknown)."""
    import fnmatch
    try:
        from huggingface_hub import HfApi
        info = HfApi(token=token).model_info(repo_id, revision=revision or None,
                                             files_metadata=True)
        total = 0
        for f in info.siblings or []:
            name = getattr(f, "rfilename", "") or ""
            size = getattr(f, "size", None) or 0
            if allow_patterns and not any(fnmatch.fnmatch(name, p) for p in allow_patterns):
                continue
            if ignore_patterns and any(fnmatch.fnmatch(name, p) for p in ignore_patterns):
                continue
            if name.endswith((".gitattributes", ".lock")):
                continue
            total += int(size)
        return total
    except Exception:
        return 0


def download_hf_worker(tid: str, repo_id: str, revision: str | None,
                       allow_patterns: list[str] | None, token: str | None,
                       ignore_patterns: list[str] | None = None) -> None:
    lang = tasks.lang_of(tid)
    dest = _unique_dir(repo_id.split("/")[-1])
    dest.mkdir(parents=True, exist_ok=True)
    tasks.set_message(tid, "task.hf_downloading", repo=repo_id)
    try:
        from huggingface_hub import snapshot_download
        from tqdm import tqdm as _tqdm

        expected = _hf_expected_bytes(repo_id, revision, allow_patterns, token, ignore_patterns)
        bars: dict[int, int] = {}
        bars_lock = threading.Lock()

        class _PTqdm(_tqdm):  # hf_hub v1: bar totals are file counts; track bytes per bar
            def update(self, n=1):
                super().update(n)
                with bars_lock:
                    bars[id(self)] = int(self.n or 0)
                    done = sum(bars.values())
                if expected > 0:
                    tasks.set_progress(tid, min(done, expected), expected)
                else:
                    tasks.update(tid, downloaded_bytes=done)

        kwargs = dict(repo_id=repo_id, revision=revision or None, local_dir=str(dest),
                      allow_patterns=allow_patterns or None,
                      ignore_patterns=list(ignore_patterns) if ignore_patterns else None,
                      token=token or None, max_workers=4)
        try:
            snapshot_download(tqdm_class=_PTqdm, **kwargs)
        except TypeError:  # tqdm_class unsupported in this hf_hub version
            snapshot_download(**kwargs)
        _write_meta(dest, "huggingface",
                    repo_id + (f"@{revision}" if revision else ""))
        tasks.finish(tid, "task.done_name", name=dest.name)
    except Exception as e:
        if not any(dest.iterdir()):
            rmtree(dest, attempts=2, lang=lang)
        tasks.fail(tid, e)


def _filename_from_response(r: httpx.Response, url: str) -> str:
    cd = r.headers.get("content-disposition", "")
    m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', cd, re.I)
    if m:
        return _safe_name(unquote(m.group(1)))
    base = urlsplit(url).path.rsplit("/", 1)[-1]
    return _safe_name(unquote(base)) if base else "download.bin"


def download_url_worker(tid: str, url: str, name: str | None, extract: bool) -> None:
    lang = tasks.lang_of(tid)
    try:
        tasks.set_message(tid, "task.downloading")
        with httpx.stream("GET", url, headers=_UA, follow_redirects=True, timeout=120) as r:
            r.raise_for_status()
            fname = _filename_from_response(r, str(r.url))
            total = int(r.headers.get("content-length") or 0)
            folder = _unique_dir(name or Path(fname).stem)
            folder.mkdir(parents=True, exist_ok=True)
            dest_file = folder / fname
            done = 0
            with dest_file.open("wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    if not tasks.is_running(tid):
                        raise RuntimeError(tr(lang, "err.cancelled"))
                    f.write(chunk)
                    done += len(chunk)
                    tasks.set_progress(tid, done, total)
        if extract and re.search(r"\.(zip|tar\.gz|tgz|tar)$", fname, re.I):
            tasks.set_message(tid, "task.extracting")
            tasks.update(tid, progress=None)
            shutil.unpack_archive(str(dest_file), str(folder))
            dest_file.unlink(missing_ok=True)
        _write_meta(folder, "url", url)
        tasks.finish(tid, "task.done_name", name=folder.name)
    except Exception as e:
        tasks.fail(tid, e)
