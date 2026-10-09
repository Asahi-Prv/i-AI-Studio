"""Subprocess helpers."""
from __future__ import annotations

import os
import subprocess


def subprocess_flags() -> int:
    """``creationflags`` that keep child processes from opening a console window.

    OVMS and its bundled python.exe are console applications; when this app runs
    without a console (windowed PyInstaller / WebView2 build), Windows would give
    every child a new console window without these flags.
    """
    if os.name != "nt":
        return 0
    return subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP


_job_handle = None


def bind_to_job(proc) -> bool:
    """Kill ``proc`` automatically when this process exits (Windows job object).

    Without this, a crashed or force-killed manager leaves the OVMS child running,
    holding its RAM/VRAM. Best effort: returns False when the process could not be
    assigned (for example when running inside a restricted CI job).
    """
    global _job_handle
    if os.name != "nt":
        return False
    try:
        import ctypes
        from ctypes import wintypes

        class _IoCounters(ctypes.Structure):
            _fields_ = [("ReadOperationCount", ctypes.c_ulonglong),
                        ("WriteOperationCount", ctypes.c_ulonglong),
                        ("OtherOperationCount", ctypes.c_ulonglong),
                        ("ReadTransferCount", ctypes.c_ulonglong),
                        ("WriteTransferCount", ctypes.c_ulonglong),
                        ("OtherTransferCount", ctypes.c_ulonglong)]

        class _BasicLimitInformation(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", wintypes.LARGE_INTEGER),
                        ("PerJobUserTimeLimit", wintypes.LARGE_INTEGER),
                        ("LimitFlags", wintypes.DWORD),
                        ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t),
                        ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t),
                        ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class _ExtendedLimitInformation(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", _BasicLimitInformation),
                        ("IoInfo", _IoCounters),
                        ("ProcessMemoryLimit", ctypes.c_size_t),
                        ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t),
                        ("PeakJobMemoryUsed", ctypes.c_size_t)]

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        if _job_handle is None:
            _job_handle = kernel32.CreateJobObjectW(None, None)
            if not _job_handle:
                return False
            info = _ExtendedLimitInformation()
            info.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
            kernel32.SetInformationJobObject(_job_handle, 9, ctypes.byref(info), ctypes.sizeof(info))
        return bool(kernel32.AssignProcessToJobObject(_job_handle, wintypes.HANDLE(int(proc._handle))))
    except Exception:
        return False
