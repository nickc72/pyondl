import asyncio
import os
import re
import shlex
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Callable, Awaitable

from app.config import GALLERY_DL_BIN, DOWNLOADS_DIR
from app.models import DownloadRequest, JobInfo

class DownloadManager:
    def __init__(self):
        self.jobs: Dict[str, JobInfo] = {}
        self.processes: Dict[str, asyncio.subprocess.Process] = {}
        self.listeners: List[Callable[[Dict], Awaitable[None]]] = []
        self._lock = asyncio.Lock()

    def register_listener(self, callback: Callable[[Dict], Awaitable[None]]):
        self.listeners.append(callback)

    def unregister_listener(self, callback: Callable[[Dict], Awaitable[None]]):
        if callback in self.listeners:
            self.listeners.remove(callback)

    async def broadcast(self, event_type: str, data: dict):
        dead_listeners = []
        for listener in self.listeners:
            try:
                await listener({"type": event_type, "data": data})
            except Exception:
                dead_listeners.append(listener)
        for dead in dead_listeners:
            if dead in self.listeners:
                self.listeners.remove(dead)

    def get_all_jobs(self) -> List[JobInfo]:
        return list(self.jobs.values())

    def get_job(self, job_id: str) -> Optional[JobInfo]:
        return self.jobs.get(job_id)

    async def create_and_start_job(self, request: DownloadRequest) -> JobInfo:
        job_id = str(uuid.uuid4())[:8]
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        job = JobInfo(
            job_id=job_id,
            url=request.url.strip(),
            folder_name=request.folder_name.strip() if request.folder_name else None,
            status="queued",
            created_at=now_str,
            logs=[f"[{now_str}] Job queued for URL: {request.url}"]
        )

        async with self._lock:
            self.jobs[job_id] = job

        await self.broadcast("job_created", job.model_dump())

        # Start execution in background task
        asyncio.create_task(self._run_job(job_id, request))
        return job

    async def _run_job(self, job_id: str, request: DownloadRequest):
        job = self.jobs.get(job_id)
        if not job:
            return

        job.status = "running"
        await self.broadcast("job_status", job.model_dump())

        # Build command arguments
        cmd = [
            GALLERY_DL_BIN,
            "--windows-filenames",
            "--no-colors"
        ]

        # Determine target directory
        if request.folder_name:
            # Clean folder name
            clean_name = re.sub(r'[\\/*?:"<>|]', "", request.folder_name).strip()
            target_path = DOWNLOADS_DIR / clean_name
            target_path.mkdir(parents=True, exist_ok=True)
            cmd.extend(["--destination", str(target_path)])
            job.target_directory = str(target_path)
        else:
            cmd.extend(["--destination", str(DOWNLOADS_DIR)])
            job.target_directory = str(DOWNLOADS_DIR)

        if request.chapter_range:
            cmd.extend(["--chapter-range", request.chapter_range.strip()])

        if request.file_range:
            cmd.extend(["--range", request.file_range.strip()])

        if request.write_metadata:
            cmd.append("--write-info-json")

        if request.cbz:
            cmd.append("--cbz")

        if request.extra_args:
            extra = shlex.split(request.extra_args)
            cmd.extend(extra)

        cmd.append(request.url.strip())

        cmd_display = " ".join(cmd)
        job.logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] Executing: {cmd_display}")
        await self.broadcast("job_log", {"job_id": job_id, "line": f"Executing: {cmd_display}"})

        try:
            # Subprocess execution kwargs (hide window on Windows)
            kwargs = {}
            if os.name == "nt":
                kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                **kwargs
            )

            self.processes[job_id] = process

            # Read output stream line by line
            file_count = 0
            while True:
                line_bytes = await process.stdout.readline()
                if not line_bytes:
                    break
                
                line = line_bytes.decode(errors="replace").strip()
                if not line:
                    continue

                # Add to job logs (keep last 500 lines)
                job.logs.append(line)
                if len(job.logs) > 500:
                    job.logs.pop(0)

                # Heuristic progress tracking
                # gallery-dl prints downloaded paths, e.g. "downloads\...\001.jpg"
                if any(ext in line.lower() for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".cbz", ".zip"]):
                    file_count += 1
                    job.downloaded_files = file_count
                    job.current_file = Path(line).name
                    # Try to parse total if formatted like [x/y]
                    match = re.search(r'\[(\d+)/(\d+)\]', line)
                    if match:
                        cur, tot = int(match.group(1)), int(match.group(2))
                        job.progress = int((cur / tot) * 100) if tot > 0 else 0
                        job.total_files = tot
                    else:
                        job.progress = min(100, file_count * 5)  # arbitrary visual indicator if total unknown

                await self.broadcast("job_log", {"job_id": job_id, "line": line})
                await self.broadcast("job_progress", {
                    "job_id": job_id,
                    "progress": job.progress,
                    "downloaded_files": job.downloaded_files,
                    "current_file": job.current_file
                })

            return_code = await process.wait()

            if job_id in self.processes:
                del self.processes[job_id]

            job.completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            if return_code == 0:
                job.status = "completed"
                job.progress = 100
                job.logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] Download finished successfully!")
            elif job.status == "cancelled":
                job.logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] Download cancelled by user.")
            else:
                job.status = "failed"
                job.error_message = f"Process exited with error code {return_code}"
                job.logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] Download failed with exit code {return_code}.")

        except asyncio.CancelledError:
            job.status = "cancelled"
            job.completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            job.logs.append("Download task cancelled.")
        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            job.logs.append(f"Error: {e}")
        finally:
            if job_id in self.processes:
                del self.processes[job_id]
            await self.broadcast("job_status", job.model_dump())
            await self.broadcast("library_updated", {})

    async def cancel_job(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job:
            return False

        process = self.processes.get(job_id)
        if process:
            job.status = "cancelled"
            try:
                process.terminate()
            except Exception:
                pass
            await self.broadcast("job_status", job.model_dump())
            return True
        elif job.status == "queued":
            job.status = "cancelled"
            await self.broadcast("job_status", job.model_dump())
            return True

        return False

    def remove_job(self, job_id: str) -> bool:
        if job_id in self.jobs and self.jobs[job_id].status in ["completed", "failed", "cancelled"]:
            del self.jobs[job_id]
            return True
        return False

download_manager = DownloadManager()
