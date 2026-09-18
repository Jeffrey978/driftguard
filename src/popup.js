import { hydrateMascots, setMascotSlot } from "./mascot.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_MS = 5000;
const TICK_MS = 1000;
const RING_CIRCUMFERENCE = 2 * Math.PI * 70;
const DURATIONS = [0, 25, 50, 90];
const GOAL_STEP = 15;
const GOAL_MIN = 15;
const GOAL_MAX = 720;
const STARTERS = ["Write the first draft", "Fix one bug", "Study one lesson", "Clear my inbox"];
const DRIFT_PRONE = new Set(["ambiguous", "distracting"]);

const CATEGORY_LABELS = {
  work: "Work",
  research: "Research",
  communication: "Communication",
  ambiguous: "Could go either way",
  distracting: "Drift-prone"
};

const DATA_COPY_LOCAL =
  "Everything stays in this browser. No account, no server, no keystrokes, no screenshots, nothing outside a session.";
const DATA_COPY_AI =
  "Your history stays in this browser. With the AI check on, the visible tab's screenshot and text go to DriftGuard's server during sessions, are checked, and are not stored. Only the yes/no answer is kept here.";

const IS_MAC = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || "");

// Shown when chrome.commands isn't available (e.g. the page opened outside the extension).
const FALLBACK_SHORTCUTS = {
  _execute_action: IS_MAC ? "⌥⇧D" : "Alt+Shift+D",
  "toggle-focus": IS_MAC ? "⌥⇧F" : "Alt+Shift+F",
  "save-for-later": IS_MAC ? "⌥⇧S" : "Alt+Shift+S"
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $ = (selector) => document.querySelector(selector);
const app = $("#app");

const state = {
  snapshot: null,
  receivedAt: 0,
  view: "loading",
  settingsReturn: "idle",
  duration: 25,
  idleReady: false,
  trustTouched: false,
  lastDomain: undefined,
  celebrating: false,
  goalSaveTimer: null,
  deleteArmTimer: null,
  noticeTimer: null,
  busy: false
};

let shortcutMap = { ...FALLBACK_SHORTCUTS };

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
if (params.get("view") === "tab") document.body.classList.add("as-tab");

hydrateMascots(document);
bindEvents();
void loadShortcuts();
$("#versionLabel").textContent = `DriftGuard ${chrome.runtime.getManifest?.().version || ""} · Local-first`;
void refresh();
setInterval(refresh, REFRESH_MS);
setInterval(tick, TICK_MS);

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

async function send(type, payload = {}) {
  try {
    const response = await chrome.runtime.sendMessage({ type, payload });
    return response || { ok: false, error: "No response" };
  } catch (error) {
    return { ok: false, error: error?.message || "DriftGuard isn't responding. Try again." };
  }
}

async function refresh() {
  const data = await send("DRIFTGUARD_GET_SNAPSHOT");
  if (!data.ok) {
    if (state.view === "loading") showNotice("Couldn't load DriftGuard. Reopen the popup.", true);
    return;
  }
  state.snapshot = data;
  state.receivedAt = Date.now();
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  const data = state.snapshot;
  if (!data) return;

  renderHeader(data);

  const session = data.activeSession;
  const baseView = session ? "active" : "idle";
  if (state.view !== "settings") setView(baseView);
  state.settingsReturn = baseView;

  if (session) renderActive(data);
  else renderIdle(data);

  renderLots(data);
  renderSettings(data);
  maybeCelebrate(data);
}

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  app.dataset.view = view;
  if (view === "idle") requestAnimationFrame(() => $("#intentionInput")?.focus({ preventScroll: true }));
}

function renderHeader(data) {
  const { progress } = data;
  $("#streakCount").textContent = progress.streak;
  $("#streakPill").classList.toggle("lit", progress.streak > 0);
  $("#streakPill").title = progress.streak
    ? `${progress.streak}-day streak · best ${Math.max(progress.bestStreak, progress.streak)}`
    : "No streak yet. Focus 10 minutes in a session to start one.";
  $("#levelNum").textContent = progress.level;
  $("#levelPill").title = `Level ${progress.level} · ${progress.into} of ${progress.needed} XP to the next level`;
}

