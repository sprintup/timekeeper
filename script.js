const STORAGE_KEY = "timekeeper.tasks.v1";
const BUCKETS = ["Admin", "Operations", "Projects"];

const state = {
  tasks: [],
};

const elements = {};
let draggedTaskId = null;
let draggedRowIndex = null;

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  loadState();
  bindEvents();
  render();
  updateDate();
  window.setInterval(tick, 1000);
});

function cacheElements() {
  elements.board = document.getElementById("board");
  elements.todayDate = document.getElementById("todayDate");
  elements.taskTemplate = document.getElementById("taskCardTemplate");
  elements.deleteTimeLogsButton = document.getElementById("deleteTimeLogsButton");
  elements.generateReportButton = document.getElementById("generateReportButton");
  elements.resetStateButton = document.getElementById("resetStateButton");
  elements.githubPageLink = document.getElementById("githubPageLink");

  elements.taskDialog = document.getElementById("taskDialog");
  elements.taskForm = document.getElementById("taskForm");
  elements.taskDialogTitle = document.getElementById("taskDialogTitle");
  elements.taskIdInput = document.getElementById("taskIdInput");
  elements.taskPlacementInput = document.getElementById("taskPlacementInput");
  elements.taskRowInput = document.getElementById("taskRowInput");
  elements.objectiveInput = document.getElementById("objectiveInput");
  elements.bucketInput = document.getElementById("bucketInput");

  elements.logDialog = document.getElementById("logDialog");
  elements.logForm = document.getElementById("logForm");
  elements.logTaskIdInput = document.getElementById("logTaskIdInput");
  elements.manualMinutesInput = document.getElementById("manualMinutesInput");

  elements.reportDialog = document.getElementById("reportDialog");
  elements.reportForm = document.getElementById("reportForm");
  elements.reportPreview = document.getElementById("reportPreview");
  elements.deleteAfterReportInput = document.getElementById("deleteAfterReportInput");
}

function bindEvents() {
  elements.deleteTimeLogsButton.addEventListener("click", deleteTimeLogsWithPrompt);
  elements.generateReportButton.addEventListener("click", openReportDialog);
  elements.resetStateButton.addEventListener("click", resetStateWithPrompt);
  elements.taskForm.addEventListener("submit", saveTaskFromDialog);
  elements.logForm.addEventListener("submit", saveManualLogFromDialog);
  elements.reportForm.addEventListener("submit", downloadReportFromDialog);

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
}

function handleDocumentClick(event) {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) {
    return;
  }

  const action = actionElement.dataset.action;
  const taskCard = actionElement.closest("[data-task-id]");
  const taskId = taskCard?.dataset.taskId;

  if (action === "close-task-dialog") {
    closeDialog(elements.taskDialog);
    return;
  }

  if (action === "close-log-dialog") {
    closeDialog(elements.logDialog);
    return;
  }

  if (action === "close-report-dialog") {
    closeDialog(elements.reportDialog);
    return;
  }

  if (action === "add-task-row") {
    openTaskDialog("add", "lower");
    return;
  }

  if (action === "add-side-quest") {
    openTaskDialog("add", "side", null, Number(actionElement.dataset.rowIndex));
    return;
  }

  if (!taskId) {
    return;
  }

  if (action === "toggle-timer") {
    toggleTimer(taskId);
  }

  if (action === "finish-task") {
    finishTask(taskId);
  }

  if (action === "restart-task") {
    restartTask(taskId);
  }

  if (action === "delete-task") {
    deleteTask(taskId);
  }

  if (action === "edit-task") {
    const task = findTask(taskId);
    if (task) {
      openTaskDialog("edit", "", task);
    }
  }

  if (action === "add-log") {
    openLogDialog(taskId);
  }

  if (action === "delete-log") {
    deleteLog(taskId, actionElement.dataset.logId);
  }
}

function handleDocumentChange(event) {
  if (!event.target.matches(".bucket-select")) {
    return;
  }

  const taskId = event.target.closest("[data-task-id]")?.dataset.taskId;
  const task = findTask(taskId);
  if (!task || !BUCKETS.includes(event.target.value)) {
    return;
  }

  task.bucket = event.target.value;
  event.target.dataset.bucket = task.bucket;
  saveState();
}

function loadState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    state.tasks = [];
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(sanitizeTask).filter(Boolean) : [];
    normalizeBoard();
    enforceSingleRunningLog();
    saveState();
  } catch (error) {
    console.warn("Unable to load saved tasks.", error);
    state.tasks = [];
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks }));
}

