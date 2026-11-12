/**
 * Inbuilt Manga & Gallery Reader
 * Features: Fullscreen, Fit Wide (covers whole screen width), Fit Screen, Fit Height,
 * Single/Double/Webtoon layouts, Page scrubber, Thumbnails, Chapter navigation, Keyboard shortcuts.
 */

class MangaReader {
  constructor() {
    this.modal = document.getElementById("reader-modal");
    this.viewport = document.getElementById("reader-viewport");
    this.topbar = document.getElementById("reader-topbar");
    this.bottombar = document.getElementById("reader-bottombar");

    // Elements
    this.titleEl = document.getElementById("reader-title");
    this.chapterSelect = document.getElementById("reader-chapter-select");
    this.pageIndicator = document.getElementById("reader-page-indicator");
    this.pageSlider = document.getElementById("reader-page-slider");
    this.thumbnailsContainer = document.getElementById("reader-thumbnails");
    this.fullscreenBtn = document.getElementById("reader-fullscreen-btn");
    this.wideBtn = document.getElementById("reader-wide-btn");
    this.fitSelect = document.getElementById("reader-fit-select");
    this.layoutSelect = document.getElementById("reader-layout-select");
    this.bookmarkBtn = document.getElementById("reader-bookmark-btn");

    // State
    this.isOpen = false;
    this.item = null;
    this.currentChapter = null;
    this.pages = [];
    this.currentPage = 1; // 1-indexed
    this.fitMode = localStorage.getItem("reader_fit_mode") || "wide"; // default to "wide" as requested!
    this.layoutMode = localStorage.getItem("reader_layout_mode") || "single"; // 'single', 'double', 'webtoon'
    this.direction = localStorage.getItem("reader_direction") || "ltr"; // 'ltr', 'rtl'
    this.isControlsVisible = true;
    this.hideTimeout = null;
    this.pendingScrollRestoration = null;
    this.scrollSaveTimeout = null;

    this.initEventListeners();
  }

  initEventListeners() {
    // Keyboard navigation
    window.addEventListener("keydown", (e) => {
      if (!this.isOpen) return;

      // Don't intercept if user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "ArrowRight":
        case "d":
        case "D":
          if (this.direction === "rtl") this.prevPage();
          else this.nextPage();
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          if (this.direction === "rtl") this.nextPage();
          else this.prevPage();
          break;
        case " ":
          e.preventDefault();
          if (this.layoutMode !== "webtoon") {
            const maxScroll = this.viewport.scrollHeight - this.viewport.clientHeight;
            if (maxScroll > 20 && this.viewport.scrollTop < maxScroll - 30) {
              this.viewport.scrollBy({ top: this.viewport.clientHeight * 0.75, behavior: "smooth" });
            } else {
              this.nextPage();
            }
          } else {
            this.nextPage();
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case "w":
        case "W":
          e.preventDefault();
          this.toggleWide();
          break;
        case "s":
        case "S":
          e.preventDefault();
          this.setFitMode("screen");
          break;
        case "h":
        case "H":
          e.preventDefault();
          this.setFitMode("height");
          break;
        case "m":
        case "M":
          e.preventDefault();
          this.cycleLayoutMode();
          break;
        case "b":
        case "B":
          e.preventDefault();
          this.manualBookmark();
          break;
        case "Escape":
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            this.close();
          }
          break;
      }
    });

    // Fullscreen change listener to sync icons
    document.addEventListener("fullscreenchange", () => {
      this.updateFullscreenIcon();
    });

    // Slider input
    if (this.pageSlider) {
      this.pageSlider.addEventListener("input", (e) => {
        this.goToPage(parseInt(e.target.value, 10));
      });
    }

    // Chapter select
    if (this.chapterSelect) {
      this.chapterSelect.addEventListener("change", (e) => {
        const chapterId = e.target.value;
        this.loadChapter(chapterId);
      });
    }

    // Auto-hide toolbar on mouse movement in reader
    if (this.modal) {
      this.modal.addEventListener("mousemove", () => {
        this.showControls();
        this.resetHideTimeout();
      });
    }

    // Listen to window resize to adjust double page view if needed
    window.addEventListener("resize", () => {
      if (this.isOpen && this.layoutMode === "double") {
        this.renderCurrentView();
      }
    });

