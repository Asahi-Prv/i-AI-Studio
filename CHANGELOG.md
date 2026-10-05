# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Asahi-Prv/i-AI-Studio/compare/v1.0...v1.0.1
[1.0]: https://github.com/Asahi-Prv/i-AI-Studio/releases/tag/v1.0
