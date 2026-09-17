const STORAGE_KEYS = {
  settings: "driftguard.settings",
  activeSession: "driftguard.activeSession",
  sessions: "driftguard.sessions",
  events: "driftguard.events",
  interventions: "driftguard.interventions",
  savedItems: "driftguard.savedItems",
  domainPreferences: "driftguard.domainPreferences",
  currentObservation: "driftguard.currentObservation"
};

const DEFAULT_SETTINGS = {
  sensitivity: "balanced",
  trackTabTitles: true,
  excludedDomains: []
};

const SENSITIVITY_THRESHOLDS = {
  calm: 72,
  balanced: 58,
  strict: 44
};

const DRIFT_REMINDER_INTERVAL_MINUTES = {
  calm: 4,
  balanced: 2,
  strict: 1
};

const CATEGORY_PATTERNS = {
  work: [
    "docs.google.com",
    "drive.google.com",
    "coursera.org",
    "udemy.com",
    "edx.org",
    "khanacademy.org",
    "notion.so",
    "github.com",
    "gitlab.com",
    "bitbucket.org",
    "figma.com",
    "linear.app",
    "jira",
    "atlassian.net",
    "vercel.com",
    "supabase.com",
    "localhost",
    "127.0.0.1",
    "replit.com",
    "codepen.io"
  ],
  communication: [
    "mail.google.com",
    "gmail.com",
    "outlook.live.com",
    "slack.com",
    "discord.com",
    "teams.microsoft.com"
  ],
  research: [
    "google.com",
    "perplexity.ai",
    "wikipedia.org",
    "stackoverflow.com",
    "stackexchange.com",
    "developer.mozilla.org",
    "docs.",
    "learn.microsoft.com",
    "arxiv.org"
  ],
  ambiguous: [
    "youtube.com",
    "youtu.be",
    "reddit.com",
    "x.com",
    "twitter.com",
    "linkedin.com",
    "medium.com",
    "substack.com",
    "news.ycombinator.com"
  ],
  distracting: [
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "netflix.com",
    "twitch.tv",
    "pinterest.com",
    "amazon.com",
    "ebay.com",
    "hulu.com",
    "disneyplus.com",
    "primevideo.com",
    "crunchyroll.com",
    "animepahe",
    "kwik.cx",
    "9anime",
    "aniwatch",
    "hianime",
    "gogoanime",
    "zoro.to",
    "fmovies",
    "soap2day",
    "putlocker",
    "123movies",
    "streameast",
    "buffstream",
    "dailymotion.com",
    "9gag.com",
    "imgur.com",
    "quora.com",
    "temu.com",
    "aliexpress.com",
    "shein.com",
    "roblox.com",
    "steampowered.com",
    "chess.com",
    "onlyfans.com",
    "pornhub.com",
    "xvideos.com",
    "xnxx.com"
  ]
};

const INTENTION_KEYWORDS = {
  writing: ["write", "draft", "essay", "copy", "newsletter", "article", "blog", "memo", "proposal", "script"],
  coding: ["code", "debug", "build", "fix", "deploy", "ship", "implement", "refactor", "test", "bug", "auth"],
  study: ["study", "course", "coursera", "lecture", "lesson", "homework", "assignment", "exam", "class"],
  research: ["research", "learn", "compare", "read", "investigate", "market", "pricing", "analyze"],
  design: ["design", "mockup", "wireframe", "figma", "brand", "layout", "prototype"],
  communication: ["email", "reply", "inbox", "slack", "message", "follow up", "outreach"]
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "i",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with"
]);

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

chrome.runtime.onInstalled.addListener(() => {
  void initializeDefaults().then(ensureSessionAlarms);
});

chrome.runtime.onStartup.addListener(() => {
  void initializeDefaults().then(ensureSessionAlarms);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("DriftGuard message error", error);
      sendResponse({ ok: false, error: error.message || "Unknown error" });
    });

  return true;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getTab(tabId).then((tab) => observeTab(tab, "tab-activated"));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title && changeInfo.status !== "complete") return;

  void isActiveTab(tabId).then((active) => {
    if (active) void observeTab(tab, "tab-updated");
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void handleDriftTabClosed(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void observeActiveTab("window-focus");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    void observeActiveTab("tick");
  }

  if (alarm.name === BREAK_END_ALARM) {
    void handleBreakEnd();
  }

});

if (chrome.idle) {
  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "active") {
      void observeActiveTab("idle-active");
    } else {
      void finalizeObservation(`idle-${state}`);
    }
  });
}

void initializeDefaults().then(ensureSessionAlarms);

const TICK_ALARM = "driftguard.tick";

// MV3 tears down the service worker when idle. Every wake-up path must restore
// the tick for an in-flight session, or drift on a tab the user never leaves is
// never re-scored and no prompt can ever fire.
async function ensureSessionAlarms() {
  const session = await getActiveSession();
  if (!session || session.status === "ended") {
    chrome.alarms.clear(TICK_ALARM);
    return;
  }

  if (!(await getAlarm(TICK_ALARM))) {
    chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  }

  if (session.breakUntil && session.breakUntil > Date.now() && !(await getAlarm(BREAK_END_ALARM))) {
    scheduleBreakEndAlarm(Math.max(0.5, (session.breakUntil - Date.now()) / 60000));
  }
}

