import {
  extractDomain,
  getDomainCategory,
  isAllowedDomain,
  isExcludedDomain,
  isTrackableUrl,
  normalizeDomainList
} from "./lib/domains.js";
import {
  SENSITIVITY_THRESHOLDS,
  classifyIntention,
  computeDriftScore,
  decidePromptMode,
  getDriftReminderIntervalMs,
  isAlignedSurface,
  pickPromptReason,
  verdictStance
} from "./lib/drift.js";
import {
  DEFAULT_DAILY_GOAL_MINUTES,
  GOOD_RESPONSES,
  STREAK_MIN_FOCUS_SECONDS,
  computeSessionXp,
  computeStreak,
  dayKey,
  focusedSecondsFromEvents,
  isAlignedCategory,
  isAlignedEvent,
  lastNDayKeys,
  levelInfo,
  pruneDaily,
  recentIntentions,
  sessionElapsedMs,
  sessionRemainingMs
} from "./lib/progress.js";
import { createLock } from "./lib/lock.js";
import {
  aiCheckBlocker,
  buildRelevanceBody,
  isValidAiEndpoint,
  lookupVerdict,
  parseRetryAfterMs,
  parseVerdict,
  recentDomainsFromEvents,
  resolveAiEndpoint,
  storeVerdict,
  verdictCacheKey
} from "./lib/ai.js";
import {
  AI_LIMITS,
  AI_TIMEOUT_MS,
  AI_UNAVAILABLE_BACKOFF_MS,
  LOCK_UNLOCK_SECONDS
} from "./lib/config.js";
import { mascotUrl } from "./mascot.js";

// ---------------------------------------------------------------------------
// Constants (declared before any listener can reference them)
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  settings: "driftguard.settings",
  activeSession: "driftguard.activeSession",
  sessions: "driftguard.sessions",
  events: "driftguard.events",
  interventions: "driftguard.interventions",
  savedItems: "driftguard.savedItems",
  currentObservation: "driftguard.currentObservation",
  progress: "driftguard.progress",
  installId: "driftguard.installId"
};

// v0.1 remembered "Still relevant" forever, which whitelisted e.g. YouTube for
// every later session. Trust is now session-scoped; the old key is deleted.
const LEGACY_KEYS = ["driftguard.domainPreferences"];

const DEFAULT_SETTINGS = {
  sensitivity: "balanced",
  trackTabTitles: true,
  excludedDomains: [],
  dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
  // Opt-in AI relevance check (see AI_CHECK.md). Off until the user says yes.
  aiCheck: false,
  aiConsentAnswered: false,
  aiEndpointOverride: ""
};

const DEFAULT_PROGRESS = {
  xp: 0,
  daily: {},
  bestStreak: 0,
  lastLevelUp: null,
  celebrateSeenAt: 0
};

const TICK_ALARM = "driftguard.tick";
const BREAK_END_ALARM = "driftguard.breakEnd";
const SESSION_END_ALARM = "driftguard.sessionEnd";

const BREAK_NOTIFICATION_ID = "driftguard.breakEnd.prompt";
const INTERVENTION_NOTIFICATION_PREFIX = "driftguard.intervention.";
const DONE_NOTIFICATION_PREFIX = "driftguard.done.";
const INFO_NOTIFICATION_PREFIX = "driftguard.info.";
const INTERVENTION_NOTIFICATION_BUTTONS = ["still_relevant", "refocus"];

// A prompt the user walked away from is re-shown on the tab they moved to
// after this delay.
const REASSERT_DELAY_MS = 4000;
const IDLE_THRESHOLD_SECONDS = 60;

const BADGE_COLORS = {
  focus: "#E5552E",
  rest: "#E0A21B",
  alert: "#B8202A"
};

const FONT_PATH = "fonts/manrope-latin-wght.woff2";

// ---------------------------------------------------------------------------
// Storage + serialisation
// ---------------------------------------------------------------------------

const storage = {
  get(defaults) {
    return new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
  },
  set(items) {
    return new Promise((resolve) => chrome.storage.local.set(items, resolve));
  },
  remove(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }
};

const withLock = createLock();

// Every entry point goes through here: one task at a time, errors logged, and
// the toolbar badge refreshed afterwards. Internal helpers never call run().
function run(label, task) {
  return withLock(async () => {
    try {
      return await task();
    } finally {
      await refreshBadge().catch(() => {});
    }
  }).catch((error) => {
    console.error(`DriftGuard ${label} failed`, error);
    throw error;
  });
}

function fireAndForget(label, task) {
  run(label, task).catch(() => {});
}

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  fireAndForget("install", boot);
});

chrome.runtime.onStartup.addListener(() => {
  fireAndForget("startup", boot);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  run(`message ${message?.type}`, () => handleMessage(message, sender))
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Unknown error" }));
  return true;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  fireAndForget("tab-activated", async () => {
    const tab = await getTab(tabId);
    if (tab) await observeTab(tab, "tab-activated");
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && !changeInfo.title && changeInfo.status !== "complete") return;

  fireAndForget("tab-updated", async () => {
    const active = await getActiveTab();
    if (active?.id === tabId) await observeTab(active, "tab-updated");
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  fireAndForget("tab-removed", () => handleDriftTabClosed(tabId));
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  fireAndForget("window-focus", () => observeActiveTab("window-focus"));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) fireAndForget("tick", handleTick);
  if (alarm.name === SESSION_END_ALARM) fireAndForget("session-end-alarm", handleTick);
  if (alarm.name === BREAK_END_ALARM) fireAndForget("break-end", handleBreakEnd);
});

if (chrome.idle) {
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
  chrome.idle.onStateChanged.addListener((state) => {
    fireAndForget("idle", () =>
      state === "active" ? observeActiveTab("idle-active") : finalizeObservation(`idle-${state}`)
    );
  });
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command, tab) => {
    fireAndForget(`command ${command}`, () => handleCommand(command, tab));
  });
}

if (chrome.notifications?.onButtonClicked) {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    fireAndForget("notification-button", async () => {
      if (notificationId === BREAK_NOTIFICATION_ID) {
        chrome.notifications.clear(BREAK_NOTIFICATION_ID);
        const session = await getActiveSession();
        await handleBreakEndResponse(
          { breakEndId: session?.breakEndPromptId, action: buttonIndex === 1 ? "extend_5" : "return" },
          null
        );
        return;
      }

      const interventionId = parseInterventionNotificationId(notificationId);
      if (!interventionId) return;

      chrome.notifications.clear(notificationId);
      await handleInterventionResponse(
        { interventionId, response: INTERVENTION_NOTIFICATION_BUTTONS[buttonIndex] || "dismiss" },
        null
      );
    });
  });
}

if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId.startsWith(DONE_NOTIFICATION_PREFIX)) {
      chrome.notifications.clear(notificationId);
      openRecapTab(notificationId.slice(DONE_NOTIFICATION_PREFIX.length));
    }
  });
}

if (chrome.notifications?.onClosed) {
  chrome.notifications.onClosed.addListener((notificationId, byUser) => {
    const interventionId = parseInterventionNotificationId(notificationId);
    if (!interventionId || !byUser) return;
    fireAndForget("notification-closed", () =>
      handleInterventionResponse({ interventionId, response: "dismiss" }, null)
    );
  });
}

fireAndForget("wake", boot);

// ---------------------------------------------------------------------------
// Boot / alarms
// ---------------------------------------------------------------------------

async function boot() {
  await initializeDefaults();
  await ensureSessionAlarms();
}

async function initializeDefaults() {
  const values = await storage.get({
    [STORAGE_KEYS.settings]: null,
    [STORAGE_KEYS.progress]: null,
    [STORAGE_KEYS.installId]: null
  });

  const updates = {};
  if (!values[STORAGE_KEYS.settings]) updates[STORAGE_KEYS.settings] = DEFAULT_SETTINGS;
  if (!values[STORAGE_KEYS.progress]) updates[STORAGE_KEYS.progress] = DEFAULT_PROGRESS;
  // A random id for the AI check's per-install rate limit. Not tied to the
  // user; "Clear all data" replaces it.
  if (!values[STORAGE_KEYS.installId]) updates[STORAGE_KEYS.installId] = createId();
  if (Object.keys(updates).length) await storage.set(updates);

  await storage.remove(LEGACY_KEYS);
}

// MV3 tears down the service worker when idle. Every wake-up path must restore
// the tick for an in-flight session, or drift on a tab the user never leaves is
// never re-scored and no prompt can ever fire.
async function ensureSessionAlarms() {
  const session = await getActiveSession();
  if (!session || session.status === "ended") {
    chrome.alarms.clear(TICK_ALARM);
    chrome.alarms.clear(SESSION_END_ALARM);
    return;
  }

  if (!(await getAlarm(TICK_ALARM))) {
    chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  }

  if (session.breakUntil && session.breakUntil > Date.now() && !(await getAlarm(BREAK_END_ALARM))) {
    scheduleBreakEndAlarm(Math.max(0.5, (session.breakUntil - Date.now()) / 60000));
  }

  if (!(await getAlarm(SESSION_END_ALARM))) scheduleSessionEndAlarm(session);
}

