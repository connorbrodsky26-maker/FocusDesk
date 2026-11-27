// ============================================================================
// SUPABASE & EDGE FUNCTION CONFIGURATION
// Paste your Supabase project URL, publishable key, and Edge Function URL below.
// ============================================================================
const SUPABASE_URL = "https://cqxmccjeyhrsepyptjaz.supabase.co/rest/v1/";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0v85eYnFjEypiz6x-CjUww_gewKB9bd";
const EDGE_FUNCTION_URL = "https://cqxmccjeyhrsepyptjaz.supabase.co/functions/v1/super-responder";

// Normalize URL if the /rest/v1/ suffix is present (supabase-js appends /rest/v1 & /auth/v1 automatically)
const SUPABASE_BASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabase = createClient(SUPABASE_BASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage
  }
});

// ============================================================================
// CONSTANTS & LOCAL-FIRST STORAGE KEYS
// ============================================================================
const STORAGE_KEYS = {
  TASKS: "focusdeck_tasks_v1",
  PILLARS: "focusdeck_pillars_v1",
  USER_SETTINGS: "focusdeck_user_settings_v2",
  DINING_PREFIX: "focusdeck_dining_v2_",
  USER_EMAIL: "focusdeck_user_email",
  USER_ID: "focusdeck_user_id"
};

const COURSE_PRESETS = ["MA 26100", "CHM 11510", "ENGR 13100", "SLCA 10100", "Personal"];
const DINING_COURTS = ["Wiley", "Ford", "Earhart", "Windsor", "Hillenbrand", "Off-Campus"];
const DAY_LABELS = { 0: "Su", 1: "M", 2: "T", 3: "W", 4: "Th", 5: "F", 6: "Sa" };
const DAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_FALLBACK_DINING_INTERVALS = [
  { start: 420, end: 600, label: "Breakfast" },
  { start: 660, end: 840, label: "Lunch" },
  { start: 1020, end: 1200, label: "Dinner" }
];

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  user: null,
  tasks: [],
  pillars: [],
  userSettings: null,
  diningCache: {}, // { "YYYY-MM-DD": { courts: { Wiley: [{start,end,label}] }, isFallback: boolean, fetchedAt: number } }
  diningFetching: new Set(),

  activeTab: "focus", // "focus" | "plan"
  planDayOffset: 0, // -1 (Yesterday) .. +6
  reflowAnchorDateKey: null,
  reflowAnchorMin: null,
  latestSevenDayPlan: null,
  highlightOverflow: false,
  dismissedOverloadSig: null,
  moveRunSourceOffset: null,

  undoStack: [],
  redoStack: [],
  bypassBreakGapKey: null,
  syncStatus: "synced", // "synced" | "syncing" | "offline" | "error"
  pendingWrites: 0,
  plannedSyncTimer: null,
  plannedSyncVersion: 0,
  lastPlannedEventsSig: null,
  isAnimatingCard: false,
  editingTaskId: null,
  deleteConfirmArmed: false,
  editingPillarId: null,
  pendingLatePlan: null,
  carouselRafId: null,
  carouselCenteredIndex: 0
};

// ============================================================================
// DOM REFERENCES
// ============================================================================
const dom = {
  authView: document.getElementById("auth-view"),
  authForm: document.getElementById("auth-form"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authError: document.getElementById("auth-error"),
  authSubmitBtn: document.getElementById("auth-submit-btn"),

  appView: document.getElementById("app-view"),
  syncDotBtn: document.getElementById("sync-dot-btn"),
  syncDot: document.getElementById("sync-dot"),
  btnAllTasks: document.getElementById("btn-all-tasks"),
  allTasksCount: document.getElementById("all-tasks-count"),
  btnSettings: document.getElementById("btn-settings"),

  // Tabs
  tabFocusPanel: document.getElementById("tab-focus-panel"),
  tabPlanPanel: document.getElementById("tab-plan-panel"),
  tabBtnFocus: document.getElementById("tab-btn-focus"),
  tabBtnPlan: document.getElementById("tab-btn-plan"),

  // Focus Tab
  contextPill: document.getElementById("context-pill"),
  contextPillText: document.getElementById("context-pill-text"),
  mealsStrip: document.getElementById("meals-strip"),
  btnOpenMealsSheet: document.getElementById("btn-open-meals-sheet"),
  mealsSummaryText: document.getElementById("meals-summary-text"),
  focusCardSlot: document.getElementById("focus-card-slot"),
  btnUndo: document.getElementById("btn-undo"),
  btnRedo: document.getElementById("btn-redo"),
  btnFabGcalSync: document.getElementById("btn-fab-gcal-sync"),
  btnAddFab: document.getElementById("btn-add-fab"),
  btnPlanGcalSync: document.getElementById("btn-plan-gcal-sync"),
  btnPlanAddFab: document.getElementById("btn-plan-add-fab"),

  // Today's Meals Bottom Sheet
  mealsModal: document.getElementById("meals-modal"),
  btnMealsModalClose: document.getElementById("btn-meals-modal-close"),
  btnMealsModalDone: document.getElementById("btn-meals-modal-done"),
  mealsSheetCountGroup: document.getElementById("meals-sheet-count-group"),
  meal1CourtPills: document.getElementById("meal-1-court-pills"),
  meal2CourtPills: document.getElementById("meal-2-court-pills"),
  meal3CourtPills: document.getElementById("meal-3-court-pills"),
  meal3SheetGroup: document.getElementById("meal-3-sheet-group"),

  // Day Plan Tab
  btnPlanPrev: document.getElementById("btn-plan-prev"),
  btnPlanDayLabel: document.getElementById("btn-plan-day-label"),
  btnPlanNext: document.getElementById("btn-plan-next"),
  btnReflowNow: document.getElementById("btn-reflow-now"),
  planSleepBanner: document.getElementById("plan-sleep-banner"),
  planTimelineScroll: document.getElementById("plan-timeline-scroll"),
  planTimelineList: document.getElementById("plan-timeline-list"),

  // Carousel Overlay
  carouselView: document.getElementById("carousel-view"),
  carouselCounter: document.getElementById("carousel-counter"),
  btnCarouselAdd: document.getElementById("btn-carousel-add"),
  btnCarouselClose: document.getElementById("btn-carousel-close"),
  carouselStage: document.getElementById("carousel-stage"),
  carouselTrack: document.getElementById("carousel-track"),
  carouselHint: document.getElementById("carousel-hint"),
  carouselEmpty: document.getElementById("carousel-empty"),

  // Settings Overlay
  settingsView: document.getElementById("settings-view"),
  btnSettingsClose: document.getElementById("btn-settings-close"),
  btnGcalSyncNow: document.getElementById("btn-gcal-sync-now"),
  gcalSyncStatus: document.getElementById("gcal-sync-status"),
  settingsIcsUrl: document.getElementById("settings-ics-url"),
  btnCopyIcs: document.getElementById("btn-copy-ics"),
  mealsSettingsForm: document.getElementById("meals-settings-form"),
  setMeal1Start: document.getElementById("set-meal1-start"),
  setMeal1End: document.getElementById("set-meal1-end"),
  setMeal2Start: document.getElementById("set-meal2-start"),
  setMeal2End: document.getElementById("set-meal2-end"),
  setMeal3Start: document.getElementById("set-meal3-start"),
  setMeal3End: document.getElementById("set-meal3-end"),
  wellnessSettingsForm: document.getElementById("wellness-settings-form"),
  setPrefSleep: document.getElementById("set-pref-sleep"),
  setMinSleep: document.getElementById("set-min-sleep"),
  setEveningShower: document.getElementById("set-evening-shower"),
  setNoClassWake: document.getElementById("set-noclass-wake"),
  setRunsPerWeek: document.getElementById("set-runs-per-week"),
  settingsRunDays: document.getElementById("settings-run-days"),
  wellnessFormError: document.getElementById("wellness-form-error"),

  pillarsList: document.getElementById("pillars-list"),
  pillarForm: document.getElementById("pillar-form"),
  pillarFormTitle: document.getElementById("pillar-form-title"),
  btnPillarCancel: document.getElementById("btn-pillar-cancel"),
  pillarNameInput: document.getElementById("pillar-name-input"),
  pillarCoursePills: document.getElementById("pillar-course-pills"),
  pillarDayPills: document.getElementById("pillar-day-pills"),
  pillarStartInput: document.getElementById("pillar-start-input"),
  pillarEndInput: document.getElementById("pillar-end-input"),
  pillarBufferPills: document.getElementById("pillar-buffer-pills"),
  pillarFormError: document.getElementById("pillar-form-error"),
  btnPillarSubmit: document.getElementById("btn-pillar-submit"),
  settingsUserEmail: document.getElementById("settings-user-email"),
  btnSyncNow: document.getElementById("btn-sync-now"),
  btnSignOut: document.getElementById("btn-sign-out"),

  // Task Modal
  taskModal: document.getElementById("task-modal"),
  taskModalTitle: document.getElementById("task-modal-title"),
  btnTaskModalClose: document.getElementById("btn-task-modal-close"),
  taskForm: document.getElementById("task-form"),
  taskTitleInput: document.getElementById("task-title-input"),
  taskCoursePills: document.getElementById("task-course-pills"),
  taskDuePills: document.getElementById("task-due-pills"),
  taskDatePickerWrap: document.getElementById("task-date-picker-wrap"),
  taskDateInput: document.getElementById("task-date-input"),
  taskFixedPlanCard: document.getElementById("task-fixed-plan-card"),
  taskFixedTimeToggle: document.getElementById("task-fixed-time-toggle"),
  taskFixedStartWrap: document.getElementById("task-fixed-start-wrap"),
  taskFixedStartTime: document.getElementById("task-fixed-start-time"),
  taskSpecificTimeRow: document.getElementById("task-specific-time-row"),
  taskSpecificTimeToggle: document.getElementById("task-specific-time-toggle"),
  taskTimeInput: document.getElementById("task-time-input"),
  taskDurationPills: document.getElementById("task-duration-pills"),
  taskCustomDuration: document.getElementById("task-custom-duration"),
  taskAllAtOnceCard: document.getElementById("task-all-at-once-card"),
  taskAllAtOnce: document.getElementById("task-all-at-once"),
  taskIsStarred: document.getElementById("task-is-starred"),
  taskFormError: document.getElementById("task-form-error"),
  btnDeleteTask: document.getElementById("btn-delete-task"),
  btnTaskSave: document.getElementById("btn-task-save"),

  // Late Warning Modal
  lateModal: document.getElementById("late-modal"),
  lateModalMessage: document.getElementById("late-modal-message"),
  btnLateCancel: document.getElementById("btn-late-cancel"),
  btnLateProceed: document.getElementById("btn-late-proceed"),

  // Protect Your Sleep Alert Modal
  sleepAlertModal: document.getElementById("sleep-alert-modal"),
  sleepAlertMessage: document.getElementById("sleep-alert-message"),
  btnSleepViewOverflow: document.getElementById("btn-sleep-view-overflow"),
  btnSleepGotIt: document.getElementById("btn-sleep-got-it"),

  // Move Run Modal
  moveRunModal: document.getElementById("move-run-modal"),
  moveRunDaysList: document.getElementById("move-run-days-list"),
  btnMoveRunCancel: document.getElementById("btn-move-run-cancel"),

  toast: document.getElementById("toast")
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function generateUUID() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addLocalDays(date, offsetDays) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays, 0, 0, 0, 0);
}

function parseHHMM(str) {
  if (typeof str === "number" && Number.isFinite(str)) return str;
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();

  // Support "11:30 AM" / "2:15 PM"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const meridiem = ampmMatch[3].toUpperCase();
    if (meridiem === "PM" && h < 12) h += 12;
    if (meridiem === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }

  // Support ISO timestamps like "2026-11-26T11:30:00"
  if (trimmed.includes("T")) {
    const dt = new Date(trimmed);
    if (!Number.isNaN(dt.getTime())) {
      return dt.getHours() * 60 + dt.getMinutes();
    }
  }

  // Standard "HH:MM" or "HH:MM:SS"
  const parts = trimmed.split(":").map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0] : 0;
  const m = Number.isFinite(parts[1]) ? parts[1] : 0;
  return h * 60 + m;
}

function formatMinuteOfDay(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(mins)} ${suffix}`;
}

function formatHHMM12h(hhmm) {
  return formatMinuteOfDay(parseHHMM(hhmm));
}

function formatDuration(minutes) {
  const m = Math.max(1, Math.round(Number(minutes) || 30));
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

function formatSleepHoursLabel(hours) {
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded.toFixed(1)}h`;
}

function formatHoursAndMins(totalMinutes) {
  const m = Math.max(0, Math.round(totalMinutes));
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

function dateFromDayAndMinute(dayDate, minuteOfDay) {
  return new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    0,
    Math.round(minuteOfDay),
    0,
    0
  );
}

function isTaskOverdue(task, now = new Date()) {
  if (!task || !task.due_at) return false;
  return now.getTime() > new Date(task.due_at).getTime();
}

