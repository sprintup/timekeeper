const STORAGE_KEY = "timekeeper.tasks.v1";
const BUCKETS = ["Admin", "Operations", "Projects"];
const DEFAULT_TIME_GOAL_MS = 8 * 60 * 60 * 1000;

const state = {
  tasks: [],
  rows: [],
  timeGoalMs: DEFAULT_TIME_GOAL_MS,
  timeGoalCleared: false,
  goalChimeKey: "",
};

const elements = {};
let activeDrag = null;
let activeTimeLogTaskId = null;
let previousGoalRemainingMs = null;
let chimeAudioContext = null;

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
  elements.todayTotalTime = document.getElementById("todayTotalTime");
  elements.timeGoalForm = document.getElementById("timeGoalForm");
  elements.timeGoalHoursInput = document.getElementById("timeGoalHoursInput");
  elements.timeGoalMinutesInput = document.getElementById("timeGoalMinutesInput");
  elements.clearTimeGoalButton = document.getElementById("clearTimeGoalButton");
  elements.timeGoalRemaining = document.getElementById("timeGoalRemaining");
  elements.bucketTotalElements = {
    Admin: document.getElementById("adminTotalTime"),
    Operations: document.getElementById("operationsTotalTime"),
    Projects: document.getElementById("projectsTotalTime"),
  };
  elements.generateReportButton = document.getElementById("generateReportButton");
  elements.resetStateButton = document.getElementById("resetStateButton");

  elements.taskDialog = document.getElementById("taskDialog");
  elements.taskForm = document.getElementById("taskForm");
  elements.taskDialogTitle = document.getElementById("taskDialogTitle");
  elements.taskIdInput = document.getElementById("taskIdInput");
  elements.taskPlacementInput = document.getElementById("taskPlacementInput");
  elements.taskRowInput = document.getElementById("taskRowInput");
  elements.objectiveInput = document.getElementById("objectiveInput");
  elements.bucketInput = document.getElementById("bucketInput");
  elements.taskCategoryGuide = document.getElementById("taskCategoryGuide");

  elements.rowDialog = document.getElementById("rowDialog");
  elements.rowForm = document.getElementById("rowForm");
  elements.rowDialogTitle = document.getElementById("rowDialogTitle");
  elements.rowIndexInput = document.getElementById("rowIndexInput");
  elements.rowNameInput = document.getElementById("rowNameInput");

  elements.logDialog = document.getElementById("logDialog");
  elements.logForm = document.getElementById("logForm");
  elements.logDialogTitle = document.getElementById("logDialogTitle");
  elements.logTaskIdInput = document.getElementById("logTaskIdInput");
  elements.logIdInput = document.getElementById("logIdInput");
  elements.logStartInput = document.getElementById("logStartInput");
  elements.logEndInput = document.getElementById("logEndInput");
  elements.manualMinutesInput = document.getElementById("manualMinutesInput");

  elements.timeLogDialog = document.getElementById("timeLogDialog");
  elements.timeLogDialogTitle = document.getElementById("timeLogDialogTitle");
  elements.timeLogList = document.getElementById("timeLogList");

  elements.reportDialog = document.getElementById("reportDialog");
  elements.reportForm = document.getElementById("reportForm");
  elements.reportPreview = document.getElementById("reportPreview");
  elements.deleteAfterReportInput = document.getElementById("deleteAfterReportInput");
}