function getAlarm(name) {
  return new Promise((resolve) => {
    chrome.alarms.get(name, (alarm) => resolve(chrome.runtime.lastError ? null : alarm));
  });
}

async function initializeDefaults() {
  const values = await storage.get({
    [STORAGE_KEYS.settings]: null,
    [STORAGE_KEYS.sessions]: [],
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.interventions]: [],
    [STORAGE_KEYS.savedItems]: [],
    [STORAGE_KEYS.domainPreferences]: {}
  });

  const updates = {};

  if (!values[STORAGE_KEYS.settings]) {
    updates[STORAGE_KEYS.settings] = DEFAULT_SETTINGS;
  }

  if (Object.keys(updates).length) {
    await storage.set(updates);
  }
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "DRIFTGUARD_GET_SNAPSHOT":
      return getSnapshot();
    case "DRIFTGUARD_START_SESSION":
      return startSession(message.payload || {});
    case "DRIFTGUARD_END_SESSION":
      return endSession();
    case "DRIFTGUARD_PAUSE_SESSION":
      return setSessionPaused(true);
    case "DRIFTGUARD_RESUME_SESSION":
      return setSessionPaused(false);
    case "DRIFTGUARD_INTERVENTION_RESPONSE":
      return handleInterventionResponse(message.payload || {}, sender);
    case "DRIFTGUARD_GET_RECAP":
      return getRecap(message.payload?.sessionId);
    case "DRIFTGUARD_UPDATE_SETTINGS":
      return updateSettings(message.payload || {});
    case "DRIFTGUARD_CLEAR_DATA":
      return clearAllData();
    case "DRIFTGUARD_SAVE_CURRENT":
      return saveCurrentForLater("manual-save");
    default:
      return { ok: false, error: "Unknown message type" };
  }
}

async function getSnapshot() {
  const values = await storage.get({
    [STORAGE_KEYS.settings]: DEFAULT_SETTINGS,
    [STORAGE_KEYS.activeSession]: null,
    [STORAGE_KEYS.currentObservation]: null,
    [STORAGE_KEYS.sessions]: [],
    [STORAGE_KEYS.interventions]: [],
    [STORAGE_KEYS.savedItems]: []
  });

  const activeSession = values[STORAGE_KEYS.activeSession];
  const activeSessionId = activeSession?.id;
  const interventions = values[STORAGE_KEYS.interventions].filter((item) => item.sessionId === activeSessionId);
  const savedItems = values[STORAGE_KEYS.savedItems].filter((item) => item.sessionId === activeSessionId);
  const currentTab = await getActiveTab();

  return {
    ok: true,
    settings: { ...DEFAULT_SETTINGS, ...values[STORAGE_KEYS.settings] },
    activeSession,
    currentObservation: values[STORAGE_KEYS.currentObservation],
    currentDomain: currentTab?.url ? extractDomain(currentTab.url) : null,
    currentDomainCategory: currentTab?.url
      ? getDomainCategory(extractDomain(currentTab.url), activeSession, await getDomainPreferences())
      : null,
    activeCounts: {
      interventions: interventions.length,
      savedItems: savedItems.length
    },
    recentSessions: values[STORAGE_KEYS.sessions].slice(0, 6)
  };
}

async function startSession(payload) {
  const intention = String(payload.intention || "").trim();
  if (!intention) return { ok: false, error: "Add a session intention first." };

  const existing = await getActiveSession();
  if (existing && existing.status !== "ended") {
    return { ok: false, error: "End the current session before starting a new one." };
  }

  const settings = await getSettings();
  const sensitivity = payload.sensitivity || settings.sensitivity;
  const allowedDomains = normalizeDomainList(payload.allowedDomains || []);
  const startedAt = Date.now();

  const session = {
    id: createId(),
    intention,
    intentionType: classifyIntention(intention),
    startedAt,
    endedAt: null,
    durationMinutes: Number(payload.durationMinutes || 0),
    sensitivity,
    allowedDomains,
    status: "active",
    breakUntil: null,
    lastPromptAt: null,
    driftWatch: null,
    lastAlignedUrl: null,
    lastAlignedTitle: null,
    lastAlignedDomain: null,
    lastAlignedTabId: null,
    lastAlignedWindowId: null
  };

  await storage.set({ [STORAGE_KEYS.activeSession]: session });
  await upsertSession(session);
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  await observeActiveTab("session-start");

  return { ok: true, session };
}

