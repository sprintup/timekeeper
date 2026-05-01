const STORAGE_KEY = "timekeeper.tasks.v1";
const APP_TITLE = "Timekeeper";
const BUCKETS = ["Admin", "Operations", "Projects", "Personal"];
const DEFAULT_TIME_GOAL_MS = 8 * 60 * 60 * 1000;
const LOG_ADJUSTMENT_MS = 60 * 1000;
const DEFAULT_BACKUP_AUTOSAVE_MINUTES = 60;
const BACKUP_DB_NAME = "timekeeper.backup.v1";
const BACKUP_STORE_NAME = "file-handles";
const BACKUP_HANDLE_KEY = "backup-directory";
const BACKUP_META_KEY = "timekeeper.backup.meta.v1";
const BACKUP_SETTINGS_KEY = "timekeeper.backup.settings.v1";
const BACKUP_FILE_PREFIX = "bk-timekeeper";
const STANDUP_SETTINGS_KEY = "timekeeper.standup.settings.v1";

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
let activeFinishNoteTaskId = null;
let activeGoalNotesRowId = null;
let pendingFinishCancelSnapshot = null;
let pendingNoteConversion = null;
let previousGoalRemainingMs = null;
let chimeAudioContext = null;
let backupDirectoryHandle = null;
let backupAutoSaveTimer = null;
let backupSaveInProgress = false;
let backupAutoSaveMinutes = DEFAULT_BACKUP_AUTOSAVE_MINUTES;
let standupLastDate = "";
let standupHighlightedKeys = new Set();

document.addEventListener("DOMContentLoaded", () => {
  updateDocumentTitle();
  cacheElements();
  loadState();
  loadStandupSettings();
  migrateLegacyStandupHighlightKeys();
  bindEvents();
  initializeBackup();
  render();
  updateDate();
  updateScrollTopButton();
  window.setInterval(tick, 1000);
});

function updateDocumentTitle() {
  document.title = isProductionEnvironment() ? APP_TITLE : `${APP_TITLE} - Dev`;
}

function isProductionEnvironment() {
  const { hostname, protocol } = window.location;
  if (protocol === "file:" || !hostname) {
    return false;
  }

  const normalizedHost = hostname.toLowerCase();
  return !isLocalDevHost(normalizedHost);
}

function isLocalDevHost(hostname) {
  return hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname === "::1"
    || hostname.startsWith("127.")
    || hostname.endsWith(".local")
    || isPrivateIpv4Host(hostname);
}

function isPrivateIpv4Host(hostname) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function cacheElements() {
  elements.board = document.getElementById("board");
  elements.todayDate = document.getElementById("todayDate");
  elements.taskTemplate = document.getElementById("taskCardTemplate");
  elements.todayTotalTime = document.getElementById("todayTotalTime");
  elements.todayWorkTime = document.getElementById("todayWorkTime");
  elements.timeGoalForm = document.getElementById("timeGoalForm");
  elements.timeGoalHoursInput = document.getElementById("timeGoalHoursInput");
  elements.timeGoalMinutesInput = document.getElementById("timeGoalMinutesInput");
  elements.clearTimeGoalButton = document.getElementById("clearTimeGoalButton");
  elements.timeGoalRemaining = document.getElementById("timeGoalRemaining");
  elements.todayTotals = document.getElementById("todayTotals");
  elements.bucketTotalElements = {
    Admin: document.getElementById("adminTotalTime"),
    Operations: document.getElementById("operationsTotalTime"),
    Projects: document.getElementById("projectsTotalTime"),
    Personal: document.getElementById("personalTotalTime"),
  };
  elements.goalTotals = document.getElementById("goalTotals");
  elements.urgentIndicator = document.getElementById("urgentIndicator");
  elements.urgentIndicatorText = document.getElementById("urgentIndicatorText");
  elements.unfinishedTaskCountPill = document.getElementById("unfinishedTaskCountPill");
  elements.generateReportButton = document.getElementById("generateReportButton");
  elements.exportDataButton = document.getElementById("exportDataButton");
  elements.importDataButton = document.getElementById("importDataButton");
  elements.importDataInput = document.getElementById("importDataInput");
  elements.settingsButton = document.getElementById("settingsButton");
  elements.settingsDialog = document.getElementById("settingsDialog");
  elements.chooseBackupDirectoryButton = document.getElementById("chooseBackupDirectoryButton");
  elements.saveBackupNowButton = document.getElementById("saveBackupNowButton");
  elements.backupStatus = document.getElementById("backupStatus");
  elements.backupFileName = document.getElementById("backupFileName");
  elements.backupIntervalForm = document.getElementById("backupIntervalForm");
  elements.backupIntervalMinutesInput = document.getElementById("backupIntervalMinutesInput");
  elements.resetStateButton = document.getElementById("resetStateButton");
  elements.scrollTopButton = document.getElementById("scrollTopButton");
  elements.flaggedNotesButton = document.getElementById("flaggedNotesButton");
  elements.standupSummaryButton = document.getElementById("standupSummaryButton");

  elements.taskDialog = document.getElementById("taskDialog");
  elements.taskForm = document.getElementById("taskForm");
  elements.taskDialogTitle = document.getElementById("taskDialogTitle");
  elements.taskIdInput = document.getElementById("taskIdInput");
  elements.taskPlacementInput = document.getElementById("taskPlacementInput");
  elements.taskRowInput = document.getElementById("taskRowInput");
  elements.taskSendToField = document.getElementById("taskSendToField");
  elements.taskRowSelect = document.getElementById("taskRowSelect");
  elements.objectiveInput = document.getElementById("objectiveInput");
  elements.bucketInput = document.getElementById("bucketInput");
  elements.taskCategoryGuide = document.getElementById("taskCategoryGuide");
  elements.deleteTaskDialogButton = document.getElementById("deleteTaskDialogButton");
  elements.saveUrgentTaskDialogButton = document.getElementById("saveUrgentTaskDialogButton");

  elements.rowDialog = document.getElementById("rowDialog");
  elements.rowForm = document.getElementById("rowForm");
  elements.rowDialogTitle = document.getElementById("rowDialogTitle");
  elements.rowIndexInput = document.getElementById("rowIndexInput");
  elements.rowNameInput = document.getElementById("rowNameInput");
  elements.deleteRowDialogButton = document.getElementById("deleteRowDialogButton");

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

  elements.finishNoteDialog = document.getElementById("finishNoteDialog");
  elements.finishNoteDialogTitle = document.getElementById("finishNoteDialogTitle");
  elements.finishNoteList = document.getElementById("finishNoteList");
  elements.finishNoteForm = document.getElementById("finishNoteForm");
  elements.finishNoteTaskIdInput = document.getElementById("finishNoteTaskIdInput");
  elements.finishNoteIdInput = document.getElementById("finishNoteIdInput");
  elements.finishNoteInput = document.getElementById("finishNoteInput");
  elements.finishNoteSubmitButton = document.getElementById("finishNoteSubmitButton");
  elements.finishNoteCloseButton = document.getElementById("finishNoteCloseButton");
  elements.cancelFinishNoteButton = document.getElementById("cancelFinishNoteButton");

  elements.flaggedNotesDialog = document.getElementById("flaggedNotesDialog");
  elements.flaggedNotesList = document.getElementById("flaggedNotesList");
  elements.urgentTasksDialog = document.getElementById("urgentTasksDialog");
  elements.urgentTasksList = document.getElementById("urgentTasksList");
  elements.unfinishedTasksDialog = document.getElementById("unfinishedTasksDialog");
  elements.unfinishedTasksList = document.getElementById("unfinishedTasksList");
  elements.unfinishedTasksSearchInput = document.getElementById("unfinishedTasksSearchInput");
  elements.goalNotesDialog = document.getElementById("goalNotesDialog");
  elements.goalNotesDialogTitle = document.getElementById("goalNotesDialogTitle");
  elements.goalNotesList = document.getElementById("goalNotesList");

  elements.reportDialog = document.getElementById("reportDialog");
  elements.reportForm = document.getElementById("reportForm");
  elements.reportPreview = document.getElementById("reportPreview");
  elements.reportEmailInput = document.getElementById("reportEmailInput");
  elements.emailReportButton = document.getElementById("emailReportButton");
  elements.copyReportButton = document.getElementById("copyReportButton");
  elements.copyReportStatus = document.getElementById("copyReportStatus");
  elements.deleteAfterReportInput = document.getElementById("deleteAfterReportInput");
  elements.standupSummaryDialog = document.getElementById("standupSummaryDialog");
  elements.standupSummaryPreview = document.getElementById("standupSummaryPreview");
  elements.lastStandupDateInput = document.getElementById("lastStandupDateInput");
}

