"""Path and configuration handling for Intel AI Studio."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sys
from pathlib import Path

from .version import __version__

APP_NAME = "Intel AI Studio"
APP_VERSION = __version__

# PBKDF2-HMAC-SHA256 iterations for UI passwords (OWASP 2023+ recommendation).
PBKDF2_ITERATIONS = 600_000
_LEGACY_PBKDF2_ITERATIONS = 20_000


def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        # PyInstaller bundle: keep user data next to the executable.
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


BASE_DIR = _base_dir()
DATA_DIR = Path(os.environ.get("AI_STUDIO_DATA", str(BASE_DIR / "data"))).resolve()
MODELS_DIR = DATA_DIR / "models"        # downloaded models (one folder per model)
RUNTIMES_DIR = DATA_DIR / "runtimes"    # installed ovms builds
CONFIG_PATH = DATA_DIR / "config.json"
PRESETS_PATH = DATA_DIR / "load_presets.json"  # per-model load options

# load-time-only options (text_generation pull-mode flags validated against ovms --help)
LOAD_OPTION_KEYS = ("device", "mode", "max_prompt_len", "cache_size", "max_num_seqs",
                    "max_num_batched_tokens", "kv_cache_precision", "enable_prefix_caching",
                    "pipeline_type")


def load_presets() -> dict:
    try:
        return json.loads(PRESETS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_preset(model: str, opts: dict) -> None:
    ensure_dirs()
    presets = load_presets()
    presets[model] = {k: v for k, v in opts.items() if k in LOAD_OPTION_KEYS and v not in (None, "")}
    PRESETS_PATH.write_text(json.dumps(presets, ensure_ascii=False, indent=1), encoding="utf-8")


def get_preset(model: str) -> dict:
    return load_presets().get(model, {})


def _static_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "app" / "static"  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent / "static"


STATIC_DIR = _static_dir()

DEFAULTS = {
    "ui_port": 8810,
    "rest_port": 8000,
    "grpc_port": 9000,
    "bind_address": "127.0.0.1",
    "target_device": "AUTO",
    "serve_mode": "auto",          # auto / classic / text_generation
    "extra_args": "",
    "selected_runtime": None,      # dirname under data/runtimes
    "selected_model": None,        # dirname under data/models
    "hf_token": "",
    # optional auth for exposure beyond localhost
    "ui_auth_enabled": False,      # Basic auth for this management UI
    "ui_auth_user": "",
    "ui_auth_pass_hash": "",       # "salt$hex" (PBKDF2)
    "ovms_api_key": "",            # Bearer key required by OVMS itself (API_KEY env)
}


def hash_password(pw: str, salt: str | None = None,
                  iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), iterations)
    return f"{iterations}${salt}${h.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    """Verify a password against either the current or legacy hash format."""
    try:
        parts = stored.split("$")
        if len(parts) == 3:  # iterations$salt$hex
            iterations, salt, expected = int(parts[0]), parts[1], parts[2]
        elif len(parts) == 2:  # legacy salt$hex (20k iterations)
            iterations, salt, expected = _LEGACY_PBKDF2_ITERATIONS, parts[0], parts[1]
        else:
            return False
        h = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), iterations)
        return secrets.compare_digest(h.hex().encode("utf-8"), expected.encode("utf-8"))
    except Exception:
        return False


def ensure_dirs() -> None:
    for d in (DATA_DIR, MODELS_DIR, RUNTIMES_DIR):
        d.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    ensure_dirs()
    cfg = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig")))  # tolerate BOM
        except Exception:
            pass
    return cfg


def save_config(updates: dict) -> dict:
    cfg = load_config()
    cfg.update({k: v for k, v in updates.items() if k in DEFAULTS})
    ensure_dirs()
    CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return cfg