function sanitizeTask(task) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const status = task.status === "finished" ? "finished" : "active";
  const bucket = BUCKETS.includes(task.bucket) ? task.bucket : "Admin";
  const logs = Array.isArray(task.logs) ? task.logs.map(sanitizeLog).filter(Boolean) : [];

  return {
    id: String(task.id || createId()),
    objective: String(task.objective || "Untitled task").slice(0, 180),
    bucket,
    status,
    row: clampInteger(task.row, 0),
    order: clampInteger(task.order, 0),
    createdAt: task.createdAt || new Date().toISOString(),
    finishedAt: task.finishedAt || null,
    logs,
  };
}

function sanitizeLog(log) {
  if (!log || typeof log !== "object") {
    return null;
  }

  const durationMs = Number(log.durationMs);
  return {
    id: String(log.id || createId()),
    start: log.start || null,
    end: log.end || null,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
    manual: Boolean(log.manual),
    createdAt: log.createdAt || log.start || new Date().toISOString(),
  };
}

function clampInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function render() {
  normalizeBoard();
  elements.board.innerHTML = "";

  const rows = getRows();
  rows.forEach((tasks, rowIndex) => {
    const row = document.createElement("section");
    row.className = "task-row";
    row.dataset.rowIndex = String(rowIndex);
    row.addEventListener("dragover", handleRowDragOver);
    row.addEventListener("dragleave", handleRowDragLeave);
    row.addEventListener("drop", handleRowDrop);

    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `
      <span class="drag-handle row-drag-handle" draggable="true" aria-label="Drag row" role="img">::::</span>
      <strong>Row ${rowIndex + 1}</strong>
      <span>${rowIndex === 0 ? "Highest" : "Lower"}</span>
    `;
    label.querySelector(".row-drag-handle").addEventListener("dragstart", handleRowDragStart);
    label.querySelector(".row-drag-handle").addEventListener("dragend", handleRowDragEnd);

    const track = document.createElement("div");
    track.className = "task-track";
    track.dataset.rowIndex = String(rowIndex);
    track.addEventListener("dragover", handleDragOver);
    track.addEventListener("drop", handleDrop);

    tasks.forEach((task) => {
      track.appendChild(createTaskCard(task));
    });
    track.appendChild(createSideQuestButton(rowIndex));

    row.append(label, track);
    elements.board.appendChild(row);
  });

  elements.board.appendChild(createAddTaskFooter(rows.length === 0));
  tick();
}

function getRows() {
  const maxRow = state.tasks.reduce((max, task) => Math.max(max, task.row), -1);
  const rows = Array.from({ length: maxRow + 1 }, () => []);

  state.tasks.forEach((task) => {
    if (!rows[task.row]) {
      rows[task.row] = [];
    }
    rows[task.row].push(task);
  });

  rows.forEach((row) => row.sort((a, b) => a.order - b.order));
  return rows;
}

function createSideQuestButton(rowIndex) {
  const button = document.createElement("button");
  button.className = "side-quest-tile";
  button.dataset.action = "add-side-quest";
  button.dataset.rowIndex = String(rowIndex);
  button.type = "button";
  button.textContent = "Add Side Quest";
  return button;
}

function createAddTaskFooter(isEmptyBoard = false) {
  const footer = document.createElement("div");
  footer.className = "add-task-footer";
  footer.classList.toggle("is-empty-board", isEmptyBoard);

  const button = document.createElement("button");
  button.className = "add-task-tile";
  button.dataset.action = "add-task-row";
  button.type = "button";
  button.textContent = "Add Task Box";

  footer.appendChild(button);
  return footer;
}