function bindEvents() {
  elements.generateReportButton.addEventListener("click", openReportDialog);
  elements.standupSummaryButton?.addEventListener("click", openStandupSummaryDialog);
  elements.exportDataButton.addEventListener("click", exportData);
  elements.importDataButton.addEventListener("click", () => elements.importDataInput.click());
  elements.importDataInput.addEventListener("change", importDataFromFile);
  elements.settingsButton?.addEventListener("click", openSettingsDialog);
  elements.chooseBackupDirectoryButton?.addEventListener("click", chooseBackupDirectory);
  elements.saveBackupNowButton?.addEventListener("click", () => saveBackupNow("manual"));
  elements.backupIntervalForm?.addEventListener("submit", saveBackupIntervalFromForm);
  elements.resetStateButton.addEventListener("click", resetStateWithPrompt);
  elements.timeGoalForm.addEventListener("submit", saveTimeGoalFromForm);
  elements.clearTimeGoalButton.addEventListener("click", clearTimeGoal);
  elements.taskForm.addEventListener("submit", saveTaskFromDialog);
  elements.taskDialog.addEventListener("close", clearPendingNoteConversion);
  elements.rowForm.addEventListener("submit", saveRowFromDialog);
  elements.logForm.addEventListener("submit", saveManualLogFromDialog);
  elements.logStartInput.addEventListener("input", syncLogFieldsFromStart);
  elements.logStartInput.addEventListener("change", syncLogFieldsFromStart);
  elements.logEndInput.addEventListener("input", syncLogFieldsFromEnd);
  elements.logEndInput.addEventListener("change", syncLogFieldsFromEnd);
  elements.manualMinutesInput.addEventListener("input", syncLogFieldsFromMinutes);
  elements.manualMinutesInput.addEventListener("change", syncLogFieldsFromMinutes);
  elements.finishNoteForm.addEventListener("submit", saveFinishNoteFromDialog);
  elements.reportForm.addEventListener("submit", downloadReportFromDialog);
  elements.emailReportButton.addEventListener("click", emailReportFromDialog);
  elements.copyReportButton.addEventListener("click", copyReportFromDialog);
  elements.lastStandupDateInput?.addEventListener("change", saveLastStandupDateFromInput);
  elements.flaggedNotesButton.addEventListener("click", openFlaggedNotesDialog);
  elements.urgentIndicator.addEventListener("click", openUrgentTasksDialog);
  elements.unfinishedTaskCountPill.addEventListener("click", openUnfinishedTasksDialog);
  elements.unfinishedTasksSearchInput.addEventListener("input", renderUnfinishedTasksModal);
  elements.scrollTopButton.addEventListener("click", scrollToTop);

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("pointermove", handleBoardPointerMove);
  document.addEventListener("pointerup", handleBoardPointerUp);
  document.addEventListener("pointercancel", cancelActiveDrag);
  document.addEventListener("pointerdown", primeChimeAudioForSavedGoal, { once: true });
  window.addEventListener("scroll", updateScrollTopButton, { passive: true });
  window.addEventListener("resize", updateScrollTopButton);
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

  if (action === "close-finish-note-dialog") {
    pendingFinishCancelSnapshot = null;
    activeFinishNoteTaskId = null;
    closeDialog(elements.finishNoteDialog);
    return;
  }

  if (action === "cancel-finish-note-dialog") {
    cancelPendingFinishFromNotes();
    return;
  }

  if (action === "close-flagged-notes-dialog") {
    closeDialog(elements.flaggedNotesDialog);
    return;
  }

  if (action === "close-urgent-tasks-dialog") {
    closeDialog(elements.urgentTasksDialog);
    return;
  }

  if (action === "close-unfinished-tasks-dialog") {
    closeDialog(elements.unfinishedTasksDialog);
    return;
  }

  if (action === "expand-unfinished-tasks") {
    setUnfinishedTaskGroupsOpen(true);
    return;
  }

  if (action === "collapse-unfinished-tasks") {
    setUnfinishedTaskGroupsOpen(false);
    return;
  }

  if (action === "close-goal-notes-dialog") {
    activeGoalNotesRowId = null;
    closeDialog(elements.goalNotesDialog);
    return;
  }

  if (action === "close-report-dialog") {
    closeDialog(elements.reportDialog);
    return;
  }

  if (action === "close-standup-summary-dialog") {
    closeDialog(elements.standupSummaryDialog);
    return;
  }

  if (action === "close-settings-dialog") {
    closeDialog(elements.settingsDialog);
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

  if (action === "show-goal-notes") {
    openGoalNotesDialog(Number(actionElement.dataset.rowIndex));
    return;
  }

  if (action === "move-row-up") {
    moveRowPriority(Number(actionElement.dataset.rowIndex), -1);
    return;
  }

  if (action === "move-row-down") {
    moveRowPriority(Number(actionElement.dataset.rowIndex), 1);
    return;
  }

  if (action === "delete-row-from-dialog") {
    const rowIndex = Number(elements.rowIndexInput.value);
    if (deleteRowWithPrompt(rowIndex)) {
      closeDialog(elements.rowDialog);
    }
    return;
  }

  if (action === "delete-task-from-dialog") {
    const taskIdToDelete = elements.taskIdInput.value;
    if (taskIdToDelete && deleteTask(taskIdToDelete)) {
      closeDialog(elements.taskDialog);
    }
    return;
  }

  if (action === "scroll-to-row") {
    scrollToRow(Number(actionElement.dataset.rowIndex));
    return;
  }

  if (action === "open-flagged-note") {
    openFlaggedNote(actionElement.dataset.taskId, actionElement.dataset.noteId);
    return;
  }

  if (action === "open-goal-note") {
    openGoalNote(actionElement.dataset.taskId, actionElement.dataset.noteId);
    return;
  }

  if (action === "open-urgent-task") {
    openUrgentTask(actionElement.dataset.taskId);
    return;
  }

  if (action === "open-unfinished-task") {
    openUnfinishedTask(actionElement.dataset.taskId);
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

  if (action === "show-active-notes") {
    showNotesFromTimeLog();
    return;
  }

  if (action === "show-active-time-log") {
    showTimeLogFromNotes();
    return;
  }

  if (action === "clear-finish-note-form") {
    resetFinishNoteForm();
    elements.finishNoteInput.focus();
    return;
  }

  if (!taskId) {
    return;
  }

  if (action === "toggle-timer") {
    closeDialog(elements.unfinishedTasksDialog);
    toggleTimer(taskId);
  }

  if (action === "toggle-urgent") {
    toggleUrgent(taskId);
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

  if (action === "show-notes") {
    openFinishNoteDialog(taskId);
  }

  if (action === "add-note") {
    openFinishNoteDialog(taskId);
  }

  if (action === "edit-log") {
    openLogDialog(taskId, actionElement.dataset.logId);
  }

  if (action === "adjust-log-time") {
    adjustLogTime(taskId, actionElement.dataset.logId, actionElement.dataset.edge, Number(actionElement.dataset.delta));
  }

  if (action === "delete-log") {
    deleteLog(taskId, actionElement.dataset.logId);
  }

  if (action === "edit-finish-note") {
    openFinishNoteDialog(taskId, actionElement.dataset.noteId);
  }

  if (action === "toggle-finish-note-flag") {
    toggleFinishNoteFlag(taskId, actionElement.dataset.noteId);
  }

  if (action === "toggle-finish-note-report") {
    toggleFinishNoteReport(taskId, actionElement.dataset.noteId);
  }

  if (action === "convert-finish-note-to-task") {
    convertFinishNoteToTask(taskId, actionElement.dataset.noteId);
  }

  if (action === "delete-finish-note") {
    deleteFinishNote(taskId, actionElement.dataset.noteId);
  }
}

function handleDocumentChange(event) {
  if (!event.target.matches(".bucket-select")) {
    return;
  }

  const taskCard = event.target.closest("[data-task-id]");
  const taskId = taskCard?.dataset.taskId;
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getStateSnapshot()));
}

function getStateSnapshot() {
  return {
    tasks: state.tasks,
    rows: state.rows,
    timeGoalMs: state.timeGoalMs,
    timeGoalCleared: state.timeGoalCleared,
    goalChimeKey: state.goalChimeKey,
  };
}

function createExportPayload(exportedAt = new Date()) {
  return {
    app: "timekeeper",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    data: getStateSnapshot(),
  };
}

function exportData() {
  saveState();
  const payload = createExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `timekeeper-data-${formatFileDate(new Date())}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openSettingsDialog() {
  updateBackupSettingsView();
  openDialog(elements.settingsDialog);
}

function initializeBackup() {
  if (!elements.chooseBackupDirectoryButton || !elements.saveBackupNowButton) {
    return;
  }

  backupAutoSaveMinutes = getStoredBackupAutoSaveMinutes();
  updateBackupSettingsView();
  updateBackupControls();
  if (!isBackupDirectoryAccessSupported()) {
    setBackupStatus("Folder backups need Chrome or Edge on HTTPS or localhost.");
    return;
  }

  restoreBackupDirectoryHandle();
  startBackupAutoSaveTimer();
}

function isBackupDirectoryAccessSupported() {
  return typeof window.showDirectoryPicker === "function" && "indexedDB" in window;
}

async function restoreBackupDirectoryHandle() {
  try {
    backupDirectoryHandle = await getStoredBackupDirectoryHandle();
  } catch (error) {
    setBackupStatus("Backup folder permission could not be restored.");
  }

  updateBackupControls();
  if (!backupDirectoryHandle) {
    setBackupStatus("Choose a backup folder to enable auto-save.");
    return;
  }

  const hasPermission = await verifyBackupPermission(backupDirectoryHandle, false);
  if (hasPermission) {
    setBackupStatus(formatBackupReadyStatus(await getLatestBackupMetadata()));
  } else {
    setBackupStatus("Backup folder needs permission. Use Save backup now.");
  }
}

async function chooseBackupDirectory() {
  if (!isBackupDirectoryAccessSupported()) {
    setBackupStatus("Folder backups need Chrome or Edge on HTTPS or localhost.");
    return;
  }

  try {
    backupDirectoryHandle = await window.showDirectoryPicker({
      mode: "readwrite",
    });
    await storeBackupDirectoryHandle(backupDirectoryHandle);
    updateBackupControls();
    await saveBackupNow("manual");
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }

    backupDirectoryHandle = null;
    updateBackupControls();
    setBackupStatus("Backup folder was not set.");
  }
}

function startBackupAutoSaveTimer() {
  if (backupAutoSaveTimer) {
    window.clearInterval(backupAutoSaveTimer);
  }

  backupAutoSaveTimer = window.setInterval(() => {
    saveBackupNow("auto");
  }, getBackupAutoSaveMs());
}

async function saveBackupNow(source = "manual") {
  if (!backupDirectoryHandle) {
    if (source === "manual") {
      setBackupStatus("Choose a backup folder first.");
    }
    updateBackupControls();
    return;
  }

  if (backupSaveInProgress) {
    if (source === "manual") {
      setBackupStatus("Backup already in progress.");
    }
    return;
  }

  backupSaveInProgress = true;
  updateBackupControls();

  try {
    const hasPermission = await verifyBackupPermission(backupDirectoryHandle, source === "manual");
    if (!hasPermission) {
      setBackupStatus("Backup permission needed. Use Backup folder to choose it again.");
      return;
    }

    saveState();
    const backupDate = new Date();
    const backupFileName = getBackupFileName(backupDate);
    const payload = createExportPayload();
    const fileHandle = await backupDirectoryHandle.getFileHandle(backupFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    storeBackupMetadata(backupDate, backupFileName, source);
    setBackupStatus(formatBackupSavedStatus(backupDate));
  } catch (error) {
    setBackupStatus("Backup save failed.");
  } finally {
    backupSaveInProgress = false;
    updateBackupControls();
  }
}

async function verifyBackupPermission(fileHandle, shouldRequest) {
  if (!fileHandle) {
    return false;
  }

  const options = { mode: "readwrite" };
  if (typeof fileHandle.queryPermission === "function") {
    const currentPermission = await fileHandle.queryPermission(options);
    if (currentPermission === "granted") {
      return true;
    }
  }

  if (shouldRequest && typeof fileHandle.requestPermission === "function") {
    return await fileHandle.requestPermission(options) === "granted";
  }

  return false;
}

function updateBackupControls() {
  const supported = isBackupDirectoryAccessSupported();
  if (elements.chooseBackupDirectoryButton) {
    elements.chooseBackupDirectoryButton.disabled = !supported;
  }

  if (elements.saveBackupNowButton) {
    elements.saveBackupNowButton.disabled = !supported || !backupDirectoryHandle || backupSaveInProgress;
  }
}

function setBackupStatus(message) {
  if (!elements.backupStatus) {
    return;
  }

  elements.backupStatus.textContent = message;
  elements.backupStatus.hidden = !message;
}

async function saveBackupIntervalFromForm(event) {
  event.preventDefault();

  const minutes = sanitizeBackupAutoSaveMinutes(elements.backupIntervalMinutesInput.value);
  backupAutoSaveMinutes = minutes;
  storeBackupAutoSaveMinutes(minutes);
  updateBackupSettingsView();
  startBackupAutoSaveTimer();
  setBackupStatus(formatBackupReadyStatus(await getLatestBackupMetadata()));
}

function updateBackupSettingsView() {
  if (elements.backupIntervalMinutesInput) {
    elements.backupIntervalMinutesInput.value = String(backupAutoSaveMinutes);
  }

  if (elements.backupFileName) {
    elements.backupFileName.textContent = getBackupFileName();
  }
}

function getStoredBackupAutoSaveMinutes() {
  const stored = window.localStorage.getItem(BACKUP_SETTINGS_KEY);
  if (!stored) {
    return DEFAULT_BACKUP_AUTOSAVE_MINUTES;
  }

  try {
    const parsed = JSON.parse(stored);
    return sanitizeBackupAutoSaveMinutes(parsed.autoSaveMinutes);
  } catch (error) {
    return DEFAULT_BACKUP_AUTOSAVE_MINUTES;
  }
}

function storeBackupAutoSaveMinutes(minutes) {
  window.localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify({
    autoSaveMinutes: minutes,
  }));
}

function sanitizeBackupAutoSaveMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 1
    ? Math.floor(minutes)
    : DEFAULT_BACKUP_AUTOSAVE_MINUTES;
}

function getBackupAutoSaveMs() {
  return backupAutoSaveMinutes * 60 * 1000;
}

function formatBackupInterval(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds} seconds`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

async function getLatestBackupMetadata() {
  const storedMetadata = getStoredBackupMetadata();
  const folderMetadata = await getLatestBackupFileMetadata();
  return getNewerBackupMetadata(storedMetadata, folderMetadata);
}

async function getLatestBackupFileMetadata() {
  if (!backupDirectoryHandle || typeof backupDirectoryHandle.values !== "function") {
    return null;
  }

  let latestMetadata = null;
  const backupFilePattern = new RegExp(`^${BACKUP_FILE_PREFIX}-\\d{4}-\\d{2}-\\d{2}\\.json$`);
  for await (const handle of backupDirectoryHandle.values()) {
    if (handle.kind !== "file" || !backupFilePattern.test(handle.name)) {
      continue;
    }

    try {
      const file = await handle.getFile();
      const metadata = {
        savedAt: new Date(file.lastModified).toISOString(),
        fileName: handle.name,
        source: "folder",
      };
      latestMetadata = getNewerBackupMetadata(latestMetadata, metadata);
    } catch (error) {
      // Ignore unreadable files and keep looking for the newest readable backup.
    }
  }

  return latestMetadata;
}

function storeBackupMetadata(savedAt, fileName, source) {
  window.localStorage.setItem(BACKUP_META_KEY, JSON.stringify({
    savedAt: savedAt.toISOString(),
    fileName,
    source,
  }));
}

function getStoredBackupMetadata() {
  const stored = window.localStorage.getItem(BACKUP_META_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    const savedAt = new Date(parsed.savedAt);
    if (Number.isNaN(savedAt.getTime()) || typeof parsed.fileName !== "string") {
      return null;
    }

    return {
      savedAt: savedAt.toISOString(),
      fileName: parsed.fileName,
      source: typeof parsed.source === "string" ? parsed.source : "",
    };
  } catch (error) {
    return null;
  }
}

function getNewerBackupMetadata(first, second) {
  if (!first) {
    return second || null;
  }

  if (!second) {
    return first;
  }

  return new Date(first.savedAt).getTime() >= new Date(second.savedAt).getTime() ? first : second;
}

function formatBackupReadyStatus(metadata) {
  if (!metadata) {
    return `No backup saved yet. Auto-save every ${formatBackupInterval(getBackupAutoSaveMs())}.`;
  }

  return `Last backup: ${formatDateTime(metadata.savedAt)}`;
}

function formatBackupSavedStatus(savedAt) {
  return `Last backup: ${formatDateTime(savedAt)}`;
}

function getBackupFileName(date = new Date()) {
  return `${BACKUP_FILE_PREFIX}-${formatFileDate(date)}.json`;
}

function openBackupDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(BACKUP_DB_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        database.createObjectStore(BACKUP_STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function storeBackupDirectoryHandle(directoryHandle) {
  const database = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE_NAME, "readwrite");
    transaction.objectStore(BACKUP_STORE_NAME).put(directoryHandle, BACKUP_HANDLE_KEY);
    transaction.addEventListener("complete", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("error", () => {
      database.close();
      reject(transaction.error);
    });
  });
}

async function getStoredBackupDirectoryHandle() {
  const database = await openBackupDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BACKUP_STORE_NAME, "readonly");
    const request = transaction.objectStore(BACKUP_STORE_NAME).get(BACKUP_HANDLE_KEY);
    request.addEventListener("success", () => resolve(request.result || null));
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => database.close());
    transaction.addEventListener("error", () => {
      database.close();
      reject(transaction.error);
    });
  });
}

function importDataFromFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    importDataFromText(String(reader.result || ""));
  });
  reader.addEventListener("error", () => {
    window.alert("Unable to read that import file.");
  });
  reader.readAsText(file);
}

function importDataFromText(text) {
  let parsed = null;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    window.alert("That file is not valid JSON.");
    return;
  }

  const importedState = getImportState(parsed);
  if (!importedState) {
    window.alert("That JSON file does not look like Timekeeper export data.");
    return;
  }

  const confirmed = window.confirm("Import this Timekeeper data? This will replace the tasks, activities, logs, and time target saved in this browser.");
  if (!confirmed) {
    return;
  }

  applyImportedState(importedState);
  window.alert("Timekeeper data imported.");
}

function getImportState(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload.data && typeof payload.data === "object" ? payload.data : payload;
  return isImportableState(candidate) ? candidate : null;
}

function isImportableState(candidate) {
  return Boolean(candidate)
    && typeof candidate === "object"
    && Array.isArray(candidate.tasks)
    && Array.isArray(candidate.rows);
}

function applyImportedState(importedState) {
  state.tasks = importedState.tasks.map(sanitizeTask).filter(Boolean);
  state.rows = importedState.rows.map(sanitizeRow).filter(Boolean);
  state.timeGoalCleared = importedState.timeGoalCleared === true;
  state.timeGoalMs = state.timeGoalCleared
    ? sanitizeTimeGoal(importedState.timeGoalMs)
    : sanitizeTimeGoal(importedState.timeGoalMs, DEFAULT_TIME_GOAL_MS);
  state.goalChimeKey = typeof importedState.goalChimeKey === "string" ? importedState.goalChimeKey : "";
  previousGoalRemainingMs = null;
  activeTimeLogTaskId = null;
  activeFinishNoteTaskId = null;
  activeGoalNotesRowId = null;

  setTimeGoalInputs(state.timeGoalMs);
  normalizeBoard();
  enforceSingleRunningLog();
  saveState();
  closeDialog(elements.taskDialog);
  closeDialog(elements.rowDialog);
  closeDialog(elements.timeLogDialog);
  closeDialog(elements.logDialog);
  closeDialog(elements.finishNoteDialog);
  closeDialog(elements.flaggedNotesDialog);
  closeDialog(elements.urgentTasksDialog);
  closeDialog(elements.unfinishedTasksDialog);
  closeDialog(elements.goalNotesDialog);
  closeDialog(elements.reportDialog);
  closeDialog(elements.standupSummaryDialog);
  closeDialog(elements.settingsDialog);
  render();
}

function sanitizeTask(task) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const status = task.status === "finished" ? "finished" : "active";
  const bucket = sanitizeBucket(task.bucket);
  const logs = Array.isArray(task.logs) ? task.logs.map(sanitizeLog).filter(Boolean) : [];
  const finishNotes = sanitizeFinishNotes(task.finishNotes, task.finishNote, task.finishedAt);
  const wasUrgent = task.wasUrgent === true || task.urgent === true;

  return {
    id: String(task.id || createId()),
    objective: String(task.objective || "Untitled task").slice(0, 180),
    bucket,
    status,
    row: clampInteger(task.row, 0),
    order: clampInteger(task.order, 0),
    createdAt: task.createdAt || new Date().toISOString(),
    finishedAt: task.finishedAt || null,
    urgent: status === "finished" ? false : task.urgent === true,
    wasUrgent,
    finishNotes,
    logs,
  };
}

function sanitizeFinishNote(note) {
  return typeof note === "string" ? note.trim().slice(0, 1000) : "";
}

function sanitizeFinishNotes(notes, legacyNote = "", finishedAt = "") {
  const sanitized = Array.isArray(notes) ? notes.map(sanitizeFinishNoteEntry).filter(Boolean) : [];
  const legacyText = sanitizeFinishNote(legacyNote);

  if (sanitized.length === 0 && legacyText) {
    sanitized.push({
      id: createId(),
      text: legacyText,
      createdAt: finishedAt || new Date().toISOString(),
    });
  }

  return sanitized;
}

function sanitizeFinishNoteEntry(note) {
  if (!note || typeof note !== "object") {
    return null;
  }

  const text = sanitizeFinishNote(note.text);
  if (!text) {
    return null;
  }

  return {
    id: String(note.id || createId()),
    text,
    flagged: note.flagged === true,
    reported: note.reported === true,
    createdAt: note.createdAt || new Date().toISOString(),
  };
}

