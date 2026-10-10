# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Intel AI Studio (onedir, windowed).

Build from the repository root:

    python -m PyInstaller --noconfirm --clean intel_ai_studio.spec

The output is written to ``dist/Intel-AI-Studio/`` and can be zipped and shipped
as-is. Paths in ``datas`` are resolved relative to this spec file, so the spec
must stay in the repository root.
"""

a = Analysis(
    ["ai_studio.py"],
    pathex=[],
    binaries=[],
    datas=[("app/static", "app/static")],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Heavy ML packages are only used by the on-demand tokenizer converter, which
    # installs them into the OVMS runtime (not into the app). Never bundle them.
    excludes=[
        "openvino",
        "openvino_tokenizers",
        "transformers",
        "tokenizers",
        "numpy",
        "scipy",
        "pandas",
        "sklearn",
        "torch",
        "tensorflow",
        "jax",
        "flax",
        "sentencepiece",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Intel-AI-Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Intel-AI-Studio",
)