async function endSession() {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  await finalizeObservation("session-end");

  const endedSession = {
    ...session,
    status: "ended",
    endedAt: Date.now()
  };

  await upsertSession(endedSession);
  await storage.set({
    [STORAGE_KEYS.activeSession]: null,
    [STORAGE_KEYS.currentObservation]: null
  });
  chrome.alarms.clear(TICK_ALARM);
  chrome.alarms.clear(BREAK_END_ALARM);
  chrome.notifications?.clear?.(BREAK_NOTIFICATION_ID);

  return { ok: true, sessionId: endedSession.id };
}

async function setSessionPaused(paused) {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  if (paused) await finalizeObservation("manual-pause");

  const updated = {
    ...session,
    status: paused ? "paused" : "active"
  };

  await storage.set({ [STORAGE_KEYS.activeSession]: updated });
  await upsertSession(updated);

  if (!paused) await observeActiveTab("manual-resume");

  return { ok: true, session: updated };
}

async function handleDriftTabClosed(tabId) {
  const session = await getActiveSession();
  if (!session || session.status !== "active") return;

  const watch = session.driftWatch;
  if (!watch?.awaitingResponse) return;

  const observation = (await storage.get({ [STORAGE_KEYS.currentObservation]: null }))[
    STORAGE_KEYS.currentObservation
  ];
  if (observation && observation.tabId !== tabId) return;

  // Give the browser a moment to settle on the next active tab.
  setTimeout(() => {
    void observeActiveTab("drift-tab-closed");
  }, 600);
}

async function observeActiveTab(reason) {
  const tab = await getActiveTab();
  if (!tab) return;
  await observeTab(tab, reason);
}

