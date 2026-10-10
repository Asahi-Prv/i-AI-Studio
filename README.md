# Intel AI Studio

[![CI](https://github.com/Asahi-Prv/i-AI-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Asahi-Prv/i-AI-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue.svg)](https://www.python.org/downloads/)
[![Platform: Windows | Linux](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey.svg)](#requirements)

> [!IMPORTANT]
> This is an independent, community-built project. It is **not affiliated with, endorsed by, or
> sponsored by Intel Corporation**. "Intel" and "OpenVINO" are trademarks of Intel Corporation,
> used here only to describe compatibility. This is not an official Intel product.

A desktop app for [OpenVINO Model Server (OVMS)](https://github.com/openvinotoolkit/model_server).
It manages the whole lifecycle in a native WebView2 window:

- **Install OVMS runtimes** – stable (GitHub releases) or weekly builds, `python_on` packages only,
  with SHA-256 verification when available.
- **Download models** – from Hugging Face (public or gated with a token) or any direct URL
  (zip/tar auto-extract); downloads can be cancelled from the task panel.
- **Search models** – search Hugging Face for **OpenVINO IR** models only (repos must contain an
  `.xml` + `.bin` pair); results are paged with infinite scrolling, and downloads can skip non-IR
  weights (PyTorch/ONNX/...) to save disk space. Quantization is detected from the repo
  name/tags: CW (channel-wise) builds are badged, and the load dialog shows an NPU tip
  (or a warning for non-CW models) when NPU is selected.
- **Load / unload models** – device selection (CPU/GPU/NPU/AUTO), serve-mode auto-detection,
  and LLM load options such as KV-cache size, KV precision (u8), context length, and prefix caching.
- **Chat** – streaming chat with Markdown rendering, thinking-content support, auto-generated
  titles, per-chat generation parameters, and persisted chat history.
- **Generate images** – for `image_generation` models.
- **Serve an API** – OVMS itself exposes OpenAI-compatible REST and gRPC endpoints; the UI can
  manage an optional Bearer API key for external clients.
- **Self-update** – packaged builds check GitHub Releases at startup (at most once a day) and can
  update themselves in one click: download, SHA-256 verification, automatic replacement and
  restart, keeping your models and chats.
- **Bilingual UI** – English / Japanese, switchable at runtime.

## Install (Windows)

Every [release](https://github.com/Asahi-Prv/i-AI-Studio/releases) publishes two builds:

| Build | Download | How it runs |
| --- | --- | --- |
| **Installer** (recommended) | `Intel-AI-Studio-Setup-x64.exe` | Installs per-user (no admin rights), adds Start Menu and optional desktop shortcuts, and opens the UI in a native desktop window (WebView2). |
| **Portable** | `Intel-AI-Studio-windows-x64.zip` | Extract it anywhere and run `Intel-AI-Studio.exe`; the app opens in a native desktop window (no installation required). |

Both builds use the same executable; the installer just adds shortcuts and an uninstaller. Windows
may show a SmartScreen warning because the binaries are unsigned (*More info → Run anyway*). Data
(runtimes, models, chats, settings) is stored in a `data` folder next to the executable in both
builds.

## Requirements

- Windows 10/11 (x64) or Ubuntu 24.04 — matching OVMS `python_on` packages.
- Microsoft Edge WebView2 Runtime (bundled with Windows 11 and most Windows 10 systems).
- Python 3.12+ when running from source. The packaged executable bundles Python.
- Disk space: ~1–2 GB per OVMS runtime plus the size of your models.

## Quick start (source)

Windows:

```bat
git clone https://github.com/Asahi-Prv/i-AI-Studio.git
cd intel-ai-studio
run.bat
```

Linux / manual:

```bash
git clone https://github.com/Asahi-Prv/i-AI-Studio.git
cd intel-ai-studio
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

A desktop window opens automatically (the local server listens on `http://127.0.0.1:8810`).

## First steps

1. **Install a runtime** — the *Getting started* card offers "Install the latest Stable".
   Alternatively open **Settings → OpenVINO Model Server runtime**, pick Stable or Weekly,
   fetch the version list, and install a build.
2. **Download a model** — open the **Models** tab and enter a Hugging Face repo id, for example
   `OpenVINO/Qwen3-8B-int4-ov`, or use a direct URL.
3. **Load it** — choose a device and (if needed) a serve mode in the load dialog, then press
   *Load*. The UI waits until OVMS reports the model as `AVAILABLE`.
4. **Chat** — once loaded, type a message. The right sidebar holds per-chat generation parameters
   (temperature, top-p/k, max tokens, system prompt, thinking control).

## Build a standalone executable

```bat
build.bat
```

The result is `dist\Intel-AI-Studio\Intel-AI-Studio.exe`, a portable folder with the bundled
Python runtime. Verify it before shipping:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1
```

The app keeps its data in a `data` folder next to the executable. To distribute, zip the whole
`dist\Intel-AI-Studio` folder — users extract it and run the exe. Windows may show a SmartScreen
warning because the executable is unsigned (*More info → Run anyway*).

Build configuration lives in `intel_ai_studio.spec` (datas, windowed mode, no UPX). CI builds the
same spec for tags matching `v*`, smoke-tests the exe, and attaches the zip to the GitHub release
(see `.github/workflows/build.yml`).

## Image generation

Models exported for OVMS's `image_generation` task — for example
[`OpenVINO/stable-diffusion-v1-5-int8-ov`](https://huggingface.co/OpenVINO/stable-diffusion-v1-5-int8-ov) —
can be searched, downloaded, loaded and used from the image panel. See the
[OVMS image generation demo](https://docs.openvino.ai/2026/model-server/ovms_demos_image_generation.html)
for background.

Some community repositories ship the pipeline without the converted tokenizer IR
(`openvino_tokenizer.xml`). OVMS loads such a model but fails at generation time, so the load
dialog warns you and offers **Convert tokenizer IR**. The first conversion installs `openvino`,
`openvino-tokenizers`, and `transformers` into the selected OVMS runtime's bundled Python (needs
network access, a few hundred MB, once per runtime) and then converts the tokenizer locally;
later conversions reuse the installed tools.

## Using the model API from other apps

External applications should talk to OVMS directly (the UI only proxies `/proxy/*` to avoid CORS
for its own pages):

| Interface | Endpoint |
| --- | --- |
| Chat completions (OpenAI-compatible) | `POST http://<host>:8000/v3/chat/completions` |
| Embeddings | `POST http://<host>:8000/v3/embeddings` |
| Rerank | `POST http://<host>:8000/v3/rerank` |
| Speech / transcription | `POST http://<host>:8000/v3/audio/speech`, `/v3/audio/transcriptions` |
| Classic IR/ONNX models | KServe / TFS API, e.g. `POST http://<host>:8000/v2/models/<name>/infer` |
| gRPC | port `9000` |

If you set an **OVMS API key** in Settings, clients must send
`Authorization: Bearer <key>`.

## Remote API access

The management UI always listens on `127.0.0.1` and is not exposed to the network. The model API
(OVMS itself) can be exposed independently:

1. **Settings → Advanced (OVMS)** — set the bind address to `0.0.0.0` and, strongly recommended,
   an **OVMS API key**.
2. External clients connect to `http://<host>:<REST port>/v3` with
   `Authorization: Bearer <key>` (or gRPC on the gRPC port).
3. Terminate TLS with a reverse proxy (Caddy, nginx, ...) when leaving localhost.

## Configuration and data

All state lives in one data directory:

- Source checkout: `<project>/data/`
- Packaged exe: `<folder of exe>/data/`
- Override with the `AI_STUDIO_DATA` environment variable.

| Path | Contents |
| --- | --- |
| `config.json` | UI/OVMS settings, selection, secrets (HF token, OVMS API key) |
| `load_presets.json` | Per-model load options |
| `models/` | Downloaded models, one folder per model |
| `runtimes/` | Installed OVMS runtimes |
| `chats/` | Chat histories (JSON) |
| `app.log` | Log file for windowed builds |

> Secrets such as the Hugging Face token and the OVMS API key are stored **in plain text** in
> `config.json`. Protect the data directory accordingly.

## Security notes

- The management UI is bound to `127.0.0.1`; only the OVMS model API can be exposed.
- Runtime downloads are restricted to the official GitHub release / OpenVINO storage URLs, and
  SHA-256 checksums are verified when published. Archive extraction rejects path-traversal entries.
- The UI proxy injects the OVMS API key server-side so browsers never see it.
- File operations (model/runtime deletion) are confined to the data directory.

## Troubleshooting

- **Model load fails** — open **Settings → Logs**. LLM memory problems are usually fixed by a
  smaller KV cache, enabling `u8` KV precision, or a smaller context length (the *recommended
  values* button in the load dialog fills in heuristics based on free RAM).
- **`max_prompt_len` is ignored** — that option only applies to NPU; CPU/GPU reject it, so the UI
  omits it automatically.
- **Build fails on OneDrive folders** — `build.bat` builds under `%TEMP%` and copies the result to
  `dist\` to avoid OneDrive sync file locks.
- **Weekly channel shows an unexpected structure error** — the upstream file listing changed;
  please open an issue.

## Project structure

```
ai_studio.py          Entry point (also used by PyInstaller)
intel_ai_studio.spec  PyInstaller build configuration (onedir, windowed)
app/
  main.py             FastAPI routes, OVMS proxy, static hosting
  ovms.py             Runtime discovery/installation and process control
  models.py           Hugging Face / URL downloads and search, model library
  chats.py            Chat history persistence
  config.py           Paths, configuration, password hashing
  i18n.py             Backend message catalog (en/ja)
  tasks.py            In-memory background task registry
  fsutil.py           Filesystem helpers (safe delete, path containment)
  static/             SPA: index.html, app.js, i18n.js, style.css
scripts/              Helper scripts (smoke-test.ps1 for the built executable)
tests/                Backend API tests (pytest)
.github/              Workflows and issue/PR templates
```

## Development

```bash
pip install -r requirements-dev.txt
ruff check .
python -m compileall -q app ai_studio.py
```

Pull requests run the same checks in CI. The Windows executable is built by the
*Build Windows app* workflow on tags (`v*`) and via manual dispatch.

## Updates

Packaged builds check GitHub Releases on startup (at most once a day) and show an update badge on
the **Settings** tab when a newer version exists. **Settings → Updates** can check manually and
update in one click:

1. The new `Intel-AI-Studio-windows-x64.zip` is downloaded and verified against the release's
   `SHA256SUMS.txt`.
2. The app stages the new build, exits, and a small detached script replaces
   `Intel-AI-Studio.exe` and `_internal`, then restarts the app.

Your `data` folder (runtimes, models, chats, settings) is never touched. The startup check can be
disabled in the same card. When running from source, use `git pull` instead.

> Builds up to **v1.4.0** could fail to apply an update automatically (the helper script was
> started in a way that stopped it from running after the app exited). If an update does not
> restart the app, download the latest release once manually — self-updates work from v1.4.1 on.

## Contributing

Contributions are welcome! [CONTRIBUTING.md](CONTRIBUTING.md) covers the development setup,
coding and localization rules, and the pull request process
([Japanese version](CONTRIBUTING.ja.md)).

- Use the issue forms for bug reports and feature requests.
- Report security issues privately as described in [SECURITY.md](SECURITY.md).
- See [CHANGELOG.md](CHANGELOG.md) for the release history.

## License

[MIT](LICENSE) © 2026 Asahi

Intel and OpenVINO are trademarks of Intel Corporation. This project is not affiliated with,
endorsed by, or sponsored by Intel Corporation.