function formatTime12hFromDate(date) {
  const h24 = date.getHours();
  const mins = date.getMinutes();
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(mins)} ${suffix}`;
}

function formatDueLabel(dueIso, now = new Date()) {
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return "No due date";

  const todayKey = toLocalDateKey(now);
  const tomorrowKey = toLocalDateKey(addLocalDays(now, 1));
  const yesterdayKey = toLocalDateKey(addLocalDays(now, -1));
  const dueKey = toLocalDateKey(due);

  const isDefaultEndOfDay = due.getHours() === 23 && due.getMinutes() === 59;
  const timeStr = formatTime12hFromDate(due);

  if (dueKey === todayKey) return `Due Today ${timeStr}`;
  if (dueKey === tomorrowKey) return isDefaultEndOfDay ? "Due Tomorrow" : `Due Tomorrow ${timeStr}`;
  if (dueKey === yesterdayKey) return isDefaultEndOfDay ? "Due Yesterday" : `Due Yesterday ${timeStr}`;

  const sameYear = due.getFullYear() === now.getFullYear();
  const datePart = due.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" })
  });

  return isDefaultEndOfDay ? `Due ${datePart}` : `Due ${datePart}, ${timeStr}`;
}

function formatLateWarningDue(dueIso, now = new Date()) {
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return "soon";
  const todayKey = toLocalDateKey(now);
  const tomorrowKey = toLocalDateKey(addLocalDays(now, 1));
  const dueKey = toLocalDateKey(due);
  const timeStr = formatTime12hFromDate(due);

  if (dueKey === todayKey) return `Today at ${timeStr}`;
  if (dueKey === tomorrowKey) return `Tomorrow at ${timeStr}`;
  const datePart = due.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  return `${datePart} at ${timeStr}`;
}

function buildDueIsoFromInputs(dateKey, useSpecificTime, timeHHMM) {
  const [y, m, d] = dateKey.split("-").map(Number);
  let hours = 23;
  let minutes = 59;
  if (useSpecificTime && timeHHMM && timeHHMM.includes(":")) {
    const [h, min] = timeHHMM.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(min)) {
      hours = h;
      minutes = min;
    }
  }
  return new Date(y, m - 1, d, hours, minutes, 0, 0).toISOString();
}

let toastTimer = null;
function showToast(message, durationMs = 2600) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.hidden = true;
  }, durationMs);
}

// ============================================================================
// USER SETTINGS & NORMALIZATION
// ============================================================================
function createDefaultUserSettings(userId = null) {
  return {
    user_id: userId,
    ics_token: generateUUID(),
    meals_per_day: 2,
    meal_1_court: "Wiley",
    meal_2_court: "Ford",
    meal_3_court: "Earhart",
    meal_1_window_start: "10:30",
    meal_1_window_end: "14:30",
    meal_2_window_start: "16:30",
    meal_2_window_end: "20:30",
    meal_3_window_start: "19:30",
    meal_3_window_end: "22:00",
    preferred_sleep_hours: 8.0,
    min_sleep_hours: 7.0,
    evening_shower_minutes: 40,
    no_class_wake_time: "08:30",
    runs_per_week: 2,
    preferred_run_days: [3, 6]
  };
}

function normalizeUserSettings(row, userId = null) {
  const defaults = createDefaultUserSettings(userId);
  const src = row || {};
  const validCourt = (val, fallback) => (DINING_COURTS.includes(val) ? val : fallback);
  const prefSleep = Number.isFinite(Number(src.preferred_sleep_hours))
    ? Math.max(5, Math.min(12, Number(src.preferred_sleep_hours)))
    : defaults.preferred_sleep_hours;
  const minSleep = Number.isFinite(Number(src.min_sleep_hours))
    ? Math.max(4, Math.min(prefSleep, Number(src.min_sleep_hours)))
    : Math.min(prefSleep, defaults.min_sleep_hours);

  return {
    user_id: src.user_id || userId || defaults.user_id,
    ics_token: src.ics_token || defaults.ics_token,
    meals_per_day: Number(src.meals_per_day) === 3 ? 3 : 2,
    meal_1_court: validCourt(src.meal_1_court, defaults.meal_1_court),
    meal_2_court: validCourt(src.meal_2_court, defaults.meal_2_court),
    meal_3_court: validCourt(src.meal_3_court, defaults.meal_3_court),
    meal_1_window_start: src.meal_1_window_start || defaults.meal_1_window_start,
    meal_1_window_end: src.meal_1_window_end || defaults.meal_1_window_end,
    meal_2_window_start: src.meal_2_window_start || defaults.meal_2_window_start,
    meal_2_window_end: src.meal_2_window_end || defaults.meal_2_window_end,
    meal_3_window_start: src.meal_3_window_start || defaults.meal_3_window_start,
    meal_3_window_end: src.meal_3_window_end || defaults.meal_3_window_end,
    preferred_sleep_hours: prefSleep,
    min_sleep_hours: minSleep,
    evening_shower_minutes: Number.isFinite(Number(src.evening_shower_minutes))
      ? Math.max(0, Math.min(120, Math.round(Number(src.evening_shower_minutes))))
      : defaults.evening_shower_minutes,
    no_class_wake_time: src.no_class_wake_time || defaults.no_class_wake_time,
    runs_per_week: Number.isFinite(Number(src.runs_per_week))
      ? Math.max(0, Math.min(7, Math.round(Number(src.runs_per_week))))
      : defaults.runs_per_week,
    preferred_run_days: Array.isArray(src.preferred_run_days)
      ? [...new Set(src.preferred_run_days.map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
      : defaults.preferred_run_days
  };
}

function getSettings() {
  if (!state.userSettings) {
    state.userSettings = createDefaultUserSettings(state.user?.id || null);
  }
  return state.userSettings;
}

function getNextRoundedHalfHourHHMM(now = new Date()) {
  const totalMin = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil((totalMin + 1) / 30) * 30;
  const clamped = Math.min(23 * 60 + 30, rounded);
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

function isFixedPersonalPlan(task) {
  return Boolean(task && task.is_fixed_time && String(task.course || "").toLowerCase() === "personal");
}

function normalizeTask(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || "",
    course: row.course || "Personal",
    due_at: row.due_at || new Date().toISOString(),
    duration_minutes: Math.max(1, Number(row.duration_minutes) || 30),
    all_at_once: Boolean(row.all_at_once),
    is_starred: Boolean(row.is_starred),
    is_fixed_time: Boolean(row.is_fixed_time),
    status: row.status === "completed" ? "completed" : "active",
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at || new Date().toISOString()
  };
}

function normalizePillar(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name || "",
    days_of_week: Array.isArray(row.days_of_week) ? row.days_of_week.map(Number).sort((a, b) => a - b) : [],
    start_time: row.start_time || "09:00",
    end_time: row.end_time || "10:00",
    walk_buffer_minutes: Number.isFinite(Number(row.walk_buffer_minutes)) ? Number(row.walk_buffer_minutes) : 15,
    created_at: row.created_at || new Date().toISOString()
  };
}

// ============================================================================
// LOCAL CACHE PERSISTENCE
// ============================================================================
function loadCacheFromStorage() {
  try {
    const rawTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
    const rawPillars = localStorage.getItem(STORAGE_KEYS.PILLARS);
    const rawSettings = localStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    state.tasks = rawTasks ? JSON.parse(rawTasks).map(normalizeTask) : [];
    state.pillars = rawPillars ? JSON.parse(rawPillars).map(normalizePillar) : [];

    const cachedEmail = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
    const cachedId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (cachedEmail && cachedId) {
      state.user = { id: cachedId, email: cachedEmail };
    }

    state.userSettings = normalizeUserSettings(rawSettings ? JSON.parse(rawSettings) : null, state.user?.id || null);

    // Hydrate cached dining hours for today & upcoming days
    const now = new Date();
    for (let offset = -1; offset <= 6; offset++) {
      const key = toLocalDateKey(addLocalDays(now, offset));
      const rawDining = localStorage.getItem(STORAGE_KEYS.DINING_PREFIX + key);
      if (rawDining) {
        state.diningCache[key] = JSON.parse(rawDining);
      }
    }
  } catch (_) {
    state.tasks = [];
    state.pillars = [];
    state.userSettings = createDefaultUserSettings(state.user?.id || null);
  }
}

function saveTasksToCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(state.tasks));
  } catch (_) {}
}

function savePillarsToCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.PILLARS, JSON.stringify(state.pillars));
  } catch (_) {}
}

function saveUserSettingsToCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(getSettings()));
  } catch (_) {}
}

function saveDiningToCache(dateKey, entry) {
  state.diningCache[dateKey] = entry;
  try {
    localStorage.setItem(STORAGE_KEYS.DINING_PREFIX + dateKey, JSON.stringify(entry));
  } catch (_) {}
}

function saveUserToCache(user) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.USER_EMAIL, user.email || "");
      localStorage.setItem(STORAGE_KEYS.USER_ID, user.id || "");
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
    }
  } catch (_) {}
}

function clearAllCache() {
  try {
    localStorage.removeItem(STORAGE_KEYS.TASKS);
    localStorage.removeItem(STORAGE_KEYS.PILLARS);
    localStorage.removeItem(STORAGE_KEYS.USER_SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
  } catch (_) {}
}

// ============================================================================
// PURDUE DINING COURT LIVE HOURS (EDGE FUNCTION + CACHE)
// ============================================================================
function matchDiningCourtName(rawName) {
  if (!rawName) return null;
  const lower = String(rawName).toLowerCase();
  for (const court of DINING_COURTS) {
    if (court === "Off-Campus") continue;
    if (lower.includes(court.toLowerCase())) return court;
  }
  return null;
}

function extractIntervalsFromCourtNode(node) {
  const intervals = [];
  if (!node) return intervals;

  const pushInterval = (startRaw, endRaw, label = "") => {
    if (startRaw == null || endRaw == null) return;
    const start = parseHHMM(startRaw);
    const end = parseHHMM(endRaw);
    if (end > start && start >= 0 && end <= 1440) {
      intervals.push({ start, end, label: label || "Open" });
    }
  };

  // Array of meals / interval objects
  if (Array.isArray(node)) {
    for (const item of node) {
      if (!item || typeof item !== "object") continue;
      if (item.Status && String(item.Status).toLowerCase() === "closed") continue;
      if (item.status && String(item.status).toLowerCase() === "closed") continue;
      if (item.is_open === false || item.open === false) continue;

      if (item.Hours && typeof item.Hours === "object") {
        pushInterval(item.Hours.StartTime || item.Hours.start_time || item.Hours.start, item.Hours.EndTime || item.Hours.end_time || item.Hours.end, item.Name || item.name);
      } else if (item.hours && typeof item.hours === "object" && !Array.isArray(item.hours)) {
        pushInterval(item.hours.StartTime || item.hours.start_time || item.hours.start, item.hours.EndTime || item.hours.end_time || item.hours.end, item.Name || item.name);
      } else {
        pushInterval(
          item.start ?? item.start_time ?? item.StartTime ?? item.open ?? item.open_time,
          item.end ?? item.end_time ?? item.EndTime ?? item.close ?? item.close_time,
          item.name ?? item.Name ?? item.meal ?? item.label
        );
      }
    }
  } else if (typeof node === "object") {
    if (Array.isArray(node.Meals)) return extractIntervalsFromCourtNode(node.Meals);
    if (Array.isArray(node.meals)) return extractIntervalsFromCourtNode(node.meals);
    if (Array.isArray(node.hours)) return extractIntervalsFromCourtNode(node.hours);
    if (Array.isArray(node.intervals)) return extractIntervalsFromCourtNode(node.intervals);
    if (Array.isArray(node.windows)) return extractIntervalsFromCourtNode(node.windows);
    pushInterval(
      node.start ?? node.start_time ?? node.StartTime ?? node.open,
      node.end ?? node.end_time ?? node.EndTime ?? node.close,
      node.name || "Open"
    );
  }

  intervals.sort((a, b) => a.start - b.start);
  return intervals;
}

function normalizeDiningPayload(payload) {
  const courts = {};
  if (!payload) return { courts, isFallback: true };

  // Unwrap wrapper keys if present
  const root = payload.courts || payload.locations || payload.Location || payload.dining || payload.data || payload;

  if (Array.isArray(root)) {
    for (const loc of root) {
      const courtName = matchDiningCourtName(loc?.Name || loc?.name || loc?.court || loc?.location || loc?.id);
      if (!courtName) continue;
      courts[courtName] = extractIntervalsFromCourtNode(loc);
    }
  } else if (root && typeof root === "object") {
    for (const [k, v] of Object.entries(root)) {
      const courtName = matchDiningCourtName(k);
      if (!courtName) continue;
      courts[courtName] = extractIntervalsFromCourtNode(v);
    }
  }

  const hasAnyCourt = Object.keys(courts).length > 0;
  return { courts, isFallback: !hasAnyCourt };
}

function getCourtOpenIntervals(court, dateKey) {
  if (court === "Off-Campus") {
    return {
      intervals: [{ start: 0, end: 1440, label: "Off-Campus" }],
      isLive: true,
      isOffCampus: true
    };
  }

  const cached = state.diningCache[dateKey];
  if (cached && cached.courts && Object.prototype.hasOwnProperty.call(cached.courts, court)) {
    return {
      intervals: cached.courts[court] || [],
      isLive: !cached.isFallback,
      isOffCampus: false
    };
  }

  return {
    intervals: DEFAULT_FALLBACK_DINING_INTERVALS,
    isLive: false,
    isOffCampus: false
  };
}

async function fetchDiningHoursForDate(dateKey, forceRefresh = false) {
  const cached = state.diningCache[dateKey];
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  if (!forceRefresh && cached && !cached.isFallback && Date.now() - (cached.fetchedAt || 0) < SIX_HOURS) {
    return cached;
  }
  if (state.diningFetching.has(dateKey) || !navigator.onLine) return cached || null;

  state.diningFetching.add(dateKey);
  try {
    const url = `${EDGE_FUNCTION_URL}?action=dining&date=${encodeURIComponent(dateKey)}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const normalized = normalizeDiningPayload(payload);
    const entry = {
      courts: normalized.courts,
      isFallback: normalized.isFallback,
      fetchedAt: Date.now()
    };
    saveDiningToCache(dateKey, entry);

    // Recalculate plan & refresh Day Plan if visible
    recomputePlanAndRender({ scheduleSync: true });
    return entry;
  } catch (err) {
    console.warn(`Purdue Dining hours fetch fallback for ${dateKey}:`, err);
    return cached || null;
  } finally {
    state.diningFetching.delete(dateKey);
  }
}

// ============================================================================
// SYNC STATUS INDICATOR & SUPABASE PERSISTENCE
// ============================================================================
function setSyncStatus(status, customTitle) {
  state.syncStatus = status;
  dom.syncDot.className = `sync-dot is-${status}`;
  const labels = {
    synced: "Synced with Supabase",
    syncing: "Syncing...",
    offline: "Offline — changes kept locally",
    error: "Sync issue — tap to retry"
  };
  const label = customTitle || labels[status] || "Synced";
  dom.syncDotBtn.title = label;
  dom.syncDotBtn.setAttribute("aria-label", `Sync status: ${label}`);
}

async function runSupabaseWrite(operationFn) {
  if (!state.user) return;
  if (!navigator.onLine) {
    setSyncStatus("offline");
    return;
  }

  state.pendingWrites += 1;
  setSyncStatus("syncing");
  try {
    const { error } = await operationFn();
    if (error) throw error;
    state.pendingWrites = Math.max(0, state.pendingWrites - 1);
    if (state.pendingWrites === 0) {
      setSyncStatus("synced");
    }
  } catch (err) {
    state.pendingWrites = Math.max(0, state.pendingWrites - 1);
    console.error("Supabase sync write failed:", err);
    setSyncStatus(navigator.onLine ? "error" : "offline");
    showToast("Saved locally — sync will retry");
  }
}

async function ensureAndLoadUserSettings() {
  if (!state.user) return;
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    state.userSettings = normalizeUserSettings(data, state.user.id);
    saveUserSettingsToCache();
    return;
  }

  // Create default row on first login
  const defaultRow = createDefaultUserSettings(state.user.id);
  const insertRes = await supabase
    .from("user_settings")
    .insert(defaultRow)
    .select()
    .single();

  if (insertRes.error) {
    // Handle race condition if another tab created it simultaneously
    const retry = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", state.user.id)
      .maybeSingle();
    state.userSettings = normalizeUserSettings(retry.data || defaultRow, state.user.id);
  } else {
    state.userSettings = normalizeUserSettings(insertRes.data || defaultRow, state.user.id);
  }
  saveUserSettingsToCache();
}

async function saveUserSettings(patch, { silentToast = false } = {}) {
  const next = normalizeUserSettings({ ...getSettings(), ...patch }, state.user?.id || null);
  state.userSettings = next;
  saveUserSettingsToCache();

  syncMealsStripUI();
  recomputePlanAndRender({ scheduleSync: true });
  if (!dom.settingsView.hidden) {
    populateSettingsUI();
  }

  if (state.user) {
    await runSupabaseWrite(() =>
      supabase.from("user_settings").upsert(next, { onConflict: "user_id" })
    );
  }

  if (!silentToast) {
    showToast("Settings saved");
  }
}

function schedulePlannedEventsSync() {
  if (!state.user) return;
  clearTimeout(state.plannedSyncTimer);
  state.plannedSyncTimer = setTimeout(() => {
    syncPlannedEventsToSupabase();
  }, 1100);
}

function buildPlannedEventsRows(plan, userId) {
  const rows = [];
  if (!plan || !userId) return rows;

  const allowedTypes = new Set(["personal", "meal", "run", "study", "shower"]);

  for (let offset = 0; offset <= 6; offset++) {
    const dayPlan = plan.days[offset];
    if (!dayPlan) continue;

    // 1. Point-in-time Wake Up milestone (start_at === end_at)
    const wakeIso = dateFromDayAndMinute(dayPlan.date, dayPlan.wakeMin).toISOString();
    rows.push({
      user_id: userId,
      event_type: "wake",
      title: "Wake Up",
      location: "",
      notes: "",
      start_at: wakeIso,
      end_at: wakeIso
    });

    // 2. Scheduled non-class blocks: personal (including Personal study tasks for green color), meal, run, study, shower
    for (const block of dayPlan.blocks) {
      if (!allowedTypes.has(block.eventType)) continue;
      const exportedType = block.eventType === "study" && block.isPersonal ? "personal" : block.eventType;
      const isTaskBlock = block.eventType === "study" || block.eventType === "personal";
      rows.push({
        user_id: userId,
        event_type: exportedType,
        title: block.icsTitle || block.title,
        location: isTaskBlock ? "" : (block.location || ""),
        notes: block.notes || "",
        start_at: dateFromDayAndMinute(dayPlan.date, block.startMin).toISOString(),
        end_at: dateFromDayAndMinute(dayPlan.date, block.endMin).toISOString()
      });
    }

    // 3. Point-in-time Bedtime milestone (start_at === end_at, event_type: "sleep" keeps 15m pre-bed alert)
    const bedIso = dateFromDayAndMinute(dayPlan.date, dayPlan.actualBedMin).toISOString();
    rows.push({
      user_id: userId,
      event_type: "sleep",
      title: `Bedtime (${formatSleepHoursLabel(dayPlan.actualSleepHours)} sleep)`,
      location: "",
      notes: `Wake at ${formatMinuteOfDay(dayPlan.tomorrowWakeMin)} tomorrow`,
      start_at: bedIso,
      end_at: bedIso
    });
  }

  return rows;
}

function computePlannedEventsSignature(rows) {
  return JSON.stringify(rows.map((r) => [r.event_type, r.title, r.start_at, r.end_at]));
}

function setGcalStatus(text, tone = "") {
  if (!dom.gcalSyncStatus) return;
  dom.gcalSyncStatus.textContent = text;
  dom.gcalSyncStatus.className = `gcal-status-line${tone ? " " + tone : ""}`;
}