function renderIdle(data) {
  const { progress } = data;

  const hour = new Date().getHours();
  $("#greeting").textContent =
    hour < 5 ? "Burning the midnight oil?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  $("#greetingSub").textContent =
    progress.streak > 0 ? `Day ${progress.streak} of your streak. What's the one thing?` : "What's the one thing you'll do?";

  // Only touch form controls on first render so polling never fights the user.
  if (!state.idleReady) {
    state.idleReady = true;
    renderChips(data);
    const preferred = DURATIONS.includes(data.lastDurationMinutes) ? data.lastDurationMinutes : 25;
    setDuration(preferred);
  }

  if (data.currentDomain !== state.lastDomain) {
    state.lastDomain = data.currentDomain;
    applyTrustDefault(data);
  }

  const todayMinutes = Math.floor(progress.todayFocusSeconds / 60);
  $("#todayMinutes").textContent = todayMinutes;
  $("#goalMinutes").textContent = progress.goalMinutes;
  setMeter($("#todayMeter"), todayMinutes / progress.goalMinutes);

  $("#streakDays").textContent = progress.streak;
  $("#streakUnit").textContent = progress.streak === 1 ? " day" : " days";
  $("#streakNote").textContent = progress.streak
    ? `Best ${Math.max(progress.bestStreak, progress.streak)}`
    : "10 focused min starts one";

  $("#levelStat").textContent = progress.level;
  $("#xpInto").textContent = progress.into;
  $("#xpNeeded").textContent = progress.needed;
  setMeter($("#xpMeter"), progress.progress);

  $("#lastRecapButton").classList.toggle("hidden", !data.lastSessionId);
  $("#aiConsent").classList.toggle("hidden", !data.ai?.consentNeeded);
}

function renderChips(data) {
  const chips = $("#chips");
  chips.textContent = "";
  const recent = data.recentIntentions || [];
  const seen = new Set(recent.map((item) => item.toLowerCase()));
  const starters = STARTERS.filter((item) => !seen.has(item.toLowerCase()));

  for (const text of recent) chips.append(makeChip(text, true));
  for (const text of starters) chips.append(makeChip(text, false));
}

function makeChip(text, isRecent) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${isRecent ? " recent" : ""}`;
  button.title = isRecent ? `Pick up "${text}" again` : text;
  if (isRecent) {
    button.insertAdjacentHTML(
      "afterbegin",
      '<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 4v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 7v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
    );
  }
  const label = document.createElement("span");
  label.textContent = text;
  button.append(label);
  button.addEventListener("click", () => {
    const input = $("#intentionInput");
    input.value = text;
    input.focus();
    input.setSelectionRange(text.length, text.length);
    clearFormError();
  });
  return button;
}

function applyTrustDefault(data) {
  const toggle = $("#trustToggle");
  const hint = $("#trustHint");
  const domain = data.currentDomain;
  const category = data.currentDomainBaseCategory;

  hint.classList.remove("warn");
  if (!domain) {
    toggle.checked = false;
    toggle.disabled = true;
    hint.textContent = "Open the page you're working on to trust it.";
    return;
  }

  toggle.disabled = false;
  if (state.trustTouched) {
    hint.textContent = toggle.checked ? `${domain} won't trigger check-ins.` : `${domain} is watched like any other site.`;
    return;
  }

  if (DRIFT_PRONE.has(category)) {
    toggle.checked = false;
    hint.textContent = `${domain} is a common drift spot, so it's off by default.`;
    hint.classList.add("warn");
  } else {
    toggle.checked = true;
    hint.textContent = `${domain} won't trigger check-ins.`;
  }
}

function setDuration(minutes) {
  state.duration = minutes;
  setSegmented($("#durationControl"), (button) => Number(button.dataset.minutes) === minutes);
}

