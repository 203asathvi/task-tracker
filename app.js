import { auth, provider, cloudSave, cloudLoad } from "./firebase.js";

import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const monthSelect = document.getElementById("monthSelect");
  const yearInput = document.getElementById("yearInput");
  const tableContainer = document.getElementById("tableContainer");
  const mobileList = document.getElementById("mobileList");

  const statusText = document.getElementById("statusText");
  const streakText = document.getElementById("streakText");

  const progressText = document.getElementById("progressText");
  const progressBar = document.getElementById("progressBar");

  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const viewToggle = document.getElementById("viewToggle");

  const addTaskBtn = document.getElementById("addTaskBtn");
  const generateMonthBtn = document.getElementById("generateMonthBtn");

  const daySelect = document.getElementById("daySelect");
  const todayBtn = document.getElementById("todayBtn");

  const saveDayBtn = document.getElementById("saveDayBtn");
  const saveHint = document.getElementById("saveHint");

  const exportFormat = document.getElementById("exportFormat");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");

  // Today log DOM
  const todayInput = document.getElementById("todayInput");
  const todayAddBtn = document.getElementById("todayAddBtn");
  const todayCategory = document.getElementById("todayCategory");
  const todayFilter = document.getElementById("todayFilter");
  const todayBringForwardBtn = document.getElementById("todayBringForwardBtn");

  // ---------- Toast ----------
  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.textContent = message;

    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.bottom = "18px";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "10px 14px";
    toast.style.borderRadius = "12px";
    toast.style.color = "white";
    toast.style.fontSize = "14px";
    toast.style.fontWeight = "600";
    toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.18)";
    toast.style.zIndex = "9999";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 160ms ease, transform 160ms ease";

    const bg =
      type === "success" ? "#16a34a" :
      type === "error" ? "#dc2626" :
      type === "info" ? "#2563eb" :
      "#111827";

    toast.style.background = bg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(-2px)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
      setTimeout(() => toast.remove(), 220);
    }, 1600);
  }

  // ---------- State ----------
  const today = new Date();
  let currentUser = null;

  // stable device id
  const deviceIdKey = "taskTrackerDeviceId";
  const deviceId =
    localStorage.getItem(deviceIdKey) ||
    (() => {
      const id = crypto?.randomUUID?.() || String(Math.random()).slice(2);
      localStorage.setItem(deviceIdKey, id);
      return id;
    })();

  // payload storage (meta + data + todayLog)
  let localPayload = JSON.parse(localStorage.getItem("taskPayload")) || null;

  // Backward compatibility
  if (!localPayload) {
    const legacy = JSON.parse(localStorage.getItem("taskData")) || [];
    localPayload = { meta: { updatedAt: 0, deviceId }, data: legacy, todayLog: {} };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));
  }

  localPayload.todayLog = localPayload.todayLog || {}; // ensure exists

  let data = Array.isArray(localPayload.data) ? localPayload.data : [];
  let selectedDay = today.getDate();

  // Track which day(s) have unsaved edits (YYYY-MM-DD strings)
  const dirtyDays = new Set();

  // Auto-save after 5 minutes (from last change)
  let autoSaveTimer = null;
  const AUTO_SAVE_MS = 5 * 60 * 1000;

  // ---------- Auto mobile view (remember choice) ----------
  const MOBILE_BREAKPOINT = 768;
  const VIEW_KEY = "taskTrackerViewMode";

  function applyViewMode(mode) {
    if (mode === "mobile") document.body.classList.add("mobile-view");
    else document.body.classList.remove("mobile-view");
    localStorage.setItem(VIEW_KEY, mode);
  }

  function detectViewMode() {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "mobile" || saved === "desktop") {
      applyViewMode(saved);
      return;
    }
    applyViewMode(window.innerWidth <= MOBILE_BREAKPOINT ? "mobile" : "desktop");
  }

  detectViewMode();

  window.addEventListener("resize", () => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (!saved) {
      detectViewMode();
      render();
    }
  });

  if (viewToggle) {
    viewToggle.addEventListener("click", () => {
      const isMobile = document.body.classList.contains("mobile-view");
      applyViewMode(isMobile ? "desktop" : "mobile");
      render();
    });
  }

  // ---------- Month setup ----------
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (monthSelect && monthSelect.options.length === 0) {
    months.forEach((m, i) => {
      const opt = document.createElement("option");
      opt.value = i + 1;
      opt.textContent = m;
      monthSelect.appendChild(opt);
    });
  }
  if (monthSelect) monthSelect.value = today.getMonth() + 1;
  if (yearInput) yearInput.value = today.getFullYear();

  // ---------- Utils ----------
  function isoDate(y, m, d) {
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function makeEmptyCell() {
    return { v: "", t: 0, by: "" };
  }

  function normalizeCell(cell) {
    if (cell && typeof cell === "object" && "v" in cell && "t" in cell) return cell;
    const v = typeof cell === "string" ? cell : "";
    return { v, t: 0, by: "" };
  }

  function cellValue(cell) {
    return normalizeCell(cell).v || "";
  }

  function setCell(task, day, v) {
    if (!task.checklist) task.checklist = {};
    const now = Date.now();
    task.checklist[day] = { v, t: now, by: deviceId };
    task.updatedAt = now;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function saveLocal() {
    const now = Date.now();
    localPayload = {
      meta: { updatedAt: now, deviceId },
      data,
      todayLog: localPayload?.todayLog || {}
    };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));
    localStorage.setItem("taskData", JSON.stringify(data)); // legacy mirror
  }

  function resetAutoSaveCountdown() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      if (dirtyDays.size === 0) return;

      // Save locally always
      saveLocal();

      // Try cloud if signed in + online
      if (currentUser && navigator.onLine) {
        try {
          await syncWithCloud();
          dirtyDays.clear();
          refreshSaveUI();
          showToast("Auto-saved ✅", "success");
        } catch {
          refreshSaveUI();
          showToast("Auto-saved locally (cloud failed)", "error");
        }
      } else {
        dirtyDays.clear();
        refreshSaveUI();
        showToast("Auto-saved locally ✅", "info");
      }
    }, AUTO_SAVE_MS);
  }

  function getMonthData(y, m) {
    let found = data.find((d) => d.year === y && d.month === m);
    if (!found) {
      found = { year: y, month: m, tasks: [], updatedAt: 0 };
      data.push(found);
    }
    if (!Array.isArray(found.tasks)) found.tasks = [];
    return found;
  }

  function migrateMonth(md, days) {
    md.tasks.forEach((t) => {
      if (!t.checklist) t.checklist = {};
      for (let d = 1; d <= days; d++) {
        t.checklist[d] = normalizeCell(t.checklist[d]);
      }
    });
  }

  // ---------- Conflict merge (offline resolution) ----------
  function mergePayload(localP, cloudP) {
    const out = { meta: { updatedAt: Date.now(), deviceId }, data: [], todayLog: {} };
    const byKey = new Map();

    const addMonth = (mo) => {
      const key = `${mo.year}-${mo.month}`;
      if (!byKey.has(key)) byKey.set(key, { year: mo.year, month: mo.month, tasks: [], updatedAt: 0 });
      return byKey.get(key);
    };

    const ingest = (payload) => {
      const arr = Array.isArray(payload?.data) ? payload.data : [];
      for (const mo of arr) {
        if (!mo || typeof mo !== "object") continue;
        const md = addMonth(mo);
        md.updatedAt = Math.max(md.updatedAt || 0, mo.updatedAt || 0);

        const taskMap = new Map(md.tasks.map((t) => [t.name, t]));
        const srcTasks = Array.isArray(mo.tasks) ? mo.tasks : [];

        for (const st of srcTasks) {
          if (!st?.name) continue;
          if (!taskMap.has(st.name)) taskMap.set(st.name, { name: st.name, checklist: {}, updatedAt: st.updatedAt || 0 });

          const dt = taskMap.get(st.name);
          dt.updatedAt = Math.max(dt.updatedAt || 0, st.updatedAt || 0);

          const srcChecklist = st.checklist || {};
          for (const k of Object.keys(srcChecklist)) {
            const day = Number(k);
            const incoming = normalizeCell(srcChecklist[day]);
            const existing = normalizeCell(dt.checklist?.[day]);

            if (incoming.t > existing.t) dt.checklist[day] = incoming;
            else if (incoming.t === existing.t) {
              if ((incoming.v || "") && !(existing.v || "")) dt.checklist[day] = incoming;
            }
          }
        }

        md.tasks = Array.from(taskMap.values());
      }
    };

    // merge month grid
    ingest(localP);
    ingest(cloudP);
    out.data = Array.from(byKey.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month));

    // merge todayLog
    function mergeTodayLog(lp, cp) {
      const outTL = {};
      const A = lp?.todayLog || {};
      const B = cp?.todayLog || {};
      const keys = new Set([...Object.keys(A), ...Object.keys(B)]);

      for (const k of keys) {
        const la = A[k] || { updatedAt: 0, items: [] };
        const lb = B[k] || { updatedAt: 0, items: [] };

        const map = new Map();

        for (const it of (la.items || [])) map.set(it.id, it);
        for (const it of (lb.items || [])) {
          const ex = map.get(it.id);
          if (!ex || (it.updatedAt || 0) > (ex.updatedAt || 0)) map.set(it.id, it);
        }

        outTL[k] = {
          updatedAt: Math.max(la.updatedAt || 0, lb.updatedAt || 0),
          items: Array.from(map.values()).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))
        };
      }
      return outTL;
    }

    out.todayLog = mergeTodayLog(localP, cloudP);

    return out;
  }

  async function syncWithCloud() {
    if (!currentUser) return;

    const cloudData = await cloudLoad(currentUser.uid);
    const cloudPayload =
      cloudData && typeof cloudData === "object" && !Array.isArray(cloudData) && "data" in cloudData
        ? cloudData
        : { meta: { updatedAt: 0, deviceId: "cloud" }, data: Array.isArray(cloudData) ? cloudData : [], todayLog: {} };

    const merged = mergePayload(localPayload, cloudPayload);

    data = merged.data;
    localPayload = merged;
    saveLocal();

    await cloudSave(currentUser.uid, merged);
  }

  // ---------- Habit streak (cached per render) ----------
  let streakCache = new Map();

  function computeStreakForTaskName(taskName) {
    const statusByDate = new Map();
    for (const mo of data) {
      if (!mo?.tasks) continue;
      for (const t of mo.tasks) {
        if (t?.name !== taskName) continue;
        const y = mo.year, m = mo.month;
        const dim = daysInMonth(y, m);
        for (let d = 1; d <= dim; d++) {
          const v = cellValue(t.checklist?.[d]);
          if (v) statusByDate.set(isoDate(y, m, d), v);
        }
      }
    }

    let streak = 0;
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    while (true) {
      const key = isoDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      if (statusByDate.get(key) === "✔") {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
    return streak;
  }

  function buildStreakCache() {
    streakCache = new Map();
    const names = new Set();
    data.forEach((mo) => mo?.tasks?.forEach((t) => names.add(t.name)));
    names.forEach((name) => streakCache.set(name, computeStreakForTaskName(name)));
  }

  // ---------- Save Day button state ----------
  function currentContextDayKey() {
    const y = Number(yearInput?.value || today.getFullYear());
    const m = Number(monthSelect?.value || today.getMonth() + 1);
    const dim = daysInMonth(y, m);
    const d = Math.min(selectedDay, dim);
    return isoDate(y, m, d);
  }

  function refreshSaveUI() {
    if (!saveDayBtn) return;
    const key = currentContextDayKey();
    const isDirty = dirtyDays.has(key);
    saveDayBtn.disabled = !isDirty;
    if (saveHint) saveHint.textContent = isDirty ? "Unsaved changes" : "";
  }

  // ---------- Rendering ----------
  function updateProgress(md, days) {
    let total = 0, done = 0;
    md.tasks.forEach((t) => {
      for (let d = 1; d <= days; d++) {
        const v = cellValue(t.checklist?.[d]);
        if (v !== "") {
          total++;
          if (v === "✔") done++;
        }
      }
    });
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    if (progressText) progressText.innerText = `Completed ${done} of ${total} — ${pct}%`;
    if (progressBar) progressBar.style.width = pct + "%";
  }

  function populateDaySelect(y, m) {
    if (!daySelect) return;
    const dim = daysInMonth(y, m);
    daySelect.innerHTML = "";
    for (let d = 1; d <= dim; d++) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = String(d);
      daySelect.appendChild(opt);
    }
    selectedDay = Math.min(selectedDay, dim);
    daySelect.value = String(selectedDay);
  }

  // Table renders once; cell taps update DOM only (fast)
  function renderTable(md, days, y, m) {
    if (!tableContainer) return;

    let html = "<table><thead><tr><th class='task-col'>Task</th>";
    for (let d = 1; d <= days; d++) html += `<th>${d}</th>`;
    html += "</tr></thead><tbody>";

    md.tasks.forEach((t, i) => {
      html += `<tr><td class="task-col">${escapeHtml(t.name)}
        <button class="danger del" data-i="${i}" style="margin-left:6px;">✕</button>
      </td>`;

      for (let d = 1; d <= days; d++) {
        const v = cellValue(t.checklist?.[d]);
        const cls = v === "✔" ? "done" : v === "✖" ? "missed" : "";
        html += `<td id="cell-${i}-${d}" class="${cls}" data-t="${i}" data-d="${d}">${v}</td>`;
      }
      html += "</tr>";
    });

    html += "</tbody></table>";
    tableContainer.innerHTML = html;

    tableContainer.querySelectorAll("td[data-t]").forEach((cell) => {
      cell.addEventListener("click", () => {
        const tIdx = Number(cell.dataset.t);
        const day = Number(cell.dataset.d);

        const cur = cellValue(md.tasks[tIdx].checklist?.[day]);
        const next = cur === "" ? "✔" : cur === "✔" ? "✖" : "";

        setCell(md.tasks[tIdx], day, next);
        md.updatedAt = Date.now();

        // optimistic UI update
        cell.textContent = next;
        cell.classList.remove("done", "missed");
        if (next === "✔") cell.classList.add("done");
        if (next === "✖") cell.classList.add("missed");

        updateProgress(md, days);

        dirtyDays.add(isoDate(y, m, day));
        refreshSaveUI();
        resetAutoSaveCountdown();
      });
    });

    tableContainer.querySelectorAll(".del").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.i);
        if (!confirm("Delete this task?")) return;

        md.tasks.splice(idx, 1);
        md.updatedAt = Date.now();

        dirtyDays.add(currentContextDayKey());
        refreshSaveUI();
        resetAutoSaveCountdown();

        render();
      });
    });
  }

  // Mobile cards update only their badge (fast)
  function renderMobileCards(md, y, m) {
    if (!mobileList) return;
    mobileList.innerHTML = "";

    const dim = daysInMonth(y, m);
    const day = Math.min(selectedDay, dim);

    md.tasks.forEach((t) => {
      const v = cellValue(t.checklist?.[day]);
      const streak = streakCache.get(t.name) || 0;

      const card = document.createElement("div");
      card.className = "mobile-task";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "4px";

      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.style.fontSize = "16px";
      title.textContent = t.name;

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.opacity = "0.8";
      meta.textContent = `Streak: ${streak} day${streak === 1 ? "" : "s"} • Day ${day}`;

      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      const badge = document.createElement("div");
      badge.style.minWidth = "34px";
      badge.style.textAlign = "center";
      badge.style.fontWeight = "700";
      badge.textContent = v || "";

      const btnDone = document.createElement("button");
      btnDone.textContent = "✔";
      btnDone.style.padding = "10px 14px";

      const btnMiss = document.createElement("button");
      btnMiss.textContent = "✖";
      btnMiss.style.padding = "10px 14px";
      btnMiss.style.background = "#ef4444";

      const btnClear = document.createElement("button");
      btnClear.textContent = "—";
      btnClear.className = "secondary";
      btnClear.style.padding = "10px 14px";

      const applyMobileUpdate = (value) => {
        setCell(t, day, value);
        md.updatedAt = Date.now();
        badge.textContent = value;

        updateProgress(md, dim);

        dirtyDays.add(isoDate(y, m, day));
        refreshSaveUI();
        resetAutoSaveCountdown();
      };

      btnDone.onclick = () => applyMobileUpdate("✔");
      btnMiss.onclick = () => applyMobileUpdate("✖");
      btnClear.onclick = () => applyMobileUpdate("");

      right.appendChild(badge);
      right.appendChild(btnDone);
      right.appendChild(btnMiss);
      right.appendChild(btnClear);

      card.appendChild(left);
      card.appendChild(right);
      mobileList.appendChild(card);
    });
  }

  function renderStreakSummary(md) {
    if (!streakText) return;
    if (!md.tasks.length) {
      streakText.textContent = "";
      return;
    }

    const top = md.tasks
      .map((t) => ({ name: t.name, streak: streakCache.get(t.name) || 0 }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 3);

    streakText.textContent = "Top streaks: " + top.map((x) => `${x.name} (${x.streak})`).join(" • ");
  }

  function render() {
    const y = Number(yearInput?.value || today.getFullYear());
    const m = Number(monthSelect?.value || today.getMonth() + 1);
    const md = getMonthData(y, m);
    const dim = daysInMonth(y, m);

    migrateMonth(md, dim);
    populateDaySelect(y, m);

    buildStreakCache();

    renderTable(md, dim, y, m);
    renderMobileCards(md, y, m);

    updateProgress(md, dim);
    renderStreakSummary(md);
    refreshSaveUI();

    // keep today log refreshed too
    renderTodayPanel();
  }

  // ---------- Save Day action ----------
  async function saveDayNow() {
    const key = currentContextDayKey();
    if (!dirtyDays.has(key)) return;

    // Persist locally once
    saveLocal();

    // Sync once (only if signed in + online)
    if (currentUser && navigator.onLine) {
      try {
        await syncWithCloud();
      } catch {
        refreshSaveUI();
        showToast("Saved locally (cloud failed)", "error");
        return;
      }
    }

    dirtyDays.delete(key);
    refreshSaveUI();
    showToast("Saved ✅", "success");
  }

  if (saveDayBtn) {
    saveDayBtn.addEventListener("click", () => {
      saveDayNow();
    });
  }

  // ---------- Export / Import ----------
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function flattenRows() {
    const rows = [];
    for (const mo of data) {
      const y = mo.year, m = mo.month;
      const dim = daysInMonth(y, m);

      for (const t of (mo.tasks || [])) {
        for (let d = 1; d <= dim; d++) {
          const cell = normalizeCell(t.checklist?.[d]);
          rows.push({
            year: y,
            month: m,
            monthName: months[m - 1],
            day: d,
            task: t.name,
            status: cell.v || "",
            updatedAt: cell.t || 0,
            updatedBy: cell.by || ""
          });
        }
      }
    }
    return rows;
  }

  function exportJson() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), taskPayload: localPayload };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(`task-tracker-${new Date().toISOString().slice(0,10)}.json`, blob);
  }

  function exportCsv() {
    const rows = flattenRows();
    const headers = ["year","month","monthName","day","task","status","updatedAt","updatedBy"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv =
      headers.join(",") + "\n" +
      rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");

    downloadBlob(
      `task-tracker-${new Date().toISOString().slice(0,10)}.csv`,
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
  }

  function exportXlsx() {
    if (!window.XLSX) {
      showToast("Excel export needs XLSX script", "error");
      return;
    }
    const rows = flattenRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TaskData");
    XLSX.writeFile(wb, `task-tracker-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function exportData() {
    const fmt = (exportFormat?.value || "json").toLowerCase();
    if (fmt === "csv") exportCsv();
    else if (fmt === "xlsx") exportXlsx();
    else exportJson();
    showToast(`Exported ${fmt.toUpperCase()} ✅`, "info");
  }

  function sanitizeImportedPayload(parsed) {
    if (!parsed) return null;
    if (parsed.taskPayload && parsed.taskPayload.data) return parsed.taskPayload;
    if (parsed.data && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed)) return { meta: { updatedAt: 0, deviceId: "import" }, data: parsed, todayLog: {} };
    return null;
  }

  function makeUniqueName(base, existingNames) {
    if (!existingNames.has(base)) return base;
    let n = 2;
    while (existingNames.has(`${base} (${n})`)) n++;
    return `${base} (${n})`;
  }

  function promptDuplicateChoice(taskName) {
    const replace = confirm(
      `Duplicate task found: "${taskName}"\n\n` +
      `OK = Replace existing with imported\n` +
      `Cancel = More options`
    );
    if (replace) return "replace";

    const both = confirm(
      `Choose option for "${taskName}":\n\n` +
      `OK = Keep BOTH (rename imported)\n` +
      `Cancel = Keep EXISTING (skip imported)`
    );
    return both ? "both" : "keep";
  }

  function mergeImportPayload(importPayload) {
    const incoming = Array.isArray(importPayload?.data) ? importPayload.data : [];
    let added = 0, replaced = 0, kept = 0, both = 0;

    const monthMap = new Map(data.map(mo => [`${mo.year}-${mo.month}`, mo]));

    for (const imo of incoming) {
      if (!imo || typeof imo !== "object" || !("year" in imo) || !("month" in imo)) continue;

      const key = `${imo.year}-${imo.month}`;
      let target = monthMap.get(key);

      if (!target) {
        data.push(imo);
        monthMap.set(key, imo);
        added += (imo.tasks || []).length;
        continue;
      }

      if (!Array.isArray(target.tasks)) target.tasks = [];
      const existingNames = new Set(target.tasks.map(t => t.name));

      const dim = daysInMonth(imo.year, imo.month);

      for (const it of (imo.tasks || [])) {
        if (!it?.name) continue;

        if (!it.checklist) it.checklist = {};
        for (let d = 1; d <= dim; d++) it.checklist[d] = normalizeCell(it.checklist[d]);

        if (!existingNames.has(it.name)) {
          target.tasks.push(it);
          existingNames.add(it.name);
          added++;
        } else {
          const choice = promptDuplicateChoice(it.name);

          if (choice === "replace") {
            const idx = target.tasks.findIndex(t => t.name === it.name);
            if (idx >= 0) target.tasks[idx] = it;
            else target.tasks.push(it);
            replaced++;
          } else if (choice === "both") {
            const newName = makeUniqueName(it.name, existingNames);
            it.name = newName;
            target.tasks.push(it);
            existingNames.add(newName);
            both++;
          } else {
            kept++;
          }
        }
      }

      target.updatedAt = Date.now();
    }

    return { added, replaced, kept, both };
  }

  async function handleImportFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const payload = sanitizeImportedPayload(parsed);

      if (!payload) {
        showToast("Invalid import file", "error");
        return;
      }

      const stats = mergeImportPayload(payload);

      dirtyDays.add(currentContextDayKey());
      refreshSaveUI();
      resetAutoSaveCountdown();

      render();

      showToast(
        `Imported: +${stats.added}, replaced ${stats.replaced}, both ${stats.both}, kept ${stats.kept}`,
        "info"
      );
    } catch {
      showToast("Import failed", "error");
    }
  }

  if (exportBtn) exportBtn.addEventListener("click", exportData);

  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
      const file = importFile.files?.[0];
      if (file) handleImportFile(file);
      importFile.value = "";
    });
  }

  // ---------- Auth ----------
  getRedirectResult(auth).catch(() => {});

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      if (statusText) statusText.textContent = "Signed in as " + user.email;
      try {
        await syncWithCloud();
      } catch {}
      render();
    } else {
      currentUser = null;
      if (statusText) statusText.textContent = "Not signed in";
      renderTodayPanel();
    }
  });

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch {
        await signInWithRedirect(auth, provider);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      showToast("Logged out", "info");
    });
  }

  // ---------- UI ----------
  if (addTaskBtn) {
    addTaskBtn.addEventListener("click", () => {
      const input = document.getElementById("taskInput");
      if (!input || !input.value.trim()) return;

      const y = Number(yearInput.value);
      const m = Number(monthSelect.value);
      const md = getMonthData(y, m);
      const dim = daysInMonth(y, m);

      const checklist = {};
      for (let d = 1; d <= dim; d++) checklist[d] = makeEmptyCell();

      md.tasks.push({ name: input.value.trim(), checklist, updatedAt: Date.now() });
      md.updatedAt = Date.now();
      input.value = "";

      dirtyDays.add(currentContextDayKey());
      refreshSaveUI();
      resetAutoSaveCountdown();

      render();
    });
  }

  if (generateMonthBtn) generateMonthBtn.addEventListener("click", render);
  if (monthSelect) monthSelect.addEventListener("change", render);
  if (yearInput) yearInput.addEventListener("change", render);

  if (daySelect) {
    daySelect.addEventListener("change", () => {
      selectedDay = Number(daySelect.value);
      refreshSaveUI();
      render();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      selectedDay = today.getDate();
      if (daySelect) daySelect.value = String(selectedDay);
      refreshSaveUI();
      render();
    });
  }

  // ---------- TODAY LOG (one-offs) ----------
  function todayKey() {
    return isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }

  function yesterdayKey() {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - 1);
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function getTodayLogBucket(key) {
    localPayload.todayLog = localPayload.todayLog || {};
    if (!localPayload.todayLog[key]) {
      localPayload.todayLog[key] = { updatedAt: 0, items: [] };
    }
    if (!Array.isArray(localPayload.todayLog[key].items)) localPayload.todayLog[key].items = [];
    return localPayload.todayLog[key];
  }

  function touchTodayLog(key) {
    const bucket = getTodayLogBucket(key);
    bucket.updatedAt = Date.now();
  }

  function normalizeLogItem(it) {
    if (!it || typeof it !== "object") return null;
    return {
      id: String(it.id || (crypto?.randomUUID?.() || String(Math.random()).slice(2))),
      text: String(it.text || ""),
      done: !!it.done,
      category: String(it.category || "General"),
      notes: String(it.notes || ""),
      updatedAt: Number(it.updatedAt || 0),
      by: String(it.by || "")
    };
  }

  function uniqueSig(it) {
    // used for de-dup when bringing forward
    const t = (it.text || "").trim().toLowerCase();
    const c = (it.category || "General").trim().toLowerCase();
    const n = (it.notes || "").trim().toLowerCase();
    return `${c}||${t}||${n}`;
  }

  function rebuildTodayFilterOptions() {
    if (!todayFilter) return;

    const key = todayKey();
    const bucket = getTodayLogBucket(key);

    const cats = new Set(["ALL"]);
    for (const it of bucket.items) cats.add(it.category || "General");

    const current = todayFilter.value || "ALL";
    todayFilter.innerHTML = "";
    const ordered = Array.from(cats);
    // Keep ALL first, rest alpha
    const rest = ordered.filter(x => x !== "ALL").sort((a,b) => a.localeCompare(b));
    const final = ["ALL", ...rest];

    for (const c of final) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c === "ALL" ? "All categories" : c;
      todayFilter.appendChild(opt);
    }
    todayFilter.value = final.includes(current) ? current : "ALL";
  }

  async function maybeCloudSyncTodayLog() {
    saveLocal();
    if (currentUser && navigator.onLine) {
      try {
        await syncWithCloud();
      } catch {
        // keep local
      }
    }
  }

  function renderTodayPanel() {
    const todayList = document.getElementById("todayList");
    const todayMeta = document.getElementById("todayMeta");
    const todayCount = document.getElementById("todayCount");
    if (!todayList || !todayMeta || !todayCount) return;

    const key = todayKey();
    const bucket = getTodayLogBucket(key);

    // normalize items just in case older payloads exist
    bucket.items = (bucket.items || []).map(normalizeLogItem).filter(Boolean);

    todayMeta.textContent = `One-offs for ${key}`;
    rebuildTodayFilterOptions();

    const filterVal = todayFilter?.value || "ALL";
    const items = filterVal === "ALL"
      ? bucket.items
      : bucket.items.filter(x => (x.category || "General") === filterVal);

    todayList.innerHTML = "";

    let done = 0;
    let total = bucket.items.length;
    for (const it of bucket.items) if (it.done) done++;

    // render rows
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "today-row";

      const left = document.createElement("div");
      left.className = "today-left";

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = !!item.done;

      const content = document.createElement("div");
      content.style.minWidth = "0";
      content.style.flex = "1";

      const topLine = document.createElement("div");
      topLine.style.display = "flex";
      topLine.style.alignItems = "center";
      topLine.style.gap = "8px";
      topLine.style.flexWrap = "wrap";

      const title = document.createElement("div");
      title.className = "today-title";
      title.textContent = item.text || "";
      title.style.opacity = item.done ? "0.6" : "1";
      title.style.textDecoration = item.done ? "line-through" : "none";

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item.category || "General";

      topLine.appendChild(title);
      topLine.appendChild(tag);

      const notes = document.createElement("div");
      notes.className = "today-notes";
      notes.textContent = item.notes ? item.notes : "";
      notes.style.display = item.notes ? "block" : "none";

      const notesEditorWrap = document.createElement("div");
      notesEditorWrap.style.display = "none";
      notesEditorWrap.style.marginTop = "8px";

      const notesEditor = document.createElement("textarea");
      notesEditor.value = item.notes || "";
      notesEditor.placeholder = "Notes (optional)…";
      notesEditor.style.width = "100%";

      const notesActions = document.createElement("div");
      notesActions.style.display = "flex";
      notesActions.style.gap = "8px";
      notesActions.style.marginTop = "8px";
      notesActions.style.justifyContent = "flex-end";

      const btnSaveNotes = document.createElement("button");
      btnSaveNotes.type = "button";
      btnSaveNotes.className = "mini";
      btnSaveNotes.textContent = "Save notes";

      const btnCancelNotes = document.createElement("button");
      btnCancelNotes.type = "button";
      btnCancelNotes.className = "secondary mini";
      btnCancelNotes.textContent = "Cancel";

      notesActions.appendChild(btnCancelNotes);
      notesActions.appendChild(btnSaveNotes);

      notesEditorWrap.appendChild(notesEditor);
      notesEditorWrap.appendChild(notesActions);

      content.appendChild(topLine);
      content.appendChild(notes);
      content.appendChild(notesEditorWrap);

      // right actions
      const right = document.createElement("div");
      right.className = "today-right";

      const btnNotes = document.createElement("button");
      btnNotes.type = "button";
      btnNotes.className = "secondary mini";
      btnNotes.textContent = item.notes ? "Edit notes" : "Add notes";

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "danger mini";
      btnDelete.textContent = "Delete";

      right.appendChild(btnNotes);
      right.appendChild(btnDelete);

      // events
      toggle.onchange = async () => {
        item.done = toggle.checked;
        item.updatedAt = Date.now();
        item.by = deviceId;
        touchTodayLog(key);
        await maybeCloudSyncTodayLog();
        renderTodayPanel();
      };

      btnDelete.onclick = async () => {
        const idx = bucket.items.findIndex(x => x.id === item.id);
        if (idx >= 0) bucket.items.splice(idx, 1);
        touchTodayLog(key);
        await maybeCloudSyncTodayLog();
        renderTodayPanel();
      };

      btnNotes.onclick = () => {
        notesEditor.value = item.notes || "";
        notesEditorWrap.style.display = "block";
        notes.style.display = "none";
        btnNotes.disabled = true;
        setTimeout(() => notesEditor.focus(), 0);
      };

      btnCancelNotes.onclick = () => {
        notesEditorWrap.style.display = "none";
        if (item.notes) notes.style.display = "block";
        btnNotes.disabled = false;
      };

      btnSaveNotes.onclick = async () => {
        item.notes = (notesEditor.value || "").trim();
        item.updatedAt = Date.now();
        item.by = deviceId;

        touchTodayLog(key);
        await maybeCloudSyncTodayLog();

        notesEditorWrap.style.display = "none";
        notes.textContent = item.notes;
        notes.style.display = item.notes ? "block" : "none";
        btnNotes.textContent = item.notes ? "Edit notes" : "Add notes";
        btnNotes.disabled = false;

        renderTodayPanel();
      };

      left.appendChild(toggle);
      left.appendChild(content);

      row.appendChild(left);
      row.appendChild(right);
      todayList.appendChild(row);
    }

    todayCount.textContent = `${done}/${total} done`;
  }

  // add item
  if (todayAddBtn) {
    todayAddBtn.addEventListener("click", async () => {
      if (!todayInput || !todayInput.value.trim()) return;

      const key = todayKey();
      const bucket = getTodayLogBucket(key);

      const item = normalizeLogItem({
        id: crypto?.randomUUID?.() || String(Math.random()).slice(2),
        text: todayInput.value.trim(),
        done: false,
        category: todayCategory?.value || "General",
        notes: "",
        updatedAt: Date.now(),
        by: deviceId
      });

      bucket.items.unshift(item);

      todayInput.value = "";
      touchTodayLog(key);
      await maybeCloudSyncTodayLog();
      renderTodayPanel();
      showToast("Added to Today Log ✅", "success");
    });
  }

  if (todayInput) {
    todayInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") todayAddBtn?.click();
    });
  }

  if (todayFilter) {
    todayFilter.addEventListener("change", () => renderTodayPanel());
  }

  // bring forward unfinished from yesterday
  if (todayBringForwardBtn) {
    todayBringForwardBtn.addEventListener("click", async () => {
      const yKey = yesterdayKey();
      const tKey = todayKey();
      const yBucket = getTodayLogBucket(yKey);
      const tBucket = getTodayLogBucket(tKey);

      // normalize
      yBucket.items = (yBucket.items || []).map(normalizeLogItem).filter(Boolean);
      tBucket.items = (tBucket.items || []).map(normalizeLogItem).filter(Boolean);

      const unfinished = yBucket.items.filter(x => !x.done);

      if (unfinished.length === 0) {
        showToast("No unfinished items from yesterday", "info");
        return;
      }

      const existingSigs = new Set(tBucket.items.map(uniqueSig));
      let added = 0;

      for (const it of unfinished) {
        const sig = uniqueSig(it);
        if (existingSigs.has(sig)) continue;

        tBucket.items.unshift(normalizeLogItem({
          id: crypto?.randomUUID?.() || String(Math.random()).slice(2),
          text: it.text,
          done: false,
          category: it.category || "General",
          notes: it.notes || "",
          updatedAt: Date.now(),
          by: deviceId
        }));

        existingSigs.add(sig);
        added++;
      }

      if (added === 0) {
        showToast("Nothing new to bring forward (already present)", "info");
        return;
      }

      touchTodayLog(tKey);
      await maybeCloudSyncTodayLog();
      renderTodayPanel();
      showToast(`Brought forward ${added} item${added === 1 ? "" : "s"} ✅`, "success");
    });
  }

  // Clear done
  document.getElementById("todayClearDoneBtn")?.addEventListener("click", async () => {
    const key = todayKey();
    const bucket = getTodayLogBucket(key);

    bucket.items = (bucket.items || []).map(normalizeLogItem).filter(Boolean).filter(x => !x.done);

    touchTodayLog(key);
    await maybeCloudSyncTodayLog();
    renderTodayPanel();
    showToast("Cleared done items ✅", "info");
  });

  // Clear all
  document.getElementById("todayClearAllBtn")?.addEventListener("click", async () => {
    if (!confirm("Clear all Today Log items?")) return;

    const key = todayKey();
    const bucket = getTodayLogBucket(key);
    bucket.items = [];

    touchTodayLog(key);
    await maybeCloudSyncTodayLog();
    renderTodayPanel();
    showToast("Cleared Today Log ✅", "info");
  });

  // Refresh
  document.getElementById("todayRefreshBtn")?.addEventListener("click", () => {
    renderTodayPanel();
  });

  // ---------- Initial render ----------
  render();
  renderTodayPanel();
});