function createTaskCard(task) {
  const fragment = elements.taskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const bucket = fragment.querySelector(".bucket-select");
  const objective = fragment.querySelector(".task-objective");
  const started = fragment.querySelector(".started-time");
  const elapsed = fragment.querySelector(".elapsed-time");
  const finished = fragment.querySelector(".finished-time");
  const toggleButton = fragment.querySelector('[data-action="toggle-timer"]');
  const logList = fragment.querySelector(".log-list");

  card.dataset.taskId = task.id;
  card.classList.toggle("is-running", isTaskRunning(task));
  card.classList.toggle("is-finished", task.status === "finished");
  card.classList.toggle("is-unstarted", !getFirstStartedAt(task));
  card.addEventListener("dragstart", handleDragStart);
  card.addEventListener("dragend", handleDragEnd);

  bucket.value = task.bucket;
  bucket.dataset.bucket = task.bucket;
  objective.textContent = task.objective;
  started.textContent = getFirstStartedAt(task) ? formatTime(getFirstStartedAt(task)) : "Not started";
  elapsed.dataset.elapsedTaskId = task.id;
  elapsed.textContent = formatDuration(getTaskElapsed(task));
  finished.textContent = task.finishedAt ? formatTime(task.finishedAt) : "";
  toggleButton.textContent = isTaskRunning(task) ? "Pause" : "Start";

  renderLogList(logList, task);
  return fragment;
}

function renderLogList(logList, task) {
  logList.innerHTML = "";

  if (task.logs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No time logged.";
    logList.appendChild(empty);
    return;
  }

  task.logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "log-item";

    const details = document.createElement("span");
    details.textContent = formatLogLabel(log);

    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-small button-danger";
    deleteButton.dataset.action = "delete-log";
    deleteButton.dataset.logId = log.id;
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";

    item.append(details, deleteButton);
    logList.appendChild(item);
  });
}

function handleDragStart(event) {
  event.stopPropagation();
  draggedTaskId = event.currentTarget.dataset.taskId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedTaskId);
  window.setTimeout(() => event.currentTarget.classList.add("is-dragging"), 0);
}

function handleDragOver(event) {
  const track = event.currentTarget;
  const draggingCard = document.querySelector(".task-card.is-dragging");
  if (!draggingCard) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const afterElement = getDragAfterElement(track, event.clientX);
  if (afterElement) {
    track.insertBefore(draggingCard, afterElement);
  } else {
    const sideQuestButton = track.querySelector(".side-quest-tile");
    if (sideQuestButton) {
      track.insertBefore(draggingCard, sideQuestButton);
    } else {
      track.appendChild(draggingCard);
    }
  }
}

function handleDrop(event) {
  if (!draggedTaskId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  syncOrderFromDom();
  draggedTaskId = null;
  render();
}

function handleDragEnd() {
  syncOrderFromDom();
  draggedTaskId = null;
  render();
}

function handleRowDragStart(event) {
  draggedRowIndex = Number(event.currentTarget.closest(".task-row").dataset.rowIndex);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedRowIndex));
  event.currentTarget.closest(".task-row").classList.add("is-row-dragging");
}

function handleRowDragOver(event) {
  if (draggedRowIndex === null) {
    return;
  }

  event.preventDefault();
  event.currentTarget.classList.add("is-row-drop-target");
}

function handleRowDragLeave(event) {
  event.currentTarget.classList.remove("is-row-drop-target");
}

function handleRowDrop(event) {
  if (draggedRowIndex === null) {
    return;
  }

  event.preventDefault();
  const targetRowIndex = Number(event.currentTarget.dataset.rowIndex);
  moveRow(draggedRowIndex, targetRowIndex);
  draggedRowIndex = null;
  render();
}

function handleRowDragEnd() {
  document.querySelectorAll(".is-row-dragging, .is-row-drop-target").forEach((row) => {
    row.classList.remove("is-row-dragging", "is-row-drop-target");
  });
  draggedRowIndex = null;
}

function moveRow(fromIndex, toIndex) {
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex === toIndex) {
    return;
  }

  const rows = getRows();
  const [movedRow] = rows.splice(fromIndex, 1);
  if (!movedRow) {
    return;
  }

  rows.splice(toIndex, 0, movedRow);
  rows.forEach((row, rowIndex) => {
    row.forEach((task, orderIndex) => {
      task.row = rowIndex;
      task.order = orderIndex;
    });
  });
  saveState();
}