function getAlarm(name) {
  return new Promise((resolve) => {
    chrome.alarms.get(name, (alarm) => resolve(chrome.runtime.lastError ? null : alarm));
  });
}

function scheduleBreakEndAlarm(minutes) {
  chrome.alarms.create(BREAK_END_ALARM, { delayInMinutes: Math.max(0.5, minutes) });
}

function scheduleSessionEndAlarm(session) {
  chrome.alarms.clear(SESSION_END_ALARM);
  if (!session?.durationMinutes || session.status !== "active") return;
  const remaining = sessionRemainingMs(session);
  chrome.alarms.create(SESSION_END_ALARM, { when: Date.now() + Math.max(1000, remaining) });
}

function queryIdleState(seconds) {
  return new Promise((resolve) => {
    if (!chrome.idle?.queryState) {
      resolve("active");
      return;
    }
    chrome.idle.queryState(seconds, (state) => resolve(chrome.runtime.lastError ? "active" : state));
  });
}

async function handleTick() {
  const session = await getActiveSession();
  if (!session || session.status === "ended") {
    chrome.alarms.clear(TICK_ALARM);
    return;
  }

  if (await maybeCompleteTimedSession(session)) return;
  if (session.status !== "active") return;

  // Away from the keyboard: don't restart observation, or AFK time gets
  // counted as tracked time and prompts fire at an empty chair.
  const idleState = await queryIdleState(IDLE_THRESHOLD_SECONDS);
  if (idleState !== "active") {
    await finalizeObservation(`idle-${idleState}`);
    return;
  }

  await observeActiveTab("tick");
}

// ---------------------------------------------------------------------------
// Messages + commands
// ---------------------------------------------------------------------------