function bindEvents() {
  elements.generateReportButton.addEventListener("click", openReportDialog);
  elements.resetStateButton.addEventListener("click", resetStateWithPrompt);
  elements.timeGoalForm.addEventListener("submit", saveTimeGoalFromForm);
  elements.clearTimeGoalButton.addEventListener("click", clearTimeGoal);
  elements.taskForm.addEventListener("submit", saveTaskFromDialog);
  elements.rowForm.addEventListener("submit", saveRowFromDialog);
  elements.logForm.addEventListener("submit", saveManualLogFromDialog);
  elements.reportForm.addEventListener("submit", downloadReportFromDialog);

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("pointermove", handleBoardPointerMove);
  document.addEventListener("pointerup", handleBoardPointerUp);
  document.addEventListener("pointercancel", cancelActiveDrag);
  document.addEventListener("pointerdown", primeChimeAudioForSavedGoal, { once: true });
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

  if (action === "close-row-dialog") {
    closeDialog(elements.rowDialog);
    return;
  }

  if (action === "close-log-dialog") {
    closeDialog(elements.logDialog);
    reopenActiveTimeLogDialog();
    return;
  }

  if (action === "close-time-log-dialog") {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    return;
  }

  if (action === "close-report-dialog") {
    closeDialog(elements.reportDialog);
    return;
  }

  if (action === "add-row") {
    openRowDialog("add");
    return;
  }

  if (action === "edit-row") {
    openRowDialog("edit", Number(actionElement.dataset.rowIndex));
    return;
  }

  if (action === "add-side-quest") {
    openTaskDialog("add", "side", null, Number(actionElement.dataset.rowIndex));
    return;
  }

  if (action === "add-log-from-manager") {
    if (activeTimeLogTaskId) {
      openLogDialog(activeTimeLogTaskId);
    }
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

  if (action === "show-log") {
    openTimeLogDialog(taskId);
  }

  if (action === "edit-log") {
    openLogDialog(taskId, actionElement.dataset.logId);
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
    state.rows = [];
    state.timeGoalMs = DEFAULT_TIME_GOAL_MS;
    state.timeGoalCleared = false;
    state.goalChimeKey = "";
    setTimeGoalInputs(state.timeGoalMs);
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    state.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(sanitizeTask).filter(Boolean) : [];
    state.rows = Array.isArray(parsed.rows) ? parsed.rows.map(sanitizeRow).filter(Boolean) : [];
    state.timeGoalCleared = parsed.timeGoalCleared === true;
    state.timeGoalMs = state.timeGoalCleared ? sanitizeTimeGoal(parsed.timeGoalMs) : sanitizeTimeGoal(parsed.timeGoalMs, DEFAULT_TIME_GOAL_MS);
    state.goalChimeKey = typeof parsed.goalChimeKey === "string" ? parsed.goalChimeKey : "";
    setTimeGoalInputs(state.timeGoalMs);
    normalizeBoard();
    enforceSingleRunningLog();
    saveState();
  } catch (error) {
    console.warn("Unable to load saved tasks.", error);
    state.tasks = [];
    state.rows = [];
    state.timeGoalMs = DEFAULT_TIME_GOAL_MS;
    state.timeGoalCleared = false;
    state.goalChimeKey = "";
    setTimeGoalInputs(state.timeGoalMs);
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    rows: state.rows,
    timeGoalMs: state.timeGoalMs,
    timeGoalCleared: state.timeGoalCleared,
    goalChimeKey: state.goalChimeKey,
  }));
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

function sanitizeRow(row, index) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    id: String(row.id || createId()),
    name: String(row.name || `Row ${index + 1}`).slice(0, 80),
  };
}

function clampInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function sanitizeTimeGoal(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  const sanitized = Math.max(0, Math.floor(number));
  return sanitized > 0 ? sanitized : fallback;
}

function render() {
  normalizeBoard();
  elements.board.innerHTML = "";

  const rows = getRows();
  rows.forEach((tasks, rowIndex) => {
    const row = document.createElement("section");
    row.className = "task-row";
    row.dataset.rowIndex = String(rowIndex);

    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `
      <span class="drag-handle row-drag-handle" aria-label="Drag row" role="img" title="Drag row">::::</span>
      <strong></strong>
      <span>${rowIndex === 0 ? "Highest" : "Lower"}</span>
      <button class="icon-button row-edit-button" data-action="edit-row" data-row-index="${rowIndex}" type="button">Rename</button>
    `;
    label.querySelector("strong").textContent = getRowName(rowIndex);
    label.querySelector(".row-drag-handle").addEventListener("pointerdown", handleRowPointerDown);

    const track = document.createElement("div");
    track.className = "task-track";
    track.dataset.rowIndex = String(rowIndex);

    const activeTasks = tasks.filter((task) => task.status !== "finished");
    const completedTasks = tasks.filter((task) => task.status === "finished");

    activeTasks.forEach((task) => {
      track.appendChild(createTaskCard(task));
    });
    track.appendChild(createSideQuestButton(rowIndex));
    completedTasks.forEach((task) => {
      track.appendChild(createTaskCard(task));
    });

    row.append(label, track);
    elements.board.appendChild(row);
  });

  elements.board.appendChild(createAddTaskFooter(rows.length === 0));
  tick();
}

