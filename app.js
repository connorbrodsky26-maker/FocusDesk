// ============================================================================
// SUPABASE CONFIGURATION
// Paste your Supabase project URL and publishable key below.
// ============================================================================
const SUPABASE_URL = "https://cqxmccjeyhrsepyptjaz.supabase.co/rest/v1/";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0v85eYnFjEypiz6x-CjUww_gewKB9bd";

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
  USER_EMAIL: "focusdeck_user_email",
  USER_ID: "focusdeck_user_id"
};

const COURSE_PRESETS = ["MA 26100", "CHM 11510", "ENGR 13100", "SLCA 10100", "Personal"];
const DAY_LABELS = { 1: "M", 2: "T", 3: "W", 4: "Th", 5: "F", 6: "Sa", 0: "Su" };

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  user: null,
  tasks: [],
  pillars: [],
  undoStack: [],
  redoStack: [],
  bypassBreakGapKey: null,
  syncStatus: "synced", // "synced" | "syncing" | "offline" | "error"
  pendingWrites: 0,
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

  contextPill: document.getElementById("context-pill"),
  contextPillText: document.getElementById("context-pill-text"),
  focusCardSlot: document.getElementById("focus-card-slot"),

  btnUndo: document.getElementById("btn-undo"),
  btnRedo: document.getElementById("btn-redo"),
  btnAddFab: document.getElementById("btn-add-fab"),

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
  taskSpecificTimeToggle: document.getElementById("task-specific-time-toggle"),
  taskTimeInput: document.getElementById("task-time-input"),
  taskDurationPills: document.getElementById("task-duration-pills"),
  taskCustomDuration: document.getElementById("task-custom-duration"),
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

function parseLocalDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseHHMM(str) {
  if (!str || typeof str !== "string") return 0;
  const [h, m] = str.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function formatHHMM12h(hhmm) {
  const total = parseHHMM(hhmm);
  const h24 = Math.floor(total / 60);
  const mins = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad2(mins)} ${suffix}`;
}

function formatDuration(minutes) {
  const m = Math.max(1, Math.round(Number(minutes) || 30));
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
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
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = toLocalDateKey(tomorrow);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday);
  const dueKey = toLocalDateKey(due);

  const isDefaultEndOfDay = due.getHours() === 23 && due.getMinutes() === 59;
  const timeStr = formatTime12hFromDate(due);

  if (dueKey === todayKey) {
    return `Due Today ${timeStr}`;
  }
  if (dueKey === tomorrowKey) {
    return isDefaultEndOfDay ? "Due Tomorrow" : `Due Tomorrow ${timeStr}`;
  }
  if (dueKey === yesterdayKey) {
    return isDefaultEndOfDay ? "Due Yesterday" : `Due Yesterday ${timeStr}`;
  }

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
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = toLocalDateKey(tomorrow);
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
// LOCAL CACHE PERSISTENCE
// ============================================================================
function loadCacheFromStorage() {
  try {
    const rawTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
    const rawPillars = localStorage.getItem(STORAGE_KEYS.PILLARS);
    state.tasks = rawTasks ? JSON.parse(rawTasks) : [];
    state.pillars = rawPillars ? JSON.parse(rawPillars) : [];
    const cachedEmail = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
    const cachedId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (cachedEmail && cachedId) {
      state.user = { id: cachedId, email: cachedEmail };
    }
  } catch (_) {
    state.tasks = [];
    state.pillars = [];
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
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
  } catch (_) {}
}

// ============================================================================
// SYNC STATUS INDICATOR
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
      supabase.from("class_pillars").select("*").order("start_time", { ascending: true })
    ]);

    if (tasksRes.error) throw tasksRes.error;
    if (pillarsRes.error) throw pillarsRes.error;

    state.tasks = (tasksRes.data || []).map(normalizeTask);
    state.pillars = (pillarsRes.data || []).map(normalizePillar);
    saveTasksToCache();
    savePillarsToCache();

    setSyncStatus("synced");
    renderAllVisibleViews();
    if (showFeedback) showToast("Synced with Supabase");
  } catch (err) {
    console.error("Supabase sync read failed:", err);
    setSyncStatus(navigator.onLine ? "error" : "offline");
    if (showFeedback) showToast("Could not reach Supabase");
  }
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
// SMART SORTING & BETWEEN-CLASS "GAP-FIT OVERRIDE" ENGINE
// Note: is_starred is strictly visual and NEVER influences task ordering.
// ============================================================================
function getActiveGapContext(pillars, now = new Date()) {
  const todayDow = now.getDay(); // 0=Sun ... 6=Sat
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
      upcoming.push({ pillar, walkOutMin, startMin });
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
        walkOutMin: next.walkOutMin,
        gapKey: `${toLocalDateKey(now)}_${next.pillar.id}_${next.pillar.start_time}`
      };
    }
  }

  return { isGap: false, availableMinutes: null, pillar: null, gapKey: null };
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
  const activeTasks = state.tasks.filter((t) => t.status === "active");
  const gap = getActiveGapContext(state.pillars, now);
  const openQueue = buildOrderedQueue(activeTasks, now, { alternate: true });

  if (activeTasks.length === 0) {
    return {
      mode: "empty",
      gap,
      focusTask: null,
      sliceMinutes: null,
      carouselQueue: [],
      activeCount: 0
    };
  }

  const bypassBreak = gap.isGap && state.bypassBreakGapKey === gap.gapKey;

  if (gap.isGap && !bypassBreak) {
    const gapQueue = buildOrderedQueue(activeTasks, now, { alternate: false });

    // 1. Highest-priority task that fits completely in availableMinutes
    const fitting = gapQueue.find((t) => t.duration_minutes <= gap.availableMinutes);
    if (fitting) {
      const carouselQueue = [fitting, ...openQueue.filter((t) => t.id !== fitting.id)];
      return {
        mode: "task",
        gap,
        focusTask: fitting,
        sliceMinutes: null,
        carouselQueue,
        activeCount: activeTasks.length
      };
    }

    // 2. Highest-priority task where all_at_once === false (partial slice)
    const sliceable = gapQueue.find((t) => !t.all_at_once);
    if (sliceable) {
      const carouselQueue = [sliceable, ...openQueue.filter((t) => t.id !== sliceable.id)];
      return {
        mode: "task",
        gap,
        focusTask: sliceable,
        sliceMinutes: gap.availableMinutes,
        carouselQueue,
        activeCount: activeTasks.length
      };
    }

    // 3. All remaining tasks are all_at_once and none fit -> calm break card
    return {
      mode: "break",
      gap,
      focusTask: null,
      sliceMinutes: null,
      carouselQueue: openQueue,
      activeCount: activeTasks.length
    };
  }

  return {
    mode: "task",
    gap,
    focusTask: openQueue[0],
    sliceMinutes: null,
    carouselQueue: openQueue,
    activeCount: activeTasks.length
  };
}

// ============================================================================
// "LATER TODAY" DEFERRAL & LATE WARNING ENGINE
// ============================================================================
function computeFreeMinutesBetween(startDate, endDate, pillars) {
  if (endDate <= startDate) return 0;

  const totalSpanMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
  // Fast path: if deadline is more than 14 days away, plenty of free time
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

      // Collect blocked intervals for this day (walk-out through class end)
      const blocks = [];
      for (const p of pillars) {
        if (!Array.isArray(p.days_of_week) || !p.days_of_week.includes(dow)) continue;
        const buffer = Number.isFinite(p.walk_buffer_minutes) ? p.walk_buffer_minutes : 15;
        const bStart = Math.max(segStartMin, parseHHMM(p.start_time) - buffer);
        const bEnd = Math.min(segEndMin, parseHHMM(p.end_time));
        if (bEnd > bStart) blocks.push([bStart, bEnd]);
      }

      // Merge overlapping class blocks before subtracting
      if (blocks.length > 0) {
        blocks.sort((a, b) => a[0] - b[0]);
        const merged = [blocks[0]];
        for (let i = 1; i < blocks.length; i++) {
          const last = merged[merged.length - 1];
          if (blocks[i][0] <= last[1]) {
            last[1] = Math.max(last[1], blocks[i][1]);
          } else {
            merged.push(blocks[i]);
          }
        }
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
  const activeTasks = state.tasks.filter((t) => t.status === "active");
  const gap = getActiveGapContext(state.pillars, now);
  const bucketKey = getBucketKey(task, now);
  const bucketRaw = activeTasks.filter((t) => getBucketKey(t, now) === bucketKey);
  const bucket = sortBucketTasks(bucketRaw, { alternate: !gap.isGap });

  const currentIdx = bucket.findIndex((t) => t.id === task.id);
  if (currentIdx === -1) return { canDefer: false };

  const after = bucket.slice(currentIdx + 1);
  if (after.length === 0) {
    return { canDefer: false, reason: "already_last" };
  }

  // Move behind the next 1-2 smaller tasks (duration_minutes <= 30) in the same due-date bucket
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

  // Compute minimal sort_order updates that faithfully preserve newBucket order
  const orderUpdates = new Map();

  if (insertIdx === newBucket.length - 1) {
    // Moving to end of bucket -> positive sort_order > max in bucket
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
      // Anchor items cleanly so sortBucketTasks reproduces newBucket exactly
      const hasPosBeforeInsert = newBucket
        .slice(0, insertIdx)
        .some((t) => (Number(t.sort_order) || 0) > 0);

      if (hasPosBeforeInsert) {
        // Re-space whole bucket cleanly in positive space
        newBucket.forEach((t, idx) => {
          orderUpdates.set(t.id, (idx + 1) * 100);
        });
      } else {
        // Anchor prefix up to the last negative item (at least through insertIdx) into negative space
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

  // Late Warning Check: simulate projected queue & compare required work minutes vs remaining free time before due_at
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
// UNDO / REDO HISTORY ENGINE (Full Supabase Sync)
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
  // direction: "undo" | "redo"
  const isUndo = direction === "undo";

  if (action.type === "complete") {
    const nextStatus = isUndo ? action.beforeStatus : action.afterStatus;
    const task = state.tasks.find((t) => t.id === action.taskId);
    if (task) {
      task.status = nextStatus;
      saveTasksToCache();
      renderAllVisibleViews({ animateEnter: true });
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
    renderAllVisibleViews({ animateEnter: true });

    await runSupabaseWrite(async () => {
      const results = await Promise.all(
        updates.map((u) => supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id))
      );
      const firstErr = results.find((r) => r.error)?.error || null;
      return { error: firstErr };
    });
  } else if (action.type === "create") {
    if (isUndo) {
      state.tasks = state.tasks.filter((t) => t.id !== action.task.id);
      saveTasksToCache();
      renderAllVisibleViews();
      await runSupabaseWrite(() => supabase.from("tasks").delete().eq("id", action.task.id));
    } else {
      state.tasks.push({ ...action.task });
      saveTasksToCache();
      renderAllVisibleViews({ animateEnter: true });
      await runSupabaseWrite(() => supabase.from("tasks").upsert(action.task));
    }
  } else if (action.type === "edit") {
    const snapshot = isUndo ? action.before : action.after;
    const idx = state.tasks.findIndex((t) => t.id === snapshot.id);
    if (idx !== -1) {
      state.tasks[idx] = { ...snapshot };
    } else {
      state.tasks.push({ ...snapshot });
    }
    saveTasksToCache();
    renderAllVisibleViews();
    await runSupabaseWrite(() =>
      supabase
        .from("tasks")
        .update({
          title: snapshot.title,
          course: snapshot.course,
          due_at: snapshot.due_at,
          duration_minutes: snapshot.duration_minutes,
          all_at_once: snapshot.all_at_once,
          is_starred: snapshot.is_starred,
          status: snapshot.status,
          sort_order: snapshot.sort_order
        })
        .eq("id", snapshot.id)
    );
  } else if (action.type === "delete") {
    if (isUndo) {
      state.tasks.push({ ...action.task });
      saveTasksToCache();
      renderAllVisibleViews({ animateEnter: true });
      await runSupabaseWrite(() => supabase.from("tasks").upsert(action.task));
    } else {
      state.tasks = state.tasks.filter((t) => t.id !== action.task.id);
      saveTasksToCache();
      renderAllVisibleViews();
      await runSupabaseWrite(() => supabase.from("tasks").delete().eq("id", action.task.id));
    }
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
  renderAllVisibleViews({ animateEnter: true });

  await runSupabaseWrite(() =>
    supabase.from("tasks").update({ status: "completed" }).eq("id", task.id)
  );
}

async function executeLaterTodayPlan(plan) {
  if (!plan || !plan.canDefer || state.isAnimatingCard) return;
  const cardEl = dom.focusCardSlot.querySelector(".focus-card");
  state.isAnimatingCard = true;

  if (cardEl) {
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
  renderAllVisibleViews({ animateEnter: true });

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
    status: "active",
    sort_order: 0,
    created_at: new Date().toISOString()
  });

  state.tasks.push(newTask);
  saveTasksToCache();
  pushUndoAction({ type: "create", task: { ...newTask } });
  renderAllVisibleViews({ animateEnter: true });

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
    is_starred: payload.is_starred
  };

  state.tasks[idx] = after;
  saveTasksToCache();
  pushUndoAction({ type: "edit", before, after: { ...after } });
  renderAllVisibleViews();

  await runSupabaseWrite(() =>
    supabase
      .from("tasks")
      .update({
        title: after.title,
        course: after.course,
        due_at: after.due_at,
        duration_minutes: after.duration_minutes,
        all_at_once: after.all_at_once,
        is_starred: after.is_starred
      })
      .eq("id", taskId)
  );
}

async function deleteTask(taskId) {
  const existing = state.tasks.find((t) => t.id === taskId);
  if (!existing) return;

  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  saveTasksToCache();
  pushUndoAction({ type: "delete", task: { ...existing } });
  renderAllVisibleViews({ animateEnter: true });

  await runSupabaseWrite(() => supabase.from("tasks").delete().eq("id", taskId));
}

// ============================================================================
// MAIN SCREEN RENDERING
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

function renderMain({ animateEnter = false } = {}) {
  const now = new Date();
  const focus = computeFocusState(now);

  // Update header active count
  dom.allTasksCount.textContent = String(focus.activeCount);

  // Update quiet context pill
  if (focus.gap.isGap) {
    dom.contextPill.classList.add("is-gap");
    dom.contextPillText.textContent = `${focus.gap.availableMinutes}m free before ${focus.gap.pillar.name} walk-out`;
  } else {
    dom.contextPill.classList.remove("is-gap");
    dom.contextPillText.textContent = "Open Study Block";
  }

  // Render card slot
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

    const bypassBtn = document.getElementById("btn-show-tasks-anyway");
    if (bypassBtn) {
      bypassBtn.addEventListener("click", () => {
        state.bypassBreakGapKey = focus.gap.gapKey;
        renderMain({ animateEnter: true });
      });
    }
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
// HORIZONTAL PEEK CAROUSEL ("ALL TASKS")
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
    const overdue = isTaskOverdue(task, now);
    const dueText = formatDueLabel(task.due_at, now);
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
        ${task.all_at_once ? '<span class="badge badge-all-at-once">All-at-once</span>' : ""}
        ${isSlice ? `<span class="badge badge-slice">Start first ${focus.sliceMinutes}m</span>` : ""}
      </div>

      <div class="carousel-card-title">${escapeHtml(task.title)}</div>

      <div class="carousel-card-footer">
        <span>#${index + 1} in queue</span>
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

    // Smooth interpolation: scale 1.0 -> 0.84, opacity 1.0 -> 0.5
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
let modalDuePreset = "today"; // "today" | "tomorrow" | "pick"
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

function openTaskModal(taskToEdit = null) {
  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = toLocalDateKey(tomorrow);

  dom.taskFormError.hidden = true;
  resetDeleteButton();

  if (taskToEdit) {
    state.editingTaskId = taskToEdit.id;
    dom.taskModalTitle.textContent = "Edit Task";
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

    const isDefaultEndOfDay = dueDate.getHours() === 23 && dueDate.getMinutes() === 59;
    dom.taskSpecificTimeToggle.checked = !isDefaultEndOfDay;
    dom.taskTimeInput.hidden = isDefaultEndOfDay;
    dom.taskTimeInput.value = `${pad2(dueDate.getHours())}:${pad2(dueDate.getMinutes())}`;

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

    dom.taskSpecificTimeToggle.checked = false;
    dom.taskTimeInput.hidden = true;
    dom.taskTimeInput.value = "23:59";

    modalDuration = 30;
    setActivePill(dom.taskDurationPills, "data-duration", 30);
    dom.taskCustomDuration.value = "";

    dom.taskAllAtOnce.checked = false;
    dom.taskIsStarred.checked = false;
  }

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
// SETTINGS VIEW (WEEKLY CLASS PILLARS & ACCOUNT)
// ============================================================================
let pillarBuffer = 15;
let pillarDays = new Set([1, 3, 5]);

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
      <div class="pillar-empty">No recurring classes yet. Add your weekly classes below to enable between-class gap detection.</div>
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
      renderMain();
      await runSupabaseWrite(() => supabase.from("class_pillars").delete().eq("id", pillar.id));
    });

    dom.pillarsList.appendChild(row);
  }
}

function openSettingsView() {
  dom.settingsUserEmail.textContent = state.user?.email || "Signed in";
  renderPillarsList();
  resetPillarForm();
  dom.settingsView.hidden = false;
}

function closeSettingsView() {
  dom.settingsView.hidden = true;
}

function renderAllVisibleViews({ animateEnter = false } = {}) {
  renderMain({ animateEnter });
  updateHistoryButtons();
  if (!dom.carouselView.hidden) {
    renderCarousel(state.carouselCenteredIndex);
  }
  if (!dom.settingsView.hidden) {
    renderPillarsList();
  }
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
      renderMain();
      syncFromSupabase();
    } else {
      state.user = null;
      saveUserToCache(null);
      showAuthView();
    }
  } catch (err) {
    console.error("Auth session check error:", err);
    if (state.user) {
      // Offline with cached user -> keep local-first UI running
      setSyncStatus("offline");
      showAppView();
      renderMain();
    } else {
      showAuthView();
    }
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      state.user = null;
      state.tasks = [];
      state.pillars = [];
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
      renderMain();
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
  dom.btnUndo.addEventListener("click", handleUndo);
  dom.btnRedo.addEventListener("click", handleRedo);

  // Carousel Overlay
  dom.btnCarouselClose.addEventListener("click", closeCarouselView);
  dom.btnCarouselAdd.addEventListener("click", () => openTaskModal(null));
  dom.carouselTrack.addEventListener("scroll", scheduleCarouselUpdate, { passive: true });
  window.addEventListener("resize", () => {
    if (!dom.carouselView.hidden) scheduleCarouselUpdate();
  });

  // Allow vertical mouse wheel on desktop to scroll carousel horizontally
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
    if (pillarDays.has(day)) {
      pillarDays.delete(day);
    } else {
      pillarDays.add(day);
    }
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
        renderMain();
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
      renderMain();
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
      const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      dateKey = toLocalDateKey(tmr);
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

    const payload = {
      title,
      course: modalCourse,
      due_at: buildDueIsoFromInputs(dateKey, dom.taskSpecificTimeToggle.checked, dom.taskTimeInput.value),
      duration_minutes: Math.min(720, Math.max(1, Math.round(durationMinutes))),
      all_at_once: dom.taskAllAtOnce.checked,
      is_starred: dom.taskIsStarred.checked
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

  // Global Keyboard Shortcuts (Edge / Desktop)
  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === "INPUT" || tag === "TEXTAREA";

    if (e.key === "Escape") {
      if (!dom.lateModal.hidden) {
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
      renderAllVisibleViews();
      syncFromSupabase();
    }
  });
}

// ============================================================================
// BOOTSTRAP (INSTANT LOCAL-FIRST RENDER + BACKGROUND SYNC + SW)
// ============================================================================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("Service worker registration skipped:", err);
      });
    });
  }
}

function boot() {
  // 1. Synchronous instant render from localStorage (< 0.2s boot, zero spinners)
  loadCacheFromStorage();
  bindEvents();
  if (state.user) {
    showAppView();
    renderMain();
  }
  updateHistoryButtons();

  // 2. Refresh time-dependent UI (midnight rollover & between-class countdowns) every 30s
  setInterval(() => {
    if (state.user && !state.isAnimatingCard) {
      renderMain();
    }
  }, 30000);

  // 3. Validate auth session & sync fresh Supabase rows in background
  initAuthAndSync();

  // 4. Register relative-path PWA service worker
  registerServiceWorker();
}

boot();