async function observeTab(tab, reason) {
  const session = await getActiveSession();
  if (!session || session.status !== "active") return;

  if (session.durationMinutes > 0) {
    const elapsedMinutes = (Date.now() - session.startedAt) / 60000;
    if (elapsedMinutes >= session.durationMinutes) {
      await endSession();
      return;
    }
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
    current &&
    current.sessionId === session.id &&
    current.tabId === tab.id &&
    current.url === tab.url;

  if (sameObservation) {
    const updated = { ...current, title, lastSeenAt: Date.now(), reason };
    await storage.set({ [STORAGE_KEYS.currentObservation]: updated });
    await maybeTriggerIntervention(updated);
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
}

async function finalizeObservation(reason) {
  const values = await storage.get({
    [STORAGE_KEYS.currentObservation]: null,
    [STORAGE_KEYS.activeSession]: null
  });
  const observation = values[STORAGE_KEYS.currentObservation];
  const session = values[STORAGE_KEYS.activeSession];

  if (!observation) return;

  const durationSeconds = Math.max(0, Math.round((Date.now() - observation.startedAt) / 1000));

  if (session && observation.sessionId === session.id && durationSeconds >= 2) {
    const settings = await getSettings();
    if (!isExcludedDomain(observation.domain, settings.excludedDomains)) {
      const preferences = await getDomainPreferences();
      const category = getDomainCategory(observation.domain, session, preferences);
      const event = {
        id: createId(),
        sessionId: observation.sessionId,
        timestamp: observation.startedAt,
        endedAt: Date.now(),
        eventType: "tab-visit",
        domain: observation.domain,
        title: observation.title,
        durationSeconds,
        category,
        reason
      };

      await appendBounded(STORAGE_KEYS.events, event, 4000);
    }
  }

  await storage.set({ [STORAGE_KEYS.currentObservation]: null });
}

async function maybeTriggerIntervention(observation) {
  const session = await getActiveSession();
  if (!session || session.status !== "active") return;

  const now = Date.now();
  if (session.breakUntil && session.breakUntil > now) return;

  const settings = await getSettings();
  const values = await storage.get({
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.domainPreferences]: {}
  });

  const score = computeDriftScore({
    session,
    observation,
    settings,
    events: values[STORAGE_KEYS.events],
    domainPreferences: values[STORAGE_KEYS.domainPreferences],
    now
  });

  const threshold = SENSITIVITY_THRESHOLDS[session.sensitivity] || SENSITIVITY_THRESHOLDS.balanced;

  if (score.score < threshold) {
    // An unanswered prompt must not be dismissable by switching tabs. Only a
    // genuine return to the work clears it; a merely-quiet tab (a new tab page,
    // an unclassified site) leaves the drift watch standing so the question
    // follows the user instead of being escaped.
    const returnedToWork = isAlignedSurface(observation, session, score.category);
    const pendingWatch =
      session.driftWatch?.status === "active" && session.driftWatch.awaitingResponse
        ? session.driftWatch
        : null;

    if (pendingWatch && !returnedToWork) {
      await reassertPendingPrompt(session, observation, pendingWatch, now);
      return;
    }

    const sessionForMemory = session.driftWatch
      ? await updateActiveSession({
          ...session,
          driftWatch: null
        })
      : session;

    // "Quiet" is not the same as "this is the work". An unclassified tab scores
    // low simply by being unknown, so remembering it would overwrite the real
    // work surface and send Refocus somewhere the user never chose.
    if (observation.url && isAlignedSurface(observation, sessionForMemory, score.category)) {
      await rememberAlignedSurface(sessionForMemory, observation);
    }
    return;
  }

  const driftWatch = session.driftWatch?.status === "active" ? session.driftWatch : null;
  const reminderIntervalMs = getDriftReminderIntervalMs(session);
  const shouldPrompt =
    !driftWatch ||
    !driftWatch.lastPromptAt ||
    now - driftWatch.lastPromptAt >= reminderIntervalMs;

  if (!shouldPrompt) return;

  const promptCount = (driftWatch?.promptCount || 0) + 1;
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
    pendingInterventionId: null
  };

  const interventionId = createId();
  const intervention = {
    id: interventionId,
    watchId: nextDriftWatch.id,
    sessionId: session.id,
    timestamp: now,
    domain: observation.domain,
    title: observation.title,
    driftScore: score.score,
    reasons: score.reasons,
    response: "shown",
    deliveryStatus: "pending",
    promptIndex: promptCount,
    isReminder: promptCount > 1
  };

  await appendBounded(STORAGE_KEYS.interventions, intervention, 1000);

  nextDriftWatch.pendingInterventionId = interventionId;

  const updatedSession = {
    ...session,
    lastPromptAt: now,
    driftWatch: nextDriftWatch
  };
  await storage.set({ [STORAGE_KEYS.activeSession]: updatedSession });
  await upsertSession(updatedSession);

  try {
    await showInterventionInTab(observation.tabId, {
      type: "DRIFTGUARD_SHOW_INTERVENTION",
      payload: {
        interventionId,
        sessionId: session.id,
        intention: session.intention,
        domain: observation.domain,
        title: observation.title,
        driftScore: score.score,
        reasons: score.reasons,
        isReminder: promptCount > 1,
        reminderCount: Math.max(0, promptCount - 1)
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
      const retryableSession = {
        ...latestSession,
        lastPromptAt: null,
        driftWatch: retryableWatch
      };
      await storage.set({ [STORAGE_KEYS.activeSession]: retryableSession });
      await upsertSession(retryableSession);
    }
    console.warn("Unable to show DriftGuard overlay on this page", error);
  }
}

// A prompt the user walked away from is still owed an answer. Re-show it on
// whatever tab they moved to, so switching tabs postpones the question by a
// few seconds rather than cancelling it.
const REASSERT_DELAY_MS = 4000;

let reassertTimer = null;

async function reassertPendingPrompt(session, observation, watch, now) {
  if (watch.lastPromptAt && now - watch.lastPromptAt < REASSERT_DELAY_MS) {
    // Not yet due. chrome.alarms has a 30s floor, so use a short timer to come
    // back for it; the periodic tick is the backstop if the worker is evicted.
    const wait = REASSERT_DELAY_MS - (now - watch.lastPromptAt);
    clearTimeout(reassertTimer);
    reassertTimer = setTimeout(() => {
      void observeActiveTab("reassert-due");
    }, wait + 250);
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
        isReminder: true
      },
      1000
    );
  }

  const updatedWatch = {
    ...watch,
    lastPromptAt: now,
    pendingInterventionId: interventionId,
    followedAcrossTabs: (watch.followedAcrossTabs || 0) + 1
  };

  await updateActiveSession({ ...session, driftWatch: updatedWatch });

  try {
    await showInterventionInTab(observation.tabId, {
      type: "DRIFTGUARD_SHOW_INTERVENTION",
      payload: {
        interventionId,
        sessionId: session.id,
        intention: session.intention,
        domain: watch.currentDomain || observation.domain,
        title: watch.currentTitle || observation.title,
        driftScore: watch.lastScore,
        reasons: ["Still waiting on an answer from " + (watch.currentDomain || "the last tab")],
        isReminder: true,
        reminderCount: Math.max(1, watch.promptCount || 1)
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

function computeDriftScore({ session, observation, settings, events, domainPreferences, now }) {
  const reasons = [];
  let score = 0;
  const durationSeconds = Math.max(0, Math.round((now - observation.startedAt) / 1000));
  const category = getDomainCategory(observation.domain, session, domainPreferences);

  if (isExcludedDomain(observation.domain, settings.excludedDomains)) {
    return { score: 0, category, reasons: ["Domain is excluded"] };
  }

  if (category === "distracting") {
    score += 40;
    reasons.push("Known distracting domain");
    if (durationSeconds > 60) {
      score += 20;
      reasons.push("Stayed longer than a minute");
    }
  }

  // Sustained time on anything that is not the work keeps escalating, so a
  // ten-minute sit is never scored the same as a two-minute one.
  if (["ambiguous", "distracting", "unknown"].includes(category)) {
    if (durationSeconds > 300) {
      score += 12;
      reasons.push("Over five minutes here");
    }
    if (durationSeconds > 600) {
      score += 12;
      reasons.push("Over ten minutes here");
    }
  }

  if (category === "ambiguous") {
    score += session.intentionType === "research" ? 8 : 32;
    reasons.push("Ambiguous work/social domain");
    if (durationSeconds > 60) {
      score += session.intentionType === "research" ? 14 : 26;
      reasons.push("Ambiguous site for more than 1 minute");
    }
  }

  if (category === "communication" && session.intentionType !== "communication") {
    score += 14;
    reasons.push("Communication app outside a communication session");
  }

  if (category === "unknown") {
    score += session.intentionType === "research" ? 4 : 16;
    reasons.push("Unclassified domain");

    if (durationSeconds > 45) {
      score += session.intentionType === "research" ? 8 : 24;
      reasons.push("Unclassified site for more than 45 seconds");
    }

    if (durationSeconds > 120) {
      score += session.intentionType === "research" ? 8 : 16;
      reasons.push("Unclassified site for more than 2 minutes");
    }
  }

  if (category === "research" && !["research", "coding", "study"].includes(session.intentionType)) {
    score += 6;
    reasons.push("Research-like site outside a research session");
  }

  if (["ambiguous", "distracting", "unknown"].includes(category) && hasLowTitleOverlap(session.intention, observation.title)) {
    score += 10;
    reasons.push("Tab title appears weakly related to the intention");
  }

  // A tab title that echoes the intention is the strongest evidence that an
  // ambiguous site is being used for real work. Without this, an on-topic
  // tutorial on YouTube scores the same as an off-topic one.
  if (["ambiguous", "unknown"].includes(category)) {
    const overlap = titleOverlapCount(session.intention, observation.title);
    if (overlap >= 2) {
      score -= 30;
      reasons.push("Tab title closely matches the intention");
    } else if (overlap === 1) {
      score -= 16;
      reasons.push("Tab title partly matches the intention");
    }
  }

  const recentEvents = events.filter((event) => event.sessionId === session.id && now - event.endedAt <= 5 * 60 * 1000);
  const recentDomains = new Set(recentEvents.map((event) => event.domain));

  if (recentEvents.length >= 5) {
    score += 14;
    reasons.push("Frequent tab switching in the last 5 minutes");
  }

  if (recentDomains.size >= 4) {
    score += 12;
    reasons.push("Several domains visited recently");
  }

  const repeatedDistractor = recentEvents.filter((event) => event.domain === observation.domain).length >= 2;
  if (repeatedDistractor && ["ambiguous", "distracting"].includes(category)) {
    score += 10;
    reasons.push("Repeated return to the same drift-prone site");
  }

  if (category === "work") {
    score -= 24;
  }

  if (category === "research" && ["research", "coding", "study"].includes(session.intentionType)) {
    score -= 16;
  }

  if (session.allowedDomains.includes(observation.domain)) {
    score -= 30;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, category, reasons };
}

async function handleInterventionResponse(payload, sender) {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  const tab = sender?.tab || (await getActiveTab());
  const domain = payload.domain || (tab?.url ? extractDomain(tab.url) : "unknown");
  const response = payload.response || "dismiss";
  const responsePatch = {
    response,
    respondedAt: Date.now(),
    deliveryStatus: "responded",
    domain,
    title: payload.title || tab?.title || "",
    driftScore: payload.driftScore || null,
    reasons: payload.reasons || []
  };

  if (payload.interventionId) {
    await patchIntervention(payload.interventionId, responsePatch);
  } else {
    await appendBounded(
      STORAGE_KEYS.interventions,
      {
        id: createId(),
        sessionId: session.id,
        timestamp: Date.now(),
        ...responsePatch
      },
      1000
    );
  }

  let updatedSession = { ...session };

  if (updatedSession.driftWatch) {
    updatedSession.driftWatch = {
      ...updatedSession.driftWatch,
      awaitingResponse: false,
      pendingInterventionId: null
    };
  }

  if (response === "still_relevant") {
    await markDomainPreference(domain, session.intentionType, "aligned");
    updatedSession = {
      ...updatedSession,
      allowedDomains: Array.from(new Set([...(updatedSession.allowedDomains || []), domain])),
      lastAlignedUrl: tab?.url || updatedSession.lastAlignedUrl,
      lastAlignedTitle: tab?.title || updatedSession.lastAlignedTitle,
      lastAlignedDomain: domain || updatedSession.lastAlignedDomain,
      lastAlignedTabId: tab?.id ?? updatedSession.lastAlignedTabId,
      lastAlignedWindowId: tab?.windowId ?? updatedSession.lastAlignedWindowId,
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
    updatedSession.driftWatch = null;
    await finalizeObservation("break-start");
    scheduleBreakEndAlarm(breakMinutes);
  }

  if (response === "refocus") {
    updatedSession.driftWatch = null;
    await refocusToLastAligned(updatedSession, tab);
  }

  await storage.set({ [STORAGE_KEYS.activeSession]: updatedSession });
  await upsertSession(updatedSession);
  return { ok: true, session: updatedSession };
}

async function saveCurrentForLater(source, providedTab) {
  const session = await getActiveSession();
  if (!session) return { ok: false, error: "No active session." };

  const tab = providedTab || (await getActiveTab());
  if (!tab?.url || !isTrackableUrl(tab.url)) {
    return { ok: false, error: "This page cannot be saved." };
  }

  const item = {
    id: createId(),
    sessionId: session.id,
    timestamp: Date.now(),
    title: tab.title || extractDomain(tab.url),
    url: tab.url,
    domain: extractDomain(tab.url),
    source
  };

  await appendBounded(STORAGE_KEYS.savedItems, item, 1000);
  return { ok: true, item };
}

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

  if (
    currentTab.windowId &&
    tab.windowId === currentTab.windowId &&
    normalizeDomainList(session.allowedDomains || []).some((allowed) => domainMatches(tabDomain, allowed))
  ) {
    return tab;
  }

  return null;
}

async function findAllowedDomainTab(session, preferredWindowId, excludeTabId) {
  const allowedDomains = normalizeDomainList(session.allowedDomains || []);
  if (!allowedDomains.length) return null;

  const tabs = await queryTabs({});
  const candidates = tabs.filter((tab) => {
    if (tab.id === excludeTabId) return false;
    if (!tab.url || !isTrackableUrl(tab.url)) return false;
    const domain = extractDomain(tab.url);
    return allowedDomains.some((allowed) => domainMatches(domain, allowed));
  });

  if (!candidates.length) return null;

  // Rank by how likely each tab is to be the actual work, rather than just
  // any trusted tab. The tab the user last worked in wins; a domain they
  // merely marked "still relevant" mid-drift is the weakest signal.
  const score = (tab) => {
    const domain = extractDomain(tab.url);
    let rank = 0;
    if (tab.url === session.lastAlignedUrl) rank += 100;
    if (session.lastAlignedDomain && domain === session.lastAlignedDomain) rank += 50;
    if (tab.id === session.lastAlignedTabId) rank += 40;
    if (getDomainCategory(domain, null, {}) === "work") rank += 20;
    if (tab.windowId === preferredWindowId) rank += 5;
    return rank;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

function buildAllowedDomainUrl(session) {
  const domain = normalizeDomainList(session.allowedDomains || [])[0];
  if (!domain) return "";
  if (domain === "localhost" || domain.startsWith("localhost:")) return `http://${domain}`;
  if (domain === "127.0.0.1" || domain.startsWith("127.0.0.1:")) return `http://${domain}`;
  return `https://${domain}`;
}

function isAlignedSurface(observation, session, category) {
  const allowed = normalizeDomainList(session.allowedDomains || []);
  if (allowed.some((domain) => domainMatches(observation.domain, domain))) return true;

  // Work and research domains are real signals; "unknown" never is.
  if (category === "work") return true;
  if (category === "research" && ["research", "coding", "study"].includes(session.intentionType)) {
    return true;
  }

  return false;
}

async function rememberAlignedSurface(session, observation) {
  if (!observation.url || !isTrackableUrl(observation.url)) return;

  const updatedSession = {
    ...session,
    lastAlignedUrl: observation.url,
    lastAlignedTitle: observation.title,
    lastAlignedDomain: observation.domain,
    lastAlignedTabId: observation.tabId,
    lastAlignedWindowId: observation.windowId
  };

  await storage.set({ [STORAGE_KEYS.activeSession]: updatedSession });
  await upsertSession(updatedSession);
}

async function getRecap(sessionId) {
  const values = await storage.get({
    [STORAGE_KEYS.sessions]: [],
    [STORAGE_KEYS.events]: [],
    [STORAGE_KEYS.interventions]: [],
    [STORAGE_KEYS.savedItems]: []
  });

  const session = values[STORAGE_KEYS.sessions].find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "Session not found." };

  const events = values[STORAGE_KEYS.events].filter((event) => event.sessionId === sessionId);
  const interventions = values[STORAGE_KEYS.interventions].filter((item) => item.sessionId === sessionId);
  const savedItems = values[STORAGE_KEYS.savedItems].filter((item) => item.sessionId === sessionId);
  const stats = buildSessionStats(session, events, interventions);

  return { ok: true, session, events, interventions, savedItems, stats };
}

function buildSessionStats(session, events, interventions) {
  const byDomain = new Map();
  let trackedSeconds = 0;
  let driftSeconds = 0;
  let alignedSeconds = 0;

  for (const event of events) {
    trackedSeconds += event.durationSeconds;

    if (!byDomain.has(event.domain)) {
      byDomain.set(event.domain, {
        domain: event.domain,
        seconds: 0,
        category: event.category
      });
    }

    const domainStats = byDomain.get(event.domain);
    domainStats.seconds += event.durationSeconds;

    if (["ambiguous", "distracting", "unknown"].includes(event.category)) {
      driftSeconds += event.durationSeconds;
    } else {
      alignedSeconds += event.durationSeconds;
    }
  }

  const sessionSeconds = Math.max(
    0,
    Math.round(((session.endedAt || Date.now()) - session.startedAt) / 1000)
  );

  const responseCounts = interventions.reduce((counts, item) => {
    const responseKey = item.isReminder && item.response === "shown" ? "reminder_shown" : item.response;
    counts[responseKey] = (counts[responseKey] || 0) + 1;
    return counts;
  }, {});

  const caughtCount = interventions.filter((item) => !item.isReminder).length;
  const recoveredCount = interventions.filter((item) =>
    ["refocus", "save_later", "break_5", "break_10"].includes(item.response)
  ).length;

  return {
    sessionSeconds,
    trackedSeconds,
    alignedSeconds,
    driftSeconds,
    caughtCount,
    recoveredCount,
    topDomains: Array.from(byDomain.values()).sort((a, b) => b.seconds - a.seconds).slice(0, 8),
    responseCounts,
    interventionCount: interventions.length
  };
}

async function updateSettings(partial) {
  const current = await getSettings();
  const next = {
    ...current,
    ...partial,
    excludedDomains: normalizeDomainList(partial.excludedDomains ?? current.excludedDomains)
  };

  await storage.set({ [STORAGE_KEYS.settings]: next });
  return { ok: true, settings: next };
}

async function updateActiveSession(session) {
  await storage.set({ [STORAGE_KEYS.activeSession]: session });
  await upsertSession(session);
  return session;
}

async function clearAllData() {
  await storage.remove(Object.values(STORAGE_KEYS));
  await initializeDefaults();
  return { ok: true };
}

async function getSettings() {
  const values = await storage.get({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...values[STORAGE_KEYS.settings] };
}

async function getActiveSession() {
  const values = await storage.get({ [STORAGE_KEYS.activeSession]: null });
  return values[STORAGE_KEYS.activeSession];
}

async function upsertSession(session) {
  const values = await storage.get({ [STORAGE_KEYS.sessions]: [] });
  const sessions = values[STORAGE_KEYS.sessions];
  const index = sessions.findIndex((item) => item.id === session.id);

  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }

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

  interventions[index] = {
    ...interventions[index],
    ...patch
  };

  await storage.set({ [STORAGE_KEYS.interventions]: interventions });
}

async function getDomainPreferences() {
  const values = await storage.get({ [STORAGE_KEYS.domainPreferences]: {} });
  return values[STORAGE_KEYS.domainPreferences];
}

async function markDomainPreference(domain, intentionType, category) {
  if (!domain) return;
  const preferences = await getDomainPreferences();
  preferences[domainPreferenceKey(domain, intentionType)] = {
    domain,
    intentionType,
    category,
    updatedAt: Date.now()
  };
  await storage.set({ [STORAGE_KEYS.domainPreferences]: preferences });
}

function getDomainCategory(domain, session, domainPreferences) {
  if (!domain) return "unknown";

  if (session?.allowedDomains?.includes(domain)) return "work";

  const preference = domainPreferences[domainPreferenceKey(domain, session?.intentionType || "general")];
  if (preference?.category === "aligned") return "work";

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some((pattern) => domainMatches(domain, pattern))) return category;
  }

  return "unknown";
}

function getDriftReminderIntervalMs(session) {
  const minutes =
    DRIFT_REMINDER_INTERVAL_MINUTES[session?.sensitivity] ??
    DRIFT_REMINDER_INTERVAL_MINUTES.balanced;
  return minutes * 60 * 1000;
}

function classifyIntention(intention) {
  const normalized = intention.toLowerCase();

  for (const [type, keywords] of Object.entries(INTENTION_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return type;
  }

  return "general";
}

function titleOverlapCount(intention, title) {
  const intentionTokens = tokenize(intention);
  const titleTokens = new Set(tokenize(title));

  if (!intentionTokens.length || !titleTokens.size) return 0;
  return intentionTokens.filter((token) => titleTokens.has(token)).length;
}

function hasLowTitleOverlap(intention, title) {
  const intentionTokens = tokenize(intention);
  const titleTokens = tokenize(title);

  if (!intentionTokens.length || !titleTokens.length) return false;

  const titleSet = new Set(titleTokens);
  return intentionTokens.every((token) => !titleSet.has(token));
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function normalizeDomainList(value) {
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((item) => normalizeDomain(item))
      .filter(Boolean);
  }

  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => normalizeDomain(item)).filter(Boolean)));
}

function isExcludedDomain(domain, excludedDomains) {
  return normalizeDomainList(excludedDomains).some((excluded) => domainMatches(domain, excluded));
}

function domainMatches(domain, pattern) {
  if (!domain || !pattern) return false;
  const cleanDomain = normalizeDomain(domain);
  const cleanPattern = normalizeDomain(pattern);

  return (
    cleanDomain === cleanPattern ||
    cleanDomain.endsWith(`.${cleanPattern}`) ||
    cleanDomain.includes(cleanPattern)
  );
}

function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  try {
    const maybeUrl = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return maybeUrl.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isTrackableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function domainPreferenceKey(domain, intentionType) {
  return `${normalizeDomain(domain)}::${intentionType || "general"}`;
}

function getTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab));
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0] || null));
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
  if (typeof tab.windowId === "number") {
    await focusWindow(tab.windowId);
  }

  await updateTab(tab.id, { active: true });
}

