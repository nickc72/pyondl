/**
 * Downloader Module
 * Handles WebSocket communication with auto-reconnect, polling fallback,
 * job creation, live progress bars, terminal logs, and job management.
 */

class DownloaderManager {
  constructor() {
    this.jobs = new Map();
    this.activeJobId = null;
    this.ws = null;
    this.wsRetryTimeout = null;
    this.pollInterval = null;
    this.pingInterval = null;

    // Elements
    this.form = document.getElementById("download-form");
    this.urlInput = document.getElementById("download-url");
    this.folderInput = document.getElementById("download-folder");
    this.chapterRangeInput = document.getElementById("download-chapter-range");
    this.cbzCheckbox = document.getElementById("download-cbz");
    this.metadataCheckbox = document.getElementById("download-metadata");
    this.submitBtn = document.getElementById("download-submit-btn");

    this.activeJobCard = document.getElementById("active-job-card");
    this.activeJobTitle = document.getElementById("active-job-title");
    this.activeJobStatus = document.getElementById("active-job-status");
    this.activeJobProgress = document.getElementById("active-job-progress");
    this.activeJobProgressBar = document.getElementById("active-job-progress-bar");
    this.activeJobFile = document.getElementById("active-job-file");
    this.activeJobCancelBtn = document.getElementById("active-job-cancel-btn");
    this.terminalLogs = document.getElementById("terminal-logs");
    this.jobsTableBody = document.getElementById("jobs-table-body");
    this.clearTerminalBtn = document.getElementById("clear-terminal-btn");

    this.initWebSocket();
    this.initEventListeners();
    this.startPing();
  }