async function triggerGoogleCalendarSync({ showFeedback = false, horizonStart = null } = {}) {
  if (!state.user || !navigator.onLine) {
    if (showFeedback) showToast("Offline — cannot sync Google Calendar");
    return;
  }

  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return;

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Indiana/Indianapolis";
    const startOfTodayIso = horizonStart || addLocalDays(new Date(), 0).toISOString();
    setGcalStatus("Syncing to Google Calendar...");

    const res = await fetch(`${EDGE_FUNCTION_URL}?action=gcal_sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ timeZone, horizonStart: startOfTodayIso })
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.error) {
      throw new Error(payload.error || `HTTP ${res.status}`);
    }

    if (payload.configured === false) {
      setGcalStatus("Add Google secrets in Supabase to enable instant sync", "is-warn");
      if (showFeedback) showToast("Google Calendar secrets not set yet");
      return;
    }

    const nowStr = formatTime12hFromDate(new Date());
    setGcalStatus(`Synced at ${nowStr} (${payload.created ?? 0} new, ${payload.deleted ?? 0} removed)`, "is-ok");
    if (showFeedback) {
      showToast("Google Calendar updated!");
    }
  } catch (err) {
    console.warn("Google Calendar push sync skipped/failed:", err);
    setGcalStatus("Google Calendar sync needs setup or retry", "is-warn");
    if (showFeedback) {
      showToast(`Google sync error: ${err?.message || "Check Edge Function"}`);
    }
  }
}

async function syncPlannedEventsToSupabase({ forceGcal = false } = {}) {
  if (!state.user || !navigator.onLine || !state.latestSevenDayPlan) return;

  const now = new Date();
  const startOfToday = addLocalDays(now, 0);
  const horizonStartIso = startOfToday.toISOString();

  const rows = buildPlannedEventsRows(state.latestSevenDayPlan, state.user.id);
  const nextSig = computePlannedEventsSignature(rows);

  // Avoid redundant planned_events delete/insert writes on app resume when nothing changed
  if (!forceGcal && nextSig === state.lastPlannedEventsSig) {
    return;
  }

  const myVersion = ++state.plannedSyncVersion;
  let writeSucceeded = false;

  await runSupabaseWrite(async () => {
    if (myVersion !== state.plannedSyncVersion) return { error: null };

    // Replace ALL of this user's planned_events rows so no stale past/old rows ever linger
    const delRes = await supabase
      .from("planned_events")
      .delete()
      .eq("user_id", state.user.id);

    if (delRes.error) return { error: delRes.error };
    if (myVersion !== state.plannedSyncVersion) return { error: null };

    if (rows.length > 0) {
      const insRes = await supabase.from("planned_events").insert(rows);
      if (insRes.error) return { error: insRes.error };
    }

    state.lastPlannedEventsSig = nextSig;
    writeSucceeded = true;
    return { error: null };
  });

  // Immediately push changes to Google Calendar (instant iPhone Calendar sync!)
  if (writeSucceeded && myVersion === state.plannedSyncVersion) {
    await triggerGoogleCalendarSync({ showFeedback: forceGcal, horizonStart: horizonStartIso });
  }
}

async function syncFromSupabase(showFeedback = false) {
  if (!state.user) return;
  if (!navigator.onLine) {
    setSyncStatus("offline");
    if (showFeedback) showToast("Offline — showing cached data");
    return;
  }

  setSyncStatus("syncing");
  try {
    const [tasksRes, pillarsRes] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: true }),
      supabase.from("class_pillars").select("*").order("start_time", { ascending: true }),
      ensureAndLoadUserSettings()
    ]);

    if (tasksRes.error) throw tasksRes.error;
    if (pillarsRes.error) throw pillarsRes.error;

    state.tasks = (tasksRes.data || []).map(normalizeTask);
    state.pillars = (pillarsRes.data || []).map(normalizePillar);
    saveTasksToCache();
    savePillarsToCache();

    setSyncStatus("synced");
    syncMealsStripUI();
    recomputePlanAndRender({ scheduleSync: true });

    // Fetch live Purdue dining hours for today & tomorrow in background
    const now = new Date();
    fetchDiningHoursForDate(toLocalDateKey(now));
    fetchDiningHoursForDate(toLocalDateKey(addLocalDays(now, 1)));

    if (showFeedback) showToast("Synced with Supabase");
  } catch (err) {
    console.error("Supabase sync read failed:", err);
    setSyncStatus(navigator.onLine ? "error" : "offline");
    if (showFeedback) showToast("Could not reach Supabase");
  }
}

// ============================================================================
// V1 SMART SORTING & BETWEEN-CLASS "GAP-FIT OVERRIDE" ENGINE
// Note: is_starred is strictly visual and NEVER influences task ordering.
// ============================================================================
function getActiveGapContext(pillars, now = new Date(), tasks = state.tasks) {
  const todayDow = now.getDay(); // 0=Sun ... 6=Sat
  const todayKey = toLocalDateKey(now);
  const nowExactMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const upcoming = [];
  for (const pillar of pillars) {
    if (!Array.isArray(pillar.days_of_week) || !pillar.days_of_week.includes(todayDow)) {
      continue;
    }
    const startMin = parseHHMM(pillar.start_time);
    const buffer = Number.isFinite(pillar.walk_buffer_minutes) ? pillar.walk_buffer_minutes : 15;
    const walkOutMin = startMin - buffer;
    if (nowExactMin < walkOutMin) {
      upcoming.push({ pillar, walkOutMin, startMin, kind: "class" });
    }
  }

  // Also include today's upcoming fixed-time personal plans (10m transition buffer)
  for (const task of tasks || []) {
    if (task.status !== "active" || !isFixedPersonalPlan(task)) continue;
    const dueDate = new Date(task.due_at);
    if (Number.isNaN(dueDate.getTime()) || toLocalDateKey(dueDate) !== todayKey) continue;
    const startMin = dueDate.getHours() * 60 + dueDate.getMinutes();
    const walkOutMin = startMin - 10;
    if (nowExactMin < walkOutMin) {
      upcoming.push({
        pillar: {
          id: task.id,
          name: task.title,
          start_time: `${pad2(dueDate.getHours())}:${pad2(dueDate.getMinutes())}`
        },
        walkOutMin,
        startMin,
        kind: "personal"
      });
    }
  }

  upcoming.sort((a, b) => a.walkOutMin - b.walkOutMin);

  if (upcoming.length > 0) {
    const next = upcoming[0];
    const availableMinutes = Math.ceil(next.walkOutMin - nowExactMin);
    if (availableMinutes > 0 && availableMinutes <= 120) {
      return {
        isGap: true,
        availableMinutes,
        pillar: next.pillar,
        kind: next.kind,
        walkOutMin: next.walkOutMin,
        gapKey: `${todayKey}_${next.kind}_${next.pillar.id}_${next.pillar.start_time}`
      };
    }
  }

  return { isGap: false, availableMinutes: null, pillar: null, kind: null, gapKey: null };
}

function getBucketKey(task, now = new Date()) {
  if (isTaskOverdue(task, now)) return "0000-OVERDUE";
  return toLocalDateKey(new Date(task.due_at));
}

function compareByDueAndCreated(a, b) {
  const dueDiff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  if (dueDiff !== 0) return dueDiff;
  const createdDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (createdDiff !== 0) return createdDiff;
  return String(a.id).localeCompare(String(b.id));
}

function sortBucketTasks(bucketTasks, { alternate = true } = {}) {
  const neg = [];
  const zero = [];
  const pos = [];

  for (const t of bucketTasks) {
    const order = Number(t.sort_order) || 0;
    if (order < 0) neg.push(t);
    else if (order > 0) pos.push(t);
    else zero.push(t);
  }

  const bySortOrder = (a, b) => {
    const diff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    return diff !== 0 ? diff : compareByDueAndCreated(a, b);
  };

  neg.sort(bySortOrder);
  pos.sort(bySortOrder);

  let orderedZero;
  if (alternate) {
    const shorts = zero.filter((t) => t.duration_minutes <= 30).sort(compareByDueAndCreated);
    const longs = zero.filter((t) => t.duration_minutes > 30).sort(compareByDueAndCreated);
    orderedZero = [];
    const maxLen = Math.max(shorts.length, longs.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < shorts.length) orderedZero.push(shorts[i]);
      if (i < longs.length) orderedZero.push(longs[i]);
    }
  } else {
    orderedZero = zero.slice().sort(compareByDueAndCreated);
  }

  return [...neg, ...orderedZero, ...pos];
}

function buildOrderedQueue(tasks, now = new Date(), { alternate = true } = {}) {
  const active = tasks.filter((t) => t.status === "active");
  const buckets = new Map();

  for (const task of active) {
    const key = getBucketKey(task, now);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(task);
  }

  const sortedKeys = Array.from(buckets.keys()).sort();
  const result = [];
  for (const key of sortedKeys) {
    result.push(...sortBucketTasks(buckets.get(key), { alternate }));
  }
  return result;
}

function computeFocusState(now = new Date()) {
  const allActiveTasks = state.tasks.filter((t) => t.status === "active");
  // Exclude fixed-time personal plans from hijacking the Focus study card stack (keep editable in Day Plan & All Tasks)
  const studyTasks = allActiveTasks.filter((t) => !isFixedPersonalPlan(t));
  const fixedPlans = allActiveTasks
    .filter((t) => isFixedPersonalPlan(t))
    .sort(compareByDueAndCreated);

  const gap = getActiveGapContext(state.pillars, now, allActiveTasks);
  const openQueue = buildOrderedQueue(studyTasks, now, { alternate: true });

  if (studyTasks.length === 0) {
    return {
      mode: "empty",
      gap,
      focusTask: null,
      sliceMinutes: null,
      carouselQueue: fixedPlans,
      activeCount: allActiveTasks.length
    };
  }

  const bypassBreak = gap.isGap && state.bypassBreakGapKey === gap.gapKey;

  if (gap.isGap && !bypassBreak) {
    const gapQueue = buildOrderedQueue(studyTasks, now, { alternate: false });

    const fitting = gapQueue.find((t) => t.duration_minutes <= gap.availableMinutes);
    if (fitting) {
      const carouselQueue = [fitting, ...openQueue.filter((t) => t.id !== fitting.id), ...fixedPlans];
      return {
        mode: "task",
        gap,
        focusTask: fitting,
        sliceMinutes: null,
        carouselQueue,
        activeCount: allActiveTasks.length
      };
    }

    const sliceable = gapQueue.find((t) => !t.all_at_once);
    if (sliceable) {
      const carouselQueue = [sliceable, ...openQueue.filter((t) => t.id !== sliceable.id), ...fixedPlans];
      return {
        mode: "task",
        gap,
        focusTask: sliceable,
        sliceMinutes: gap.availableMinutes,
        carouselQueue,
        activeCount: allActiveTasks.length
      };
    }

    return {
      mode: "break",
      gap,
      focusTask: null,
      sliceMinutes: null,
      carouselQueue: [...openQueue, ...fixedPlans],
      activeCount: allActiveTasks.length
    };
  }

  return {
    mode: "task",
    gap,
    focusTask: openQueue[0],
    sliceMinutes: null,
    carouselQueue: [...openQueue, ...fixedPlans],
    activeCount: allActiveTasks.length
  };
}

// ============================================================================
// V2 DYNAMIC WAKE-UP, SHOWERS, SLEEP, MEALS, RUNS & 7-DAY AUTO-PLANNER
// ============================================================================
function computeDynamicWakeInfo(dayDate, pillars, settings) {
  const dow = dayDate.getDay();
  const latestWakeMin = parseHHMM(settings.no_class_wake_time || "08:30");
  const dayClasses = pillars
    .filter((p) => Array.isArray(p.days_of_week) && p.days_of_week.includes(dow))
    .slice()
    .sort((a, b) => parseHHMM(a.start_time) - parseHHMM(b.start_time));

  if (dayClasses.length === 0) {
    return {
      wakeMin: latestWakeMin,
      needsPostClassShower: false,
      firstClass: null,
      dayClasses
    };
  }

  const firstClass = dayClasses[0];
  const firstStartMin = parseHHMM(firstClass.start_time);

  // If first class <= 07:45 (465), wake at 06:45 (405) & mandatory 20m post-class shower
  if (firstStartMin <= 465) {
    return {
      wakeMin: 405, // 06:45 AM
      needsPostClassShower: true,
      firstClass,
      dayClasses
    };
  }

  // First class > 07:45: wake 60m before class start, capped at latestWakeMin (e.g., 4:30 PM class still wakes at 8:30 AM)
  return {
    wakeMin: Math.min(latestWakeMin, Math.max(0, firstStartMin - 60)),
    needsPostClassShower: false,
    firstClass,
    dayClasses
  };
}

function mergeBusyIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .map(([s, e]) => [s, e])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return [];
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

function computeFreeGapsInRange(rangeStart, rangeEnd, busyIntervals) {
  if (rangeEnd <= rangeStart) return [];
  const merged = mergeBusyIntervals(busyIntervals);
  const gaps = [];
  let cursor = rangeStart;
  for (const [bStart, bEnd] of merged) {
    if (bEnd <= rangeStart) continue;
    if (bStart >= rangeEnd) break;
    if (bStart > cursor) {
      gaps.push([cursor, Math.min(bStart, rangeEnd)]);
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < rangeEnd) {
    gaps.push([cursor, rangeEnd]);
  }
  return gaps;
}

function hasOverlap(start, end, busyIntervals) {
  for (const [bStart, bEnd] of busyIntervals) {
    if (start < bEnd && end > bStart) return true;
  }
  return false;
}

function intersectIntervals(aStart, aEnd, listB) {
  const out = [];
  for (const b of listB) {
    const s = Math.max(aStart, b.start);
    const e = Math.min(aEnd, b.end);
    if (e > s) out.push({ start: s, end: e, courtStart: b.start, courtEnd: b.end, label: b.label });
  }
  out.sort((x, y) => x.start - y.start);
  return out;
}

function findMealSlot({
  mealIndex,
  court,
  winStart,
  winEnd,
  dateKey,
  effectiveStart,
  hardEnd,
  busyIntervals,
  prevMealEatEnd
}) {
  const walkMin = court === "Ford" ? 15 : 10;
  const eatMin = 30;
  const postMin = 10;

  // If user re-flowed past this meal's entire window, don't force an expired meal into the evening
  if (effectiveStart > winEnd - eatMin) {
    return null;
  }

  const courtInfo = getCourtOpenIntervals(court, dateKey);
  const intersections = intersectIntervals(winStart, winEnd, courtInfo.intervals);

  const searchInRanges = (ranges, minSpacing) => {
    for (const r of ranges) {
      const earliestEat = Math.max(
        r.start,
        effectiveStart + walkMin,
        prevMealEatEnd !== null ? prevMealEatEnd + minSpacing : 0
      );
      const latestEat = Math.min(r.end - eatMin, hardEnd - eatMin - postMin);
      for (let t = Math.ceil(earliestEat / 5) * 5; t <= latestEat; t += 5) {
        const blockStart = t - walkMin;
        const blockEnd = t + eatMin + postMin;
        if (!hasOverlap(blockStart, blockEnd, busyIntervals)) {
          return {
            eatStart: t,
            eatEnd: t + eatMin,
            walkStart: blockStart,
            postEnd: blockEnd,
            walkMin,
            postMin,
            court,
            courtStart: r.courtStart ?? r.start,
            courtEnd: r.courtEnd ?? r.end,
            isOffCampus: courtInfo.isOffCampus,
            usedFallbackWindow: false
          };
        }
      }
    }
    return null;
  };

  // Try live court open intersection with comfortable spacing first, then tighter spacing
  let slot = searchInRanges(intersections, 120) || searchInRanges(intersections, 60) || searchInRanges(intersections, 15);
  if (slot) return slot;

  // Fallback to user's window if court is closed or all open intervals clashed with classes
  const fallbackRanges = [{ start: winStart, end: winEnd, courtStart: winStart, courtEnd: winEnd }];
  slot = searchInRanges(fallbackRanges, 90) || searchInRanges(fallbackRanges, 15);
  if (slot) {
    slot.usedFallbackWindow = !courtInfo.isOffCampus;
    return slot;
  }

  return null;
}

function selectRunDaysForWeek(todayDate, pillars, tasks, settings) {
  const runsPerWeek = Math.max(0, Math.min(7, Math.round(Number(settings.runs_per_week) ?? 2)));
  if (runsPerWeek === 0) return new Set();

  const preferredSet = new Set(Array.isArray(settings.preferred_run_days) ? settings.preferred_run_days : [3, 6]);
  const activeTasks = tasks.filter((t) => t.status === "active");

  const dayScores = [];
  for (let offset = 0; offset <= 6; offset++) {
    const d = addLocalDays(todayDate, offset);
    const key = toLocalDateKey(d);
    const dow = d.getDay();

    const classMins = pillars
      .filter((p) => Array.isArray(p.days_of_week) && p.days_of_week.includes(dow))
      .reduce((acc, p) => acc + Math.max(0, parseHHMM(p.end_time) - parseHHMM(p.start_time) + (p.walk_buffer_minutes || 15)), 0);

    const taskMins = activeTasks
      .filter((t) => toLocalDateKey(new Date(t.due_at)) === key)
      .reduce((acc, t) => acc + (t.duration_minutes || 30), 0);

    dayScores.push({
      offset,
      dow,
      isPreferred: preferredSet.has(dow),
      load: classMins + taskMins
    });
  }

  const chosen = new Set();

  // First honor preferred_run_days (lightest first)
  const prefCandidates = dayScores.filter((x) => x.isPreferred).sort((a, b) => a.load - b.load || a.offset - b.offset);
  for (const c of prefCandidates) {
    if (chosen.size >= runsPerWeek) break;
    chosen.add(c.offset);
  }

  // Fill remaining runs on lightest class/task load days (preferring non-adjacent days when possible)
  if (chosen.size < runsPerWeek) {
    const rest = dayScores.filter((x) => !chosen.has(x.offset)).sort((a, b) => a.load - b.load || a.offset - b.offset);
    for (const c of rest) {
      if (chosen.size >= runsPerWeek) break;
      const adjacent = chosen.has(c.offset - 1) || chosen.has(c.offset + 1);
      if (!adjacent) chosen.add(c.offset);
    }
    for (const c of rest) {
      if (chosen.size >= runsPerWeek) break;
      chosen.add(c.offset);
    }
  }

  return chosen;
}

function findRunSlot(effectiveStart, preferredStudyEndMin, busyIntervals) {
  const RUN_TOTAL = 130; // 10m Prep + 60m Run + 60m Post-Run Cooldown & Shower
  const gaps = computeFreeGapsInRange(effectiveStart, preferredStudyEndMin, busyIntervals);
  const viable = gaps.filter(([s, e]) => e - s >= RUN_TOTAL);
  if (viable.length === 0) return null;

  // Prefer an afternoon slot (~15:00-17:30) or late morning (~10:00), otherwise first viable gap
  const targetPreferredStart = 930; // 3:30 PM
  let bestStart = null;
  let bestDist = Infinity;

  for (const [s, e] of viable) {
    const alignedMin = Math.ceil(s / 5) * 5;
    const latestStart = e - RUN_TOTAL;
    if (alignedMin > latestStart) continue;

    // Pick point inside [alignedMin, latestStart] closest to targetPreferredStart
    const candidate = Math.max(alignedMin, Math.min(latestStart, targetPreferredStart));
    const rounded = Math.round(candidate / 5) * 5;
    const clamped = Math.max(alignedMin, Math.min(latestStart, rounded));
    const dist = Math.abs(clamped - targetPreferredStart);
    if (dist < bestDist) {
      bestDist = dist;
      bestStart = clamped;
    }
  }

  return bestStart !== null ? { start: bestStart, end: bestStart + RUN_TOTAL } : null;
}

function computeSevenDayPlan(now = new Date(), { tasks = state.tasks, pillars = state.pillars, settings = getSettings() } = {}) {
  const todayDate = addLocalDays(now, 0);
  const todayKey = toLocalDateKey(todayDate);
  const nowRoundedUpMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5;

  // Use reflow anchor if active for today
  const todayReflowMin =
    state.reflowAnchorDateKey === todayKey && state.reflowAnchorMin !== null
      ? state.reflowAnchorMin
      : null;

  const runDayOffsets = selectRunDaysForWeek(todayDate, pillars, tasks, settings);

  // Separate fixed-time personal plans (hard immovable pillars) from auto-slotted study tasks
  const activeTasks = tasks.filter((t) => t.status === "active");
  const fixedPersonalPlans = activeTasks.filter((t) => isFixedPersonalPlan(t));
  const autoSlotTasks = activeTasks.filter((t) => !isFixedPersonalPlan(t));

  // Build ordered active task pool for slotting across Days 0..6
  const orderedActive = buildOrderedQueue(autoSlotTasks, now, { alternate: true });
  const taskPool = orderedActive.map((t) => {
    const dueDate = new Date(t.due_at);
    const exactDueKey = toLocalDateKey(dueDate);
    const isDefaultEndOfDay = dueDate.getHours() === 23 && dueDate.getMinutes() === 59;
    return {
      task: t,
      dueKey: getBucketKey(t, now) === "0000-OVERDUE" ? todayKey : exactDueKey,
      exactDueKey,
      dueMin: isDefaultEndOfDay ? null : dueDate.getHours() * 60 + dueDate.getMinutes(),
      remaining: Math.max(5, Math.round(t.duration_minutes || 30)),
      partCount: 0
    };
  });

  const days = {};

  // Build Yesterday (-1) as light context + Days 0..6 full auto-plan
  for (let offset = -1; offset <= 6; offset++) {
    const dayDate = addLocalDays(todayDate, offset);
    const dateKey = toLocalDateKey(dayDate);
    const wakeInfo = computeDynamicWakeInfo(dayDate, pillars, settings);
    const tomorrowWakeInfo = computeDynamicWakeInfo(addLocalDays(dayDate, 1), pillars, settings);

    const tomorrowWakeTimelineMin = 1440 + tomorrowWakeInfo.wakeMin;
    const prefSleepMin = Math.round((Number(settings.preferred_sleep_hours) || 8.0) * 60);
    const minSleepMin = Math.round((Number(settings.min_sleep_hours) || 7.0) * 60);
    const eveningShowerMin = Math.max(0, Math.round(Number(settings.evening_shower_minutes) ?? 40));

    const preferredBedMin = tomorrowWakeTimelineMin - prefSleepMin;
    const hardBedMin = tomorrowWakeTimelineMin - minSleepMin;
    const preferredStudyEndMin = preferredBedMin - eveningShowerMin;
    const hardStudyEndMin = hardBedMin - eveningShowerMin;

    const effectiveStart =
      offset === 0 && todayReflowMin !== null
        ? Math.max(wakeInfo.wakeMin, todayReflowMin)
        : wakeInfo.wakeMin;

    // Never schedule uncompleted study tasks in the past on Today
    const studyStartMin = offset === 0 ? Math.max(effectiveStart, nowRoundedUpMin) : effectiveStart;

    const blocks = [];
    const busyForFixed = []; // [start, end] occupied by classes/fixed personal/showers/meals/runs
    const busyForStudy = []; // includes breathing gaps after classes, fixed personal plans, & runs

    // 1. Classes + Walk Buffers (excluded from planned_events, marked In iPhone Cal)
    for (const pillar of wakeInfo.dayClasses) {
      const walkBuf = Number.isFinite(pillar.walk_buffer_minutes) ? pillar.walk_buffer_minutes : 15;
      const classStart = parseHHMM(pillar.start_time);
      const classEnd = parseHHMM(pillar.end_time);
      const walkStart = Math.max(0, classStart - walkBuf);

      blocks.push({
        eventType: "class",
        title: pillar.name,
        startMin: walkStart,
        endMin: classEnd,
        classStartMin: classStart,
        walkMin: walkBuf,
        meta: `${walkBuf}m walk (${formatMinuteOfDay(walkStart)}) + Class ${formatMinuteOfDay(classStart)}–${formatMinuteOfDay(classEnd)}`,
        badge: "In iPhone Cal"
      });

      busyForFixed.push([walkStart, classEnd]);
      busyForStudy.push([walkStart, classEnd + 15]); // 15m anti-fatigue gap after class
    }

    // 2. Mandatory 20m Post-Class Shower & Reset if first class <= 07:45
    if (wakeInfo.needsPostClassShower && wakeInfo.firstClass) {
      const firstEnd = parseHHMM(wakeInfo.firstClass.end_time);
      const showerEnd = firstEnd + 20;
      blocks.push({
        eventType: "shower",
        title: "Post-Class Shower & Reset",
        icsTitle: "Post-Class Shower & Reset",
        location: "",
        notes: "Mandatory 20m post-class shower after early morning class.",
        startMin: firstEnd,
        endMin: showerEnd,
        meta: "20m mandatory reset after early class"
      });
      busyForFixed.push([firstEnd, showerEnd]);
      busyForStudy.push([firstEnd, showerEnd + 10]);
    }

    // 2B. Hard, Immovable Fixed-Time Personal Plans (scheduled BEFORE meals, runs, and study tasks)
    const dayFixedPlans = fixedPersonalPlans
      .filter((t) => toLocalDateKey(new Date(t.due_at)) === dateKey)
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

    for (const planTask of dayFixedPlans) {
      const dueDate = new Date(planTask.due_at);
      const startMin = dueDate.getHours() * 60 + dueDate.getMinutes();
      const dur = Math.max(5, Math.round(planTask.duration_minutes || 30));
      const endMin = startMin + dur;

      blocks.push({
        eventType: "personal",
        taskId: planTask.id,
        task: planTask,
        isPersonal: true,
        isFixedTime: true,
        isStarred: Boolean(planTask.is_starred),
        title: planTask.title,
        icsTitle: planTask.title,
        location: "",
        notes: `Pinned personal plan (${formatDuration(dur)})`,
        startMin,
        endMin,
        durationMin: dur,
        meta: `${formatDuration(dur)} · Personal plan`,
        badge: "Pinned"
      });

      busyForFixed.push([startMin, endMin]);
      busyForStudy.push([startMin, endMin + 10]);
    }

    // 3. Meals (2 or 3 meals intersected with live Purdue Dining hours)
    const mealCount = settings.meals_per_day === 3 ? 3 : 2;
    let prevMealEatEnd = null;
    for (let m = 1; m <= mealCount; m++) {
      const court = settings[`meal_${m}_court`] || (m === 1 ? "Wiley" : m === 2 ? "Ford" : "Earhart");
      const winStart = parseHHMM(settings[`meal_${m}_window_start`]);
      const winEnd = parseHHMM(settings[`meal_${m}_window_end`]);

      const slot = findMealSlot({
        mealIndex: m,
        court,
        winStart,
        winEnd,
        dateKey,
        effectiveStart,
        hardEnd: preferredStudyEndMin,
        busyIntervals: busyForFixed,
        prevMealEatEnd
      });

      if (slot) {
        prevMealEatEnd = slot.eatEnd;
        const openWindowStr = slot.isOffCampus
          ? "Off-Campus"
          : slot.usedFallbackWindow
            ? `${court} closed in window · fallback`
            : `Open ${formatMinuteOfDay(slot.courtStart)}–${formatMinuteOfDay(slot.courtEnd)}`;

        blocks.push({
          eventType: "meal",
          mealIndex: m,
          court,
          title: `Meal ${m} · ${court}`,
          icsTitle: `Meal ${m} — ${court}`,
          location: court === "Off-Campus" ? "Off-Campus" : `${court} Dining Court`,
          notes: `${slot.walkMin}m walk + 30m meal + 10m transition (${openWindowStr})`,
          startMin: slot.walkStart,
          endMin: slot.eatEnd,
          postEndMin: slot.postEnd,
          meta: `${slot.walkMin}m walk + 30m meal + 10m reset`,
          badge: openWindowStr
        });

        busyForFixed.push([slot.walkStart, slot.postEnd]);
        busyForStudy.push([slot.walkStart, slot.postEnd]); // includes 10m post-meal transition
      }
    }

    // 4. Protected 130m Run Block split into actual 60m Run (+10m prep buffer before) & separate 60m Post-Run Shower
    let hasRun = false;
    if (offset >= 0 && runDayOffsets.has(offset)) {
      const runSlot = findRunSlot(effectiveStart, preferredStudyEndMin, busyForFixed);
      if (runSlot) {
        hasRun = true;
        const runStartMin = runSlot.start + 10; // 10m Run Prep buffer protected right before
        const runEndMin = runStartMin + 60;     // 60m actual running time
        const showerEndMin = runEndMin + 60;    // 60m separate post-run shower & cooldown

        blocks.push({
          eventType: "run",
          dayOffset: offset,
          title: "Run",
          icsTitle: "Run",
          location: "",
          notes: "60m Run (10m prep buffer reserved right before).",
          startMin: runStartMin,
          endMin: runEndMin,
          meta: "60m run · 10m prep buffer before"
        });

        blocks.push({
          eventType: "shower",
          title: "Post-Run Shower & Cooldown",
          icsTitle: "Post-Run Shower & Cooldown",
          location: "",
          notes: "60m post-run cooldown & shower.",
          startMin: runEndMin,
          endMin: showerEndMin,
          meta: "60m post-run cooldown & shower"
        });

        busyForFixed.push([runSlot.start, runSlot.end]);
        busyForStudy.push([runSlot.start, runSlot.end + 15]); // 15m breathing gap after cooldown
      }
    }

    // 5. Anti-Fatigue Study Task Slotting (Only for Today 0..6, not Yesterday -1)
    let sleepStatus = "optimal"; // "optimal" | "flexed" | "overload"
    let actualShowerStart = preferredStudyEndMin;
    let actualBedMin = preferredBedMin;
    const overflowTasks = [];
    let overflowMinutes = 0;

    if (offset >= 0) {
      const STUDY_GAP = 15; // Mandatory 15m anti-fatigue breathing room between consecutive study blocks

      const slotItemsIntoRange = (rangeStart, rangeEnd, itemFilter) => {
        let lastPlacedEnd = rangeStart;
        const gaps = computeFreeGapsInRange(rangeStart, rangeEnd, busyForStudy);

        for (const [gapStart, gapEnd] of gaps) {
          let cursor = Math.ceil(gapStart / 5) * 5;

          while (cursor < gapEnd) {
            const avail = gapEnd - cursor;
            if (avail < 15) break;

            // Gather eligible tasks and prefer earlier specific-due-time tasks due on this day before 23:59 tasks
            const eligible = taskPool.filter((item) => {
              if (item.remaining <= 0) return false;
              if (!itemFilter(item)) return false;
              if (item.task.all_at_once && item.remaining > avail) return false;
              if (!item.task.all_at_once && avail < Math.min(20, item.remaining)) return false;
              return true;
            });

            if (eligible.length === 0) break;

            let candidate = eligible[0];
            const specificDueToday = eligible
              .filter((item) => item.exactDueKey === dateKey && item.dueMin !== null)
              .sort((a, b) => a.dueMin - b.dueMin);
            if (specificDueToday.length > 0 && !isTaskOverdue(candidate.task, now)) {
              candidate = specificDueToday[0];
            }

            const chunk = candidate.task.all_at_once
              ? candidate.remaining
              : Math.min(candidate.remaining, avail);

            const blockStart = cursor;
            const blockEnd = cursor + chunk;
            candidate.remaining -= chunk;
            candidate.partCount += 1;

            const isSplit = candidate.remaining > 0 || candidate.partCount > 1;
            const isPersonal = candidate.task.course.toLowerCase() === "personal";
            const afterDueTime =
              candidate.exactDueKey === dateKey &&
              candidate.dueMin !== null &&
              blockEnd > candidate.dueMin;

            blocks.push({
              eventType: "study",
              taskId: candidate.task.id,
              task: candidate.task,
              isPersonal,
              isStarred: Boolean(candidate.task.is_starred),
              afterDueTime,
              title: isSplit ? `${candidate.task.title} (Part ${candidate.partCount})` : candidate.task.title,
              icsTitle: candidate.task.title,
              location: "",
              notes: `Due ${formatDueLabel(candidate.task.due_at, now)} · ${formatDuration(chunk)} block`,
              startMin: blockStart,
              endMin: blockEnd,
              durationMin: chunk,
              meta: `${formatDuration(chunk)} · ${formatDueLabel(candidate.task.due_at, now)}`,
              badge: candidate.task.course
            });

            busyForStudy.push([blockStart, blockEnd + STUDY_GAP]);
            lastPlacedEnd = Math.max(lastPlacedEnd, blockEnd);
            cursor = blockEnd + STUDY_GAP;
          }
        }
        return lastPlacedEnd;
      };

      // Pass 1A: Slot tasks due on or before this day inside preferred 8h sleep window (starting from studyStartMin)
      slotItemsIntoRange(studyStartMin, preferredStudyEndMin, (item) => item.dueKey <= dateKey);

      // Pass 1B: Gently pull forward upcoming tasks into spare healthy capacity before 8h sleep cutoff
      slotItemsIntoRange(studyStartMin, preferredStudyEndMin, (item) => item.dueKey > dateKey);

      // Check if any tasks due on/before this day STILL remain unscheduled
      const urgentRemaining = () => taskPool.filter((item) => item.remaining > 0 && item.dueKey <= dateKey);

      if (urgentRemaining().length > 0 && hardStudyEndMin > preferredStudyEndMin) {
        // Pass 2: Flex sleep buffer between 8h preferred and 7h floor for urgent tasks due today
        const flexStart = Math.max(studyStartMin, preferredStudyEndMin);
        const flexLastEnd = slotItemsIntoRange(flexStart, hardStudyEndMin, (item) => item.dueKey <= dateKey);

        const stillRemaining = urgentRemaining();
        if (stillRemaining.length === 0) {
          sleepStatus = "flexed";
          actualShowerStart = Math.min(hardStudyEndMin, Math.max(preferredStudyEndMin, flexLastEnd));
          actualBedMin = actualShowerStart + eveningShowerMin;
        } else {
          sleepStatus = "overload";
          actualShowerStart = hardStudyEndMin;
          actualBedMin = hardBedMin;
          for (const rem of stillRemaining) {
            overflowTasks.push({
              task: rem.task,
              remainingMinutes: rem.remaining
            });
            overflowMinutes += rem.remaining;
          }
        }
      } else if (urgentRemaining().length > 0) {
        sleepStatus = "overload";
        actualShowerStart = hardStudyEndMin;
        actualBedMin = hardBedMin;
        for (const rem of urgentRemaining()) {
          overflowTasks.push({
            task: rem.task,
            remainingMinutes: rem.remaining
          });
          overflowMinutes += rem.remaining;
        }
      }
    }

    // 6. Evening Shower & Wind-Down
    if (eveningShowerMin > 0) {
      blocks.push({
        eventType: "shower",
        title: "Evening Shower & Wind-Down",
        icsTitle: "Evening Shower & Wind-Down",
        location: "",
        notes: `${eveningShowerMin}m relaxing evening shower before bedtime.`,
        startMin: actualShowerStart,
        endMin: actualBedMin,
        meta: `${eveningShowerMin}m relaxing wind-down before bed`
      });
    }

    // 7. Compute Sleep Anchor stats (rendered as clean Bedtime marker line, not a big box)
    const actualSleepMin = Math.max(0, tomorrowWakeTimelineMin - actualBedMin);
    const actualSleepHours = actualSleepMin / 60;

    blocks.sort((a, b) => a.startMin - b.startMin);

    days[offset] = {
      offset,
      date: dayDate,
      dateKey,
      wakeMin: wakeInfo.wakeMin,
      tomorrowWakeMin: tomorrowWakeInfo.wakeMin,
      preferredBedMin,
      hardBedMin,
      actualBedMin,
      actualSleepMinutes: actualSleepMin,
      actualSleepHours,
      sleepStatus,
      overflowTasks,
      overflowMinutes,
      hasRun,
      classCount: wakeInfo.dayClasses.length,
      blocks
    };
  }

  return {
    generatedAt: now.getTime(),
    todayKey,
    runDayOffsets,
    days
  };
}

// ============================================================================
// "LATER TODAY" DEFERRAL & LATE WARNING ENGINE (V1 PRESERVED)
// ============================================================================
function computeFreeMinutesBetween(startDate, endDate, pillars) {
  if (endDate <= startDate) return 0;

  const totalSpanMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
  if (totalSpanMinutes > 14 * 24 * 60) return totalSpanMinutes;

  let freeMinutes = 0;
  const cursorDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (cursorDay <= endDay) {
    const dayStart = new Date(cursorDay.getFullYear(), cursorDay.getMonth(), cursorDay.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(cursorDay.getFullYear(), cursorDay.getMonth(), cursorDay.getDate() + 1, 0, 0, 0, 0);

    const segStartMin = Math.max(0, (Math.max(startDate.getTime(), dayStart.getTime()) - dayStart.getTime()) / 60000);
    const segEndMin = Math.min(1440, (Math.min(endDate.getTime(), dayEnd.getTime()) - dayStart.getTime()) / 60000);

    if (segEndMin > segStartMin) {
      let dayFree = segEndMin - segStartMin;
      const dow = cursorDay.getDay();

      const blocks = [];
      for (const p of pillars) {
        if (!Array.isArray(p.days_of_week) || !p.days_of_week.includes(dow)) continue;
        const buffer = Number.isFinite(p.walk_buffer_minutes) ? p.walk_buffer_minutes : 15;
        const bStart = Math.max(segStartMin, parseHHMM(p.start_time) - buffer);
        const bEnd = Math.min(segEndMin, parseHHMM(p.end_time));
        if (bEnd > bStart) blocks.push([bStart, bEnd]);
      }

      if (blocks.length > 0) {
        const merged = mergeBusyIntervals(blocks);
        for (const [bStart, bEnd] of merged) {
          dayFree -= bEnd - bStart;
        }
      }

      freeMinutes += Math.max(0, dayFree);
    }

    cursorDay.setDate(cursorDay.getDate() + 1);
  }

  return freeMinutes;
}

function computeLaterTodayPlan(task, now = new Date()) {
  const activeTasks = state.tasks.filter((t) => t.status === "active" && !isFixedPersonalPlan(t));
  const gap = getActiveGapContext(state.pillars, now, state.tasks);
  const bucketKey = getBucketKey(task, now);
  const bucketRaw = activeTasks.filter((t) => getBucketKey(t, now) === bucketKey);
  const bucket = sortBucketTasks(bucketRaw, { alternate: !gap.isGap });

  const currentIdx = bucket.findIndex((t) => t.id === task.id);
  if (currentIdx === -1) return { canDefer: false };

  const after = bucket.slice(currentIdx + 1);
  if (after.length === 0) {
    return { canDefer: false, reason: "already_last" };
  }

  const smallerAfter = after.filter((t) => t.duration_minutes <= 30);
  let targetTask;
  if (smallerAfter.length >= 2) {
    targetTask = smallerAfter[1];
  } else if (smallerAfter.length === 1) {
    targetTask = smallerAfter[0];
  } else {
    targetTask = after[Math.min(1, after.length - 1)];
  }

  const newBucket = bucket.filter((t) => t.id !== task.id);
  const targetIdxInNew = newBucket.findIndex((t) => t.id === targetTask.id);
  const insertIdx = targetIdxInNew + 1;
  newBucket.splice(insertIdx, 0, task);

  const orderUpdates = new Map();

  if (insertIdx === newBucket.length - 1) {
    const maxOrder = Math.max(0, ...bucket.map((t) => Number(t.sort_order) || 0));
    orderUpdates.set(task.id, maxOrder + 100);
  } else {
    const prev = newBucket[insertIdx - 1];
    const next = newBucket[insertIdx + 1];
    const prevOrder = Number(prev.sort_order) || 0;
    const nextOrder = Number(next.sort_order) || 0;

    const canMidpoint =
      prevOrder !== 0 &&
      nextOrder !== 0 &&
      prevOrder < nextOrder &&
      !(prevOrder < 0 && nextOrder > 0);

    if (canMidpoint) {
      const mid = (prevOrder + nextOrder) / 2;
      if (mid !== prevOrder && mid !== nextOrder && mid !== 0) {
        orderUpdates.set(task.id, mid);
      }
    }

    if (orderUpdates.size === 0) {
      const hasPosBeforeInsert = newBucket
        .slice(0, insertIdx)
        .some((t) => (Number(t.sort_order) || 0) > 0);

      if (hasPosBeforeInsert) {
        newBucket.forEach((t, idx) => {
          orderUpdates.set(t.id, (idx + 1) * 100);
        });
      } else {
        let anchorEnd = insertIdx;
        for (let i = insertIdx + 1; i < newBucket.length; i++) {
          if ((Number(newBucket[i].sort_order) || 0) < 0) {
            anchorEnd = i;
          }
        }
        const count = anchorEnd + 1;
        for (let i = 0; i <= anchorEnd; i++) {
          orderUpdates.set(newBucket[i].id, -100 * (count - i));
        }
      }
    }
  }

  const changes = [];
  for (const [id, afterOrder] of orderUpdates.entries()) {
    const original = state.tasks.find((t) => t.id === id);
    const beforeOrder = Number(original?.sort_order) || 0;
    if (beforeOrder !== afterOrder) {
      changes.push({ id, before: beforeOrder, after: afterOrder });
    }
  }

  const simulatedTasks = activeTasks.map((t) => {
    const updated = orderUpdates.get(t.id);
    return updated !== undefined ? { ...t, sort_order: updated } : t;
  });

  const projectedQueue = buildOrderedQueue(simulatedTasks, now, { alternate: !gap.isGap });
  const projectedIdx = projectedQueue.findIndex((t) => t.id === task.id);
  let requiredWorkMinutes = task.duration_minutes;
  for (let i = 0; i < projectedIdx; i++) {
    requiredWorkMinutes += projectedQueue[i].duration_minutes;
  }

  const dueDate = new Date(task.due_at);
  const freeMinutesBeforeDue = computeFreeMinutesBetween(now, dueDate, state.pillars);
  const mayBeLate = now.getTime() > dueDate.getTime() || freeMinutesBeforeDue < requiredWorkMinutes;

  return {
    canDefer: true,
    task,
    changes,
    mayBeLate
  };
}

// ============================================================================
// UNDO / REDO HISTORY ENGINE (Done & Later Today ONLY)
// ============================================================================
function pushUndoAction(action) {
  state.undoStack.push(action);
  if (state.undoStack.length > 50) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  dom.btnUndo.disabled = state.undoStack.length === 0;
  dom.btnRedo.disabled = state.redoStack.length === 0;
}

async function applyHistoryStep(action, direction) {
  const isUndo = direction === "undo";

  if (action.type === "complete") {
    const nextStatus = isUndo ? action.beforeStatus : action.afterStatus;
    const task = state.tasks.find((t) => t.id === action.taskId);
    if (task) {
      task.status = nextStatus;
      saveTasksToCache();
      recomputePlanAndRender({ animateEnter: true, scheduleSync: true });
      await runSupabaseWrite(() =>
        supabase.from("tasks").update({ status: nextStatus }).eq("id", action.taskId)
      );
    }
  } else if (action.type === "later_today") {
    const updates = action.changes.map((c) => ({
      id: c.id,
      sort_order: isUndo ? c.before : c.after
    }));

    for (const u of updates) {
      const task = state.tasks.find((t) => t.id === u.id);
      if (task) task.sort_order = u.sort_order;
    }
    saveTasksToCache();
    recomputePlanAndRender({ animateEnter: true, scheduleSync: true });

    await runSupabaseWrite(async () => {
      const results = await Promise.all(
        updates.map((u) => supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id))
      );
      const firstErr = results.find((r) => r.error)?.error || null;
      return { error: firstErr };
    });
  }
}

async function handleUndo() {
  if (state.undoStack.length === 0 || state.isAnimatingCard) return;
  const action = state.undoStack.pop();
  state.redoStack.push(action);
  updateHistoryButtons();
  await applyHistoryStep(action, "undo");
}

async function handleRedo() {
  if (state.redoStack.length === 0 || state.isAnimatingCard) return;
  const action = state.redoStack.pop();
  state.undoStack.push(action);
  updateHistoryButtons();
  await applyHistoryStep(action, "redo");
}

// ============================================================================
// TASK MUTATIONS
// ============================================================================
async function completeTaskWithAnimation(task) {
  if (!task || state.isAnimatingCard) return;
  const cardEl = dom.focusCardSlot.querySelector(".focus-card");
  state.isAnimatingCard = true;

  if (cardEl) {
    cardEl.classList.remove("anim-enter");
    cardEl.classList.add("anim-exit-done");
    await new Promise((r) => setTimeout(r, 230));
  }

  const target = state.tasks.find((t) => t.id === task.id);
  if (target) {
    const beforeStatus = target.status;
    target.status = "completed";
    saveTasksToCache();
    pushUndoAction({
      type: "complete",
      taskId: target.id,
      beforeStatus,
      afterStatus: "completed"
    });
  }

  state.isAnimatingCard = false;
  recomputePlanAndRender({ animateEnter: true, scheduleSync: true });

  await runSupabaseWrite(() =>
    supabase.from("tasks").update({ status: "completed" }).eq("id", task.id)
  );
}

async function executeLaterTodayPlan(plan) {
  if (!plan || !plan.canDefer || state.isAnimatingCard) return;
  const cardEl = dom.focusCardSlot.querySelector(".focus-card");
  state.isAnimatingCard = true;

  if (cardEl && state.activeTab === "focus") {
    cardEl.classList.remove("anim-enter");
    cardEl.classList.add("anim-exit-later");
    await new Promise((r) => setTimeout(r, 220));
  }

  for (const c of plan.changes) {
    const t = state.tasks.find((item) => item.id === c.id);
    if (t) t.sort_order = c.after;
  }
  saveTasksToCache();

  if (plan.changes.length > 0) {
    pushUndoAction({
      type: "later_today",
      changes: plan.changes
    });
  }

  state.isAnimatingCard = false;
  recomputePlanAndRender({ animateEnter: true, scheduleSync: true });

  if (plan.changes.length > 0) {
    await runSupabaseWrite(async () => {
      const results = await Promise.all(
        plan.changes.map((c) =>
          supabase.from("tasks").update({ sort_order: c.after }).eq("id", c.id)
        )
      );
      const firstErr = results.find((r) => r.error)?.error || null;
      return { error: firstErr };
    });
  }
}

function handleLaterTodayRequest(task) {
  if (!task || state.isAnimatingCard) return;
  const now = new Date();
  const plan = computeLaterTodayPlan(task, now);

  if (!plan.canDefer) {
    showToast("No other tasks in this due date to tuck behind");
    return;
  }

  if (plan.mayBeLate) {
    state.pendingLatePlan = plan;
    const formattedDue = formatLateWarningDue(task.due_at, now);
    dom.lateModalMessage.textContent = `Pushing this back may make it late (due ${formattedDue}). Proceed anyway?`;
    dom.lateModal.hidden = false;
    dom.btnLateCancel.focus();
  } else {
    executeLaterTodayPlan(plan);
  }
}

async function createTask(payload) {
  const newTask = normalizeTask({
    id: generateUUID(),
    user_id: state.user?.id,
    title: payload.title,
    course: payload.course,
    due_at: payload.due_at,
    duration_minutes: payload.duration_minutes,
    all_at_once: payload.all_at_once,
    is_starred: payload.is_starred,
    is_fixed_time: Boolean(payload.is_fixed_time),
    status: "active",
    sort_order: 0,
    created_at: new Date().toISOString()
  });

  state.tasks.push(newTask);
  saveTasksToCache();
  recomputePlanAndRender({ animateEnter: true, scheduleSync: true, checkOverloadModal: true });

  await runSupabaseWrite(() => supabase.from("tasks").insert(newTask));
}

async function updateTask(taskId, payload) {
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return;

  const before = { ...state.tasks[idx] };
  const after = {
    ...before,
    title: payload.title,
    course: payload.course,
    due_at: payload.due_at,
    duration_minutes: payload.duration_minutes,
    all_at_once: payload.all_at_once,
    is_starred: payload.is_starred,
    is_fixed_time: Boolean(payload.is_fixed_time)
  };

  state.tasks[idx] = after;
  saveTasksToCache();
  recomputePlanAndRender({ scheduleSync: true, checkOverloadModal: true });

  await runSupabaseWrite(() =>
    supabase
      .from("tasks")
      .update({
        title: after.title,
        course: after.course,
        due_at: after.due_at,
        duration_minutes: after.duration_minutes,
        all_at_once: after.all_at_once,
        is_starred: after.is_starred,
        is_fixed_time: after.is_fixed_time
      })
      .eq("id", taskId)
  );
}

async function deleteTask(taskId) {
  const existing = state.tasks.find((t) => t.id === taskId);
  if (!existing) return;

  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  const keepEntry = (entry) =>
    entry.type === "complete"
      ? entry.taskId !== taskId
      : !(entry.changes || []).some((c) => c.id === taskId);
  state.undoStack = state.undoStack.filter(keepEntry);
  state.redoStack = state.redoStack.filter(keepEntry);
  saveTasksToCache();
  recomputePlanAndRender({ animateEnter: true, scheduleSync: true });

  await runSupabaseWrite(() => supabase.from("tasks").delete().eq("id", taskId));
}

// ============================================================================
// UI RENDERING: FOCUS TAB & TODAY'S MEALS STRIP
// ============================================================================
function starSvgMarkup() {
  return `
    <span class="gold-star-badge" title="Starred task" aria-label="Starred task">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.4l2.92 5.92 6.53.95-4.73 4.61 1.12 6.5L12 17.3l-5.84 3.08 1.12-6.5-4.73-4.61 6.53-.95L12 2.4z"/>
      </svg>
    </span>
  `;
}

function syncMealsStripUI() {
  const s = getSettings();
  dom.mealsStrip.querySelectorAll(".meals-seg-btn").forEach((btn) => {
    const active = Number(btn.dataset.mealsCount) === s.meals_per_day;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const activeCourts =
    s.meals_per_day === 3
      ? [s.meal_1_court, s.meal_2_court, s.meal_3_court]
      : [s.meal_1_court, s.meal_2_court];
  dom.mealsSummaryText.textContent = activeCourts.join(" · ");

  // Keep Today's Meals Bottom Sheet pills in sync
  dom.mealsSheetCountGroup.querySelectorAll("[data-meals-count]").forEach((btn) => {
    btn.classList.toggle("is-active", Number(btn.dataset.mealsCount) === s.meals_per_day);
  });
  setActivePill(dom.meal1CourtPills, "data-court", s.meal_1_court);
  setActivePill(dom.meal2CourtPills, "data-court", s.meal_2_court);
  setActivePill(dom.meal3CourtPills, "data-court", s.meal_3_court);
  dom.meal3SheetGroup.hidden = s.meals_per_day !== 3;
}

function renderMain({ animateEnter = false } = {}) {
  const now = new Date();
  const focus = computeFocusState(now);

  dom.allTasksCount.textContent = String(focus.activeCount);

  if (focus.gap.isGap) {
    dom.contextPill.classList.add("is-gap");
    dom.contextPillText.textContent =
      focus.gap.kind === "personal"
        ? `${focus.gap.availableMinutes}m free before ${focus.gap.pillar.name}`
        : `${focus.gap.availableMinutes}m free before ${focus.gap.pillar.name} walk-out`;
  } else {
    dom.contextPill.classList.remove("is-gap");
    dom.contextPillText.textContent = "Open Study Block";
  }

  if (focus.mode === "empty") {
    dom.focusCardSlot.innerHTML = `
      <article class="focus-card state-card ${animateEnter ? "anim-enter" : ""}">
        <div class="state-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h2>All clear for now</h2>
        <p>Nothing waiting on your deck. Enjoy the quiet, or tap <strong>+</strong> to capture your next task.</p>
      </article>
    `;
    return;
  }

  if (focus.mode === "break") {
    dom.focusCardSlot.innerHTML = `
      <article class="focus-card state-card ${animateEnter ? "anim-enter" : ""}">
        <div class="state-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
            <line x1="6" y1="1" x2="6" y2="4"></line>
            <line x1="10" y1="1" x2="10" y2="4"></line>
            <line x1="14" y1="1" x2="14" y2="4"></line>
          </svg>
        </div>
        <h2>Take a break</h2>
        <p>No single-session tasks fit your ${focus.gap.availableMinutes}m gap before ${escapeHtml(focus.gap.pillar.name)}.</p>
        <button id="btn-show-tasks-anyway" type="button" class="state-link-btn">
          Show tasks anyway
        </button>
      </article>
    `;

    document.getElementById("btn-show-tasks-anyway")?.addEventListener("click", () => {
      state.bypassBreakGapKey = focus.gap.gapKey;
      renderMain({ animateEnter: true });
    });
    return;
  }

  const task = focus.focusTask;
  const overdue = isTaskOverdue(task, now);
  const dueText = formatDueLabel(task.due_at, now);
  const isPersonal = task.course.toLowerCase() === "personal";

  dom.focusCardSlot.innerHTML = `
    <article class="focus-card ${task.is_starred ? "is-starred" : ""} ${animateEnter ? "anim-enter" : ""}" data-task-id="${escapeHtml(task.id)}">
      <div class="card-header-row">
        <span class="course-chip ${isPersonal ? "is-personal" : ""}">${escapeHtml(task.course)}</span>
        <div class="card-header-right">
          ${task.is_starred ? starSvgMarkup() : ""}
          <span class="duration-pill">${escapeHtml(formatDuration(task.duration_minutes))}</span>
          <button type="button" class="card-edit-subtle" id="btn-edit-focus-card" aria-label="Edit task" title="Edit task">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="card-badges-row">
        <span class="due-label ${overdue ? "is-overdue-text" : ""}">${escapeHtml(dueText)}</span>
        ${overdue ? '<span class="badge badge-overdue">Overdue</span>' : ""}
        ${task.all_at_once ? '<span class="badge badge-all-at-once">All-at-once</span>' : ""}
        ${focus.sliceMinutes ? `<span class="badge badge-slice">Start first ${focus.sliceMinutes}m</span>` : ""}
      </div>

      <h1 class="card-title">${escapeHtml(task.title)}</h1>

      <div class="card-actions">
        <button id="btn-card-done" type="button" class="btn btn-primary">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Done
        </button>
        <button id="btn-card-later" type="button" class="btn btn-secondary">
          Later Today
        </button>
      </div>
    </article>
  `;

  document.getElementById("btn-card-done")?.addEventListener("click", () => {
    completeTaskWithAnimation(task);
  });

  document.getElementById("btn-card-later")?.addEventListener("click", () => {
    handleLaterTodayRequest(task);
  });

  document.getElementById("btn-edit-focus-card")?.addEventListener("click", () => {
    openTaskModal(task);
  });
}

// ============================================================================
// UI RENDERING: DAY PLAN TAB (TIMELINE, SLEEP BANNERS, MOVE RUN, RE-FLOW)
// ============================================================================
function formatDayPlanHeaderLabel(dayPlan) {
  if (dayPlan.offset === -1) return "Yesterday";
  if (dayPlan.offset === 0) return "Today";
  if (dayPlan.offset === 1) return "Tomorrow";
  return dayPlan.date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function maybeTriggerSleepOverloadAlert(todayPlan, forceOpen = false) {
  if (!todayPlan || todayPlan.sleepStatus !== "overload" || todayPlan.overflowMinutes <= 0) {
    return;
  }
  const s = getSettings();
  const sig = `${todayPlan.dateKey}_${todayPlan.overflowMinutes}_${todayPlan.overflowTasks.map((x) => x.task.id).join(",")}`;
  if (!forceOpen && state.dismissedOverloadSig === sig) return;

  const hardBedtime = formatMinuteOfDay(todayPlan.hardBedMin);
  const floorLabel = Number(s.min_sleep_hours) % 1 === 0 ? `${s.min_sleep_hours}` : s.min_sleep_hours.toFixed(1);

  dom.sleepAlertMessage.textContent = `You have ${todayPlan.overflowMinutes}m more work than hours left before your ${floorLabel}-hour sleep cutoff (${hardBedtime}). Use AI to help break down or speed through your tasks tonight so you get adequate sleep!`;
  dom.sleepAlertModal.dataset.overloadSig = sig;
  dom.sleepAlertModal.hidden = false;
}

function renderDayPlan() {
  if (!state.latestSevenDayPlan) {
    state.latestSevenDayPlan = computeSevenDayPlan(new Date());
  }

  const dayPlan = state.latestSevenDayPlan.days[state.planDayOffset] || state.latestSevenDayPlan.days[0];
  const s = getSettings();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Ensure live dining hours are fetched for the viewed day
  fetchDiningHoursForDate(dayPlan.dateKey);

  // Update toolbar
  dom.btnPlanDayLabel.textContent = formatDayPlanHeaderLabel(dayPlan);
  dom.btnPlanPrev.disabled = state.planDayOffset <= -1;
  dom.btnPlanNext.disabled = state.planDayOffset >= 6;

  // Sleep Flex / Overload Banner
  if (dayPlan.sleepStatus === "flexed") {
    const prefLabel = Number(s.preferred_sleep_hours) % 1 === 0 ? `${s.preferred_sleep_hours}h` : `${s.preferred_sleep_hours.toFixed(1)}h`;
    const actualStr = formatHoursAndMins(dayPlan.actualSleepMinutes);
    dom.planSleepBanner.className = "plan-banner is-amber";
    dom.planSleepBanner.innerHTML = `<span>Tight workload ${dayPlan.offset === 0 ? "today" : "this day"} — flexing sleep buffer from ${escapeHtml(prefLabel)} to ~${escapeHtml(actualStr)} so you finish on time.</span>`;
    dom.planSleepBanner.hidden = false;
  } else if (dayPlan.sleepStatus === "overload") {
    dom.planSleepBanner.className = "plan-banner is-overload";
    dom.planSleepBanner.innerHTML = `
      <span><strong>Protect Your Sleep:</strong> ${dayPlan.overflowMinutes}m exceeds your ${s.min_sleep_hours}h sleep cutoff (${formatMinuteOfDay(dayPlan.hardBedMin)}).</span>
      <button type="button" id="btn-open-sleep-alert" class="plan-banner-btn">Use AI Alert</button>
    `;
    dom.planSleepBanner.hidden = false;
    document.getElementById("btn-open-sleep-alert")?.addEventListener("click", () => {
      maybeTriggerSleepOverloadAlert(dayPlan, true);
    });
  } else {
    dom.planSleepBanner.hidden = true;
  }

  // Render vertical timeline blocks
  dom.planTimelineList.innerHTML = "";
  const frag = document.createDocumentFragment();

  // Dynamic Wake-Up Marker
  const wakeMarker = document.createElement("div");
  wakeMarker.className = "plan-wake-marker";
  wakeMarker.innerHTML = `
    <span>Wake up · ${formatMinuteOfDay(dayPlan.wakeMin)}</span>
    <span class="plan-wake-line"></span>
  `;
  frag.appendChild(wakeMarker);

  let prevBlock = null;
  for (const block of dayPlan.blocks) {
    // Show subtle breathing gap label when two consecutive study blocks have a 15m breathing gap
    if (
      prevBlock &&
      prevBlock.eventType === "study" &&
      block.eventType === "study" &&
      block.startMin - prevBlock.endMin >= 10
    ) {
      const gapEl = document.createElement("div");
      gapEl.className = "plan-gap-pill";
      gapEl.textContent = `${block.startMin - prevBlock.endMin}m breathing break`;
      frag.appendChild(gapEl);
    }

    const card = document.createElement("article");
    const isPast = dayPlan.offset === 0 && block.endMin <= nowMin && block.eventType !== "sleep";

    let typeClass = "plan-card-class";
    if (block.eventType === "meal") typeClass = "plan-card-meal";
    else if (block.eventType === "run") typeClass = "plan-card-run";
    else if (block.eventType === "shower") typeClass = "plan-card-shower";
    else if (block.eventType === "personal") typeClass = "plan-card-personal";
    else if (block.eventType === "study") {
      typeClass = block.isPersonal ? "plan-card-personal" : "plan-card-academic";
    }

    card.className = `plan-card ${typeClass} ${block.isStarred ? "is-starred-plan" : ""} ${isPast ? "is-past" : ""}`;

    let rightControlHtml = "";
    if (block.eventType === "run") {
      rightControlHtml = `<button type="button" class="plan-move-run-btn" data-move-run-offset="${block.dayOffset}">Move Run</button>`;
    } else if (block.badge || block.afterDueTime) {
      rightControlHtml = `<div class="plan-card-tags">
        ${block.afterDueTime ? '<span class="plan-tag plan-tag-late">After due time</span>' : ""}
        ${block.badge ? `<span class="plan-tag">${escapeHtml(block.badge)}</span>` : ""}
      </div>`;
    }

    card.innerHTML = `
      <div class="plan-card-header">
        <span class="plan-card-time">${formatMinuteOfDay(block.startMin)} – ${formatMinuteOfDay(block.endMin)}</span>
        ${rightControlHtml}
      </div>
      <div class="plan-card-body">
        <h4 class="plan-card-title">${block.isStarred ? "★ " : ""}${escapeHtml(block.title)}</h4>
        ${block.meta ? `<div class="plan-card-meta">${escapeHtml(block.meta)}</div>` : ""}
      </div>
    `;

    if ((block.eventType === "study" || block.eventType === "personal") && block.task) {
      card.addEventListener("click", () => {
        openTaskModal(block.task);
      });
    }

    if (block.eventType === "run") {
      card.querySelector(".plan-move-run-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openMoveRunModal(block.dayOffset);
      });
    }

    frag.appendChild(card);
    prevBlock = block;
  }

  // Clean horizontal Bedtime Marker Line (replaces big dark indigo Sleep box)
  const bedtimeMarker = document.createElement("div");
  bedtimeMarker.className = "plan-bedtime-marker";
  const bedtimeStatusPill =
    dayPlan.sleepStatus === "flexed"
      ? '<span class="plan-bedtime-pill is-flexed">Flexed</span>'
      : dayPlan.sleepStatus === "overload"
        ? '<span class="plan-bedtime-pill is-floor">7h Floor</span>'
        : "";
  bedtimeMarker.innerHTML = `
    <span>Bedtime · ${formatMinuteOfDay(dayPlan.actualBedMin)} (${formatSleepHoursLabel(dayPlan.actualSleepHours)} sleep)</span>
    ${bedtimeStatusPill}
    <span class="plan-wake-line"></span>
  `;
  frag.appendChild(bedtimeMarker);

  // Render Overflow Tasks card section if tasks exceed 7h sleep cutoff
  if (dayPlan.overflowTasks && dayPlan.overflowTasks.length > 0) {
    const overflowSection = document.createElement("section");
    overflowSection.id = "plan-overflow-section";
    overflowSection.className = `plan-overflow-section ${state.highlightOverflow ? "is-highlighted" : ""}`;
    overflowSection.innerHTML = `
      <div class="plan-overflow-header">
        <h4>Past 7h Sleep Cutoff (${dayPlan.overflowMinutes}m overflow)</h4>
      </div>
    `;

    for (const item of dayPlan.overflowTasks) {
      const row = document.createElement("div");
      row.className = "plan-overflow-item";
      row.innerHTML = `
        <div class="plan-overflow-info">
          <div class="plan-overflow-title">${escapeHtml(item.task.title)}</div>
          <div class="plan-overflow-meta">${escapeHtml(item.task.course)} · ${formatDuration(item.remainingMinutes)} left</div>
        </div>
        <button type="button" class="plan-overflow-defer-btn">Edit / Defer</button>
      `;
      row.querySelector(".plan-overflow-defer-btn").addEventListener("click", () => {
        openTaskModal(item.task);
      });
      overflowSection.appendChild(row);
    }

    frag.appendChild(overflowSection);
  }

  dom.planTimelineList.appendChild(frag);
}

function openMoveRunModal(sourceOffset) {
  if (!state.latestSevenDayPlan) return;
  state.moveRunSourceOffset = sourceOffset;
  dom.moveRunDaysList.innerHTML = "";

  for (let offset = 0; offset <= 6; offset++) {
    if (offset === sourceOffset) continue;
    const dayPlan = state.latestSevenDayPlan.days[offset];
    if (!dayPlan || dayPlan.hasRun) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "move-run-option";
    const label = `${DAY_SHORT_NAMES[dayPlan.date.getDay()]}, ${dayPlan.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    const loadDesc = dayPlan.classCount === 0 ? "No classes" : `${dayPlan.classCount} ${dayPlan.classCount === 1 ? "class" : "classes"}`;
    btn.innerHTML = `<span>${escapeHtml(label)}</span><small>${escapeHtml(loadDesc)}</small>`;

    btn.addEventListener("click", async () => {
      const sourceDay = state.latestSevenDayPlan.days[sourceOffset];
      const sourceDow = sourceDay.date.getDay();
      const targetDow = dayPlan.date.getDay();

      // Update preferred_run_days so this move persists across sessions and syncs to Supabase
      const currentDows = new Set(
        Array.from(state.latestSevenDayPlan.runDayOffsets).map((off) => state.latestSevenDayPlan.days[off].date.getDay())
      );
      currentDows.delete(sourceDow);
      currentDows.add(targetDow);

      dom.moveRunModal.hidden = true;
      state.moveRunSourceOffset = null;
      await saveUserSettings(
        { preferred_run_days: Array.from(currentDows).sort((a, b) => a - b) },
        { silentToast: true }
      );
      state.planDayOffset = offset;
      renderDayPlan();
      showToast(`Run moved to ${label}`);
    });

    dom.moveRunDaysList.appendChild(btn);
  }

  if (dom.moveRunDaysList.children.length === 0) {
    showToast("All days this week already have a run scheduled");
    return;
  }

  dom.moveRunModal.hidden = false;
}

function handleReflowFromNow() {
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const rawMin = now.getHours() * 60 + now.getMinutes();
  const roundedUp = Math.ceil(rawMin / 5) * 5;

  state.reflowAnchorDateKey = todayKey;
  state.reflowAnchorMin = roundedUp;
  state.planDayOffset = 0;

  recomputePlanAndRender({ scheduleSync: true, checkOverloadModal: true });
  showToast(`Re-flowed from ${formatMinuteOfDay(roundedUp)}`);
}

function setActiveTab(tabName) {
  state.activeTab = tabName === "plan" ? "plan" : "focus";
  const isFocus = state.activeTab === "focus";

  dom.tabFocusPanel.hidden = !isFocus;
  dom.tabPlanPanel.hidden = isFocus;

  dom.tabBtnFocus.classList.toggle("is-active", isFocus);
  dom.tabBtnFocus.setAttribute("aria-selected", String(isFocus));
  dom.tabBtnPlan.classList.toggle("is-active", !isFocus);
  dom.tabBtnPlan.setAttribute("aria-selected", String(!isFocus));

  if (!isFocus) {
    renderDayPlan();
    const todayPlan = state.latestSevenDayPlan?.days[0];
    if (state.planDayOffset === 0 && todayPlan?.sleepStatus === "overload") {
      maybeTriggerSleepOverloadAlert(todayPlan, false);
    }
  }
}

function recomputePlanAndRender({ animateEnter = false, scheduleSync = false, checkOverloadModal = false } = {}) {
  state.latestSevenDayPlan = computeSevenDayPlan(new Date());
  renderMain({ animateEnter });
  updateHistoryButtons();

  if (state.activeTab === "plan") {
    renderDayPlan();
  }
  if (!dom.carouselView.hidden) {
    renderCarousel(state.carouselCenteredIndex);
  }
  if (!dom.settingsView.hidden) {
    renderPillarsList();
  }

  if (scheduleSync) {
    schedulePlannedEventsSync();
  }

  if (checkOverloadModal && state.latestSevenDayPlan?.days[0]?.sleepStatus === "overload") {
    maybeTriggerSleepOverloadAlert(state.latestSevenDayPlan.days[0], false);
  }
}

// ============================================================================
// HORIZONTAL PEEK CAROUSEL ("ALL TASKS") — V1 PRESERVED
// ============================================================================
function renderCarousel(preserveScrollIndex = null) {
  const now = new Date();
  const focus = computeFocusState(now);
  const queue = focus.carouselQueue;

  dom.carouselTrack.innerHTML = "";

  if (queue.length === 0) {
    dom.carouselStage.hidden = true;
    dom.carouselHint.hidden = true;
    dom.carouselEmpty.hidden = false;
    dom.carouselCounter.textContent = "0 of 0";
    return;
  }

  dom.carouselStage.hidden = false;
  dom.carouselHint.hidden = false;
  dom.carouselEmpty.hidden = true;

  const frag = document.createDocumentFragment();
  queue.forEach((task, index) => {
    const isFixed = isFixedPersonalPlan(task);
    const overdue = !isFixed && isTaskOverdue(task, now);
    const dueText = isFixed ? formatDueLabel(task.due_at, now).replace(/^Due /, "Pinned ") : formatDueLabel(task.due_at, now);
    const isPersonal = task.course.toLowerCase() === "personal";
    const isSlice = index === 0 && focus.sliceMinutes && focus.focusTask?.id === task.id;

    const card = document.createElement("button");
    card.type = "button";
    card.role = "listitem";
    card.className = `carousel-card ${task.is_starred ? "is-starred" : ""}`;
    card.dataset.taskId = task.id;
    card.dataset.index = String(index);

    card.innerHTML = `
      <div class="card-header-row">
        <span class="course-chip ${isPersonal ? "is-personal" : ""}">${escapeHtml(task.course)}</span>
        <div class="card-header-right">
          ${task.is_starred ? starSvgMarkup() : ""}
          <span class="duration-pill">${escapeHtml(formatDuration(task.duration_minutes))}</span>
        </div>
      </div>

      <div class="card-badges-row">
        <span class="due-label ${overdue ? "is-overdue-text" : ""}">${escapeHtml(dueText)}</span>
        ${overdue ? '<span class="badge badge-overdue">Overdue</span>' : ""}
        ${isFixed ? '<span class="badge badge-pinned">Pinned</span>' : ""}
        ${!isFixed && task.all_at_once ? '<span class="badge badge-all-at-once">All-at-once</span>' : ""}
        ${isSlice ? `<span class="badge badge-slice">Start first ${focus.sliceMinutes}m</span>` : ""}
      </div>

      <div class="carousel-card-title">${escapeHtml(task.title)}</div>

      <div class="carousel-card-footer">
        <span>${isFixed ? "Fixed Plan" : `#${index + 1} in queue`}</span>
        <span class="tap-edit-label">Edit</span>
      </div>
    `;

    card.addEventListener("click", () => {
      const trackRect = dom.carouselTrack.getBoundingClientRect();
      const trackCenter = trackRect.left + trackRect.width / 2;
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const dist = Math.abs(cardCenter - trackCenter);

      if (dist <= cardRect.width * 0.28) {
        openTaskModal(task);
      } else {
        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });

    frag.appendChild(card);
  });

  dom.carouselTrack.appendChild(frag);

  requestAnimationFrame(() => {
    if (preserveScrollIndex !== null && queue.length > 0) {
      const safeIdx = Math.min(preserveScrollIndex, queue.length - 1);
      const targetCard = dom.carouselTrack.children[safeIdx];
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
      }
    }
    updateCarouselCardTransforms();
  });
}

function updateCarouselCardTransforms() {
  const track = dom.carouselTrack;
  const cards = track.querySelectorAll(".carousel-card");
  if (cards.length === 0) return;

  const trackRect = track.getBoundingClientRect();
  const trackCenter = trackRect.left + trackRect.width / 2;

  let closestIdx = 0;
  let closestDist = Infinity;

  cards.forEach((card, idx) => {
    const cardRect = card.getBoundingClientRect();
    const cardCenter = cardRect.left + cardRect.width / 2;
    const dist = Math.abs(cardCenter - trackCenter);
    const step = Math.max(1, cardRect.width + 12);
    const t = Math.min(1, dist / step);

    const scale = 1 - 0.16 * t;
    const opacity = 1 - 0.5 * t;

    card.style.transform = `scale(${scale.toFixed(4)})`;
    card.style.opacity = opacity.toFixed(4);

    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = idx;
    }
  });

  state.carouselCenteredIndex = closestIdx;
  dom.carouselCounter.textContent = `${closestIdx + 1} of ${cards.length}`;
}

function scheduleCarouselUpdate() {
  if (state.carouselRafId !== null) return;
  state.carouselRafId = requestAnimationFrame(() => {
    state.carouselRafId = null;
    updateCarouselCardTransforms();
  });
}

function openCarouselView() {
  dom.carouselView.hidden = false;
  renderCarousel(0);
}

function closeCarouselView() {
  dom.carouselView.hidden = true;
}

// ============================================================================
// 3-TAP QUICK ADD & EDIT TASK MODAL
// ============================================================================
let modalCourse = "Personal";
let modalDuePreset = "today";
let modalDuration = 30;

function setActivePill(container, attrName, value) {
  container.querySelectorAll(".pill-choice").forEach((btn) => {
    const isMatch = btn.getAttribute(attrName) === String(value);
    btn.classList.toggle("is-active", isMatch);
  });
}

function resetDeleteButton() {
  state.deleteConfirmArmed = false;
  dom.btnDeleteTask.textContent = "Delete Task";
  dom.btnDeleteTask.classList.remove("btn-danger-solid");
  dom.btnDeleteTask.classList.add("btn-danger-outline");
}

function syncTaskModalFixedPlanUI() {
  const isPersonal = String(modalCourse || "").toLowerCase() === "personal";
  if (!isPersonal) {
    dom.taskFixedTimeToggle.checked = false;
    dom.taskFixedPlanCard.hidden = true;
    dom.taskFixedStartWrap.hidden = true;
    dom.taskSpecificTimeRow.hidden = false;
    dom.taskAllAtOnceCard.hidden = false;
    return;
  }

  dom.taskFixedPlanCard.hidden = false;
  const isPinned = dom.taskFixedTimeToggle.checked;
  dom.taskFixedStartWrap.hidden = !isPinned;
  dom.taskSpecificTimeRow.hidden = isPinned;
  dom.taskAllAtOnceCard.hidden = isPinned;

  if (isPinned && !dom.taskFixedStartTime.value) {
    dom.taskFixedStartTime.value = getNextRoundedHalfHourHHMM(new Date());
  }
}

function openTaskModal(taskToEdit = null) {
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const tomorrowKey = toLocalDateKey(addLocalDays(now, 1));

  dom.taskFormError.hidden = true;
  resetDeleteButton();

  if (taskToEdit) {
    state.editingTaskId = taskToEdit.id;
    dom.taskModalTitle.textContent = isFixedPersonalPlan(taskToEdit) ? "Edit Personal Plan" : "Edit Task";
    dom.btnTaskSave.textContent = "Save Changes";
    dom.btnDeleteTask.hidden = false;

    dom.taskTitleInput.value = taskToEdit.title;
    modalCourse = taskToEdit.course || "Personal";
    setActivePill(dom.taskCoursePills, "data-course", modalCourse);

    const dueDate = new Date(taskToEdit.due_at);
    const dueKey = toLocalDateKey(dueDate);
    if (dueKey === todayKey) {
      modalDuePreset = "today";
      dom.taskDatePickerWrap.hidden = true;
    } else if (dueKey === tomorrowKey) {
      modalDuePreset = "tomorrow";
      dom.taskDatePickerWrap.hidden = true;
    } else {
      modalDuePreset = "pick";
      dom.taskDatePickerWrap.hidden = false;
      dom.taskDateInput.value = dueKey;
    }
    setActivePill(dom.taskDuePills, "data-due-preset", modalDuePreset);

    const hhmm = `${pad2(dueDate.getHours())}:${pad2(dueDate.getMinutes())}`;
    const isFixed = isFixedPersonalPlan(taskToEdit);
    dom.taskFixedTimeToggle.checked = isFixed;
    dom.taskFixedStartTime.value = isFixed ? hhmm : getNextRoundedHalfHourHHMM(now);

    const isDefaultEndOfDay = dueDate.getHours() === 23 && dueDate.getMinutes() === 59;
    dom.taskSpecificTimeToggle.checked = !isFixed && !isDefaultEndOfDay;
    dom.taskTimeInput.hidden = isFixed || isDefaultEndOfDay;
    dom.taskTimeInput.value = isFixed ? "23:59" : hhmm;

    modalDuration = taskToEdit.duration_minutes;
    const isPresetDuration = [15, 30, 60, 120].includes(modalDuration);
    setActivePill(dom.taskDurationPills, "data-duration", isPresetDuration ? modalDuration : "");
    dom.taskCustomDuration.value = isPresetDuration ? "" : String(modalDuration);

    dom.taskAllAtOnce.checked = Boolean(taskToEdit.all_at_once);
    dom.taskIsStarred.checked = Boolean(taskToEdit.is_starred);
  } else {
    state.editingTaskId = null;
    dom.taskModalTitle.textContent = "New Task";
    dom.btnTaskSave.textContent = "Add Task";
    dom.btnDeleteTask.hidden = true;

    dom.taskTitleInput.value = "";
    modalCourse = "Personal";
    setActivePill(dom.taskCoursePills, "data-course", modalCourse);

    modalDuePreset = "today";
    setActivePill(dom.taskDuePills, "data-due-preset", "today");
    dom.taskDatePickerWrap.hidden = true;
    dom.taskDateInput.value = todayKey;

    dom.taskFixedTimeToggle.checked = false;
    dom.taskFixedStartTime.value = getNextRoundedHalfHourHHMM(now);

    dom.taskSpecificTimeToggle.checked = false;
    dom.taskTimeInput.hidden = true;
    dom.taskTimeInput.value = "23:59";

    modalDuration = 30;
    setActivePill(dom.taskDurationPills, "data-duration", 30);
    dom.taskCustomDuration.value = "";

    dom.taskAllAtOnce.checked = false;
    dom.taskIsStarred.checked = false;
  }

  syncTaskModalFixedPlanUI();
  dom.taskModal.hidden = false;
  requestAnimationFrame(() => {
    dom.taskTitleInput.focus();
  });
}

function closeTaskModal() {
  dom.taskModal.hidden = true;
  state.editingTaskId = null;
  resetDeleteButton();
}

// ============================================================================
// SETTINGS VIEW (CALENDAR .ICS, MEALS, SLEEP/RUNS, CLASS PILLARS)
// ============================================================================
let pillarBuffer = 15;
let pillarDays = new Set([1, 3, 5]);
let settingsRunDaysSet = new Set([3, 6]);

function populateSettingsUI() {
  const s = getSettings();
  dom.settingsUserEmail.textContent = state.user?.email || "Signed in";
  dom.settingsIcsUrl.value = `${EDGE_FUNCTION_URL}?action=calendar&token=${s.ics_token}`;

  dom.setMeal1Start.value = s.meal_1_window_start;
  dom.setMeal1End.value = s.meal_1_window_end;
  dom.setMeal2Start.value = s.meal_2_window_start;
  dom.setMeal2End.value = s.meal_2_window_end;
  dom.setMeal3Start.value = s.meal_3_window_start;
  dom.setMeal3End.value = s.meal_3_window_end;

  dom.setPrefSleep.value = String(s.preferred_sleep_hours);
  dom.setMinSleep.value = String(s.min_sleep_hours);
  dom.setEveningShower.value = String(s.evening_shower_minutes);
  dom.setNoClassWake.value = s.no_class_wake_time;
  dom.setRunsPerWeek.value = String(s.runs_per_week);

  settingsRunDaysSet = new Set(s.preferred_run_days || [3, 6]);
  syncSettingsRunDayButtons();
  dom.wellnessFormError.hidden = true;
}

function syncSettingsRunDayButtons() {
  dom.settingsRunDays.querySelectorAll("[data-run-day]").forEach((btn) => {
    const d = Number(btn.dataset.runDay);
    const active = settingsRunDaysSet.has(d);
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function resetPillarForm() {
  state.editingPillarId = null;
  dom.pillarFormTitle.textContent = "Add Class";
  dom.btnPillarSubmit.textContent = "Add Class";
  dom.btnPillarCancel.hidden = true;
  dom.pillarFormError.hidden = true;

  dom.pillarNameInput.value = "";
  dom.pillarStartInput.value = "09:30";
  dom.pillarEndInput.value = "10:20";

  pillarDays = new Set([1, 3, 5]);
  syncPillarDayButtons();

  pillarBuffer = 15;
  setActivePill(dom.pillarBufferPills, "data-buffer", 15);
}

function syncPillarDayButtons() {
  dom.pillarDayPills.querySelectorAll(".day-pill").forEach((btn) => {
    const day = Number(btn.dataset.day);
    const active = pillarDays.has(day);
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function populatePillarFormForEdit(pillar) {
  state.editingPillarId = pillar.id;
  dom.pillarFormTitle.textContent = "Edit Class";
  dom.btnPillarSubmit.textContent = "Update Class";
  dom.btnPillarCancel.hidden = false;
  dom.pillarFormError.hidden = true;

  dom.pillarNameInput.value = pillar.name;
  dom.pillarStartInput.value = pillar.start_time;
  dom.pillarEndInput.value = pillar.end_time;

  pillarDays = new Set(pillar.days_of_week);
  syncPillarDayButtons();

  pillarBuffer = pillar.walk_buffer_minutes;
  setActivePill(dom.pillarBufferPills, "data-buffer", pillarBuffer);

  dom.pillarForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  dom.pillarNameInput.focus();
}

function renderPillarsList() {
  if (state.pillars.length === 0) {
    dom.pillarsList.innerHTML = `
      <div class="pillar-empty">No recurring classes yet. Add your weekly classes below to enable gap detection and dynamic wake-up times.</div>
    `;
    return;
  }

  const sorted = state.pillars
    .slice()
    .sort((a, b) => parseHHMM(a.start_time) - parseHHMM(b.start_time));

  dom.pillarsList.innerHTML = "";
  for (const pillar of sorted) {
    const daysText = pillar.days_of_week.map((d) => DAY_LABELS[d] || d).join(" ");
    const timeText = `${formatHHMM12h(pillar.start_time)} – ${formatHHMM12h(pillar.end_time)}`;

    const row = document.createElement("div");
    row.className = "pillar-item";
    row.innerHTML = `
      <div class="pillar-item-info">
        <span class="pillar-item-name">${escapeHtml(pillar.name)}</span>
        <span class="pillar-item-meta">${escapeHtml(daysText)} · ${escapeHtml(timeText)} · ${pillar.walk_buffer_minutes}m walk</span>
      </div>
      <div class="pillar-item-actions">
        <button type="button" class="icon-btn pillar-edit-btn" aria-label="Edit ${escapeHtml(pillar.name)}" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button type="button" class="icon-btn pillar-delete-btn" aria-label="Delete ${escapeHtml(pillar.name)}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
          </svg>
        </button>
      </div>
    `;

    row.querySelector(".pillar-edit-btn").addEventListener("click", () => {
      populatePillarFormForEdit(pillar);
    });

    row.querySelector(".pillar-delete-btn").addEventListener("click", async () => {
      state.pillars = state.pillars.filter((p) => p.id !== pillar.id);
      if (state.editingPillarId === pillar.id) resetPillarForm();
      savePillarsToCache();
      renderPillarsList();
      recomputePlanAndRender({ scheduleSync: true });
      await runSupabaseWrite(() => supabase.from("class_pillars").delete().eq("id", pillar.id));
    });

    dom.pillarsList.appendChild(row);
  }
}

function openSettingsView() {
  populateSettingsUI();
  renderPillarsList();
  resetPillarForm();
  dom.settingsView.hidden = false;
}

function closeSettingsView() {
  dom.settingsView.hidden = true;
}

// ============================================================================
// AUTHENTICATION FLOW
// ============================================================================
function showAppView() {
  document.documentElement.dataset.boot = "app";
  dom.settingsUserEmail.textContent = state.user?.email || "Signed in";
}

function showAuthView() {
  document.documentElement.dataset.boot = "auth";
  closeTaskModal();
  closeCarouselView();
  closeSettingsView();
  dom.lateModal.hidden = true;
  dom.sleepAlertModal.hidden = true;
  dom.moveRunModal.hidden = true;
  dom.mealsModal.hidden = true;
}

async function initAuthAndSync() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const session = data?.session;
    if (session?.user) {
      state.user = session.user;
      saveUserToCache(session.user);
      showAppView();
      syncMealsStripUI();
      recomputePlanAndRender();
      syncFromSupabase();
    } else {
      state.user = null;
      saveUserToCache(null);
      showAuthView();
    }
  } catch (err) {
    console.error("Auth session check error:", err);
    if (state.user) {
      setSyncStatus("offline");
      showAppView();
      syncMealsStripUI();
      recomputePlanAndRender();
    } else {
      showAuthView();
    }
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      state.user = null;
      state.tasks = [];
      state.pillars = [];
      state.userSettings = null;
      state.lastPlannedEventsSig = null;
      state.undoStack = [];
      state.redoStack = [];
      clearAllCache();
      showAuthView();
    } else if (session?.user) {
      state.user = session.user;
      saveUserToCache(session.user);
    }
  });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function bindEvents() {
  // Login Form
  dom.authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    dom.authError.hidden = true;

    const email = dom.authEmail.value.trim();
    const password = dom.authPassword.value;
    if (!email || !password) {
      dom.authError.textContent = "Please enter both your email and password.";
      dom.authError.hidden = false;
      return;
    }

    dom.authSubmitBtn.disabled = true;
    dom.authSubmitBtn.textContent = "Signing in...";

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      state.user = data.user;
      saveUserToCache(data.user);
      dom.authPassword.value = "";
      showAppView();
      syncMealsStripUI();
      recomputePlanAndRender();
      await syncFromSupabase();
    } catch (err) {
      dom.authError.textContent = err?.message || "Invalid email or password.";
      dom.authError.hidden = false;
    } finally {
      dom.authSubmitBtn.disabled = false;
      dom.authSubmitBtn.textContent = "Sign In";
    }
  });

  // Top Header & Main Controls
  dom.syncDotBtn.addEventListener("click", () => syncFromSupabase(true));
  dom.btnAllTasks.addEventListener("click", openCarouselView);
  dom.btnSettings.addEventListener("click", openSettingsView);
  dom.btnAddFab.addEventListener("click", () => openTaskModal(null));
  dom.btnPlanAddFab.addEventListener("click", () => openTaskModal(null));
  dom.btnUndo.addEventListener("click", handleUndo);
  dom.btnRedo.addEventListener("click", handleRedo);

  // Green Checkmark Circle Buttons -> Push Updates Immediately to Google Calendar
  const handleManualGcalPush = async (btn) => {
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-syncing");
    }
    try {
      state.latestSevenDayPlan = computeSevenDayPlan(new Date());
      await syncPlannedEventsToSupabase({ forceGcal: true });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-syncing");
      }
    }
  };
  dom.btnFabGcalSync.addEventListener("click", () => handleManualGcalPush(dom.btnFabGcalSync));
  dom.btnPlanGcalSync.addEventListener("click", () => handleManualGcalPush(dom.btnPlanGcalSync));

  // Bottom 2-Tab Navigation
  dom.tabBtnFocus.addEventListener("click", () => setActiveTab("focus"));
  dom.tabBtnPlan.addEventListener("click", () => setActiveTab("plan"));

  // Focus Tab: Single-Row Today's Meals Bar & iPhone Bottom Sheet
  dom.mealsStrip.addEventListener("click", (e) => {
    const seg = e.target.closest("[data-meals-count]");
    if (!seg) return;
    const count = Number(seg.dataset.mealsCount) === 3 ? 3 : 2;
    if (getSettings().meals_per_day === count) return;
    saveUserSettings({ meals_per_day: count }, { silentToast: true });
    showToast(`${count} meals scheduled`);
  });

  dom.btnOpenMealsSheet.addEventListener("click", () => {
    syncMealsStripUI();
    dom.mealsModal.hidden = false;
  });

  const closeMealsModal = () => {
    dom.mealsModal.hidden = true;
  };
  dom.btnMealsModalClose.addEventListener("click", closeMealsModal);
  dom.btnMealsModalDone.addEventListener("click", closeMealsModal);
  dom.mealsModal.addEventListener("click", (e) => {
    if (e.target === dom.mealsModal) closeMealsModal();
  });

  dom.mealsSheetCountGroup.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-meals-count]");
    if (!btn) return;
    const count = Number(btn.dataset.mealsCount) === 3 ? 3 : 2;
    if (getSettings().meals_per_day === count) return;
    saveUserSettings({ meals_per_day: count }, { silentToast: true });
  });

  dom.meal1CourtPills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-court]");
    if (!btn) return;
    saveUserSettings({ meal_1_court: btn.dataset.court }, { silentToast: true });
  });
  dom.meal2CourtPills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-court]");
    if (!btn) return;
    saveUserSettings({ meal_2_court: btn.dataset.court }, { silentToast: true });
  });
  dom.meal3CourtPills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-court]");
    if (!btn) return;
    saveUserSettings({ meal_3_court: btn.dataset.court }, { silentToast: true });
  });

  // Settings Custom Single-Chevron Accordions (expands cleanly downwards, pushing sections below)
  dom.settingsView.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-accordion-target]");
    if (!trigger) return;
    const targetName = trigger.dataset.accordionTarget;
    const panel = dom.settingsView.querySelector(`[data-accordion-panel="${targetName}"]`);
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    trigger.setAttribute("aria-expanded", String(willOpen));
  });

  // Day Plan Navigation & Re-flow from Now
  dom.btnPlanPrev.addEventListener("click", () => {
    if (state.planDayOffset > -1) {
      state.planDayOffset -= 1;
      state.highlightOverflow = false;
      renderDayPlan();
    }
  });
  dom.btnPlanNext.addEventListener("click", () => {
    if (state.planDayOffset < 6) {
      state.planDayOffset += 1;
      state.highlightOverflow = false;
      renderDayPlan();
    }
  });
  dom.btnPlanDayLabel.addEventListener("click", () => {
    state.planDayOffset = 0;
    renderDayPlan();
  });
  dom.btnReflowNow.addEventListener("click", handleReflowFromNow);

  // Carousel Overlay
  dom.btnCarouselClose.addEventListener("click", closeCarouselView);
  dom.btnCarouselAdd.addEventListener("click", () => openTaskModal(null));
  dom.carouselTrack.addEventListener("scroll", scheduleCarouselUpdate, { passive: true });
  window.addEventListener("resize", () => {
    if (!dom.carouselView.hidden) scheduleCarouselUpdate();
  });

  dom.carouselStage.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        dom.carouselTrack.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );

  // Settings Overlay
  dom.btnSettingsClose.addEventListener("click", closeSettingsView);
  dom.btnPillarCancel.addEventListener("click", resetPillarForm);
  dom.btnSyncNow.addEventListener("click", () => syncFromSupabase(true));

  // Settings: Instant Google Calendar Sync button
  dom.btnGcalSyncNow.addEventListener("click", async () => {
    dom.btnGcalSyncNow.disabled = true;
    dom.btnGcalSyncNow.textContent = "Syncing...";
    try {
      state.latestSevenDayPlan = computeSevenDayPlan(new Date());
      await syncPlannedEventsToSupabase({ forceGcal: true });
    } finally {
      dom.btnGcalSyncNow.disabled = false;
      dom.btnGcalSyncNow.textContent = "Sync to Google Calendar Now";
    }
  });

  // Settings: Copy iPhone Calendar .ics Link
  dom.btnCopyIcs.addEventListener("click", async () => {
    const url = dom.settingsIcsUrl.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        dom.settingsIcsUrl.select();
        document.execCommand("copy");
      }
      showToast("Calendar link copied!");
    } catch (_) {
      dom.settingsIcsUrl.select();
      showToast("Tap and copy the link above");
    }
  });

  // Settings: Meal Windows Save
  dom.mealsSettingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveUserSettings({
      meal_1_window_start: dom.setMeal1Start.value || "10:30",
      meal_1_window_end: dom.setMeal1End.value || "14:30",
      meal_2_window_start: dom.setMeal2Start.value || "16:30",
      meal_2_window_end: dom.setMeal2End.value || "20:30",
      meal_3_window_start: dom.setMeal3Start.value || "19:30",
      meal_3_window_end: dom.setMeal3End.value || "22:00"
    });
  });

  // Settings: Preferred Run Days toggle
  dom.settingsRunDays.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-run-day]");
    if (!btn) return;
    const d = Number(btn.dataset.runDay);
    if (settingsRunDaysSet.has(d)) settingsRunDaysSet.delete(d);
    else settingsRunDaysSet.add(d);
    syncSettingsRunDayButtons();
  });

  // Settings: Sleep, Showers & Runs Save
  dom.wellnessSettingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    dom.wellnessFormError.hidden = true;

    const prefSleep = parseFloat(dom.setPrefSleep.value);
    const minSleep = parseFloat(dom.setMinSleep.value);
    const showerMin = parseInt(dom.setEveningShower.value, 10);
    const noClassWake = dom.setNoClassWake.value || "08:30";
    const runsPerWeek = parseInt(dom.setRunsPerWeek.value, 10);

    if (!Number.isFinite(prefSleep) || !Number.isFinite(minSleep) || minSleep > prefSleep) {
      dom.wellnessFormError.textContent = "Minimum sleep must be less than or equal to preferred sleep.";
      dom.wellnessFormError.hidden = false;
      return;
    }

    await saveUserSettings({
      preferred_sleep_hours: prefSleep,
      min_sleep_hours: minSleep,
      evening_shower_minutes: Number.isFinite(showerMin) ? showerMin : 40,
      no_class_wake_time: noClassWake,
      runs_per_week: Number.isFinite(runsPerWeek) ? runsPerWeek : 2,
      preferred_run_days: Array.from(settingsRunDaysSet).sort((a, b) => a - b)
    });
  });

  dom.btnSignOut.addEventListener("click", async () => {
    dom.btnSignOut.disabled = true;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      state.user = null;
      state.tasks = [];
      state.pillars = [];
      state.userSettings = null;
      state.lastPlannedEventsSig = null;
      state.undoStack = [];
      state.redoStack = [];
      clearAllCache();
      dom.btnSignOut.disabled = false;
      showAuthView();
    }
  });

  // Settings: Pillar quick-fill course pills
  dom.pillarCoursePills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fill-course]");
    if (!btn) return;
    dom.pillarNameInput.value = btn.dataset.fillCourse;
  });

  // Settings: Pillar day toggles
  dom.pillarDayPills.addEventListener("click", (e) => {
    const btn = e.target.closest(".day-pill");
    if (!btn) return;
    const day = Number(btn.dataset.day);
    if (pillarDays.has(day)) pillarDays.delete(day);
    else pillarDays.add(day);
    syncPillarDayButtons();
  });

  // Settings: Pillar walk buffer pills
  dom.pillarBufferPills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-buffer]");
    if (!btn) return;
    pillarBuffer = Number(btn.dataset.buffer);
    setActivePill(dom.pillarBufferPills, "data-buffer", pillarBuffer);
  });

  // Settings: Pillar save form
  dom.pillarForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    dom.pillarFormError.hidden = true;

    const name = dom.pillarNameInput.value.trim();
    const startTime = dom.pillarStartInput.value;
    const endTime = dom.pillarEndInput.value;
    const days = Array.from(pillarDays).sort((a, b) => a - b);

    if (!name) {
      dom.pillarFormError.textContent = "Please enter a class name.";
      dom.pillarFormError.hidden = false;
      return;
    }
    if (days.length === 0) {
      dom.pillarFormError.textContent = "Select at least one day of the week.";
      dom.pillarFormError.hidden = false;
      return;
    }
    if (!startTime || !endTime || parseHHMM(endTime) <= parseHHMM(startTime)) {
      dom.pillarFormError.textContent = "End time must be later than start time.";
      dom.pillarFormError.hidden = false;
      return;
    }

    if (state.editingPillarId) {
      const idx = state.pillars.findIndex((p) => p.id === state.editingPillarId);
      if (idx !== -1) {
        const updated = {
          ...state.pillars[idx],
          name,
          days_of_week: days,
          start_time: startTime,
          end_time: endTime,
          walk_buffer_minutes: pillarBuffer
        };
        state.pillars[idx] = updated;
        savePillarsToCache();
        resetPillarForm();
        renderPillarsList();
        recomputePlanAndRender({ scheduleSync: true });
        showToast("Class updated");

        await runSupabaseWrite(() =>
          supabase
            .from("class_pillars")
            .update({
              name: updated.name,
              days_of_week: updated.days_of_week,
              start_time: updated.start_time,
              end_time: updated.end_time,
              walk_buffer_minutes: updated.walk_buffer_minutes
            })
            .eq("id", updated.id)
        );
      }
    } else {
      const newPillar = normalizePillar({
        id: generateUUID(),
        user_id: state.user?.id,
        name,
        days_of_week: days,
        start_time: startTime,
        end_time: endTime,
        walk_buffer_minutes: pillarBuffer,
        created_at: new Date().toISOString()
      });

      state.pillars.push(newPillar);
      savePillarsToCache();
      resetPillarForm();
      renderPillarsList();
      recomputePlanAndRender({ scheduleSync: true });
      showToast("Class added");

      await runSupabaseWrite(() => supabase.from("class_pillars").insert(newPillar));
    }
  });

  // Task Modal Interactions
  dom.btnTaskModalClose.addEventListener("click", closeTaskModal);
  dom.taskModal.addEventListener("click", (e) => {
    if (e.target === dom.taskModal) closeTaskModal();
  });

  dom.taskCoursePills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-course]");
    if (!btn) return;
    modalCourse = btn.dataset.course;
    setActivePill(dom.taskCoursePills, "data-course", modalCourse);
    syncTaskModalFixedPlanUI();
  });

  dom.taskFixedTimeToggle.addEventListener("change", () => {
    if (dom.taskFixedTimeToggle.checked && !dom.taskFixedStartTime.value) {
      dom.taskFixedStartTime.value = getNextRoundedHalfHourHHMM(new Date());
    }
    syncTaskModalFixedPlanUI();
  });

  dom.taskDuePills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-due-preset]");
    if (!btn) return;
    modalDuePreset = btn.dataset.duePreset;
    setActivePill(dom.taskDuePills, "data-due-preset", modalDuePreset);
    dom.taskDatePickerWrap.hidden = modalDuePreset !== "pick";
    if (modalDuePreset === "pick" && !dom.taskDateInput.value) {
      dom.taskDateInput.value = toLocalDateKey(new Date());
    }
  });

  dom.taskSpecificTimeToggle.addEventListener("change", () => {
    dom.taskTimeInput.hidden = !dom.taskSpecificTimeToggle.checked;
    if (dom.taskSpecificTimeToggle.checked && !dom.taskTimeInput.value) {
      dom.taskTimeInput.value = "23:59";
    }
  });

  dom.taskDurationPills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-duration]");
    if (!btn) return;
    modalDuration = Number(btn.dataset.duration);
    setActivePill(dom.taskDurationPills, "data-duration", modalDuration);
    dom.taskCustomDuration.value = "";
  });

  dom.taskCustomDuration.addEventListener("input", () => {
    const val = parseInt(dom.taskCustomDuration.value, 10);
    if (Number.isFinite(val) && val > 0) {
      modalDuration = val;
      setActivePill(dom.taskDurationPills, "data-duration", [15, 30, 60, 120].includes(val) ? val : "");
    }
  });

  dom.btnDeleteTask.addEventListener("click", async () => {
    if (!state.editingTaskId) return;
    if (!state.deleteConfirmArmed) {
      state.deleteConfirmArmed = true;
      dom.btnDeleteTask.textContent = "Tap again to delete";
      dom.btnDeleteTask.classList.remove("btn-danger-outline");
      dom.btnDeleteTask.classList.add("btn-danger-solid");
      return;
    }
    const idToDelete = state.editingTaskId;
    closeTaskModal();
    await deleteTask(idToDelete);
    showToast("Task deleted");
  });

  dom.taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    dom.taskFormError.hidden = true;

    const title = dom.taskTitleInput.value.trim();
    if (!title) {
      dom.taskFormError.textContent = "Please enter a task title.";
      dom.taskFormError.hidden = false;
      dom.taskTitleInput.focus();
      return;
    }

    const now = new Date();
    let dateKey;
    if (modalDuePreset === "today") {
      dateKey = toLocalDateKey(now);
    } else if (modalDuePreset === "tomorrow") {
      dateKey = toLocalDateKey(addLocalDays(now, 1));
    } else {
      dateKey = dom.taskDateInput.value;
      if (!dateKey) {
        dom.taskFormError.textContent = "Please choose a due date.";
        dom.taskFormError.hidden = false;
        return;
      }
    }

    const customVal = parseInt(dom.taskCustomDuration.value, 10);
    const durationMinutes = Number.isFinite(customVal) && customVal > 0 ? customVal : modalDuration;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      dom.taskFormError.textContent = "Please enter a valid time estimate.";
      dom.taskFormError.hidden = false;
      return;
    }

    const isFixedTime = String(modalCourse || "").toLowerCase() === "personal" && dom.taskFixedTimeToggle.checked;
    if (isFixedTime && !dom.taskFixedStartTime.value) {
      dom.taskFormError.textContent = "Please choose a start time for your fixed plan.";
      dom.taskFormError.hidden = false;
      return;
    }

    const payload = {
      title,
      course: modalCourse,
      due_at: isFixedTime
        ? buildDueIsoFromInputs(dateKey, true, dom.taskFixedStartTime.value)
        : buildDueIsoFromInputs(dateKey, dom.taskSpecificTimeToggle.checked, dom.taskTimeInput.value),
      duration_minutes: Math.min(720, Math.max(1, Math.round(durationMinutes))),
      all_at_once: isFixedTime ? false : dom.taskAllAtOnce.checked,
      is_starred: dom.taskIsStarred.checked,
      is_fixed_time: isFixedTime
    };

    const editingId = state.editingTaskId;
    closeTaskModal();

    if (editingId) {
      await updateTask(editingId, payload);
    } else {
      await createTask(payload);
    }
  });

  // Late Warning Modal
  dom.btnLateCancel.addEventListener("click", () => {
    state.pendingLatePlan = null;
    dom.lateModal.hidden = true;
  });
  dom.lateModal.addEventListener("click", (e) => {
    if (e.target === dom.lateModal) {
      state.pendingLatePlan = null;
      dom.lateModal.hidden = true;
    }
  });
  dom.btnLateProceed.addEventListener("click", () => {
    const plan = state.pendingLatePlan;
    state.pendingLatePlan = null;
    dom.lateModal.hidden = true;
    if (plan) executeLaterTodayPlan(plan);
  });

  // Protect Your Sleep — Use AI Tonight Modal
  dom.btnSleepGotIt.addEventListener("click", () => {
    state.dismissedOverloadSig = dom.sleepAlertModal.dataset.overloadSig || null;
    dom.sleepAlertModal.hidden = true;
  });
  dom.sleepAlertModal.addEventListener("click", (e) => {
    if (e.target === dom.sleepAlertModal) {
      state.dismissedOverloadSig = dom.sleepAlertModal.dataset.overloadSig || null;
      dom.sleepAlertModal.hidden = true;
    }
  });
  dom.btnSleepViewOverflow.addEventListener("click", () => {
    state.dismissedOverloadSig = dom.sleepAlertModal.dataset.overloadSig || null;
    dom.sleepAlertModal.hidden = true;
    state.planDayOffset = 0;
    state.highlightOverflow = true;
    setActiveTab("plan");
    requestAnimationFrame(() => {
      document.getElementById("plan-overflow-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  // Move Run Modal
  dom.btnMoveRunCancel.addEventListener("click", () => {
    state.moveRunSourceOffset = null;
    dom.moveRunModal.hidden = true;
  });
  dom.moveRunModal.addEventListener("click", (e) => {
    if (e.target === dom.moveRunModal) {
      state.moveRunSourceOffset = null;
      dom.moveRunModal.hidden = true;
    }
  });

  // Prevent pinch-to-zoom and Ctrl/Cmd browser zoom
  const preventEvent = (e) => e.preventDefault();
  document.addEventListener("gesturestart", preventEvent, { passive: false });
  document.addEventListener("gesturechange", preventEvent, { passive: false });
  document.addEventListener("gestureend", preventEvent, { passive: false });

  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Global Keyboard Shortcuts (Edge / Desktop)
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if ((e.ctrlKey || e.metaKey) && ["+", "=", "-", "_", "0"].includes(e.key)) {
      e.preventDefault();
      return;
    }

    if (e.key === "Escape") {
      if (!dom.mealsModal.hidden) {
        dom.mealsModal.hidden = true;
      } else if (!dom.moveRunModal.hidden) {
        dom.moveRunModal.hidden = true;
      } else if (!dom.sleepAlertModal.hidden) {
        dom.sleepAlertModal.hidden = true;
      } else if (!dom.lateModal.hidden) {
        state.pendingLatePlan = null;
        dom.lateModal.hidden = true;
      } else if (!dom.taskModal.hidden) {
        closeTaskModal();
      } else if (!dom.settingsView.hidden) {
        closeSettingsView();
      } else if (!dom.carouselView.hidden) {
        closeCarouselView();
      }
      return;
    }

    if (!isTyping && (e.ctrlKey || e.metaKey)) {
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    }

    if (!isTyping && !dom.carouselView.hidden && dom.taskModal.hidden) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const cards = dom.carouselTrack.querySelectorAll(".carousel-card");
        if (cards.length > 0) {
          const delta = e.key === "ArrowRight" ? 1 : -1;
          const nextIdx = Math.max(0, Math.min(cards.length - 1, state.carouselCenteredIndex + delta));
          cards[nextIdx].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
      }
    }
  });

  // Network & Visibility Lifecycle
  window.addEventListener("online", () => {
    syncFromSupabase();
  });

  window.addEventListener("offline", () => {
    setSyncStatus("offline");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.user) {
      recomputePlanAndRender();
      syncFromSupabase();
    }
  });
}

// ============================================================================
// BOOTSTRAP (INSTANT LOCAL-FIRST RENDER + BACKGROUND SYNC + SW)
// ============================================================================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    let reloadedForSw = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForSw) return;
      reloadedForSw = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update().catch(() => {});
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              reg.update().catch(() => {});
            }
          });
        })
        .catch((err) => {
          console.warn("Service worker registration skipped:", err);
        });
    });
  }
}

function boot() {
  // 1. Synchronous instant render from localStorage (< 0.2s boot, zero spinners)
  loadCacheFromStorage();
  bindEvents();
  syncMealsStripUI();
  if (state.user) {
    showAppView();
    recomputePlanAndRender();
  }
  updateHistoryButtons();

  // 2. Refresh time-dependent UI every 30s
  setInterval(() => {
    if (state.user && !state.isAnimatingCard) {
      renderMain();
      if (state.activeTab === "plan") {
        renderDayPlan();
      }
    }
  }, 30000);

  // 3. Validate auth session & sync fresh Supabase rows in background
  initAuthAndSync();

  // 4. Register relative-path PWA service worker
  registerServiceWorker();
}

boot();