function sanitizeBucket(bucket) {
  if (bucket === "Non-work" || bucket === "Break") {
    return "Personal";
  }

  return BUCKETS.includes(bucket) ? bucket : "Admin";
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

  const name = String(row.name || `Activity ${index + 1}`);
  const defaultRowMatch = name.match(/^(?:Row|Goal) (\d+)$/);

  return {
    id: String(row.id || createId()),
    name: (defaultRowMatch ? `Activity ${defaultRowMatch[1]}` : name).slice(0, 80),
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
    const goalNoteCount = getGoalNoteCount(tasks);
    const goalHasFlaggedNotes = tasks.some(taskHasFlaggedNotes);
    const unfinishedTaskCount = tasks.filter((task) => task.status !== "finished").length;
    const focusTaskCount = tasks.filter(isTaskHighlightedInStandup).length;
    const urgentTaskCount = tasks.filter((task) => task.urgent).length;
    const row = document.createElement("section");
    row.className = "task-row";
    row.dataset.rowIndex = String(rowIndex);

    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `
      <span class="row-priority-label">Priority ${rowIndex + 1}</span>
      <strong></strong>
      <div class="row-subtotal">
        <span>Subtotal</span>
        <strong data-row-subtotal-index="${rowIndex}"></strong>
      </div>
      <div class="row-task-counts" aria-label="Activity task counts">
        <span>${formatTaskCount(urgentTaskCount, "urgent")}</span>
        <span>${formatTaskCount(focusTaskCount, "focus")}</span>
        <span>${formatTaskCount(unfinishedTaskCount, "unfinished")}</span>
      </div>
      <div class="row-label-actions">
        <button class="icon-button row-add-task-button" data-action="add-side-quest" data-row-index="${rowIndex}" type="button">Add task</button>
        <button class="icon-button row-notes-button${goalHasFlaggedNotes ? " has-flagged-note" : ""}" data-action="show-goal-notes" data-row-index="${rowIndex}" aria-label="${goalHasFlaggedNotes ? `Notes (${goalNoteCount}), includes flagged note` : `Notes (${goalNoteCount})`}" type="button">
          <span>Notes (${goalNoteCount})</span>
          ${goalHasFlaggedNotes ? '<span class="urgent-flag note-flag-indicator" aria-hidden="true"></span>' : ""}
        </button>
      </div>
      <div class="row-priority-controls" aria-label="Activity priority controls">
        <button class="icon-button row-priority-button" data-action="move-row-up" data-row-index="${rowIndex}" aria-label="Increase activity priority" title="Increase priority" type="button"${rowIndex === 0 ? " disabled" : ""}>&uarr;</button>
        <button class="icon-button row-priority-button" data-action="move-row-down" data-row-index="${rowIndex}" aria-label="Decrease activity priority" title="Decrease priority" type="button"${rowIndex === rows.length - 1 ? " disabled" : ""}>&darr;</button>
        <button class="icon-button row-edit-button" data-action="edit-row" data-row-index="${rowIndex}" type="button">Edit</button>
      </div>
    `;
    label.querySelector("strong").textContent = getRowName(rowIndex);
    label.querySelector("[data-row-subtotal-index]").textContent = formatDuration(getRowElapsed(rowIndex));

    const track = document.createElement("div");
    track.className = "task-track";
    track.dataset.rowIndex = String(rowIndex);

    const displayTasks = getBoardDisplayTasks(tasks);
    const activeTasks = displayTasks.filter((task) => task.status !== "finished");
    const completedTasks = displayTasks.filter((task) => task.status === "finished");

    activeTasks.forEach((task) => {
      track.appendChild(createTaskCard(task));
    });
    completedTasks.forEach((task) => {
      track.appendChild(createTaskCard(task));
    });

    row.append(label, track);
    elements.board.appendChild(row);
  });

  elements.board.appendChild(createAddTaskFooter(rows.length === 0));
  updateUrgentIndicator();
  updateStickyCountPills();
  updateFlaggedNotesButton();
  if (elements.flaggedNotesDialog.open) {
    renderFlaggedNotesModal();
  }
  if (elements.urgentTasksDialog.open) {
    renderUrgentTasksModal();
  }
  if (elements.unfinishedTasksDialog.open) {
    renderUnfinishedTasksModal();
  }
  if (elements.goalNotesDialog.open) {
    renderGoalNotesModal();
  }
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

function getBoardDisplayTasks(tasks) {
  return [...tasks].sort(compareBoardTaskDisplayOrder);
}

function compareBoardTaskDisplayOrder(a, b) {
  const statusComparison = Number(a.status === "finished") - Number(b.status === "finished");
  if (statusComparison) {
    return statusComparison;
  }

  const urgentComparison = Number(b.urgent) - Number(a.urgent);
  if (urgentComparison) {
    return urgentComparison;
  }

  if (a.urgent && b.urgent) {
    return a.order - b.order;
  }

  const aIsFocused = isTaskHighlightedInStandup(a);
  const bIsFocused = isTaskHighlightedInStandup(b);
  const focusComparison = Number(bIsFocused) - Number(aIsFocused);
  if (focusComparison) {
    return focusComparison;
  }

  if (aIsFocused && bIsFocused) {
    return a.order - b.order;
  }

  const runningComparison = Number(isTaskRunning(b)) - Number(isTaskRunning(a));
  return runningComparison || a.order - b.order;
}

function getRowName(rowIndex) {
  return state.rows[rowIndex]?.name || `Activity ${rowIndex + 1}`;
}

function getRowIndexById(rowId) {
  if (!rowId) {
    return -1;
  }

  return state.rows.findIndex((row) => row.id === rowId);
}

function getGoalNoteCount(tasks) {
  return tasks.reduce((total, task) => total + (task.finishNotes?.length || 0), 0);
}

function formatTaskCount(count, statusLabel) {
  return `${count} ${statusLabel} task${count === 1 ? "" : "s"}`;
}

function createAddTaskFooter(isEmptyBoard = false) {
  const footer = document.createElement("div");
  footer.className = "add-task-footer";
  footer.classList.toggle("is-empty-board", isEmptyBoard);

  const button = document.createElement("button");
  button.className = "add-task-tile";
  button.dataset.action = "add-row";
  button.type = "button";
  button.textContent = "Add Activity";

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
  const urgentButton = fragment.querySelector('[data-action="toggle-urgent"]');
  const timeLogButton = fragment.querySelector('[data-action="show-log"]');
  const notesButton = fragment.querySelector('[data-action="show-notes"]');

  card.dataset.taskId = task.id;
  card.classList.toggle("is-running", isTaskRunning(task));
  card.classList.toggle("is-finished", task.status === "finished");
  card.classList.toggle("is-unstarted", !getFirstStartedAt(task));
  card.classList.toggle("is-urgent", task.urgent);
  card.classList.toggle("is-standup-highlighted", isTaskHighlightedInStandup(task));
  dragHandle.addEventListener("pointerdown", handleTaskPointerDown);

  bucket.value = task.bucket;
  bucket.dataset.bucket = task.bucket;
  objective.textContent = task.objective;
  started.textContent = getFirstStartedAt(task) ? formatTime(getFirstStartedAt(task)) : "Not started";
  elapsed.dataset.elapsedTaskId = task.id;
  elapsed.textContent = formatDuration(getTaskElapsed(task));
  finished.textContent = task.finishedAt ? formatTime(task.finishedAt) : "";
  toggleButton.textContent = isTaskRunning(task) ? "Pause" : "Start";
  urgentButton.classList.toggle("is-active", task.urgent);
  urgentButton.setAttribute("aria-pressed", String(task.urgent));
  timeLogButton.textContent = `Time log (${task.logs.length})`;
  renderTaskNotesButton(notesButton, task);

  return fragment;
}

function renderTaskNotesButton(button, task) {
  const label = `Notes (${task.finishNotes.length})`;
  const hasFlaggedNote = taskHasFlaggedNotes(task);
  button.textContent = label;
  button.classList.toggle("has-flagged-note", hasFlaggedNote);
  button.setAttribute(
    "aria-label",
    hasFlaggedNote ? `${label}, includes flagged note` : label,
  );

  if (!hasFlaggedNote) {
    return;
  }

  const flag = document.createElement("span");
  flag.className = "urgent-flag note-flag-indicator";
  flag.setAttribute("aria-hidden", "true");
  button.appendChild(flag);
}

function taskHasFlaggedNotes(task) {
  return Array.isArray(task.finishNotes) && task.finishNotes.some((note) => note.flagged);
}

function setTaskModalTitle(titleElement, task) {
  const title = `${getRowName(task.row)} / ${task.objective}`;
  titleElement.textContent = title;
  titleElement.title = title;
}

function renderTimeLogModal() {
  const task = findTask(activeTimeLogTaskId);
  if (!task) {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    return;
  }

  setTaskModalTitle(elements.timeLogDialogTitle, task);
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

    if (!log.manual && log.start) {
      actions.appendChild(createLogAdjustGroup("Start", log.id, "start", true));
      if (log.end) {
        actions.appendChild(createLogAdjustGroup("End", log.id, "end", true));
      }
    }

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

function createLogAdjustGroup(labelText, logId, edge, canIncrease) {
  const group = document.createElement("div");
  group.className = "log-adjust-group";

  const label = document.createElement("span");
  label.textContent = labelText;
  group.appendChild(label);

  group.appendChild(createLogAdjustButton(logId, edge, -1, `${labelText} -1 minute`));

  if (canIncrease) {
    group.appendChild(createLogAdjustButton(logId, edge, 1, `${labelText} +1 minute`));
  }

  return group;
}

function createLogAdjustButton(logId, edge, delta, label) {
  const button = document.createElement("button");
  button.className = "icon-button log-adjust-button";
  button.dataset.action = "adjust-log-time";
  button.dataset.logId = logId;
  button.dataset.edge = edge;
  button.dataset.delta = String(delta);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = delta > 0 ? "+" : "-";
  return button;
}

function openFinishNoteDialog(taskId, noteId = "", options = {}) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  if (!options.allowCancelFinish) {
    pendingFinishCancelSnapshot = null;
  }

  activeFinishNoteTaskId = taskId;
  renderFinishNoteModal();
  elements.finishNoteTaskIdInput.value = taskId;
  elements.finishNoteIdInput.value = noteId;
  updateCancelFinishNoteButton(taskId, noteId);

  const note = noteId ? task.finishNotes.find((candidate) => candidate.id === noteId) : null;
  elements.finishNoteInput.value = note?.text || "";
  elements.finishNoteSubmitButton.textContent = note ? "Save note" : "Add note";

  openDialog(elements.finishNoteDialog);
  elements.finishNoteInput.focus();
}

function renderFinishNoteModal() {
  const task = findTask(activeFinishNoteTaskId);
  if (!task) {
    activeFinishNoteTaskId = null;
    pendingFinishCancelSnapshot = null;
    closeDialog(elements.finishNoteDialog);
    return;
  }

  setTaskModalTitle(elements.finishNoteDialogTitle, task);
  elements.finishNoteList.innerHTML = "";

  if (task.finishNotes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No notes yet. Finished tasks are marked in report task headers.";
    elements.finishNoteList.appendChild(empty);
    return;
  }

  task.finishNotes.forEach((note) => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.classList.toggle("is-flagged", note.flagged);
    item.classList.toggle("is-report-note", note.reported);
    item.dataset.taskId = task.id;

    const details = document.createElement("span");
    details.textContent = note.text;

    const actions = document.createElement("div");
    actions.className = "log-actions";

    const editButton = document.createElement("button");
    editButton.className = "button button-small";
    editButton.dataset.action = "edit-finish-note";
    editButton.dataset.noteId = note.id;
    editButton.type = "button";
    editButton.textContent = "Edit";

    const flagButton = document.createElement("button");
    flagButton.className = "button button-small";
    flagButton.classList.toggle("button-flagged", note.flagged);
    flagButton.dataset.action = "toggle-finish-note-flag";
    flagButton.dataset.noteId = note.id;
    flagButton.type = "button";
    flagButton.textContent = note.flagged ? "Remove elevation flag" : "Flag for elevation";

    const reportButton = document.createElement("button");
    reportButton.className = "button button-small";
    reportButton.classList.toggle("button-report", note.reported);
    reportButton.dataset.action = "toggle-finish-note-report";
    reportButton.dataset.noteId = note.id;
    reportButton.type = "button";
    reportButton.textContent = note.reported ? "Remove from standup" : "Report in standup";

    const convertButton = document.createElement("button");
    convertButton.className = "button button-small button-secondary";
    convertButton.dataset.action = "convert-finish-note-to-task";
    convertButton.dataset.noteId = note.id;
    convertButton.type = "button";
    convertButton.textContent = "Convert to task";

    const deleteButton = document.createElement("button");
    deleteButton.className = "button button-small button-danger";
    deleteButton.dataset.action = "delete-finish-note";
    deleteButton.dataset.noteId = note.id;
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";

    const actionMenu = document.createElement("details");
    actionMenu.className = "note-action-menu";
    const actionSummary = document.createElement("summary");
    actionSummary.textContent = "Actions";
    const actionMenuItems = document.createElement("div");
    actionMenuItems.className = "note-action-menu-items";
    actionMenuItems.append(editButton, flagButton, reportButton, convertButton, deleteButton);
    actionMenu.append(actionSummary, actionMenuItems);

    actions.appendChild(actionMenu);
    item.append(details, actions);
    elements.finishNoteList.appendChild(item);
  });
}

function resetFinishNoteForm() {
  if (activeFinishNoteTaskId) {
    elements.finishNoteTaskIdInput.value = activeFinishNoteTaskId;
  }
  elements.finishNoteIdInput.value = "";
  elements.finishNoteInput.value = "";
  elements.finishNoteSubmitButton.textContent = "Add note";
  updateCancelFinishNoteButton(activeFinishNoteTaskId, "");
}

function updateCancelFinishNoteButton(taskId, noteId = "") {
  const isFinishingTask = Boolean(pendingFinishCancelSnapshot)
    && pendingFinishCancelSnapshot.taskId === taskId
    && !noteId;
  elements.cancelFinishNoteButton.hidden = !isFinishingTask;
  elements.finishNoteCloseButton.textContent = isFinishingTask ? "Finish" : "Close";
}

function toggleFinishNoteFlag(taskId, noteId) {
  const task = findTask(taskId);
  const note = task?.finishNotes.find((candidate) => candidate.id === noteId);
  if (!task || !note) {
    return;
  }

  note.flagged = !note.flagged;
  if (!note.flagged) {
    removeStandupHighlightKey(getStandupBlockerHighlightKey(task, note.id));
  }
  saveState();

  if (activeFinishNoteTaskId === taskId) {
    renderFinishNoteModal();
  }

  if (elements.flaggedNotesDialog.open) {
    renderFlaggedNotesModal();
  }

  if (elements.goalNotesDialog.open) {
    renderGoalNotesModal();
  }

  updateFlaggedNotesButton();
  render();
}

function toggleFinishNoteReport(taskId, noteId) {
  const task = findTask(taskId);
  const note = task?.finishNotes.find((candidate) => candidate.id === noteId);
  if (!task || !note) {
    return;
  }

  note.reported = !note.reported;
  if (note.reported) {
    addStandupHighlightKey(getStandupReportedNoteHighlightKey(task, note.id));
  } else {
    removeStandupHighlightKey(getStandupReportedNoteHighlightKey(task, note.id));
  }
  saveState();

  if (activeFinishNoteTaskId === taskId) {
    renderFinishNoteModal();
  }

  if (elements.goalNotesDialog.open) {
    renderGoalNotesModal();
  }

  if (elements.standupSummaryDialog.open) {
    renderStandupSummaryPreview();
  }

  render();
}

