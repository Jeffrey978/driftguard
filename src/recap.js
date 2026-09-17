const params = new URLSearchParams(window.location.search);
const sessionId = params.get("sessionId");

const elements = {
  sessionTitle: document.querySelector("#sessionTitle"),
  sessionMeta: document.querySelector("#sessionMeta"),
  errorState: document.querySelector("#errorState"),
  recapContent: document.querySelector("#recapContent"),
  totalTime: document.querySelector("#totalTime"),
  trackedTime: document.querySelector("#trackedTime"),
  driftTime: document.querySelector("#driftTime"),
  interventionCount: document.querySelector("#interventionCount"),
  domainList: document.querySelector("#domainList"),
  responseList: document.querySelector("#responseList"),
  savedList: document.querySelector("#savedList"),
  interventionList: document.querySelector("#interventionList"),
  exportButton: document.querySelector("#exportButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  caughtHeadline: document.querySelector("#caughtHeadline")
};

let recap = null;

document.addEventListener("DOMContentLoaded", loadRecap);
elements.exportButton.addEventListener("click", exportJson);
elements.exportCsvButton.addEventListener("click", exportCsv);

async function loadRecap() {
  if (!sessionId) {
    showError("No session id was provided.");
    return;
  }

  recap = await sendMessage({
    type: "DRIFTGUARD_GET_RECAP",
    payload: { sessionId }
  });

  if (!recap?.ok) {
    showError(recap?.error || "Unable to load recap.");
    return;
  }

  renderRecap(recap);
}

function renderRecap(data) {
  const { session, stats, savedItems, interventions } = data;
  elements.errorState.classList.add("hidden");
  elements.recapContent.classList.remove("hidden");

  elements.sessionTitle.textContent = session.intention;
  elements.sessionMeta.textContent = `${formatDate(session.startedAt)} - ${session.intentionType} session`;
  elements.totalTime.textContent = formatDuration(stats.sessionSeconds);
  elements.trackedTime.textContent = formatDuration(stats.trackedSeconds);
  elements.driftTime.textContent = formatDuration(stats.driftSeconds);
  elements.interventionCount.textContent = String(stats.interventionCount);
  renderCaughtHeadline(stats);

  renderDomains(stats.topDomains, stats.trackedSeconds);
  renderResponses(stats.responseCounts);
  renderSavedItems(savedItems);
  renderInterventions(interventions);
}

function renderDomains(domains, totalSeconds) {
  elements.domainList.innerHTML = "";

  if (!domains.length) {
    elements.domainList.innerHTML = `<p class="empty">No tracked domains yet.</p>`;
    return;
  }

  for (const item of domains) {
    const percentage = totalSeconds ? Math.max(4, Math.round((item.seconds / totalSeconds) * 100)) : 0;
    const row = document.createElement("div");
    row.className = "domain-row";
    row.innerHTML = `
      <div class="domain-top">
        <span>${escapeHtml(item.domain)}</span>
        <span>${formatDuration(item.seconds)}</span>
      </div>
      <div class="bar" aria-hidden="true"><span style="width: ${percentage}%"></span></div>
      <span class="tag">${escapeHtml(item.category)}</span>
    `;
    elements.domainList.appendChild(row);
  }
}

function renderResponses(counts) {
  elements.responseList.innerHTML = "";
  const entries = Object.entries(counts || {});

  if (!entries.length) {
    elements.responseList.innerHTML = `<p class="empty">No prompt responses in this session.</p>`;
    return;
  }

  for (const [response, count] of entries) {
    const row = document.createElement("div");
    row.className = "response-item";
    row.innerHTML = `
      <strong>${formatResponse(response)}</strong>
      <span class="muted">${count} time${count === 1 ? "" : "s"}</span>
    `;
    elements.responseList.appendChild(row);
  }
}

function renderSavedItems(items) {
  elements.savedList.innerHTML = "";

  if (!items.length) {
    elements.savedList.innerHTML = `<p class="empty">No saved links from this session.</p>`;
    return;
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "saved-item";
    row.innerHTML = `
      <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.domain)}</a>
      <span class="muted">${escapeHtml(item.domain)} - ${formatDate(item.timestamp)}</span>
    `;
    elements.savedList.appendChild(row);
  }
}

function renderInterventions(items) {
  elements.interventionList.innerHTML = "";

  if (!items.length) {
    elements.interventionList.innerHTML = `<p class="empty">No drift prompts fired.</p>`;
    return;
  }

  for (const item of [...items].reverse()) {
    const row = document.createElement("div");
    row.className = "intervention-item";
    const responseLabel = item.isReminder && item.response === "shown" ? "Reminder shown" : formatResponse(item.response);
    row.innerHTML = `
      <strong>${escapeHtml(item.domain)}</strong>
      <span class="muted">${responseLabel} - ${formatDate(item.timestamp)}</span>
      ${item.reasons?.length ? `<span class="muted">${escapeHtml(item.reasons.slice(0, 2).join(" - "))}</span>` : ""}
    `;
    elements.interventionList.appendChild(row);
  }
}

function renderCaughtHeadline(stats) {
  const caught = stats.caughtCount || 0;
  const recovered = stats.recoveredCount || 0;

  if (!caught) {
    elements.caughtHeadline.textContent = "No drift caught this session. Clean run.";
    return;
  }

  const caughtLabel = `DriftGuard caught you ${caught} time${caught === 1 ? "" : "s"}`;
  elements.caughtHeadline.textContent = recovered
    ? `${caughtLabel} - you got back on track ${recovered} time${recovered === 1 ? "" : "s"}.`
    : `${caughtLabel}.`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  if (!recap?.ok) return;

  const rows = [["type", "timestamp", "domain", "title", "duration_seconds", "category", "response", "url"]];

  for (const event of recap.events || []) {
    rows.push([
      "visit",
      new Date(event.timestamp).toISOString(),
      event.domain,
      event.title,
      event.durationSeconds,
      event.category,
      "",
      ""
    ]);
  }

  for (const item of recap.interventions || []) {
    rows.push([
      "intervention",
      new Date(item.timestamp).toISOString(),
      item.domain,
      item.title,
      "",
      "",
      item.response,
      ""
    ]);
  }

  for (const item of recap.savedItems || []) {
    rows.push([
      "saved",
      new Date(item.timestamp).toISOString(),
      item.domain,
      item.title,
      "",
      "",
      "",
      item.url
    ]);
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), `driftguard-session-${sessionId}.csv`);
}

function exportJson() {
  if (!recap?.ok) return;

  const blob = new Blob([JSON.stringify(recap, null, 2)], { type: "application/json" });
  downloadBlob(blob, `driftguard-session-${sessionId}.json`);
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

function showError(message) {
  elements.errorState.textContent = message;
  elements.errorState.classList.remove("hidden");
  elements.recapContent.classList.add("hidden");
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

function formatResponse(response) {
  const labels = {
    shown: "Prompt shown",
    reminder_shown: "Reminder shown",
    still_relevant: "Still relevant",
    save_later: "Saved for later",
    break_5: "Break 5m",
    break_10: "Break 10m",
    refocus: "Refocused",
    dismiss: "Dismissed"
  };

  return labels[response] || response;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
