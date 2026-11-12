from pathlib import Path
import sys
import shutil

BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Determine gallery-dl executable path
venv_gallery_dl_win = BASE_DIR / ".venv" / "Scripts" / "gallery-dl.exe"
venv_gallery_dl_nix = BASE_DIR / ".venv" / "bin" / "gallery-dl"

if venv_gallery_dl_win.exists():
    GALLERY_DL_BIN = str(venv_gallery_dl_win)
elif venv_gallery_dl_nix.exists():
    GALLERY_DL_BIN = str(venv_gallery_dl_nix)
elif shutil.which("gallery-dl"):
    GALLERY_DL_BIN = shutil.which("gallery-dl")
else:
    GALLERY_DL_BIN = "gallery-dl"

# Determine python executable path
venv_python_win = BASE_DIR / ".venv" / "Scripts" / "python.exe"
venv_python_nix = BASE_DIR / ".venv" / "bin" / "python"

if venv_python_win.exists():
    PYTHON_BIN = str(venv_python_win)
elif venv_python_nix.exists():
    PYTHON_BIN = str(venv_python_nix)
else:
    PYTHON_BIN = sys.executable or "python"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"}
HOST = "127.0.0.1"
PORT = 8765