async function handleMessage(message, sender) {
  const payload = message?.payload || {};

  switch (message?.type) {
    case "DRIFTGUARD_GET_SNAPSHOT":
      return getSnapshot();
    case "DRIFTGUARD_START_SESSION":
      return startSession(payload);
    case "DRIFTGUARD_END_SESSION":
      return endSession();
    case "DRIFTGUARD_PAUSE_SESSION":
      return setSessionPaused(true);
    case "DRIFTGUARD_RESUME_SESSION":
      return setSessionPaused(false);
    case "DRIFTGUARD_INTERVENTION_RESPONSE":
      return handleInterventionResponse(payload, sender);
    case "DRIFTGUARD_BREAK_END_RESPONSE":
      return handleBreakEndResponse(payload, sender);
    case "DRIFTGUARD_GET_RECAP":
      return getRecap(payload.sessionId);
    case "DRIFTGUARD_UPDATE_SETTINGS":
      return updateSettings(payload);
    case "DRIFTGUARD_CLEAR_DATA":
      return clearAllData();
    case "DRIFTGUARD_SAVE_CURRENT":
      return saveCurrentForLater("manual-save");
    case "DRIFTGUARD_SAVED_DONE":
      return markSavedDone(payload.ids || [payload.id]);
    case "DRIFTGUARD_SAVED_REMOVE":
      return removeSaved(payload.id);
    case "DRIFTGUARD_TRUST_CURRENT":
      return trustCurrentDomain();
    case "DRIFTGUARD_ACK_CELEBRATION":
      return ackCelebration();
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function handleCommand(command, commandTab) {
  if (command === "save-for-later") {
    const tab = commandTab?.id ? commandTab : await getActiveTab();
    const result = await saveCurrentForLater("shortcut", tab);
    await toast(
      tab,
      result.ok ? (result.duplicate ? "Already in your parking lot" : "Saved for later") : result.error,
      result.ok ? "happy" : "thinking"
    );
    return;
  }

  if (command === "toggle-focus") {
    const session = await getActiveSession();
    if (session && session.status !== "ended") {
      const result = await endSession();
      if (result.ok) openRecapTab(result.sessionId);
      return;
    }

    const values = await storage.get({ [STORAGE_KEYS.sessions]: [] });
    const sessions = values[STORAGE_KEYS.sessions];
    const [intention] = recentIntentions(sessions, 1);

    if (!intention) {
      await openPopupOrTab();
      return;
    }

    const lastDuration = sessions.find((item) => item.intention === intention)?.durationMinutes ?? 25;
    const tab = commandTab?.id ? commandTab : await getActiveTab();
    const domain = tab?.url && isTrackableUrl(tab.url) ? extractDomain(tab.url) : "";
    const trust = domain && !["ambiguous", "distracting"].includes(getDomainCategory(domain, null));

    const result = await startSession({
      intention,
      durationMinutes: lastDuration,
      allowedDomains: trust ? [domain] : []
    });

    if (result.ok) {
      const label = lastDuration ? `${lastDuration} min` : "open session";
      const shown = await toast(tab, `Focus on: ${intention} · ${label}`, "happy");
      if (!shown) {
        await createNotification(`${INFO_NOTIFICATION_PREFIX}${Date.now()}`, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "Focus started",
          message: `${intention} · ${label}`,
          priority: 0
        });
      }
    }
  }
}

async function openPopupOrTab() {
  try {
    await chrome.action.openPopup();
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/popup.html?view=tab") });
  }
}

function openRecapTab(sessionId) {
  if (!sessionId) return;
  chrome.tabs.create({
    url: chrome.runtime.getURL(`src/recap.html?sessionId=${encodeURIComponent(sessionId)}`)
  });
}

// Small confirmation card in the page. Returns false on pages we can't touch.
async function toast(tab, text, mood = "happy") {
  if (!tab?.id || !tab.url || !isTrackableUrl(tab.url) || tab.incognito) return false;
  try {
    await showInTab(tab.id, {
      type: "DRIFTGUARD_TOAST",
      payload: { text, mascotUrl: mascotUrl(mood), fontUrl: chrome.runtime.getURL(FONT_PATH) }
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Snapshot for the popup
// ---------------------------------------------------------------------------

async function getSnapshot() {
  const values = await storage.get({
    [STORAGE_KEYS.settings]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.activeSession]: null,
    [STORAGE_KEYS.currentObservation]: null,
    [STORAGE_KEYS.sessions]: [],
    [STORAGE_KEYS.interventions]: [],
    [STORAGE_KEYS.savedItems]: [],
    [STORAGE_KEYS.progress]: DEFAULT_PROGRESS
  });

  const settings = { ...DEFAULT_SETTINGS, ...values[STORAGE_KEYS.settings] };
  const activeSession = values[STORAGE_KEYS.activeSession];
  const observation = values[STORAGE_KEYS.currentObservation];
  const progress = { ...DEFAULT_PROGRESS, ...values[STORAGE_KEYS.progress] };
  const sessions = values[STORAGE_KEYS.sessions];
  const now = Date.now();

  const interventions = activeSession
    ? values[STORAGE_KEYS.interventions].filter((item) => item.sessionId === activeSession.id)
    : [];
  const sessionSaved = activeSession
    ? values[STORAGE_KEYS.savedItems].filter((item) => item.sessionId === activeSession.id)
    : [];

  const currentTab = await getActiveTab();
  const currentDomain =
    currentTab?.url && isTrackableUrl(currentTab.url) ? extractDomain(currentTab.url) : null;

  const liveObservation = activeSession && observation?.sessionId === activeSession.id ? observation : null;
  const liveVerdict =
    settings.aiCheck && liveObservation
      ? liveObservation.aiVerdict || lookupVerdict(activeSession.aiVerdicts, liveObservation.url)
      : null;
  const liveStance = verdictStance(liveVerdict);

  // Today's focus = finished observations + the one still running, if it counts.
  let todayFocusSeconds = progress.daily?.[dayKey(now)]?.focusSeconds || 0;
  if (
    activeSession?.status === "active" &&
    liveObservation &&
    (isAlignedCategory(getDomainCategory(liveObservation.domain, activeSession)) || liveStance === "on_task")
  ) {
    todayFocusSeconds += Math.max(0, Math.round((now - observation.startedAt) / 1000));
  }

  const level = levelInfo(progress.xp);
  const celebrate =
    progress.lastLevelUp && progress.lastLevelUp.at > (progress.celebrateSeenAt || 0)
      ? progress.lastLevelUp
      : null;

  const lastEnded = sessions.find((item) => item.status === "ended");

  return {
    ok: true,
    now,
    settings,
    activeSession,
    elapsedMs: activeSession ? sessionElapsedMs(activeSession, now) : 0,
    remainingMs: activeSession ? sessionRemainingMs(activeSession, now) : null,
    breakRemainingMs:
      activeSession?.breakUntil && activeSession.breakUntil > now ? activeSession.breakUntil - now : 0,
    pendingPrompt: Boolean(activeSession?.driftWatch?.awaitingResponse),
    pendingPromptMode: activeSession?.driftWatch?.awaitingResponse ? activeSession.driftWatch.mode || "card" : null,
    ai: {
      enabled: Boolean(settings.aiCheck),
      consentNeeded: !settings.aiCheck && !settings.aiConsentAnswered,
      customEndpoint: Boolean(String(settings.aiEndpointOverride || "").trim()),
      status: settings.aiCheck ? liveObservation?.aiStatus || null : null,
      verdict: liveVerdict
        ? {
            related: liveVerdict.related,
            confidence: liveVerdict.confidence,
            reason: liveVerdict.reason,
            stance: liveStance,
            domain: liveObservation.domain
          }
        : null,
      calls: activeSession?.aiCalls || 0
    },
    currentObservation: observation,
    currentDomain,
    currentDomainCategory: currentDomain ? getDomainCategory(currentDomain, activeSession) : null,
    currentDomainBaseCategory: currentDomain ? getDomainCategory(currentDomain, null) : null,
    activeCounts: {
      interventions: interventions.length,
      savedItems: sessionSaved.length
    },
    parkingLot: values[STORAGE_KEYS.savedItems]
      .filter((item) => !item.done)
      .slice(-30)
      .reverse(),
    recentIntentions: recentIntentions(sessions, 5),
    lastDurationMinutes: sessions[0]?.durationMinutes ?? 25,
    lastSessionId: lastEnded?.id || null,
    progress: {
      ...level,
      streak: computeStreak(progress.daily, now),
      bestStreak: progress.bestStreak || 0,
      todayFocusSeconds,
      goalMinutes: settings.dailyGoalMinutes || DEFAULT_DAILY_GOAL_MINUTES,
      celebrate
    }
  };
}

async function ackCelebration() {
  const progress = await getProgress();
  await storage.set({ [STORAGE_KEYS.progress]: { ...progress, celebrateSeenAt: Date.now() } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

async function startSession(payload) {
  const intention = String(payload.intention || "").trim().slice(0, 200);
  if (!intention) return { ok: false, error: "Add what you're working on first." };

  const existing = await getActiveSession();
  if (existing && existing.status !== "ended") {
    return { ok: false, error: "End the current session before starting a new one." };
  }

  const settings = await getSettings();
  const duration = Number(payload.durationMinutes || 0);

  const session = {
    id: createId(),
    intention,
    intentionType: classifyIntention(intention),
    startedAt: Date.now(),
    endedAt: null,
    durationMinutes: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 600) : 0,
    sensitivity: payload.sensitivity || settings.sensitivity,
    allowedDomains: normalizeDomainList(payload.allowedDomains || []),
    status: "active",
    pausedAt: null,
    pausedTotalMs: 0,
    breakUntil: null,
    lastPromptAt: null,
    driftWatch: null,
    lastAlignedUrl: null,
    lastAlignedTitle: null,
    lastAlignedDomain: null,
    lastAlignedTabId: null,
    lastAlignedWindowId: null,
    // Lock mode escalates after a break has been taken.
    breaksTaken: 0,
    // AI check budget and verdict cache (verdicts only; never page content).
    aiCalls: 0,
    aiLastCallAt: null,
    aiBackoffUntil: null,
    aiVerdicts: {}
  };

  await updateActiveSession(session);
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  scheduleSessionEndAlarm(session);
  await observeActiveTab("session-start");

  return { ok: true, session: await getActiveSession() };
}

async function maybeCompleteTimedSession(session) {
  if (!session?.durationMinutes || session.status === "ended") return false;
  if (sessionRemainingMs(session) > 1000) return false;

  const result = await endSession({ completed: true });
  if (!result.ok) return false;

  const xp = result.summary?.xp?.total || 0;
  const levelUp = result.summary?.levelAfter > result.summary?.levelBefore;
  await createNotification(`${DONE_NOTIFICATION_PREFIX}${result.sessionId}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: `Session complete — +${xp} XP`,
    message: levelUp
      ? `${session.intention} · Level up! You're now level ${result.summary.levelAfter}.`
      : session.intention,
    priority: 1
  });
  openRecapTab(result.sessionId);
  return true;
}

async function endSession({ completed = false } = {}) {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  await finalizeObservation("session-end");
  cancelAiCheck();

  const now = Date.now();
  // The per-URL verdict cache is only useful while the session runs; the
  // stored history keeps the count, not the URLs.
  const { aiVerdicts, ...rest } = session;
  const ended = {
    ...rest,
    status: "ended",
    endedAt: now,
    pausedAt: null,
    pausedTotalMs: (session.pausedTotalMs || 0) + (session.pausedAt ? now - session.pausedAt : 0),
    breakUntil: null,
    driftWatch: null,
    aiVerdictCount: Object.keys(aiVerdicts || {}).length
  };

  const values = await storage.get({
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.interventions]: []
  });
  const events = values[STORAGE_KEYS.events].filter((event) => event.sessionId === session.id);
  const goodResponses = values[STORAGE_KEYS.interventions].filter(
    (item) => item.sessionId === session.id && GOOD_RESPONSES.includes(item.response)
  ).length;

  const focusedSeconds = focusedSecondsFromEvents(events);
  const xp = computeSessionXp({ focusedSeconds, completed, goodResponses });

  const progress = await getProgress();
  const before = levelInfo(progress.xp);
  progress.xp = (progress.xp || 0) + xp.total;
  const after = levelInfo(progress.xp);

  const key = dayKey(now);
  const day = { focusSeconds: 0, sessions: 0, qualified: false, ...(progress.daily[key] || {}) };
  day.sessions += 1;
  if (focusedSeconds >= STREAK_MIN_FOCUS_SECONDS) day.qualified = true;
  progress.daily = pruneDaily({ ...progress.daily, [key]: day }, 120, now);

  const streak = computeStreak(progress.daily, now);
  progress.bestStreak = Math.max(progress.bestStreak || 0, streak);
  if (after.level > before.level) {
    progress.lastLevelUp = { level: after.level, at: now, sessionId: session.id };
  }

  ended.summary = {
    completed,
    focusedSeconds,
    goodResponses,
    xp,
    xpTotal: progress.xp,
    levelBefore: before.level,
    levelAfter: after.level,
    streak,
    qualified: focusedSeconds >= STREAK_MIN_FOCUS_SECONDS
  };

  await upsertSession(ended);
  await storage.set({
    [STORAGE_KEYS.activeSession]: null,
    [STORAGE_KEYS.currentObservation]: null,
    [STORAGE_KEYS.progress]: progress
  });

  chrome.alarms.clear(TICK_ALARM);
  chrome.alarms.clear(BREAK_END_ALARM);
  chrome.alarms.clear(SESSION_END_ALARM);
  chrome.notifications?.clear?.(BREAK_NOTIFICATION_ID);

  return { ok: true, sessionId: ended.id, summary: ended.summary };
}

async function setSessionPaused(paused) {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  const now = Date.now();
  let updated;

  if (paused) {
    if (session.status === "paused") return { ok: true, session };
    await finalizeObservation("manual-pause");
    updated = { ...session, status: "paused", pausedAt: now };
    chrome.alarms.clear(SESSION_END_ALARM);
  } else {
    if (session.status !== "paused") return { ok: true, session };
    updated = {
      ...session,
      status: "active",
      pausedAt: null,
      pausedTotalMs: (session.pausedTotalMs || 0) + (session.pausedAt ? now - session.pausedAt : 0)
    };
  }

  await updateActiveSession(updated);

  if (!paused) {
    scheduleSessionEndAlarm(updated);
    await observeActiveTab("manual-resume");
  }

  return { ok: true, session: await getActiveSession() };
}

async function trustCurrentDomain() {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  const tab = await getActiveTab();
  if (!tab?.url || !isTrackableUrl(tab.url)) return { ok: false, error: "This page can't be trusted." };

  const domain = extractDomain(tab.url);
  const updated = {
    ...session,
    allowedDomains: normalizeDomainList([...(session.allowedDomains || []), domain]),
    driftWatch: null
  };
  await updateActiveSession(updated);
  await observeActiveTab("trust-current");
  return { ok: true, domain };
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------

async function handleDriftTabClosed(tabId) {
  const session = await getActiveSession();
  if (!session || session.status !== "active") return;
  if (!session.driftWatch?.awaitingResponse) return;

  const observation = (await storage.get({ [STORAGE_KEYS.currentObservation]: null }))[
    STORAGE_KEYS.currentObservation
  ];
  if (observation && observation.tabId !== tabId) return;

  // Give the browser a moment to settle on the next active tab.
  setTimeout(() => fireAndForget("drift-tab-closed", () => observeActiveTab("drift-tab-closed")), 600);
}

async function observeActiveTab(reason) {
  const tab = await getActiveTab();
  if (!tab) return;
  await observeTab(tab, reason);
}

async function observeTab(tab, reason) {
  const session = await getActiveSession();
  if (!session || session.status !== "active") return;

  if (await maybeCompleteTimedSession(session)) return;

  // Breaks are not tracked: the time is neither focus nor drift.
  if (session.breakUntil && session.breakUntil > Date.now()) {
    await finalizeObservation(`break-${reason}`);
    return;
  }

  const settings = await getSettings();

  if (tab?.incognito) {
    await finalizeObservation(`incognito-${reason}`);
    return;
  }

  if (!tab?.url || !isTrackableUrl(tab.url)) {
    await finalizeObservation(`untrackable-${reason}`);
    return;
  }

  const domain = extractDomain(tab.url);
  if (!domain || isExcludedDomain(domain, settings.excludedDomains)) {
    await finalizeObservation(`excluded-${reason}`);
    return;
  }

  const values = await storage.get({ [STORAGE_KEYS.currentObservation]: null });
  const current = values[STORAGE_KEYS.currentObservation];
  const title = settings.trackTabTitles ? tab.title || "" : "";
  const sameObservation =
    current && current.sessionId === session.id && current.tabId === tab.id && current.url === tab.url;

  if (sameObservation) {
    const updated = { ...current, title, lastSeenAt: Date.now(), reason };
    await storage.set({ [STORAGE_KEYS.currentObservation]: updated });
    await maybeTriggerIntervention(updated);
    await scheduleAiCheck(updated);
    return;
  }

  await finalizeObservation(`switch-${reason}`);

  const observation = {
    sessionId: session.id,
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    domain,
    title,
    startedAt: Date.now(),
    lastSeenAt: Date.now(),
    reason
  };

  await storage.set({ [STORAGE_KEYS.currentObservation]: observation });
  await maybeTriggerIntervention(observation);
  await scheduleAiCheck(observation);
}

async function finalizeObservation(reason) {
  const values = await storage.get({
    [STORAGE_KEYS.currentObservation]: null,
    [STORAGE_KEYS.activeSession]: null
  });
  const observation = values[STORAGE_KEYS.currentObservation];
  const session = values[STORAGE_KEYS.activeSession];

  if (!observation) return;

  const now = Date.now();
  const durationSeconds = Math.max(0, Math.round((now - observation.startedAt) / 1000));

  if (session && observation.sessionId === session.id && durationSeconds >= 2) {
    const settings = await getSettings();
    if (!isExcludedDomain(observation.domain, settings.excludedDomains)) {
      const category = getDomainCategory(observation.domain, session);
      const ai = settings.aiCheck
        ? verdictStance(observation.aiVerdict || lookupVerdict(session.aiVerdicts, observation.url))
        : null;
      const event = {
        id: createId(),
        sessionId: observation.sessionId,
        timestamp: observation.startedAt,
        endedAt: now,
        eventType: "tab-visit",
        domain: observation.domain,
        title: settings.trackTabTitles ? observation.title : "",
        durationSeconds,
        category,
        reason
      };
      if (ai) event.ai = ai;

      await appendBounded(STORAGE_KEYS.events, event, 4000);

      if (isAlignedEvent(event)) {
        const progress = await getProgress();
        const key = dayKey(now);
        const day = { focusSeconds: 0, sessions: 0, qualified: false, ...(progress.daily[key] || {}) };
        day.focusSeconds += durationSeconds;
        progress.daily = { ...progress.daily, [key]: day };
        await storage.set({ [STORAGE_KEYS.progress]: progress });
      }
    }
  }

  await storage.set({ [STORAGE_KEYS.currentObservation]: null });
}

// ---------------------------------------------------------------------------
// Drift prompts
// ---------------------------------------------------------------------------

function promptAssets(mood = "alert") {
  return {
    mascotUrl: mascotUrl(mood),
    mascotUrls: {
      alert: mascotUrl("alert"),
      sleepy: mascotUrl("sleepy"),
      happy: mascotUrl("happy")
    },
    fontUrl: chrome.runtime.getURL(FONT_PATH)
  };
}

async function maybeTriggerIntervention(observation) {
  const session = await getActiveSession();
  if (!session || session.status !== "active") return;

  const now = Date.now();
  if (session.breakUntil && session.breakUntil > now) return;

  const settings = await getSettings();
  const values = await storage.get({ [STORAGE_KEYS.events]: [] });

  // A cached AI verdict for this URL, when the opt-in check is on.
  const aiVerdict = settings.aiCheck
    ? observation.aiVerdict || lookupVerdict(session.aiVerdicts, observation.url)
    : null;

  const score = computeDriftScore({
    session,
    observation,
    settings,
    events: values[STORAGE_KEYS.events],
    now,
    aiVerdict
  });

  const threshold = SENSITIVITY_THRESHOLDS[session.sensitivity] || SENSITIVITY_THRESHOLDS.balanced;

  if (score.score < threshold) {
    // An unanswered prompt must not be dismissable by switching tabs. Only a
    // genuine return to the work clears it; a merely-quiet tab (a new tab page,
    // an unclassified site) leaves the drift watch standing so the question
    // follows the user instead of being escaped.
    const returnedToWork = isAlignedSurface(observation, session, score.category, score.ai);
    const pendingWatch =
      session.driftWatch?.status === "active" && session.driftWatch.awaitingResponse
        ? session.driftWatch
        : null;

    if (pendingWatch && !returnedToWork) {
      await reassertPendingPrompt(session, observation, pendingWatch, now);
      return;
    }

    // Back at the work: a lock left on the drift tab would only get in the way,
    // and neither would a card still showing on a page the AI just cleared.
    if (pendingWatch && (pendingWatch.mode === "lock" || score.ai === "on_task")) {
      await clearPromptInTabs(pendingWatch, pendingWatch.pendingInterventionId, null);
    }

    const sessionForMemory = session.driftWatch
      ? await updateActiveSession({ ...session, driftWatch: null })
      : session;

    // "Quiet" is not the same as "this is the work". An unclassified tab scores
    // low simply by being unknown, so remembering it would overwrite the real
    // work surface and send Refocus somewhere the user never chose.
    if (observation.url && isAlignedSurface(observation, sessionForMemory, score.category, score.ai)) {
      await rememberAlignedSurface(sessionForMemory, observation);
    }
    return;
  }

  const driftWatch = session.driftWatch?.status === "active" ? session.driftWatch : null;
  const shouldPrompt =
    !driftWatch || !driftWatch.lastPromptAt || now - driftWatch.lastPromptAt >= getDriftReminderIntervalMs(session);

  if (!shouldPrompt) return;

  const promptCount = (driftWatch?.promptCount || 0) + 1;
  const interventionId = createId();
  const mode = decidePromptMode({ breaksTaken: session.breaksTaken, promptCount });
  const { reason, source: reasonSource } = pickPromptReason(score);
  const unlockAt = mode === "lock" ? now + LOCK_UNLOCK_SECONDS * 1000 : null;

  const nextDriftWatch = {
    id: driftWatch?.id || createId(),
    status: "active",
    awaitingResponse: true,
    startedAt: driftWatch?.startedAt || now,
    lastPromptAt: now,
    promptCount,
    firstDomain: driftWatch?.firstDomain || observation.domain,
    currentDomain: observation.domain,
    currentTitle: observation.title,
    lastScore: score.score,
    pendingInterventionId: interventionId,
    mode,
    unlockAt,
    lastReason: reason,
    lastReasonSource: reasonSource,
    shownTabIds: [observation.tabId]
  };

  await appendBounded(
    STORAGE_KEYS.interventions,
    {
      id: interventionId,
      watchId: nextDriftWatch.id,
      sessionId: session.id,
      timestamp: now,
      domain: observation.domain,
      title: observation.title,
      category: score.category,
      driftScore: score.score,
      reasons: score.reasons,
      response: "shown",
      deliveryStatus: "pending",
      promptIndex: promptCount,
      isReminder: promptCount > 1,
      mode,
      ...(score.ai ? { ai: score.ai } : {}),
      ...(reasonSource === "ai" ? { aiReason: reason } : {})
    },
    1000
  );

  await updateActiveSession({ ...session, lastPromptAt: now, driftWatch: nextDriftWatch });

  try {
    await showInTab(observation.tabId, {
      type: "DRIFTGUARD_SHOW_INTERVENTION",
      payload: {
        kind: "drift",
        interventionId,
        intention: session.intention,
        domain: observation.domain,
        category: score.category,
        reason,
        reasonSource,
        isReminder: promptCount > 1,
        reminderCount: Math.max(0, promptCount - 1),
        mode,
        unlockAt,
        unlockSeconds: LOCK_UNLOCK_SECONDS,
        ...promptAssets("alert")
      }
    });
    await patchIntervention(interventionId, { deliveryStatus: "shown" });
  } catch (error) {
    const notified = await showInterventionNotification(interventionId, {
      intention: session.intention,
      domain: observation.domain,
      isReminder: promptCount > 1
    });

    await patchIntervention(interventionId, {
      deliveryStatus: notified ? "notified" : "failed",
      error: error.message || "Unable to show overlay"
    });

    if (notified) return;

    const latestSession = await getActiveSession();
    if (latestSession?.id === session.id) {
      const retryableWatch = latestSession.driftWatch
        ? {
            ...latestSession.driftWatch,
            lastPromptAt: null,
            promptCount: Math.max(0, (latestSession.driftWatch.promptCount || 1) - 1)
          }
        : latestSession.driftWatch;
      await updateActiveSession({ ...latestSession, lastPromptAt: null, driftWatch: retryableWatch });
    }
    console.warn("Unable to show DriftGuard overlay on this page", error);
  }
}

let reassertTimer = null;

async function reassertPendingPrompt(session, observation, watch, now) {
  if (watch.lastPromptAt && now - watch.lastPromptAt < REASSERT_DELAY_MS) {
    // Not yet due. chrome.alarms has a 30s floor, so use a short timer to come
    // back for it; the periodic tick is the backstop if the worker is evicted.
    const wait = REASSERT_DELAY_MS - (now - watch.lastPromptAt);
    clearTimeout(reassertTimer);
    reassertTimer = setTimeout(
      () => fireAndForget("reassert", () => observeActiveTab("reassert-due")),
      wait + 250
    );
    return;
  }

  const interventionId = watch.pendingInterventionId || createId();

  if (!watch.pendingInterventionId) {
    await appendBounded(
      STORAGE_KEYS.interventions,
      {
        id: interventionId,
        watchId: watch.id,
        sessionId: session.id,
        timestamp: now,
        domain: watch.currentDomain,
        title: watch.currentTitle,
        driftScore: watch.lastScore,
        reasons: ["Prompt re-asserted after a tab switch"],
        response: "shown",
        deliveryStatus: "pending",
        promptIndex: watch.promptCount,
        isReminder: true,
        mode: watch.mode || "card"
      },
      1000
    );
  }

  const mode = watch.mode || "card";
  const shownTabIds = Array.from(new Set([...(watch.shownTabIds || []), observation.tabId])).slice(-20);

  await updateActiveSession({
    ...session,
    driftWatch: {
      ...watch,
      lastPromptAt: now,
      pendingInterventionId: interventionId,
      followedAcrossTabs: (watch.followedAcrossTabs || 0) + 1,
      shownTabIds
    }
  });

  // A lock follows the user with its original reason and countdown, so a tab
  // switch neither softens it nor restarts the wait.
  const lockReason = mode === "lock" && watch.lastReason;

  try {
    await showInTab(observation.tabId, {
      type: "DRIFTGUARD_SHOW_INTERVENTION",
      payload: {
        kind: "drift",
        interventionId,
        intention: session.intention,
        domain: watch.currentDomain || observation.domain,
        reason: lockReason
          ? watch.lastReason
          : `Still waiting on an answer about ${watch.currentDomain || "the last tab"}`,
        reasonSource: lockReason ? watch.lastReasonSource || "rules" : "rules",
        isReminder: true,
        reminderCount: Math.max(1, watch.promptCount || 1),
        mode,
        unlockAt: watch.unlockAt || null,
        unlockSeconds: LOCK_UNLOCK_SECONDS,
        ...promptAssets("alert")
      }
    });
    await patchIntervention(interventionId, { deliveryStatus: "shown" });
  } catch (error) {
    const notified = await showInterventionNotification(interventionId, {
      intention: session.intention,
      domain: watch.currentDomain || observation.domain,
      isReminder: true
    });
    await patchIntervention(interventionId, {
      deliveryStatus: notified ? "notified" : "failed",
      error: error.message || "Unable to re-show overlay"
    });
  }
}

async function handleInterventionResponse(payload, sender) {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  const values = await storage.get({ [STORAGE_KEYS.interventions]: [] });
  const intervention = values[STORAGE_KEYS.interventions].find((item) => item.id === payload.interventionId);

  // Only answer prompts this session actually showed, and only once.
  if (!intervention || intervention.sessionId !== session.id) {
    return { ok: false, error: "That prompt has expired." };
  }
  if (intervention.response && intervention.response !== "shown") {
    return { ok: true, session, duplicate: true };
  }

  const allowed = ["still_relevant", "save_later", "break_5", "break_10", "refocus", "dismiss", "end_session"];
  const response = allowed.includes(payload.response) ? payload.response : "dismiss";

  const settings = await getSettings();
  const tab = sender?.tab || (await getActiveTab());
  const tabDomain = tab?.url && isTrackableUrl(tab.url) ? extractDomain(tab.url) : "";
  const domain = intervention.domain || tabDomain || "unknown";

  await patchIntervention(intervention.id, {
    response,
    respondedAt: Date.now(),
    deliveryStatus: "responded",
    title: settings.trackTabTitles ? intervention.title || tab?.title || "" : ""
  });

  // The same prompt may be showing on other tabs it followed the user to.
  await clearPromptInTabs(session.driftWatch, intervention.id, sender?.tab?.id ?? null);

  if (response === "end_session") {
    const result = await endSession();
    if (result.ok) openRecapTab(result.sessionId);
    return { ok: result.ok, ended: result.ok, sessionId: result.sessionId, error: result.error };
  }

  let updatedSession = { ...session };

  if (updatedSession.driftWatch) {
    updatedSession.driftWatch = { ...updatedSession.driftWatch, awaitingResponse: false, pendingInterventionId: null };
  }

  if (response === "still_relevant") {
    // Trust lasts for this session only. Nothing is written for future ones.
    const sameTab = tabDomain && tabDomain === domain;
    updatedSession = {
      ...updatedSession,
      allowedDomains: normalizeDomainList([...(updatedSession.allowedDomains || []), domain]),
      lastAlignedUrl: sameTab ? tab.url : updatedSession.lastAlignedUrl,
      lastAlignedTitle: sameTab && settings.trackTabTitles ? tab.title || "" : updatedSession.lastAlignedTitle,
      lastAlignedDomain: sameTab ? domain : updatedSession.lastAlignedDomain,
      lastAlignedTabId: sameTab ? tab.id : updatedSession.lastAlignedTabId,
      lastAlignedWindowId: sameTab ? tab.windowId : updatedSession.lastAlignedWindowId,
      driftWatch: null
    };
  }

  if (response === "save_later") {
    await saveCurrentForLater("intervention-save", tab);
  }

  if (response.startsWith("break_")) {
    const requestedMinutes = Number(response.slice("break_".length));
    const breakMinutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : 10;

    updatedSession.breakUntil = Date.now() + breakMinutes * 60 * 1000;
    updatedSession.breakMinutes = breakMinutes;
    updatedSession.breaksTaken = (updatedSession.breaksTaken || 0) + 1;
    updatedSession.driftWatch = null;
    await finalizeObservation("break-start");
    scheduleBreakEndAlarm(breakMinutes);
  }

  if (response === "refocus") {
    updatedSession.driftWatch = null;
    await refocusToLastAligned(updatedSession, tab);
  }

  await updateActiveSession(updatedSession);
  return { ok: true, session: updatedSession };
}

// ---------------------------------------------------------------------------
// Breaks
// ---------------------------------------------------------------------------

async function handleBreakEnd() {
  const session = await getActiveSession();
  if (!session || session.status === "ended" || !session.breakUntil) return;

  // A break that was extended since scheduling should not prompt yet.
  if (session.breakUntil > Date.now() + 5000) {
    scheduleBreakEndAlarm((session.breakUntil - Date.now()) / 60000);
    return;
  }

  const breakEndId = createId();
  const cleared = { ...session, breakUntil: null, breakMinutes: null, breakEndPromptId: breakEndId };
  await updateActiveSession(cleared);

  // The in-page card is the friendly path; OS notifications are the fallback
  // for pages we can't draw on (chrome://, the Web Store, PDFs).
  if (await showBreakEndOverlay(cleared, breakEndId)) return;

  await createNotification(BREAK_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Break's over",
    message: `Ready to get back to: ${cleared.intention}?`,
    buttons: [{ title: "Back to work" }, { title: "5 more minutes" }],
    priority: 2
  });
}

async function showBreakEndOverlay(session, breakEndId) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !isTrackableUrl(tab.url) || tab.incognito) return false;

  try {
    await showInTab(tab.id, {
      type: "DRIFTGUARD_SHOW_INTERVENTION",
      payload: {
        kind: "break_end",
        breakEndId,
        intention: session.intention,
        ...promptAssets("sleepy")
      }
    });
    return true;
  } catch (error) {
    console.warn("Unable to show break-end card", error);
    return false;
  }
}

async function handleBreakEndResponse(payload, sender) {
  const session = await getActiveSession();
  if (!session || session.status === "ended") return { ok: false, error: "No active session." };

  // Only the card we actually showed can answer, and only once.
  if (!payload.breakEndId || payload.breakEndId !== session.breakEndPromptId) {
    return { ok: false, error: "That break prompt has expired." };
  }

  chrome.notifications?.clear?.(BREAK_NOTIFICATION_ID);

  if (payload.action === "extend_5") {
    const extended = {
      ...session,
      breakEndPromptId: null,
      breakUntil: Date.now() + 5 * 60 * 1000,
      breakMinutes: 5,
      breaksTaken: (session.breaksTaken || 0) + 1
    };
    await finalizeObservation("break-extend");
    await updateActiveSession(extended);
    scheduleBreakEndAlarm(5);
    return { ok: true, session: extended };
  }

  const back = { ...session, breakEndPromptId: null };
  await updateActiveSession(back);

  if (payload.action === "return") {
    const tab = sender?.tab || (await getActiveTab());
    await refocusToLastAligned(back, tab);
  }

  await observeActiveTab("break-end-return");
  return { ok: true, session: await getActiveSession() };
}

// ---------------------------------------------------------------------------
// Parking lot (saved for later)
// ---------------------------------------------------------------------------

async function saveCurrentForLater(source, providedTab) {
  const tab = providedTab?.id ? providedTab : await getActiveTab();
  if (!tab?.url || !isTrackableUrl(tab.url) || tab.incognito) {
    return { ok: false, error: "This page can't be saved." };
  }

  const values = await storage.get({ [STORAGE_KEYS.savedItems]: [] });
  const existing = values[STORAGE_KEYS.savedItems].find((item) => item.url === tab.url && !item.done);
  if (existing) return { ok: true, item: existing, duplicate: true };

  const session = await getActiveSession();
  const settings = await getSettings();
  const domain = extractDomain(tab.url);

  const item = {
    id: createId(),
    sessionId: session?.status !== "ended" ? session?.id || null : null,
    timestamp: Date.now(),
    title: settings.trackTabTitles && tab.title ? tab.title : prettyUrl(tab.url),
    url: tab.url,
    domain,
    source,
    done: false
  };

  await appendBounded(STORAGE_KEYS.savedItems, item, 1000);
  return { ok: true, item };
}

async function markSavedDone(ids) {
  const wanted = new Set((ids || []).filter(Boolean));
  const values = await storage.get({ [STORAGE_KEYS.savedItems]: [] });
  const items = values[STORAGE_KEYS.savedItems].map((item) =>
    wanted.has(item.id) ? { ...item, done: true, doneAt: Date.now() } : item
  );
  await storage.set({ [STORAGE_KEYS.savedItems]: items });
  return { ok: true };
}

async function removeSaved(id) {
  const values = await storage.get({ [STORAGE_KEYS.savedItems]: [] });
  await storage.set({
    [STORAGE_KEYS.savedItems]: values[STORAGE_KEYS.savedItems].filter((item) => item.id !== id)
  });
  return { ok: true };
}

function prettyUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, "")}${path}`.slice(0, 120);
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Refocus
// ---------------------------------------------------------------------------

async function refocusToLastAligned(session, currentTab) {
  try {
    if (!currentTab?.id) return;

    // A domain the user explicitly trusted outranks anything inferred, so an
    // open allowed tab is the first place to send them back to.
    const allowedTab = await findAllowedDomainTab(session, currentTab.windowId, currentTab.id);
    if (allowedTab && allowedTab.id !== currentTab.id) {
      await activateTab(allowedTab);
      return;
    }

    const rememberedTab = await getRememberedAlignedTab(session, currentTab);
    if (rememberedTab && rememberedTab.id !== currentTab.id) {
      await activateTab(rememberedTab);
      return;
    }

    // Nothing open to return to: bring the work back in its own tab rather
    // than navigating this one away, which would destroy the page.
    const target = session.lastAlignedUrl || buildAllowedDomainUrl(session);
    if (target && currentTab.url !== target) {
      await createTab(target, currentTab.windowId);
    }
  } catch (error) {
    console.warn("Unable to refocus tab", error);
  }
}

async function getRememberedAlignedTab(session, currentTab) {
  if (!session.lastAlignedTabId) return null;

  const tab = await getTab(session.lastAlignedTabId);
  if (!tab?.id || !tab.url || !isTrackableUrl(tab.url)) return null;

  if (session.lastAlignedUrl && tab.url === session.lastAlignedUrl) return tab;

  const tabDomain = extractDomain(tab.url);
  if (session.lastAlignedDomain && tabDomain === session.lastAlignedDomain) return tab;

  if (currentTab.windowId && tab.windowId === currentTab.windowId && isAllowedDomain(tabDomain, session.allowedDomains)) {
    return tab;
  }

  return null;
}

async function findAllowedDomainTab(session, preferredWindowId, excludeTabId) {
  if (!normalizeDomainList(session.allowedDomains || []).length) return null;

  const tabs = await queryTabs({});
  const candidates = tabs.filter((tab) => {
    if (tab.id === excludeTabId || tab.incognito) return false;
    if (!tab.url || !isTrackableUrl(tab.url)) return false;
    return isAllowedDomain(extractDomain(tab.url), session.allowedDomains);
  });

  if (!candidates.length) return null;

  // Rank by how likely each tab is to be the actual work, rather than just
  // any trusted tab. The tab the user last worked in wins; a domain they
  // merely marked "It's for work" mid-drift is the weakest signal.
  const rank = (tab) => {
    const domain = extractDomain(tab.url);
    let value = 0;
    if (tab.url === session.lastAlignedUrl) value += 100;
    if (session.lastAlignedDomain && domain === session.lastAlignedDomain) value += 50;
    if (tab.id === session.lastAlignedTabId) value += 40;
    if (getDomainCategory(domain, null) === "work") value += 20;
    if (tab.windowId === preferredWindowId) value += 5;
    return value;
  };

  return [...candidates].sort((a, b) => rank(b) - rank(a))[0];
}

function buildAllowedDomainUrl(session) {
  const domain = normalizeDomainList(session.allowedDomains || [])[0];
  if (!domain) return "";
  if (domain === "localhost" || domain === "127.0.0.1") return `http://${domain}`;
  return `https://${domain}`;
}