function setSegmented(control, isSelected) {
  const buttons = Array.from(control.querySelectorAll("button[role='radio']"));
  let index = 0;
  buttons.forEach((button, i) => {
    const selected = isSelected(button);
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected) index = i;
  });
  control.style.setProperty("--index", index);
}

function renderActive(data) {
  const session = data.activeSession;
  $("#activeIntention").textContent = session.intention;
  $("#activeIntention").title = session.intention;

  // Current site.
  const domain = data.currentDomain;
  const category = data.currentDomainCategory;
  const catClass = `cat-${category || "unknown"}`;
  $("#siteDomain").textContent = domain || "Nothing to track here";
  const chip = $("#siteCategory");
  chip.className = `chip-cat ${catClass}`;
  chip.textContent = domain ? CATEGORY_LABELS[category] || "Not tracked" : "Browser page";
  const avatar = $("#siteAvatar");
  avatar.className = `site-avatar ${catClass}`;
  avatar.textContent = domain ? domain.replace(/^www\./, "").charAt(0) : "·";
  $("#trustButton").classList.toggle("hidden", !domain || !DRIFT_PRONE.has(category));
  $("#saveButton").disabled = !domain;
  renderAi(data);

  // A lock screen is waiting on a page.
  $("#lockNote").classList.toggle("hidden", data.pendingPromptMode !== "lock");

  // Today vs goal.
  const todayMinutes = Math.floor(data.progress.todayFocusSeconds / 60);
  $("#activeToday").textContent = todayMinutes;
  $("#activeGoal").textContent = data.progress.goalMinutes;
  setMeter($("#activeTodayMeter"), todayMinutes / data.progress.goalMinutes);

  tick();
}

function renderAi(data) {
  const ai = data.ai || {};
  const paused = data.activeSession?.status === "paused";
  $("#aiPill").classList.toggle("hidden", !ai.enabled);
  $("#aiPill").classList.toggle("muted", Boolean(paused || data.breakRemainingMs));

  const chip = $("#aiVerdict");
  const verdict = ai.verdict && ai.verdict.domain === data.currentDomain ? ai.verdict : null;
  chip.className = "ai-verdict hidden";
  chip.textContent = "";
  if (!ai.enabled || !data.currentDomain) return;

  if (verdict?.stance === "on_task") {
    chip.className = "ai-verdict on";
    chip.textContent = "AI: on task";
    chip.title = verdict.reason || "The AI check thinks this page fits your task";
  } else if (verdict?.stance === "off_task") {
    chip.className = "ai-verdict off";
    chip.textContent = verdict.reason ? `AI: off task — ${verdict.reason}` : "AI: off task";
    chip.title = verdict.reason || "The AI check thinks this page doesn't fit your task";
  } else if (verdict) {
    chip.className = "ai-verdict unsure";
    chip.textContent = "AI: not sure, the usual rules decide";
    chip.title = verdict.reason || "";
  } else if (ai.status === "pending") {
    chip.className = "ai-verdict pending";
    chip.textContent = "AI: checking this page…";
    chip.title = "";
  }
}