function getDragAfterElement(track, x) {
  const cards = [...track.querySelectorAll(".task-card:not(.is-dragging)")];
  return cards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

function syncOrderFromDom() {
  const tracks = [...document.querySelectorAll(".task-track")];
  tracks.forEach((track, rowIndex) => {
    [...track.querySelectorAll(".task-card")].forEach((card, orderIndex) => {
      const task = findTask(card.dataset.taskId);
      if (task) {
        task.row = rowIndex;
        task.order = orderIndex;
      }
    });
  });

  normalizeBoard();
  saveState();
}

function openTaskDialog(mode, placement, task = null, rowIndex = "") {
  elements.taskDialogTitle.textContent = mode === "edit" ? "Edit task box" : placement === "side" ? "Add side quest" : "Add task box";
  elements.taskIdInput.value = task?.id || "";
  elements.taskPlacementInput.value = placement;
  elements.taskRowInput.value = task ? String(task.row) : rowIndex === "" ? "" : String(rowIndex);
  elements.objectiveInput.value = task?.objective || "";
  elements.bucketInput.value = task?.bucket || (placement === "side" ? "Operations" : "Projects");
  openDialog(elements.taskDialog);
  elements.objectiveInput.focus();
}

function saveTaskFromDialog(event) {
  event.preventDefault();

  const id = elements.taskIdInput.value;
  const placement = elements.taskPlacementInput.value;
  const rowIndex = elements.taskRowInput.value === "" ? null : Number(elements.taskRowInput.value);
  const objective = elements.objectiveInput.value.trim();
  const bucket = elements.bucketInput.value;

  if (!objective || !BUCKETS.includes(bucket)) {
    return;
  }

  if (id) {
    const task = findTask(id);
    if (task) {
      task.objective = objective;
      task.bucket = bucket;
    }
  } else {
    state.tasks.push(createTask({ objective, bucket, placement, rowIndex }));
  }

  normalizeBoard();
  saveState();
  closeDialog(elements.taskDialog);
  render();
}

function createTask({ objective, bucket, placement, rowIndex }) {
  const row = placement === "side" ? (Number.isFinite(rowIndex) ? rowIndex : 0) : getBottomRowIndex() + 1;
  const order = placement === "side" ? 0 : getNextOrder(row);

  if (placement === "side") {
    makeRoomAtLeft(row);
  }

  return {
    id: createId(),
    objective,
    bucket,
    status: "active",
    row,
    order,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    logs: [],
  };
}

function openLogDialog(taskId) {
  elements.logTaskIdInput.value = taskId;
  elements.manualMinutesInput.value = "";
  openDialog(elements.logDialog);
  elements.manualMinutesInput.focus();
}

function saveManualLogFromDialog(event) {
  event.preventDefault();

  const task = findTask(elements.logTaskIdInput.value);
  const minutes = Number(elements.manualMinutesInput.value);
  if (!task || !Number.isFinite(minutes) || minutes <= 0) {
    return;
  }

  task.logs.push({
    id: createId(),
    start: null,
    end: null,
    durationMs: Math.round(minutes * 60 * 1000),
    manual: true,
    createdAt: new Date().toISOString(),
  });

  saveState();
  closeDialog(elements.logDialog);
  render();
}

function toggleTimer(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === "finished") {
    return;
  }

  if (isTaskRunning(task)) {
    pauseTask(task, new Date());
  } else {
    startTask(task);
  }

  saveState();
  render();
}

function startTask(task) {
  const now = new Date();
  state.tasks.forEach((candidate) => {
    if (candidate.id !== task.id && isTaskRunning(candidate)) {
      pauseTask(candidate, now);
    }
  });

  promoteTaskIfNeeded(task);
  promoteTaskUrgency(task);
  task.status = "active";
  task.finishedAt = null;
  task.logs.push({
    id: createId(),
    start: now.toISOString(),
    end: null,
    durationMs: 0,
    manual: false,
    createdAt: now.toISOString(),
  });
}

function pauseTask(task, now = new Date()) {
  const log = getRunningLog(task);
  if (!log) {
    return;
  }

  log.end = now.toISOString();
  log.durationMs = Math.max(0, now.getTime() - new Date(log.start).getTime());
}

function enforceSingleRunningLog() {
  const runningLogs = state.tasks
    .flatMap((task) => task.logs.filter((log) => !log.manual && log.start && !log.end).map((log) => ({ task, log })))
    .sort((a, b) => new Date(a.log.start).getTime() - new Date(b.log.start).getTime());

  const current = runningLogs.pop();
  if (!current) {
    return;
  }

  const now = new Date();
  runningLogs.forEach(({ log }) => {
    log.end = now.toISOString();
    log.durationMs = Math.max(0, now.getTime() - new Date(log.start).getTime());
  });
}

function finishTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  const now = new Date();
  pauseTask(task, now);
  task.status = "finished";
  task.finishedAt = now.toISOString();
  saveState();
  render();
}

function restartTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  task.status = "active";
  task.finishedAt = null;
  saveState();
  render();
}

function deleteTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  const confirmed = window.confirm(`Delete "${task.objective}"?`);
  if (!confirmed) {
    return;
  }

  state.tasks = state.tasks.filter((candidate) => candidate.id !== taskId);
  normalizeBoard();
  saveState();
  render();
}

function deleteLog(taskId, logId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  task.logs = task.logs.filter((log) => log.id !== logId);
  saveState();
  render();
}

function deleteTimeLogsWithPrompt() {
  const logCount = getTimeLogCount();
  if (logCount === 0) {
    return;
  }

  const confirmed = window.confirm(`Delete ${logCount} time log${logCount === 1 ? "" : "s"}? Task boxes will stay.`);
  if (!confirmed) {
    return;
  }

  deleteTimeLogs();
}

function deleteTimeLogs() {
  state.tasks.forEach((task) => {
    task.logs = [];
  });
  saveState();
  render();
}

function getTimeLogCount() {
  return state.tasks.reduce((total, task) => total + task.logs.length, 0);
}

function resetStateWithPrompt() {
  const confirmed = window.confirm("Reset Timekeeper? This clears all saved task boxes and time logs from this browser.");
  if (!confirmed) {
    return;
  }

  state.tasks = [];
  window.localStorage.removeItem(STORAGE_KEY);
  render();
}

function promoteTaskIfNeeded(task) {
  if (task.row === 0) {
    return;
  }

  const originalRow = task.row;
  state.tasks.forEach((candidate) => {
    if (candidate.id === task.id) {
      return;
    }

    if (candidate.row < originalRow) {
      candidate.row += 1;
    }
  });

  task.row = 0;
  task.order = getNextOrder(0);
  normalizeBoard();
}

function promoteTaskUrgency(task) {
  if (task.order === 0) {
    return;
  }

  makeRoomAtLeft(task.row, task.id);
  task.order = 0;
  normalizeBoard();
}

function makeRoomAtLeft(row, taskIdToSkip = "") {
  state.tasks.forEach((candidate) => {
    if (candidate.row === row && candidate.id !== taskIdToSkip) {
      candidate.order += 1;
    }
  });
}

function openReportDialog() {
  renderReportPreview();
  elements.deleteAfterReportInput.checked = false;
  openDialog(elements.reportDialog);
}

function renderReportPreview() {
  const report = buildReport();
  elements.reportPreview.innerHTML = "";

  const heading = document.createElement("h3");
  heading.textContent = report.rangeLabel;

  const totals = document.createElement("dl");
  BUCKETS.forEach((bucket) => {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = bucket;
    detail.textContent = formatDuration(report.totals[bucket]);
    totals.append(term, detail);
  });

  const objectiveList = document.createElement("ul");
  if (report.objectives.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No time logged.";
    objectiveList.appendChild(item);
  } else {
    report.objectives.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = `${entry.objective} (${entry.bucket}) - ${formatDuration(entry.durationMs)}`;
      objectiveList.appendChild(item);
    });
  }

  elements.reportPreview.append(heading, totals, objectiveList);
}