async function rememberAlignedSurface(session, observation) {
  if (!observation.url || !isTrackableUrl(observation.url)) return;

  await updateActiveSession({
    ...session,
    lastAlignedUrl: observation.url,
    lastAlignedTitle: observation.title,
    lastAlignedDomain: observation.domain,
    lastAlignedTabId: observation.tabId,
    lastAlignedWindowId: observation.windowId
  });
}

// ---------------------------------------------------------------------------
// AI relevance check (opt-in; see AI_CHECK.md)
// ---------------------------------------------------------------------------
//
// Flow: observeTab() → scheduleAiCheck() sets a timer for when the page has
// held the tab for AI_DWELL_MS → runAiCheck() reserves the budget under the
// lock, then reads the page, captures the tab and calls the endpoint *outside*
// the lock, then re-takes the lock to apply the verdict and re-score. The
// screenshot and page text only ever live in local variables of that one call.

let aiTimer = null;
let aiTimerKey = "";
let aiInFlightKey = "";

function observationKey(observation) {
  if (!observation) return "";
  return `${observation.sessionId}|${observation.tabId}|${observation.startedAt}|${observation.url}`;
}

function cancelAiCheck() {
  clearTimeout(aiTimer);
  aiTimer = null;
  aiTimerKey = "";
}

