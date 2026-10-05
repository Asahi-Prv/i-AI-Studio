import os
import sys
import tempfile
from pathlib import Path

# Point the app at a throwaway data directory before it is imported.
os.environ.setdefault("AI_STUDIO_DATA", tempfile.mkdtemp(prefix="ai-studio-tests-"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