function getRows() {
  ensureRowsForTasks();
  const rows = Array.from({ length: state.rows.length }, () => []);

  state.tasks.forEach((task) => {
    if (!rows[task.row]) {
      rows[task.row] = [];
    }
    rows[task.row].push(task);
  });

  rows.forEach((row) => row.sort((a, b) => a.order - b.order));
  return rows;
}

function getRowName(rowIndex) {
  return state.rows[rowIndex]?.name || `Row ${rowIndex + 1}`;
}

function createSideQuestButton(rowIndex) {
  const button = document.createElement("button");
  button.className = "side-quest-tile";
  button.dataset.action = "add-side-quest";
  button.dataset.rowIndex = String(rowIndex);
  button.type = "button";
  button.textContent = "Add Task Box";
  return button;
}

function createAddTaskFooter(isEmptyBoard = false) {
  const footer = document.createElement("div");
  footer.className = "add-task-footer";
  footer.classList.toggle("is-empty-board", isEmptyBoard);

  const button = document.createElement("button");
  button.className = "add-task-tile";
  button.dataset.action = "add-row";
  button.type = "button";
  button.textContent = "Add Row";

  footer.appendChild(button);
  return footer;
}

function createTaskCard(task) {
  const fragment = elements.taskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const dragHandle = fragment.querySelector(".task-drag-handle");
  const bucket = fragment.querySelector(".bucket-select");
  const objective = fragment.querySelector(".task-objective");
  const started = fragment.querySelector(".started-time");
  const elapsed = fragment.querySelector(".elapsed-time");
  const finished = fragment.querySelector(".finished-time");
  const toggleButton = fragment.querySelector('[data-action="toggle-timer"]');
  const timeLogButton = fragment.querySelector('[data-action="show-log"]');

  card.dataset.taskId = task.id;
  card.classList.toggle("is-running", isTaskRunning(task));
  card.classList.toggle("is-finished", task.status === "finished");
  card.classList.toggle("is-unstarted", !getFirstStartedAt(task));
  dragHandle.addEventListener("pointerdown", handleTaskPointerDown);

  bucket.value = task.bucket;
  bucket.dataset.bucket = task.bucket;
  objective.textContent = task.objective;
  started.textContent = getFirstStartedAt(task) ? formatTime(getFirstStartedAt(task)) : "Not started";
  elapsed.dataset.elapsedTaskId = task.id;
  elapsed.textContent = formatDuration(getTaskElapsed(task));
  finished.textContent = task.finishedAt ? formatTime(task.finishedAt) : "";
  toggleButton.textContent = isTaskRunning(task) ? "Pause" : "Start";
  timeLogButton.textContent = `Show time log (${task.logs.length})`;

  return fragment;
}

function renderTimeLogModal() {
  const task = findTask(activeTimeLogTaskId);
  if (!task) {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    return;
  }

  elements.timeLogDialogTitle.textContent = task.objective;
  elements.timeLogList.innerHTML = "";

  if (task.logs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No time logged.";
    elements.timeLogList.appendChild(empty);
    return;
  }

  task.logs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.dataset.taskId = task.id;

    const details = document.createElement("span");
    details.textContent = formatLogLabel(log);

    const actions = document.createElement("div");
    actions.className = "log-actions";

    const editButton = document.createElement("button");
    editButton.className = "button button-small";
    editButton.dataset.action = "edit-log";
    editButton.dataset.logId = log.id;
    editButton.type = "button";
    editButton.textContent = "Edit";

    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-small button-danger";
    deleteButton.dataset.action = "delete-log";
    deleteButton.dataset.logId = log.id;
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";

    actions.append(editButton, deleteButton);
    item.append(details, actions);
    elements.timeLogList.appendChild(item);
  });
}

function handleTaskPointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  const card = event.currentTarget.closest(".task-card");
  if (!card) {
    return;
  }

  event.preventDefault();
  activeDrag = {
    type: "task",
    card,
    handle: event.currentTarget,
    pointerId: event.pointerId,
  };
  card.classList.add("is-dragging");
  document.body.classList.add("is-board-dragging");
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function handleRowPointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  const row = event.currentTarget.closest(".task-row");
  if (!row) {
    return;
  }

  event.preventDefault();
  activeDrag = {
    type: "row",
    fromIndex: Number(row.dataset.rowIndex),
    targetIndex: Number(row.dataset.rowIndex),
    handle: event.currentTarget,
    pointerId: event.pointerId,
  };
  row.classList.add("is-row-dragging", "is-row-drop-target");
  document.body.classList.add("is-board-dragging");
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function handleBoardPointerMove(event) {
  if (!activeDrag) {
    return;
  }

  event.preventDefault();

  if (activeDrag.type === "task") {
    moveDraggedTask(event.clientX, event.clientY);
    return;
  }

  moveDraggedRowTarget(event.clientX, event.clientY);
}

function handleBoardPointerUp() {
  if (!activeDrag) {
    return;
  }

  if (activeDrag.type === "task") {
    syncOrderFromDom();
    cancelActiveDrag();
    render();
    return;
  }

  if (Number.isFinite(activeDrag.targetIndex)) {
    moveRow(activeDrag.fromIndex, activeDrag.targetIndex);
  }
  cancelActiveDrag();
  render();
}

function cancelActiveDrag() {
  if (activeDrag?.handle && activeDrag.pointerId !== undefined) {
    try {
      activeDrag.handle.releasePointerCapture?.(activeDrag.pointerId);
    } catch (error) {
      // Pointer capture can already be released when the pointer leaves the window.
    }
  }

  document.body.classList.remove("is-board-dragging");
  document.querySelectorAll(".is-dragging, .is-row-dragging, .is-row-drop-target").forEach((element) => {
    element.classList.remove("is-dragging", "is-row-dragging", "is-row-drop-target");
  });
  activeDrag = null;
}

function moveDraggedTask(x, y) {
  const track = getTrackFromPoint(x, y);
  if (!track || !activeDrag?.card) {
    return;
  }

  const afterElement = getDragAfterElement(track, x);
  if (afterElement) {
    track.insertBefore(activeDrag.card, afterElement);
    return;
  }

  const sideQuestButton = track.querySelector(".side-quest-tile");
  if (sideQuestButton) {
    track.insertBefore(activeDrag.card, sideQuestButton);
  } else {
    track.appendChild(activeDrag.card);
  }
}

function moveDraggedRowTarget(x, y) {
  const row = getRowFromPoint(x, y);
  if (!row) {
    return;
  }

  document.querySelectorAll(".is-row-drop-target").forEach((candidate) => {
    candidate.classList.remove("is-row-drop-target");
  });
  row.classList.add("is-row-drop-target");
  activeDrag.targetIndex = Number(row.dataset.rowIndex);
}

function getTrackFromPoint(x, y) {
  return document.elementsFromPoint(x, y)
    .map((element) => element.closest?.(".task-track"))
    .find(Boolean);
}

function getRowFromPoint(x, y) {
  return document.elementsFromPoint(x, y)
    .map((element) => element.closest?.(".task-row"))
    .find(Boolean);
}

function moveRow(fromIndex, toIndex) {
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || fromIndex === toIndex) {
    return;
  }

  const rows = getRows();
  const [movedRow] = rows.splice(fromIndex, 1);
  const [movedRowMeta] = state.rows.splice(fromIndex, 1);
  if (!movedRow) {
    return;
  }

  rows.splice(toIndex, 0, movedRow);
  state.rows.splice(toIndex, 0, movedRowMeta || createRow(`Row ${toIndex + 1}`));
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