function tick() {
  const data = state.snapshot;
  const session = data?.activeSession;
  if (!session || state.view === "loading") return;

  const drift = Date.now() - state.receivedAt;
  const paused = session.status === "paused";
  const breakLeft = Math.max(0, (data.breakRemainingMs || 0) - drift);
  const onBreak = breakLeft > 0;
  const elapsed = data.elapsedMs + (paused ? 0 : drift);
  const durationMs = (session.durationMinutes || 0) * 60000;
  const remaining = durationMs ? Math.max(0, durationMs - elapsed) : null;
  const drifting = !paused && !onBreak && (data.pendingPrompt || DRIFT_PRONE.has(data.currentDomainCategory));

  app.classList.toggle("is-paused", paused);
  $("#pauseLabel").textContent = paused ? "Resume" : "Pause";

  const status = $("#statusLine");
  status.dataset.state = paused ? "paused" : onBreak ? "break" : drifting ? "drift" : "focus";
  $("#statusText").textContent = paused
    ? "Paused"
    : onBreak
      ? `On a break · ${formatClock(breakLeft)} left`
      : data.pendingPromptMode === "lock"
        ? "Locked until you answer"
        : data.pendingPrompt
        ? "Checking in with you"
        : drifting
          ? "Off track?"
          : "Focusing";

  if (!state.celebrating) {
    setMood("#activeMascot", paused || onBreak ? "sleepy" : drifting ? "alert" : "happy");
  }

  const ring = $("#ringFill");
  if (remaining !== null) {
    $("#ringTime").textContent = formatClock(remaining);
    $("#ringLabel").textContent = paused ? "paused" : `of ${session.durationMinutes} min`;
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (remaining / durationMs));
  } else {
    // Open session: the ring fills once per hour.
    $("#ringTime").textContent = formatClock(elapsed);
    $("#ringLabel").textContent = paused ? "paused" : "open session";
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - (elapsed % 3600000) / 3600000));
  }

  if (remaining === 0 && !state.busy) {
    // The background completes the session on its next tick; pull it sooner.
    state.busy = true;
    setTimeout(() => {
      state.busy = false;
      void refresh();
    }, 1500);
  }
}

function renderLots(data) {
  for (const slot of document.querySelectorAll(".lot-slot")) {
    if (slot.dataset.lot !== state.settingsReturn) {
      slot.textContent = "";
      delete slot.dataset.signature;
      continue;
    }
    renderLot(slot, data.parkingLot || [], slot.dataset.lot === "active");
  }
}

function renderLot(slot, items, showEmpty) {
  const signature = `${items.map((item) => item.id).join(",")}|${showEmpty}`;
  if (slot.dataset.signature === signature) return;
  slot.dataset.signature = signature;
  slot.textContent = "";

  if (!items.length && !showEmpty) return;

  const section = $("#lotTemplate").content.firstElementChild.cloneNode(true);
  section.querySelector(".lot-count").textContent = items.length ? String(items.length) : "";
  const openAll = section.querySelector(".lot-open-all");
  openAll.classList.toggle("hidden", items.length < 2);
  openAll.addEventListener("click", () => openAllSaved(items));

  const list = section.querySelector(".lot-list");
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "lot-empty";
    empty.append("Tempting tab? Park it here for later. ");
    const kbd = document.createElement("kbd");
    kbd.dataset.shortcut = "save-for-later";
    empty.append(kbd);
    list.append(empty);
  }

  for (const item of items.slice(0, 20)) list.append(makeLotItem(item));
  slot.append(section);
  applyShortcutLabels(slot);
}

function makeLotItem(item) {
  const li = document.createElement("li");
  li.className = "lot-item";

  const open = document.createElement("button");
  open.type = "button";
  open.className = "lot-open";
  open.title = item.url;
  const title = document.createElement("strong");
  title.textContent = item.title || item.domain;
  const meta = document.createElement("span");
  meta.textContent = `${item.domain} · ${timeAgo(item.timestamp)}`;
  open.append(title, meta);
  open.addEventListener("click", () => {
    chrome.tabs.create({ url: item.url, active: true });
  });

  const done = iconButton(
    "done",
    "Mark as done",
    '<path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
  );
  done.addEventListener("click", () => removeLotItem(li, "DRIFTGUARD_SAVED_DONE", item.id));

  const remove = iconButton(
    "remove",
    "Remove from parking lot",
    '<path d="M5.5 6.5h9M8.5 6.5V5h3v1.5M7 6.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  );
  remove.addEventListener("click", () => removeLotItem(li, "DRIFTGUARD_SAVED_REMOVE", item.id));

  li.append(open, done, remove);
  return li;
}

function iconButton(className, label, path) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-btn ${className}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">${path}</svg>`;
  return button;
}

async function removeLotItem(li, type, id) {
  li.classList.add("leaving");
  const result = await send(type, { id });
  if (!result.ok) {
    li.classList.remove("leaving");
    showNotice(result.error || "Couldn't update that link.", true);
    return;
  }
  setTimeout(refresh, 180);
}