// Safe to call from inside a locked task: it only ever arms a timer. The 30 s
// tick calls it again, so a worker eviction just delays the check.
async function scheduleAiCheck(observation) {
  const settings = await getSettings();
  if (!settings.aiCheck || !observation) return;

  const session = await getActiveSession();
  const blocker = aiCheckBlocker({ settings, session, observation, now: Date.now() });
  if (blocker && !blocker.retryInMs) return;

  const key = observationKey(observation);
  if (aiInFlightKey === key) return;
  if (aiTimer && aiTimerKey === key) return;

  clearTimeout(aiTimer);
  aiTimerKey = key;
  aiTimer = setTimeout(
    () => {
      aiTimer = null;
      aiTimerKey = "";
      runAiCheck(key).catch((error) => console.warn("DriftGuard AI check failed", error));
    },
    blocker ? blocker.retryInMs + 150 : 0
  );
}

async function runAiCheck(key) {
  if (aiInFlightKey) return; // The running check reschedules when it finishes.

  const job = await run("ai-prepare", () => prepareAiCheck(key));
  if (!job) return;

  aiInFlightKey = key;
  try {
    let outcome;
    try {
      outcome = await performAiCheck(job);
    } catch (error) {
      outcome = { kind: "error", error: error?.message || "AI check failed" };
    }
    await run("ai-apply", () => applyAiOutcome(job, outcome));
  } finally {
    aiInFlightKey = "";
  }
}

