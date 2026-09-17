const elements = {
  statusDot: document.querySelector("#statusDot"),
  statusLabel: document.querySelector("#statusLabel"),
  currentDomainPreview: document.querySelector("#currentDomainPreview"),
  quickIntentButtons: Array.from(document.querySelectorAll("[data-template]")),
  emptyState: document.querySelector("#emptyState"),
  activeState: document.querySelector("#activeState"),
  intentionInput: document.querySelector("#intentionInput"),
  durationSelect: document.querySelector("#durationSelect"),
  sensitivitySelect: document.querySelector("#sensitivitySelect"),
  allowCurrentDomain: document.querySelector("#allowCurrentDomain"),
  allowedDomainsInput: document.querySelector("#allowedDomainsInput"),
  startSessionButton: document.querySelector("#startSessionButton"),
  activeIntention: document.querySelector("#activeIntention"),
  elapsedTime: document.querySelector("#elapsedTime"),
  currentDomain: document.querySelector("#currentDomain"),
  promptCount: document.querySelector("#promptCount"),
  savedCount: document.querySelector("#savedCount"),
  pauseButton: document.querySelector("#pauseButton"),
  saveCurrentButton: document.querySelector("#saveCurrentButton"),
  endSessionButton: document.querySelector("#endSessionButton"),
  openRecapButton: document.querySelector("#openRecapButton"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsBody: document.querySelector("#settingsBody"),
  trackTitlesCheckbox: document.querySelector("#trackTitlesCheckbox"),
  excludedDomainsInput: document.querySelector("#excludedDomainsInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  clearDataButton: document.querySelector("#clearDataButton"),
  recentSection: document.querySelector("#recentSection"),
  recentSessions: document.querySelector("#recentSessions"),
  notice: document.querySelector("#notice")
};

let snapshot = null;
let refreshTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  void refresh();
  refreshTimer = setInterval(refresh, 5000);
});

window.addEventListener("unload", () => {
  if (refreshTimer) clearInterval(refreshTimer);
});

function bindEvents() {
  elements.startSessionButton.addEventListener("click", startSession);
  elements.endSessionButton.addEventListener("click", endSession);
  elements.pauseButton.addEventListener("click", togglePause);
  elements.saveCurrentButton.addEventListener("click", saveCurrent);
  elements.openRecapButton.addEventListener("click", openActiveRecap);
  elements.saveSettingsButton.addEventListener("click", saveSettings);
  elements.clearDataButton.addEventListener("click", clearAllData);
  elements.settingsToggle.addEventListener("click", toggleSettings);
  elements.allowCurrentDomain.addEventListener("change", () => {
    trustTouchedByUser = true;
  });
  elements.quickIntentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      elements.intentionInput.value = button.dataset.template || "";
      elements.intentionInput.focus();
    });
  });
}

async function refresh() {
  snapshot = await sendMessage({ type: "DRIFTGUARD_GET_SNAPSHOT" });
  if (!snapshot?.ok) {
    showNotice(snapshot?.error || "Unable to load DriftGuard.");
    return;
  }
  render(snapshot);
}

function render(data) {
  const session = data.activeSession;
  const hasActive = Boolean(session && session.status !== "ended");

  elements.statusDot.classList.toggle("active", hasActive && session.status === "active");
  elements.statusLabel.textContent = hasActive ? (session.status === "paused" ? "Paused" : "Live") : "Idle";
  elements.currentDomainPreview.textContent = data.currentDomain || "-";
  elements.emptyState.classList.toggle("hidden", hasActive);
  elements.activeState.classList.toggle("hidden", !hasActive);

  applyTrustDefault(data);
  elements.sensitivitySelect.value = data.settings.sensitivity || "balanced";
  elements.trackTitlesCheckbox.checked = Boolean(data.settings.trackTabTitles);
  elements.excludedDomainsInput.value = (data.settings.excludedDomains || []).join(", ");

  if (hasActive) {
    elements.activeIntention.textContent = session.intention;
    elements.elapsedTime.textContent = formatDuration(Math.round((Date.now() - session.startedAt) / 1000));
    elements.currentDomain.textContent = data.currentObservation?.domain || data.currentDomain || "-";
    elements.promptCount.textContent = String(data.activeCounts.interventions);
    elements.savedCount.textContent = String(data.activeCounts.savedItems);
    elements.pauseButton.textContent = session.status === "paused" ? "Resume" : "Pause";
  }

  renderRecent(data.recentSessions || []);
}

const DRIFT_PRONE_CATEGORIES = ["ambiguous", "distracting"];
let trustTouchedByUser = false;