async function openAllSaved(items) {
  for (const item of items) chrome.tabs.create({ url: item.url, active: false });
  await send("DRIFTGUARD_SAVED_DONE", { ids: items.map((item) => item.id) });
  showNotice(`Opened ${items.length} tabs and cleared the lot`);
  void refresh();
}

function renderSettings(data) {
  if (state.view === "settings" && document.activeElement?.closest?.(".view-settings")) return;
  const { settings } = data;
  setSegmented($("#sensitivityControl"), (button) => button.dataset.value === settings.sensitivity);
  updateSensitivityHint(settings.sensitivity);
  $("#goalValue").textContent = settings.dailyGoalMinutes;
  $("#trackTitlesToggle").checked = Boolean(settings.trackTabTitles);
  $("#excludedInput").value = (settings.excludedDomains || []).join(", ");
  $("#aiCheckToggle").checked = Boolean(settings.aiCheck);
  $("#aiEndpointInput").value = settings.aiEndpointOverride || "";
  if (settings.aiEndpointOverride) $("#aiAdvanced").open = true;
  $("#dataCopy").textContent = settings.aiCheck ? DATA_COPY_AI : DATA_COPY_LOCAL;
}

function updateSensitivityHint(value) {
  $("#sensitivityHint").textContent =
    value === "calm"
      ? "Only speaks up when you're clearly off track."
      : value === "strict"
        ? "Checks in quickly. Good for deadline days."
        : "A nudge after a couple of minutes off track.";
}

// ---------------------------------------------------------------------------
// Mascot
// ---------------------------------------------------------------------------

function setMood(selector, mood) {
  const slot = $(selector);
  if (!slot || slot.getAttribute("data-mascot") === mood) return;
  setMascotSlot(slot, mood);
  slot.classList.remove("pop");
  void slot.offsetWidth;
  slot.classList.add("pop");
}

function maybeCelebrate(data) {
  const celebrate = data.progress.celebrate;
  if (!celebrate || state.celebrating) return;
  state.celebrating = true;

  const target = data.activeSession ? "#activeMascot" : "#idleMascot";
  setMood(target, "celebrate");
  const banner = $("#celebrateBanner");
  banner.textContent = `Level up! You're now level ${celebrate.level}.`;
  banner.classList.toggle("hidden", Boolean(data.activeSession));
  if (data.activeSession) showNotice(`Level up! You're now level ${celebrate.level}.`);

  void send("DRIFTGUARD_ACK_CELEBRATION");
  setTimeout(() => {
    state.celebrating = false;
    if (!data.activeSession) setMood("#idleMascot", "idle");
    tick();
  }, 3200);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents() {
  $("#startForm").addEventListener("submit", onStart);
  $("#intentionInput").addEventListener("input", clearFormError);

  bindSegmented($("#durationControl"), (button) => setDuration(Number(button.dataset.minutes)));
  bindSegmented($("#sensitivityControl"), (button) => {
    const value = button.dataset.value;
    setSegmented($("#sensitivityControl"), (b) => b === button);
    updateSensitivityHint(value);
    void saveSettings({ sensitivity: value }, "Sensitivity saved");
  });

  $("#trustToggle").addEventListener("change", () => {
    state.trustTouched = true;
    if (state.snapshot) applyTrustDefault(state.snapshot);
  });

  $("#pauseButton").addEventListener("click", onPauseToggle);
  $("#endButton").addEventListener("click", onEnd);
  $("#saveButton").addEventListener("click", onSaveCurrent);
  $("#trustButton").addEventListener("click", onTrustCurrent);

  $("#settingsButton").addEventListener("click", () => {
    if (state.view === "settings") closeSettings();
    else openSettings();
  });
  $("#settingsBack").addEventListener("click", closeSettings);

  $("#goalDown").addEventListener("click", () => nudgeGoal(-GOAL_STEP));
  $("#goalUp").addEventListener("click", () => nudgeGoal(GOAL_STEP));
  $("#trackTitlesToggle").addEventListener("change", (event) =>
    saveSettings({ trackTabTitles: event.target.checked }, event.target.checked ? "Tab titles on" : "Tab titles off")
  );
  $("#excludedInput").addEventListener("change", (event) =>
    saveSettings({ excludedDomains: splitDomains(event.target.value) }, "Never-track list saved")
  );
  $("#aiCheckToggle").addEventListener("change", (event) => {
    $("#dataCopy").textContent = event.target.checked ? DATA_COPY_AI : DATA_COPY_LOCAL;
    return saveSettings(
      { aiCheck: event.target.checked, aiConsentAnswered: true },
      event.target.checked ? "AI check on" : "AI check off"
    );
  });
  $("#aiEndpointInput").addEventListener("change", async (event) => {
    const value = event.target.value.trim();
    const ok = await saveSettings(
      { aiEndpointOverride: value },
      value ? "AI endpoint saved" : "Using DriftGuard's server"
    );
    if (!ok) event.target.value = state.snapshot?.settings?.aiEndpointOverride || "";
  });
  $("#aiConsentOn").addEventListener("click", async () => {
    $("#aiConsent").classList.add("hidden");
    await saveSettings({ aiCheck: true, aiConsentAnswered: true }, "AI check on. Change it any time in Settings.");
  });
  $("#aiConsentLater").addEventListener("click", async () => {
    $("#aiConsent").classList.add("hidden");
    await saveSettings({ aiConsentAnswered: true }, "No problem. It's in Settings if you change your mind.");
  });
  $("#clearDataButton").addEventListener("click", onClearData);
  $("#shortcutsLink").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

  $("#lastRecapButton").addEventListener("click", () => {
    if (state.snapshot?.lastSessionId) openRecap(state.snapshot.lastSessionId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.view === "settings") {
      event.preventDefault();
      closeSettings();
    }
  });
}

function bindSegmented(control, onSelect) {
  control.addEventListener("click", (event) => {
    const button = event.target.closest("button[role='radio']");
    if (button) onSelect(button);
  });
  control.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(control.querySelectorAll("button[role='radio']"));
    const current = buttons.findIndex((button) => button.getAttribute("aria-checked") === "true");
    const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = buttons[(current + step + buttons.length) % buttons.length];
    onSelect(next);
    next.focus();
  });
}