    // Auto-save smart bookmark on scroll (debounced)
    if (this.viewport) {
      this.viewport.addEventListener("scroll", () => {
        if (!this.isOpen || this.pendingScrollRestoration) return;
        clearTimeout(this.scrollSaveTimeout);
        this.scrollSaveTimeout = setTimeout(() => {
          this.saveSmartBookmark(false);
        }, 400);
      });
    }
  }

  showControls() {
    this.isControlsVisible = true;
    if (this.topbar) this.topbar.classList.remove("toolbar-hidden");
    if (this.bottombar) this.bottombar.classList.remove("toolbar-hidden");
  }

  hideControls() {
    this.isControlsVisible = false;
    if (this.topbar) this.topbar.classList.add("toolbar-hidden");
    if (this.bottombar) this.bottombar.classList.add("toolbar-hidden");
  }

  toggleControls() {
    if (this.isControlsVisible) {
      this.hideControls();
    } else {
      this.showControls();
      this.resetHideTimeout();
    }
  }

  resetHideTimeout() {
    clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      if (this.isOpen) {
        this.hideControls();
      }
    }, 3500);
  }

  async open(itemId, chapterId = null, startPage = null, restoreBookmark = true) {
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(itemId)}`);
      if (!res.ok) throw new Error("Could not load manga item");
      this.item = await res.json();

      let targetChapterId = chapterId;
      let targetPage = startPage;
      this.pendingScrollRestoration = null;

      // Smart bookmark lookup if opening without explicit chapter/page
      if (restoreBookmark && targetChapterId === null && targetPage === null) {
        let savedBm = null;
        try {
          const raw = localStorage.getItem("mangadl_bm_" + itemId);
          if (raw) savedBm = JSON.parse(raw);
        } catch (e) {}
        if (!savedBm && this.item.bookmark) {
          savedBm = this.item.bookmark;
        }

        if (savedBm && savedBm.chapter_id) {
          targetChapterId = savedBm.chapter_id;
          targetPage = savedBm.page;
          if (savedBm.scroll_top > 0 || savedBm.scroll_ratio > 0) {
            this.pendingScrollRestoration = {
              scrollTop: savedBm.scroll_top || 0,
              scrollRatio: savedBm.scroll_ratio || 0
            };
          }
        }
      }

      // Find target chapter
      if (targetChapterId && this.item.chapters) {
        this.currentChapter = this.item.chapters.find((c) => c.id === targetChapterId) || this.item.chapters[0];
      } else if (this.item.chapters && this.item.chapters.length > 0) {
        this.currentChapter = this.item.chapters[0];
      } else {
        throw new Error("No chapters found in this gallery");
      }

      this.pages = this.currentChapter.pages || [];
      const initialPage = targetPage !== null ? targetPage : 1;
      this.currentPage = Math.min(Math.max(1, initialPage), Math.max(1, this.pages.length));

      this.updateChapterDropdown();
      this.updateFitClasses();
      this.updateLayoutClasses();
      this.updateFullscreenIcon();
      this.renderThumbnails();

      this.modal.classList.remove("hidden");
      this.isOpen = true;
      document.body.style.overflow = "hidden";

      this.showControls();
      this.resetHideTimeout();

      if (!this.pendingScrollRestoration) {
        this.resetScroll();
      }

      this.renderCurrentView();

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error("Reader open error:", err);
      alert("Failed to open reader: " + err.message);
    }
  }

  close() {
    this.saveSmartBookmark(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    this.isOpen = false;
    this.modal.classList.add("hidden");
    document.body.style.overflow = "";
    clearTimeout(this.hideTimeout);
    if (window.app && typeof window.app.loadLibrary === "function") {
      window.app.loadLibrary();
    }
  }

  saveSmartBookmark(isManual = false) {
    if (!this.isOpen || !this.item || !this.currentChapter) return;

    const maxScroll = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
    const curScroll = Math.max(0, Math.round(this.viewport.scrollTop));
    const ratio = maxScroll > 0 ? Number((curScroll / maxScroll).toFixed(4)) : 0;

    const hasProgress = this.currentPage > 1 || curScroll >= 150 || ratio >= 0.05;
    // CRITICAL: Never auto-save an unread manga state (Page 1 top with no scrolling)
    if (!isManual && !hasProgress) {
      return;
    }

    const bm = {
      manga_id: this.item.id,
      chapter_id: this.currentChapter.id,
      chapter_title: this.currentChapter.title,
      page: this.currentPage,
      total_pages: this.pages.length,
      scroll_top: curScroll,
      scroll_ratio: ratio,
      updated_at: new Date().toISOString()
    };

    try {
      localStorage.setItem("mangadl_bm_" + this.item.id, JSON.stringify(bm));
      localStorage.setItem("mangadl_last_read", JSON.stringify({
        ...bm,
        manga_title: this.item.title,
        cover_url: this.item.cover_url
      }));
    } catch (e) {}

    fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bm)
    }).catch(() => {});

    if (isManual) {
      const pct = Math.round(ratio * 100);
      if (window.app) {
        window.app.showToast(`Bookmark saved: Page ${this.currentPage}${pct > 5 ? ` (${pct}% scroll)` : ""}`, "success");
      }
      if (this.bookmarkBtn) {
        this.bookmarkBtn.classList.add("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400");
        setTimeout(() => {
          this.bookmarkBtn.classList.remove("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400");
        }, 1200);
      }
    }
  }

  async clearBookmark(mangaId) {
    try {
      localStorage.removeItem("mangadl_bm_" + mangaId);
      const last = localStorage.getItem("mangadl_last_read");
      if (last) {
        try {
          const obj = JSON.parse(last);
          if (obj.manga_id === mangaId) {
            localStorage.removeItem("mangadl_last_read");
          }
        } catch (e) {}
      }
      await fetch(`/api/bookmarks/${encodeURIComponent(mangaId)}`, { method: "DELETE" });
    } catch (e) {
      console.error("Error clearing bookmark:", e);
    }
  }

  manualBookmark() {
    this.saveSmartBookmark(true);
  }

  applyScrollRestoration() {
    if (!this.pendingScrollRestoration || !this.viewport) return;
    const { scrollTop, scrollRatio } = this.pendingScrollRestoration;
    const maxScroll = Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight);
    let targetY = scrollTop;
    if (scrollRatio && maxScroll > 0) {
      targetY = Math.round(scrollRatio * maxScroll);
    }

    this.viewport.scrollTop = targetY;
    this.pendingScrollRestoration = null;

    if (targetY > 20 && window.app) {
      const pct = scrollRatio ? Math.round(scrollRatio * 100) : Math.round((targetY / (maxScroll || 1)) * 100);
      window.app.showToast(`Resumed where you left off (Page ${this.currentPage}${pct > 5 ? `, ${pct}% scroll` : ""})`, "info");
    }
  }

  loadChapter(chapterId) {
    if (!this.item || !this.item.chapters) return;
    const ch = this.item.chapters.find((c) => c.id === chapterId);
    if (!ch) return;

    this.currentChapter = ch;
    this.pages = ch.pages || [];
    this.currentPage = 1;

    this.resetScroll();
    this.updateChapterDropdown();
    this.renderThumbnails();
    this.renderCurrentView();
  }

  nextChapter() {
    if (!this.item || !this.item.chapters) return;
    const idx = this.item.chapters.findIndex((c) => c.id === this.currentChapter.id);
    if (idx !== -1 && idx < this.item.chapters.length - 1) {
      this.loadChapter(this.item.chapters[idx + 1].id);
    }
  }

  prevChapter() {
    if (!this.item || !this.item.chapters) return;
    const idx = this.item.chapters.findIndex((c) => c.id === this.currentChapter.id);
    if (idx > 0) {
      this.loadChapter(this.item.chapters[idx - 1].id);
    }
  }

  updateChapterDropdown() {
    if (!this.chapterSelect || !this.item || !this.item.chapters) return;
    this.chapterSelect.innerHTML = "";

    this.item.chapters.forEach((ch) => {
      const opt = document.createElement("option");
      opt.value = ch.id;
      opt.textContent = `${ch.title} (${ch.page_count}p)`;
      if (this.currentChapter && ch.id === this.currentChapter.id) {
        opt.selected = true;
      }
      this.chapterSelect.appendChild(opt);
    });

    if (this.titleEl) {
      this.titleEl.textContent = this.item.title;
    }
  }

  // --- Fit Mode Controls ---
  setFitMode(mode) {
    this.fitMode = mode;
    localStorage.setItem("reader_fit_mode", mode);
    this.updateFitClasses();
    this.renderCurrentView();
  }

  toggleWide() {
    // If currently wide, switch to screen (contain); otherwise switch to wide
    if (this.fitMode === "wide") {
      this.setFitMode("screen");
    } else {
      this.setFitMode("wide");
    }
  }

  updateFitClasses() {
    if (!this.viewport) return;
    this.viewport.classList.remove("fit-wide", "fit-screen", "fit-height", "fit-original");
    this.viewport.classList.add(`fit-${this.fitMode}`);

    // Update Wide button styling to show active state
    if (this.wideBtn) {
      if (this.fitMode === "wide") {
        this.wideBtn.classList.add("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400");
        this.wideBtn.classList.remove("bg-slate-800", "text-slate-300");
      } else {
        this.wideBtn.classList.remove("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400");
        this.wideBtn.classList.add("bg-slate-800", "text-slate-300");
      }
    }

    if (this.fitSelect) {
      this.fitSelect.value = this.fitMode;
    }
  }

  // --- Reading Layout Modes ---
  setLayoutMode(layout) {
    this.layoutMode = layout;
    localStorage.setItem("reader_layout_mode", layout);
    this.updateLayoutClasses();
    this.renderCurrentView();
  }

  cycleLayoutMode() {
    const modes = ["single", "double", "webtoon"];
    const curIdx = modes.indexOf(this.layoutMode);
    const nextMode = modes[(curIdx + 1) % modes.length];
    this.setLayoutMode(nextMode);
  }

  updateLayoutClasses() {
    if (!this.viewport) return;
    this.viewport.classList.remove("layout-single", "layout-double", "layout-webtoon");
    this.viewport.classList.add(`layout-${this.layoutMode}`);

    if (this.layoutSelect) {
      this.layoutSelect.value = this.layoutMode;
    }
  }

  // --- Fullscreen Toggle ---
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  updateFullscreenIcon() {
    if (!this.fullscreenBtn) return;
    const isFs = !!document.fullscreenElement;
    if (isFs) {
      this.fullscreenBtn.innerHTML = `<i data-lucide="minimize" class="w-5 h-5"></i>`;
      this.fullscreenBtn.title = "Exit Fullscreen (F)";
    } else {
      this.fullscreenBtn.innerHTML = `<i data-lucide="maximize" class="w-5 h-5"></i>`;
      this.fullscreenBtn.title = "Fullscreen (F)";
    }
    if (window.lucide) window.lucide.createIcons();
  }

  // --- Page Navigation & Scroll Reset ---
  resetScroll() {
    if (this.layoutMode === "webtoon") return;
    if (this.viewport) {
      this.viewport.scrollTop = 0;
      this.viewport.scrollLeft = 0;
      if (typeof this.viewport.scrollTo === "function") {
        this.viewport.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    }
    if (this.modal) {
      this.modal.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }

  goToPage(page) {
    if (!this.pages || this.pages.length === 0) return;
    this.currentPage = Math.min(Math.max(1, page), this.pages.length);
    this.resetScroll();
    this.renderCurrentView();
    this.saveSmartBookmark(false);
  }

  nextPage() {
    if (this.layoutMode === "double") {
      if (this.currentPage + 2 <= this.pages.length) {
        this.goToPage(this.currentPage + 2);
      } else if (this.currentPage + 1 <= this.pages.length) {
        this.goToPage(this.currentPage + 1);
      } else {
        this.nextChapter();
      }
    } else if (this.layoutMode === "webtoon") {
      // In webtoon mode, scroll down smoothly by half viewport height
      this.viewport.scrollBy({ top: window.innerHeight * 0.75, behavior: "smooth" });
    } else {
      if (this.currentPage < this.pages.length) {
        this.goToPage(this.currentPage + 1);
      } else {
        this.nextChapter();
      }
    }
  }

  prevPage() {
    if (this.layoutMode === "double") {
      if (this.currentPage - 2 >= 1) {
        this.goToPage(this.currentPage - 2);
      } else if (this.currentPage - 1 >= 1) {
        this.goToPage(this.currentPage - 1);
      } else {
        this.prevChapter();
      }
    } else if (this.layoutMode === "webtoon") {
      this.viewport.scrollBy({ top: -window.innerHeight * 0.75, behavior: "smooth" });
    } else {
      if (this.currentPage > 1) {
        this.goToPage(this.currentPage - 1);
      } else {
        this.prevChapter();
      }
    }
  }

  // --- Rendering Viewports ---
  renderCurrentView() {
    if (!this.viewport || !this.pages || this.pages.length === 0) {
      if (this.viewport) this.viewport.innerHTML = `<div class="p-8 text-slate-400">No pages available</div>`;
      return;
    }

    this.updateControlsIndicators();

    if (this.layoutMode === "webtoon") {
      this.renderWebtoonView();
    } else if (this.layoutMode === "double") {
      this.renderDoubleView();
    } else {
      this.renderSingleView();
    }

    this.preloadSurroundingPages();
  }

  renderSingleView() {
    const pageObj = this.pages[this.currentPage - 1];
    if (!pageObj) return;

    this.viewport.innerHTML = `
      <div class="reader-page-container relative w-full min-h-full flex flex-col items-center justify-start">
        <!-- Click Zones -->
        <div class="click-zone click-zone-left" id="zone-left" title="Previous Page"></div>
        <div class="click-zone click-zone-center" id="zone-center" title="Toggle Controls"></div>
        <div class="click-zone click-zone-right" id="zone-right" title="Next Page"></div>

        <img src="${pageObj.url}" alt="Page ${this.currentPage}" class="reader-page-img select-none pointer-events-none transition-smooth" />
      </div>
    `;

    // Reset scroll to top immediately, OR restore smart bookmark scroll position
    if (this.pendingScrollRestoration) {
      requestAnimationFrame(() => this.applyScrollRestoration());
    } else {
      this.resetScroll();
      requestAnimationFrame(() => this.resetScroll());
    }

    const img = this.viewport.querySelector(".reader-page-img");
    if (img) {
      img.onload = () => {
        if (this.pendingScrollRestoration) {
          this.applyScrollRestoration();
        } else {
          this.resetScroll();
        }
      };
    }

    // Hook click zones
    const zoneLeft = document.getElementById("zone-left");
    const zoneRight = document.getElementById("zone-right");
    const zoneCenter = document.getElementById("zone-center");

    if (zoneLeft) zoneLeft.addEventListener("click", () => {
      if (this.direction === "rtl") this.nextPage(); else this.prevPage();
    });
    if (zoneRight) zoneRight.addEventListener("click", () => {
      if (this.direction === "rtl") this.prevPage(); else this.nextPage();
    });
    if (zoneCenter) zoneCenter.addEventListener("click", () => this.toggleControls());
  }

  renderDoubleView() {
    const p1 = this.pages[this.currentPage - 1];
    const p2 = this.currentPage < this.pages.length ? this.pages[this.currentPage] : null;

    let firstImg = p1;
    let secondImg = p2;

    // In RTL manga, second page is on left, first page on right
    if (this.direction === "rtl" && p2) {
      firstImg = p2;
      secondImg = p1;
    }

    this.viewport.innerHTML = `
      <div class="reader-page-container relative w-full min-h-full flex flex-col items-center justify-start">
        <div class="click-zone click-zone-left" id="zone-left" title="Previous Page"></div>
        <div class="click-zone click-zone-center" id="zone-center" title="Toggle Controls"></div>
        <div class="click-zone click-zone-right" id="zone-right" title="Next Page"></div>

        <div class="double-page-container flex justify-center items-start w-full gap-1">
          ${firstImg ? `<img src="${firstImg.url}" class="reader-page-img select-none pointer-events-none transition-smooth" />` : ""}
          ${secondImg ? `<img src="${secondImg.url}" class="reader-page-img select-none pointer-events-none transition-smooth" />` : ""}
        </div>
      </div>
    `;

    if (this.pendingScrollRestoration) {
      requestAnimationFrame(() => this.applyScrollRestoration());
    } else {
      this.resetScroll();
      requestAnimationFrame(() => this.resetScroll());
    }

    const images = this.viewport.querySelectorAll(".reader-page-img");
    images.forEach((img) => {
      img.onload = () => {
        if (this.pendingScrollRestoration) {
          this.applyScrollRestoration();
        } else {
          this.resetScroll();
        }
      };
    });

    const zoneLeft = document.getElementById("zone-left");
    const zoneRight = document.getElementById("zone-right");
    const zoneCenter = document.getElementById("zone-center");

    if (zoneLeft) zoneLeft.addEventListener("click", () => {
      if (this.direction === "rtl") this.nextPage(); else this.prevPage();
    });
    if (zoneRight) zoneRight.addEventListener("click", () => {
      if (this.direction === "rtl") this.prevPage(); else this.nextPage();
    });
    if (zoneCenter) zoneCenter.addEventListener("click", () => this.toggleControls());
  }

  renderWebtoonView() {
    // Continuous strip with all images
    let html = `<div class="webtoon-container" id="webtoon-scroll-container">`;
    this.pages.forEach((page, idx) => {
      html += `
        <div class="webtoon-page-wrapper w-full flex justify-center mb-1 relative" data-page="${idx + 1}">
          <img src="${page.url}" loading="lazy" class="webtoon-img select-none transition-smooth" alt="Page ${idx + 1}" />
        </div>
      `;
    });
    html += `</div>`;
    this.viewport.innerHTML = html;

    if (this.pendingScrollRestoration) {
      requestAnimationFrame(() => this.applyScrollRestoration());
    }

    // Track scroll position to update page number
    this.viewport.onscroll = () => {
      const wrappers = this.viewport.querySelectorAll(".webtoon-page-wrapper");
      const vpMid = this.viewport.scrollTop + this.viewport.clientHeight / 2;
      for (const w of wrappers) {
        if (w.offsetTop <= vpMid && (w.offsetTop + w.offsetHeight) >= vpMid) {
          const pg = parseInt(w.getAttribute("data-page"), 10);
          if (this.currentPage !== pg) {
            this.currentPage = pg;
            this.updateControlsIndicators();
          }
          break;
        }
      }
    };
  }

  updateControlsIndicators() {
    if (this.pageIndicator) {
      if (this.layoutMode === "double" && this.currentPage < this.pages.length) {
        this.pageIndicator.textContent = `${this.currentPage}-${this.currentPage + 1} / ${this.pages.length}`;
      } else {
        this.pageIndicator.textContent = `${this.currentPage} / ${this.pages.length}`;
      }
    }

    if (this.pageSlider) {
      this.pageSlider.max = this.pages.length;
      this.pageSlider.value = this.currentPage;
    }

    // Highlight active thumbnail
    if (this.thumbnailsContainer) {
      const thumbs = this.thumbnailsContainer.querySelectorAll(".reader-thumb");
      thumbs.forEach((t, i) => {
        if (i + 1 === this.currentPage) {
          t.classList.add("ring-2", "ring-indigo-500", "scale-105");
        } else {
          t.classList.remove("ring-2", "ring-indigo-500", "scale-105");
        }
      });
    }
  }

  renderThumbnails() {
    if (!this.thumbnailsContainer || !this.pages) return;
    this.thumbnailsContainer.innerHTML = "";

    this.pages.forEach((page, idx) => {
      const thumb = document.createElement("div");
      thumb.className = `reader-thumb flex-shrink-0 w-12 h-16 rounded overflow-hidden cursor-pointer border border-slate-700 bg-slate-900 transition-all hover:opacity-100 ${idx + 1 === this.currentPage ? "ring-2 ring-indigo-500 opacity-100" : "opacity-60"}`;
      thumb.innerHTML = `<img src="${page.url}" class="w-full h-full object-cover pointer-events-none" loading="lazy" />`;
      thumb.title = `Page ${idx + 1}`;
      thumb.addEventListener("click", () => {
        this.goToPage(idx + 1);
        if (this.layoutMode === "webtoon") {
          const target = this.viewport.querySelector(`[data-page="${idx + 1}"]`);
          if (target) target.scrollIntoView({ behavior: "smooth" });
        }
      });
      this.thumbnailsContainer.appendChild(thumb);
    });
  }

  preloadSurroundingPages() {
    // Preload next 2 pages and previous 1 page
    const toPreload = [this.currentPage + 1, this.currentPage + 2, this.currentPage - 1];
    toPreload.forEach((p) => {
      if (p >= 1 && p <= this.pages.length) {
        const img = new Image();
        img.src = this.pages[p - 1].url;
      }
    });
  }
}

window.mangaReader = new MangaReader();