// Under the lock: re-validate, reserve the budget, snapshot what we need.
async function prepareAiCheck(key) {
  const settings = await getSettings();
  const session = await getActiveSession();
  const values = await storage.get({
    [STORAGE_KEYS.currentObservation]: null,
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.installId]: null
  });
  const observation = values[STORAGE_KEYS.currentObservation];
  if (!observation || observationKey(observation) !== key) return null;

  const now = Date.now();
  const blocker = aiCheckBlocker({ settings, session, observation, now });
  if (blocker) {
    if (blocker.retryInMs) await scheduleAiCheck(observation);
    return null;
  }

  // Never incognito, never a tab that has already moved on.
  const tab = await getTab(observation.tabId);
  if (!tab || tab.incognito || tab.url !== observation.url || !isTrackableUrl(tab.url)) return null;

  let installId = values[STORAGE_KEYS.installId];
  if (!installId) {
    installId = createId();
    await storage.set({ [STORAGE_KEYS.installId]: installId });
  }

  await updateActiveSession({ ...session, aiCalls: (session.aiCalls || 0) + 1, aiLastCallAt: now });
  await storage.set({
    [STORAGE_KEYS.currentObservation]: { ...observation, aiStatus: "pending", aiPendingAt: now }
  });

  return {
    key,
    sessionId: session.id,
    tabId: observation.tabId,
    url: observation.url,
    title: observation.title || tab.title || "",
    intention: session.intention,
    context: {
      workTitle: settings.trackTabTitles ? session.lastAlignedTitle || "" : "",
      workDomain: session.lastAlignedDomain || "",
      recentDomains: recentDomainsFromEvents(values[STORAGE_KEYS.events], session.id)
    },
    endpoint: resolveAiEndpoint(settings),
    installId,
    version: chrome.runtime.getManifest().version
  };
}

