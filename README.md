# PyonDL 📖⚡

A modern, fast, and lightweight local Web UI for [gallery-dl](https://github.com/mikf/gallery-dl) paired with an integrated high-performance manga and comic reader.

Paste a gallery or manga URL from any of the 1,000+ supported sites, stream downloads with live progress in real-time, and read with edge-to-edge **Fit-Wide mode**, **Double-Spread**, or **Continuous Webtoon** layout with exact scroll bookmarking.

---

## 🌟 Highlights

- 🚀 **Zero-Setup Quick Start**: 1-click launch scripts for Windows, Linux, and macOS that auto-configure virtual environments and dependencies.
- 🎨 **Modern Dark UI**: Clean, glassmorphic Single Page App built with Tailwind CSS and Lucide icons—fast, lightweight, with zero node_modules or build steps.
- 📖 **Cinematic Reader**: Built specifically for manga, manhwa, comics, and art galleries.
- 🔄 **Real-Time Live Downloader**: WebSocket streaming stdout/stderr terminal logs, animated progress bars, and cancelable tasks.
- 📚 **Smart Library**: Auto-detects multi-chapter series, extracts metadata, natural-sorts chapters, and auto-generates a demo comic on first launch.

---

## 📖 Inbuilt Manga & Gallery Reader

PyonDL includes a dedicated reading engine designed for high-resolution manga and comics:

### 1. Edge-to-Edge Fit Wide (`W`)
Tired of small manga pages centered with giant black bars? Press **`W`** to scale manga pages to **100% of your screen width**. Experience crisp, edge-to-edge readability for detailed panels and dialogues.

### 2. Distraction-Free Fullscreen (`F`)
Press **`F`** to toggle full-screen immersive mode. All browser bars and desktop clutter disappear.

### 3. Three Reading Layouts (`M`)
Cycle through reading layouts anytime by pressing **`M`**:
- **Single Page Mode**: Standard reading with smart navigation zones (left side: prev, right side: next, center: toggle toolbar).
- **Double Spread Mode**: Displays two pages side-by-side to replicate the feel of a physical manga tankōbon or graphic novel.
- **Continuous Webtoon (Long-Strip) Mode**: Smooth vertical scrolling with lazy loading and smart viewport rendering—ideal for Webtoons and Manhwa.

### 4. Smart Bookmarks & Exact Scroll Restoration (`B`)
- Automatically saves your reading state (Chapter, Page, and exact vertical scroll pixel & ratio).
- A **"Continue Reading"** card appears on top of your library for 1-click instant resume.
- Clicking **"Resume"** opens the chapter, jumps directly to the saved page, and restores the exact scroll position down to the pixel.
- Press **`B`** anytime to manually pin or update your bookmark.

### 5. Instant Navigation & Pre-caching
- Interactive Chapter Switcher dropdown with quick Next/Prev Chapter buttons.
- Page scrubber slider (e.g. `Page 14 / 52`).
- Scrollable thumbnail strip for instant jumping.
- Intelligent image preloading: automatically pre-caches upcoming pages for zero-latency page turns.

---

## ⚡ Real-Time gallery-dl Downloader

Under the hood, PyonDL leverages [gallery-dl](https://github.com/mikf/gallery-dl) to download from hundreds of platforms:

- **1,000+ Supported Sites**: MangaDex, Danbooru, Gelbooru, Pixiv, Imgur, Reddit, Webtoons, Twitter/X, DeviantArt, Kemono, Flickr, and many more.
- **Live Terminal & Progress**: Real-time WebSocket terminal output, animated percentage bars, and downloaded file counters.
- **Customizable Download Options**:
  - Custom folder & series naming.
  - Chapter filter / range (e.g. `1-10` or `5`).
  - File index range (e.g. `1-20`).
  - Optional CBZ archive packaging.
  - Metadata saving (`info.json`).
- **Task Controls**: Cancel active downloads or clear completed items from task history.
- **Quick Test Presets**: Test your setup instantly with 1-click preset downloads.

---

## 🗂️ Library Management

- **Automatic Directory Scanning**: Monitors your `downloads/` directory and groups multi-chapter manga series and standalone image galleries.
- **Natural Chapter Ordering**: Chapters are sorted naturally (e.g., Chapter 1, Chapter 2, Chapter 10, Chapter 100).
- **Search & Filter**: Search series by name or sort by Date, Title, Total Pages, or Folder Size.
- **Direct Explorer / Finder Access**: Click the folder icon to reveal any manga directory directly in your operating system's native file manager (`explorer.exe` / `Finder` / `xdg-open`).
- **Included Demo Comic**: Includes an auto-generated sample manga so you can explore all reader features right after cloning!

---

## 🚀 Quick Start & Installation

### Prerequisites
- **Python 3.9+** (tested on 3.9, 3.10, 3.11, 3.12)
- **Git**

---

### Option 1: 1-Click Launchers (Recommended)

#### 🪟 Windows:
1. Clone the repository:
   ```cmd
   git clone https://github.com/nickc72/pyondl.git
   cd pyondl
   ```
2. Double-click **`start.bat`** (or run `start.bat` in Command Prompt / PowerShell).
   - *It will automatically create the `.venv`, install all dependencies from `requirements.txt`, launch the server, and open your default browser!*

#### 🐧 Linux / 🍎 macOS:
1. Clone the repository:
   ```bash
   git clone https://github.com/nickc72/pyondl.git
   cd pyondl
   ```
2. Make `start.sh` executable and run it:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
   - *It will automatically configure `.venv`, install dependencies, launch the server, and open your browser!*

---

### Option 2: Manual Installation (All Platforms)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/nickc72/pyondl.git
   cd pyondl
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Create virtual environment
   python -m venv .venv

   # Activate on Windows (Command Prompt / PowerShell):
   .\.venv\Scripts\activate

   # Activate on Linux / macOS:
   source .venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Run PyonDL**:
   ```bash
   python run.py
   ```

5. **Open your browser**:
   Navigate to:
   ```
   http://127.0.0.1:8765
   ```

---

## ⌨️ Reader Keyboard Shortcuts

| Shortcut | Description |
| :---: | :--- |
| <kbd>W</kbd> | **Fit Wide** (Scales image to 100% of viewport width) |
| <kbd>F</kbd> | **Toggle Fullscreen** (Distraction-free edge-to-edge view) |
| <kbd>S</kbd> | **Fit Screen** (Contain both width & height inside window) |
| <kbd>H</kbd> | **Fit Height** (Scale to 100% viewport height) |
| <kbd>M</kbd> | **Cycle Reading Mode** (*Single Page* → *Double Spread* → *Webtoon*) |
| <kbd>B</kbd> | **Save Smart Bookmark** (stores exact chapter, page & scroll position) |
| <kbd>→</kbd> / <kbd>Space</kbd> / <kbd>D</kbd> | Next Page / Scroll down in Webtoon |
| <kbd>←</kbd> / <kbd>A</kbd> | Previous Page / Scroll up in Webtoon |
| <kbd>[</kbd> | Previous Chapter |
| <kbd>]</kbd> | Next Chapter |
| <kbd>Esc</kbd> | Exit Reader or Exit Fullscreen |
| <kbd>?</kbd> | Open Shortcuts Reference Cheat Sheet |

---

## 📂 Project Architecture

```
pyondl/
├── app/
│   ├── __init__.py
│   ├── config.py          # Dynamic executable detection & environment paths
│   ├── downloader.py      # gallery-dl async process manager & live log streamer
│   ├── library.py         # Directory scanner, chapter builder & sample generator
│   ├── models.py          # Pydantic schemas (DownloadRequest, JobInfo, MangaItem)
│   ├── main.py            # FastAPI ASGI server, WebSockets, REST endpoints & static routes
│   └── static/
│       ├── css/
│       │   └── app.css    # Dark mode styles, glassmorphic layout, fit-wide rules
│       ├── js/
│       │   ├── app.js     # Library grid, search, sorting, tabs & bookmark UI
│       │   ├── downloader.js # Real-time WebSocket listener, progress bar & terminal
│       │   └── reader.js  # Manga reader (Fullscreen, Fit-Wide, Webtoon, Spread)
│       ├── index.html     # Single-Page Application interface
│       └── placeholder.png# Fallback thumbnail
├── downloads/             # Directory where downloaded manga & galleries are stored
│   └── .gitkeep
├── .gitignore             # Ignores .venv, user downloads, and caches
├── requirements.txt       # Core Python dependencies
├── run.py                 # Application launcher with automatic browser opener
├── start.bat              # 1-click Windows setup & launcher
├── start.sh               # 1-click Linux/macOS setup & launcher
└── README.md              # Project documentation
```

---

## 🌐 Supported Download Sites

PyonDL supports downloads from any platform compatible with `gallery-dl`, including:

- **Manga & Comics**: [MangaDex](https://mangadex.org), [Webtoons](https://www.webtoons.com), ComicK, Bato.to, etc.
- **Imageboards & Art**: [Danbooru](https://danbooru.donmai.us), [Gelbooru](https://gelbooru.com), [Pixiv](https://www.pixiv.net), Safebooru, Konachan, Yande.re, Sankaku.
- **Social & Portfolios**: [Reddit](https://reddit.com), [Imgur](https://imgur.com), [Twitter / X](https://x.com), DeviantArt, ArtStation, Flickr, Tumblr.
- *And [hundreds more extractors](https://github.com/mikf/gallery-dl/blob/master/docs/supportedsites.md).*

---

## ⚙️ Configuration

Settings can be customized in `app/config.py`:
- `PORT`: Server port (default: `8765`).
- `HOST`: Server host (default: `127.0.0.1`).
- `DOWNLOADS_DIR`: Path where manga and galleries are stored (default: `./downloads`).

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!
1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