function createTab(url, windowId) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, windowId, active: true }, (tab) => {
      resolve(chrome.runtime.lastError ? null : tab);
    });
  });
}

function focusWindow(windowId) {
  return new Promise((resolve) => {
    chrome.windows.update(windowId, { focused: true }, (window) => {
      resolve(chrome.runtime.lastError ? null : window);
    });
  });
}

async function showInterventionInTab(tabId, message) {
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

const BREAK_END_ALARM = "driftguard.breakEnd";
const BREAK_NOTIFICATION_ID = "driftguard.breakEnd.prompt";

function scheduleBreakEndAlarm(minutes) {
  chrome.alarms.create(BREAK_END_ALARM, { delayInMinutes: minutes });
}

async function handleBreakEnd() {
  const session = await getActiveSession();
  if (!session || session.status === "ended") return;

  // A break that was cleared or extended since scheduling should not prompt.
  if (session.breakUntil && session.breakUntil > Date.now() + 5000) {
    scheduleBreakEndAlarm(Math.ceil((session.breakUntil - Date.now()) / 60000));
    return;
  }

  const clearedSession = { ...session, breakUntil: null, breakMinutes: null };
  await storage.set({ [STORAGE_KEYS.activeSession]: clearedSession });
  await upsertSession(clearedSession);

  const shown = await createNotification(BREAK_NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Break's up",
    message: `Ready to return to: ${clearedSession.intention}?`,
    buttons: [{ title: "Back to work" }, { title: "5 more minutes" }],
    priority: 2
  });

  if (shown) return;

  // Notifications can still be suppressed by Focus Assist, Do Not Disturb, or
  // a full-screen app. Fall back to the in-page card, which always renders.
  await showBreakEndOverlay(clearedSession);
}

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

