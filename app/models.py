from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class DownloadRequest(BaseModel):
    url: str
    folder_name: Optional[str] = None
    chapter_range: Optional[str] = None
    file_range: Optional[str] = None
    cbz: bool = False
    write_metadata: bool = True
    extra_args: Optional[str] = None

class JobInfo(BaseModel):
    job_id: str
    url: str
    folder_name: Optional[str] = None
    status: str = "queued"  # queued, running, completed, failed, cancelled
    progress: int = 0
    total_files: int = 0
    downloaded_files: int = 0
    current_file: Optional[str] = None
    target_directory: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    logs: List[str] = Field(default_factory=list)

class PageInfo(BaseModel):
    index: int
    filename: str
    rel_path: str
    url: str
    width: Optional[int] = None
    height: Optional[int] = None

class ChapterInfo(BaseModel):
    id: str
    title: str
    rel_path: str
    page_count: int
    cover_url: Optional[str] = None
    pages: List[PageInfo] = Field(default_factory=list)

class MangaItem(BaseModel):
    id: str
    title: str
    path: str
    rel_path: str
    cover_url: Optional[str] = None
    total_pages: int = 0
    chapter_count: int = 0
    is_single_chapter: bool = True
    chapters: List[ChapterInfo] = Field(default_factory=list)
    size_mb: float = 0.0
    updated_at: str
    bookmark: Optional[Dict[str, Any]] = None

class LibraryResponse(BaseModel):
    total_items: int
    items: List[MangaItem]

class OpenFolderRequest(BaseModel):
    item_id: str

class BookmarkItem(BaseModel):
    manga_id: str
    chapter_id: str
    page: int
    scroll_top: int = 0
    scroll_ratio: float = 0.0
    chapter_title: Optional[str] = None
    total_pages: Optional[int] = None
    updated_at: Optional[str] = None
