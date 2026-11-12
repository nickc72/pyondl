/**
 * Main Application Controller
 * Handles tabs, library grid, search/filter, explorer launcher, toast notifications, and shortcuts modal.
 */

function hasRealProgress(bm) {
  if (!bm) return false;
  if (bm.completed) return false;
  const page = Number(bm.page) || 1;
  const scrollTop = Number(bm.scroll_top) || 0;
  const scrollRatio = Number(bm.scroll_ratio) || 0;
  return page > 1 || scrollTop >= 150 || scrollRatio >= 0.05;
}

class App {
  constructor() {
    this.currentTab = "library";
    this.libraryItems = [];

    // Sanitize stale or unread bookmarks from localStorage on startup
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("mangadl_bm_")) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const data = JSON.parse(raw);
              if (!hasRealProgress(data) || key === "mangadl_bm_aGl0b21p") {
                localStorage.removeItem(key);
              }
            } catch (e) {
              localStorage.removeItem(key);
            }
          }
        }
      });
      const last = localStorage.getItem("mangadl_last_read");
      if (last) {
        try {
          const data = JSON.parse(last);
          if (!hasRealProgress(data) || data.manga_id === "aGl0b21p") {
            localStorage.removeItem("mangadl_last_read");
          }
        } catch (e) {
          localStorage.removeItem("mangadl_last_read");
        }
      }
    } catch (e) {}

    // Tab buttons & contents
    this.tabButtons = document.querySelectorAll("[data-tab-target]");
    this.tabContents = document.querySelectorAll("[data-tab-content]");

    // Library elements
    this.libraryGrid = document.getElementById("library-grid");
    this.librarySearch = document.getElementById("library-search");
    this.librarySort = document.getElementById("library-sort");
    this.libraryEmpty = document.getElementById("library-empty");
    this.libraryItemCount = document.getElementById("library-item-count");
    this.createSampleBtn = document.getElementById("create-sample-btn");
    this.refreshLibraryBtn = document.getElementById("refresh-library-btn");

    // Continue Reading Banner elements
    this.continueReadingBanner = document.getElementById("continue-reading-banner");
    this.resumeBannerCover = document.getElementById("resume-banner-cover");
    this.resumeBannerTitle = document.getElementById("resume-banner-title");
    this.resumeBannerDetails = document.getElementById("resume-banner-details");
    this.resumeBannerTime = document.getElementById("resume-banner-time");
    this.resumeBannerBtn = document.getElementById("resume-banner-btn");

    // Help & Shortcuts Modal
    this.shortcutsModal = document.getElementById("shortcuts-modal");
    this.openShortcutsBtn = document.getElementById("open-shortcuts-btn");
    this.closeShortcutsBtn = document.getElementById("close-shortcuts-btn");

    this.initEventListeners();
    this.loadLibrary();
    this.loadSupportedSites();
  }

  initEventListeners() {
    // Tab switching
    this.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-tab-target");
        this.switchTab(target);
      });
    });

    // Search and Sort
    if (this.librarySearch) {
      this.librarySearch.addEventListener("input", () => this.renderLibrary());
    }
    if (this.librarySort) {
      this.librarySort.addEventListener("change", () => this.renderLibrary());
    }

    // Refresh & sample creation
    if (this.refreshLibraryBtn) {
      this.refreshLibraryBtn.addEventListener("click", () => this.loadLibrary());
    }
    if (this.createSampleBtn) {
      this.createSampleBtn.addEventListener("click", () => this.createSample());
    }

    // Shortcuts modal
    if (this.openShortcutsBtn) {
      this.openShortcutsBtn.addEventListener("click", () => {
        if (this.shortcutsModal) this.shortcutsModal.classList.remove("hidden");
      });
    }
    if (this.closeShortcutsBtn) {
      this.closeShortcutsBtn.addEventListener("click", () => {
        if (this.shortcutsModal) this.shortcutsModal.classList.add("hidden");
      });
    }

    // Global shortcut for '?'
    window.addEventListener("keydown", (e) => {
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        if (this.shortcutsModal) {
          this.shortcutsModal.classList.toggle("hidden");
        }
      }
    });
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    this.tabButtons.forEach((btn) => {
      const target = btn.getAttribute("data-tab-target");
      if (target === tabName) {
        btn.classList.add("text-indigo-400", "border-indigo-500");
        btn.classList.remove("text-slate-400", "border-transparent");
      } else {
        btn.classList.remove("text-indigo-400", "border-indigo-500");
        btn.classList.add("text-slate-400", "border-transparent");
      }
    });

    this.tabContents.forEach((c) => {
      const target = c.getAttribute("data-tab-content");
      if (target === tabName) {
        c.classList.remove("hidden");
      } else {
        c.classList.add("hidden");
      }
    });

    if (tabName === "library") {
      this.loadLibrary();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async loadLibrary() {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("Could not load library");
      const data = await res.json();
      this.libraryItems = data.items || [];
      this.renderLibrary();
    } catch (err) {
      console.error("Library load error:", err);
    }
  }

  updateContinueReadingBanner() {
    if (!this.continueReadingBanner) return;

    let lastRead = null;
    try {
      const raw = localStorage.getItem("mangadl_last_read");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (hasRealProgress(parsed)) {
          lastRead = parsed;
        }
      }
    } catch (e) {}

    // Fallback: check library items for any bookmark with real progress
    if (!lastRead && this.libraryItems) {
      const validItems = this.libraryItems.filter((i) => hasRealProgress(i.bookmark));
      if (validItems.length > 0) {
        const bms = validItems.map((i) => i.bookmark);
        bms.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
        const matchedItem = this.libraryItems.find((i) => i.id === bms[0].manga_id);
        if (matchedItem) {
          lastRead = {
            ...bms[0],
            manga_title: matchedItem.title,
            cover_url: matchedItem.cover_url
          };
        }
      }
    }

    if (lastRead && lastRead.manga_id && hasRealProgress(lastRead)) {
      this.continueReadingBanner.classList.remove("hidden");
      if (this.resumeBannerCover) this.resumeBannerCover.src = lastRead.cover_url || "/static/placeholder.png";
      if (this.resumeBannerTitle) this.resumeBannerTitle.textContent = lastRead.manga_title || "Manga";
      
      const scrollPct = lastRead.scroll_ratio ? Math.round(lastRead.scroll_ratio * 100) : 0;
      let detailStr = `${lastRead.chapter_title || "Chapter"} • Page ${lastRead.page}/${lastRead.total_pages || "?"}`;
      if (scrollPct > 5) {
        detailStr += ` (${scrollPct}% scrolled)`;
      }
      if (this.resumeBannerDetails) this.resumeBannerDetails.textContent = detailStr;

      if (this.resumeBannerBtn) {
        this.resumeBannerBtn.onclick = () => {
          if (window.mangaReader) {
            window.mangaReader.open(lastRead.manga_id, lastRead.chapter_id, lastRead.page, true);
          }
        };
      }
    } else {
      this.continueReadingBanner.classList.add("hidden");
    }
  }

  async clearBookmark(mangaId) {
    try {
      localStorage.removeItem("mangadl_bm_" + mangaId);
      const last = localStorage.getItem("mangadl_last_read");
      if (last) {
        try {
          const parsed = JSON.parse(last);
          if (parsed.manga_id === mangaId) {
            localStorage.removeItem("mangadl_last_read");
          }
        } catch (e) {}
      }
      await fetch(`/api/bookmarks/${encodeURIComponent(mangaId)}`, { method: "DELETE" });
    } catch (e) {
      console.error("Error clearing bookmark:", e);
    }
  }

  renderLibrary() {
    this.updateContinueReadingBanner();
    if (!this.libraryGrid) return;
    this.libraryGrid.innerHTML = "";

    const query = (this.librarySearch?.value || "").toLowerCase().trim();
    const sortVal = this.librarySort?.value || "date_desc";

    let filtered = this.libraryItems.filter((item) => {
      return item.title.toLowerCase().includes(query) || (item.chapters && item.chapters.some((c) => c.title.toLowerCase().includes(query)));
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortVal === "title_asc") return a.title.localeCompare(b.title);
      if (sortVal === "title_desc") return b.title.localeCompare(a.title);
      if (sortVal === "pages_desc") return b.total_pages - a.total_pages;
      if (sortVal === "size_desc") return b.size_mb - a.size_mb;
      return b.updated_at.localeCompare(a.updated_at); // default date_desc
    });

    if (this.libraryItemCount) {
      this.libraryItemCount.textContent = `${filtered.length} ${filtered.length === 1 ? "manga" : "mangas"}`;
    }

    if (filtered.length === 0) {
      if (this.libraryEmpty) this.libraryEmpty.classList.remove("hidden");
      return;
    } else {
      if (this.libraryEmpty) this.libraryEmpty.classList.add("hidden");
    }

    filtered.forEach((item) => {
      let bm = item.bookmark;
      if (!bm) {
        try {
          const raw = localStorage.getItem("mangadl_bm_" + item.id);
          if (raw) bm = JSON.parse(raw);
        } catch (e) {}
      }

      // Check whether this manga has real reading progress
      const showResume = hasRealProgress(bm);

      const card = document.createElement("div");
      card.className = "glass-panel group relative rounded-xl overflow-hidden border border-slate-800/80 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all flex flex-col";

      const coverSrc = item.cover_url || "/static/placeholder.png";
      const scrollPct = showResume && bm && bm.scroll_ratio ? Math.round(bm.scroll_ratio * 100) : 0;

      card.innerHTML = `
        <div class="relative aspect-[3/4] w-full bg-slate-900 overflow-hidden cursor-pointer" data-card-read-id="${item.id}">
          <img src="${coverSrc}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity"></div>
          
          <!-- Badges -->
          <div class="absolute top-2 left-2 flex flex-col gap-1">
            ${showResume ? `
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-600/90 text-white backdrop-blur-md border border-indigo-400/50 shadow flex items-center gap-1">
                <i data-lucide="bookmark" class="w-3 h-3"></i> Page ${bm.page}${scrollPct > 5 ? ` (${scrollPct}%)` : ""}
              </span>
            ` : ""}
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900/90 text-indigo-300 backdrop-blur-md border border-slate-700/60 shadow">
              ${item.total_pages} Pages
            </span>
            ${!item.is_single_chapter ? `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900/90 text-emerald-300 backdrop-blur-md border border-slate-700/60 shadow">${item.chapter_count} Ch.</span>` : ""}
          </div>

          <!-- Quick Read Play Overlay -->
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span class="p-3.5 ${showResume ? "bg-gradient-to-r from-indigo-600 to-pink-600" : "bg-indigo-600/90"} text-white rounded-full shadow-lg backdrop-blur-sm transform group-hover:scale-110 transition-transform flex items-center justify-center">
              <i data-lucide="${showResume ? "play" : "book-open"}" class="w-6 h-6 fill-current"></i>
            </span>
          </div>
        </div>

        <div class="p-4 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="font-bold text-slate-100 text-sm line-clamp-1 group-hover:text-indigo-400 transition-colors" title="${item.title}">
              ${item.title}
            </h3>
            <p class="text-xs text-slate-400 mt-1 flex items-center justify-between">
              <span>${item.size_mb} MB</span>
              <span>${item.updated_at}</span>
            </p>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
            ${showResume ? `
              <button class="resume-btn flex-1 py-1.5 px-3 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/25" data-resume-id="${item.id}">
                <i data-lucide="play" class="w-3.5 h-3.5 fill-white"></i> Resume
              </button>
              <button class="start-over-btn p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors" title="Start over from beginning" data-start-id="${item.id}">
                <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
              </button>
            ` : `
              <button class="read-btn flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm" data-read-id="${item.id}">
                <i data-lucide="book-open" class="w-3.5 h-3.5"></i> Read
              </button>
            `}
            <button class="open-folder-btn p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors" title="Open in Explorer" data-folder-id="${item.id}">
              <i data-lucide="folder" class="w-4 h-4"></i>
            </button>
            <button class="delete-item-btn p-1.5 bg-slate-800/80 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-lg text-xs transition-colors" title="Delete" data-del-id="${item.id}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;

      // Click card cover to open: resume if progress exists, or start from beginning
      const cardCover = card.querySelector("[data-card-read-id]");
      if (cardCover) {
        cardCover.addEventListener("click", () => {
          if (window.mangaReader) {
            if (showResume) {
              window.mangaReader.open(item.id, null, null, true);
            } else {
              window.mangaReader.open(item.id, null, 1, false);
            }
          }
        });
      }

      // Resume button
      const resumeBtn = card.querySelector(".resume-btn");
      if (resumeBtn) {
        resumeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.mangaReader) window.mangaReader.open(item.id, null, null, true);
        });
      }

      // Start over button
      const startOverBtn = card.querySelector(".start-over-btn");
      if (startOverBtn) {
        startOverBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this.clearBookmark(item.id);
          this.loadLibrary();
          if (window.mangaReader) window.mangaReader.open(item.id, null, 1, false);
        });
      }

      // Read button
      const readBtn = card.querySelector(".read-btn");
      if (readBtn) {
        readBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (window.mangaReader) window.mangaReader.open(item.id, null, 1, false);
        });
      }

      // Folder listener
      const folderBtn = card.querySelector(".open-folder-btn");
      if (folderBtn) {
        folderBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openFolder(item.id);
        });
      }

      // Delete listener
      const delBtn = card.querySelector(".delete-item-btn");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
            this.deleteItem(item.id);
          }
        });
      }

      this.libraryGrid.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  async openFolder(itemId) {
    try {
      const res = await fetch("/api/library/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId })
      });
      if (!res.ok) throw new Error("Could not open folder in Explorer");
      this.showToast("Opened folder in Explorer", "info");
    } catch (err) {
      console.error(err);
      this.showToast("Could not open folder: " + err.message, "error");
    }
  }

  async deleteItem(itemId) {
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      this.showToast("Deleted successfully", "success");
      this.loadLibrary();
    } catch (err) {
      alert("Error deleting: " + err.message);
    }
  }

  async createSample() {
    if (this.createSampleBtn) {
      this.createSampleBtn.disabled = true;
      this.createSampleBtn.textContent = "Creating sample demo...";
    }
    try {
      const res = await fetch("/api/library/create-sample", { method: "POST" });
      if (!res.ok) throw new Error("Sample creation failed");
      this.showToast("Sample Demo Manga created! Click Read to try it out.", "success");
      this.loadLibrary();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      if (this.createSampleBtn) {
        this.createSampleBtn.disabled = false;
        this.createSampleBtn.textContent = "Generate Sample Manga";
      }
    }
  }

  async loadSupportedSites() {
    const container = document.getElementById("supported-sites-grid");
    if (!container) return;

    try {
      const res = await fetch("/api/supported-sites");
      if (!res.ok) return;
      const sites = await res.json();
      container.innerHTML = "";

      sites.forEach((site) => {
        const div = document.createElement("div");
        div.className = "glass-panel p-4 rounded-xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-colors";
        div.innerHTML = `
          <div>
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-slate-100 text-sm">${site.name}</h4>
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">${site.category}</span>
            </div>
            <p class="text-xs text-slate-400 mt-1 font-mono">${site.domain}</p>
            <p class="text-xs text-slate-500 mt-2 truncate font-mono bg-slate-900/60 p-1.5 rounded">${site.example}</p>
          </div>
          <button class="mt-4 w-full py-1.5 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 rounded-lg text-xs font-medium transition-colors fill-preset-btn">
            Use in Downloader
          </button>
        `;

        div.querySelector(".fill-preset-btn").addEventListener("click", () => {
          this.switchTab("downloader");
          if (window.downloaderManager) {
            window.downloaderManager.setPresetUrl(site.example, `${site.name} Download`);
          }
        });

        container.appendChild(div);
      });
    } catch (err) {
      console.error("Could not load supported sites:", err);
    }
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    let bg = "bg-slate-900 border-slate-700 text-slate-200";
    if (type === "success") bg = "bg-emerald-950 border-emerald-800 text-emerald-200";
    if (type === "error") bg = "bg-rose-950 border-rose-800 text-rose-200";

    toast.className = `p-3 rounded-xl border shadow-xl flex items-center gap-2 text-xs font-semibold backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 ${bg}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove("translate-y-2", "opacity-0");
    }, 10);

    setTimeout(() => {
      toast.classList.add("translate-y-2", "opacity-0");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

window.app = new App();