function openRowDialog(mode, rowIndex = "") {
  const row = Number.isFinite(rowIndex) ? state.rows[rowIndex] : null;
  elements.rowDialogTitle.textContent = mode === "edit" ? "Rename row" : "Add row";
  elements.rowIndexInput.value = Number.isFinite(rowIndex) ? String(rowIndex) : "";
  elements.rowNameInput.value = row?.name || "";
  openDialog(elements.rowDialog);
  elements.rowNameInput.focus();
}

function saveRowFromDialog(event) {
  event.preventDefault();

  const name = elements.rowNameInput.value.trim();
  const rowIndex = elements.rowIndexInput.value === "" ? null : Number(elements.rowIndexInput.value);
  if (!name) {
    return;
  }

  if (Number.isFinite(rowIndex) && state.rows[rowIndex]) {
    state.rows[rowIndex].name = name;
  } else {
    state.rows.push(createRow(name));
  }

  saveState();
  closeDialog(elements.rowDialog);
  render();
}

function createRow(name) {
  return {
    id: createId(),
    name: String(name || "New Row").slice(0, 80),
  };
}

function openTaskDialog(mode, placement, task = null, rowIndex = "") {
  elements.taskDialogTitle.textContent = mode === "edit" ? "Edit task box" : placement === "side" ? "Add side quest" : "Add task box";
  elements.taskIdInput.value = task?.id || "";
  elements.taskPlacementInput.value = placement;
  elements.taskRowInput.value = task ? String(task.row) : rowIndex === "" ? "" : String(rowIndex);
  elements.objectiveInput.value = task?.objective || "";
  elements.bucketInput.value = task?.bucket || (placement === "side" ? "Operations" : "Projects");
  elements.taskCategoryGuide.hidden = placement !== "side";
  elements.taskCategoryGuide.open = placement === "side";
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

  ensureRowIndex(row);
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

function openTimeLogDialog(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  activeTimeLogTaskId = taskId;
  renderTimeLogModal();
  openDialog(elements.timeLogDialog);
}

function reopenActiveTimeLogDialog() {
  if (!activeTimeLogTaskId) {
    return;
  }

  renderTimeLogModal();
  openDialog(elements.timeLogDialog);
}

function openLogDialog(taskId, logId = "") {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  const log = logId ? task.logs.find((candidate) => candidate.id === logId) : null;
  closeDialog(elements.timeLogDialog);
  elements.logDialogTitle.textContent = log ? "Edit time log" : "Add time";
  elements.logTaskIdInput.value = taskId;
  elements.logIdInput.value = log?.id || "";
  elements.logStartInput.value = log?.start ? toDateTimeLocalValue(log.start) : "";
  elements.logEndInput.value = log?.end ? toDateTimeLocalValue(log.end) : "";
  elements.manualMinutesInput.value = log && !isLogRunning(log) ? minutesFromMs(getLogDuration(log)).toFixed(2) : "";
  openDialog(elements.logDialog);
  if (log?.start) {
    elements.logStartInput.focus();
  } else {
    elements.manualMinutesInput.focus();
  }
}

function saveManualLogFromDialog(event) {
  event.preventDefault();

  const task = findTask(elements.logTaskIdInput.value);
  if (!task) {
    return;
  }

  const logId = elements.logIdInput.value;
  const minutes = Number(elements.manualMinutesInput.value);
  const draft = buildLogDraft({
    existingLog: logId ? task.logs.find((log) => log.id === logId) : null,
    startValue: elements.logStartInput.value,
    endValue: elements.logEndInput.value,
    minutes,
  });

  if (!draft) {
    return;
  }

  if (logId) {
    const logIndex = task.logs.findIndex((log) => log.id === logId);
    if (logIndex >= 0) {
      task.logs[logIndex] = { ...task.logs[logIndex], ...draft };
    }
  } else {
    task.logs.push({
      id: createId(),
      ...draft,
    });
  }

  enforceSingleRunningLog();
  saveState();
  closeDialog(elements.logDialog);
  reopenActiveTimeLogDialog();
  render();
}

function buildLogDraft({ existingLog, startValue, endValue, minutes }) {
  const now = new Date();
  const durationMs = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60 * 1000) : 0;

  if (!startValue) {
    if (durationMs <= 0) {
      window.alert("Enter an amount of time, or add a start time.");
      return null;
    }

    return {
      start: null,
      end: null,
      durationMs,
      manual: true,
      createdAt: existingLog?.createdAt || now.toISOString(),
    };
  }

  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) {
    window.alert("Enter a valid start time.");
    return null;
  }

  let end = null;
  if (endValue) {
    end = new Date(endValue);
    if (Number.isNaN(end.getTime()) || end < start) {
      window.alert("Enter a stop time after the start time.");
      return null;
    }
  } else if (durationMs > 0) {
    end = new Date(start.getTime() + durationMs);
  }

  return {
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    durationMs: end ? Math.max(0, end.getTime() - start.getTime()) : 0,
    manual: false,
    createdAt: existingLog?.createdAt || start.toISOString(),
  };
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
  normalizeBoard();
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
  if (activeTimeLogTaskId === taskId) {
    renderTimeLogModal();
  }
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
  if (activeTimeLogTaskId) {
    renderTimeLogModal();
  }
  render();
}