async function onStart(event) {
  event.preventDefault();
  const intention = $("#intentionInput").value.trim();
  if (!intention) {
    showFormError("Name the one thing first. A few words is plenty.");
    $("#intentionInput").focus();
    return;
  }

  const button = $("#startButton");
  button.disabled = true;
  const domain = state.snapshot?.currentDomain;
  const result = await send("DRIFTGUARD_START_SESSION", {
    intention,
    durationMinutes: state.duration,
    allowedDomains: $("#trustToggle").checked && domain ? [domain] : []
  });
  button.disabled = false;

  if (!result.ok) {
    showFormError(result.error || "Couldn't start. Try again.");
    return;
  }
  state.idleReady = false;
  await refresh();
}

async function onPauseToggle() {
  const paused = state.snapshot?.activeSession?.status === "paused";
  const result = await send(paused ? "DRIFTGUARD_RESUME_SESSION" : "DRIFTGUARD_PAUSE_SESSION");
  if (!result.ok) showNotice(result.error || "Couldn't do that.", true);
  await refresh();
}

async function onEnd() {
  const button = $("#endButton");
  button.disabled = true;
  const result = await send("DRIFTGUARD_END_SESSION");
  button.disabled = false;
  if (!result.ok) {
    showNotice(result.error || "Couldn't end the session.", true);
    await refresh();
    return;
  }
  openRecap(result.sessionId);
}

async function onSaveCurrent() {
  const result = await send("DRIFTGUARD_SAVE_CURRENT");
  if (!result.ok) showNotice(result.error || "This page can't be saved.", true);
  else showNotice(result.duplicate ? "Already in your parking lot" : "Saved for later");
  await refresh();
}

async function onTrustCurrent() {
  const result = await send("DRIFTGUARD_TRUST_CURRENT");
  if (!result.ok) showNotice(result.error || "Couldn't trust this page.", true);
  else showNotice(`${result.domain} counts as work for this session`);
  await refresh();
}