function openGoalNotesDialog(rowIndex) {
  if (!Number.isInteger(rowIndex) || !state.rows[rowIndex]) {
    return;
  }

  activeGoalNotesRowId = state.rows[rowIndex].id;
  renderGoalNotesModal();
  openDialog(elements.goalNotesDialog);
}

function renderGoalNotesModal() {
  const rowIndex = getRowIndexById(activeGoalNotesRowId);
  if (rowIndex < 0) {
    activeGoalNotesRowId = null;
    closeDialog(elements.goalNotesDialog);
    return;
  }

  elements.goalNotesDialogTitle.textContent = getRowName(rowIndex);
  elements.goalNotesList.innerHTML = "";

  const noteGroups = getGoalNoteGroups(rowIndex);
  if (noteGroups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No notes for this activity.";
    elements.goalNotesList.appendChild(empty);
    return;
  }

  noteGroups.forEach(({ task, notes }) => {
    const section = document.createElement("section");
    section.className = "goal-note-group";

    const heading = document.createElement("h3");
    heading.textContent = task.objective;

    const list = document.createElement("ul");
    list.className = "goal-note-items";
    notes.forEach((note) => {
      list.appendChild(createGoalNoteItem(task, note));
    });

    section.append(heading, list);
    elements.goalNotesList.appendChild(section);
  });
}