function getTimeLogCount() {
  return state.tasks.reduce((total, task) => total + task.logs.length, 0);
}

function saveTimeGoalFromForm(event) {
  event.preventDefault();

  const hours = Number(elements.timeGoalHoursInput.value);
  const minutes = Number(elements.timeGoalMinutesInput.value);
  const safeHours = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.min(59, Math.max(0, Math.floor(minutes))) : 0;
  const goalMs = ((safeHours * 60) + safeMinutes) * 60 * 1000;

  if (goalMs <= 0) {
    clearTimeGoal();
    return;
  }

  const totalMs = getTodayTotalMs();
  state.timeGoalMs = goalMs;
  state.timeGoalCleared = false;
  state.goalChimeKey = "";
  previousGoalRemainingMs = Math.max(0, state.timeGoalMs - totalMs);
  setTimeGoalInputs(state.timeGoalMs);
  primeChimeAudio();
  saveState();
  updateTodayTotals();
}

function clearTimeGoal() {
  state.timeGoalMs = 0;
  state.timeGoalCleared = true;
  state.goalChimeKey = "";
  previousGoalRemainingMs = null;
  elements.timeGoalHoursInput.value = "";
  elements.timeGoalMinutesInput.value = "";
  saveState();
  updateTodayTotals();
}

function resetStateWithPrompt() {
  const confirmed = window.confirm("Reset Timekeeper? This clears all saved task boxes and time logs from this browser.");
  if (!confirmed) {
    return;
  }

  state.tasks = [];
  state.rows = [];
  state.timeGoalMs = DEFAULT_TIME_GOAL_MS;
  state.timeGoalCleared = false;
  state.goalChimeKey = "";
  previousGoalRemainingMs = null;
  setTimeGoalInputs(state.timeGoalMs);
  activeTimeLogTaskId = null;
  window.localStorage.removeItem(STORAGE_KEY);
  closeDialog(elements.timeLogDialog);
  closeDialog(elements.logDialog);
  closeDialog(elements.reportDialog);
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
  elements.deleteAfterReportInput.checked = true;
  openDialog(elements.reportDialog);
}