async function showBreakEndOverlay(session) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !isTrackableUrl(tab.url)) return;

  const interventionId = createId();

  try {
    await showInterventionInTab(tab.id, {
      type: "DRIFTGUARD_SHOW_INTERVENTION",
      payload: {
        interventionId,
        sessionId: session.id,
        intention: session.intention,
        domain: extractDomain(tab.url),
        title: tab.title || "",
        driftScore: 0,
        reasons: ["Your break just ended"],
        isBreakEnd: true,
        isReminder: false,
        reminderCount: 0
      }
    });
  } catch (error) {
    console.warn("Unable to show break-end overlay", error);
  }
}

async function handleBreakNotificationButton(buttonIndex) {
  chrome.notifications.clear(BREAK_NOTIFICATION_ID);

  if (buttonIndex === 1) {
    const session = await getActiveSession();
    if (!session) return;

    const extended = {
      ...session,
      breakUntil: Date.now() + 5 * 60 * 1000,
      breakMinutes: 5
    };
    await storage.set({ [STORAGE_KEYS.activeSession]: extended });
    await upsertSession(extended);
    scheduleBreakEndAlarm(5);
    return;
  }

  await observeActiveTab("break-end-return");
}

const NOTIFICATION_PREFIX = "driftguard.intervention.";
const NOTIFICATION_BUTTONS = ["still_relevant", "refocus"];