function getGoalNoteGroups(rowIndex) {
  return getSortedTasks()
    .filter((task) => task.row === rowIndex && task.finishNotes.length > 0)
    .map((task) => ({
      task,
      notes: [...task.finishNotes].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
}

function createGoalNoteItem(task, note) {
  const item = document.createElement("li");
  item.className = "goal-note-item";
  item.classList.toggle("is-flagged", note.flagged);

  const openButton = document.createElement("button");
  openButton.className = "goal-note-open";
  openButton.dataset.action = "open-goal-note";
  openButton.dataset.taskId = task.id;
  openButton.dataset.noteId = note.id;
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Open notes for ${task.objective}`);

  const text = document.createElement("span");
  text.className = "goal-note-text";
  text.textContent = note.text;
  openButton.appendChild(text);

  if (note.flagged) {
    const flag = document.createElement("span");
    flag.className = "goal-note-flag";
    const flagIcon = document.createElement("span");
    flagIcon.className = "urgent-flag note-flag-indicator";
    flagIcon.setAttribute("aria-hidden", "true");
    const flagText = document.createElement("span");
    flagText.textContent = "Flagged";
    flag.append(flagIcon, flagText);
    openButton.appendChild(flag);
  }

  item.appendChild(openButton);
  return item;
}

function openFlaggedNotesDialog() {
  renderFlaggedNotesModal();
  openDialog(elements.flaggedNotesDialog);
}

function openUrgentTasksDialog() {
  renderUrgentTasksModal();
  openDialog(elements.urgentTasksDialog);
}

function openUnfinishedTasksDialog() {
  elements.unfinishedTasksSearchInput.value = "";
  renderUnfinishedTasksModal();
  openDialog(elements.unfinishedTasksDialog);
  elements.unfinishedTasksSearchInput.focus();
}

function renderFlaggedNotesModal() {
  const flaggedNotes = getFlaggedNotes();
  elements.flaggedNotesList.innerHTML = "";

  if (flaggedNotes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No flagged notes.";
    elements.flaggedNotesList.appendChild(empty);
    return;
  }

  flaggedNotes.forEach(({ task, note }) => {
    const item = document.createElement("div");
    item.className = "log-item flagged-note-item";
    item.dataset.taskId = task.id;

    const openButton = document.createElement("button");
    openButton.className = "flagged-note-open";
    openButton.dataset.action = "open-flagged-note";
    openButton.dataset.taskId = task.id;
    openButton.dataset.noteId = note.id;
    openButton.type = "button";

    const context = document.createElement("span");
    context.className = "flagged-note-context";
    context.textContent = `${getRowName(task.row)} / ${task.objective}`;

    const text = document.createElement("span");
    text.className = "flagged-note-text";
    text.textContent = note.text;

    openButton.append(context, text);

    const actions = document.createElement("div");
    actions.className = "log-actions";

    const unflagButton = document.createElement("button");
    unflagButton.className = "button button-small button-flagged";
    unflagButton.dataset.action = "toggle-finish-note-flag";
    unflagButton.dataset.noteId = note.id;
    unflagButton.type = "button";
    unflagButton.textContent = "Unflag";

    actions.appendChild(unflagButton);
    item.append(openButton, actions);
    elements.flaggedNotesList.appendChild(item);
  });
}

function renderUrgentTasksModal() {
  const urgentTasks = getUrgentTasks();
  elements.urgentTasksList.innerHTML = "";

  if (urgentTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No urgent tasks.";
    elements.urgentTasksList.appendChild(empty);
    return;
  }

  urgentTasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "log-item urgent-task-item";
    item.dataset.taskId = task.id;

    const openButton = document.createElement("button");
    openButton.className = "urgent-task-open";
    openButton.dataset.action = "open-urgent-task";
    openButton.dataset.taskId = task.id;
    openButton.type = "button";

    const context = document.createElement("span");
    context.className = "urgent-task-context";
    context.textContent = `${getRowName(task.row)} / ${task.bucket} / ${formatDuration(getTaskElapsed(task))}`;

    const text = document.createElement("span");
    text.className = "urgent-task-text";
    text.textContent = task.objective;

    openButton.append(context, text);

    const actions = document.createElement("div");
    actions.className = "log-actions";

    const startButton = document.createElement("button");
    startButton.className = "button button-small button-start";
    startButton.dataset.action = "toggle-timer";
    startButton.type = "button";
    startButton.textContent = isTaskRunning(task) ? "Pause" : "Start";

    actions.appendChild(startButton);
    item.append(openButton, actions);
    elements.urgentTasksList.appendChild(item);
  });
}

function renderUnfinishedTasksModal() {
  const query = getUnfinishedTaskSearchQuery();
  const allUnfinishedTasks = getUnfinishedTasks();
  const unfinishedTasks = query
    ? allUnfinishedTasks.filter((task) => doesUnfinishedTaskMatchSearch(task, query))
    : allUnfinishedTasks;
  elements.unfinishedTasksList.innerHTML = "";

  if (allUnfinishedTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No unfinished tasks.";
    elements.unfinishedTasksList.appendChild(empty);
    return;
  }

  if (unfinishedTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "No unfinished tasks match that search.";
    elements.unfinishedTasksList.appendChild(empty);
    return;
  }

  let currentRow = null;
  let currentGroup = null;
  let currentGroupTasks = null;
  const tasksByRow = getUnfinishedTasksByRow(unfinishedTasks);
  unfinishedTasks.forEach((task) => {
    if (task.row !== currentRow) {
      currentRow = task.row;
      currentGroup = document.createElement("details");
      currentGroup.className = "unfinished-activity-group";
      currentGroup.open = true;

      const heading = document.createElement("summary");
      heading.className = "unfinished-activity-heading";
      heading.append(
        createUnfinishedActivityHeadingText(task.row),
        createUnfinishedActivityBadges(tasksByRow.get(task.row) || [])
      );

      currentGroupTasks = document.createElement("div");
      currentGroupTasks.className = "unfinished-activity-tasks";

      currentGroup.append(heading, currentGroupTasks);
      elements.unfinishedTasksList.appendChild(currentGroup);
    }

    currentGroupTasks.appendChild(createUnfinishedTaskItem(task, query));
  });
}

function getUnfinishedTaskSearchQuery() {
  return normalizeSearchText(elements.unfinishedTasksSearchInput?.value || "");
}

function doesUnfinishedTaskMatchSearch(task, query) {
  if (!query) {
    return true;
  }

  return normalizeSearchText(task.objective).includes(query)
    || (Array.isArray(task.finishNotes)
      && task.finishNotes.some((note) => normalizeSearchText(note.text).includes(query)));
}

function normalizeSearchText(value) {
  return String(value || "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function getUnfinishedTasksByRow(tasks) {
  return tasks.reduce((groups, task) => {
    if (!groups.has(task.row)) {
      groups.set(task.row, []);
    }
    groups.get(task.row).push(task);
    return groups;
  }, new Map());
}

function createUnfinishedActivityHeadingText(rowIndex) {
  const text = document.createElement("span");
  text.className = "unfinished-activity-title";
  text.textContent = getRowName(rowIndex);
  return text;
}

function createUnfinishedActivityBadges(tasks) {
  const badges = document.createElement("span");
  badges.className = "unfinished-task-badges unfinished-activity-badges";
  const counts = getUnfinishedActivityBadgeCounts(tasks);

  if (counts.active > 0) {
    badges.appendChild(createUnfinishedTaskBadge(formatTaskCount(counts.active, "active"), "is-active"));
  }
  if (counts.urgent > 0) {
    badges.appendChild(createUnfinishedTaskBadge(formatTaskCount(counts.urgent, "urgent"), "is-urgent"));
  }
  if (counts.focus > 0) {
    badges.appendChild(createUnfinishedTaskBadge(formatTaskCount(counts.focus, "focus"), "is-focus"));
  }
  if (counts.flagged > 0) {
    badges.appendChild(createUnfinishedTaskBadge(`${counts.flagged} flagged note${counts.flagged === 1 ? "" : "s"}`, "has-flagged-note"));
  }

  return badges;
}

function getUnfinishedActivityBadgeCounts(tasks) {
  return tasks.reduce((counts, task) => {
    counts.active += isTaskRunning(task) ? 1 : 0;
    counts.urgent += task.urgent ? 1 : 0;
    counts.focus += isTaskHighlightedInStandup(task) ? 1 : 0;
    counts.flagged += taskHasFlaggedNotes(task) ? 1 : 0;
    return counts;
  }, {
    active: 0,
    urgent: 0,
    focus: 0,
    flagged: 0,
  });
}

function createUnfinishedTaskItem(task, query = "") {
  const item = document.createElement("div");
  item.className = "log-item unfinished-task-item";
  item.classList.toggle("is-active", isTaskRunning(task));
  item.dataset.taskId = task.id;

  const openButton = document.createElement("button");
  openButton.className = "unfinished-task-open";
  openButton.dataset.action = "open-unfinished-task";
  openButton.dataset.taskId = task.id;
  openButton.type = "button";

  const text = document.createElement("span");
  text.className = "unfinished-task-text";
  text.textContent = task.objective;

  openButton.appendChild(text);

  const badges = document.createElement("span");
  badges.className = "unfinished-task-badges";
  if (task.urgent) {
    badges.appendChild(createUnfinishedTaskBadge("urgent", "is-urgent"));
  }
  if (isTaskHighlightedInStandup(task)) {
    badges.appendChild(createUnfinishedTaskBadge("focus", "is-focus"));
  }
  if (taskHasFlaggedNotes(task)) {
    badges.appendChild(createUnfinishedTaskBadge("flagged notes", "has-flagged-note"));
  }
  if (badges.childElementCount > 0) {
    openButton.appendChild(badges);
  }

  const content = document.createElement("div");
  content.className = "unfinished-task-content";
  content.appendChild(openButton);

  const notes = createUnfinishedTaskNotes(task, query);
  if (notes) {
    content.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "log-actions";

  const startButton = document.createElement("button");
  startButton.className = "button button-small button-start";
  startButton.dataset.action = "toggle-timer";
  startButton.type = "button";
  startButton.textContent = isTaskRunning(task) ? "Pause" : "Start";

  actions.appendChild(startButton);
  item.append(content, actions);
  return item;
}

function createUnfinishedTaskNotes(task, query = "") {
  if (!Array.isArray(task.finishNotes) || task.finishNotes.length === 0) {
    return null;
  }

  const details = document.createElement("details");
  details.className = "unfinished-task-notes";
  details.open = Boolean(query) && task.finishNotes.some((note) => normalizeSearchText(note.text).includes(query));

  const summary = document.createElement("summary");
  summary.textContent = `Notes (${task.finishNotes.length})`;

  const list = document.createElement("ul");
  list.className = "unfinished-task-note-list";
  task.finishNotes
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((note) => {
      const item = document.createElement("li");
      item.classList.toggle("is-flagged", note.flagged);
      item.classList.toggle("is-report-note", note.reported);
      item.textContent = note.text;
      list.appendChild(item);
    });

  details.append(summary, list);
  return details;
}

function createUnfinishedTaskBadge(label, modifier = "") {
  const badge = document.createElement("span");
  badge.className = `unfinished-task-badge${modifier ? ` ${modifier}` : ""}`;
  badge.textContent = label;
  return badge;
}

function setUnfinishedTaskGroupsOpen(isOpen) {
  elements.unfinishedTasksList
    .querySelectorAll(".unfinished-activity-group")
    .forEach((group) => {
      group.open = isOpen;
    });
}

function getFlaggedNotes() {
  return getSortedTasks()
    .flatMap((task) => task.finishNotes
      .filter((note) => note.flagged)
      .map((note) => ({ task, note })))
    .sort((a, b) => (
      a.task.row - b.task.row
      || a.task.order - b.task.order
      || new Date(a.note.createdAt).getTime() - new Date(b.note.createdAt).getTime()
    ));
}

function getUrgentTasks() {
  return getSortedTasks().filter((task) => task.urgent);
}

function getUnfinishedTasks() {
  return getSortedTasks().filter((task) => task.status !== "finished");
}

function openFlaggedNote(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  closeDialog(elements.flaggedNotesDialog);
  scrollToRow(task.row);
  window.setTimeout(() => {
    openFinishNoteDialog(taskId);
  }, 360);
}

function openUrgentTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  closeDialog(elements.urgentTasksDialog);
  scrollToTask(taskId);
}

function openUnfinishedTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  closeDialog(elements.unfinishedTasksDialog);
  scrollToTask(taskId);
}

function openGoalNote(taskId, noteId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  activeGoalNotesRowId = null;
  closeDialog(elements.goalNotesDialog);
  scrollToRow(task.row);
  window.setTimeout(() => {
    openFinishNoteDialog(taskId, noteId);
  }, 360);
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

  track.appendChild(activeDrag.card);
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

function moveRowPriority(rowIndex, direction) {
  if (!Number.isInteger(rowIndex) || !Number.isInteger(direction)) {
    return;
  }

  const targetIndex = rowIndex + direction;
  if (targetIndex < 0 || targetIndex >= state.rows.length) {
    return;
  }

  moveRow(rowIndex, targetIndex);
  render();
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
  state.rows.splice(toIndex, 0, movedRowMeta || createRow(`Activity ${toIndex + 1}`));
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
  elements.rowDialogTitle.textContent = mode === "edit" ? "Edit activity" : "Add activity";
  elements.rowIndexInput.value = Number.isFinite(rowIndex) ? String(rowIndex) : "";
  elements.rowNameInput.value = row?.name || "";
  elements.deleteRowDialogButton.hidden = mode !== "edit" || !row;
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

function deleteRowWithPrompt(rowIndex) {
  if (!Number.isInteger(rowIndex) || !state.rows[rowIndex]) {
    return false;
  }

  const rowName = getRowName(rowIndex);
  const rowTasks = state.tasks.filter((task) => task.row === rowIndex);
  const taskCount = rowTasks.length;
  const taskText = taskCount === 0
    ? ""
    : ` This will also delete ${taskCount} task box${taskCount === 1 ? "" : "es"} and ${taskCount === 1 ? "its" : "their"} time logs.`;
  const confirmed = window.confirm(`Delete activity "${rowName}"?${taskText}`);
  if (!confirmed) {
    return false;
  }

  deleteRow(rowIndex);
  return true;
}

function deleteRow(rowIndex) {
  const deletedTaskIds = new Set(state.tasks.filter((task) => task.row === rowIndex).map((task) => task.id));
  state.tasks = state.tasks
    .filter((task) => task.row !== rowIndex)
    .map((task) => {
      if (task.row > rowIndex) {
        task.row -= 1;
      }
      return task;
    });
  state.rows.splice(rowIndex, 1);
  normalizeBoard();
  saveState();

  if (activeTimeLogTaskId && deletedTaskIds.has(activeTimeLogTaskId)) {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    closeDialog(elements.logDialog);
  }

  if (activeFinishNoteTaskId && deletedTaskIds.has(activeFinishNoteTaskId)) {
    activeFinishNoteTaskId = null;
    closeDialog(elements.finishNoteDialog);
  }

  render();
}

function createRow(name) {
  return {
    id: createId(),
    name: String(name || "New Activity").slice(0, 80),
  };
}

function openTaskDialog(mode, placement, task = null, rowIndex = "", options = {}) {
  ensureRowsForTasks();
  elements.taskDialogTitle.textContent = mode === "edit" ? "Edit task" : "Add task";
  elements.taskIdInput.value = task?.id || "";
  elements.taskPlacementInput.value = placement;
  elements.taskRowInput.value = task ? String(task.row) : rowIndex === "" ? "" : String(rowIndex);
  elements.objectiveInput.value = task?.objective || "";
  elements.bucketInput.value = task?.bucket || "";
  populateTaskRowSelect(task?.row ?? rowIndex);
  elements.taskSendToField.hidden = false;
  elements.deleteTaskDialogButton.hidden = mode !== "edit" || !task;
  elements.saveUrgentTaskDialogButton.hidden = mode === "edit";
  elements.taskCategoryGuide.hidden = placement !== "side";
  elements.taskCategoryGuide.open = placement === "side";
  openDialog(elements.taskDialog);
  if (options.focus === "bucket") {
    elements.bucketInput.focus();
  } else {
    elements.objectiveInput.focus();
  }
}

function populateTaskRowSelect(selectedRowIndex = "") {
  const selectedValue = selectedRowIndex === "" ? "" : String(selectedRowIndex);
  elements.taskRowSelect.innerHTML = "";

  state.rows.forEach((row, rowIndex) => {
    const option = document.createElement("option");
    option.value = String(rowIndex);
    option.textContent = `Priority ${rowIndex + 1} - ${row.name}`;
    elements.taskRowSelect.appendChild(option);
  });

  if (selectedValue !== "" && state.rows[Number(selectedValue)]) {
    elements.taskRowSelect.value = selectedValue;
  } else if (state.rows.length > 0) {
    elements.taskRowSelect.value = "0";
  }
}

function saveTaskFromDialog(event) {
  event.preventDefault();

  const id = elements.taskIdInput.value;
  const placement = elements.taskPlacementInput.value;
  const rowIndex = elements.taskRowInput.value === "" ? null : Number(elements.taskRowInput.value);
  const selectedRowIndex = elements.taskRowSelect.value === "" ? null : Number(elements.taskRowSelect.value);
  const objective = elements.objectiveInput.value.trim();
  const bucket = elements.bucketInput.value;
  const submitAction = event.submitter?.value || "save";
  const shouldStart = submitAction === "save-start";
  const shouldSaveUrgent = submitAction === "save-urgent";
  let savedTask = null;

  if (!objective || !BUCKETS.includes(bucket)) {
    return;
  }

  if (id) {
    const task = findTask(id);
    if (task) {
      const previousObjective = task.objective;
      task.objective = objective;
      task.bucket = bucket;
      migrateStandupHighlightKeysForRenamedTask(task, previousObjective);
      if (Number.isInteger(selectedRowIndex) && state.rows[selectedRowIndex]) {
        sendTaskToRow(task, selectedRowIndex);
      }
      savedTask = task;
    }
  } else {
    const targetRowIndex = Number.isInteger(selectedRowIndex) && state.rows[selectedRowIndex]
      ? selectedRowIndex
      : rowIndex;
    savedTask = createTask({ objective, bucket, placement, rowIndex: targetRowIndex });
    state.tasks.push(savedTask);
    completePendingNoteConversion();
  }

  if (shouldSaveUrgent && savedTask && savedTask.status !== "finished") {
    savedTask.urgent = true;
    savedTask.wasUrgent = true;
  }

  if (shouldStart && savedTask && !isTaskRunning(savedTask)) {
    startTask(savedTask);
  }

  normalizeBoard();
  saveState();
  closeDialog(elements.taskDialog);
  render();
}

function migrateStandupHighlightKeysForRenamedTask(task, previousObjective) {
  if (!task?.id || !previousObjective) {
    return;
  }

  let changed = false;
  const replacements = new Map([
    [`since:${previousObjective}`, `since:${task.id}`],
    [`today:${previousObjective}`, `today:${task.id}`],
  ]);

  replacements.forEach((newKey, oldKey) => {
    if (!standupHighlightedKeys.has(oldKey)) {
      return;
    }

    standupHighlightedKeys.delete(oldKey);
    standupHighlightedKeys.add(newKey);
    changed = true;
  });

  if (standupHighlightedKeys.delete(`blocker:${previousObjective}`)) {
    task.finishNotes
      .filter((note) => note.flagged)
      .forEach((note) => {
        standupHighlightedKeys.add(`blocker:${task.id}:${note.id}`);
      });
    changed = true;
  }

  if (changed) {
    saveStandupSettings();
  }
}

function migrateLegacyStandupHighlightKeys() {
  let changed = false;
  state.tasks.forEach((task) => {
    migrateStandupHighlightKeysForRenamedTask(task, task.objective);
    task.finishNotes
      .filter((note) => note.reported)
      .forEach((note) => {
        const key = getStandupReportedNoteHighlightKey(task, note.id);
        if (!standupHighlightedKeys.has(key)) {
          standupHighlightedKeys.add(key);
          changed = true;
        }
      });
  });

  if (changed) {
    saveStandupSettings();
  }
}

function removeStandupHighlightKey(key) {
  if (!key || !standupHighlightedKeys.delete(key)) {
    return false;
  }

  saveStandupSettings();
  return true;
}

function addStandupHighlightKey(key) {
  if (!key || standupHighlightedKeys.has(key)) {
    return false;
  }

  standupHighlightedKeys.add(key);
  saveStandupSettings();
  return true;
}

function removeStandupHighlightKeysForNote(task, noteId) {
  if (!task?.id || !noteId) {
    return;
  }

  let changed = false;
  [
    getStandupBlockerHighlightKey(task, noteId),
    getStandupReportedNoteHighlightKey(task, noteId),
  ].forEach((key) => {
    changed = standupHighlightedKeys.delete(key) || changed;
  });

  if (changed) {
    saveStandupSettings();
  }
}

function removeStandupHighlightKeysForTask(task) {
  if (!task?.id) {
    return;
  }

  let changed = false;
  [...standupHighlightedKeys].forEach((key) => {
    const shouldRemove = key === `today:${task.id}`
      || key === `since:${task.id}`
      || key.startsWith(`blocker:${task.id}:`)
      || key.startsWith(`since:${task.id}:`);
    if (!shouldRemove) {
      return;
    }

    standupHighlightedKeys.delete(key);
    changed = true;
  });

  if (changed) {
    saveStandupSettings();
  }
}

function sendTaskToRow(task, rowIndex) {
  if (!task || !Number.isInteger(rowIndex) || !state.rows[rowIndex] || task.row === rowIndex) {
    return;
  }

  const order = getNextOrder(rowIndex);
  task.row = rowIndex;
  task.order = order;
}

function createTask({ objective, bucket, placement, rowIndex }) {
  const row = placement === "side" ? (Number.isFinite(rowIndex) ? rowIndex : 0) : getBottomRowIndex() + 1;

  ensureRowIndex(row);
  const order = getNextOrder(row);

  return {
    id: createId(),
    objective,
    bucket,
    status: "active",
    row,
    order,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    urgent: false,
    wasUrgent: false,
    finishNotes: [],
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

function showNotesFromTimeLog() {
  const taskId = activeTimeLogTaskId;
  if (!taskId || !findTask(taskId)) {
    return;
  }

  activeTimeLogTaskId = null;
  closeDialog(elements.timeLogDialog);
  openFinishNoteDialog(taskId);
}

function showTimeLogFromNotes() {
  const taskId = activeFinishNoteTaskId;
  if (!taskId || !findTask(taskId)) {
    return;
  }

  pendingFinishCancelSnapshot = null;
  activeFinishNoteTaskId = null;
  closeDialog(elements.finishNoteDialog);
  openTimeLogDialog(taskId);
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
  elements.manualMinutesInput.value = getLogDialogMinutesValue(log);
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

function saveFinishNoteFromDialog(event) {
  event.preventDefault();

  const task = findTask(elements.finishNoteTaskIdInput.value);
  if (!task) {
    return;
  }

  const noteText = sanitizeFinishNote(elements.finishNoteInput.value);
  if (!noteText) {
    window.alert("Enter a note, or close the modal without saving.");
    return;
  }

  const noteId = elements.finishNoteIdInput.value;
  if (noteId) {
    const note = task.finishNotes.find((candidate) => candidate.id === noteId);
    if (note) {
      note.text = noteText;
    }
  } else {
    task.finishNotes.push({
      id: createId(),
      text: noteText,
      flagged: false,
      reported: false,
      createdAt: new Date().toISOString(),
    });
  }

  pendingFinishCancelSnapshot = null;
  saveState();
  resetFinishNoteForm();
  renderFinishNoteModal();
  render();
  elements.finishNoteInput.focus();
}

function syncLogFieldsFromStart() {
  const start = getLogInputDate(elements.logStartInput);
  if (!start) {
    return;
  }

  const end = getLogInputDate(elements.logEndInput);
  if (end && end >= start) {
    setManualMinutesFromRange(start, end);
    return;
  }

  setLogEndFromStartAndMinutes(start);
}

function syncLogFieldsFromEnd() {
  const end = getLogInputDate(elements.logEndInput);
  if (!end) {
    return;
  }

  const start = getLogInputDate(elements.logStartInput);
  if (start && end >= start) {
    setManualMinutesFromRange(start, end);
    return;
  }

  setLogStartFromEndAndMinutes(end);
}

function syncLogFieldsFromMinutes() {
  const minutes = getManualMinutesInputValue();
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return;
  }

  const start = getLogInputDate(elements.logStartInput);
  if (start) {
    setLogEndFromStartAndMinutes(start);
    return;
  }

  const end = getLogInputDate(elements.logEndInput);
  if (end) {
    setLogStartFromEndAndMinutes(end);
  }
}

function getLogDialogMinutesValue(log) {
  if (!log || isLogRunning(log)) {
    return "";
  }

  const start = getLogInputDate(elements.logStartInput);
  const end = getLogInputDate(elements.logEndInput);
  if (start && end && end >= start) {
    return minutesFromMs(end.getTime() - start.getTime()).toFixed(2);
  }

  return minutesFromMs(getLogDuration(log)).toFixed(2);
}

function getLogInputDate(input) {
  if (!input.value) {
    return null;
  }

  const date = new Date(input.value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function setLogEndFromStartAndMinutes(start) {
  const minutes = getManualMinutesInputValue();
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return;
  }

  elements.logEndInput.value = toDateTimeLocalValue(new Date(start.getTime() + Math.round(minutes * 60 * 1000)));
}

function setLogStartFromEndAndMinutes(end) {
  const minutes = getManualMinutesInputValue();
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return;
  }

  elements.logStartInput.value = toDateTimeLocalValue(new Date(end.getTime() - Math.round(minutes * 60 * 1000)));
}

function setManualMinutesFromRange(start, end) {
  elements.manualMinutesInput.value = minutesFromMs(end.getTime() - start.getTime()).toFixed(2);
}

function getManualMinutesInputValue() {
  return Number(elements.manualMinutesInput.value);
}

function buildLogDraft({ existingLog, startValue, endValue, minutes }) {
  const now = new Date();
  const durationMs = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60 * 1000) : 0;

  const start = startValue ? new Date(startValue) : null;
  if (startValue && Number.isNaN(start.getTime())) {
    window.alert("Enter a valid start time.");
    return null;
  }

  const end = endValue ? new Date(endValue) : null;
  if (endValue && Number.isNaN(end.getTime())) {
    window.alert("Enter a valid stop time.");
    return null;
  }

  if (start && end) {
    if (end < start) {
      window.alert("Enter a stop time after the start time.");
      return null;
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      durationMs: end.getTime() - start.getTime(),
      manual: false,
      createdAt: existingLog?.createdAt || start.toISOString(),
    };
  }

  if (start && durationMs > 0) {
    const calculatedEnd = new Date(start.getTime() + durationMs);
    return {
      start: start.toISOString(),
      end: calculatedEnd.toISOString(),
      durationMs,
      manual: false,
      createdAt: existingLog?.createdAt || start.toISOString(),
    };
  }

  if (end && durationMs > 0) {
    const calculatedStart = new Date(end.getTime() - durationMs);
    return {
      start: calculatedStart.toISOString(),
      end: end.toISOString(),
      durationMs,
      manual: false,
      createdAt: existingLog?.createdAt || calculatedStart.toISOString(),
    };
  }

  if (durationMs > 0) {
    return {
      start: null,
      end: null,
      durationMs,
      manual: true,
      createdAt: existingLog?.createdAt || now.toISOString(),
    };
  }

  if (start) {
    return {
      start: start.toISOString(),
      end: null,
      durationMs: 0,
      manual: false,
      createdAt: existingLog?.createdAt || start.toISOString(),
    };
  }

  if (end) {
    window.alert("Enter an amount of time with the stop time, or add a start time.");
    return null;
  }

  window.alert("Enter an amount of time, or add a start time.");
  return null;
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

function toggleUrgent(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === "finished") {
    return;
  }

  task.urgent = !task.urgent;
  if (task.urgent) {
    task.wasUrgent = true;
  }
  normalizeBoard();
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
  let cancelSnapshot = null;
  if (task.status !== "finished") {
    const runningLog = getRunningLog(task);
    cancelSnapshot = {
      taskId: task.id,
      status: task.status,
      finishedAt: task.finishedAt,
      urgent: task.urgent,
      wasUrgent: task.wasUrgent,
      runningLog: runningLog ? {
        id: runningLog.id,
        end: runningLog.end || null,
        durationMs: runningLog.durationMs || 0,
      } : null,
    };
    pauseTask(task, now);
    task.status = "finished";
    task.finishedAt = now.toISOString();
    task.urgent = false;
  }
  pendingFinishCancelSnapshot = cancelSnapshot;
  normalizeBoard();
  saveState();
  render();
  openFinishNoteDialog(taskId, "", { allowCancelFinish: Boolean(cancelSnapshot) });
}

function cancelPendingFinishFromNotes() {
  if (!pendingFinishCancelSnapshot) {
    activeFinishNoteTaskId = null;
    closeDialog(elements.finishNoteDialog);
    return;
  }

  const snapshot = pendingFinishCancelSnapshot;
  const task = findTask(snapshot.taskId);
  pendingFinishCancelSnapshot = null;

  if (task) {
    task.status = snapshot.status || "active";
    task.finishedAt = snapshot.finishedAt || null;
    task.urgent = snapshot.urgent === true;
    task.wasUrgent = snapshot.wasUrgent === true;

    if (snapshot.runningLog) {
      const log = task.logs.find((candidate) => candidate.id === snapshot.runningLog.id);
      if (log) {
        log.end = snapshot.runningLog.end;
        log.durationMs = snapshot.runningLog.durationMs;
      }
    }
  }

  activeFinishNoteTaskId = null;
  closeDialog(elements.finishNoteDialog);
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
    return false;
  }

  const confirmed = window.confirm(`Delete "${task.objective}"?`);
  if (!confirmed) {
    return false;
  }

  removeStandupHighlightKeysForTask(task);
  state.tasks = state.tasks.filter((candidate) => candidate.id !== taskId);
  normalizeBoard();
  saveState();

  if (activeTimeLogTaskId === taskId) {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    closeDialog(elements.logDialog);
  }

  if (activeFinishNoteTaskId === taskId) {
    activeFinishNoteTaskId = null;
    closeDialog(elements.finishNoteDialog);
  }

  render();
  return true;
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

function adjustLogTime(taskId, logId, edge, deltaMinutes) {
  const log = findLog(taskId, logId);
  if (!log || log.manual || !log.start || !["start", "end"].includes(edge) || !Number.isFinite(deltaMinutes)) {
    return;
  }

  if (edge === "end" && !log.end) {
    return;
  }

  const current = new Date(log[edge]);
  if (Number.isNaN(current.getTime())) {
    return;
  }

  const adjusted = new Date(current.getTime() + deltaMinutes * LOG_ADJUSTMENT_MS);
  if (edge === "start" && log.end && adjusted > new Date(log.end)) {
    window.alert("Start time cannot move after the stop time.");
    return;
  }

  if (edge === "start" && !log.end && adjusted > new Date()) {
    window.alert("Start time cannot move into the future.");
    return;
  }

  if (edge === "end" && adjusted < new Date(log.start)) {
    window.alert("Stop time cannot move before the start time.");
    return;
  }

  log[edge] = adjusted.toISOString();
  updateTimedLogDuration(log);
  saveState();
  refreshTimeLogViews(taskId);
}

function updateTimedLogDuration(log) {
  if (log.manual || !log.start || !log.end) {
    return;
  }

  log.durationMs = Math.max(0, new Date(log.end).getTime() - new Date(log.start).getTime());
}

function refreshTimeLogViews(taskId) {
  if (activeTimeLogTaskId === taskId) {
    renderTimeLogModal();
  }
  render();
}

function convertFinishNoteToTask(taskId, noteId) {
  const sourceTask = findTask(taskId);
  const note = sourceTask?.finishNotes.find((candidate) => candidate.id === noteId);
  if (!sourceTask || !note) {
    return;
  }

  const objective = createTaskObjectiveFromNote(note.text);
  pendingNoteConversion = { taskId, noteId };
  activeFinishNoteTaskId = null;
  pendingFinishCancelSnapshot = null;
  closeDialog(elements.finishNoteDialog);
  openTaskDialog("add", "side", {
    objective,
    bucket: "",
    row: sourceTask.row,
  }, sourceTask.row, { focus: "bucket" });
}

function completePendingNoteConversion() {
  if (!pendingNoteConversion) {
    return;
  }

  const { taskId, noteId } = pendingNoteConversion;
  pendingNoteConversion = null;

  const sourceTask = findTask(taskId);
  const note = sourceTask?.finishNotes.find((candidate) => candidate.id === noteId);
  if (!sourceTask || !note) {
    return;
  }

  removeStandupHighlightKeysForNote(sourceTask, noteId);
  sourceTask.finishNotes = sourceTask.finishNotes.filter((candidate) => candidate.id !== noteId);

  if (activeFinishNoteTaskId === taskId) {
    resetFinishNoteForm();
    renderFinishNoteModal();
  }

  if (elements.flaggedNotesDialog.open) {
    renderFlaggedNotesModal();
  }

  if (elements.goalNotesDialog.open) {
    renderGoalNotesModal();
  }

  if (elements.standupSummaryDialog.open) {
    renderStandupSummaryPreview();
  }

  updateFlaggedNotesButton();
}

function clearPendingNoteConversion() {
  pendingNoteConversion = null;
}

function createTaskObjectiveFromNote(noteText) {
  const objective = String(noteText || "").trim().replace(/\s+/g, " ");
  return (objective || "Follow up from note").slice(0, 180);
}

function deleteFinishNote(taskId, noteId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  const confirmed = window.confirm("Delete this note?");
  if (!confirmed) {
    return;
  }

  removeStandupHighlightKeysForNote(task, noteId);
  task.finishNotes = task.finishNotes.filter((note) => note.id !== noteId);
  saveState();
  if (activeFinishNoteTaskId === taskId) {
    resetFinishNoteForm();
    renderFinishNoteModal();
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

function deleteTimeLogsAndCompletedTasks() {
  state.tasks.forEach((task) => {
    task.logs = [];
  });
  state.tasks = state.tasks.filter((task) => task.status !== "finished");
  normalizeBoard();
  saveState();

  if (activeTimeLogTaskId && !findTask(activeTimeLogTaskId)) {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    closeDialog(elements.logDialog);
  } else if (activeTimeLogTaskId) {
    renderTimeLogModal();
  }

  if (activeFinishNoteTaskId && !findTask(activeFinishNoteTaskId)) {
    activeFinishNoteTaskId = null;
    closeDialog(elements.finishNoteDialog);
  }

  if (activeGoalNotesRowId && getRowIndexById(activeGoalNotesRowId) < 0) {
    activeGoalNotesRowId = null;
    closeDialog(elements.goalNotesDialog);
  }

  render();
}

function clearCompletedTasksWithPrompt() {
  const completedCount = state.tasks.filter((task) => task.status === "finished").length;
  if (completedCount === 0) {
    return;
  }

  const confirmed = window.confirm(`Clear ${completedCount} completed task${completedCount === 1 ? "" : "s"}?`);
  if (!confirmed) {
    return;
  }

  clearCompletedTasks();
}

function clearCompletedTasks() {
  state.tasks = state.tasks.filter((task) => task.status !== "finished");
  normalizeBoard();
  saveState();
  if (activeTimeLogTaskId && !findTask(activeTimeLogTaskId)) {
    activeTimeLogTaskId = null;
    closeDialog(elements.timeLogDialog);
    closeDialog(elements.logDialog);
  }
  if (activeFinishNoteTaskId && !findTask(activeFinishNoteTaskId)) {
    activeFinishNoteTaskId = null;
    closeDialog(elements.finishNoteDialog);
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
  activeFinishNoteTaskId = null;
  activeGoalNotesRowId = null;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(STANDUP_SETTINGS_KEY);
  standupLastDate = getDefaultLastStandupDate();
  standupHighlightedKeys = new Set();
  closeDialog(elements.timeLogDialog);
  closeDialog(elements.logDialog);
  closeDialog(elements.finishNoteDialog);
  closeDialog(elements.flaggedNotesDialog);
  closeDialog(elements.urgentTasksDialog);
  closeDialog(elements.unfinishedTasksDialog);
  closeDialog(elements.goalNotesDialog);
  closeDialog(elements.reportDialog);
  closeDialog(elements.standupSummaryDialog);
  closeDialog(elements.settingsDialog);
  render();
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

function openStandupSummaryDialog() {
  if (!elements.standupSummaryDialog || !elements.standupSummaryPreview) {
    return;
  }

  syncLastStandupDateInput();
  renderStandupSummaryPreview();
  openDialog(elements.standupSummaryDialog);
}

function loadStandupSettings() {
  const stored = window.localStorage.getItem(STANDUP_SETTINGS_KEY);
  if (!stored) {
    standupLastDate = getDefaultLastStandupDate();
    standupHighlightedKeys = new Set();
    return;
  }

  try {
    const settings = JSON.parse(stored);
    standupLastDate = sanitizeStandupDate(settings.lastStandupDate) || getDefaultLastStandupDate();
    standupHighlightedKeys = new Set(
      Array.isArray(settings.highlightedKeys)
        ? settings.highlightedKeys.filter((key) => typeof key === "string" && key)
        : []
    );
  } catch (error) {
    standupLastDate = getDefaultLastStandupDate();
    standupHighlightedKeys = new Set();
  }
}

function saveStandupSettings() {
  window.localStorage.setItem(STANDUP_SETTINGS_KEY, JSON.stringify({
    lastStandupDate: getLastStandupDateValue(),
    highlightedKeys: [...standupHighlightedKeys],
  }));
}

function syncLastStandupDateInput() {
  if (!elements.lastStandupDateInput) {
    return;
  }

  elements.lastStandupDateInput.value = getLastStandupDateValue();
  elements.lastStandupDateInput.max = formatFileDate(new Date());
}

function saveLastStandupDateFromInput() {
  const selectedDate = sanitizeStandupDate(elements.lastStandupDateInput.value) || getDefaultLastStandupDate();
  standupLastDate = selectedDate;
  elements.lastStandupDateInput.value = selectedDate;
  saveStandupSettings();
  renderStandupSummaryPreview();
}

function renderStandupSummaryPreview() {
  const summary = buildStandupSummary();
  elements.standupSummaryPreview.innerHTML = "";

  appendStandupGroupedPreviewSection(
    elements.standupSummaryPreview,
    "What I did since last standup",
    summary.sinceLastStandupTasks,
    formatStandupGroupedCompletedTask,
    "since"
  );
  appendStandupPreviewSection(
    elements.standupSummaryPreview,
    "What I'm doing today",
    summary.todayTasks,
    formatStandupTodayTask,
    "today"
  );
  appendStandupPreviewSection(
    elements.standupSummaryPreview,
    "What I'm stuck on",
    summary.blockers,
    formatStandupBlocker,
    "blocker"
  );
}

function appendStandupPreviewSection(parent, title, items, formatter, sectionKey) {
  const heading = document.createElement("h4");
  heading.textContent = title;

  const list = document.createElement("ul");
  if (items.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "None";
    list.appendChild(emptyItem);
  } else {
    items.forEach((item) => {
      list.appendChild(createStandupSummaryItem(item, formatter, sectionKey));
    });
  }

  parent.append(heading, list);
}

function appendStandupGroupedPreviewSection(parent, title, items, formatter, sectionKey) {
  const heading = document.createElement("h4");
  heading.textContent = title;
  parent.appendChild(heading);

  if (items.length === 0) {
    const list = document.createElement("ul");
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "None";
    list.appendChild(emptyItem);
    parent.appendChild(list);
    return;
  }

  getStandupProjectGroups(items).forEach((group) => {
    const project = document.createElement("section");
    project.className = "standup-project-group";

    const projectHeading = document.createElement("h5");
    projectHeading.textContent = group.label;

    const list = document.createElement("ul");
    group.items.forEach((item) => {
      list.appendChild(createStandupSummaryItem(item, formatter, sectionKey));
    });

    project.append(projectHeading, list);
    parent.appendChild(project);
  });
}

function getStandupProjectGroups(items) {
  const groups = new Map();

  items.forEach((item) => {
    const label = item.activity || "No activity";
    if (!groups.has(label)) {
      groups.set(label, {
        label,
        row: Number.isInteger(item.row) ? item.row : Number.MAX_SAFE_INTEGER,
        items: [],
      });
    }

    const group = groups.get(label);
    group.row = Math.min(group.row, Number.isInteger(item.row) ? item.row : Number.MAX_SAFE_INTEGER);
    group.items.push(item);
  });

  return [...groups.values()]
    .sort((a, b) => a.row - b.row || a.label.localeCompare(b.label))
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => a.sortTime - b.sortTime || a.order - b.order),
    }));
}

function createStandupSummaryItem(item, formatter, sectionKey) {
  const itemKey = getStandupSummaryItemKey(sectionKey, item);
  const isHighlighted = standupHighlightedKeys.has(itemKey);
  const listItem = document.createElement("li");
  listItem.className = "standup-summary-item";
  listItem.classList.toggle("is-highlighted", isHighlighted);
  listItem.classList.toggle("is-report-only", isReportOnlyStandupSection(sectionKey));
  listItem.classList.toggle("is-focus-highlight", isFocusStandupSection(sectionKey));
  listItem.classList.toggle("is-blocker-highlight", sectionKey === "blocker");
  listItem.dataset.standupKey = itemKey;
  listItem.tabIndex = 0;
  listItem.setAttribute("role", "button");
  listItem.setAttribute("aria-pressed", String(isHighlighted));
  listItem.textContent = formatter(item);
  listItem.addEventListener("click", () => {
    toggleStandupSummaryItemHighlight(listItem);
  });
  listItem.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleStandupSummaryItemHighlight(listItem);
  });
  return listItem;
}

function getStandupSummaryItemKey(sectionKey, item) {
  return `${sectionKey}:${item.id || item.objective || item.note || "item"}`;
}

function isReportOnlyStandupSection(sectionKey) {
  return sectionKey === "since";
}

function isFocusStandupSection(sectionKey) {
  return sectionKey === "today" || sectionKey === "blocker";
}

function toggleStandupSummaryItemHighlight(item) {
  const key = item.dataset.standupKey;
  if (!key) {
    return;
  }

  const shouldHighlight = !standupHighlightedKeys.has(key);
  let noteStateChanged = false;
  let shouldRefreshPreview = false;
  if (shouldHighlight) {
    standupHighlightedKeys.add(key);
  } else {
    const softDeleteResult = softDeleteStandupNoteHighlightWithPrompt(key);
    if (softDeleteResult.cancelled) {
      return;
    }

    if (softDeleteResult.handled) {
      noteStateChanged = true;
      shouldRefreshPreview = true;
    }

    standupHighlightedKeys.delete(key);
  }

  const reportSyncChanged = shouldHighlight && syncReportedNoteFromStandupHighlightKey(key, true);
  saveStandupSettings();
  if (noteStateChanged || reportSyncChanged) {
    saveState();
    refreshStandupNoteStateViews();
  }

  if (shouldRefreshPreview || reportSyncChanged) {
    renderStandupSummaryPreview();
  } else {
    syncStandupSummaryHighlightItems();
  }
  render();
}

function syncStandupSummaryHighlightItems() {
  elements.standupSummaryPreview
    ?.querySelectorAll("[data-standup-key]")
    .forEach((item) => {
      const isHighlighted = standupHighlightedKeys.has(item.dataset.standupKey);
      item.classList.toggle("is-highlighted", isHighlighted);
      item.setAttribute("aria-pressed", String(isHighlighted));
    });
}

function getStandupBlockerHighlightKey(task, noteId) {
  return `blocker:${task.id}:${noteId}`;
}

function getStandupReportedNoteHighlightKey(task, noteId) {
  return `since:${task.id}:${noteId}`;
}

function softDeleteStandupNoteHighlightWithPrompt(key) {
  const target = getStandupNoteHighlightTarget(key);
  if (!target) {
    return { handled: false, cancelled: false };
  }

  const actionLabel = target.type === "reported" ? "Report in standup" : "Flag for elevation";
  const activityName = getRowName(target.task.row);
  const taskObjective = target.task.objective;
  console.info(
    `Standup note removal: go back to "${activityName}" / "${taskObjective}" notes and choose "${actionLabel}" to add it here again.`
  );
  const confirmed = window.confirm(
    `Remove this note from the standup summary?\n\nThis will not delete the note. To add it here again, go back to "${activityName}" / "${taskObjective}" notes and choose "${actionLabel}".`
  );
  if (!confirmed) {
    return { handled: true, cancelled: true };
  }

  if (target.type === "reported") {
    target.note.reported = false;
  } else {
    target.note.flagged = false;
  }

  return { handled: true, cancelled: false };
}

function getStandupNoteHighlightTarget(key) {
  const match = typeof key === "string" ? key.match(/^(since|blocker):([^:]+):([^:]+)$/) : null;
  if (!match) {
    return null;
  }

  const [, section, taskId, noteId] = match;
  const task = findTask(taskId);
  const note = task?.finishNotes.find((candidate) => candidate.id === noteId);
  if (!task || !note) {
    return null;
  }

  return {
    note,
    task,
    type: section === "since" ? "reported" : "flagged",
  };
}

function refreshStandupNoteStateViews() {
  if (activeFinishNoteTaskId) {
    renderFinishNoteModal();
  }

  if (elements.flaggedNotesDialog.open) {
    renderFlaggedNotesModal();
  }

  if (elements.goalNotesDialog.open) {
    renderGoalNotesModal();
  }

  updateFlaggedNotesButton();
}

function syncReportedNoteFromStandupHighlightKey(key, isHighlighted) {
  const match = typeof key === "string" ? key.match(/^since:([^:]+):([^:]+)$/) : null;
  if (!match) {
    return false;
  }

  const [, taskId, noteId] = match;
  const task = findTask(taskId);
  const note = task?.finishNotes.find((candidate) => candidate.id === noteId);
  if (!note || note.reported === isHighlighted) {
    return false;
  }

  note.reported = isHighlighted;
  return true;
}

function isTaskHighlightedInStandup(task) {
  if (!task?.id) {
    return false;
  }

  return task.status !== "finished" && standupHighlightedKeys.has(`today:${task.id}`);
}

function buildStandupSummary() {
  const rangeStart = getStandupRangeStart();
  const rangeEnd = new Date();
  const unfinishedTasks = getSortedTasks().filter((task) => !isTaskFinishedForReport(task));
  const urgentTasks = unfinishedTasks
    .filter((task) => task.urgent)
    .map(createStandupTaskEntry);
  const prioritizedTasks = unfinishedTasks
    .filter((task) => !task.urgent)
    .map(createStandupTaskEntry);

  return {
    sinceLastStandupTasks: getStandupDidEntries(rangeStart, rangeEnd),
    todayTasks: [...urgentTasks, ...prioritizedTasks],
    blockers: getFlaggedNotes().map(({ task, note }) => ({
      id: `${task.id}:${note.id}`,
      activity: getRowName(task.row),
      objective: task.objective,
      note: note.text,
    })),
  };
}

function getStandupDidEntries(rangeStart, rangeEnd) {
  return [
    ...getStandupTasksSince(rangeStart, rangeEnd),
    ...getReportedStandupNotes(),
  ].sort((a, b) => a.row - b.row || a.sortTime - b.sortTime || a.order - b.order);
}

function getReportedStandupNotes() {
  return getSortedTasks()
    .flatMap((task) => task.finishNotes
      .filter((note) => note.reported)
      .map((note) => ({
        id: `${task.id}:${note.id}`,
        type: "reported-note",
        row: task.row,
        order: task.order,
        objective: task.objective,
        activity: getRowName(task.row),
        note: note.text,
        sortTime: new Date(note.createdAt || task.createdAt || Date.now()).getTime(),
      })));
}

function getStandupTasksSince(rangeStart, rangeEnd) {
  return getSortedTasks()
    .map((task) => createStandupRangeTaskEntry(task, rangeStart, rangeEnd))
    .filter((entry) => entry.durationMs > 0)
    .sort((a, b) => a.sortTime - b.sortTime || a.row - b.row || a.order - b.order);
}

function createStandupRangeTaskEntry(task, rangeStart, rangeEnd) {
  const logEntries = task.logs
    .map((log) => ({
      durationMs: getStandupLogDurationWithinRange(log, rangeStart, rangeEnd),
      sortTime: getStandupLogSortTime(log, rangeStart),
    }))
    .filter((entry) => entry.durationMs > 0);

  const durationMs = logEntries.reduce((total, entry) => total + entry.durationMs, 0);
  const firstLogTime = logEntries.reduce((earliest, entry) => Math.min(earliest, entry.sortTime), Number.POSITIVE_INFINITY);

  return {
    ...createStandupTaskEntry(task),
    durationMs,
    isFinished: isTaskFinishedForReport(task),
    sortTime: firstLogTime,
  };
}

function getStandupLogDurationWithinRange(log, rangeStart, rangeEnd) {
  if (log.manual) {
    const createdAt = new Date(log.createdAt || Date.now());
    return createdAt >= rangeStart && createdAt < rangeEnd ? log.durationMs : 0;
  }

  return getLogDurationWithinRange(log, rangeStart, rangeEnd);
}

function getStandupLogSortTime(log, rangeStart) {
  if (log.manual) {
    return new Date(log.createdAt || rangeStart).getTime();
  }

  if (!log.start) {
    return rangeStart.getTime();
  }

  return Math.max(new Date(log.start).getTime(), rangeStart.getTime());
}

function createStandupTaskEntry(task) {
  return {
    id: task.id,
    row: task.row,
    order: task.order,
    objective: task.objective,
    activity: getRowName(task.row),
    bucket: task.bucket,
    durationMs: getTaskElapsed(task),
    urgent: task.urgent,
  };
}

function formatStandupGroupedCompletedTask(entry) {
  if (entry.type === "reported-note") {
    return entry.note;
  }

  return `${entry.objective} - ${formatDuration(entry.durationMs)}${entry.isFinished ? " - Finished" : ""}`;
}

function formatStandupTodayTask(entry) {
  return `${entry.urgent ? "[Urgent] " : ""}${entry.objective} (${entry.activity})`;
}

function formatStandupBlocker(entry) {
  return `${entry.activity} / ${entry.objective}: ${entry.note}`;
}

function getStandupRangeStart() {
  return parseStandupDate(getLastStandupDateValue()) || startOfToday();
}

function getLastStandupDateValue() {
  return sanitizeStandupDate(standupLastDate) || getDefaultLastStandupDate();
}

function getDefaultLastStandupDate() {
  const date = startOfToday();
  date.setDate(date.getDate() - 1);
  return formatFileDate(date);
}

function sanitizeStandupDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  return parseStandupDate(value) ? value : "";
}

function parseStandupDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const date = new Date(yearNumber, monthNumber - 1, dayNumber, 0, 0, 0, 0);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== yearNumber
    || date.getMonth() !== monthNumber - 1
    || date.getDate() !== dayNumber
  ) {
    return null;
  }

  return date;
}

function openReportDialog() {
  renderReportPreview();
  elements.reportEmailInput.value = "";
  elements.deleteAfterReportInput.checked = true;
  setCopyReportStatus("");
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
  const totalMs = getReportTotalMs(report);
  getBucketsByTotal(report.totals).forEach((bucket) => {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = bucket;
    detail.textContent = `${formatDuration(report.totals[bucket])} (${formatPercentage(report.totals[bucket], totalMs)})`;
    totals.append(term, detail);
  });

  const goalHeading = document.createElement("h4");
  goalHeading.textContent = "Activities";
  const goalList = document.createElement("ul");
  if (report.goals.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No time logged.";
    goalList.appendChild(item);
  } else {
    const goalTotalMs = getReportGoalTotalMs(report);
    report.goals.forEach((entry) => {
      const item = document.createElement("li");

      const summary = document.createElement("span");
      summary.textContent = `${entry.label} - ${formatDuration(entry.durationMs)} (${formatPercentage(entry.durationMs, goalTotalMs)})`;
      item.appendChild(summary);

      if (entry.objectives.length > 0) {
        const nestedList = document.createElement("ul");
        nestedList.className = "report-nested-list";
        entry.objectives.forEach((objective) => {
          const objectiveItem = document.createElement("li");
          const objectiveSummary = document.createElement("span");
          objectiveSummary.textContent = formatReportObjectiveSummary(objective);
          objectiveItem.appendChild(objectiveSummary);

          if (objective.notes.length > 0) {
            const noteList = document.createElement("ul");
            noteList.className = "report-note-list";
            objective.notes.forEach((note) => {
              const noteItem = document.createElement("li");
              noteItem.textContent = note;
              noteList.appendChild(noteItem);
            });
            objectiveItem.appendChild(noteList);
          }

          nestedList.appendChild(objectiveItem);
        });
        item.appendChild(nestedList);
      }

      goalList.appendChild(item);
    });
  }

  const timelineHeading = document.createElement("h4");
  timelineHeading.textContent = "Timeline";
  const timelineList = document.createElement("ul");
  timelineList.className = "report-timeline-list";
  if (report.timeline.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No time logged.";
    timelineList.appendChild(item);
  } else {
    renderReportTimelinePreview(timelineList, report.timeline);
  }

  elements.reportPreview.append(heading, summaryHeading, totals, goalHeading, goalList, timelineHeading, timelineList);

  const exportHeading = document.createElement("h4");
  exportHeading.textContent = "Exported Data";
  const exportData = document.createElement("pre");
  exportData.className = "report-export-data";
  exportData.textContent = JSON.stringify(report.exportedData, null, 2);
  elements.reportPreview.append(exportHeading, exportData);
}

function renderReportTimelinePreview(list, entries) {
  let currentDayKey = "";
  const daySummaries = getTimelineDaySummaries(entries);

  entries.forEach((entry) => {
    const dayKey = getTimelineEntryDayKey(entry);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      const separator = document.createElement("li");
      separator.className = "report-day-separator";
      const dayLabel = document.createElement("strong");
      dayLabel.textContent = formatTimelineDay(entry);
      const bucketBreakdown = document.createElement("span");
      bucketBreakdown.className = "report-day-buckets";
      bucketBreakdown.textContent = formatTimelineDaySummary(daySummaries.get(dayKey));
      separator.append(dayLabel, bucketBreakdown);
      list.appendChild(separator);
    }

    const item = document.createElement("li");
    item.textContent = formatTimelineEntry(entry);
    list.appendChild(item);
  });
}

function downloadReportFromDialog(event) {
  event.preventDefault();

  const report = buildReport();
  const reportText = buildReportText(report);
  const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getReportFileName(report);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  closeDialog(elements.reportDialog);

  if (elements.deleteAfterReportInput.checked) {
    deleteTimeLogsAndCompletedTasks();
  }
}

function emailReportFromDialog() {
  if (elements.reportEmailInput.value && !elements.reportEmailInput.checkValidity()) {
    elements.reportEmailInput.reportValidity();
    return;
  }

  const recipient = elements.reportEmailInput.value.trim();
  const report = buildReport();
  const subject = `Timekeeper Aggregated Report - ${report.startDate} to ${report.endDate}`;
  const body = buildReportText(report);
  const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  window.location.href = mailtoUrl;
}

async function copyReportFromDialog() {
  const reportText = buildReportText(buildReport());
  const originalText = elements.copyReportButton.textContent;
  elements.copyReportButton.textContent = "Copying";
  elements.copyReportButton.disabled = true;
  setCopyReportStatus("");

  try {
    await copyTextToClipboard(reportText);
    elements.copyReportButton.textContent = "Copied";
    setCopyReportStatus("Copied to clipboard.");
  } catch (error) {
    elements.copyReportButton.textContent = "Copy failed";
    setCopyReportStatus("Copy failed.");
  }

  window.setTimeout(() => {
    if (!elements.copyReportButton.isConnected) {
      return;
    }

    elements.copyReportButton.textContent = originalText;
    elements.copyReportButton.disabled = false;
    setCopyReportStatus("");
  }, 1800);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall back to the selection-based path below.
    }
  }

  copyTextWithFallback(text);
}

function copyTextWithFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  const copyHost = elements.reportDialog.open
    ? elements.reportDialog
    : elements.standupSummaryDialog?.open
      ? elements.standupSummaryDialog
      : document.body;
  copyHost.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function setCopyReportStatus(message) {
  elements.copyReportStatus.textContent = message;
  elements.copyReportStatus.hidden = !message;
}

function buildReport(options = {}) {
  const reportEnd = getReportBoundaryDate(options.end, new Date());
  const reportStart = getReportBoundaryDate(options.start, null) || getAggregatedReportStart(reportEnd);
  const totals = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]));
  const goalTotals = new Map();
  const goalObjectives = new Map();
  const timeline = [];

  getSortedTasks().forEach((task) => {
    const logEntries = task.logs
      .map((log) => createReportLogEntry(log, task, reportStart, reportEnd))
      .filter(Boolean);
    const durationMs = logEntries.reduce((total, log) => total + log.durationMs, 0);

    totals[task.bucket] += durationMs;
    const currentGoalMs = goalTotals.get(task.row) || 0;
    goalTotals.set(task.row, currentGoalMs + durationMs);
    timeline.push(...logEntries);
    if (shouldIncludeReportObjective(task, durationMs)) {
      const objectives = goalObjectives.get(task.row) || [];
      objectives.push({
        objective: task.objective,
        bucket: task.bucket,
        durationMs,
        wasUrgent: wasTaskEverUrgent(task),
        isFinished: isTaskFinishedForReport(task),
        notes: getTaskReportNotes(task),
        logs: logEntries,
      });
      goalObjectives.set(task.row, objectives);
    }
  });

  const goals = buildGoalReportEntries(goalTotals, goalObjectives);
  return {
    rangeLabel: `${formatDateTime(reportStart)} - ${formatDateTime(reportEnd)}`,
    startDate: formatFileDate(reportStart),
    endDate: formatFileDate(reportEnd),
    totals,
    totalMs: BUCKETS.reduce((total, bucket) => total + totals[bucket], 0),
    goals,
    goalTotalMs: goals.reduce((total, goal) => total + goal.durationMs, 0),
    timeline: timeline.sort((a, b) => a.sortTime - b.sortTime),
    exportedData: createExportPayload(reportEnd),
  };
}

function buildTodayReport() {
  return buildReport({ start: startOfToday(), end: new Date() });
}

function getReportBoundaryDate(value, fallback) {
  if (!value) {
    return fallback;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getAggregatedReportStart(reportEnd = new Date()) {
  const endTime = reportEnd.getTime();
  const logTimes = state.tasks
    .flatMap((task) => task.logs.map(getLogReportStartTime))
    .filter((time) => Number.isFinite(time) && time <= endTime);

  if (logTimes.length === 0) {
    return startOfToday();
  }

  return new Date(Math.min(...logTimes));
}

function getLogReportStartTime(log) {
  if (log.manual) {
    return new Date(log.createdAt || Date.now()).getTime();
  }

  if (log.start) {
    return new Date(log.start).getTime();
  }

  return new Date(log.createdAt || Date.now()).getTime();
}

function buildGoalReportEntries(goalTotals, goalObjectives) {
  return state.rows
    .map((goal, rowIndex) => ({
      rowIndex,
      label: getRowName(rowIndex),
      durationMs: goalTotals.get(rowIndex) || 0,
      hasUrgent: state.tasks.some((task) => task.row === rowIndex && task.urgent),
      hasRunning: state.tasks.some((task) => task.row === rowIndex && isTaskRunning(task)),
      objectives: goalObjectives.get(rowIndex) || [],
    }))
    .filter((entry) => entry.durationMs > 0 || entry.hasUrgent || entry.hasRunning || entry.objectives.length > 0)
    .sort((a, b) => b.durationMs - a.durationMs || a.rowIndex - b.rowIndex);
}

function shouldIncludeReportObjective(task, durationMs) {
  return durationMs > 0 || task.logs.length === 0;
}

function buildReportText(report = buildReport()) {
  const lines = [
    "# Timekeeper Aggregated Report",
    `Date range: ${report.rangeLabel}`,
    "",
    "# Summary",
  ];

  const totalMs = getReportTotalMs(report);
  getBucketsByTotal(report.totals).forEach((bucket) => {
    lines.push(`- ${bucket} - ${formatDuration(report.totals[bucket])} (${formatPercentage(report.totals[bucket], totalMs)})`);
  });

  lines.push("", "# Activities");

  if (report.goals.length === 0) {
    lines.push("No time logged.");
  } else {
    const goalTotalMs = getReportGoalTotalMs(report);
    report.goals.forEach((goal) => {
      lines.push(`## ${goal.label} - ${formatDuration(goal.durationMs)} (${formatPercentage(goal.durationMs, goalTotalMs)})`);
      goal.objectives.forEach((objective) => {
        lines.push(`- ${formatReportObjectiveSummary(objective)}`);
        objective.notes.forEach((note) => {
          lines.push(`  - ${note}`);
        });
      });
    });
  }

  lines.push("", "# Timeline");

  if (report.timeline.length === 0) {
    lines.push("No time logged.");
  } else {
    appendReportTimelineText(lines, report.timeline);
  }

  lines.push("", "# Exported Data", "```json", JSON.stringify(report.exportedData, null, 2), "```");

  return `${lines.join("\n")}\n`;
}