function renderReportPreview() {
  const report = buildReport();
  elements.reportPreview.innerHTML = "";

  const heading = document.createElement("h3");
  heading.textContent = report.rangeLabel;

  const summaryHeading = document.createElement("h4");
  summaryHeading.textContent = "Summary";

  const totals = document.createElement("dl");
  BUCKETS.forEach((bucket) => {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = bucket;
    detail.textContent = formatDuration(report.totals[bucket]);
    totals.append(term, detail);
  });

  const timelineHeading = document.createElement("h4");
  timelineHeading.textContent = "Timeline";
  const timelineList = document.createElement("ul");
  if (report.timeline.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No time logged.";
    timelineList.appendChild(item);
  } else {
    report.timeline.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = formatTimelineEntry(entry);
      timelineList.appendChild(item);
    });
  }

  const objectiveHeading = document.createElement("h4");
  objectiveHeading.textContent = "Objectives";
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

  elements.reportPreview.append(heading, summaryHeading, totals, timelineHeading, timelineList, objectiveHeading, objectiveList);
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
  const timeline = [];

  getSortedTasks().forEach((task) => {
    const logEntries = task.logs
      .map((log) => createReportLogEntry(log, task, reportStart, reportEnd))
      .filter(Boolean);
    const durationMs = logEntries.reduce((total, log) => total + log.durationMs, 0);

    totals[task.bucket] += durationMs;
    timeline.push(...logEntries);
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
    timeline: timeline.sort((a, b) => a.sortTime - b.sortTime),
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

  lines.push("", "Timeline");

  if (report.timeline.length === 0) {
    lines.push("No time logged.");
  } else {
    report.timeline.forEach((entry) => {
      lines.push(formatTimelineEntry(entry));
    });
  }

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
  ensureRowsForTasks();
  const rows = getRows();
  rows.forEach((row, rowIndex) => {
    const sortedRow = [...row].sort((a, b) => {
      const statusComparison = Number(a.status === "finished") - Number(b.status === "finished");
      return statusComparison || a.order - b.order;
    });

    sortedRow.forEach((task, orderIndex) => {
      task.row = rowIndex;
      task.order = orderIndex;
    });
  });
}

function ensureRowsForTasks() {
  const maxTaskRow = state.tasks.reduce((max, task) => Math.max(max, task.row), -1);
  for (let rowIndex = state.rows.length; rowIndex <= maxTaskRow; rowIndex += 1) {
    state.rows.push(createRow(`Row ${rowIndex + 1}`));
  }
}

function ensureRowIndex(rowIndex) {
  for (let index = state.rows.length; index <= rowIndex; index += 1) {
    state.rows.push(createRow(`Row ${index + 1}`));
  }
}

function getSortedTasks() {
  return [...state.tasks].sort((a, b) => a.row - b.row || a.order - b.order);
}

function getBottomRowIndex() {
  return Math.max(state.rows.length - 1, state.tasks.reduce((max, task) => Math.max(max, task.row), -1));
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

function isLogRunning(log) {
  return Boolean(log && !log.manual && log.start && !log.end);
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

function createReportLogEntry(log, task, reportStart, reportEnd) {
  const durationMs = getLogDurationWithinRange(log, reportStart, reportEnd);
  if (durationMs <= 0) {
    return null;
  }

  const logWindow = getReportLogWindow(log, reportStart, reportEnd);
  return {
    durationMs,
    objective: task.objective,
    bucket: task.bucket,
    start: logWindow.start,
    end: logWindow.end,
    sortTime: logWindow.sortTime,
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
    const createdAt = log.createdAt ? formatTime(log.createdAt) : "Manual entry";
    return `Manual entry at ${createdAt} (${duration})`;
  }

  const start = new Date(Math.max(new Date(log.start).getTime(), reportStart.getTime()));
  const sourceEnd = log.end ? new Date(log.end) : new Date();
  const end = new Date(Math.min(sourceEnd.getTime(), reportEnd.getTime()));
  return `${formatTime(start)} - ${log.end ? formatTime(end) : "Running"} (${duration})`;
}

function getReportLogWindow(log, reportStart, reportEnd) {
  if (log.manual) {
    const createdAt = new Date(log.createdAt || Date.now());
    const sortTime = Math.min(Math.max(createdAt.getTime(), reportStart.getTime()), reportEnd.getTime());
    return {
      start: null,
      end: null,
      sortTime,
    };
  }

  const start = new Date(Math.max(new Date(log.start).getTime(), reportStart.getTime()));
  const sourceEnd = log.end ? new Date(log.end) : new Date();
  const end = new Date(Math.min(sourceEnd.getTime(), reportEnd.getTime()));
  return {
    start,
    end: log.end ? end : null,
    sortTime: start.getTime(),
  };
}

function formatTimelineEntry(entry) {
  const timeRange = entry.start
    ? `${formatTime(entry.start)} - ${entry.end ? formatTime(entry.end) : "Running"}`
    : entry.label.replace(/\s+\(.+\)$/, "");
  return `${timeRange} | ${entry.bucket} | ${entry.objective} (${formatDuration(entry.durationMs)})`;
}

function tick() {
  updateDate();
  updateTodayTotals();
  document.querySelectorAll("[data-elapsed-task-id]").forEach((element) => {
    const task = findTask(element.dataset.elapsedTaskId);
    if (task) {
      element.textContent = formatDuration(getTaskElapsed(task));
    }
  });

  if (elements.reportDialog.open) {
    renderReportPreview();
  }

  if (elements.timeLogDialog.open) {
    renderTimeLogModal();
  }
}

function updateTodayTotals() {
  const report = buildReport();
  const totalMs = BUCKETS.reduce((total, bucket) => total + report.totals[bucket], 0);
  elements.todayTotalTime.textContent = formatDuration(totalMs);
  BUCKETS.forEach((bucket) => {
    elements.bucketTotalElements[bucket].textContent = formatDuration(report.totals[bucket]);
  });
  updateTimeGoal(totalMs);
}

function getTodayTotalMs() {
  const report = buildReport();
  return BUCKETS.reduce((total, bucket) => total + report.totals[bucket], 0);
}

function updateTimeGoal(totalMs) {
  if (state.timeGoalMs <= 0) {
    elements.timeGoalRemaining.textContent = "No goal set";
    elements.timeGoalRemaining.classList.remove("is-complete");
    previousGoalRemainingMs = null;
    return;
  }

  const remainingMs = Math.max(0, state.timeGoalMs - totalMs);
  const goalKey = `${formatFileDate(new Date())}:${state.timeGoalMs}`;
  elements.timeGoalRemaining.textContent = formatDuration(remainingMs);
  elements.timeGoalRemaining.classList.toggle("is-complete", remainingMs === 0);

  if (remainingMs > 0 && state.goalChimeKey === goalKey) {
    state.goalChimeKey = "";
    saveState();
  }

  if (
    remainingMs === 0
    && previousGoalRemainingMs !== null
    && previousGoalRemainingMs > 0
    && state.goalChimeKey !== goalKey
  ) {
    state.goalChimeKey = goalKey;
    saveState();
    playGoalChime();
  }

  previousGoalRemainingMs = remainingMs;
}

function updateDate() {
  if (elements.todayDate) {
    const now = new Date();
    elements.todayDate.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(now);
    elements.todayDate.dateTime = formatFileDate(now);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function setTimeGoalInputs(ms) {
  if (ms <= 0) {
    elements.timeGoalHoursInput.value = "";
    elements.timeGoalMinutesInput.value = "";
    return;
  }

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  elements.timeGoalHoursInput.value = String(hours);
  elements.timeGoalMinutesInput.value = String(minutes);
}

function minutesFromMs(ms) {
  return Math.max(0, ms) / 60000;
}

function primeChimeAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  if (!chimeAudioContext) {
    chimeAudioContext = new AudioContext();
  }

  chimeAudioContext.resume?.();
}

function primeChimeAudioForSavedGoal() {
  if (state.timeGoalMs > 0) {
    primeChimeAudio();
  }
}

function playGoalChime() {
  primeChimeAudio();
  if (!chimeAudioContext) {
    return;
  }

  const startTime = chimeAudioContext.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = chimeAudioContext.createOscillator();
    const gain = chimeAudioContext.createGain();
    const noteStart = startTime + index * 0.16;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.42);
    oscillator.connect(gain).connect(chimeAudioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.44);
  });
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function toDateTimeLocalValue(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
  if (dialog.open) {
    return;
  }

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    if (dialog.open) {
      dialog.close();
    }
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
