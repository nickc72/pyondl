import os
import sys
import time
import webbrowser
import threading
from pathlib import Path

# Add current directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Fix for Windows asyncio ProactorEventLoop WinError 10054 bug
if sys.platform == "win32":
    try:
        from asyncio.proactor_events import _ProactorBasePipeTransport
        _orig_call_connection_lost = _ProactorBasePipeTransport._call_connection_lost

        def _silenced_call_connection_lost(self, exc):
            try:
                _orig_call_connection_lost(self, exc)
            except (ConnectionResetError, OSError):
                pass

        _ProactorBasePipeTransport._call_connection_lost = _silenced_call_connection_lost
    except Exception:
        pass

from app.config import HOST, PORT, DOWNLOADS_DIR, GALLERY_DL_BIN
import uvicorn

def open_browser():
    time.sleep(1.2)
    url = f"http://{HOST}:{PORT}"
    print(f"Opening browser at {url}...")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")

if __name__ == "__main__":
    banner = f"""
==============================================================
  PyonDL & Reader - Powered by gallery-dl
==============================================================
  Local Web URL : http://{HOST}:{PORT}
  Downloads Dir : {DOWNLOADS_DIR}
  gallery-dl    : {GALLERY_DL_BIN}
  Features      :
    - Inbuilt Manga Reader (Single, Double Spread, Webtoon)
    - Fit-Wide Mode (Press 'W' to cover entire screen width)
    - Fullscreen Mode (Press 'F' for distraction-free reading)
    - Live streaming downloader with progress & logs
==============================================================
"""
    print(banner)

    # Start browser auto-opener in background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Start Uvicorn ASGI server with websockets enabled
    uvicorn.run("app.main:app", host=HOST, port=PORT, ws="auto", reload=False, log_level="info")
