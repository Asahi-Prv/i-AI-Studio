# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-10-08

### Changed

- Configuration and app state are cached by file timestamp, so API calls no longer re-read
  `config.json` on every request (including the auth middleware).
- The load dialog opens immediately: it shows the last known devices and fills in the real
  OpenVINO device list asynchronously, so the first probe no longer blocks it.
- Downloads and installs show up in the task panel immediately instead of after the next poll.
- Deleting models and chats updates the list optimistically and rolls back on failure
  (removing multi-GB model folders no longer freezes the list).
- Refreshed UI: design tokens, animated overlays/toasts/task panel, custom scrollbars,
  focus-visible rings, hover/active feedback, SVG icons, and a responsive two-column Settings
  layout.

## [1.3.0] - 2026-10-06

### Changed

- Smoother UI: the status and task panels only re-render when something actually changed, task
  rows are updated in place (progress bars animate instead of resetting every poll), and polling
  pauses while the tab is hidden.
- Streaming chat repaints on animation frames, auto-scrolls only while you are near the bottom,
  and streams very long answers as plain text before rendering Markdown at the end.
- Auto-generated chat titles now wait for 8 seconds of idle time (and abort after 20 seconds), so
  they no longer occupy the model while you type your next message.
- The model dropdown is only rebuilt when the model list actually changes.

### Added

- JavaScript syntax checks and Markdown renderer tests (QuickJS) in the test suite.

## [1.2.0] - 2026-10-06

### Added

- Native desktop mode: `--desktop` opens the UI in a WebView2 window instead of the browser.
- Windows installer (`Intel-AI-Studio-Setup-x64.exe`, Inno Setup): per-user install with Start
  Menu and optional desktop shortcuts. The portable zip remains available.
- The NPU device option is now only offered when the installed runtime reports an NPU.
- Releases now ship the installer alongside the portable zip, and checksums cover both.

### Fixed

- Self-update no longer hangs when Windows reuses the old process id: the updater waits for the
  executable lock to be released instead of polling a PID.

## [1.1.1] - 2026-10-05

### Changed

- Documented the self-update flow in the README (English/Japanese).

## [1.1.0] - 2026-10-05

### Added

- Self-update for packaged builds: a startup check (at most once a day) plus a one-click update
  that downloads the new release, verifies its SHA-256, replaces the app and restarts it while
  keeping the `data` folder. Source runs show a `git pull` hint instead.
- Update notification: a red dot on the Settings tab and an Updates card in Settings.
- Escape-first ZIP extraction helper shared by runtime installs and updates.

## [1.0.3] - 2026-10-05

### Added

- Markdown rendering for model responses (headings, lists, tables, code blocks, links, emphasis).
- Automatic chat titles: the loaded model suggests a short title after the first exchange.
- Cancellable downloads and runtime installs (cancel button in the task panel).
- Paged OpenVINO IR model search with infinite scrolling and a "Load more" fallback.

### Changed

- The **New Chat** button no longer creates an empty chat immediately; the chat is created when
  the first prompt is sent.
- Enter sends a chat message and Shift+Enter inserts a newline (IME-safe while converting).

## [1.0.2] - 2026-10-05

### Added

- Show the application version in **Settings → Info**.
- Curated release notes generated from conventional commits, with SHA-256 checksums attached
  to each release (`SHA256SUMS.txt`).
- `.github/release.yml` so GitHub's built-in release-note generator groups PRs by label.

### Changed

- Release builds take their version from the git tag (`app/version.py` is rewritten in CI).

## [1.0.1] - 2026-10-05

### Fixed

- Packaged executable: bundled OVMS runtimes now start correctly. OVMS ships an embeddable
  Python whose search paths live in `pythonXY._pth` (stdlib under `python\pythonXY`); those
  entries are now mirrored through `PYTHONPATH`, fixing
  `ModuleNotFoundError: No module named 'encodings'`.
- The configured gRPC port is now applied on OVMS builds that renamed `--grpc_port` to `--port`
  (previously the flag was silently dropped and gRPC stayed disabled).

## [1.0] - 2026-10-05

### Added

- Initial public release.
- OVMS runtime installer: stable (GitHub releases) and weekly builds, `python_on` packages only,
  SHA-256 verification when available.
- Model downloads from Hugging Face (public and gated) and direct URLs (zip/tar auto-extract).
- OpenVINO IR-only model search on Hugging Face (`.xml` + `.bin` pair required), with optional
  downloads that skip non-IR weights.
- Model load/unload with device selection (CPU/GPU/NPU/AUTO), serve-mode auto-detection, and
  LLM load options (KV cache size/precision, context length, prefix caching, ...).
- Streaming chat (thinking content, per-chat generation parameters, persisted history) and
  image generation.
- English / Japanese UI with a runtime language switch.
- Optional management-UI login (PBKDF2, session cookie, rate limiting) and OVMS API key,
  local-first defaults.
- One-click Windows build (PyInstaller spec) with CI lint/tests, executable smoke test, and
  automatic GitHub releases.

[Unreleased]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0...v1.0.1
[1.0]: https://github.com/Asahi-Prv/i-AI-Studio/releases/tag/v1.0
