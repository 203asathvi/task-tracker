document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();

  const monthSelect = document.getElementById("monthSelect");
  const yearInput = document.getElementById("yearInput");
  const tableContainer = document.getElementById("tableContainer");
  const addTaskBtn = document.getElementById("addTaskBtn");
  const generateMonthBtn = document.getElementById("generateMonthBtn");

  let data = JSON.parse(localStorage.getItem("taskData")) || [];

  monthSelect.value = today.getMonth() + 1;
  yearInput.value = today.getFullYear();

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function save() {
    localStorage.setItem("taskData", JSON.stringify(data));
    render();
  }

  function getMonthData(year, month) {
    let monthData = data.find(d => d.year === year && d.month === month);
    if (!monthData) {
      monthData = { year, month, tasks: [] };
      data.push(monthData);
    }
    return monthData;
  }

  function addTask() {
    const input = document.getElementById("taskInput");
    if (!input.value.trim()) return;

    const year = Number(yearInput.value);
    const month = Number(monthSelect.value);
    const monthData = getMonthData(year, month);

    const checklist = {};
    const days = daysInMonth(year, month);
    for (let d = 1; d <= days; d++) {
      checklist[d] = "";
    }

    monthData.tasks.push({
      name: input.value,
      checklist
    });

    input.value = "";
    save();
  }

  function toggleCheck(taskIndex, day) {
    const year = Number(yearInput.value);
    const month = Number(monthSelect.value);
    const monthData = getMonthData(year, month);

    const cell = monthData.tasks[taskIndex].checklist[day];

    if (cell === "") monthData.tasks[taskIndex].checklist[day] = "✔";
    else if (cell === "✔") monthData.tasks[taskIndex].checklist[day] = "✖";
    else monthData.tasks[taskIndex].checklist[day] = "";

    save();
  }

  function generateMonth() {
    const year = Number(yearInput.value);
    const month = Number(monthSelect.value);
    const monthData = getMonthData(year, month);
    const days = daysInMonth(year, month);

    monthData.tasks.forEach(task => {
      for (let d = 1; d <= days; d++) {
        const dateObj = new Date(year, month - 1, d);
        if (dateObj > today) {
          task.checklist[d] = "";
        }
      }
    });

    save();
  }

  function updateProgress(monthData, days) {
    let total = 0;
    let done = 0;

    monthData.tasks.forEach(task => {
      for (let d = 1; d <= days; d++) {
        if (task.checklist[d] !== "") {
          total++;
          if (task.checklist[d] === "✔") done++;
        }
      }
    });

    const percent = total === 0 ? 0 : Math.round((done / total) * 100);

    document.getElementById("progressText").innerText =
      `Completed ${done} of ${total} checks — ${percent}%`;

    document.getElementById("progressBar").style.width = percent + "%";
  }

  function render() {
    const year = Number(yearInput.value);
    const month = Number(monthSelect.value);
    const monthData = getMonthData(year, month);
    const days = daysInMonth(year, month);

    let html = "<table><thead><tr>";
    html += "<th class='task-col'>Task</th>";

    for (let d = 1; d <= days; d++) {
      html += `<th>${month}/${d}</th>`;
    }

    html += "</tr></thead><tbody>";

    monthData.tasks.forEach((task, taskIndex) => {
      html += "<tr>";
      html += `<td class='task-col'>${task.name}</td>`;

      for (let d = 1; d <= days; d++) {
        const dateObj = new Date(year, month - 1, d);
        const isFuture = dateObj > today;
        const val = task.checklist[d];

        let className = "";
        if (val === "✔") className = "done";
        if (val === "✖") className = "missed";
        if (isFuture) className += " future";

        html += `<td class="${className}" onclick="${
          isFuture ? "" : `toggleCheck(${taskIndex}, ${d})`
        }">${val}</td>`;
      }

      html += "</tr>";
    });

    html += "</tbody></table>";
    tableContainer.innerHTML = html;

    updateProgress(monthData, days);
  }

  // Make toggleCheck global for table clicks
  window.toggleCheck = toggleCheck;

  // Button Events
  addTaskBtn.addEventListener("click", addTask);
  generateMonthBtn.addEventListener("click", generateMonth);
  monthSelect.addEventListener("change", render);
  yearInput.addEventListener("change", render);

  // Initial Render
  render();
});