function appendReportTimelineText(lines, entries) {
  let currentDayKey = "";
  const daySummaries = getTimelineDaySummaries(entries);

  entries.forEach((entry) => {
    const dayKey = getTimelineEntryDayKey(entry);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      lines.push(`## ${formatTimelineDay(entry)}`);
      lines.push(formatTimelineDaySummary(daySummaries.get(dayKey)));
    }

    lines.push(`- ${formatTimelineEntry(entry)}`);
  });
}

function getReportFileName(report) {
  return `timekeeper-report-${report.startDate}-to-${report.endDate}.md`;
}

function normalizeBoard() {
  ensureRowsForTasks();
  const rows = getRows();
  rows.forEach((row, rowIndex) => {
    row.forEach((task, orderIndex) => {
      task.row = rowIndex;
      task.order = orderIndex;
    });
  });
}

function ensureRowsForTasks() {
  const maxTaskRow = state.tasks.reduce((max, task) => Math.max(max, task.row), -1);
  for (let rowIndex = state.rows.length; rowIndex <= maxTaskRow; rowIndex += 1) {
    state.rows.push(createRow(`Activity ${rowIndex + 1}`));
  }
}

function ensureRowIndex(rowIndex) {
  for (let index = state.rows.length; index <= rowIndex; index += 1) {
    state.rows.push(createRow(`Activity ${index + 1}`));
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

function findLog(taskId, logId) {
  return findTask(taskId)?.logs.find((log) => log.id === logId);
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

function getRowElapsed(rowIndex) {
  const now = new Date();
  return state.tasks
    .filter((task) => task.row === rowIndex)
    .reduce((total, task) => total + task.logs.reduce((taskTotal, log) => taskTotal + getLogDuration(log, now), 0), 0);
}

function getLogDuration(log, now = new Date()) {
  if (log.manual) {
    return log.durationMs;
  }

  if (!log.start) {
    return 0;
  }

  if (log.end) {
    return Math.max(0, new Date(log.end).getTime() - new Date(log.start).getTime());
  }

  return Math.max(0, now.getTime() - new Date(log.start).getTime());
}

function formatLogLabel(log) {
  const duration = formatDuration(getLogDuration(log));
  if (log.manual) {
    return `Manually added at ${formatDateTime(log.createdAt || new Date())} - ${duration}`;
  }

  const start = log.start ? formatDateTime(log.start) : "No start";
  const end = log.end ? formatDateTime(log.end) : "Running";
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
    activity: getRowName(task.row),
    bucket: task.bucket,
    wasUrgent: wasTaskEverUrgent(task),
    isFinished: isTaskFinishedForReport(task),
    start: logWindow.start,
    end: logWindow.end,
    sortTime: logWindow.sortTime,
    notes: getTaskReportNotes(task),
    label: formatReportLogLabel(log, durationMs, reportStart, reportEnd),
  };
}

function getTaskReportNotes(task) {
  return Array.isArray(task.finishNotes)
    ? task.finishNotes
      .filter((note) => note.text)
      .map((note) => `${note.flagged ? "[Flagged] " : ""}${note.text}`)
    : [];
}

function getReportTotalMs(report) {
  if (Number.isFinite(report.totalMs)) {
    return report.totalMs;
  }

  return BUCKETS.reduce((total, bucket) => total + (report.totals[bucket] || 0), 0);
}

function getReportGoalTotalMs(report) {
  if (Number.isFinite(report.goalTotalMs)) {
    return report.goalTotalMs;
  }

  return Array.isArray(report.goals)
    ? report.goals.reduce((total, goal) => total + (goal.durationMs || 0), 0)
    : 0;
}

function wasTaskEverUrgent(task) {
  return task.wasUrgent === true || task.urgent === true;
}

function isTaskFinishedForReport(task) {
  return task.status === "finished" || Boolean(task.finishedAt);
}

function formatUrgentReportLabel(entry) {
  return entry.wasUrgent ? " [Marked urgent]" : "";
}

function formatFinishedReportLabel(entry) {
  return entry.isFinished ? " finished" : "";
}

function formatReportObjectiveSummary(objective) {
  return `${objective.objective}${formatUrgentReportLabel(objective)} (${objective.bucket}) - ${formatDuration(objective.durationMs)}${formatFinishedReportLabel(objective)}`;
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
  const logEnd = log.end ? new Date(log.end) : reportEnd;
  const overlapStart = Math.max(logStart.getTime(), reportStart.getTime());
  const overlapEnd = Math.min(logEnd.getTime(), reportEnd.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

function formatReportLogLabel(log, durationMs, reportStart, reportEnd) {
  const duration = formatDuration(durationMs);
  if (log.manual) {
    const createdAt = formatDateTime(log.createdAt || reportStart);
    return `${createdAt} - Manually added (${duration})`;
  }

  const start = new Date(Math.max(new Date(log.start).getTime(), reportStart.getTime()));
  const sourceEnd = log.end ? new Date(log.end) : reportEnd;
  const end = new Date(Math.min(sourceEnd.getTime(), reportEnd.getTime()));
  return `${formatDateTime(start)} - ${log.end ? formatDateTime(end) : "Running"} (${duration})`;
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
  const sourceEnd = log.end ? new Date(log.end) : reportEnd;
  const end = new Date(Math.min(sourceEnd.getTime(), reportEnd.getTime()));
  return {
    start,
    end: log.end ? end : null,
    sortTime: start.getTime(),
  };
}

function formatTimelineEntry(entry) {
  const timeRange = entry.start
    ? `${formatDateTime(entry.start)} - ${entry.end ? formatDateTime(entry.end) : "Running"}`
    : entry.label;
  const activity = `${entry.activity || "Activity"} (${formatDuration(entry.durationMs)})`;
  return `${timeRange} | ${activity} | ${entry.objective}${formatUrgentReportLabel(entry)}`;
}

function getTimelineEntryDayKey(entry) {
  return formatFileDate(new Date(entry.sortTime));
}

function getTimelineDaySummaries(entries) {
  return entries.reduce((summaries, entry) => {
    const dayKey = getTimelineEntryDayKey(entry);
    const summary = summaries.get(dayKey) || {
      totals: Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0])),
      totalMs: 0,
    };
    summary.totals[entry.bucket] = (summary.totals[entry.bucket] || 0) + entry.durationMs;
    summary.totalMs += entry.durationMs;
    summaries.set(dayKey, summary);
    return summaries;
  }, new Map());
}

function formatBucketBreakdown(summary) {
  if (!summary || summary.totalMs <= 0) {
    return "No time logged.";
  }

  return getBucketsByTotal(summary.totals)
    .filter((bucket) => summary.totals[bucket] > 0)
    .map((bucket) => `${bucket}: ${formatDuration(summary.totals[bucket])} (${formatPercentage(summary.totals[bucket], summary.totalMs)})`)
    .join("; ");
}

function formatTimelineDaySummary(summary) {
  if (!summary || summary.totalMs <= 0) {
    return "Total: 0h 00m 00s; Bucket breakdown: No time logged.";
  }

  return `Total: ${formatDuration(summary.totalMs)}; Bucket breakdown: ${formatBucketBreakdown(summary)}`;
}

function formatTimelineDay(entry) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(entry.sortTime));
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
  document.querySelectorAll("[data-row-subtotal-index]").forEach((element) => {
    const rowIndex = Number(element.dataset.rowSubtotalIndex);
    if (Number.isInteger(rowIndex)) {
      element.textContent = formatDuration(getRowElapsed(rowIndex));
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
  const report = buildTodayReport();
  const totalMs = BUCKETS.reduce((total, bucket) => total + report.totals[bucket], 0);
  const workMs = BUCKETS
    .filter((bucket) => bucket !== "Personal")
    .reduce((total, bucket) => total + report.totals[bucket], 0);
  elements.todayTotalTime.textContent = formatDuration(totalMs);
  elements.todayWorkTime.textContent = formatDuration(workMs);
  BUCKETS.forEach((bucket) => {
    elements.bucketTotalElements[bucket].textContent = formatDuration(report.totals[bucket]);
  });
  renderBucketTotals(report.totals);
  renderGoalTotals(getActivityPaneGoals(report.goals));
  updateTimeGoal(totalMs);
}

function getBucketsByTotal(totals) {
  return [...BUCKETS].sort((a, b) => (totals[b] || 0) - (totals[a] || 0) || BUCKETS.indexOf(a) - BUCKETS.indexOf(b));
}

function getActivityPaneGoals(reportGoals) {
  const reportGoalsByRow = new Map(reportGoals.map((goal) => [goal.rowIndex, goal]));
  return state.rows.map((_, rowIndex) => {
    const reportGoal = reportGoalsByRow.get(rowIndex);
    return {
      rowIndex,
      label: getRowName(rowIndex),
      durationMs: reportGoal?.durationMs || 0,
      hasUrgent: state.tasks.some((task) => task.row === rowIndex && task.urgent),
      hasRunning: state.tasks.some((task) => task.row === rowIndex && isTaskRunning(task)),
      objectives: reportGoal?.objectives || [],
    };
  });
}

function renderBucketTotals(totals) {
  getBucketsByTotal(totals).forEach((bucket) => {
    const tile = elements.bucketTotalElements[bucket].closest("[data-bucket]");
    if (tile) {
      elements.todayTotals.appendChild(tile);
    }
  });
}

function updateUrgentIndicator() {
  const urgentCount = state.tasks.filter((task) => task.urgent).length;
  elements.urgentIndicator.hidden = urgentCount === 0;
  const label = urgentCount === 1 ? "1 urgent task" : `${urgentCount} urgent tasks`;
  elements.urgentIndicatorText.textContent = label;
  elements.urgentIndicator.setAttribute("aria-label", `${label}. Open urgent tasks.`);
}

function updateStickyCountPills() {
  const unfinishedTaskCount = getUnfinishedTasks().length;
  const label = `${unfinishedTaskCount} unfinished task${unfinishedTaskCount === 1 ? "" : "s"}`;
  elements.unfinishedTaskCountPill.textContent = label;
  elements.unfinishedTaskCountPill.setAttribute("aria-label", `${label}. Open unfinished tasks quick view.`);
}

function updateFlaggedNotesButton() {
  const flaggedCount = getFlaggedNotes().length;
  const count = document.createElement("span");
  count.textContent = String(flaggedCount);

  const label = document.createElement("span");
  label.textContent = `flagged note${flaggedCount === 1 ? "" : "s"}`;

  const flag = document.createElement("span");
  flag.className = "urgent-flag flagged-notes-icon";
  flag.setAttribute("aria-hidden", "true");

  elements.flaggedNotesButton.replaceChildren(flag, count, label);
  elements.flaggedNotesButton.setAttribute("aria-label", `${flaggedCount} flagged note${flaggedCount === 1 ? "" : "s"}. Open flagged notes.`);
}

function renderGoalTotals(goals) {
  elements.goalTotals.innerHTML = "";

  if (goals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "goal-totals-empty";
    empty.textContent = "No activities yet.";
    elements.goalTotals.appendChild(empty);
    return;
  }

  goals.forEach((goal) => {
    const item = document.createElement("button");
    item.className = "goal-total-item";
    item.classList.toggle("is-active", goal.hasRunning);
    item.classList.toggle("is-urgent", goal.hasUrgent);
    item.dataset.action = "scroll-to-row";
    item.dataset.rowIndex = String(goal.rowIndex);
    item.type = "button";

    const label = document.createElement("span");
    label.textContent = goal.label;

    const total = document.createElement("strong");
    total.textContent = formatDuration(goal.durationMs);

    item.append(label, total);
    elements.goalTotals.appendChild(item);
  });
}

function scrollToRow(rowIndex) {
  if (!Number.isInteger(rowIndex)) {
    return;
  }

  const row = document.querySelector(`.task-row[data-row-index="${rowIndex}"]`);
  if (!row) {
    return;
  }

  const stickyOffset = getStickyGoalPanelOffset();
  const targetTop = row.getBoundingClientRect().top + window.scrollY - stickyOffset;
  window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });

  window.setTimeout(() => {
    keepRowBelowStickyGoalPanel(row);
  }, 350);
}