// Outside the lock: read the page, capture, call the endpoint.
async function performAiCheck(job) {
  const page = await extractPageForRelevance(job.tabId);
  if (page && verdictCacheKey(page.href) !== verdictCacheKey(job.url)) return { kind: "aborted" };

  // Text only when the page shows a password field, or when we couldn't read
  // the page at all (so we can't know it doesn't).
  let screenshot = null;
  if (page && !page.hasPassword) {
    screenshot = await captureForRelevance(job).catch(() => null);
  }

  const body = buildRelevanceBody({
    intention: job.intention,
    page: {
      url: job.url,
      title: page?.title || job.title,
      description: page?.description,
      headings: page?.headings,
      text: page?.text
    },
    context: job.context,
    screenshot
  });
  screenshot = null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(job.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-DriftGuard-Install": job.installId,
        "X-DriftGuard-Version": job.version
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    const json = await response.json().catch(() => null);

    if (response.status === 429) {
      return { kind: "rate_limited", retryAfterMs: parseRetryAfterMs(json, response.headers.get("Retry-After")) };
    }
    if (response.status === 503) return { kind: "unavailable" };
    if (!response.ok) return { kind: "error", error: `HTTP ${response.status}` };

    const verdict = parseVerdict(json);
    return verdict ? { kind: "verdict", verdict } : { kind: "error", error: "Malformed verdict" };
  } finally {
    clearTimeout(timer);
  }
}

// Under the lock again: store the verdict, and re-score if the user is still
// on the same page.
async function applyAiOutcome(job, outcome) {
  const session = await getActiveSession();
  if (!session || session.id !== job.sessionId || session.status === "ended") return;

  const now = Date.now();
  let nextSession = session;
  let status = "failed";

  if (outcome.kind === "verdict") {
    nextSession = { ...session, aiVerdicts: storeVerdict(session.aiVerdicts, job.url, outcome.verdict, now) };
    status = "done";
  } else if (outcome.kind === "rate_limited") {
    nextSession = { ...session, aiBackoffUntil: now + outcome.retryAfterMs };
    status = null; // Retried once the backoff has passed.
  } else if (outcome.kind === "unavailable") {
    nextSession = { ...session, aiBackoffUntil: now + AI_UNAVAILABLE_BACKOFF_MS };
    status = null;
  } else if (outcome.kind === "aborted") {
    // Nothing was sent: give the call back.
    nextSession = { ...session, aiCalls: Math.max(0, (session.aiCalls || 0) - 1) };
  } else {
    console.info("DriftGuard AI check fell back to rules:", outcome.error || outcome.kind);
  }

  if (nextSession !== session) await updateActiveSession(nextSession);

  const observation = (await storage.get({ [STORAGE_KEYS.currentObservation]: null }))[
    STORAGE_KEYS.currentObservation
  ];

  if (!observation || observationKey(observation) !== job.key) {
    // The user moved on while we waited; the next page may be due a check.
    if (observation) await scheduleAiCheck(observation);
    return;
  }

  const updated = { ...observation, aiStatus: status, aiPendingAt: null };
  if (outcome.kind === "verdict") updated.aiVerdict = { ...outcome.verdict, at: now };
  await storage.set({ [STORAGE_KEYS.currentObservation]: updated });

  if (outcome.kind === "verdict") await maybeTriggerIntervention(updated);
  else await scheduleAiCheck(updated);
}

async function extractPageForRelevance(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: readPageForRelevance,
      args: [AI_LIMITS.pageText, AI_LIMITS.headings, AI_LIMITS.heading, AI_LIMITS.description]
    });
    const page = result?.result;
    return page && typeof page.href === "string" ? page : null;
  } catch {
    return null;
  }
}

// Runs in the page (serialised by chrome.scripting), so it must be
// self-contained.
function readPageForRelevance(maxText, maxHeadings, maxHeading, maxDescription) {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((element) => clean(element.innerText || element.textContent).slice(0, maxHeading))
    .filter(Boolean)
    .slice(0, maxHeadings);
  const hasPassword = Array.from(document.querySelectorAll('input[type="password"]')).some((input) => {
    const rect = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  });
  return {
    title: clean(document.title),
    href: location.href,
    description: clean(meta?.getAttribute("content")).slice(0, maxDescription),
    headings,
    text: clean(document.body ? document.body.innerText : "").slice(0, maxText),
    hasPassword
  };
}

// Only the tab we checked, only while it is the visible tab of a focused
// window, and only if it is still on the same page after the capture.
async function captureForRelevance(job) {
  const isStillVisible = async () => {
    const tab = await getTab(job.tabId);
    if (!tab?.active || tab.incognito || tab.url !== job.url) return null;
    const win = await getWindow(tab.windowId);
    return win?.focused ? tab : null;
  };

  const tab = await isStillVisible();
  if (!tab) return null;

  const raw = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "jpeg",
    quality: AI_LIMITS.captureQuality
  });
  if (!raw || !(await isStillVisible())) return null;

  const small = await downscaleScreenshot(raw);
  return small && small.length <= AI_LIMITS.screenshotChars ? small : null;
}

async function downscaleScreenshot(dataUrl) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") return null;

  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, AI_LIMITS.screenshotMaxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: AI_LIMITS.encodeQuality });
    return `data:image/jpeg;base64,${await blobToBase64(out)}`;
  } finally {
    bitmap.close?.();
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

// Removes a prompt from the other tabs it followed the user to.
async function clearPromptInTabs(watch, interventionId, exceptTabId) {
  if (!watch || !interventionId) return;
  const tabIds = (watch.shownTabIds || []).filter((id) => typeof id === "number" && id !== exceptTabId);
  await Promise.all(
    tabIds.map((tabId) =>
      sendTabMessage(tabId, { type: "DRIFTGUARD_CLEAR_INTERVENTION", payload: { interventionId } }).catch(() => {})
    )
  );
}

// ---------------------------------------------------------------------------
// Recap
// ---------------------------------------------------------------------------

async function getRecap(sessionId) {
  const values = await storage.get({
    [STORAGE_KEYS.sessions]: [],
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.interventions]: [],
    [STORAGE_KEYS.savedItems]: [],
    [STORAGE_KEYS.progress]: DEFAULT_PROGRESS,
    [STORAGE_KEYS.settings]: DEFAULT_SETTINGS
  });

  const session = values[STORAGE_KEYS.sessions].find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "We couldn't find that session. It may have been deleted." };

  const events = values[STORAGE_KEYS.events].filter((event) => event.sessionId === sessionId);
  const interventions = values[STORAGE_KEYS.interventions].filter((item) => item.sessionId === sessionId);
  const savedItems = values[STORAGE_KEYS.savedItems].filter((item) => item.sessionId === sessionId);
  const stats = buildSessionStats(session, events, interventions);

  const progress = { ...DEFAULT_PROGRESS, ...values[STORAGE_KEYS.progress] };
  const settings = { ...DEFAULT_SETTINGS, ...values[STORAGE_KEYS.settings] };
  const now = Date.now();

  return {
    ok: true,
    session,
    events,
    interventions,
    savedItems,
    stats,
    progress: {
      ...levelInfo(progress.xp),
      streak: computeStreak(progress.daily, now),
      bestStreak: progress.bestStreak || 0,
      goalMinutes: settings.dailyGoalMinutes || DEFAULT_DAILY_GOAL_MINUTES,
      last7: lastNDayKeys(7, now).map((key) => ({
        key,
        minutes: Math.round((progress.daily?.[key]?.focusSeconds || 0) / 60),
        qualified: Boolean(progress.daily?.[key]?.qualified)
      }))
    }
  };
}

