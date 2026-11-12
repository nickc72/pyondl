import os
import re
import json
import base64
from pathlib import Path
from typing import List, Optional, Dict, Tuple, Any
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

from app.config import DOWNLOADS_DIR, IMAGE_EXTENSIONS
from app.models import MangaItem, ChapterInfo, PageInfo, LibraryResponse

def natural_sort_key(s: str):
    """Sort strings containing numbers in human natural order (1, 2, 10 instead of 1, 10, 2)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', str(s))]

def encode_id(rel_path: str) -> str:
    """Encode relative path to URL-safe string."""
    return base64.urlsafe_b64encode(rel_path.replace("\\", "/").encode("utf-8")).decode("utf-8")

def decode_id(item_id: str) -> str:
    """Decode item_id back to relative path."""
    try:
        return base64.urlsafe_b64decode(item_id.encode("utf-8")).decode("utf-8")
    except Exception:
        return item_id

try:
    from gallery_dl import extractor
    KNOWN_EXTRACTORS = {cls.category.lower() for cls in extractor.extractors() if hasattr(cls, 'category')}
except Exception:
    KNOWN_EXTRACTORS = {
        'hitomi', 'mangadex', 'pixiv', 'danbooru', 'gelbooru', 'ehentai', 'exhentai',
        'nhentai', 'imgur', 'reddit', 'twitter', 'x', 'instagram', 'webtoons',
        'artstation', 'deviantart', 'kemono', 'coomer', 'fantia', 'patreon', 'booru',
        'safebooru', 'konachan', 'yande', 'sankaku', 'flickr', 'tumblr', 'rule34',
        'tsumino', 'fakku', 'pururin', 'hentaifoundry', 'dynasty', 'bato', 'comick'
    }

def read_dir_metadata(dir_path: Path) -> dict:
    """Read info.json metadata from directory or its parent."""
    for candidate in [dir_path / "info.json", dir_path.parent / "info.json"]:
        if candidate.exists():
            try:
                with open(candidate, "r", encoding="utf-8", errors="replace") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        return data
            except Exception:
                pass
    return {}

def get_manga_root_and_title(chapter_dir: Path, downloads_dir: Path) -> Tuple[Path, str, str]:
    """
    Intelligently discover the real Manga root directory, proper Manga Title, and Chapter Title.
    Eliminates extractor names (e.g. 'hitomi', 'mangadex') from being used as the manga title.
    """
    rel_parts = chapter_dir.relative_to(downloads_dir).parts
    is_extractor = rel_parts[0].lower() in KNOWN_EXTRACTORS
    meta = read_dir_metadata(chapter_dir)

    manga_title = ""
    chapter_title = ""
    series_path = chapter_dir

    if is_extractor:
        if len(rel_parts) == 1:
            series_path = chapter_dir
            manga_title = meta.get("manga") or meta.get("title") or meta.get("gallery_title") or chapter_dir.name
            chapter_title = "Complete"
        elif len(rel_parts) == 2:
            # e.g. downloads/hitomi/4324575 Kit Bodega
            series_path = chapter_dir
            manga_title = meta.get("title") or meta.get("manga") or meta.get("gallery_title") or chapter_dir.name
            chapter_title = "Complete"
        else:
            # e.g. downloads/mangadex/COSMOS/c010_ Eutal Eve
            series_path = downloads_dir / rel_parts[0] / rel_parts[1]
            manga_title = meta.get("manga") or meta.get("series") or meta.get("album") or rel_parts[1]
            if meta.get("title") and meta.get("chapter") is not None:
                chapter_title = f"Ch. {meta.get('chapter')} - {meta.get('title')}"
            elif meta.get("chapter") is not None:
                chapter_title = f"Chapter {meta.get('chapter')}"
            else:
                chapter_title = meta.get("title") or chapter_dir.name
    else:
        if len(rel_parts) == 1:
            series_path = chapter_dir
            manga_title = meta.get("title") or meta.get("manga") or meta.get("gallery_title") or chapter_dir.name
            chapter_title = "Complete"
        else:
            series_path = downloads_dir / rel_parts[0]
            manga_title = meta.get("manga") or meta.get("series") or meta.get("title") or rel_parts[0]
            if meta.get("title") and meta.get("chapter") is not None:
                chapter_title = f"Ch. {meta.get('chapter')} - {meta.get('title')}"
            else:
                chapter_title = meta.get("title") or chapter_dir.name

    # If manga_title has numeric ID prefix and no explicit title was in metadata, clean it
    # (e.g. "4324575 Kit Bodega" -> "Kit Bodega", "[4324575] Kit Bodega" -> "Kit Bodega")
    if not meta.get("title") and not meta.get("manga") and not meta.get("series"):
        cleaned = re.sub(r'^(?:\[\d+\]|\d+)\s*[-_]?\s*', '', manga_title).strip()
        if cleaned:
            manga_title = cleaned

    if not chapter_title:
        chapter_title = chapter_dir.name

    return series_path, manga_title, chapter_title

class LibraryManager:
    def __init__(self, downloads_dir: Path = DOWNLOADS_DIR):
        self.downloads_dir = downloads_dir
        self.downloads_dir.mkdir(parents=True, exist_ok=True)
        self.bookmarks_file = self.downloads_dir / ".bookmarks.json"

    def get_bookmarks(self) -> Dict[str, Any]:
        if not self.bookmarks_file.exists():
            return {}
        try:
            with open(self.bookmarks_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def save_bookmark(self, bookmark_data: dict) -> bool:
        try:
            manga_id = bookmark_data.get("manga_id")
            if not manga_id:
                return False
            bookmarks = self.get_bookmarks()
            bookmarks[manga_id] = bookmark_data
            with open(self.bookmarks_file, "w", encoding="utf-8") as f:
                json.dump(bookmarks, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error saving bookmark: {e}")
            return False

    def delete_bookmark(self, manga_id: str) -> bool:
        try:
            bookmarks = self.get_bookmarks()
            if manga_id in bookmarks:
                del bookmarks[manga_id]
                with open(self.bookmarks_file, "w", encoding="utf-8") as f:
                    json.dump(bookmarks, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error deleting bookmark: {e}")
            return False

    def scan_library(self) -> LibraryResponse:
        """Scan downloads directory and return list of Manga items."""
        if not self.downloads_dir.exists():
            return LibraryResponse(total_items=0, items=[])

        bookmarks = self.get_bookmarks()

        # Step 1: Find all directories that directly contain image files
        image_dirs: List[Path] = []
        for root, dirs, files in os.walk(self.downloads_dir):
            root_path = Path(root)
            has_images = any(f.suffix.lower() in IMAGE_EXTENSIONS for f in root_path.iterdir() if f.is_file())
            if has_images:
                image_dirs.append(root_path)

        if not image_dirs:
            return LibraryResponse(total_items=0, items=[])

        # Step 2: Group chapter directories by their true Manga Series root
        series_map: Dict[Path, Dict[str, Any]] = {}
        for ch_dir in image_dirs:
            s_path, m_title, ch_title = get_manga_root_and_title(ch_dir, self.downloads_dir)
            if s_path not in series_map:
                series_map[s_path] = {
                    "title": m_title,
                    "chapters": []
                }
            series_map[s_path]["chapters"].append((ch_dir, ch_title))

        manga_items: List[MangaItem] = []

        for series_path, data in series_map.items():
            series_title = data["title"]
            ch_list = data["chapters"]

            # Sort chapters naturally
            ch_list.sort(key=lambda item: natural_sort_key(item[0].name))

            chapters: List[ChapterInfo] = []
            total_pages = 0
            first_cover = None
            series_size = 0

            is_single = (len(ch_list) == 1 and ch_list[0][0] == series_path)

            for ch_dir, ch_title in ch_list:
                ch_info, ch_size = self._build_chapter_info(ch_dir, ch_title)
                if ch_info and ch_info.page_count > 0:
                    chapters.append(ch_info)
                    total_pages += ch_info.page_count
                    series_size += ch_size
                    if not first_cover and ch_info.cover_url:
                        first_cover = ch_info.cover_url

            if chapters:
                rel_series = series_path.relative_to(self.downloads_dir).as_posix()
                m_id = encode_id(rel_series)
                mod_time = datetime.fromtimestamp(series_path.stat().st_mtime).strftime("%Y-%m-%d %H:%M")

                # Verify if bookmark is valid real progress (not an unread page 1 bookmark)
                bm = bookmarks.get(m_id)
                if bm:
                    has_progress = (bm.get("page", 1) > 1) or (bm.get("scroll_top", 0) > 150) or (bm.get("scroll_ratio", 0) > 0.05)
                    if not has_progress:
                        bm = None

                manga_items.append(MangaItem(
                    id=m_id,
                    title=series_title,
                    path=str(series_path),
                    rel_path=rel_series,
                    cover_url=first_cover,
                    total_pages=total_pages,
                    chapter_count=len(chapters),
                    is_single_chapter=is_single,
                    chapters=chapters,
                    size_mb=round(series_size / (1024 * 1024), 2),
                    updated_at=mod_time,
                    bookmark=bm
                ))

        # Sort manga items by updated_at descending
        manga_items.sort(key=lambda item: item.updated_at, reverse=True)
        return LibraryResponse(total_items=len(manga_items), items=manga_items)

    def _build_chapter_info(self, chapter_dir: Path, custom_title: Optional[str] = None) -> Tuple[Optional[ChapterInfo], int]:
        """Collect all image pages in a folder, sorted naturally."""
        files = [f for f in chapter_dir.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
        if not files:
            return None, 0

        files.sort(key=lambda p: natural_sort_key(p.name))

        pages: List[PageInfo] = []
        total_size = 0
        rel_chapter = chapter_dir.relative_to(self.downloads_dir).as_posix()

        for idx, file_path in enumerate(files, start=1):
            rel_file = file_path.relative_to(self.downloads_dir).as_posix()
            file_url = f"/downloads/{rel_file}"
            total_size += file_path.stat().st_size
            pages.append(PageInfo(
                index=idx,
                filename=file_path.name,
                rel_path=rel_file,
                url=file_url
            ))

        cover_url = pages[0].url if pages else None
        title = custom_title if custom_title else chapter_dir.name

        chapter_info = ChapterInfo(
            id=encode_id(rel_chapter),
            title=title,
            rel_path=rel_chapter,
            page_count=len(pages),
            cover_url=cover_url,
            pages=pages
        )
        return chapter_info, total_size

    def get_item(self, item_id: str) -> Optional[MangaItem]:
        """Find a specific manga item or chapter by ID."""
        decoded = decode_id(item_id)
        target_path = self.downloads_dir / decoded
        if not target_path.exists():
            return None

        # Rescan just to get full structure or find in scan
        lib = self.scan_library()
        for item in lib.items:
            if item.id == item_id or item.rel_path == decoded:
                return item
            for ch in item.chapters:
                if ch.id == item_id or ch.rel_path == decoded:
                    # Return item focused on chapter
                    return MangaItem(
                        id=ch.id,
                        title=f"{item.title} - {ch.title}" if not item.is_single_chapter else item.title,
                        path=str(self.downloads_dir / ch.rel_path),
                        rel_path=ch.rel_path,
                        cover_url=ch.cover_url,
                        total_pages=ch.page_count,
                        chapter_count=len(item.chapters),
                        is_single_chapter=item.is_single_chapter,
                        chapters=item.chapters,
                        size_mb=item.size_mb,
                        updated_at=item.updated_at,
                        bookmark=item.bookmark
                    )
        return None

    def delete_item(self, item_id: str) -> bool:
        """Delete a manga item or chapter directory."""
        import shutil
        decoded = decode_id(item_id)
        target_path = self.downloads_dir / decoded
        if target_path.exists() and self.downloads_dir in target_path.parents or target_path == self.downloads_dir:
            # Safeguard: do not delete root downloads dir itself
            if target_path == self.downloads_dir:
                return False
            if target_path.is_dir():
                shutil.rmtree(target_path, ignore_errors=True)
                return True
        return False

    def create_sample_manga(self) -> str:
        """Generate a beautiful sample 5-page demo manga inside downloads folder."""
        sample_dir = self.downloads_dir / "PyonDL Manga Demo" / "Chapter 01 - The Journey Begins"
        sample_dir.mkdir(parents=True, exist_ok=True)

        pages_data = [
            {
                "page": 1,
                "title": "PYONDL MANGA READER",
                "subtitle": "Chapter 01: The Journey Begins",
                "accent": "#6366f1",
                "bullets": [
                    "Welcome to your local gallery-dl Manga Library & Reader!",
                    "Try pressing 'W' to activate Fit-Wide mode (covers whole screen)",
                    "Try pressing 'F' to enter Fullscreen mode",
                    "Press Space or Right Arrow to navigate pages"
                ]
            },
            {
                "page": 2,
                "title": "FIT-WIDE MODE (WIDE SCREEN)",
                "subtitle": "Maximize Your Viewing Experience",
                "accent": "#ec4899",
                "bullets": [
                    "The 'Wide' function scales images to 100% of your screen width.",
                    "Enjoy panoramic two-page spreads and high-definition webtoons.",
                    "Toggle instantly using the top toolbar or by pressing 'W' on your keyboard.",
                    "Works seamlessly in Fullscreen mode for maximum immersion!"
                ]
            },
            {
                "page": 3,
                "title": "READING LAYOUT MODES",
                "subtitle": "Tailored for Every Manga & Comic Format",
                "accent": "#06b6d4",
                "bullets": [
                    "Single Page: Clean, focused reader with smart click zones.",
                    "Double Page: Read spreads side-by-side like a real printed volume.",
                    "Webtoon / Long Strip: Continuous vertical scrolling with custom gaps.",
                    "Cycle layouts with the 'M' key or toolbar icon."
                ]
            },
            {
                "page": 4,
                "title": "BUILT-IN GALLERY-DL POWER",
                "subtitle": "Download from Hundreds of Supported Sites",
                "accent": "#10b981",
                "bullets": [
                    "Switch to the 'Downloader' tab anytime to download series.",
                    "Supports MangaDex, Danbooru, Gelbooru, Pixiv, Imgur, Reddit, and more.",
                    "Real-time live terminal streaming with progress tracking.",
                    "Organizes chapters automatically into your local library."
                ]
            },
            {
                "page": 5,
                "title": "READY TO EXPLORE!",
                "subtitle": "Your Manga Library Is Ready",
                "accent": "#f59e0b",
                "bullets": [
                    "Switch back to the Library to manage your downloaded series.",
                    "Jump between chapters with the chapter selector in the top toolbar.",
                    "Press '?' anytime to view all keyboard shortcuts.",
                    "Enjoy reading!"
                ]
            }
        ]

        width, height = 1200, 1750
        for data in pages_data:
            img = Image.new("RGB", (width, height), color=(18, 18, 24))
            draw = ImageDraw.Draw(img)

            # Draw stylish header banner
            accent_hex = data["accent"].lstrip('#')
            accent_rgb = tuple(int(accent_hex[i:i+2], 16) for i in (0, 2, 4))
            
            # Subtle gradient / card background
            draw.rectangle([40, 40, width - 40, height - 40], outline=accent_rgb, width=4)
            draw.rectangle([50, 50, width - 50, 220], fill=(28, 28, 38))
            draw.line([50, 220, width - 50, 220], fill=accent_rgb, width=3)

            # Draw Page number badge
            page_num_str = f"PAGE {data['page']} / 5"
            draw.rectangle([width - 250, 70, width - 80, 115], fill=accent_rgb)
            draw.text((width - 235, 80), page_num_str, fill=(255, 255, 255))

            # Title & Subtitle
            draw.text((80, 80), data["title"], fill=(255, 255, 255))
            draw.text((80, 140), data["subtitle"], fill=accent_rgb)

            # Central illustration box
            draw.rectangle([100, 280, width - 100, 900], fill=(24, 24, 34), outline=(45, 45, 60), width=2)
            
            # Decorative shapes in central illustration box
            draw.ellipse([width//2 - 140, 420, width//2 + 140, 700], fill=(35, 35, 52), outline=accent_rgb, width=3)
            draw.text((width//2 - 90, 540), f"PANEL {data['page']}", fill=accent_rgb)

            # Bullets / Instructions card
            draw.rectangle([100, 960, width - 100, 1600], fill=(25, 25, 35), outline=(45, 45, 60), width=2)
            draw.text((140, 1000), "HIGHLIGHTS & CONTROLS", fill=accent_rgb)
            draw.line([140, 1050, 450, 1050], fill=accent_rgb, width=2)

            y_offset = 1100
            for idx, bullet in enumerate(data["bullets"], start=1):
                draw.ellipse([140, y_offset + 5, 155, y_offset + 20], fill=accent_rgb)
                draw.text((180, y_offset), bullet, fill=(230, 230, 240))
                y_offset += 100

            # Footer
            draw.text((width//2 - 100, height - 70), "PYONDL MANGA READER", fill=(120, 120, 140))

            file_path = sample_dir / f"{data['page']:03d}.png"
            img.save(file_path, "PNG")

        return str(sample_dir)

library_manager = LibraryManager()