  startPing() {
    clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 15000);
  }

  startPollingFallback() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/jobs");
        if (res.ok) {
          const data = await res.json();
          data.forEach((job) => this.jobs.set(job.job_id, job));
          this.renderJobsTable();
          this.checkActiveJob();
        }
      } catch (e) {
        // Silent polling error
      }
    }, 2500);
  }

  stopPollingFallback() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/downloads`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected to downloader");
        this.stopPollingFallback();
        const connBadge = document.getElementById("connection-status");
        if (connBadge) {
          connBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live Stream Active`;
          connBadge.className = "hidden sm:flex px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 items-center gap-1.5";
        }
      };

      this.ws.onmessage = (event) => {
        try {
          if (event.data === "pong") return;
          const msg = JSON.parse(event.data);
          this.handleSocketMessage(msg);
        } catch (err) {
          console.error("Error parsing WS message:", err);
        }
      };

      this.ws.onclose = () => {
        const connBadge = document.getElementById("connection-status");
        if (connBadge) {
          connBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Polling Active`;
          connBadge.className = "hidden sm:flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-950 text-amber-400 border border-amber-800 items-center gap-1.5";
        }
        this.startPollingFallback();
        clearTimeout(this.wsRetryTimeout);
        this.wsRetryTimeout = setTimeout(() => this.initWebSocket(), 3000);
      };

      this.ws.onerror = () => {
        this.startPollingFallback();
      };
    } catch (e) {
      console.error("Could not initialize WebSocket:", e);
      this.startPollingFallback();
    }
  }

  handleSocketMessage(msg) {
    const { type, data } = msg;

    if (type === "init_jobs") {
      data.forEach((job) => this.jobs.set(job.job_id, job));
      this.renderJobsTable();
      this.checkActiveJob();
    } else if (type === "job_created" || type === "job_status") {
      this.jobs.set(data.job_id, data);
      this.renderJobsTable();
      this.checkActiveJob();
    } else if (type === "job_progress") {
      const job = this.jobs.get(data.job_id);
      if (job) {
        job.progress = data.progress;
        job.downloaded_files = data.downloaded_files;
        job.current_file = data.current_file;
      }
      if (this.activeJobId === data.job_id) {
        this.updateActiveJobProgress(data);
      }
    } else if (type === "job_log") {
      if (!this.activeJobId || this.activeJobId === data.job_id) {
        this.appendLog(data.line);
      }
    } else if (type === "library_updated") {
      if (window.app && typeof window.app.loadLibrary === "function") {
        window.app.loadLibrary();
      }
    }
  }

  initEventListeners() {
    if (this.form) {
      this.form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.submitDownload();
      });
    }

    if (this.activeJobCancelBtn) {
      this.activeJobCancelBtn.addEventListener("click", () => {
        if (this.activeJobId) {
          this.cancelJob(this.activeJobId);
        }
      });
    }

    if (this.clearTerminalBtn) {
      this.clearTerminalBtn.addEventListener("click", () => {
        if (this.terminalLogs) this.terminalLogs.innerHTML = "";
      });
    }
  }

  async submitDownload() {
    const url = this.urlInput.value.trim();
    if (!url) return;

    const payload = {
      url: url,
      folder_name: this.folderInput.value.trim() || null,
      chapter_range: this.chapterRangeInput.value.trim() || null,
      cbz: this.cbzCheckbox ? this.cbzCheckbox.checked : false,
      write_metadata: this.metadataCheckbox ? this.metadataCheckbox.checked : true
    };

    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Starting...`;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Download request failed");
      }

      const resData = await res.json();
      this.urlInput.value = "";
      this.folderInput.value = "";
      this.chapterRangeInput.value = "";

      if (window.app) {
        window.app.showToast("Download started!", "success");
      }

      // Automatically select active job
      if (resData.job) {
        this.selectActiveJob(resData.job.job_id);
      }
    } catch (err) {
      alert("Error starting download: " + err.message);
    } finally {
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
        this.submitBtn.innerHTML = `<i data-lucide="download" class="w-4 h-4"></i> Download`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  async cancelJob(jobId) {
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      if (res.ok) {
        if (window.app) window.app.showToast("Cancellation sent", "info");
      }
    } catch (err) {
      console.error("Cancel job error:", err);
    }
  }

  async deleteJob(jobId) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) {
        this.jobs.delete(jobId);
        if (this.activeJobId === jobId) {
          this.activeJobId = null;
          this.checkActiveJob();
        }
        this.renderJobsTable();
      }
    } catch (err) {
      console.error("Delete job error:", err);
    }
  }

  selectActiveJob(jobId) {
    this.activeJobId = jobId;
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (this.activeJobCard) this.activeJobCard.classList.remove("hidden");
    if (this.activeJobTitle) this.activeJobTitle.textContent = job.folder_name || job.url;
    this.updateActiveJobProgress(job);

    // Populate terminal logs with job's logs
    if (this.terminalLogs) {
      this.terminalLogs.innerHTML = "";
      if (job.logs) {
        job.logs.forEach((line) => this.appendLog(line));
      }
    }
  }

  checkActiveJob() {
    // If no active job or current active job finished, check if any job is currently running
    const runningJob = Array.from(this.jobs.values()).find((j) => j.status === "running" || j.status === "queued");
    if (runningJob) {
      if (this.activeJobId !== runningJob.job_id) {
        this.selectActiveJob(runningJob.job_id);
      } else {
        this.updateActiveJobProgress(runningJob);
      }
    } else if (this.activeJobId) {
      const cur = this.jobs.get(this.activeJobId);
      if (cur) this.updateActiveJobProgress(cur);
    }
  }

  updateActiveJobProgress(job) {
    if (this.activeJobStatus) {
      this.activeJobStatus.textContent = job.status.toUpperCase();
      let colorClass = "bg-slate-800 text-slate-300";
      if (job.status === "running") colorClass = "bg-indigo-900 text-indigo-300 border border-indigo-700 animate-pulse";
      else if (job.status === "completed") colorClass = "bg-emerald-950 text-emerald-400 border border-emerald-800";
      else if (job.status === "failed") colorClass = "bg-rose-950 text-rose-400 border border-rose-800";
      else if (job.status === "cancelled") colorClass = "bg-amber-950 text-amber-400 border border-amber-800";
      this.activeJobStatus.className = `px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${colorClass}`;
    }

    if (this.activeJobProgress) {
      this.activeJobProgress.textContent = `${job.progress || 0}%`;
    }

    if (this.activeJobProgressBar) {
      this.activeJobProgressBar.style.width = `${job.progress || 0}%`;
    }

    if (this.activeJobFile) {
      this.activeJobFile.textContent = job.current_file ? `File: ${job.current_file} (${job.downloaded_files || 0} downloaded)` : "Extracting gallery info...";
    }

    if (this.activeJobCancelBtn) {
      if (job.status === "running" || job.status === "queued") {
        this.activeJobCancelBtn.classList.remove("hidden");
      } else {
        this.activeJobCancelBtn.classList.add("hidden");
      }
    }
  }

  appendLog(line) {
    if (!this.terminalLogs) return;
    const lineEl = document.createElement("div");
    lineEl.className = "font-mono text-xs text-slate-300 leading-relaxed break-all select-text";

    // Syntax highlight log lines
    if (line.includes("ERROR") || line.includes("failed")) {
      lineEl.className += " text-rose-400 font-semibold";
    } else if (line.includes("finished successfully") || line.includes("100%")) {
      lineEl.className += " text-emerald-400 font-semibold";
    } else if (line.startsWith("Executing:")) {
      lineEl.className += " text-indigo-400";
    } else if (line.includes(".jpg") || line.includes(".png") || line.includes(".webp")) {
      lineEl.className += " text-sky-300";
    }

    lineEl.textContent = line;
    this.terminalLogs.appendChild(lineEl);
    this.terminalLogs.scrollTop = this.terminalLogs.scrollHeight;
  }

  renderJobsTable() {
    if (!this.jobsTableBody) return;
    this.jobsTableBody.innerHTML = "";

    const sortedJobs = Array.from(this.jobs.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (sortedJobs.length === 0) {
      this.jobsTableBody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 text-sm">No download tasks yet</td></tr>`;
      return;
    }

    sortedJobs.forEach((job) => {
      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-800 hover:bg-slate-800/40 transition-colors text-sm cursor-pointer";

      let statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">${job.status}</span>`;
      if (job.status === "running") statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-indigo-950 text-indigo-300 border border-indigo-700 animate-pulse">Running</span>`;
      else if (job.status === "completed") statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">Done</span>`;
      else if (job.status === "failed") statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-rose-950 text-rose-400 border border-rose-800">Failed</span>`;
      else if (job.status === "cancelled") statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800">Cancelled</span>`;

      tr.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs text-indigo-400">${job.job_id}</td>
        <td class="px-4 py-3 max-w-xs truncate text-slate-300" title="${job.url}">${job.folder_name ? `<strong>${job.folder_name}</strong><br><span class="text-xs text-slate-500">${job.url}</span>` : job.url}</td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3 text-xs text-slate-400">${job.downloaded_files || 0} files (${job.progress}%)</td>
        <td class="px-4 py-3 text-right">
          <div class="flex items-center justify-end gap-2">
            <button class="view-log-btn text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 transition-colors" title="View Logs">Logs</button>
            ${job.status === "running" ? `<button class="cancel-btn text-xs px-2 py-1 bg-rose-900/40 hover:bg-rose-900/80 rounded text-rose-300 transition-colors" title="Cancel">Stop</button>` : `<button class="delete-btn text-xs px-2 py-1 bg-slate-800 hover:bg-rose-950 hover:text-rose-400 rounded text-slate-400 transition-colors" title="Clear">×</button>`}
          </div>
        </td>
      `;

      tr.querySelector(".view-log-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectActiveJob(job.job_id);
      });

      const cancelBtn = tr.querySelector(".cancel-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.cancelJob(job.job_id);
        });
      }

      const delBtn = tr.querySelector(".delete-btn");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.deleteJob(job.job_id);
        });
      }

      tr.addEventListener("click", () => {
        this.selectActiveJob(job.job_id);
      });

      this.jobsTableBody.appendChild(tr);
    });
  }

  setPresetUrl(url, folderName = "") {
    if (this.urlInput) {
      this.urlInput.value = url;
      this.urlInput.focus();
    }
    if (this.folderInput && folderName) {
      this.folderInput.value = folderName;
    }
  }
}

window.downloaderManager = new DownloaderManager();