async function showInterventionNotification(interventionId, { intention, domain, isReminder }) {
  if (!chrome.notifications?.create) return false;

  const notificationId = `${NOTIFICATION_PREFIX}${interventionId}`;

  return createNotification(notificationId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: isReminder ? "Still away from the thread?" : "Still part of the thread?",
    message: intention || "Current work session",
    contextMessage: domain || "",
    buttons: [{ title: "Still relevant" }, { title: "Refocus me" }],
    priority: 2
  });
}

function parseNotificationId(notificationId) {
  if (!notificationId?.startsWith(NOTIFICATION_PREFIX)) return null;
  return notificationId.slice(NOTIFICATION_PREFIX.length);
}

if (chrome.notifications?.onButtonClicked) {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === BREAK_NOTIFICATION_ID) {
      void handleBreakNotificationButton(buttonIndex);
      return;
    }

    const interventionId = parseNotificationId(notificationId);
    if (!interventionId) return;

    chrome.notifications.clear(notificationId);
    void handleInterventionResponse({
      interventionId,
      response: NOTIFICATION_BUTTONS[buttonIndex] || "dismiss"
    });
  });
}

if (chrome.notifications?.onClosed) {
  chrome.notifications.onClosed.addListener((notificationId, byUser) => {
    const interventionId = parseNotificationId(notificationId);
    if (!interventionId || !byUser) return;

    void handleInterventionResponse({ interventionId, response: "dismiss" });
  });
}

function injectContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["src/content.js"]
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      }
    );
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

async function isActiveTab(tabId) {
  const active = await getActiveTab();
  return active?.id === tabId;
}
