import { auth, provider, cloudSave, cloudLoad } from "./firebase.js";

import {
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
  const statusText = document.getElementById("statusText");
  const progressText = document.getElementById("progressText");
  const progressBar = document.getElementById("progressBar");

  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const viewToggle = document.getElementById("viewToggle");
  const addTaskBtn = document.getElementById("addTaskBtn");
  const generateMonthBtn = document.getElementById("generateMonthBtn");

  const debugBox = document.getElementById("debugBox");

  // ---------- Debug helpers (mobile-visible) ----------
  const dbg = (msg) => {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
    console.log(text);
    if (debugBox) debugBox.textContent = text;
  };

  window.addEventListener("error", (e) => {
    dbg("JS error:\n" + (e?.message || e));
  });
  window.addEventListener("unhandledrejection", (e) => {
    dbg("Promise error:\n" + (e?.reason?.message || e?.reason || e));
  });

  dbg("App loaded.\nUA=" + navigator.userAgent);

  // ---------- State ----------
  const today = new Date();
  let data = JSON.parse(localStorage.getItem("taskData")) || [];
  let currentUser = null;

  // ---------- Months ----------
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (monthSelect && monthSelect.options.length === 0) {
    months.forEach((m, i) => {
      const opt = document.createElement("option");
      opt.value = i + 1;
      opt.textContent = m;
      monthSelect.appendChild(opt);
    });
  }
  if (monthSelect) monthSelect.value = String(today.getMonth() + 1);
  if (yearInput) yearInput.value = String(today.getFullYear());

  // ---------- Utilities ----------
  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function saveLocal() {
    localStorage.setItem("taskData", JSON.stringify(data));
  }

  function autoSync() {
    if (!currentUser) return;
    cloudSave(currentUser.uid, data).catch((err) => {
      dbg("Cloud sync failed:\n" + (err?.code || "") + "\n" + (err?.message || err));
    });
  }

  function getMonthData(y, m) {
    let found = data.find((d) => d.year === y && d.month === m);
    if (!found) {
      found = { year: y, month: m, tasks: [] };
      data.push(found);
    }
    return found;
  }

  // ---------- App actions ----------
  function addTask() {
    const input = document.getElementById("taskInput");
    if (!input || !input.value.trim()) return;

    const y = Number(yearInput?.value || today.getFullYear());
    const m = Number(monthSelect?.value || today.getMonth() + 1);
    const md = getMonthData(y, m);
    const days = daysInMonth(y, m);

    const checklist = {};
    for (let d = 1; d <= days; d++) checklist[d] = "";

    md.tasks.push({ name: input.value.trim(), checklist });
    input.value = "";

    saveLocal();
    autoSync();
    render();
  }

  function toggleCheck(taskIndex, day) {
    const y = Number(yearInput?.value || today.getFullYear());
    const m = Number(monthSelect?.value || today.getMonth() + 1);
    const md = getMonthData(y, m);

    if (!md.tasks[taskIndex]) return;

    const val = md.tasks[taskIndex].checklist[day] ?? "";
    md.tasks[taskIndex].checklist[day] = val === "" ? "✔" : val === "✔" ? "✖" : "";

    saveLocal();
    autoSync();
    render();
  }

  function deleteTask(taskIndex) {
    const y = Number(yearInput?.value || today.getFullYear());
    const m = Number(monthSelect?.value || today.getMonth() + 1);
    const md = getMonthData(y, m);

    if (!md.tasks[taskIndex]) return;

    const ok = confirm("Delete this task?");
    if (!ok) return;

    md.tasks.splice(taskIndex, 1);

    saveLocal();
    autoSync();
    render();
  }

  function updateProgress(md, days) {
    let total = 0;
    let done = 0;

    md.tasks.forEach((t) => {
      for (let d = 1; d <= days; d++) {
        if (t.checklist[d] !== "") {
          total++;
          if (t.checklist[d] === "✔") done++;
        }
      }
    });

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    if (progressText) progressText.innerText = `Completed ${done} of ${total} — ${pct}%`;
    if (progressBar) progressBar.style.width = pct + "%";
  }

  function render() {
    if (!tableContainer) return;

    const y = Number(yearInput?.value || today.getFullYear());
    const m = Number(monthSelect?.value || today.getMonth() + 1);
    const md = getMonthData(y, m);
    const days = daysInMonth(y, m);

    let html = "<table><thead><tr><th class='task-col'>Task</th>";
    for (let d = 1; d <= days; d++) html += `<th>${d}</th>`;
    html += "</tr></thead><tbody>";

    md.tasks.forEach((t, i) => {
      html += `<tr>`;
      html += `<td class="task-col">${escapeHtml(t.name)}
        <button class="danger del" data-i="${i}" style="margin-left:6px;">✕</button>
      </td>`;

      for (let d = 1; d <= days; d++) {
        const val = t.checklist[d] || "";
        const cls = val === "✔" ? "done" : val === "✖" ? "missed" : "";
        html += `<td class="${cls}" data-t="${i}" data-d="${d}">${val}</td>`;
      }
      html += `</tr>`;
    });

    html += "</tbody></table>";
    tableContainer.innerHTML = html;

    // bind cell clicks
    tableContainer.querySelectorAll("td[data-t]").forEach((cell) => {
      cell.addEventListener("click", () => {
        const t = Number(cell.dataset.t);
        const d = Number(cell.dataset.d);
        toggleCheck(t, d);
      });
    });

    // bind delete
    tableContainer.querySelectorAll(".del").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteTask(Number(btn.dataset.i));
      });
    });

    updateProgress(md, days);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- AUTH: redirect result (mobile visible) ----------
  getRedirectResult(auth)
    .then((result) => {
      if (result?.user) {
        dbg("getRedirectResult: user=" + result.user.email);
      } else {
        dbg("getRedirectResult: no user (normal if not returning from login)");
      }
    })
    .catch((err) => {
      dbg("getRedirectResult FAILED:\n" + (err?.code || "") + "\n" + (err?.message || err));
    });

  // ---------- AUTH: state changes ----------
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      if (statusText) statusText.textContent = "Signed in as " + user.email;
      dbg("onAuthStateChanged: signed in " + user.email);

      try {
        const cloud = await cloudLoad(user.uid);
        dbg("cloudLoad: " + (cloud ? "loaded data" : "no data"));
        if (cloud) {
          data = cloud;
          saveLocal();
        }
      } catch (err) {
        dbg("cloudLoad FAILED:\n" + (err?.code || "") + "\n" + (err?.message || err));
      }

      render();
    } else {
      currentUser = null;
      if (statusText) statusText.textContent = "Not signed in";
      dbg("onAuthStateChanged: not signed in");
    }
  });

  // ---------- Buttons ----------
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      try {
        dbg("Login clicked -> signInWithRedirect starting...");
        await signInWithRedirect(auth, provider);
      } catch (err) {
        dbg("signInWithRedirect FAILED:\n" + (err?.code || "") + "\n" + (err?.message || err));
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        dbg("Signed out");
      } catch (err) {
        dbg("signOut FAILED:\n" + (err?.code || "") + "\n" + (err?.message || err));
      }
    });
  }

  if (viewToggle) {
    viewToggle.addEventListener("click", () => {
      document.body.classList.toggle("mobile-view");
    });
  }

  if (addTaskBtn) addTaskBtn.addEventListener("click", addTask);
  if (generateMonthBtn) generateMonthBtn.addEventListener("click", render);

  if (monthSelect) monthSelect.addEventListener("change", render);
  if (yearInput) yearInput.addEventListener("change", render);

  // ---------- Initial render ----------
  render();
});