function downloadReportFromDialog(event) {
  event.preventDefault();

  const reportText = buildReportText();
  const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `timekeeper-report-${formatFileDate(new Date())}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  closeDialog(elements.reportDialog);

  if (elements.deleteAfterReportInput.checked) {
    deleteTimeLogs();
  }
}

function buildReport() {
  const reportStart = startOfToday();
  const reportEnd = new Date();
  const totals = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));
  const objectives = [];

  getSortedTasks().forEach((task) => {
    const logEntries = task.logs
      .map((log) => createReportLogEntry(log, reportStart, reportEnd))
      .filter(Boolean);
    const durationMs = logEntries.reduce((total, log) => total + log.durationMs, 0);

    totals[task.bucket] += durationMs;
    if (durationMs > 0) {
      objectives.push({
        objective: task.objective,
        bucket: task.bucket,
        durationMs,
        logs: logEntries,
      });
    }
  });

  return {
    rangeLabel: `${formatDateTime(reportStart)} - ${formatDateTime(reportEnd)}`,
    totals,
    objectives,
  };
}

function buildReportText() {
  const report = buildReport();
  const lines = [
    "Timekeeper Report",
    `Date range: ${report.rangeLabel}`,
    "",
    "Summary",
  ];

  BUCKETS.forEach((bucket) => {
    lines.push(`${bucket} - ${formatDuration(report.totals[bucket])}`);
  });

  lines.push("", "Objectives");

  if (report.objectives.length === 0) {
    lines.push("No time logged.");
  } else {
    report.objectives.forEach((entry) => {
      lines.push(`${entry.objective} (${entry.bucket}) - ${formatDuration(entry.durationMs)}`);
      entry.logs.forEach((log) => {
        lines.push(`  ${log.label}`);
      });
    });
  }

  return `${lines.join("\n")}\n`;
}

function normalizeBoard() {
  const rows = getRows().filter((row) => row.length > 0);
  rows.forEach((row, rowIndex) => {
    row.forEach((task, orderIndex) => {
      task.row = rowIndex;
      task.order = orderIndex;
    });
  });
}

function getSortedTasks() {
  return [...state.tasks].sort((a, b) => a.row - b.row || a.order - b.order);
}

function getBottomRowIndex() {
  return state.tasks.reduce((max, task) => Math.max(max, task.row), -1);
}

function getNextOrder(row) {
  return state.tasks
    .filter((task) => task.row === row)
    .reduce((max, task) => Math.max(max, task.order), -1) + 1;
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getRunningLog(task) {
  return task.logs.find((log) => !log.manual && log.start && !log.end);
}

function isTaskRunning(task) {
  return Boolean(getRunningLog(task));
}

function getFirstStartedAt(task) {
  const first = task.logs.find((log) => !log.manual && log.start);
  return first?.start || null;
}

function getTaskElapsed(task) {
  const now = new Date();
  return task.logs.reduce((total, log) => total + getLogDuration(log, now), 0);
}

function getLogDuration(log, now = new Date()) {
  if (log.manual) {
    return log.durationMs;
  }

  if (!log.start) {
    return 0;
  }

  if (log.end) {
    return log.durationMs || Math.max(0, new Date(log.end).getTime() - new Date(log.start).getTime());
  }

  return Math.max(0, now.getTime() - new Date(log.start).getTime());
}

function formatLogLabel(log) {
  const duration = formatDuration(getLogDuration(log));
  if (log.manual) {
    return `Manual entry - ${duration}`;
  }

  const start = log.start ? formatTime(log.start) : "No start";
  const end = log.end ? formatTime(log.end) : "Running";
  return `${start} - ${end} (${duration})`;
}

function createReportLogEntry(log, reportStart, reportEnd) {
  const durationMs = getLogDurationWithinRange(log, reportStart, reportEnd);
  if (durationMs <= 0) {
    return null;
  }

  return {
    durationMs,
    label: formatReportLogLabel(log, durationMs, reportStart, reportEnd),
  };
}

function getLogDurationWithinRange(log, reportStart, reportEnd) {
  if (log.manual) {
    const createdAt = new Date(log.createdAt || Date.now());
    return createdAt >= reportStart && createdAt <= reportEnd ? log.durationMs : 0;
  }

  if (!log.start) {
    return 0;
  }

  const logStart = new Date(log.start);
  const logEnd = log.end ? new Date(log.end) : new Date();
  const overlapStart = Math.max(logStart.getTime(), reportStart.getTime());
  const overlapEnd = Math.min(logEnd.getTime(), reportEnd.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

function formatReportLogLabel(log, durationMs, reportStart, reportEnd) {
  const duration = formatDuration(durationMs);
  if (log.manual) {
    return `Manual entry - ${duration}`;
  }

  const start = new Date(Math.max(new Date(log.start).getTime(), reportStart.getTime()));
  const sourceEnd = log.end ? new Date(log.end) : new Date();
  const end = new Date(Math.min(sourceEnd.getTime(), reportEnd.getTime()));
  return `${formatTime(start)} - ${log.end ? formatTime(end) : "Running"} (${duration})`;
}

function tick() {
  updateDate();
  document.querySelectorAll("[data-elapsed-task-id]").forEach((element) => {
    const task = findTask(element.dataset.elapsedTaskId);
    if (task) {
      element.textContent = formatDuration(getTaskElapsed(task));
    }
  });

  if (elements.reportDialog.open) {
    renderReportPreview();
  }
}

function updateDate() {
  const now = new Date();
  elements.todayDate.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  elements.todayDate.dateTime = formatFileDate(now);
  elements.githubPageLink.href = window.location.href.split("#")[0];
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatFileDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
