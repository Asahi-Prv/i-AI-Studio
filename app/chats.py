"""Chat session persistence (JSON files under data/chats)."""
from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path

from .config import DATA_DIR
from .i18n import tr

CHATS_DIR = DATA_DIR / "chats"
_ID_RE = re.compile(r"^[0-9a-f]{12}$")

# per-chat generation params; max_tokens defaults big enough for thinking models
DEFAULT_PARAMS: dict = {
    "temperature": 0.7,
    "top_p": 0.95,
    "top_k": 40,
    "max_tokens": 4096,
    "repetition_penalty": 1.0,
    "system_prompt": "",
    "suppress_thinking": False,  # -> chat_template_kwargs.enable_thinking=false (supported models)
}
_PARAM_FLOAT = ("temperature", "top_p", "repetition_penalty")
_PARAM_INT = ("top_k", "max_tokens")
_PARAM_STR = ("system_prompt",)
_PARAM_BOOL = ("suppress_thinking",)


def _ensure() -> None:
    CHATS_DIR.mkdir(parents=True, exist_ok=True)


def _check_id(cid: str, lang: str | None = None) -> None:
    if not _ID_RE.match(cid or ""):
        raise RuntimeError(tr(lang, "err.bad_chat_id"))


def _path(cid: str, lang: str | None = None) -> Path:
    _check_id(cid, lang)
    return CHATS_DIR / f"{cid}.json"


def list_chats(lang: str | None = None) -> list[dict]:
    _ensure()
    out = []
    for p in CHATS_DIR.glob("*.json"):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            out.append({
                "id": d["id"],
                "title": d.get("title") or tr(lang, "chat.untitled"),
                "model": d.get("model", ""),
                "updated_at": d.get("updated_at", 0),
            })
        except Exception:
            continue
    out.sort(key=lambda c: c.get("updated_at", 0), reverse=True)
    return out


def create(lang: str | None = None) -> dict:
    _ensure()
    now = time.time()
    cid = uuid.uuid4().hex[:12]
    chat = {
        "id": cid,
        "title": tr(lang, "chat.new_title"),
        "model": "",
        "params": dict(DEFAULT_PARAMS),
        "messages": [],
        "created_at": now,
        "updated_at": now,
    }
    _path(cid).write_text(json.dumps(chat, ensure_ascii=False, indent=1), encoding="utf-8")
    return chat


def get(cid: str, lang: str | None = None) -> dict:
    p = _path(cid, lang)
    if not p.exists():
        raise RuntimeError(tr(lang, "err.chat_not_found"))
    return json.loads(p.read_text(encoding="utf-8"))


def save(cid: str, data: dict, lang: str | None = None) -> dict:
    chat = get(cid, lang)
    if "title" in data:
        chat["title"] = str(data["title"])[:120] or tr(lang, "chat.untitled")
    if "model" in data:
        chat["model"] = str(data["model"])
    if "params" in data and isinstance(data["params"], dict):
        merged = dict(DEFAULT_PARAMS)
        src = data["params"]
        for k in DEFAULT_PARAMS:
            if k not in src:
                continue
            try:
                if k in _PARAM_FLOAT:
                    merged[k] = float(src[k])
                elif k in _PARAM_INT:
                    merged[k] = int(float(src[k]))
                elif k in _PARAM_STR:
                    merged[k] = str(src.get(k, ""))[:4000]
                elif k in _PARAM_BOOL:
                    merged[k] = bool(src[k])
            except (TypeError, ValueError):
                pass
        chat["params"] = merged
    if "messages" in data and isinstance(data["messages"], list):
        msgs = []
        for m in data["messages"]:
            role = m.get("role")
            if role in ("system", "user", "assistant"):
                msgs.append({"role": role, "content": str(m.get("content", ""))})
        chat["messages"] = msgs
    chat["updated_at"] = time.time()
    _path(cid).write_text(json.dumps(chat, ensure_ascii=False, indent=1), encoding="utf-8")
    return chat


def delete(cid: str, lang: str | None = None) -> None:
    p = _path(cid, lang)
    if p.exists():
        p.unlink()
