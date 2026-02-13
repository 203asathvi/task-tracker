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

  // ---------- State ----------
  const today = new Date();
  let currentUser = null;

  // device id for tie-breakers
  const deviceIdKey = "taskTrackerDeviceId";
  const deviceId =
    localStorage.getItem(deviceIdKey) ||
    (() => {
      const id = crypto?.randomUUID?.() || String(Math.random()).slice(2);
      localStorage.setItem(deviceIdKey, id);
      return id;
    })();

  // local storage payload (we keep meta)
  let localPayload = JSON.parse(localStorage.getItem("taskPayload")) || null;

  // Backward compatibility
  if (!localPayload) {
    const legacy = JSON.parse(localStorage.getItem("taskData")) || [];
    localPayload = { meta: { updatedAt: 0, deviceId }, data: legacy };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));
  }

  let data = Array.isArray(localPayload.data) ? localPayload.data : [];
  let selectedDay = today.getDate(); // for mobile cards

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
    if (!saved) detectViewMode();
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

  // Checklist cell: { v: "", "✔", "✖", t: epochMs, by: deviceId }
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

  function saveLocal() {
    const now = Date.now();
    localPayload = { meta: { updatedAt: now, deviceId }, data };
    localStorage.setItem("taskPayload", JSON.stringify(localPayload));
    localStorage.setItem("taskData", JSON.stringify(data)); // legacy
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

  // ---------- Conflict merge ----------
  function mergePayload(localP, cloudP) {
    const out = { meta: { updatedAt: Date.now(), deviceId }, data: [] };

    const byKey = new Map(); // `${year}-${month}` -> monthObj
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

    ingest(localP);
    ingest(cloudP);

    out.data = Array.from(byKey.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month));
    return out;
  }

  async function syncWithCloud() {
    if (!currentUser) return;

    const cloudData = await cloudLoad(currentUser.uid);

    const cloudPayload =
      cloudData && typeof cloudData === "object" && !Array.isArray(cloudData) && "data" in cloudData
        ? cloudData
        : { meta: { updatedAt: 0, deviceId: "cloud" }, data: Array.isArray(cloudData) ? cloudData : [] };

    const merged = mergePayload(localPayload, cloudPayload);

    data = merged.data;
    localPayload = merged;
    saveLocal();

    await cloudSave(currentUser.uid, merged);
  }

  // ---------- Habit streak ----------
  function computeStreakForTaskName(taskName) {
    const statusByDate = new Map(); // iso -> "✔"/"✖"/""
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

  // ---------- Rendering helpers ----------
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

  function renderTable(md, days) {
    if (!tableContainer) return;

    let html = "<table><thead><tr><th class='task-col'>Task</th>";
    for (let d = 1; d <= days; d++) html += `<th>${d}</th>`;
    html += "</tr></thead><tbody>";

    md.tasks.forEach((t, i) => {
      html += `<tr><td class="task-col">${t.name}
        <button class="danger del" data-i="${i}" style="margin-left:6px;">✕</button>
      </td>`;

      for (let d = 1; d <= days; d++) {
        const v = cellValue(t.checklist?.[d]);
        const cls = v === "✔" ? "done" : v === "✖" ? "missed" : "";
        html += `<td class="${cls}" data-t="${i}" data-d="${d}">${v}</td>`;
      }
      html += "</tr>";
    });

    html += "</tbody></table>";
    tableContainer.innerHTML = html;

    tableContainer.querySelectorAll("td[data-t]").forEach((cell) => {
      cell.addEventListener("click", () => {
        const t = Number(cell.dataset.t);
        const d = Number(cell.dataset.d);
        const current = cellValue(md.tasks[t].checklist?.[d]);
        const next = current === "" ? "✔" : current === "✔" ? "✖" : "";
        setCell(md.tasks[t], d, next);
        md.updatedAt = Date.now();
        saveLocal();
        if (navigator.onLine) syncWithCloud().catch(() => {});
        render();
      });
    });

    tableContainer.querySelectorAll(".del").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.i);
        if (!confirm("Delete this task?")) return;
        md.tasks.splice(idx, 1);
        md.updatedAt = Date.now();
        saveLocal();
        if (navigator.onLine) syncWithCloud().catch(() => {});
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
      const streak = computeStreakForTaskName(t.name);

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
      btnDone.onclick = () => {
        setCell(t, day, "✔");
        md.updatedAt = Date.now();
        saveLocal();
        if (navigator.onLine) syncWithCloud().catch(() => {});
        render();
      };

      const btnMiss = document.createElement("button");
      btnMiss.textContent = "✖";
      btnMiss.style.padding = "10px 14px";
      btnMiss.style.background = "#ef4444";
      btnMiss.onclick = () => {
        setCell(t, day, "✖");
        md.updatedAt = Date.now();
        saveLocal();
        if (navigator.onLine) syncWithCloud().catch(() => {});
        render();
      };

      const btnClear = document.createElement("button");
      btnClear.textContent = "—";
      btnClear.className = "secondary";
      btnClear.style.padding = "10px 14px";
      btnClear.onclick = () => {
        setCell(t, day, "");
        md.updatedAt = Date.now();
        saveLocal();
        if (navigator.onLine) syncWithCloud().catch(() => {});
        render();
      };

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
      .map((t) => ({ name: t.name, streak: computeStreakForTaskName(t.name) }))
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

    renderTable(md, dim);
    renderMobileCards(md, y, m);

    updateProgress(md, dim);
    renderStreakSummary(md);
  }

  // ---------- Auth ----------
  getRedirectResult(auth).catch(() => {});

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      if (statusText) statusText.textContent = "Signed in as " + user.email;
      try { await syncWithCloud(); } catch {}
      render();
    } else {
      currentUser = null;
      if (statusText) statusText.textContent = "Not signed in";
    }
  });

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      try { await signInWithPopup(auth, provider); }
      catch { await signInWithRedirect(auth, provider); }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
    });
  }

  window.addEventListener("online", () => {
    if (currentUser) syncWithCloud().catch(() => {});
  });

  // ---------- UI ----------
  if (addTaskBtn) addTaskBtn.addEventListener("click", () => {
    const input = document.getElementById("taskInput");
    if (!input || !input.value.trim()) return;

    const y = Number(yearInput.value);
    const m = Number(monthSelect.value);
    const md = getMonthData(y, m);
    const dim = daysInMonth(y, m);

    const checklist = {};
    for (let d = 1; d <= dim; d++) checklist[d] = normalizeCell("");

    md.tasks.push({ name: input.value.trim(), checklist, updatedAt: Date.now() });
    md.updatedAt = Date.now();
    input.value = "";

    saveLocal();
    if (navigator.onLine && currentUser) syncWithCloud().catch(() => {});
    render();
  });

  if (generateMonthBtn) generateMonthBtn.addEventListener("click", render);
  if (monthSelect) monthSelect.addEventListener("change", render);
  if (yearInput) yearInput.addEventListener("change", render);

  if (daySelect) daySelect.addEventListener("change", () => {
    selectedDay = Number(daySelect.value);
    render();
  });

  if (todayBtn) todayBtn.addEventListener("click", () => {
    selectedDay = today.getDate();
    if (daySelect) daySelect.value = String(selectedDay);
    render();
  });

  render();
});