function openSettings() {
  setView("settings");
  $("#settingsButton").setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => $("#settingsBack").focus({ preventScroll: true }));
}

function closeSettings() {
  disarmDelete();
  $("#settingsButton").setAttribute("aria-expanded", "false");
  setView(state.settingsReturn);
  render();
}

function nudgeGoal(delta) {
  const output = $("#goalValue");
  const next = Math.min(GOAL_MAX, Math.max(GOAL_MIN, (Number(output.textContent) || 120) + delta));
  output.textContent = next;
  clearTimeout(state.goalSaveTimer);
  state.goalSaveTimer = setTimeout(() => saveSettings({ dailyGoalMinutes: next }, `Daily goal: ${next} min`), 450);
}

async function saveSettings(partial, message) {
  const result = await send("DRIFTGUARD_UPDATE_SETTINGS", partial);
  if (!result.ok) {
    showNotice(result.error || "Couldn't save settings.", true);
    void refresh();
    return false;
  }
  if (state.snapshot) state.snapshot.settings = result.settings;
  if (message) showNotice(message);
  void refresh();
  return true;
}

async function onClearData() {
  const button = $("#clearDataButton");
  if (!button.classList.contains("confirming")) {
    button.classList.add("confirming");
    button.textContent = "Tap again to delete everything";
    state.deleteArmTimer = setTimeout(disarmDelete, 4000);
    return;
  }
  disarmDelete();
  const result = await send("DRIFTGUARD_CLEAR_DATA");
  if (!result.ok) {
    showNotice(result.error || "Couldn't delete data.", true);
    return;
  }
  state.idleReady = false;
  showNotice("All DriftGuard data deleted");
  closeSettings();
  await refresh();
}

function disarmDelete() {
  clearTimeout(state.deleteArmTimer);
  const button = $("#clearDataButton");
  button.classList.remove("confirming");
  button.textContent = "Delete all data";
}

function openRecap(sessionId) {
  chrome.tabs.create({ url: chrome.runtime.getURL(`src/recap.html?sessionId=${encodeURIComponent(sessionId)}`) });
  if (!document.body.classList.contains("as-tab")) window.close();
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

async function loadShortcuts() {
  try {
    const commands = await chrome.commands.getAll();
    const map = {};
    for (const command of commands) map[command.name] = command.shortcut || "";
    shortcutMap = { ...FALLBACK_SHORTCUTS, ...map };
  } catch {
    shortcutMap = { ...FALLBACK_SHORTCUTS };
  }
  applyShortcutLabels(document);
}

function applyShortcutLabels(root) {
  for (const kbd of root.querySelectorAll("kbd[data-shortcut]")) {
    const value = formatShortcut(shortcutMap[kbd.dataset.shortcut]);
    kbd.textContent = value;
    kbd.classList.toggle("hidden", !value);
  }
  const openHint = $("#openHint");
  if (openHint) openHint.classList.toggle("hidden", !shortcutMap._execute_action);
}

function formatShortcut(shortcut) {
  if (!shortcut) return "";
  if (!IS_MAC) return shortcut;
  // Chrome already reports mac shortcuts as symbols; normalise the fallback form too.
  return shortcut
    .replace(/Alt\+|Option\+/g, "⌥")
    .replace(/Shift\+/g, "⇧")
    .replace(/(Command|Cmd)\+/g, "⌘")
    .replace(/(MacCtrl|Ctrl)\+/g, "⌃");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setMeter(el, ratio) {
  el.style.width = `${Math.round(Math.min(1, Math.max(0, ratio || 0)) * 100)}%`;
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function splitDomains(value) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function showFormError(message) {
  const error = $("#formError");
  error.textContent = message;
  error.classList.remove("hidden");
}

function clearFormError() {
  $("#formError").classList.add("hidden");
}

function showNotice(message, isError = false) {
  const notice = $("#notice");
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.classList.add("show");
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => notice.classList.remove("show"), 2400);
}