function applyTrustDefault(data) {
  if (trustTouchedByUser) return;

  const driftProne = DRIFT_PRONE_CATEGORIES.includes(data.currentDomainCategory);
  elements.allowCurrentDomain.checked = !driftProne;

  const hint = elements.allowCurrentDomain.parentElement?.querySelector("small");
  if (!hint) return;

  hint.textContent = driftProne
    ? `${data.currentDomain || "This site"} is a common drift source. Tick only if it is the work.`
    : "Allow the current domain for this session.";
}

async function startSession() {
  const intention = elements.intentionInput.value.trim();
  const allowedDomains = parseDomains(elements.allowedDomainsInput.value);

  if (elements.allowCurrentDomain.checked && snapshot?.currentDomain) {
    allowedDomains.push(snapshot.currentDomain);
  }

  const result = await sendMessage({
    type: "DRIFTGUARD_START_SESSION",
    payload: {
      intention,
      durationMinutes: Number(elements.durationSelect.value),
      sensitivity: elements.sensitivitySelect.value,
      allowedDomains
    }
  });

  if (!result.ok) {
    showNotice(result.error);
    return;
  }

  elements.intentionInput.value = "";
  elements.allowedDomainsInput.value = "";
  showNotice("Session started.");
  await refresh();
}

async function endSession() {
  const result = await sendMessage({ type: "DRIFTGUARD_END_SESSION" });
  if (!result.ok) {
    showNotice(result.error);
    return;
  }

  showNotice("Session ended.");
  await refresh();
  openRecap(result.sessionId);
}

async function togglePause() {
  const paused = snapshot?.activeSession?.status !== "paused";
  const result = await sendMessage({
    type: paused ? "DRIFTGUARD_PAUSE_SESSION" : "DRIFTGUARD_RESUME_SESSION"
  });

  if (!result.ok) {
    showNotice(result.error);
    return;
  }

  showNotice(paused ? "Session paused." : "Session resumed.");
  await refresh();
}

async function saveCurrent() {
  const result = await sendMessage({ type: "DRIFTGUARD_SAVE_CURRENT" });
  showNotice(result.ok ? "Saved for later." : result.error);
  await refresh();
}

function openActiveRecap() {
  const sessionId = snapshot?.activeSession?.id;
  if (!sessionId) return;
  openRecap(sessionId);
}

function openRecap(sessionId) {
  const url = chrome.runtime.getURL(`src/recap.html?sessionId=${encodeURIComponent(sessionId)}`);
  chrome.tabs.create({ url });
}

async function saveSettings() {
  const result = await sendMessage({
    type: "DRIFTGUARD_UPDATE_SETTINGS",
    payload: {
      trackTabTitles: elements.trackTitlesCheckbox.checked,
      excludedDomains: parseDomains(elements.excludedDomainsInput.value),
      sensitivity: elements.sensitivitySelect.value
    }
  });

  showNotice(result.ok ? "Settings saved." : result.error);
  await refresh();
}

async function clearAllData() {
  const confirmed = confirm("Delete all DriftGuard sessions, prompts, saved links, and settings from this browser?");
  if (!confirmed) return;

  const result = await sendMessage({ type: "DRIFTGUARD_CLEAR_DATA" });
  showNotice(result.ok ? "Local data deleted." : result.error);
  await refresh();
}

function toggleSettings() {
  const hidden = elements.settingsBody.classList.toggle("hidden");
  elements.settingsToggle.setAttribute("aria-expanded", String(!hidden));
  const indicator = elements.settingsToggle.querySelector("b");
  if (indicator) indicator.textContent = hidden ? "+" : "-";
}

function renderRecent(sessions) {
  const endedSessions = sessions.filter((session) => session.status === "ended");
  elements.recentSection.classList.toggle("hidden", endedSessions.length === 0);
  elements.recentSessions.innerHTML = "";

  for (const session of endedSessions.slice(0, 4)) {
    const button = document.createElement("button");
    button.className = "recent-item";
    button.type = "button";
    button.innerHTML = `
      <span>${escapeHtml(session.intention)}</span>
      <small>${formatDate(session.startedAt)} - ${formatDuration(Math.round(((session.endedAt || Date.now()) - session.startedAt) / 1000))}</small>
    `;
    button.addEventListener("click", () => openRecap(session.id));
    elements.recentSessions.appendChild(button);
  }
}

function parseDomains(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function showNotice(message) {
  elements.notice.textContent = message || "";
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0m";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 1) return `${remaining}s`;
  if (minutes < 60) return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
