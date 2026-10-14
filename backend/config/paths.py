"""Path helpers that work both from source and inside a PyInstaller bundle."""

import sys
from pathlib import Path


def is_frozen() -> bool:
    return bool(getattr(sys, 'frozen', False))


def bundle_root() -> Path:
    """Directory holding bundled data files.

    Frozen: PyInstaller's extraction dir (``sys._MEIPASS``, ``_internal`` for onedir).
    Source: the ``backend`` directory.
    """
    if is_frozen():
        return Path(getattr(sys, '_MEIPASS', Path(sys.executable).parent))
    return Path(__file__).resolve().parent.parent


def frontend_dist_default() -> Path:
    if is_frozen():
        return bundle_root() / 'frontend-dist'
    return bundle_root().parent / 'frontend' / 'dist-desktop'
