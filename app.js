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

  // Profiles DOM
  const profileSelect = document.getElementById("profileSelect");
  const addProfileBtn = document.getElementById("addProfileBtn");
  const renameProfileBtn = document.getElementById("renameProfileBtn");
  const deleteProfileBtn = document.getElementById("deleteProfileBtn");

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

  // payload storage
  let localPayload = JSON.parse(localStorage.getItem("taskPayload")) || null;

  // Backward compatibility (older versions stored only taskData)
  if (!localPayload) {
    const legacy = JSON.parse(localStorage.getItem("taskData")) || [];
    localPayload = {
      meta: { updatedAt: 0, deviceId },
      profiles: {
        default: { name: "Me", updatedAt: 0, data: legacy, todayLog: {} }
      },
      activeProfileId: "default"
    };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));
  }

  // If it was the earlier todayLog-only payload: {meta,data,todayLog}
  if (localPayload && !localPayload.profiles) {
    const legacyData = Array.isArray(localPayload.data) ? localPayload.data : [];
    const legacyTodayLog = localPayload.todayLog || {};
    localPayload = {
      meta: localPayload.meta || { updatedAt: 0, deviceId },
      profiles: {
        default: { name: "Me", updatedAt: localPayload.meta?.updatedAt || 0, data: legacyData, todayLog: legacyTodayLog }
      },
      activeProfileId: "default"
    };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));
  }

  localPayload.meta = localPayload.meta || { updatedAt: 0, deviceId };
  localPayload.profiles = localPayload.profiles || { default: { name: "Me", updatedAt: 0, data: [], todayLog: {} } };
  localPayload.activeProfileId = localPayload.activeProfileId || "default";

  // active profile pointers
  let activeProfileId = localPayload.activeProfileId;
  function getActiveProfile() {
    if (!localPayload.profiles[activeProfileId]) {
      activeProfileId = Object.keys(localPayload.profiles)[0] || "default";
      if (!localPayload.profiles[activeProfileId]) {
        localPayload.profiles[activeProfileId] = { name: "Me", updatedAt: 0, data: [], todayLog: {} };
      }
      localPayload.activeProfileId = activeProfileId;
    }
    const p = localPayload.profiles[activeProfileId];
    p.data = Array.isArray(p.data) ? p.data : [];
    p.todayLog = p.todayLog || {};
    p.updatedAt = Number(p.updatedAt || 0);
    return p;
  }

  let selectedDay = today.getDate();

  // Track which day(s) have unsaved edits (YYYY-MM-DD strings) for the ACTIVE profile
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

  function touchProfile() {
    const p = getActiveProfile();
    p.updatedAt = Date.now();
    localPayload.meta.updatedAt = Date.now();
  }

  function saveLocal() {
    // persist activeProfileId + profiles + meta
    localPayload.activeProfileId = activeProfileId;
    localPayload.meta = { updatedAt: Date.now(), deviceId };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));

    // legacy mirror for very old versions (store active profile only)
    const p = getActiveProfile();
    localStorage.setItem("taskData", JSON.stringify(p.data || []));
  }

  function resetAutoSaveCountdown() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);

    autoSaveTimer = setTimeout(async () => {
      autoSaveTimer = null;
      if (dirtyDays.size === 0) return;

      saveLocal();

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

  // ---------- Profiles UI ----------
  function rebuildProfileSelect() {
    if (!profileSelect) return;

    const ids = Object.keys(localPayload.profiles || {});
    if (ids.length === 0) {
      localPayload.profiles = { default: { name: "Me", updatedAt: 0, data: [], todayLog: {} } };
      activeProfileId = "default";
      localPayload.activeProfileId = "default";
    }

    profileSelect.innerHTML = "";
    for (const id of Object.keys(localPayload.profiles)) {
      const p = localPayload.profiles[id];
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = p?.name || id;
      profileSelect.appendChild(opt);
    }
    profileSelect.value = activeProfileId;
  }

  function slugifyName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "profile";
  }

  function makeUniqueProfileId(base) {
    const existing = new Set(Object.keys(localPayload.profiles || {}));
    if (!existing.has(base)) return base;
    let n = 2;
    while (existing.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  function switchProfile(newId) {
    if (!localPayload.profiles[newId]) return;

    // save current first (best effort)
    saveLocal();

    activeProfileId = newId;
    localPayload.activeProfileId = newId;

    // clear dirty for safety on switch
    dirtyDays.clear();
    refreshSaveUI();

    rebuildProfileSelect();
    render();
    renderTodayPanel();
    showToast("Switched profile", "info");
  }

  if (profileSelect) {
    rebuildProfileSelect();
    profileSelect.addEventListener("change", () => {
      const id = profileSelect.value;
      switchProfile(id);
    });
  }

  if (addProfileBtn) {
    addProfileBtn.addEventListener("click", () => {
      const name = prompt("Profile name (e.g., Alex):");
      if (!name || !name.trim()) return;

      const baseId = slugifyName(name);
      const id = makeUniqueProfileId(baseId);

      localPayload.profiles[id] = { name: name.trim(), updatedAt: Date.now(), data: [], todayLog: {} };
      touchProfile();
      saveLocal();

      rebuildProfileSelect();
      switchProfile(id);
    });
  }

  if (renameProfileBtn) {
    renameProfileBtn.addEventListener("click", () => {
      const p = getActiveProfile();
      const name = prompt("Rename profile:", p.name || "");
      if (!name || !name.trim()) return;

      p.name = name.trim();
      p.updatedAt = Date.now();
      touchProfile();
      saveLocal();

      rebuildProfileSelect();
      render();
      renderTodayPanel();
      showToast("Renamed profile ✅", "success");
    });
  }

  if (deleteProfileBtn) {
    deleteProfileBtn.addEventListener("click", () => {
      const ids = Object.keys(localPayload.profiles || {});
      if (ids.length <= 1) {
        showToast("You need at least 1 profile", "info");
        return;
      }

      const p = getActiveProfile();
      const ok = confirm(`Delete profile "${p.name || activeProfileId}"?\n\nThis will remove its data from this account.`);
      if (!ok) return;

      delete localPayload.profiles[activeProfileId];

      const nextId = Object.keys(localPayload.profiles)[0];
      activeProfileId = nextId;
      localPayload.activeProfileId = nextId;

      touchProfile();
      saveLocal();

      rebuildProfileSelect();
      render();
      renderTodayPanel();
      showToast("Deleted profile", "info");
    });
  }

  // ---------- Month data helpers (per active profile) ----------
  function getProfileDataArray() {
    return getActiveProfile().data;
  }

  function getMonthData(y, m) {
    const data = getProfileDataArray();
    let found = data.find((d) => d.year === y && d.month === m);
    if (!found) {
      found = { year: y, month: m, tasks: [], updatedAt: 0 };
      data.push(found);
      touchProfile();
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

  // ---------- Conflict merge helpers ----------
  function mergeMonthData(localDataArr, cloudDataArr) {
    const out = [];
    const byKey = new Map();

    const addMonth = (mo) => {
      const key = `${mo.year}-${mo.month}`;
      if (!byKey.has(key)) byKey.set(key, { year: mo.year, month: mo.month, tasks: [], updatedAt: 0 });
      return byKey.get(key);
    };

    const ingest = (arr) => {
      const monthsArr = Array.isArray(arr) ? arr : [];
      for (const mo of monthsArr) {
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

    ingest(localDataArr);
    ingest(cloudDataArr);

    out.push(...Array.from(byKey.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month)));
    return out;
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

  function mergeTodayLog(localTL, cloudTL) {
    const outTL = {};
    const A = localTL || {};
    const B = cloudTL || {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);

    for (const k of keys) {
      const la = A[k] || { updatedAt: 0, items: [] };
      const lb = B[k] || { updatedAt: 0, items: [] };

      const map = new Map();

      for (const it of (la.items || [])) {
        const n = normalizeLogItem(it);
        if (n) map.set(n.id, n);
      }
      for (const it of (lb.items || [])) {
        const n = normalizeLogItem(it);
        if (!n) continue;
        const ex = map.get(n.id);
        if (!ex || (n.updatedAt || 0) > (ex.updatedAt || 0)) map.set(n.id, n);
      }

      outTL[k] = {
        updatedAt: Math.max(la.updatedAt || 0, lb.updatedAt || 0),
        items: Array.from(map.values()).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))
      };
    }
    return outTL;
  }

  function mergeProfiles(localProfiles, cloudProfiles) {
    const out = {};
    const A = localProfiles || {};
    const B = cloudProfiles || {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);

    for (const id of keys) {
      const lp = A[id];
      const cp = B[id];

      // If one side missing, take the other
      if (lp && !cp) {
        out[id] = {
          name: lp.name || id,
          updatedAt: Number(lp.updatedAt || 0),
          data: Array.isArray(lp.data) ? lp.data : [],
          todayLog: lp.todayLog || {}
        };
        continue;
      }
      if (cp && !lp) {
        out[id] = {
          name: cp.name || id,
          updatedAt: Number(cp.updatedAt || 0),
          data: Array.isArray(cp.data) ? cp.data : [],
          todayLog: cp.todayLog || {}
        };
        continue;
      }

      // Both exist: merge their data
      const mergedData = mergeMonthData(lp.data, cp.data);
      const mergedTL = mergeTodayLog(lp.todayLog, cp.todayLog);

      const lpUpdated = Number(lp.updatedAt || 0);
      const cpUpdated = Number(cp.updatedAt || 0);

      out[id] = {
        name: (cpUpdated > lpUpdated ? (cp.name || lp.name || id) : (lp.name || cp.name || id)),
        updatedAt: Math.max(lpUpdated, cpUpdated, Date.now()),
        data: mergedData,
        todayLog: mergedTL
      };
    }

    return out;
  }

  function mergePayload(localP, cloudP) {
    const out = {
      meta: { updatedAt: Date.now(), deviceId },
      profiles: {},
      activeProfileId: localP?.activeProfileId || cloudP?.activeProfileId || "default"
    };

    out.profiles = mergeProfiles(localP?.profiles, cloudP?.profiles);

    // Ensure at least one profile
    if (!out.profiles || Object.keys(out.profiles).length === 0) {
      out.profiles = { default: { name: "Me", updatedAt: 0, data: [], todayLog: {} } };
      out.activeProfileId = "default";
    }
    if (!out.profiles[out.activeProfileId]) out.activeProfileId = Object.keys(out.profiles)[0];

    return out;
  }

  async function syncWithCloud() {
    if (!currentUser) return;

    const cloudData = await cloudLoad(currentUser.uid);

    // normalize cloud payload
    const cloudPayload =
      cloudData && typeof cloudData === "object" && !Array.isArray(cloudData) && "profiles" in cloudData
        ? cloudData
        : (
            cloudData && typeof cloudData === "object" && !Array.isArray(cloudData) && "data" in cloudData
              ? {
                  meta: cloudData.meta || { updatedAt: 0, deviceId: "cloud" },
                  profiles: {
                    default: { name: "Me", updatedAt: cloudData.meta?.updatedAt || 0, data: Array.isArray(cloudData.data) ? cloudData.data : [], todayLog: cloudData.todayLog || {} }
                  },
                  activeProfileId: "default"
                }
              : {
                  meta: { updatedAt: 0, deviceId: "cloud" },
                  profiles: { default: { name: "Me", updatedAt: 0, data: Array.isArray(cloudData) ? cloudData : [], todayLog: {} } },
                  activeProfileId: "default"
                }
          );

    const merged = mergePayload(localPayload, cloudPayload);

    localPayload = merged;
    activeProfileId = merged.activeProfileId;
    localPayload.activeProfileId = activeProfileId;

    saveLocal();
    rebuildProfileSelect();

    await cloudSave(currentUser.uid, merged);
  }

  // ---------- Habit streak (cached per render) ----------
  let streakCache = new Map();

  function computeStreakForTaskName(taskName) {
    const data = getProfileDataArray();
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
    const data = getProfileDataArray();
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
        touchProfile();

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
        touchProfile();

        dirtyDays.add(currentContextDayKey());
        refreshSaveUI();
        resetAutoSaveCountdown();

        render();
      });
    });
  }

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
        touchProfile();
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

    rebuildProfileSelect();
  }

  // ---------- Save Day action ----------
  async function saveDayNow() {
    const key = currentContextDayKey();
    if (!dirtyDays.has(key)) return;

    saveLocal();

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
    saveDayBtn.addEventListener("click", () => saveDayNow());
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

  function flattenRowsAllProfiles() {
    const rows = [];
    const profiles = localPayload.profiles || {};

    for (const [pid, prof] of Object.entries(profiles)) {
      const pname = prof?.name || pid;
      const dataArr = Array.isArray(prof?.data) ? prof.data : [];

      for (const mo of dataArr) {
        const y = mo.year, m = mo.month;
        const dim = daysInMonth(y, m);

        for (const t of (mo.tasks || [])) {
          for (let d = 1; d <= dim; d++) {
            const cell = normalizeCell(t.checklist?.[d]);
            rows.push({
              profile: pname,
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
    }
    return rows;
  }

  function exportJson() {
    const payload = { version: 2, exportedAt: new Date().toISOString(), taskPayload: localPayload };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    downloadBlob(`task-tracker-${new Date().toISOString().slice(0,10)}.json`, blob);
  }

  function exportCsv() {
    const rows = flattenRowsAllProfiles();
    const headers = ["profile","year","month","monthName","day","task","status","updatedAt","updatedBy"];
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
    const rows = flattenRowsAllProfiles();
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
    if (parsed.taskPayload) return parsed.taskPayload;

    // support raw payload structures
    if (parsed.profiles) return parsed;
    if (parsed.data) {
      return {
        meta: parsed.meta || { updatedAt: 0, deviceId: "import" },
        profiles: { default: { name: "Me", updatedAt: parsed.meta?.updatedAt || 0, data: parsed.data, todayLog: parsed.todayLog || {} } },
        activeProfileId: "default"
      };
    }
    if (Array.isArray(parsed)) {
      return {
        meta: { updatedAt: 0, deviceId: "import" },
        profiles: { default: { name: "Me", updatedAt: 0, data: parsed, todayLog: {} } },
        activeProfileId: "default"
      };
    }
    return null;
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

      // Merge entire payload (profiles + tasks + todayLog)
      localPayload = mergePayload(localPayload, payload);
      activeProfileId = localPayload.activeProfileId;

      saveLocal();
      rebuildProfileSelect();
      render();
      renderTodayPanel();

      showToast("Imported ✅ (profiles merged)", "info");
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
      rebuildProfileSelect();
      render();
      renderTodayPanel();
    } else {
      currentUser = null;
      if (statusText) statusText.textContent = "Not signed in";
      rebuildProfileSelect();
      render();
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
      touchProfile();
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

  // ---------- TODAY LOG (per active profile) ----------
  function todayKey() {
    return isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }

  function yesterdayKey() {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - 1);
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function getTodayLogBucket(key) {
    const p = getActiveProfile();
    p.todayLog = p.todayLog || {};
    if (!p.todayLog[key]) p.todayLog[key] = { updatedAt: 0, items: [] };
    if (!Array.isArray(p.todayLog[key].items)) p.todayLog[key].items = [];
    return p.todayLog[key];
  }

  function touchTodayLog(key) {
    const bucket = getTodayLogBucket(key);
    bucket.updatedAt = Date.now();
    touchProfile();
  }

  function uniqueSig(it) {
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
    for (const it of bucket.items) cats.add((it.category || "General"));

    const current = todayFilter.value || "ALL";
    todayFilter.innerHTML = "";
    const rest = Array.from(cats).filter(x => x !== "ALL").sort((a,b) => a.localeCompare(b));
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

  function addDaysToISO(iso, deltaDays) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return isoDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }

  function last7KeysEndingToday() {
    const tKey = todayKey();
    const keys = [];
    for (let i = 6; i >= 0; i--) keys.push(addDaysToISO(tKey, -i));
    return keys;
  }

  function renderWeeklyRollup() {
    const rowsEl = document.getElementById("todayWeeklyRows");
    const metaEl = document.getElementById("todayWeeklyMeta");
    if (!rowsEl || !metaEl) return;

    const keys = last7KeysEndingToday();

    const agg = new Map();
    let weekDone = 0;
    let weekTotal = 0;

    for (const k of keys) {
      const bucket = getTodayLogBucket(k);
      const items = (bucket.items || []).map(normalizeLogItem).filter(Boolean);
      for (const it of items) {
        const cat = it.category || "General";
        if (!agg.has(cat)) agg.set(cat, { done: 0, total: 0 });
        const a = agg.get(cat);
        a.total++;
        weekTotal++;
        if (it.done) {
          a.done++;
          weekDone++;
        }
      }
    }

    const start = keys[0];
    const end = keys[keys.length - 1];
    const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
    metaEl.textContent = `${start} → ${end} • ${weekDone}/${weekTotal} done (${pct}%)`;

    rowsEl.innerHTML = "";

    if (weekTotal === 0) {
      const empty = document.createElement("div");
      empty.style.fontSize = "13px";
      empty.style.color = "#64748b";
      empty.textContent = "No Today Log entries in the last 7 days.";
      rowsEl.appendChild(empty);
      return;
    }

    const sorted = Array.from(agg.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => (b.total - a.total) || a.category.localeCompare(b.category));

    for (const r of sorted) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.style.flexWrap = "wrap";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "8px";

      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = r.category;

      const stat = document.createElement("div");
      stat.style.fontSize = "13px";
      stat.style.color = "#475569";
      const rpct = r.total ? Math.round((r.done / r.total) * 100) : 0;
      stat.textContent = `${r.done}/${r.total} done (${rpct}%)`;

      left.appendChild(tag);
      left.appendChild(stat);

      const barWrap = document.createElement("div");
      barWrap.style.flex = "1";
      barWrap.style.minWidth = "180px";
      barWrap.style.maxWidth = "360px";
      barWrap.style.height = "10px";
      barWrap.style.borderRadius = "999px";
      barWrap.style.background = "#eef2f7";
      barWrap.style.overflow = "hidden";

      const bar = document.createElement("div");
      bar.style.height = "10px";
      bar.style.width = (r.total ? (r.done / r.total) * 100 : 0) + "%";
      bar.style.background = "linear-gradient(90deg, #86efac, #4ade80)";

      barWrap.appendChild(bar);

      row.appendChild(left);
      row.appendChild(barWrap);
      rowsEl.appendChild(row);
    }
  }

  function renderTodayPanel() {
    const todayList = document.getElementById("todayList");
    const todayMeta = document.getElementById("todayMeta");
    const todayCount = document.getElementById("todayCount");
    if (!todayList || !todayMeta || !todayCount) return;

    const key = todayKey();
    const bucket = getTodayLogBucket(key);

    bucket.items = (bucket.items || []).map(normalizeLogItem).filter(Boolean);

    const p = getActiveProfile();
    todayMeta.textContent = `One-offs for ${key} • Profile: ${p.name || activeProfileId}`;

    rebuildTodayFilterOptions();
    renderWeeklyRollup();

    const filterVal = todayFilter?.value || "ALL";
    const items = filterVal === "ALL"
      ? bucket.items
      : bucket.items.filter(x => (x.category || "General") === filterVal);

    todayList.innerHTML = "";

    let done = 0;
    let total = bucket.items.length;
    for (const it of bucket.items) if (it.done) done++;

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

      bucket.items.unshift(normalizeLogItem({
        id: crypto?.randomUUID?.() || String(Math.random()).slice(2),
        text: todayInput.value.trim(),
        done: false,
        category: todayCategory?.value || "General",
        notes: "",
        updatedAt: Date.now(),
        by: deviceId
      }));

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
  document.getElementById("todayRefreshBtn")?.addEventListener("click", () => renderTodayPanel());

  // ---------- Initial render ----------
  rebuildProfileSelect();
  render();
  renderTodayPanel();
});
