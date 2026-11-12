import os
import sys
import subprocess
from pathlib import Path
from typing import List, Optional

# Apply Windows asyncio bug fix for WinError 10054
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

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.config import DOWNLOADS_DIR, BASE_DIR
from app.models import DownloadRequest, JobInfo, LibraryResponse, OpenFolderRequest, BookmarkItem
from app.downloader import download_manager
from app.library import library_manager, decode_id

app = FastAPI(title="PyonDL - Manga & Gallery-dl Reader", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure sample manga exists if downloads is completely empty
if not any(f for f in DOWNLOADS_DIR.iterdir() if f.name != ".gitkeep" and not f.name.startswith(".")):
    try:
        library_manager.create_sample_manga()
    except Exception as e:
        print(f"Could not initialize sample manga: {e}")

# Mount static files and downloaded files
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")
app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR)), name="downloads")

# Active WebSocket connections
connected_websockets: List[WebSocket] = []

async def ws_broadcast_handler(event_payload: dict):
    dead_sockets = []
    for ws in list(connected_websockets):
        try:
            await ws.send_json(event_payload)
        except Exception:
            dead_sockets.append(ws)
    for ws in dead_sockets:
        if ws in connected_websockets:
            connected_websockets.remove(ws)

download_manager.register_listener(ws_broadcast_handler)

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = BASE_DIR / "app" / "static" / "index.html"
    return FileResponse(index_path)

@app.websocket("/ws/downloads")
async def websocket_downloads(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    try:
        # Send initial state
        jobs = [j.model_dump() for j in download_manager.get_all_jobs()]
        await websocket.send_json({"type": "init_jobs", "data": jobs})
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, ConnectionResetError):
        pass
    except Exception:
        pass
    finally:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)

# ----------------- Downloader Endpoints -----------------

@app.post("/api/download")
async def start_download(request: DownloadRequest):
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    job = await download_manager.create_and_start_job(request)
    return {"status": "ok", "job": job.model_dump()}

@app.get("/api/jobs")
async def get_jobs():
    return [j.model_dump() for j in download_manager.get_all_jobs()]

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    job = download_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.model_dump()

@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    success = await download_manager.cancel_job(job_id)
    return {"status": "ok", "cancelled": success}

@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    success = download_manager.remove_job(job_id)
    return {"status": "ok", "removed": success}

# ----------------- Library Endpoints -----------------

@app.get("/api/library", response_model=LibraryResponse)
async def get_library():
    return library_manager.scan_library()

@app.get("/api/library/{item_id}")
async def get_library_item(item_id: str):
    item = library_manager.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Manga or Chapter not found")
    return item.model_dump()

@app.delete("/api/library/{item_id}")
async def delete_library_item(item_id: str):
    success = library_manager.delete_item(item_id)
    if not success:
        raise HTTPException(status_code=400, detail="Could not delete item")
    await download_manager.broadcast("library_updated", {})
    return {"status": "ok", "deleted": True}

@app.post("/api/library/open-folder")
async def open_folder(request: OpenFolderRequest):
    decoded = decode_id(request.item_id)
    target_path = DOWNLOADS_DIR / decoded
    if not target_path.exists():
        target_path = DOWNLOADS_DIR

    try:
        if sys.platform == "win32":
            subprocess.Popen(["explorer.exe", str(target_path)])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target_path)])
        else:
            subprocess.Popen(["xdg-open", str(target_path)])
        return {"status": "ok", "path": str(target_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/library/create-sample")
async def create_sample():
    path = library_manager.create_sample_manga()
    await download_manager.broadcast("library_updated", {})
    return {"status": "ok", "path": path}

@app.get("/api/bookmarks")
async def get_all_bookmarks():
    return library_manager.get_bookmarks()

@app.post("/api/bookmarks")
async def save_bookmark(bookmark: BookmarkItem):
    data = bookmark.model_dump()
    if not data.get("updated_at"):
        from datetime import datetime, timezone
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
    success = library_manager.save_bookmark(data)
    if not success:
        raise HTTPException(status_code=500, detail="Could not save bookmark")
    return {"status": "ok", "bookmark": data}

@app.delete("/api/bookmarks/{manga_id}")
async def delete_bookmark(manga_id: str):
    success = library_manager.delete_bookmark(manga_id)
    if not success:
        raise HTTPException(status_code=500, detail="Could not delete bookmark")
    return {"status": "ok", "deleted": manga_id}

@app.get("/api/supported-sites")
async def get_supported_sites():
    return [
        {"name": "MangaDex", "domain": "mangadex.org", "category": "Manga", "example": "https://mangadex.org/title/..."},
        {"name": "Danbooru", "domain": "danbooru.donmai.us", "category": "Art / Anime", "example": "https://danbooru.donmai.us/posts?..."},
        {"name": "Gelbooru", "domain": "gelbooru.com", "category": "Art / Anime", "example": "https://gelbooru.com/index.php?..."},
        {"name": "Pixiv", "domain": "pixiv.net", "category": "Art / Manga", "example": "https://www.pixiv.net/en/artworks/..."},
        {"name": "Imgur", "domain": "imgur.com", "category": "Image Albums", "example": "https://imgur.com/a/..."},
        {"name": "Reddit", "domain": "reddit.com", "category": "Galleries / Posts", "example": "https://www.reddit.com/r/..."},
        {"name": "Twitter / X", "domain": "x.com / twitter.com", "category": "Social / Art", "example": "https://x.com/.../status/..."},
        {"name": "Webtoons", "domain": "webtoons.com", "category": "Manhwa / Webtoons", "example": "https://www.webtoons.com/..."}
    ]