function buildSessionStats(session, events, interventions) {
  const byDomain = new Map();
  let trackedSeconds = 0;
  let driftSeconds = 0;
  let alignedSeconds = 0;

  for (const event of events) {
    trackedSeconds += event.durationSeconds;

    if (!byDomain.has(event.domain)) {
      byDomain.set(event.domain, { domain: event.domain, seconds: 0, category: event.category });
    }

    const domainStats = byDomain.get(event.domain);
    domainStats.seconds += event.durationSeconds;
    // The latest classification wins (e.g. after "It's for work").
    domainStats.category = event.category;

    if (isAlignedEvent(event)) alignedSeconds += event.durationSeconds;
    else driftSeconds += event.durationSeconds;
  }

  const responseCounts = interventions.reduce((counts, item) => {
    const key = item.isReminder && item.response === "shown" ? "reminder_shown" : item.response;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return {
    sessionSeconds: Math.round(sessionElapsedMs(session) / 1000),
    trackedSeconds,
    alignedSeconds,
    driftSeconds,
    caughtCount: interventions.filter((item) => !item.isReminder).length,
    recoveredCount: interventions.filter((item) => GOOD_RESPONSES.includes(item.response)).length,
    topDomains: Array.from(byDomain.values()).sort((a, b) => b.seconds - a.seconds).slice(0, 8),
    responseCounts,
    interventionCount: interventions.length,
    lockCount: interventions.filter((item) => item.mode === "lock").length,
    aiFlaggedCount: interventions.filter((item) => item.ai === "off_task").length
  };
}

// ---------------------------------------------------------------------------
// Settings + data
// ---------------------------------------------------------------------------

async function updateSettings(partial) {
  const current = await getSettings();
  const goal = Number(partial.dailyGoalMinutes ?? current.dailyGoalMinutes);

  const endpoint = String(partial.aiEndpointOverride ?? current.aiEndpointOverride ?? "").trim().slice(0, 2048);
  if (endpoint && !isValidAiEndpoint(endpoint)) {
    return { ok: false, error: "Use an https:// address (plain http:// only for localhost)." };
  }

  const next = {
    ...current,
    ...partial,
    sensitivity: SENSITIVITY_THRESHOLDS[partial.sensitivity] ? partial.sensitivity : current.sensitivity,
    trackTabTitles: partial.trackTabTitles ?? current.trackTabTitles,
    dailyGoalMinutes: Number.isFinite(goal) ? Math.min(720, Math.max(15, Math.round(goal))) : current.dailyGoalMinutes,
    excludedDomains: normalizeDomainList(partial.excludedDomains ?? current.excludedDomains),
    aiCheck: typeof partial.aiCheck === "boolean" ? partial.aiCheck : Boolean(current.aiCheck),
    aiConsentAnswered:
      typeof partial.aiConsentAnswered === "boolean" ? partial.aiConsentAnswered : Boolean(current.aiConsentAnswered),
    aiEndpointOverride: endpoint
  };
  // Answering the toggle counts as answering the consent card.
  if (typeof partial.aiCheck === "boolean") next.aiConsentAnswered = true;

  await storage.set({ [STORAGE_KEYS.settings]: next });

  if (!next.aiCheck) cancelAiCheck();
  else if (!current.aiCheck) {
    const observation = (await storage.get({ [STORAGE_KEYS.currentObservation]: null }))[
      STORAGE_KEYS.currentObservation
    ];
    if (observation) await scheduleAiCheck(observation);
  }

  // Sensitivity also applies to the running session.
  const session = await getActiveSession();
  if (session && partial.sensitivity && session.sensitivity !== next.sensitivity) {
    await updateActiveSession({ ...session, sensitivity: next.sensitivity });
  }

  return { ok: true, settings: next };
}

async function clearAllData() {
  cancelAiCheck();
  await storage.remove([...Object.values(STORAGE_KEYS), ...LEGACY_KEYS]);
  chrome.alarms.clear(TICK_ALARM);
  chrome.alarms.clear(BREAK_END_ALARM);
  chrome.alarms.clear(SESSION_END_ALARM);
  chrome.notifications?.clear?.(BREAK_NOTIFICATION_ID);
  await initializeDefaults();
  return { ok: true };
}

async function getSettings() {
  const values = await storage.get({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...values[STORAGE_KEYS.settings] };
}

async function getProgress() {
  const values = await storage.get({ [STORAGE_KEYS.progress]: DEFAULT_PROGRESS });
  const progress = { ...DEFAULT_PROGRESS, ...values[STORAGE_KEYS.progress] };
  progress.daily = { ...(progress.daily || {}) };
  return progress;
}

async function getActiveSession() {
  const values = await storage.get({ [STORAGE_KEYS.activeSession]: null });
  return values[STORAGE_KEYS.activeSession];
}

async function updateActiveSession(session) {
  await storage.set({ [STORAGE_KEYS.activeSession]: session });
  await upsertSession(session);
  return session;
}

async function upsertSession(session) {
  const values = await storage.get({ [STORAGE_KEYS.sessions]: [] });
  const sessions = values[STORAGE_KEYS.sessions];
  const index = sessions.findIndex((item) => item.id === session.id);

  if (index >= 0) sessions[index] = session;
  else sessions.unshift(session);

  await storage.set({ [STORAGE_KEYS.sessions]: sessions.slice(0, 200) });
}

async function appendBounded(key, item, limit) {
  const values = await storage.get({ [key]: [] });
  const items = values[key];
  items.push(item);
  await storage.set({ [key]: items.slice(-limit) });
}

async function patchIntervention(interventionId, patch) {
  const values = await storage.get({ [STORAGE_KEYS.interventions]: [] });
  const interventions = values[STORAGE_KEYS.interventions];
  const index = interventions.findIndex((item) => item.id === interventionId);
  if (index === -1) return;

  interventions[index] = { ...interventions[index], ...patch };
  await storage.set({ [STORAGE_KEYS.interventions]: interventions });
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Toolbar badge
// ---------------------------------------------------------------------------

let lastBadge = { text: null, color: null, title: null };

async function refreshBadge() {
  if (!chrome.action) return;
  const session = await getActiveSession();
  const now = Date.now();

  let text = "";
  let color = BADGE_COLORS.focus;
  let title = "DriftGuard";

  if (session && session.status !== "ended") {
    if (session.status === "paused") {
      text = "||";
      color = BADGE_COLORS.rest;
      title = `DriftGuard · Paused · ${session.intention}`;
    } else if (session.breakUntil && session.breakUntil > now) {
      text = "brk";
      color = BADGE_COLORS.rest;
      title = `DriftGuard · On a break · ${session.intention}`;
    } else if (session.driftWatch?.awaitingResponse) {
      text = "!";
      color = BADGE_COLORS.alert;
      title =
        session.driftWatch.mode === "lock"
          ? `DriftGuard · Locked until you answer · ${session.intention}`
          : `DriftGuard · Drift check waiting · ${session.intention}`;
    } else if (session.durationMinutes) {
      const minutes = Math.max(0, Math.ceil(sessionRemainingMs(session, now) / 60000));
      text = `${minutes}m`;
      title = `DriftGuard · ${minutes} min left · ${session.intention}`;
    } else {
      text = "on";
      title = `DriftGuard · Focusing · ${session.intention}`;
    }
  }

  if (text !== lastBadge.text) chrome.action.setBadgeText({ text });
  if (color !== lastBadge.color) {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeTextColor?.({ color: "#FFFFFF" });
  }
  if (title !== lastBadge.title) chrome.action.setTitle({ title });
  lastBadge = { text, color, title };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

// chrome.notifications.create reports failures only through lastError in its
// callback; without one, an OS-level block looks identical to success.
function createNotification(id, options) {
  return new Promise((resolve) => {
    if (!chrome.notifications?.create) {
      resolve(false);
      return;
    }

    try {
      chrome.notifications.create(id, options, (createdId) => {
        if (chrome.runtime.lastError || !createdId) {
          console.warn("DriftGuard notification blocked:", chrome.runtime.lastError?.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.warn("DriftGuard notification threw", error);
      resolve(false);
    }
  });
}

function showInterventionNotification(interventionId, { intention, domain, isReminder }) {
  return createNotification(`${INTERVENTION_NOTIFICATION_PREFIX}${interventionId}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: isReminder ? "Still off track?" : "Quick check-in",
    message: `You meant to: ${intention || "focus"}`,
    contextMessage: domain || "",
    buttons: [{ title: "It's for work" }, { title: "Back to work" }],
    priority: 2
  });
}

function parseInterventionNotificationId(notificationId) {
  if (!notificationId?.startsWith(INTERVENTION_NOTIFICATION_PREFIX)) return null;
  return notificationId.slice(INTERVENTION_NOTIFICATION_PREFIX.length);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function getTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab));
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tabs?.[0] || null);
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(chrome.runtime.lastError ? [] : tabs || []));
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

async function activateTab(tab) {
  if (typeof tab.windowId === "number") await focusWindow(tab.windowId);
  await updateTab(tab.id, { active: true });
}

function createTab(url, windowId) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, windowId, active: true }, (tab) => {
      resolve(chrome.runtime.lastError ? null : tab);
    });
  });
}

function getWindow(windowId) {
  return new Promise((resolve) => {
    chrome.windows.get(windowId, (window) => resolve(chrome.runtime.lastError ? null : window));
  });
}

function focusWindow(windowId) {
  return new Promise((resolve) => {
    chrome.windows.update(windowId, { focused: true }, (window) => {
      resolve(chrome.runtime.lastError ? null : window);
    });
  });
}

async function showInTab(tabId, message) {
  try {
    return await sendTabMessage(tabId, message);
  } catch (firstError) {
    await injectContentScript(tabId);
    try {
      return await sendTabMessage(tabId, message);
    } catch {
      throw firstError;
    }
  }
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