function scrollToTask(taskId) {
  const task = findTask(taskId);
  if (!task) {
    return;
  }

  const card = [...document.querySelectorAll(".task-card")]
    .find((candidate) => candidate.dataset.taskId === taskId);
  if (!card) {
    scrollToRow(task.row);
    return;
  }

  const row = card.closest(".task-row");
  const stickyOffset = getStickyGoalPanelOffset();
  const targetTop = card.getBoundingClientRect().top + window.scrollY - stickyOffset;
  window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });

  const track = card.closest(".task-track");
  if (track) {
    const targetLeft = card.offsetLeft - ((track.clientWidth - card.offsetWidth) / 2);
    track.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }

  if (row) {
    window.setTimeout(() => {
      keepRowBelowStickyGoalPanel(row);
    }, 350);
  }
}

function getStickyGoalPanelOffset() {
  const stickyPanel = document.querySelector(".goal-sticky-panel");
  if (!stickyPanel) {
    return 24;
  }

  const panelStyles = window.getComputedStyle(stickyPanel);
  const stickyTop = Number.parseFloat(panelStyles.top) || 0;
  const panelHeight = stickyPanel.getBoundingClientRect().height;
  return stickyTop + panelHeight + 16;
}

function keepRowBelowStickyGoalPanel(row) {
  if (!row.isConnected) {
    return;
  }

  const desiredTop = getStickyGoalPanelOffset();
  const overlap = desiredTop - row.getBoundingClientRect().top;
  if (overlap > 1) {
    window.scrollBy({ top: -overlap, behavior: "smooth" });
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateScrollTopButton() {
  elements.scrollTopButton.hidden = window.scrollY <= 0;
}

function getTodayTotalMs() {
  const report = buildTodayReport();
  return BUCKETS.reduce((total, bucket) => total + report.totals[bucket], 0);
}

function updateTimeGoal(totalMs) {
  if (state.timeGoalMs <= 0) {
    elements.timeGoalRemaining.textContent = "No target set";
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

function formatPercentage(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }

  return `${((part / total) * 100).toFixed(1).replace(/\.0$/, "")}%`;
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
  if (!dialog) {
    return;
  }

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
  if (!dialog) {
    return;
  }

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
